package expo.modules.streamdownloader

import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder

/**
 * Aktif indirme varken çalışan foreground service (`dataSync` tipi).
 * Başlatma/durdurmayı [StreamDownloaderModule] motorun aktif durumu değişince
 * yönetir; servis yalnızca bildirimi görünür kılar.
 */
class DownloadService : Service() {

  companion object {
    const val EXTRA_ID = "downloadId"
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    /*
     * ⚠️ HEMEN startForeground (Android 12+): startForegroundService() çağrısından
     * sonra 5 sn içinde startForeground() ZORUNLU. Dev modunda ana thread
     * (Metro/JS yüklemesi) yoğunken bu süre aşılırsa uygulama
     * "ForegroundServiceDidNotStartInTimeException" ile ÇÖKER. Bu yüzden
     * servis, gerçek içerik hazırlanmadan boş bir bildirimle hemen ön plana
     * çıkar, sonra içerik güncellenir (ikinci startForeground çağrısı).
     */
    try {
      val bos = Notifier(this).progressNotification(emptyList())
      if (Build.VERSION.SDK_INT >= 29) {
        startForeground(Notifier.NOTIF_ACTIVE, bos, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
      } else {
        startForeground(Notifier.NOTIF_ACTIVE, bos)
      }
    } catch (t: Throwable) {
      android.util.Log.w("SPD", "startForeground(erken) hatası: ${t.message}")
    }

    // Bildirim aksiyonları: Duraklat/Devam (TOGGLE) ve İptal.
    val aksiyon = intent?.action
    val hedefId = intent?.getStringExtra(EXTRA_ID)
    if (aksiyon != null && hedefId != null) {
      val engine = StreamDownloaderModule.engine
      if (engine != null) {
        when (aksiyon) {
          Notifier.ACTION_TOGGLE -> {
            val item = engine.snapshot().firstOrNull { it.id == hedefId }
            if (item?.status == DownloadStatus.PAUSED) engine.resume(hedefId) else engine.pause(hedefId)
          }
          Notifier.ACTION_CANCEL -> engine.cancel(hedefId)
        }
      }
      if (engine?.snapshot()?.none { it.status == DownloadStatus.DOWNLOADING || it.status == DownloadStatus.MERGING || it.status == DownloadStatus.PUBLISHING } == true) {
        stopSelf()
      }
      return START_NOT_STICKY
    }

    // Savunma: bildirim kurulumundaki herhangi bir hata süreci öldürmemeli
    // (Task 16: Formatter çökmesiyle service start uygulamayı deviriyordu).
    try {
      val engine = StreamDownloaderModule.engine
      val notif = if (engine == null) {
        stopSelf()
        return START_NOT_STICKY
      } else {
        Notifier(this).progressNotification(engine.snapshot())
      }
      // Android 14+ zorunlu: bildirim hemen verilir.
      if (Build.VERSION.SDK_INT >= 29) {
        startForeground(Notifier.NOTIF_ACTIVE, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
      } else {
        startForeground(Notifier.NOTIF_ACTIVE, notif)
      }
    } catch (t: Throwable) {
      android.util.Log.w("SPD", "DownloadService bildirimi kurulamadı: ${t.message}")
      stopSelf()
      return START_NOT_STICKY
    }
    // Motor boşalınca modül stopService çağırır.
    return START_STICKY
  }

  /** Android 15: `dataSync` 6 saat sınırı — indirmeler duraklatılır. */
  override fun onTimeout(startId: Int, fgsType: Int) {
    StreamDownloaderModule.engine?.onTimeout()
    stopSelf()
  }

  /** Kullanıcı uygulamayı son görevlerden kaldırdı: indirmeler DURUR
   *  (pause kalıcı; indirilenler ekranından "Devam" ile sürdürülür).
   *  Süreç ölümünde (force-stop / bellek baskısı) bu çağrı GELMEZ — o yolda
   *  StateStore recover + resumeQueued otomatik devamı korur. */
  override fun onTaskRemoved(rootIntent: Intent?) {
    val engine = StreamDownloaderModule.engine
    try {
      engine?.pauseAll()
    } catch (t: Throwable) {
      android.util.Log.w("SPD", "onTaskRemoved duraklatma: ${t.message}")
    }
    stopForeground(STOP_FOREGROUND_REMOVE)
    stopSelf()
    // pauseAll→notifyProgress özeti (id=1) yeniden post etmiş olabilir; FGS
    // bağısı koptuğundan düz bildirim olarak KALIYORDU — hepsini kaldır.
    if (engine != null) {
      runCatching { Notifier(this).cancelProgressAll(engine.snapshot()) }
    }
    super.onTaskRemoved(rootIntent)
  }
}
