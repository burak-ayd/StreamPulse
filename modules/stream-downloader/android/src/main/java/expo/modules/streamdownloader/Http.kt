package expo.modules.streamdownloader

import okhttp3.Call
import okhttp3.Callback
import okhttp3.ConnectionPool
import okhttp3.Dispatcher
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.delay

/** Tüm indirmelerin paylaştığı istemci: bağlantı havuzu yeniden kullanılır. */
object HttpClients {
  val shared: OkHttpClient by lazy {
    OkHttpClient.Builder()
      .connectTimeout(20, TimeUnit.SECONDS)
      .readTimeout(20, TimeUnit.SECONDS)
      .connectionPool(ConnectionPool(16, 5, TimeUnit.MINUTES))
      // OkHttp varsayılanı host başına 5 eşzamanlı istek: 6+ paralel Range
      // parçasında fazlası sıraya girip indirmeyi ~2 katına çıkarıyordu.
      .dispatcher(Dispatcher().apply {
        maxRequests = 64
        maxRequestsPerHost = 32
      })
      .build()
  }
}

class HttpStatusException(val code: Int) : IOException("HTTP $code")

/** OkHttp çağrısını askıya alan koroutine dönüştürür; iptal çağrıyı da iptal eder. */
suspend fun Call.await(): Response = suspendCancellableCoroutine { cont ->
  cont.invokeOnCancellation { cancel() }
  enqueue(object : Callback {
    override fun onFailure(call: Call, e: IOException) {
      if (cont.isActive) cont.resumeWithException(e)
    }

    override fun onResponse(call: Call, response: Response) {
      if (cont.isActive) cont.resume(response) else response.close()
    }
  })
}

fun buildRequest(url: String, headers: Map<String, String>): Request {
  val b = Request.Builder().url(url)
  headers.forEach { (k, v) -> b.header(k, v) }
  return b.build()
}

/** Sunucu (host) başına istek tempo kapısı (atomik).
 *
 *  Neden host'a göre: 2026-10-27 ölçüm — rapidrame CDN istek baskısını
 *  cezalandırıyor (429 + dakikalarca ceza), ama Hetzner/superonline gibi
 *  OTHERS sunucular kotasız (sıfır 429). Global tek kapı, kotasız sunucuları
 *  da 800 ms'ye kilitliyordu (tablet ölçümü: 0.9 MB/s). Artık her host kendi
 *  aralığını tutar: ceza alan host yavaşlar, diğerleri hızlı kalır.
 *
 *  - 429 → o host'un aralığı ×2 (tavan 30s); Retry-After'a uyulur.
 *  - 429 yoksa her 15 sn'de o host'un aralığı yarıya iner. */
internal object ThrottleGate {
  private const val GAP_MAX_MS = 30_000L
  /** Taban: 200 ms (~5 istek/sn). Kotalı sunucu 429 alınca kendi hızını
   *  düşürür; kotasız sunucu bu hızda tam hızda akar. */
  private const val GAP_MIN_MS = 200L
  private const val RECOVERY_MS = 15_000L

  private class HostState {
    val gap = java.util.concurrent.atomic.AtomicLong(GAP_MIN_MS)
    val nextSlotAt = java.util.concurrent.atomic.AtomicLong(0L)
    val lastThrottleAt = java.util.concurrent.atomic.AtomicLong(0L)
    val lastRecoveryAt = java.util.concurrent.atomic.AtomicLong(0L)
  }

  private val hosts = java.util.concurrent.ConcurrentHashMap<String, HostState>()

  private fun state(host: String): HostState =
    hosts.getOrPut(host.lowercase()) { HostState() }

  /** URL'den host anahtarı. */
  fun hostOf(url: String): String =
    try {
      java.net.URI(url).host ?: url.lowercase()
    } catch (_: Exception) {
      url.lowercase()
    }

  fun noteThrottled(host: String, retryAfterMs: Long = 0L) {
    val s = state(host)
    s.lastThrottleAt.set(System.currentTimeMillis())
    s.gap.updateAndGet { (it * 2).coerceIn(GAP_MIN_MS, GAP_MAX_MS) }
    if (retryAfterMs > 0) hold(s, retryAfterMs)
  }

  /** Sunucunun `Retry-After` süresi (ms): sıradaki yuvayı en az bu kadar ertele. */
  private fun hold(s: HostState, ms: Long) {
    val hedef = System.currentTimeMillis() + ms.coerceIn(0L, GAP_MAX_MS)
    while (true) {
      val t = s.nextSlotAt.get()
      if (t >= hedef || s.nextSlotAt.compareAndSet(t, hedef)) return
    }
  }

  /** İstekten önce çağrılır: sıradaki boş yuvayı atomik kapar (yarış yok),
   *  yuva gelecekteyse bekler. */
  suspend fun gate(host: String) {
    val s = state(host)
    val now = System.currentTimeMillis()
    if (now - s.lastThrottleAt.get() >= RECOVERY_MS &&
      now - s.lastRecoveryAt.get() >= RECOVERY_MS
    ) {
      s.lastRecoveryAt.set(now)
      s.gap.updateAndGet { (it / 2).coerceAtLeast(GAP_MIN_MS) }
    }
    while (true) {
      val slot = s.nextSlotAt.get()
      val basla = maxOf(slot, now)
      if (s.nextSlotAt.compareAndSet(slot, basla + s.gap.get())) {
        val bekle = basla - now
        if (bekle > 0) delay(bekle)
        return
      }
    }
  }
}

/** Metin playlist'i indirir (master/media/altyazı). Hata durumunda [HttpStatusException].
 *  429/503 gelirse segment-bağımsız sabit gecikmeli retry (CloudStream tarzı). */
suspend fun fetchText(url: String, headers: Map<String, String>): String {
  var attempt = 0
  while (true) {
    try {
      val host = ThrottleGate.hostOf(url)
      ThrottleGate.gate(host)
      return HttpClients.shared.newCall(buildRequest(url, headers)).await().use { r ->
        if ((r.code == 429 || r.code == 503) && attempt < 3) {
          android.util.Log.w("SPD", "playlist HTTP ${r.code} — ${PLAYLIST_RETRY_MS[attempt]}ms sonra yeniden")
          ThrottleGate.noteThrottled(host, r.header("Retry-After")?.trim()?.toLongOrNull() ?: 0L)
          throw ThrottleRetry()
        }
        if (!r.isSuccessful) throw HttpStatusException(r.code)
        r.body?.string() ?: ""
      }
    } catch (e: ThrottleRetry) {
      delay(PLAYLIST_RETRY_MS[attempt])
      attempt++
    }
  }
}

private class ThrottleRetry : IOException("throttled")

/** Playlist retry gecikmeleri: sabit 3s → 5s → 10s (CloudStream tarzı kısa bekleme). */
private val PLAYLIST_RETRY_MS = longArrayOf(3_000L, 5_000L, 10_000L)
