package expo.modules.streamdownloader

import java.io.File

/**
 * Yerel oynatma listesi: her segment indirilmiş dosyanın MUTLAK yoluna işaret eder.
 * FFmpeg bu listeyi `-c copy` ile birleştirir (bkz. [Merger]).
 */
object LocalPlaylistWriter {

  /**
   * @param localFiles [playlist.segments] ile aynı uzunlukta; her segmentin yerel dosyası.
   */
  fun render(playlist: MediaPlaylist, localFiles: List<File>): String {
    require(localFiles.size == playlist.segments.size) { "segment ve yerel dosya sayısı eşleşmiyor" }
    val out = mutableListOf("#EXTM3U")
    out.addAll(playlist.headerTags)
    val initIdx = playlist.segments.indexOfFirst { it.isInit }
    if (initIdx >= 0) out.add("#EXT-X-MAP:URI=\"${localFiles[initIdx].absolutePath}\"")
    playlist.segments.forEachIndexed { i, seg ->
      if (seg.isInit) return@forEachIndexed
      if (seg.discontinuity) out.add("#EXT-X-DISCONTINUITY")
      out.add("#EXTINF:${String.format(java.util.Locale.US, "%.3f", seg.durationSec)},")
      out.add(localFiles[i].absolutePath)
    }
    out.add("#EXT-X-ENDLIST")
    return out.joinToString("\n", postfix = "\n")
  }

  fun write(file: File, playlist: MediaPlaylist, localFiles: List<File>) {
    file.parentFile?.mkdirs()
    file.writeText(render(playlist, localFiles))
  }
}
