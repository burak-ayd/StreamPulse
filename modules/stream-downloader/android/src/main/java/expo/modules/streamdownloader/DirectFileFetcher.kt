package expo.modules.streamdownloader

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.IOException
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicLong

/**
 * Tek dosyalık (progressive) kaynak indirici — IDM tarzı paralel Range.
 *
 * HLS yerine kullanılır: 1150 segment isteği + ses fazı + 429 kuyruğu yerine
 * ~8 istek ve TEK dosya. CehennemPass/Rapidrame progressive MP4'ı Range
 * destekliyor (206 Partial Content) ve CDN'in segment kota cezasına girmez.
 */
class DirectFileFetcher(private val client: OkHttpClient = HttpClients.shared) {

  /** Boyut + Range desteği. Range desteklenmiyorsa total bilinmeyebilir (-1). */
  suspend fun probe(url: String, headers: Map<String, String>): Pair<Long, Boolean> =
    runCatching {
      val req = Request.Builder().url(url)
        .apply { headers.forEach { (k, v) -> header(k, v) } }
        .header("Range", "bytes=0-0")
        .build()
      client.newCall(req).await().use { r ->
        val cr = r.header("Content-Range")
        val total = cr?.substringAfterLast('/')?.trim()?.toLongOrNull()
          ?: r.body?.contentLength()?.takeIf { it > 0 }
          ?: -1L
        total to (cr != null)
      }
    }.getOrDefault((-1L) to false)

  /**
   * [parts] eş zamanlı bağlantı ile küçük Range parçalarını ortak kuyruktan
   * indirip [target]'a yazar. Parçalar eşit paylaştırılmaz: her bağlantı
   * kuyruktan yeni parça çeker, böylece sona kadar hepsi dolu kalır.
   * @param onProgress (yazılan bayt, toplam bayt)
   */
  suspend fun download(
    url: String,
    target: File,
    headers: Map<String, String>,
    parts: Int,
    onProgress: (bytes: Long, total: Long) -> Unit,
    /** Iptal aninda dogrudan kapatilacak HTTP cagrilari (ag kesimi icin). */
    calls: MutableSet<okhttp3.Call>? = null,
    /** Devam durumu: ilk satır toplam boyut, sonraki satırlar biten parça no. */
    resumeFile: File? = null,
  ) {
    val (total, rangeDestekli) = probe(url, headers)
    if (total <= 0) throw IOException("dosya boyutu alınamadı")
    val isci = parts.coerceIn(1, 16)
    // Küçük parça: bağlantı başına CDN ~0,5 MB/s sınırlıysa az sayıda büyük
    // parça sonlarda tek bağlantı bırakıp hızı KB/s'ye düşürüyordu.
    val parcaBoyu = if (rangeDestekli) {
      (total / (isci * 4)).coerceIn(1L shl 20, 8L shl 20)
    } else total
    val parcaSayisi = if (rangeDestekli) ((total + parcaBoyu - 1) / parcaBoyu).toInt() else 1
    val yazilan = AtomicLong(0)
    target.parentFile?.mkdirs()
    // Kaldığı yerden devam: toplam boyut VE parça boyu aynıysa biten parçalar
    // atlanır (parça boyu değişirse indeksler farklı aralıkları gösterir).
    val onceki = resumeFile?.takeIf { it.exists() }?.readLines()?.filter { it.isNotBlank() } ?: emptyList()
    val eskiBaslik = onceki.firstOrNull()?.trim()?.split(' ')?.mapNotNull { it.toLongOrNull() }
    val tamamlanan = if (eskiBaslik?.size == 2 && eskiBaslik[0] == total && eskiBaslik[1] == parcaBoyu) {
      onceki.drop(1).mapNotNull { it.trim().toIntOrNull() }.toSet()
    } else {
      emptySet()
    }
    val raf = RandomAccessFile(target, "rw")
    val resumeKilit = Any()
    try {
      raf.setLength(total)
      val kanal = raf.channel
      val siradaki = AtomicInteger(0)
      coroutineScope {
        List(isci) {
          async(Dispatchers.IO) {
            while (true) {
              val i = siradaki.getAndIncrement()
              if (i >= parcaSayisi) break
              val basla = i * parcaBoyu
              val bitis = minOf(basla + parcaBoyu, total) - 1
              if (i in tamamlanan) {
                // Bu parça önceki oturumda bitti: baytlar dosyada duruyor.
                yazilan.addAndGet(bitis - basla + 1)
                onProgress(yazilan.get(), total)
                continue
              }
              parcaCek(url, headers, kanal, basla, bitis, yazilan, total, onProgress, calls)
              // Parça bitti → devam durumuna yaz (süreç ölürse kaldığı yerden).
              runCatching {
                if (resumeFile != null) synchronized(resumeKilit) {
                  if (!resumeFile.exists()) resumeFile.writeText("$total $parcaBoyu\n")
                  resumeFile.appendText("$i\n")
                }
              }
            }
          }
        }.awaitAll()
      }
    } finally {
      raf.close()
    }
    if (yazilan.get() < total) throw IOException("eksik indirme: ${yazilan.get()}/$total")
  }

  private suspend fun parcaCek(
    url: String,
    headers: Map<String, String>,
    kanal: java.nio.channels.FileChannel,
    basla: Long,
    bitis: Long,
    yazilan: AtomicLong,
    toplam: Long,
    onProgress: (Long, Long) -> Unit,
    calls: MutableSet<okhttp3.Call>?,
  ) {
    var deneme = 0
    while (true) {
      try {
        val req = Request.Builder().url(url)
          .apply { headers.forEach { (k, v) -> header(k, v) } }
          .header("Range", "bytes=$basla-$bitis")
          .build()
        val call = client.newCall(req)
        calls?.add(call)
        try {
          call.await().use { r ->
            if (!r.isSuccessful) throw HttpStatusException(r.code)
            val body = r.body ?: throw IOException("boş yanıt")
            body.byteStream().use { input ->
              val buf = ByteArray(64 * 1024)
              var konum = basla
              while (true) {
                val n = input.read(buf)
                if (n < 0) break
                // FileChannel konumlu yazma thread-safe (paylaşılan imleç yok).
                kanal.write(ByteBuffer.wrap(buf, 0, n), konum)
                konum += n
                yazilan.addAndGet(n.toLong())
                onProgress(yazilan.get(), toplam)
              }
            }
          }
          return
        } finally {
          calls?.remove(call)
        }
      } catch (e: Exception) {
        if (e is kotlinx.coroutines.CancellationException) throw e
        if (deneme >= 3) throw IOException("parça indirilemedi ($basla-$bitis): ${e.message}")
        deneme++
        delay(1000L shl deneme)
      }
    }
  }

  companion object {
    /** URL doğrudan medya dosyasını mı gösteriyor (HLS playlist değil)? */
    fun isDirect(url: String): Boolean {
      val yol = url.substringBefore('?').lowercase()
      return yol.endsWith(".mp4") || yol.endsWith(".m4v") || yol.endsWith(".mkv") ||
        yol.endsWith(".mov") || yol.endsWith(".ts") || yol.endsWith(".webm")
    }
  }
}
