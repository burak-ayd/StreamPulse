package expo.modules.streamdownloader

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import okhttp3.OkHttpClient
import java.io.File
import java.io.IOException
import kotlin.coroutines.cancellation.CancellationException

data class SegmentJob(val index: Int, val segment: Segment, val fileName: String)

interface SegmentFetching {
  /**
   * Eksik segmentleri indirir. [onProgress] (eklenen bayt, biten segment sayısı).
   * 403/410 gelirse [refreshOnExpired] bir kez çağrılır; dönen haritadan (dosya adı → segment)
   * yeni URL alınır.
   */
  suspend fun fetchAll(
    jobs: List<SegmentJob>,
    dir: File,
    headers: Map<String, String>,
    workers: Int,
    onProgress: (bytesAdded: Long, segmentsDone: Int) -> Unit,
    refreshOnExpired: suspend () -> Map<String, Segment>?,
    /** Iptal aninda dogrudan kapatilacak HTTP cagrilari (ag kesimi icin). */
    calls: MutableSet<okhttp3.Call>? = null,
  )
}

class SegmentFetcher(
  private val client: OkHttpClient = HttpClients.shared,
  private val backoffMs: (attempt: Int) -> Long = { 1000L shl it },
) : SegmentFetching {

  private class ExpiredUrl : IOException("imzalı URL süresi doldu")
  /** 429/503: CDN hız sınırı — uzun beklemeyle yeniden denenir. */
  private class Throttled(val code: Int) : IOException("HTTP $code")

  override suspend fun fetchAll(
    jobs: List<SegmentJob>,
    dir: File,
    headers: Map<String, String>,
    workers: Int,
    onProgress: (bytesAdded: Long, segmentsDone: Int) -> Unit,
    refreshOnExpired: suspend () -> Map<String, Segment>?,
    calls: MutableSet<okhttp3.Call>?,
  ) {
    val semaphore = Semaphore(workers.coerceAtLeast(1))
    coroutineScope {
      jobs.filter { !File(dir, it.fileName).exists() }
        .map { job ->
          async(Dispatchers.IO) {
            semaphore.withPermit { fetchOne(job, dir, headers, onProgress, refreshOnExpired, calls) }
          }
        }
        .awaitAll()
    }
  }

  private suspend fun fetchOne(
    job: SegmentJob,
    dir: File,
    headers: Map<String, String>,
    onProgress: (Long, Int) -> Unit,
    refresh: suspend () -> Map<String, Segment>?,
    calls: MutableSet<okhttp3.Call>?,
  ) {
    var url = job.segment.url
    var refreshed = false
    var attempt = 0
    while (true) {
      try {
        download(url, job.fileName, dir, headers, onProgress, calls)
        return
      } catch (e: ExpiredUrl) {
        if (refreshed) throw e
        refreshed = true
        val fresh = refresh() ?: throw e
        url = fresh[job.fileName]?.url ?: throw e
      } catch (e: CancellationException) {
        android.util.Log.e("SPD", "segment iptal: ${job.fileName}")
        throw e
      } catch (e: Throttled) {
        // 429/503: CDN kotası. YENİLEME (refresh) YOK — kota penceresinde
        // playlist yeniden çağırmak ek 429 üretiyordu (log kanıtı); CloudStream
        // de akış sırasında URL yenilemez. Yalnız 403/410'da yenilenir.
        if (attempt >= THROTTLE_ATTEMPTS - 1) throw e
        val bekle = THROTTLE_BASE_MS shl attempt // 3s, 6s, 12s, 24s
        android.util.Log.w("SPD", "segment ${job.fileName}: HTTP ${e.code} — ${bekle} ms sonra yeniden")
        delay(bekle)
        attempt++
      } catch (e: IOException) {
        if (attempt >= ATTEMPTS - 1) throw e
        delay(backoffMs(attempt))
        attempt++
      }
    }
  }

  /** Önce `.part` yazılır, bitince adı değişir; yarım segment asla "tamam" sayılmaz. */
  private suspend fun download(
    url: String,
    fileName: String,
    dir: File,
    headers: Map<String, String>,
    onProgress: (Long, Int) -> Unit,
    calls: MutableSet<okhttp3.Call>?,
  ) {
    // Tempo kapısı: 800ms taban (deney kanıtı: temposuz 8 worker CDN kotasını
    // yakıyor). Retry-After varsa kota süresine uyulur.
    val host = ThrottleGate.hostOf(url)
    ThrottleGate.gate(host)
    val call = client.newCall(buildRequest(url, headers))
    calls?.add(call)
    try {
      call.await().use { r ->
        if (r.code == 403 || r.code == 410) throw ExpiredUrl()
        if (r.code == 429 || r.code == 503) {
          ThrottleGate.noteThrottled(host, r.header("Retry-After")?.trim()?.toLongOrNull() ?: 0L)
          throw Throttled(r.code)
        }
        if (!r.isSuccessful) throw HttpStatusException(r.code)
        val body = r.body ?: throw IOException("boş yanıt")
        val part = File(dir, "$fileName.part")
        val target = File(dir, fileName)
        var yazilan = 0L
        body.byteStream().use { input ->
          part.outputStream().use { out ->
            val buf = ByteArray(BUFFER_BYTES)
            while (true) {
              currentCoroutineContext().ensureActive()
              val n = input.read(buf)
              if (n < 0) break
              out.write(buf, 0, n)
              yazilan += n
            }
          }
        }
        if (!part.renameTo(target)) {
          target.delete()
          part.renameTo(target)
        }
        // Boyut sayacı COMMİT tabanlı: kayda geçen segmentin gerçek baytı
        // eklenir (CloudStream davranışı). Akış içi sayım, yeniden denenen
        // yarım segmentleri ÇİFTE sayarak toplam boyutu şişiriyordu.
        onProgress(yazilan, 1)
      }
    } finally {
      calls?.remove(call)
    }
  }

  companion object {
    private const val ATTEMPTS = 4
    /** 429/503: 2s→4→8→16→32 (~62s toplam) — CloudStream tarzı kısa backoff. */
    private const val THROTTLE_ATTEMPTS = 10
    private const val THROTTLE_BASE_MS = 3000L
    private const val BUFFER_BYTES = 64 * 1024
  }
}
