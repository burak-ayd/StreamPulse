package expo.modules.streamdownloader

import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import java.io.File


/** DirectFileFetcher: paralel Range parçaları dosyayı birebir tamamlar. */
class DirectFileFetcherTest {

  private lateinit var server: MockWebServer
  private val veri = ByteArray(3_000_000) { (it % 251).toByte() }

  @Before
  fun setup() {
    server = MockWebServer()
    server.start()
    // Range destekli tek dosya: bytes=start-end
    server.dispatcher = object : okhttp3.mockwebserver.Dispatcher() {
      override fun dispatch(request: okhttp3.mockwebserver.RecordedRequest) = rangeYanit(request)
    }
  }

  /** Range destekli sahte dosya: bytes=start-end → 206 + Content-Range. */
  private fun rangeYanit(request: okhttp3.mockwebserver.RecordedRequest): MockResponse {
    val range = request.getHeader("Range")
    val start = range?.substringAfter("bytes=")?.substringBefore("-")?.toLongOrNull() ?: 0L
    val end = range?.substringAfter("-")?.toLongOrNull() ?: (veri.size - 1).toLong()
    val son = minOf(end, veri.size - 1L).toInt()
    val govde = veri.copyOfRange(start.toInt(), son + 1)
    return MockResponse()
      .setResponseCode(206)
      .setHeader("Content-Range", "bytes $start-$son/${veri.size}")
      .setBody(okio.Buffer().write(govde))
  }

  @After
  fun tearDown() {
    server.shutdown()
  }

  @Test
  fun `paralel range indirmesi dosyayi birebir tamamlar`() = runBlocking<Unit> {
    val hedef = File.createTempFile("spd-direct", ".bin")
    hedef.delete()
    val fetcher = DirectFileFetcher()
    var ilerleme = 0L
    fetcher.download(
      server.url("/video.mp4").toString(),
      hedef,
      emptyMap(),
      4,
      onProgress = { bytes, _ -> ilerleme = bytes },
    )
    assertEquals(veri.size.toLong(), hedef.length())
    assertArrayEquals(veri, hedef.readBytes())
    assertEquals(veri.size.toLong(), ilerleme)
    hedef.delete()
  }

  /** Küçük parça + ortak kuyruk: az bağlantı bile dosyayı birebir tamamlar. */
  @Test
  fun `az baglanti cok parca dosyayi birebir tamamlar`() = runBlocking<Unit> {
    val hedef = File.createTempFile("spd-kuyruk", ".bin")
    hedef.delete()
    val fetcher = DirectFileFetcher()
    fetcher.download(
      server.url("/kuyruk.mp4").toString(),
      hedef,
      emptyMap(),
      2,
      onProgress = { _, _ -> },
    )
    assertEquals(veri.size.toLong(), hedef.length())
    assertArrayEquals(veri, hedef.readBytes())
    // 1 probe + 3 parça: kuyruk bağlantı sayısından fazla istek üretti.
    assertEquals(true, server.requestCount >= 4)
    hedef.delete()
  }

  @Test
  fun `dogrudan medya url tespiti`() {
    assertEquals(true, DirectFileFetcher.isDirect("https://x.com/d/abc/film.mp4"))
    assertEquals(true, DirectFileFetcher.isDirect("https://x.com/d/abc/film.mp4?t=1&e=2"))
    assertEquals(false, DirectFileFetcher.isDirect("https://x.com/hls/master.m3u8"))
    assertEquals(false, DirectFileFetcher.isDirect("https://x.com/index-f2-v1-a2.m3u8"))
  }

  /** 16 parçaya kadar paralel Range: OkHttp'nin host başına 5 istek
   *  varsayılanı fazla parçaları sıraya sokuyordu (indirme ~2 katı). */
  @Test
  fun `host basina istek siniri paralel parcaya yetiyor`() {
    assertEquals(true, HttpClients.shared.dispatcher.maxRequestsPerHost >= 16)
  }
}
