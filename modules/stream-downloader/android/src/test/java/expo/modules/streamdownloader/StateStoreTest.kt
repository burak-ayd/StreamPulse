package expo.modules.streamdownloader

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class StateStoreTest {
  @get:Rule val tmp = TemporaryFolder()

  private fun store() = StateStore(tmp.root.resolve("state.json"))

  private val sample = DownloadItem(
    id = "dl_1", kind = "episode", title = "Lupin", sourceUrl = "https://x/ep3",
    seriesTitle = "Lupin", season = 1, episode = 3, episodeTitle = "B3",
    headers = mapOf("Referer" to "https://x"), variantId = "1280x720@2800000",
    variantBandwidth = 2800000L, status = DownloadStatus.COMPLETED, progress = 1.0,
    downloadedBytes = 123L, totalBytes = 456L, outputPath = "/sdcard/x.mp4", createdAt = 10L,
    completedAt = 20L,
  )

  @Test
  fun roundTripKeepsAllFields() {
    val s = store()
    s.save(listOf(sample))
    assertEquals(listOf(sample), s.load())
  }

  @Test
  fun downloadingAndMergingBecomePausedOnLoad() {
    val s = store()
    s.save(
      listOf(
        sample.copy(id = "a", status = DownloadStatus.DOWNLOADING),
        sample.copy(id = "b", status = DownloadStatus.MERGING),
        sample.copy(id = "c", status = DownloadStatus.FAILED),
      ),
    )
    val byId = s.load().associateBy { it.id }
    assertEquals(DownloadStatus.QUEUED, byId["a"]!!.status) // açılışta kendiliğinden devam
    assertEquals(DownloadStatus.QUEUED, byId["b"]!!.status)
    assertEquals(DownloadStatus.FAILED, byId["c"]!!.status)
  }

  @Test
  fun leftoverTmpDoesNotCorruptLoad() {
    val s = store()
    s.save(listOf(sample))
    tmp.root.resolve("state.json.tmp").writeText("[garbage")
    assertEquals(listOf(sample), s.load())
  }

  @Test
  fun corruptFileReturnsEmptyList() {
    tmp.root.resolve("state.json").writeText("{not json")
    assertTrue(store().load().isEmpty())
  }
}
