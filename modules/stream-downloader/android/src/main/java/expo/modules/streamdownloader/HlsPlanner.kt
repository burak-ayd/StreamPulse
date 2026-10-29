package expo.modules.streamdownloader

/**
 * HLS playlist ayrıştırıcı. Davranış `src/services/downloadManager.js`'teki
 * `parseMasterPlaylist` / `parseMediaPlaylist` ile aynıdır; yeni motor bunu
 * native tarafta kullanır.
 */
object HlsPlanner {
  private val LINE_SPLIT = Regex("\r?\n")
  private val SCHEME = Regex("^https?:", RegexOption.IGNORE_CASE)
  private val ORIGIN = Regex("^https?://[^/]+")
  private val LAST_SEGMENT = Regex("[^/]*$")

  /** `#EXT-X-...:KEY=VALUE,KEY2="x,y"` satırından bir özniteliği okur. */
  fun attr(line: String, name: String): String? {
    val body = line.substringAfter(':', "")
    val m = Regex("(?:^|,)$name=(\"([^\"]*)\"|([^,]*))").find(body) ?: return null
    return m.groups[2]?.value ?: m.groups[3]?.value
  }

  fun resolveUrl(base: String, rel: String): String {
    val relative = rel.trim()
    if (relative.isEmpty()) return base
    if (SCHEME.containsMatchIn(relative)) return relative
    if (relative.startsWith("/")) {
      val origin = ORIGIN.find(base)?.value ?: return relative
      return origin + relative
    }
    return base.replace(LAST_SEGMENT, "") + relative
  }

  fun parseMaster(text: String, baseUrl: String): MasterPlaylist {
    val lines = text.split(LINE_SPLIT)
    val variants = mutableListOf<Variant>()
    val audioTracks = mutableListOf<AudioTrack>()
    for (i in lines.indices) {
      val line = lines[i].trim()
      when {
        line.startsWith("#EXT-X-MEDIA") -> {
          if (attr(line, "TYPE") != "AUDIO") continue
          val uri = attr(line, "URI") ?: continue
          audioTracks.add(
            AudioTrack(
              groupId = attr(line, "GROUP-ID"),
              name = attr(line, "NAME") ?: "Ses",
              language = attr(line, "LANGUAGE")?.lowercase(),
              isDefault = attr(line, "DEFAULT") == "YES",
              url = resolveUrl(baseUrl, uri),
            ),
          )
        }
        line.startsWith("#EXT-X-STREAM-INF") -> {
          var j = i + 1
          while (j < lines.size && (lines[j].isBlank() || lines[j].trim().startsWith("#"))) j++
          if (j >= lines.size) continue
          variants.add(
            Variant(
              url = resolveUrl(baseUrl, lines[j].trim()),
              bandwidth = attr(line, "BANDWIDTH")?.toLongOrNull() ?: 0L,
              resolution = attr(line, "RESOLUTION"),
              codecs = attr(line, "CODECS"),
              audioGroup = attr(line, "AUDIO"),
            ),
          )
        }
      }
    }
    return MasterPlaylist(variants, audioTracks)
  }

  private val HEADER_PREFIXES = listOf(
    "#EXT-X-VERSION",
    "#EXT-X-TARGETDURATION",
    "#EXT-X-MEDIA-SEQUENCE",
    "#EXT-X-DISCONTINUITY-SEQUENCE",
    "#EXT-X-PLAYLIST-TYPE",
  )

  fun parseMedia(text: String, baseUrl: String): MediaPlaylist {
    val segments = mutableListOf<Segment>()
    val headerTags = mutableListOf<String>()
    var encrypted = false
    var isFmp4 = false
    var currentDur = 0.0
    var nextIsDiscontinuity = false
    var pendingLength: Long? = null
    var pendingStart: Long? = null

    for (raw in text.split(LINE_SPLIT)) {
      val line = raw.trim()
      if (line.isEmpty()) continue
      when {
        line.startsWith("#EXT-X-KEY") -> {
          if ((attr(line, "METHOD") ?: "NONE") != "NONE") encrypted = true
        }
        line.startsWith("#EXT-X-MAP") -> {
          isFmp4 = true
          attr(line, "URI")?.let { segments.add(Segment(resolveUrl(baseUrl, it), 0.0, isInit = true)) }
        }
        line == "#EXT-X-DISCONTINUITY" -> nextIsDiscontinuity = true
        line.startsWith("#EXTINF") -> {
          currentDur = line.substringAfter(':', "").substringBefore(',').toDoubleOrNull() ?: 0.0
        }
        line.startsWith("#EXT-X-BYTERANGE") -> {
          val parts = line.substringAfter(':', "").split('@')
          pendingLength = parts[0].toLongOrNull()
          pendingStart = parts.getOrNull(1)?.toLongOrNull()
        }
        line.startsWith("#") -> {
          if (HEADER_PREFIXES.any { line.startsWith(it) }) headerTags.add(line)
        }
        else -> {
          segments.add(
            Segment(
              url = resolveUrl(baseUrl, line),
              durationSec = currentDur,
              discontinuity = nextIsDiscontinuity,
              byteRangeLength = pendingLength,
              byteRangeStart = pendingStart,
            ),
          )
          currentDur = 0.0
          nextIsDiscontinuity = false
          pendingLength = null
          pendingStart = null
        }
      }
    }
    return MediaPlaylist(segments, encrypted, isFmp4, headerTags)
  }
}
