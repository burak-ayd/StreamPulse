package expo.modules.streamdownloader

/** Master playlist'teki bir video varyantı (`#EXT-X-STREAM-INF`). */
data class Variant(
  val url: String,
  val bandwidth: Long,
  val resolution: String?,
  val codecs: String?,
  val audioGroup: String?,
) {
  /** Kalite kimliği: JS tarafı bunu kayıtta saklar (ör. `1280x720@2800000`). */
  val id: String get() = "${resolution ?: "?"}@$bandwidth"
}

/** Master playlist'teki bir ses rendition'ı (`#EXT-X-MEDIA TYPE=AUDIO`). */
data class AudioTrack(
  val groupId: String?,
  val name: String,
  val language: String?,
  val isDefault: Boolean,
  val url: String,
)

/** Media playlist'in tek segmenti. `isInit` true ise fMP4 init (`#EXT-X-MAP`). */
data class Segment(
  val url: String,
  val durationSec: Double,
  val isInit: Boolean = false,
  val discontinuity: Boolean = false,
  val byteRangeLength: Long? = null,
  val byteRangeStart: Long? = null,
)

data class MediaPlaylist(
  val segments: List<Segment>,
  val encrypted: Boolean,
  val isFmp4: Boolean,
  /** VERSION / TARGETDURATION / MEDIA-SEQUENCE gibi başlık etiketleri, yerel playlist'e aynen geçer. */
  val headerTags: List<String>,
)

data class MasterPlaylist(val variants: List<Variant>, val audioTracks: List<AudioTrack>)
