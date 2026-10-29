package expo.modules.streamdownloader

/** Wire değerleri JS tarafındaki durum adlarıyla birebir aynıdır. */
enum class DownloadStatus(val wire: String) {
  QUEUED("queued"),
  DOWNLOADING("downloading"),
  MERGING("merging"),
  PUBLISHING("publishing"),
  PAUSED("paused"),
  COMPLETED("completed"),
  FAILED("failed");

  companion object {
    fun from(wire: String): DownloadStatus = values().firstOrNull { it.wire == wire } ?: FAILED
  }
}

/**
 * Tek bir indirme kaydı. Her güncelleme `copy` ile yapılır (değişmez kopya).
 * `kind`: "movie" | "episode".
 */
data class DownloadItem(
  val id: String,
  val kind: String,
  val title: String,
  val sourceUrl: String,
  val seriesTitle: String? = null,
  val season: Int? = null,
  val episode: Int? = null,
  val episodeTitle: String? = null,
  val headers: Map<String, String> = emptyMap(),
  val audioLanguage: String? = null,
  val variantId: String? = null,
  val variantBandwidth: Long? = null,
  val variantResolution: String? = null,
  val subtitleUrl: String? = null,
  val posterUrl: String? = null,
  val pluginName: String? = null,
  val status: DownloadStatus = DownloadStatus.QUEUED,
  val progress: Double = 0.0,
  val downloadedBytes: Long = 0L,
  val totalBytes: Long = 0L,
  val speedBps: Long = 0L,
  val error: String? = null,
  val errorCode: String? = null,
  val outputUri: String? = null,
  val outputPath: String? = null,
  val subtitleUri: String? = null,
  /** Dışa aktarıldı mı (Download/StreamPulse'a taşındı)? */
  val exported: Boolean? = null,
  /** İçerik sayfa kimliği (JS spec.contentId) — İndirilenler'den oynatmada devam eşleşmesi için. */
  val contentId: String? = null,
  /** Bu indirme için paralel segment sayısı (ayar: maxConnectionsPerDownload). */
  val workers: Int? = null,
  /** MP4'e dönüştürmeden HLS segmentleri olarak bırakma (hız deneyi). */
  val retryCount: Int = 0,
  val createdAt: Long = 0L,
  val completedAt: Long? = null,
)
