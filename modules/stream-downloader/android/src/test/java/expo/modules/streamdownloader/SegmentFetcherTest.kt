package expo.modules.streamdownloader

import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

class SegmentFetcherTest {
  @get:Rule val tmp = TemporaryFolder()
  private lateinit var server: MockWebServer
  private lateinit var dir: File
  private val noWait = SegmentFetcher(OkHttpClient(), backoffMs = { 0L })

  @Before
  fun setUp() {
    server = MockWebServer()
    server.start()
    dir = tmp.newFolder("seg")
  }

  @After
  fun tearDown() {
    server.shutdown()
  }

  private fun job(i: Int, path: String = "/s$i") = SegmentJob(
    index = i,
    segment = Segment(url = server.url(path).toString(), durationSec = 1.0),
    fileName = "v%05d.ts".format(i),
  )

  private fun fetchJobs(jobs: List<SegmentJob>, fetcher: SegmentFetcher = noWait, refresh: suspend () -> Map<String, Segment>? = { null }) =
    runBlocking {
      fetcher.fetchAll(jobs, dir, emptyMap(), 3, { _, _ -> }, refresh)
    }

  @Test
  fun downloadsAllSegmentsToPartThenRenames() {
    server.dispatcher = object : Dispatcher() {
      override fun dispatch(request: RecordedRequest) = MockResponse().setBody("body" + request.path)
    }
    fetchJobs((1..5).map { job(it) })
    for (i in 1..5) {
      assertEquals("body/s$i", File(dir, "v%05d.ts".format(i)).readText())
    }
    assertEquals(0, dir.listFiles()!!.count { it.name.endsWith(".part") })
  }

  @Test
  fun skipsExistingCompleteSegments() {
    server.dispatcher = object : Dispatcher() {
      override fun dispatch(request: RecordedRequest) = MockResponse().setBody("x")
    }
    File(dir, "v00001.ts").writeText("done")
    File(dir, "v00002.ts").writeText("done")
    fetchJobs((1..5).map { job(it) })
    assertEquals(3, server.requestCount)
    assertEquals("done", File(dir, "v00001.ts").readText())
  }

  @Test
  fun retriesTransient500ThenSucceeds() {
    server.enqueue(MockResponse().setResponseCode(500))
    server.enqueue(MockResponse().setBody("ok"))
    fetchJobs(listOf(job(1)))
    assertEquals(2, server.requestCount)
    assertEquals("ok", File(dir, "v00001.ts").readText())
  }

  @Test
  fun expiredUrlTriggersRefreshOnce() {
    server.enqueue(MockResponse().setResponseCode(403))
    server.enqueue(MockResponse().setBody("fresh"))
    var refreshCalls = 0
    fetchJobs(listOf(job(1, "/old"))) {
      refreshCalls++
      mapOf("v00001.ts" to Segment(url = server.url("/new").toString(), durationSec = 1.0))
    }
    assertEquals(1, refreshCalls)
    assertEquals("fresh", File(dir, "v00001.ts").readText())
  }

  @Test
  fun partialFileIsNotCountedAsDone() {
    server.enqueue(MockResponse().setBody("whole"))
    File(dir, "v00001.ts.part").writeText("half")
    fetchJobs(listOf(job(1)))
    assertEquals(1, server.requestCount)
    assertEquals("whole", File(dir, "v00001.ts").readText())
    assertFalse(File(dir, "v00001.ts.part").exists())
    assertTrue(File(dir, "v00001.ts").exists())
  }
}
