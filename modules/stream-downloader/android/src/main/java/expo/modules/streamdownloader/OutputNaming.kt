package expo.modules.streamdownloader

/**
 * Çıktı dosya adları (`Download/StreamPulse` altında).
 *  film:  {Film Adı}.mp4                     (kök klasörde)
 *  dizi:  {Dizi Adı}/S01E04 - {Bölüm}.mp4    (dizi klasöründe)
 * Kurallar `downloadManager.js` `sanitizeFileName` ile aynıdır, ek olarak
 * 120 karakter sınırı var.
 */
object OutputNaming {
  private const val MAX_BASE = 120
  private val FORBIDDEN = Regex("[/\\\\:*?\"<>|]")
  private val SPACES = Regex("\\s+")

  fun sanitize(raw: String): String =
    raw.replace(FORBIDDEN, "").replace(SPACES, " ").trim()

  /** Dizi klasörü; film için null (kök). */
  fun folder(item: DownloadItem): String? {
    if (item.kind != "episode") return null
    return sanitize(item.seriesTitle ?: item.title).ifBlank { "Dizi" }.take(MAX_BASE).trim()
  }

  fun fileName(item: DownloadItem, ext: String): String {
    val base = if (item.kind == "episode" && item.season != null && item.episode != null) {
      val code = "S" + item.season.toString().padStart(2, '0') + "E" +
        item.episode.toString().padStart(2, '0')
      val ep = sanitize(item.episodeTitle ?: "")
      if (ep.isBlank()) code else "$code - $ep"
    } else {
      sanitize(item.title).ifBlank { "Film" }
    }
    return base.take(MAX_BASE).trim() + "." + ext
  }
}
