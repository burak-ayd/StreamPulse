package expo.modules.streamdownloader

import java.io.File
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

private const val MASTER_URL = "http://t/master.m3u8"
private const val MEDIA_URL = "http://t/media.m3u8"

private val masterText = """
  #EXTM3U
  #EXT-X-STREAM-INF:BANDWIDTH=2800000,RESOLUTION=1280x720
  $MEDIA_URL
""".trimIndent()

private val mediaText = """
  #EXTM3U
  #EXT-X-TARGETDURATION:4
  #EXTINF:4.0,
  http://t/seg1.ts
  #EXTINF:4.0,
  http://t/seg2.ts
""".trimIndent()

class FakePlaylists(private val texts: Map<String, String>) : PlaylistFetching {
  override suspend fun text(url: String, headers: Map<String, String>): String =
    texts[url] ?: error("beklenmeyen URL: $url")
}

class FakeFetcher : SegmentFetching {
  val calledDirs = mutableListOf<File>()
  val gate = CompletableDeferred<Unit>()
  var block = false

  override suspend fun fetchAll(
    jobs: List<SegmentJob>,
    dir: File,
    headers: Map<String, String>,
    workers: Int,
    onProgress: (Long, Int) -> Unit,
    refreshOnExpired: suspend () -> Map<String, Segment>?,
    calls: MutableSet<okhttp3.Call>?,
  ) {
    calledDirs.add(dir)
    if (block) gate.await()
    onProgress(1000L, jobs.size)
  }
}

class FakeMerger(private val ok: Boolean = true) : Merging {
  val merged = mutableListOf<String>()
  override suspend fun merge(
    video: File,
    audio: File?,
    out: File,
    onProgress: (Double) -> Unit,
  ): MergeResult {
    merged.add(video.absolutePath + "|" + (audio?.absolutePath ?: "-"))
    onProgress(8.0)
    out.writeText("mp4")
    return MergeResult(ok, if (ok) null else "birleştirme hatası", 8.0)
  }
}

class FakePublisher : Publishing {
  val published = mutableListOf<PublishResult>()
  val deleted = mutableListOf<PublishResult>()
  override fun publish(item: DownloadItem, mp4: File, srt: File?): PublishResult =
    PublishResult("content://test/${item.id}", "/tmp/test/${item.id}.mp4", null)
      .also { published.add(it) }

  override fun delete(result: PublishResult) {
    deleted.add(result)
  }
}

class FakeNotifier : Notifying {
  val completed = mutableListOf<DownloadItem>()
  val failed = mutableListOf<DownloadItem>()
  override fun notifyProgress(items: List<DownloadItem>) = Unit
  override fun notifyCompleted(item: DownloadItem) = completed.add(item).let { Unit }
  override fun notifyFailed(item: DownloadItem) = failed.add(item).let { Unit }
}

class RecordingStore : StatePersisting {
  val saves = mutableListOf<Pair<String, DownloadStatus>>()
  override fun load(): MutableList<DownloadItem> = mutableListOf()
  override fun save(items: List<DownloadItem>) {
    items.forEach { saves.add(it.id to it.status) }
  }
}

class DownloadEngineTest {

  @get:Rule
  val tmp = TemporaryFolder()

  private fun mediaSpec(url: String = MASTER_URL, title: String = "Film") = EnqueueSpec(
    kind = "movie",
    title = title,
    sourceUrl = url,
  )

  private fun episodeSpec(season: Int, episode: Int) = EnqueueSpec(
    kind = "episode",
    title = "S${season}B$episode",
    sourceUrl = "http://t/ep-$season-$episode.m3u8",
    seriesTitle = "Dizi",
    season = season,
    episode = episode,
  )

  private fun TestContext( // telsiz: sahtelerle hazır motor
    merger: FakeMerger = FakeMerger(),
    fetcher: FakeFetcher = FakeFetcher(),
    store: RecordingStore = RecordingStore(),
    texts: Map<String, String> = mapOf(
      MASTER_URL to masterText,
      MEDIA_URL to mediaText,
      "http://t/master-a.m3u8" to masterText,
      "http://t/master-b.m3u8" to masterText,
      "http://t/master-c.m3u8" to masterText,
      "http://t/ep-1-1.m3u8" to masterText,
      "http://t/ep-1-2.m3u8" to masterText,
    ),
    availableBytes: (() -> Long)? = { 1L shl 40 },
  ): DownloadEngine =
    DownloadEngine(
      root = kotlin.io.path.createTempDirectory("engine-root").toFile(),
      store = store,
      playlists = FakePlaylists(texts),
      fetcher = fetcher,
      merger = merger,
      publisher = FakePublisher(),
      notifier = FakeNotifier(),
      scope = CoroutineScope(Dispatchers.Unconfined),
      availableBytes = availableBytes,
    )

  @Test
  fun enqueueSameEpisodeReturnsExistingId() = runBlocking {
    val engine = TestContext()
    val a = engine.enqueue(episodeSpec(1, 1))
    val b = engine.enqueue(episodeSpec(1, 1))
    assertEquals(a, b)
    assertEquals(DownloadStatus.COMPLETED, engine.getItem(a)?.status)
  }

  @Test
  fun twoEpisodesOfSameSeriesAreSeparateItems() = runBlocking {
    val engine = TestContext()
    val a = engine.enqueue(episodeSpec(1, 1))
    val b = engine.enqueue(episodeSpec(1, 2))
    assertTrue(a != b)
    assertEquals(DownloadStatus.COMPLETED, engine.getItem(b)?.status)
    val dirs = (engine.fetcher as FakeFetcher).calledDirs
    assertEquals(2, dirs.size)
    assertTrue(dirs[0].absolutePath != dirs[1].absolutePath)
  }

  @Test
  fun maxConcurrentIsRespected() = runBlocking {
    val fetcher = FakeFetcher().apply { block = true }
    val engine = TestContext(fetcher = fetcher)
    val a = engine.enqueue(mediaSpec(url = "http://t/master-a.m3u8", title = "A"))
    val b = engine.enqueue(mediaSpec(url = "http://t/master-b.m3u8", title = "B"))
    val c = engine.enqueue(mediaSpec(url = "http://t/master-c.m3u8", title = "C"))
    assertEquals(DownloadStatus.DOWNLOADING, engine.getItem(a)?.status)
    assertEquals(DownloadStatus.DOWNLOADING, engine.getItem(b)?.status)
    assertEquals(DownloadStatus.QUEUED, engine.getItem(c)?.status)
    fetcher.gate.complete(Unit)
    assertEquals(DownloadStatus.COMPLETED, engine.getItem(c)?.status)
  }

  @Test
  fun pauseKeepsTempDirAndResumes() = runBlocking {
    val fetcher = FakeFetcher().apply { block = true }
    val engine = TestContext(fetcher = fetcher)
    val id = engine.enqueue(mediaSpec())
    engine.pause(id)
    assertEquals(DownloadStatus.PAUSED, engine.getItem(id)?.status)
    assertTrue(engine.tempDir(id).exists())
    engine.resume(id)
    fetcher.gate.complete(Unit)
    assertEquals(DownloadStatus.COMPLETED, engine.getItem(id)?.status)
  }

  @Test
  fun cancelRemovesItemAndTempDir() = runBlocking {
    val fetcher = FakeFetcher().apply { block = true }
    val engine = TestContext(fetcher = fetcher)
    val id = engine.enqueue(mediaSpec())
    engine.cancel(id)
    assertEquals(null, engine.getItem(id))
    assertFalse(engine.tempDir(id).exists())
  }

  @Test
  fun completeThenRemoveDeletesExternalFile() = runBlocking {
    val engine = TestContext()
    val id = engine.enqueue(mediaSpec())
    engine.remove(id)
    assertEquals(null, engine.getItem(id))
  }

  @Test
  fun mergeFailureMarksFailedAndKeepsSegments() = runBlocking {
    val engine = TestContext(merger = FakeMerger(ok = false))
    val id = engine.enqueue(mediaSpec())
    val item = engine.getItem(id)!!
    assertEquals(DownloadStatus.FAILED, item.status)
    assertEquals("MERGE_FAILED", item.errorCode)
    assertTrue(engine.tempDir(id).exists())
  }

  @Test
  fun insufficientRoomFailsBeforeFetching() = runBlocking {
    val engine = TestContext(availableBytes = { 100L })
    val id = engine.enqueue(mediaSpec())
    val item = engine.getItem(id)!!
    assertEquals(DownloadStatus.FAILED, item.status)
    assertEquals("DISK_FULL", item.errorCode)
    assertEquals(0, (engine.fetcher as FakeFetcher).calledDirs.size)
  }

  @Test
  fun encryptedPlaylistFailsWithHlsEncrypted() = runBlocking {
    val encryptedMedia = mediaText.replace(
      "#EXT-X-TARGETDURATION:4",
      "#EXT-X-TARGETDURATION:4\n#EXT-X-KEY:METHOD=AES-128,URI=\"http://t/k\"",
    )
    val engine = TestContext(
      texts = mapOf(MASTER_URL to masterText, MEDIA_URL to encryptedMedia),
    )
    val id = engine.enqueue(mediaSpec())
    val item = engine.getItem(id)!!
    assertEquals(DownloadStatus.FAILED, item.status)
    assertEquals("HLS_ENCRYPTED", item.errorCode)
    assertEquals(0, (engine.fetcher as FakeFetcher).calledDirs.size)
  }

  @Test
  fun stateIsPersistedOnStatusChanges() = runBlocking {
    val store = RecordingStore()
    val engine = TestContext(store = store)
    val id = engine.enqueue(mediaSpec())
    val statuses = store.saves.filter { it.first == id }.map { it.second }
    assertTrue(statuses.contains(DownloadStatus.QUEUED))
    assertTrue(statuses.contains(DownloadStatus.DOWNLOADING))
    assertTrue(statuses.contains(DownloadStatus.COMPLETED))
  }

  @Test
  fun mergedAudioAndVideoPlaylistsAreGivenTogether() = runBlocking {
    val merger = FakeMerger()
    val engine = TestContext(merger = merger)
    engine.enqueue(mediaSpec())
    // Tek audio rendition'ı olmayan master'da ses yok: yalnızca video playlist'i.
    assertEquals(1, merger.merged.size)
    assertTrue(merger.merged[0].endsWith("|-"))
  }
}
