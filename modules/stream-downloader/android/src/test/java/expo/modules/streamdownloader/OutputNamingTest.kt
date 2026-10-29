package expo.modules.streamdownloader

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class OutputNamingTest {
  private fun movie(title: String) =
    DownloadItem(id = "m", kind = "movie", title = title, sourceUrl = "u")

  private fun episode(season: Int, ep: Int, epTitle: String? = "Bölüm Adı") =
    DownloadItem(
      id = "e$season$ep", kind = "episode", title = "Lupin", sourceUrl = "u",
      seriesTitle = "Lupin", season = season, episode = ep, episodeTitle = epTitle,
    )

  @Test
  fun movieGoesToRootWithSanitizedTitle() {
    assertEquals("Lupin Film.mp4", OutputNaming.fileName(movie("Lupin: Film?"), "mp4"))
    assertNull(OutputNaming.folder(movie("x")))
  }

  @Test
  fun episodeUsesSeriesFolderAndSxxExx() {
    assertEquals("Lupin", OutputNaming.folder(episode(1, 4)))
    assertEquals("S01E04 - Bölüm Adı.mp4", OutputNaming.fileName(episode(1, 4), "mp4"))
  }

  @Test
  fun twoEpisodesOfSameSeriesDiffer() {
    val a = OutputNaming.fileName(episode(1, 3), "mp4")
    val b = OutputNaming.fileName(episode(1, 4), "mp4")
    assertTrue(a != b)
  }

  @Test
  fun forbiddenCharsRemovedAndSpacesCollapsed() {
    assertEquals("abc", OutputNaming.sanitize("a/b\\c  :*?\"<>|"))
    assertEquals("a b", OutputNaming.sanitize("a/ b"))
    assertEquals("a b", OutputNaming.sanitize("a   b"))
  }

  @Test
  fun turkishCharsKept() {
    assertEquals("Ağır Roman.mp4", OutputNaming.fileName(movie("Ağır Roman"), "mp4"))
  }

  @Test
  fun emptyEpisodeTitleOmitsSuffix() {
    assertEquals("S01E04.mp4", OutputNaming.fileName(episode(1, 4, null), "mp4"))
  }

  @Test
  fun longNameIsTruncatedTo120() {
    val name = OutputNaming.fileName(movie("a".repeat(200)), "mp4")
    assertEquals(120 + ".mp4".length, name.length)
  }
}
