package expo.modules.streamdownloader

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat

/**
 * İki kanal: `downloads_active` (LOW, foreground ilerleme) ve
 * `downloads_result` (DEFAULT, tamamlandı/hata). Bildirim izni yoksa sessizce
 * atlanır — indirme yine çalışır.
 *
 * Bildirim biçimi CloudStream'e benzetildi: her indirme için ayrı bildirim
 * (içerik adı + çözünürlük, `%p (in/toplam)` + boyut + hız + kalan süre,
 * Duraklat/Devam + İptal aksiyonları) ve ayrı bir KUYRUK ÖZETİ bildirimi.
 */
class Notifier(private val context: Context) : Notifying {

  override fun notifyProgress(items: List<DownloadItem>) {
    val nm = NotificationManagerCompat.from(context)
    val aktif = items.filter { it.status == DownloadStatus.DOWNLOADING || it.status == DownloadStatus.MERGING || it.status == DownloadStatus.PUBLISHING }
    val duraklatilan = items.filter { it.status == DownloadStatus.PAUSED }
    aktif.forEach { item -> post(itemProgressId(item), perItemProgress(item)) }
    // Duraklatılan indirme bildirimde KALIR ("Devam Et" aksiyonuyla).
    duraklatilan.forEach { item -> post(itemProgressId(item), perItemProgress(item)) }
    items
      .filter {
        it.status != DownloadStatus.DOWNLOADING &&
          it.status != DownloadStatus.MERGING &&
		it.status != DownloadStatus.PUBLISHING &&
          it.status != DownloadStatus.PAUSED
      }
      .forEach { nm.cancel(itemProgressId(it)) }
    // Kuyruk özeti TEK bildirimde: servis ön plan bildirimi (id=1) üzerinden
    // güncellenir — ayrı id=2 bildirimi çift görünüm yaratıyordu.
    try {
      post(NOTIF_ACTIVE, progressNotification(items))
    } catch (t: Throwable) {
      // FGS bildirim güncellemesi bazı cihazlarda kısıtlanabilir; özet bozulursa
      // service zaten bir sonraki startForeground'da一年的 yazar.
      android.util.Log.w("SPD", "özet bildirim güncellenemedi: ${t.message}")
    }
    nm.cancel(QUEUE_NOTIF_ID)
  }

  private fun itemProgressId(item: DownloadItem): Int = ("progress_" + item.id).hashCode()

  private fun perItemProgress(item: DownloadItem): Notification {
    val ad = if (item.kind == "episode") {
      val sezonBolum = item.season?.let { s -> item.episode?.let { e -> "S$s:E$e" } } ?: ""
      "${item.seriesTitle ?: item.title} $sezonBolum ${item.episodeTitle ?: ""}".trim()
    } else {
      item.title
    }
    val cozunurluk = item.variantResolution?.let { " ($it)" } ?: ""
    val pct = (item.progress * 100).toInt().coerceIn(0, 100)
    val mbIn = item.downloadedBytes / (1024.0 * 1024.0)
    val speedMb = item.speedBps / (1024.0 * 1024.0)
    val kalanSec = if (item.speedBps > 0) {
      val kalanBayt: Double =
        if (item.totalBytes > 0) (item.totalBytes - item.downloadedBytes).toDouble()
        else item.downloadedBytes * (1.0 - item.progress) / item.progress.coerceAtLeast(0.001)
      (kalanBayt.coerceAtLeast(0.0) / item.speedBps).toLong()
    } else 0L
    val eta = when {
      item.status == DownloadStatus.PAUSED -> ""
      kalanSec <= 0L -> ""
      kalanSec < 90L -> " 1dk'dan az"
      else -> " ${kalanSec / 60L}dk ${kalanSec % 60L}sn"
    }
    // Bayt cinsinden gösterim yerine okunur birim (MB/GB) — ham bayt
    // ("149652888/874637989") kullanıcı için anlamsızdı.
    fun boyut(bayt: Long): String {
      val mb = bayt / (1024.0 * 1024.0)
      return if (mb >= 1024) String.format(java.util.Locale.US, "%.2f GB", mb / 1024)
      else String.format(java.util.Locale.US, "%.1f MB", mb)
    }
    val durum = if (item.status == DownloadStatus.PAUSED) "Duraklatıldı · " else ""
    // Birleştirmede hız/MB sayacı bayat kalır; yalnız ilerlemeyi göster.
    val text = if (item.status == DownloadStatus.MERGING) {
      "Birleştiriliyor: %$pct"
    } else if (item.status == DownloadStatus.PUBLISHING) {
      // Dosya MediaStore'a kopyalaniyor (buyuk dosyada dakikalar surer).
      "Yayınlanıyor..."
    } else {
      String.format(
        java.util.Locale.US,
        "%s%d%% (%s / %s) - %.1f MB (%.1f MB/s)%s",
        durum, pct, boyut(item.downloadedBytes), boyut(item.totalBytes), mbIn, speedMb, eta,
      )
    }

    val builder = NotificationCompat.Builder(context, CHANNEL_ACTIVE)
      .setSmallIcon(
        if (item.status == DownloadStatus.PAUSED) {
          android.R.drawable.ic_media_pause
        } else {
          android.R.drawable.stat_sys_download
        },
      )
      .setContentTitle(ad + cozunurluk)
      .setContentText(text)
      .setStyle(NotificationCompat.BigTextStyle().bigText(text))
      .setProgress(100, pct, item.status == DownloadStatus.MERGING)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setContentIntent(openAppIntent())

    // Birleştirmede duraklatma anlamsız; iptal her zaman var.
    if (item.status != DownloadStatus.MERGING && item.status != DownloadStatus.PUBLISHING) {
      builder.addAction(
        0,
        if (item.status == DownloadStatus.PAUSED) "Devam Et" else "Duraklat",
        actionIntent(ACTION_TOGGLE, item.id),
      )
    }
    builder.addAction(0, "İptal", actionIntent(ACTION_CANCEL, item.id))
    return builder.build()
  }

  private fun queueSummary(kuyruk: Int, aktif: Int, duraklatilan: Int): Notification {
    val satirlar = buildList {
      if (kuyruk > 0) add("$kuyruk indirilecek kuyruğa alındı")
      if (aktif > 0) add("$aktif aktif indirme")
      if (duraklatilan > 0) add("$duraklatilan duraklatıldı")
    }
    return NotificationCompat.Builder(context, CHANNEL_ACTIVE)
      .setSmallIcon(android.R.drawable.stat_sys_download)
      .setContentTitle(context.getString(R.string.app_download_title))
      .setContentText(satirlar.firstOrNull() ?: "")
      .setStyle(NotificationCompat.BigTextStyle().bigText(satirlar.joinToString("\n")))
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setContentIntent(openAppIntent())
      .build()
  }

  /** Uygulamayı öne getiren PendingIntent. */
  private fun openAppIntent(): PendingIntent? {
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return null
    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    return PendingIntent.getActivity(
      context, 0, launch,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  /** Duraklat/Devam ve İptal aksiyonları — DownloadService'e id ile intent. */
  private fun actionIntent(action: String, id: String): PendingIntent {
    val i = Intent(context, DownloadService::class.java)
      .setAction(action)
      .putExtra(DownloadService.EXTRA_ID, id)
    return PendingIntent.getService(
      context, (action + id).hashCode(), i,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  override fun notifyCompleted(item: DownloadItem) {
    NotificationManagerCompat.from(context).cancel(itemProgressId(item))
    post(item.idLeNotifId(), simple(result = true, title = context.getString(R.string.download_completed), text = item.title))
  }

  override fun notifyFailed(item: DownloadItem) {
    NotificationManagerCompat.from(context).cancel(itemProgressId(item))
    post(item.idLeNotifId(), simple(result = true, title = context.getString(R.string.download_failed), text = item.title))
  }

  /** Servisin `startForeground`'una giden özet: "N kuyrukta · M aktif · K duraklatıldı". */
  fun progressNotification(items: List<DownloadItem>): Notification {
    val aktif = items.count { it.status == DownloadStatus.DOWNLOADING || it.status == DownloadStatus.MERGING || it.status == DownloadStatus.PUBLISHING }
    val kuyruk = items.count { it.status == DownloadStatus.QUEUED }
    val duraklatilan = items.count { it.status == DownloadStatus.PAUSED }
    val satirlar = buildList {
      if (kuyruk > 0) add("$kuyruk indirilecek kuyruğa alındı")
      if (aktif > 0) add("$aktif aktif indirme")
      if (duraklatilan > 0) add("$duraklatilan duraklatıldı")
    }
    val metin = satirlar.joinToString("\n").ifEmpty { "hazır" }
    return NotificationCompat.Builder(context, CHANNEL_ACTIVE)
      .setSmallIcon(android.R.drawable.stat_sys_download)
      .setContentTitle(context.getString(R.string.app_download_title))
      .setContentText(satirlar.firstOrNull() ?: context.getString(R.string.app_download_title))
      .setStyle(NotificationCompat.BigTextStyle().bigText(metin))
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setContentIntent(openAppIntent())
      .build()
  }

  /**
   * Tek kalemin ilerleme bildirimini kaldırır.
   * ⚠️ Kalem `items` listesinden SİLİNDİĞİ için (iptal/silme) genel
   * `notifyProgress` o bildirimi temizleyemez — "ölü" bildirim kalıyordu.
   */
  override fun cancelProgress(item: DownloadItem) {
    NotificationManagerCompat.from(context).cancel(itemProgressId(item))
  }

  /** Tüm ilerleme + özet bildirimlerini kaldırır (onTaskRemoved sonrası). */
  fun cancelProgressAll(items: List<DownloadItem>) {
    val nm = NotificationManagerCompat.from(context)
    items.forEach { nm.cancel(itemProgressId(it)) }
    nm.cancel(NOTIF_ACTIVE)
    nm.cancel(QUEUE_NOTIF_ID)
  }

  private fun simple(result: Boolean, title: String, text: String): Notification =
    NotificationCompat.Builder(context, CHANNEL_RESULT)
      .setSmallIcon(
        if (result) {
          android.R.drawable.stat_sys_download_done
        } else {
          android.R.drawable.stat_notify_error
        },
      )
      .setContentTitle(title)
      .setContentText(text)
      .setAutoCancel(true)
      .setContentIntent(openAppIntent())
      .build()

  private fun DownloadItem.idLeNotifId(): Int = ("result_" + id).hashCode()

  private fun post(id: Int, notif: Notification) {
    if (Build.VERSION.SDK_INT >= 33 &&
      ContextCompat.checkSelfPermission(context, "android.permission.POST_NOTIFICATIONS") !=
      PackageManager.PERMISSION_GRANTED
    ) {
      return
    }
    NotificationManagerCompat.from(context).notify(id, notif)
  }

  companion object {
    const val CHANNEL_ACTIVE = "downloads_active"
    const val CHANNEL_RESULT = "downloads_result"
    const val NOTIF_ACTIVE = 1
    const val QUEUE_NOTIF_ID = 2
    /** Duraklat ↔ Devam (item durumuna göre) ve İptal. */
    const val ACTION_TOGGLE = "expo.modules.streamdownloader.TOGGLE"
    const val ACTION_CANCEL = "expo.modules.streamdownloader.CANCEL"

    fun ensureChannels(context: Context) {
      val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      nm.createNotificationChannel(
        NotificationChannel(
          CHANNEL_ACTIVE,
          context.getString(R.string.channel_active),
          NotificationManager.IMPORTANCE_LOW,
        ),
      )
      nm.createNotificationChannel(
        NotificationChannel(
          CHANNEL_RESULT,
          context.getString(R.string.channel_result),
          NotificationManager.IMPORTANCE_DEFAULT,
        ),
      )
    }
  }
}
