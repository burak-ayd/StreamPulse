package expo.modules.streamdownloader

import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/**
 * İndirme listesinin tek gerçek kaynağı: `filesDir/stream-downloader/state.json`.
 * Yazma atomik: önce `.tmp`, sonra yeniden adlandırma. Yarım kalmış bir yazma
 * eski dosyayı bozmaz.
 */
class StateStore(private val file: File) : StatePersisting {

  override fun load(): MutableList<DownloadItem> {
    if (!file.exists()) return mutableListOf()
    return try {
      val arr = JSONArray(file.readText())
      MutableList(arr.length()) { i -> recover(fromJson(arr.getJSONObject(i))) }
    } catch (_: Exception) {
      mutableListOf()
    }
  }

  override fun save(items: List<DownloadItem>) {
    file.parentFile?.mkdirs()
    val tmp = File(file.parentFile, file.name + ".tmp")
    tmp.writeText(JSONArray(items.map { toJson(it) }).toString())
    if (!tmp.renameTo(file)) {
      file.delete()
      tmp.renameTo(file)
    }
  }

  /** Süreç öldüğünde yarım kalan indirmeler duraklatılmış sayılır. */
  private fun recover(item: DownloadItem): DownloadItem =
    if (item.status == DownloadStatus.DOWNLOADING || item.status == DownloadStatus.MERGING || item.status == DownloadStatus.PUBLISHING) {
      item.copy(status = DownloadStatus.QUEUED, speedBps = 0L, error = null)
    } else {
      item
    }

  private fun toJson(item: DownloadItem): JSONObject = JSONObject().apply {
    put("id", item.id)
    put("kind", item.kind)
    put("title", item.title)
    put("sourceUrl", item.sourceUrl)
    put("seriesTitle", item.seriesTitle ?: JSONObject.NULL)
    put("season", item.season ?: JSONObject.NULL)
    put("episode", item.episode ?: JSONObject.NULL)
    put("episodeTitle", item.episodeTitle ?: JSONObject.NULL)
    put("headers", JSONObject(item.headers))
    put("audioLanguage", item.audioLanguage ?: JSONObject.NULL)
    put("variantId", item.variantId ?: JSONObject.NULL)
    put("variantBandwidth", item.variantBandwidth ?: JSONObject.NULL)
    put("variantResolution", item.variantResolution ?: JSONObject.NULL)
    put("subtitleUrl", item.subtitleUrl ?: JSONObject.NULL)
    put("posterUrl", item.posterUrl ?: JSONObject.NULL)
    put("pluginName", item.pluginName ?: JSONObject.NULL)
    put("status", item.status.wire)
    put("progress", item.progress)
    put("downloadedBytes", item.downloadedBytes)
    put("totalBytes", item.totalBytes)
    put("speedBps", item.speedBps)
    put("error", item.error ?: JSONObject.NULL)
    put("errorCode", item.errorCode ?: JSONObject.NULL)
    put("outputUri", item.outputUri ?: JSONObject.NULL)
    put("outputPath", item.outputPath ?: JSONObject.NULL)
    put("subtitleUri", item.subtitleUri ?: JSONObject.NULL)
    put("exported", item.exported ?: JSONObject.NULL)
    put("contentId", item.contentId ?: JSONObject.NULL)
    put("workers", item.workers ?: JSONObject.NULL)
    put("retryCount", item.retryCount)
    put("createdAt", item.createdAt)
    put("completedAt", item.completedAt ?: JSONObject.NULL)
  }

  private fun fromJson(o: JSONObject): DownloadItem {
    val headersObj = o.optJSONObject("headers") ?: JSONObject()
    val headers = headersObj.keys().asSequence().associateWith { headersObj.getString(it) }
    return DownloadItem(
      id = o.getString("id"),
      kind = o.getString("kind"),
      title = o.getString("title"),
      sourceUrl = o.getString("sourceUrl"),
      seriesTitle = o.str("seriesTitle"),
      season = o.intOrNull("season"),
      episode = o.intOrNull("episode"),
      episodeTitle = o.str("episodeTitle"),
      headers = headers,
      audioLanguage = o.str("audioLanguage"),
      variantId = o.str("variantId"),
      variantBandwidth = o.longOrNull("variantBandwidth"),
      variantResolution = o.str("variantResolution"),
      subtitleUrl = o.str("subtitleUrl"),
      posterUrl = o.str("posterUrl"),
      pluginName = o.str("pluginName"),
      status = DownloadStatus.from(o.getString("status")),
      progress = o.optDouble("progress", 0.0),
      downloadedBytes = o.optLong("downloadedBytes", 0L),
      totalBytes = o.optLong("totalBytes", 0L),
      speedBps = o.optLong("speedBps", 0L),
      error = o.str("error"),
      errorCode = o.str("errorCode"),
      outputUri = o.str("outputUri"),
      outputPath = o.str("outputPath"),
      subtitleUri = o.str("subtitleUri"),
      exported = o.boolOrNull("exported"),
      contentId = o.str("contentId"),
      workers = o.intOrNull("workers"),
      retryCount = o.optInt("retryCount", 0),
      createdAt = o.optLong("createdAt", 0L),
      completedAt = o.longOrNull("completedAt"),
    )
  }

  private fun JSONObject.str(key: String): String? =
    if (has(key) && !isNull(key)) getString(key) else null

  private fun JSONObject.intOrNull(key: String): Int? =
    if (has(key) && !isNull(key)) getInt(key) else null

  private fun JSONObject.longOrNull(key: String): Long? =
    if (has(key) && !isNull(key)) getLong(key) else null

  private fun JSONObject.boolOrNull(key: String): Boolean? =
    if (has(key) && !isNull(key)) getBoolean(key) else null

}



