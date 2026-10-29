package expo.modules.streamdownloader

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class LocalPlaylistWriterTest {
  private fun seg(url: String, dur: Double, init: Boolean = false, disc: Boolean = false) =
    Segment(url = url, durationSec = dur, isInit = init, discontinuity = disc)

  private val playlist = MediaPlaylist(
    segments = listOf(
      seg("https://x/init.mp4", 0.0, init = true),
      seg("https://x/1.m4s", 6.006),
      seg("https://x/2.m4s", 4.0, disc = true),
    ),
    encrypted = false,
    isFmp4 = true,
    headerTags = listOf("#EXT-X-VERSION:7", "#EXT-X-TARGETDURATION:7"),
  )

  private val locals = listOf(File("v/init.mp4"), File("v/v1.ts"), File("v/v2.ts"))

  @Test
  fun writesAbsolutePathsForSegments() {
    val out = LocalPlaylistWriter.render(playlist, locals)
    assertTrue(out.contains(File("v/v1.ts").absolutePath))
    assertTrue(out.contains("#EXTINF:6.006,"))
  }

  @Test
  fun keepsDiscontinuityTag() {
    val lines = LocalPlaylistWriter.render(playlist, locals).lines()
    val discIdx = lines.indexOf("#EXT-X-DISCONTINUITY")
    assertEquals(File("v/v2.ts").absolutePath, lines[discIdx + 2])
  }

  @Test
  fun fmp4InitWrittenAsExtXMapAndNotAsSegment() {
    val out = LocalPlaylistWriter.render(playlist, locals)
    assertTrue(out.contains("#EXT-X-MAP:URI=\"${File("v/init.mp4").absolutePath}\""))
    assertEquals(2, out.lines().count { it.startsWith("#EXTINF") })
  }

  @Test
  fun endsWithEndlistAndKeepsHeaderTags() {
    val out = LocalPlaylistWriter.render(playlist, locals)
    assertTrue(out.trimEnd().endsWith("#EXT-X-ENDLIST"))
    assertTrue(out.contains("#EXT-X-TARGETDURATION:7"))
  }

  @Test
  fun audioOnlyArgsMapSeparateAudioInput() {
    val args = Merger.buildArgs(File("v.m3u8"), File("a.m3u8"), File("out.mp4")).toList()
    assertTrue(args.containsAll(listOf("-map", "1:a:0", "-c", "copy")))
    assertEquals(File("out.mp4").absolutePath, args.last())
  }
}
