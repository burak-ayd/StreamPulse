package expo.modules.streamdownloader

import android.content.Context
import android.content.Intent
import android.os.Build
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * JS köprüsü: `enqueue/pause/resume/cancel/remove/getState/isAvailable` +
 * `onStateChanged` olayı (~1 Hz, durum değişiminde hemen). Modül yoksa JS
 * tarafı `isAvailable=false` ile eski davranışa düşmez, "yeni sürüm gerekli"
 * gösterir.
 */
class StreamDownloaderModule : Module() {

  companion object {
    @Volatile var engine: DownloadEngine? = null
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
  }

  override fun definition() = ModuleDefinition {
    Name("StreamPulseStreamDownloader")

    // JS aboneliği: addListener çağrılabilmesi için event BURADA declare
    // edilmeli; aksi halde sendEvent "Unsupported event" ile process'i
    // öldürür (Task 16 cihaz doğrulamasında yakalandı).
    Events("onStateChanged")

    OnCreate {
      val appCtx = appContext.reactContext?.applicationContext ?: return@OnCreate
      Notifier.ensureChannels(appCtx)
      /*
       * TEK MOTOR KURALI (Tur 25): JS baglami yeniden yuklenince (OTA,
       * Fast Refresh) OnCreate TEKRAR calisir. Yeni motor yaratilirsa ESKI
       * motorun indirmeleri calismaya devam eder ve "Iptal" yeni motorun bos
       * jobs haritasina duser -> iptal calismaz, indirme surer, dosya
       * yazilamaz (klasor silinmis), bildirim kaybolur.
       * Bu yuzden motor BIR KEZ yaratilir ve yeniden kullanilir.
       */
      var e = engine
      if (e == null) {
        val store = StateStore(java.io.File(java.io.File(appCtx.filesDir, "stream-downloader"), "state.json"))
        e = DownloadEngine(
          root = java.io.File(appCtx.filesDir, "stream-downloader"),
          store = store,
          playlists = PlaylistFetcher(),
          fetcher = SegmentFetcher(),
          merger = Merger(),
          publisher = Publisher(appCtx),
          notifier = Notifier(appCtx),
          scope = scope,
        )
        e.restore(store.load())
        engine = e
        android.util.Log.e("SPD", "motor olusturuldu")
      } else {
        android.util.Log.e("SPD", "motor yeniden kullanildi (JS baglami yenilendi)")
      }
      // Savunma: expo event gonderimi her kosulda cokertmemeli.
      e.setListener { items ->
        try {
          sendEvent("onStateChanged", mapOf("items" to items.map { it.toWireMap() }))
        } catch (t: Throwable) {
          android.util.Log.w("SPD", "onStateChanged gonderilemedi: ${t.message}")
        }
      }
      e.setActiveChangeListener { active -> activeChanged(appCtx, active) }
      // Kapanmadan once indiriliyor olanlar kaldigi yerden devam eder.
      e.resumeQueued()
    }

    Function("isAvailable") { true }

    /** Es zamanli indirme limiti (ayar: maxConcurrentDownloads). */
    AsyncFunction("setMaxConcurrent") { n: Int, promise: Promise ->
      requireEngine().setMaxConcurrent(n)
      promise.resolve(null)
    }

    /** Indirilen dosyayi Download/StreamPulse'a tasir (disa aktar). */
    AsyncFunction("export") { id: String, promise: Promise ->
      promise.resolve(requireEngine().export(id))
    }

    AsyncFunction("enqueue") { spec: Map<String, Any?>, promise: Promise ->
      android.util.Log.e("SPD", "enqueue çağrıldı: $spec")
      val id = requireEngine().enqueue(spec.toEnqueueSpec())
      android.util.Log.e("SPD", "enqueue ok: $id")
      promise.resolve(id)
    }

    AsyncFunction("pause") { id: String, promise: Promise ->
      requireEngine().pause(id)
      promise.resolve(null)
    }

    AsyncFunction("resume") { id: String, promise: Promise ->
      requireEngine().resume(id)
      promise.resolve(null)
    }

    AsyncFunction("cancel") { id: String, promise: Promise ->
      requireEngine().cancel(id)
      promise.resolve(null)
    }

    AsyncFunction("remove") { id: String, promise: Promise ->
      requireEngine().remove(id)
      promise.resolve(null)
    }

    Function("getState") { requireEngine().snapshot().map { it.toWireMap() } }

    // ── İzinler ekranı (madde 3): pil optimizasyonu istisnası ──────────
    Function("isIgnoringBatteryOptimizations") {
      val ctx = appContext.reactContext ?: return@Function false
      val pm = ctx.getSystemService(Context.POWER_SERVICE) as? android.os.PowerManager
      val sonuc = pm?.isIgnoringBatteryOptimizations(ctx.packageName) ?: false
      android.util.Log.e("SPD", "isIgnoringBatteryOptimizations: $sonuc")
      sonuc
    }

    /**
     * İstem penceresi. Application context'ten başlatırsak Android 10+
     * BAL (arka plan başlatma) kısıtı pencereyi SESSİZCE engeller — bu
     * yüzden öncelikle mevcut Activity üzerinden başlatılır.
     */
    Function("requestIgnoreBatteryOptimizations") {
      val ctx = appContext.reactContext ?: return@Function false
      // appContext.currentActivity: öndeki Activity — BAL kısıtını aşar.
      val host = appContext.currentActivity ?: ctx
      val istem = Intent(
        android.provider.Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
        android.net.Uri.parse("package:${ctx.packageName}"),
      )
      try {
        host.startActivity(istem)
        android.util.Log.e("SPD", "pil istemi açıldı")
        true
      } catch (e: Exception) {
        android.util.Log.w("SPD", "pil istemi açılamadı, ayarlar listesi açılıyor: ${e.message}")
        try {
          host.startActivity(
            Intent(android.provider.Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS),
          )
        } catch (e2: Exception) {
          android.util.Log.w("SPD", "pil ayarları da açılamadı: ${e2.message}")
        }
        false
      }
    }
  }
  private fun requireEngine(): DownloadEngine = engine ?: error("engine hazır değil")

  private fun activeChanged(context: Context, active: Boolean) {
    if (active) {
      val intent = Intent(context, DownloadService::class.java)
      if (Build.VERSION.SDK_INT >= 26) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
    } else {
      context.stopService(Intent(context, DownloadService::class.java))
      // Savunma: bazı cihazlar (MIUI) stopService sonrası FGS bildirimini
      // geride bırakıyor — "StreamPulse indiriyor" sonsuza kadar kalıyordu.
      try {
        androidx.core.app.NotificationManagerCompat.from(context).cancel(Notifier.NOTIF_ACTIVE)
      } catch (_: Throwable) {
      }
    }
  }
}

/** JS spec sözlüğünü [EnqueueSpec]'e çevirir; alan adları DownloadItem ile aynı. */
private fun Map<String, Any?>.toEnqueueSpec(): EnqueueSpec {
  fun str(k: String): String? = (this[k] as? String)?.takeIf { it.isNotBlank() }
  fun int(k: String): Int? = (this[k] as? Number)?.toInt()
  fun long(k: String): Long? = (this[k] as? Number)?.toLong()
    fun bool(k: String): Boolean? = (this[k] as? Boolean)
  @Suppress("UNCHECKED_CAST")
  fun map(k: String): Map<String, String> = (this[k] as? Map<String, String>) ?: emptyMap()
  return EnqueueSpec(
    kind = str("kind") ?: "movie",
    title = str("title") ?: "",
    sourceUrl = str("sourceUrl") ?: "",
    seriesTitle = str("seriesTitle"),
    season = int("season"),
    episode = int("episode"),
    episodeTitle = str("episodeTitle"),
    headers = map("headers"),
    audioLanguage = str("audioLanguage"),
    variantId = str("variantId"),
    variantBandwidth = long("variantBandwidth"),
    variantResolution = str("variantResolution"),
    subtitleUrl = str("subtitleUrl"),
    posterUrl = str("posterUrl"),
    pluginName = str("pluginName"),
    contentId = str("contentId"),
    workers = int("workers"),
  )
}

/** JS'e giden temsil; durum adları DownloadStatus.wire ile aynı. */
private fun DownloadItem.toWireMap(): Map<String, Any?> = mapOf(
  "id" to id,
  "kind" to kind,
  "title" to title,
  "sourceUrl" to sourceUrl,
  "seriesTitle" to seriesTitle,
  "season" to season,
  "episode" to episode,
  "episodeTitle" to episodeTitle,
  "audioLanguage" to audioLanguage,
  "variantId" to variantId,
  "variantBandwidth" to variantBandwidth,
  "variantResolution" to variantResolution,
  "posterUrl" to posterUrl,
  "pluginName" to pluginName,
  "contentId" to contentId,
  "workers" to workers,
  "exported" to exported,
  "status" to status.wire,
  "progress" to progress,
  "downloadedBytes" to downloadedBytes,
  "totalBytes" to totalBytes,
  "speedBps" to speedBps,
  "error" to error,
  "errorCode" to errorCode,
  "outputUri" to outputUri,
  "outputPath" to outputPath,
  "subtitleUri" to subtitleUri,
  "createdAt" to createdAt,
  "completedAt" to completedAt,
)

