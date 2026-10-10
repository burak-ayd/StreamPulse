package expo.modules.apkupdate

import android.app.DownloadManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.core.content.FileProvider
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

/**
 * StreamPulse APK güncelleme modülü.
 *
 * SORUMLULUK: APK'yı indirmek, ilerlemeyi bildirmek ve sistem yükleyicisini
 * açmak. GitHub'a sorgulama, sürüm karşılaştırması ve kullanıcı onayı
 * JS tarafındadır (`src/ApkUpdateManager.ts`) — burada bilinçli olarak yok.
 *
 * NEDEN DownloadManager (kendi HttpURLConnection'ımız yerine):
 *  - Arka planda çalışır; uygulama arka plana alınsa bile indirme sürer.
 *  - Sistem bildirimi üretir; kullanıcı "indirme nerede?" diye sormaz.
 *  - Kesintide kaldığı yerden devam eder (HTTP range).
 *  - `VISIBILITY_HIDDEN` Android 10+ için ek izin isterdi; bu yüzden
 *    `VISIBILITY_VISIBLE_NOTIFY_COMPLETED` kullanıyoruz (izin gerektirmez).
 *
 * DOSYA BULMA tuzağı: Android 10+'da indirilen APK için
 * `COLUMN_LOCAL_URI` çoğu zaman `content://downloads/...` döner ve
 * `file://` DEĞİL. Böyle bir URI'yi `File(...)` ile açmak çalışmaz;
 * bu yüzden içeriği app'in kendi cache'ine kopyalayıp FileProvider ile
 * paylaşıyoruz (`file_paths.xml` içinde `cache-path` tanımlıdır).
 */
public class ApkUpdateModule : Module() {

  private var downloadReceiver: BroadcastReceiver? = null
  private var activeDownloadId: Long = -1L
  private val handler = Handler(Looper.getMainLooper())
  private var pollRunnable: Runnable? = null
  private var lastEmittedProgress: Int = -1
  /**
   * Zaten işlenen indirme kimliği.
   *
   * Bitişi hem BroadcastReceiver hem polling bildirebilir; ikisi de
   * "başarılı" derse aynı dosya için İKİ kez sistem yükleyicisi açılır
   * (kullanıcı iki ayrı "Yükle" penceresiyle karşılaşır).
   */
  private var handledDownloadId: Long = -1L

  // ────────────────────────────── definition ──────────────────────────────

  override fun definition() = ModuleDefinition {
    Name("StreamPulseApkUpdate")

    Events(EVENT_PROGRESS, EVENT_DOWNLOAD_COMPLETE, EVENT_INSTALL_RESULT)

    /**
     * Kurulu sürüm bilgisi.
     * Sürüm karşılaştırmasının referansı budur; JS tarafı
     * `expo-constants` değerini değil BUNU kullanır (build.gradle'deki
     * versionName ile birebir aynı kaynaktan gelir).
     */
    AsyncFunction("getCurrentVersion") { promise: Promise ->
      try {
        val context = appContext.reactContext
          ?: throw IllegalStateException("React context null")
        val info = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
          context.packageManager.getPackageInfo(
            context.packageName,
            PackageManager.PackageInfoFlags.of(0L)
          )
        } else {
          @Suppress("DEPRECATION")
          context.packageManager.getPackageInfo(context.packageName, 0)
        }
        val versionCode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
          info.longVersionCode.toInt()
        } else {
          @Suppress("DEPRECATION")
          info.versionCode
        }
        promise.resolve(
          mapOf(
            "versionName" to (info.versionName ?: "0.0.0"),
            "versionCode" to versionCode
          )
        )
      } catch (e: Exception) {
        promise.reject("ERR_VERSION", e.message, e)
      }
    }

    /**
     * "Bilinmeyen kaynaklardan yükleme" izni var mı? (Android 8.0+)
     * Android 8'in altında her APK yükleyebilir → her zaman true.
     */
    AsyncFunction("checkInstallPermission") { promise: Promise ->
      try {
        val context = appContext.reactContext
          ?: throw IllegalStateException("React context null")
        promise.resolve(
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.packageManager.canRequestPackageInstalls()
          } else {
            true
          }
        )
      } catch (e: Exception) {
        promise.reject("ERR_PERMISSION", e.message, e)
      }
    }

    /** Kullanıcıyı ilgili ayar ekranına gönderir; sonucu JS dinler. */
    Function("requestInstallPermission") {
      val activity = appContext.currentActivity
      val context = appContext.reactContext
      if (activity != null && context != null &&
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
      ) {
        val intent = Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES).apply {
          data = Uri.parse("package:${context.packageName}")
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        activity.startActivity(intent)
      }
    }

    /**
     * APK'yı indirir ve indirme bitince sistem yükleyicisini başlatır.
     *
     * @param downloadUrl GitHub release asset URL'si
     * @param fileName    Downloads klasörüne yazılacak dosya adı
     */
    AsyncFunction("downloadAndInstall") { downloadUrl: String, fileName: String, promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.reject("ERR_NO_CONTEXT", "React context null", null)
        return@AsyncFunction
      }
      if (downloadUrl.isBlank()) {
        promise.reject("ERR_URL", "downloadUrl boş", null)
        return@AsyncFunction
      }

      try {
        stopTracking()

        val safeName = fileName.ifBlank { DEFAULT_APK_NAME }
        deleteStaleArtifacts(safeName)

        val request = DownloadManager.Request(Uri.parse(downloadUrl)).apply {
          setTitle(appLabel())
          setDescription("Yeni sürüm indiriliyor")
          // Gizli bildirim Android 10+ için ek izin isterdi; normal bildirim
          // kullanıcıya da daha şeffaf.
          setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
          setAllowedNetworkTypes(
            DownloadManager.Request.NETWORK_WIFI or DownloadManager.Request.NETWORK_MOBILE
          )
          setAllowedOverMetered(true)
          setAllowedOverRoaming(true)
          setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, safeName)
        }

        val dm = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
        activeDownloadId = dm.enqueue(request)
        handledDownloadId = -1L
        lastEmittedProgress = -1

        registerDownloadReceiver(dm)
        startPolling(dm)

        promise.resolve(activeDownloadId)
      } catch (e: Exception) {
        stopTracking()
        promise.reject("ERR_DOWNLOAD", e.message, e)
      }
    }

    /** Kullanıcı indirmeyi iptal ederse çağrılır. */
    AsyncFunction("cancelDownload") { promise: Promise ->
      try {
        val id = activeDownloadId
        stopTracking()
        if (id != -1L) {
          val context = appContext.reactContext
          val dm = context?.getSystemService(Context.DOWNLOAD_SERVICE) as? DownloadManager
          dm?.remove(id)
        }
        promise.resolve(true)
      } catch (e: Exception) {
        promise.reject("ERR_CANCEL", e.message, e)
      }
    }

    OnDestroy { stopTracking() }
  }

  // ────────────────────────────── yardımcılar ──────────────────────────────

  /**
   * İndirme bildiriminde görünecek uygulama adı.
   *
   * `appContext.config` SDK 57'de KALDIRILDI (build hatası veriyordu);
   * tek güvenilir kaynak PackageManager'ın kendi etiketidir. Kısayol
   * çalışmasa bile isim kritik değil — bildirimde "Uygulama" görünür.
   */
  private fun appLabel(): String {
    val context = appContext.reactContext ?: return "Uygulama"
    return try {
      val pm = context.packageManager
      pm.getApplicationLabel(pm.getApplicationInfo(context.packageName, 0)).toString()
    } catch (_: Exception) {
      "Uygulama"
    }
  }

  private fun emit(name: String, payload: Map<String, Any>) {
    try {
      this@ApkUpdateModule.sendEvent(name, payload)
    } catch (e: Exception) {
      Log.e(TAG, "Event gönderilemedi ($name): ${e.message}")
    }
  }

  private fun registerDownloadReceiver(dm: DownloadManager) {
    val context = appContext.reactContext ?: return
    cleanupReceiver()
    val id = activeDownloadId

    val receiver = object : BroadcastReceiver() {
      override fun onReceive(ctx: Context?, intent: Intent?) {
        val received = intent?.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L) ?: -1L
        if (received != id) return
        // Polling de aynı işi yapıyor; çift işlemeyi önle.
        cancelPolling()
        handleFinishedDownload(dm, id)
      }
    }

    downloadReceiver = receiver
    val filter = IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE)
    try {
      // RECEIVER_NOT_EXPORTED bayrağı API 33 (TIRAMISU) ile geldi.
      // Bu proje compileSdk 36'ya kadar çıkmıyor olabilir; sabit
      // TIRAPSIDE_DOWN_CAKE (API 36) yazmak build'i kırıyordu, oysa
      // doğru eşik zaten 33.
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        context.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
      } else {
        context.registerReceiver(receiver, filter)
      }
    } catch (e: Exception) {
      Log.e(TAG, "BroadcastReceiver kaydedilemedi: ${e.message}")
    }
  }

  /**
   * İndirmeyi izler. Broadcast tek başına yetmez: bazı cihazlarda
   * ACTION_DOWNLOAD_COMPLETE yayılmadan da dosya hazır olabiliyor, ya da
   * tam tersi geç geliyor. Polling ikisini de kapatıyor.
   */
  private fun startPolling(dm: DownloadManager) {
    val runnable = object : Runnable {
      var attempt = 0
      override fun run() {
        if (attempt++ > MAX_POLL_ATTEMPTS) {
          emit(EVENT_DOWNLOAD_COMPLETE, mapOf("status" to STATUS_ERROR, "message" to "Zaman aşımı"))
          stopTracking()
          return
        }
        val status = query(dm) ?: return@run
        when (status.status) {
          DownloadManager.STATUS_SUCCESSFUL -> {
            cancelPolling()
            handleFinishedDownload(dm, status.id)
          }
          DownloadManager.STATUS_FAILED -> {
            cancelPolling()
            emit(
              EVENT_DOWNLOAD_COMPLETE,
              mapOf(
                "status" to STATUS_ERROR,
                "message" to "İndirme başarısız (kod: ${status.reason})"
              )
            )
          }
          else -> {
            if (status.total > 0L) {
              val progress = ((status.downloaded.toDouble() / status.total.toDouble()) * 100)
                .toInt().coerceIn(0, 100)
              // Her 500 ms'de event üretmek JS tarafını boğar; yalnızca
              // yüzde gerçekten değiştiğinde yayınla.
              if (progress != lastEmittedProgress) {
                lastEmittedProgress = progress
                emit(
                  EVENT_PROGRESS,
                  mapOf(
                    "progress" to progress,
                    "bytesDownloaded" to status.downloaded,
                    "bytesTotal" to status.total
                  )
                )
              }
            }
            handler.postDelayed(this, POLL_INTERVAL_MS)
          }
        }
      }
    }
    pollRunnable = runnable
    handler.postDelayed(runnable, POLL_INTERVAL_MS)
  }

  private class Snapshot(
    val id: Long,
    val status: Int,
    val reason: Int,
    val localUri: String?,
    val downloaded: Long,
    val total: Long
  )

  private fun query(dm: DownloadManager): Snapshot? {
    if (activeDownloadId == -1L) return null
    return try {
      dm.query(DownloadManager.Query().setFilterById(activeDownloadId))?.use { cursor ->
        if (!cursor.moveToFirst()) return null
        Snapshot(
          id = activeDownloadId,
          status = cursor.getIntOr(DownloadManager.COLUMN_STATUS, 0),
          reason = cursor.getIntOr(DownloadManager.COLUMN_REASON, 0),
          localUri = cursor.getStringOr(DownloadManager.COLUMN_LOCAL_URI),
          downloaded = cursor.getLongOr(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR, 0L),
          total = cursor.getLongOr(DownloadManager.COLUMN_TOTAL_SIZE_BYTES, 0L)
        )
      }
    } catch (e: Exception) {
      Log.e(TAG, "Sorgu hatası: ${e.message}")
      null
    }
  }

  private fun android.database.Cursor.getIntOr(column: String, fallback: Int): Int {
    val idx = getColumnIndex(column)
    return if (idx == -1) fallback else getInt(idx)
  }

  private fun android.database.Cursor.getLongOr(column: String, fallback: Long): Long {
    val idx = getColumnIndex(column)
    return if (idx == -1) fallback else getLong(idx)
  }

  private fun android.database.Cursor.getStringOr(column: String): String? {
    val idx = getColumnIndex(column)
    return if (idx == -1) null else getString(idx)
  }

  private fun handleFinishedDownload(dm: DownloadManager, downloadId: Long) {
    // Bitişi iki kanal (broadcast + polling) bildirebilir; yalnızca
    // ilkini işle.
    if (handledDownloadId == downloadId) return
    handledDownloadId = downloadId

    val snapshot = try {
      dm.query(DownloadManager.Query().setFilterById(downloadId))?.use { cursor ->
        if (!cursor.moveToFirst()) null else Snapshot(
          id = downloadId,
          status = cursor.getIntOr(DownloadManager.COLUMN_STATUS, 0),
          reason = cursor.getIntOr(DownloadManager.COLUMN_REASON, 0),
          localUri = cursor.getStringOr(DownloadManager.COLUMN_LOCAL_URI),
          downloaded = cursor.getLongOr(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR, 0L),
          total = cursor.getLongOr(DownloadManager.COLUMN_TOTAL_SIZE_BYTES, 0L)
        )
      }
    } catch (e: Exception) {
      Log.e(TAG, "Bitiş durumu okunamadı: ${e.message}")
      null
    }

    val status = snapshot?.status ?: DownloadManager.STATUS_FAILED
    if (status != DownloadManager.STATUS_SUCCESSFUL) {
      emit(
        EVENT_DOWNLOAD_COMPLETE,
        mapOf("status" to STATUS_ERROR, "message" to "İndirme tamamlanamadı (kod: $status)")
      )
      stopTracking()
      return
    }

    val apk = materializeApk(snapshot?.localUri)
    if (apk == null || !apk.exists() || apk.length() == 0L) {
      emit(
        EVENT_DOWNLOAD_COMPLETE,
        mapOf("status" to STATUS_ERROR, "message" to "APK dosyası okunamadı")
      )
      stopTracking()
      return
    }

    emit(
      EVENT_PROGRESS,
      mapOf("progress" to 100, "bytesDownloaded" to apk.length(), "bytesTotal" to apk.length())
    )
    emit(
      EVENT_DOWNLOAD_COMPLETE,
      mapOf("status" to STATUS_SUCCESS, "path" to apk.absolutePath)
    )

    handler.postDelayed({ installApk(apk) }, 400)
  }

  /**
   * İndirilen APK'yı FileProvider'ın paylaşabileceği gerçek bir dosyaya
   * çözer. `content://` ise cache'e kopyalar (File ile açılamaz).
   */
  private fun materializeApk(localUri: String?): File? {
    val context = appContext.reactContext ?: return null
    return try {
      when {
        localUri == null -> findInDownloads()
        localUri.startsWith("content://") -> copyToCache(Uri.parse(localUri)) ?: findInDownloads()
        localUri.startsWith("file://") -> {
          val file = File(Uri.parse(localUri).path ?: "")
          if (file.exists() && file.length() > 0L) file else findInDownloads()
        }
        else -> findInDownloads()
      }
    } catch (e: Exception) {
      Log.e(TAG, "APK çözümlenemedi: ${e.message}", e)
      findInDownloads()
    }
  }

  private fun copyToCache(uri: Uri): File? {
    val context = appContext.reactContext ?: return null
    return try {
      val target = File(context.cacheDir, CACHE_APK_NAME)
      val input = context.contentResolver.openInputStream(uri) ?: return null
      input.use { source ->
        target.outputStream().use { sink -> source.copyTo(sink) }
      }
      if (target.exists() && target.length() > 0L) target else null
    } catch (e: Exception) {
      Log.e(TAG, "Cache kopyası başarısız: ${e.message}", e)
      null
    }
  }

  private fun findInDownloads(): File? {
    return try {
      val dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
      val file = File(dir, DEFAULT_APK_NAME)
      if (file.exists() && file.length() > 0L) file else null
    } catch (e: Exception) {
      null
    }
  }

  private fun installApk(apk: File) {
    val context = appContext.reactContext
    if (context == null) {
      emit(EVENT_INSTALL_RESULT, mapOf("status" to STATUS_ERROR, "message" to "React context null"))
      return
    }
    if (!apk.exists()) {
      emit(
        EVENT_INSTALL_RESULT,
        mapOf("status" to STATUS_ERROR, "message" to "APK dosyası bulunamadı")
      )
      return
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
      !context.packageManager.canRequestPackageInstalls()
    ) {
      emit(
        EVENT_INSTALL_RESULT,
        mapOf("status" to STATUS_PERMISSION_REQUIRED, "message" to "Yükleme izni gerekli")
      )
      return
    }

    try {
      val uri = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
        FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", apk)
      } else {
        Uri.fromFile(apk)
      }

      val intent = Intent(Intent.ACTION_VIEW).apply {
        setDataAndType(uri, "application/vnd.android.package-archive")
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }

      if (intent.resolveActivity(context.packageManager) == null) {
        emit(
          EVENT_INSTALL_RESULT,
          mapOf("status" to STATUS_ERROR, "message" to "APK yükleyici bulunamadı")
        )
        return
      }

      context.startActivity(intent)
      stopTracking()
      emit(EVENT_INSTALL_RESULT, mapOf("status" to STATUS_INSTALL_STARTED))
    } catch (e: Exception) {
      Log.e(TAG, "Yükleme başlatılamadı: ${e.message}", e)
      emit(
        EVENT_INSTALL_RESULT,
        mapOf("status" to STATUS_ERROR, "message" to (e.message ?: "Bilinmeyen hata"))
      )
    }
  }

  private fun deleteStaleArtifacts(fileName: String) {
    try {
      val downloads = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
      val stale = File(downloads, fileName)
      if (stale.exists()) stale.delete()
      // Önceki sürümden kalmış, adı değişmiş APK'ları da temizle.
      downloads.listFiles { _, name ->
        name.endsWith(APK_EXTENSION) && name.contains(APK_NAME_HINT, ignoreCase = true)
      }?.forEach { it.delete() }
      appContext.reactContext?.cacheDir?.let { cache ->
        File(cache, CACHE_APK_NAME).takeIf { it.exists() }?.delete()
      }
    } catch (e: Exception) {
      Log.w(TAG, "Eski APK temizlenemedi: ${e.message}")
    }
  }

  private fun cancelPolling() {
    pollRunnable?.let { handler.removeCallbacks(it) }
    pollRunnable = null
  }

  private fun cleanupReceiver() {
    val receiver = downloadReceiver ?: return
    try {
      appContext.reactContext?.unregisterReceiver(receiver)
    } catch (_: Exception) {
      // Zaten kayıtsızsa sorun değil.
    }
    downloadReceiver = null
  }

  private fun stopTracking() {
    cancelPolling()
    cleanupReceiver()
    activeDownloadId = -1L
  }

  companion object {
    private const val TAG = "ApkUpdate"
    private const val POLL_INTERVAL_MS = 500L
    private const val MAX_POLL_ATTEMPTS = 240 // ~2 dakika
    private const val APK_EXTENSION = ".apk"
    private const val APK_NAME_HINT = "streampulse"
    private const val DEFAULT_APK_NAME = "StreamPulse-update.apk"
    private const val CACHE_APK_NAME = "StreamPulse-update-install.apk"

    private const val EVENT_PROGRESS = "onDownloadProgress"
    private const val EVENT_DOWNLOAD_COMPLETE = "onDownloadComplete"
    private const val EVENT_INSTALL_RESULT = "onInstallResult"

    private const val STATUS_SUCCESS = "success"
    private const val STATUS_ERROR = "error"
    private const val STATUS_INSTALL_STARTED = "install_started"
    private const val STATUS_PERMISSION_REQUIRED = "permission_required"
  }
}