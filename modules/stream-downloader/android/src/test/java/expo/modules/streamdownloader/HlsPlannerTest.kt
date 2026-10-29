package expo.modules.streamdownloader

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class HlsPlannerTest {
  private val base = "https://cdn.example.com/show/master.m3u8"

  @Test
  fun masterListsVariantsWithBandwidthAndResolution() {
    val text = """
      #EXTM3U
      #EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360
      low/index.m3u8
      #EXT-X-STREAM-INF:BANDWIDTH=2800000,RESOLUTION=1280x720,CODECS="avc1.4d401f,mp4a.40.2"
      high/index.m3u8
    """.trimIndent()
    val m = HlsPlanner.parseMaster(text, base)
    assertEquals(2, m.variants.size)
    assertEquals(2800000L, m.variants[1].bandwidth)
    assertEquals("1280x720", m.variants[1].resolution)
    assertEquals("1280x720@2800000", m.variants[1].id)
    assertEquals("https://cdn.example.com/show/high/index.m3u8", m.variants[1].url)
  }

  @Test
  fun masterListsAudioRenditions() {
    val text = """
      #EXTM3U
      #EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="Türkçe",LANGUAGE="TR",DEFAULT=YES,URI="a.m3u8"
      #EXT-X-STREAM-INF:BANDWIDTH=1,AUDIO="aud"
      v.m3u8
    """.trimIndent()
    val track = HlsPlanner.parseMaster(text, base).audioTracks.single()
    assertEquals("tr", track.language)
    assertTrue(track.isDefault)
    assertEquals("Türkçe", track.name)
    assertEquals("https://cdn.example.com/show/a.m3u8", track.url)
  }

  @Test
  fun relativeUrlsResolveAgainstBase() {
    assertEquals("https://cdn.example.com/show/v/video.m3u8", HlsPlanner.resolveUrl(base, "v/video.m3u8"))
    assertEquals("https://cdn.example.com/abs/x.m3u8", HlsPlanner.resolveUrl(base, "/abs/x.m3u8"))
    assertEquals("https://other/x.m3u8", HlsPlanner.resolveUrl(base, "https://other/x.m3u8"))
  }

  @Test
  fun mediaCollectsSegmentsAndDurations() {
    val text = "#EXTM3U\n#EXTINF:6.006,\nseg1.ts\n#EXTINF:4.0,\nseg2.ts\n#EXT-X-ENDLIST"
    val m = HlsPlanner.parseMedia(text, base)
    assertEquals(2, m.segments.size)
    assertEquals(6.006, m.segments[0].durationSec, 0.0001)
    assertEquals("https://cdn.example.com/show/seg2.ts", m.segments[1].url)
  }

  @Test
  fun discontinuityMarksNextSegment() {
    val text = "#EXTINF:2.0,\na.ts\n#EXT-X-DISCONTINUITY\n#EXTINF:2.0,\nb.ts\n#EXTINF:2.0,\nc.ts"
    val segs = HlsPlanner.parseMedia(text, base).segments
    assertFalse(segs[0].discontinuity)
    assertTrue(segs[1].discontinuity)
    assertFalse(segs[2].discontinuity)
  }

  @Test
  fun fmp4MapBecomesInitSegment() {
    val text = "#EXT-X-MAP:URI=\"init.mp4\"\n#EXTINF:2.0,\nm1.m4s"
    val m = HlsPlanner.parseMedia(text, base)
    assertTrue(m.isFmp4)
    assertTrue(m.segments[0].isInit)
    assertFalse(m.segments[1].isInit)
  }

  @Test
  fun byteRangeIsParsed() {
    val text = "#EXT-X-BYTERANGE:1000@200\n#EXTINF:2.0,\nbig.ts"
    val seg = HlsPlanner.parseMedia(text, base).segments.single()
    assertEquals(1000L, seg.byteRangeLength)
    assertEquals(200L, seg.byteRangeStart)
  }

  @Test
  fun aesKeyMarksEncryptedButNoneDoesNot() {
    val aes = HlsPlanner.parseMedia("#EXT-X-KEY:METHOD=AES-128,URI=\"k\"\n#EXTINF:1,\na.ts", base)
    val none = HlsPlanner.parseMedia("#EXT-X-KEY:METHOD=NONE\n#EXTINF:1,\na.ts", base)
    assertTrue(aes.encrypted)
    assertFalse(none.encrypted)
  }

  @Test
  fun headerTagsKeepTargetDurationAndVersion() {
    val text = "#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:6\n#EXTINF:6,\na.ts"
    val tags = HlsPlanner.parseMedia(text, base).headerTags
    assertEquals(listOf("#EXT-X-VERSION:3", "#EXT-X-TARGETDURATION:6"), tags)
  }

  @Test
  fun missingAttributeIsNull() {
    assertNull(HlsPlanner.attr("#EXT-X-STREAM-INF:BANDWIDTH=5", "RESOLUTION"))
  }
}
