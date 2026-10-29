package expo.modules.streamdownloader

import android.os.StatFs
import java.io.File
import java.util.concurrent.atomic.AtomicInteger
import kotlin.coroutines.cancellation.CancellationException
import kotlin.math.abs
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

data class EnqueueSpec(
  val kind: String,
  val title: String,
  val sourceUrl: String,
  val seriesTitle: String? = null,
  val season: Int? = null,
  val episode: Int? = null,
  val episodeTitle: String? = null,
  val headers: Map<String, String> = emptyMap(),
  val audioLanguage: String? = null,
  val variantId: String? = null,
  val variantBandwidth: Long? = null,
  val variantResolution: String? = null,
  val subtitleUrl: String? = null,
  val posterUrl: String? = null,
  val pluginName: String? = null,
  val contentId: String? = null,
  val workers: Int? = null,
)

/** Metin (master/media/altyazı) çeken soyutlama; testlerde sahte. */
interface PlaylistFetching {
  suspend fun text(url: String, headers: Map<String, String>): String
}

/** Gerçek HTTP uyarlaması. */
class PlaylistFetcher : PlaylistFetching {
  override suspend fun text(url: String, headers: Map<String, String>): String = fetchText(url, headers)
}

interface StatePersisting {
  fun load(): MutableList<DownloadItem>
  fun save(items: List<DownloadItem>)
}

interface Notifying {
  fun notifyProgress(items: List<DownloadItem>)
  fun notifyCompleted(item: DownloadItem)
  fun notifyFailed(item: DownloadItem)
  /** Kalem silindiğinde (iptal) o kalemin ilerleme bildirimini kaldırır. */
  fun cancelProgress(item: DownloadItem) {}
}

class EncryptedContentException : RuntimeException("şifreli HLS desteklenmiyor")
class DiskFullException(val available: Long) : RuntimeException("disk alanı yetersiz")
class MergeFailedException(message: String) : RuntimeException(message)

/**
 * Kuyruk ve iş akışı: `queued → downloading → merging → completed/failed`.
 * `state.json` tek gerçek kaynaktır; durum değişimZamanında anında yazılır, yalnızca
 * ilerlemeler ~1 Hz kısıtlanır. Kilitli alanlar `lock` ile korunur; iş gövdesinde
 * kilit tutulmaz.
 */
class DownloadEngine(
  /** Geçici segmentlerin kökü: `filesDir/stream-downloader`. */
  private val root: File,
  private val store: StatePersisting,
  private val playlists: PlaylistFetching,
  val fetcher: SegmentFetching,
  private val merger: Merging,
  private val publisher: Publishing,
  private val notifier: Notifying,
  private val scope: CoroutineScope,
  var maxConcurrent: Int = 2,
  private val workersPerDownload: Int = 6,
  private val availableBytes: (() -> Long)? = null,
) {
  private val lock = Any()
  private val items = LinkedHashMap<String, DownloadItem>()
  private val jobs = HashMap<String, Job>()
  private val doneSegments = HashMap<String, Int>()
  private val cumulativeBytes = HashMap<String, Long>()
  private val totalBytes = HashMap<String, Long>()
  /** Son 10 sn'nin (zaman, kümülatif bayt) örnekleri — gerçek anlık hız için. */
  private val hizPenceresi = HashMap<String, ArrayDeque<Pair<Long, Long>>>()
  /** Kalem bazlı AKTİF HTTP çağrıları: iptalde doğrudan kapatılır (ağ kesimi). */
  private val aktifCagirmalar = HashMap<String, MutableSet<okhttp3.Call>>()
  /** Şu an dışa aktarılan öğeler (çift tık çift kopya yapmasın). */
  private val exporting = HashSet<String>()
  /** Faz bazlı sayım: toplam boyut tahmininin kararlılığı için (Tur 14). */
  private val fazBayt = HashMap<String, HashMap<String, Long>>()
  private val fazDone = HashMap<String, HashMap<String, Int>>()
  private val fazToplam = HashMap<String, HashMap<String, Int>>()
  /** Faz hiç başlamadıysa kullanılacak öncül boyut (video: bant tahmini−ses; ses: 128kbps×süre). */
  private val fazOncul = HashMap<String, HashMap<String, Long>>()
  private val deltaBytes = HashMap<String, Long>()
  private val lastSpeedAt = HashMap<String, Long>()
  private var listener: ((List<DownloadItem>) -> Unit)? = null
  private var activeChangeListener: ((Boolean) -> Unit)? = null
  private var lastNotifyAt = 0L

  var notifyGapMs: Long = 1000L

  fun setListener(l: ((List<DownloadItem>) -> Unit)?) { listener = l }
  fun setActiveChangeListener(l: ((Boolean) -> Unit)?) { activeChangeListener = l }

  fun tempDir(id: String): File = File(root, id)

  fun getItem(id: String): DownloadItem? = synchronized(lock) { items[id] }

  /**
   * "Dışa aktar": indirilen dosyayı uygulama klasöründen
   * `Download/StreamPulse` altına taşır ve özel klasörden SİLER (çift kayıt olmaz).
   * @return yeni dosya yolu (export edilmişse aynı yol)
   */
  fun export(id: String): String? = synchronized(lock) {
    val item = items[id] ?: return null
    if (item.exported == true) return item.outputPath
    // Aynı öğe için ikinci export (çift tık) çift kopya oluşturur — engelle.
    if (!exporting.add(id)) return null
    try {
    // Zaten MediaStore'da (önceki sürümden kalan) kayıt: sadece işaretle.
    val mevcut = item.outputUri
    if (mevcut != null && mevcut.startsWith("content://")) {
      items[id] = item.copy(exported = true)
      persistNow()
      listener?.invoke(snapshot())
      return item.outputPath
    }
    val kaynak = item.outputPath?.let { File(it) } ?: return null
    if (!kaynak.exists()) return null
    // subtitleUri "file:///..." biçiminde; File() gerçek yol ister.
    val srt = item.subtitleUri?.removePrefix("file://")?.let { File(it) }?.takeIf { it.exists() }
    val published = publisher.publish(item, kaynak, srt)
    // Özel klasörden sil (dosya tek yerde durmalı).
    tempDir(id).deleteRecursively()
    items[id] = item.copy(
      outputUri = published.uri,
      outputPath = published.path,
      subtitleUri = published.subtitleUri,
      exported = true,
    )
    persistNow()
    // changed() kuyruk bildirimini de basar; dışa aktarma indirme değil,
    // "StreamPulse indiriyor" bildirimi sonsuza kadar kalıyordu.
    listener?.invoke(snapshot())
    published.path
    } finally {
      exporting.remove(id)
    }
  }

  /** Aynı bölüm/film için mevcut kayıt döner (tekrar kuyruk yok). */
  fun enqueue(spec: EnqueueSpec): String {
    val key = identityKey(spec)
    synchronized(lock) {
      items.values.firstOrNull { identityKey(it.toSpec()) == key }?.let { existing ->
        if (existing.status == DownloadStatus.FAILED) {
          items[existing.id] = existing.copy(status = DownloadStatus.QUEUED, error = null, errorCode = null)
          persistNow()
          pump()
        }
        return existing.id
      }
      val id = "dl_" + System.currentTimeMillis() + "_" + (100 + (Math.random() * 900).toInt())
      items[id] = DownloadItem(
        id = id,
        kind = spec.kind,
        title = spec.title,
        sourceUrl = spec.sourceUrl,
        seriesTitle = spec.seriesTitle,
        season = spec.season,
        episode = spec.episode,
        episodeTitle = spec.episodeTitle,
        headers = spec.headers,
        audioLanguage = spec.audioLanguage,
        variantId = spec.variantId,
        variantBandwidth = spec.variantBandwidth,
        variantResolution = spec.variantResolution,
        subtitleUrl = spec.subtitleUrl,
        posterUrl = spec.posterUrl,
        pluginName = spec.pluginName,
        contentId = spec.contentId,
        workers = spec.workers,
        status = DownloadStatus.QUEUED,
        createdAt = System.currentTimeMillis(),
      )
      persistNow()
      pump()
      return id
    }
  }

  fun pause(id: String) = synchronized(lock) {
    val item = items[id] ?: return@synchronized
    val st = item.status
    if (st == DownloadStatus.DOWNLOADING || st == DownloadStatus.MERGING) {
      jobs[id]?.cancel()
      jobs.remove(id)
      items[id] = item.copy(status = DownloadStatus.PAUSED, speedBps = 0)
      persistNow()
      changed(true)
    }
  }

  fun resume(id: String) = synchronized(lock) {
    val item = items[id] ?: return@synchronized
    if (item.status == DownloadStatus.PAUSED) {
      items[id] = item.copy(status = DownloadStatus.QUEUED)
      persistNow()
      pump()
    }
  }

  /** İptal: kayıt tamamen silinir, geçici klasör silinir (madde 10). */
  fun cancel(id: String) = synchronized(lock) {
    val job = jobs.remove(id)
    // AĞ KESİMİ: iptalde bekleyen HTTP çağrıları doğrudan kapatılır.
    // (coroutine iptali tek başına yeterli olmayabiliyor: istek zaten
    // akışa geçmiş olabiliyor).
    val cagrilar = aktifCagirmalar.remove(id)
    cagrilar?.forEach { runCatching { it.cancel() } }
    android.util.Log.e("SPD", "iptal: id=$id isBulundu=${job != null} cagri=${cagrilar?.size ?: 0}")
    job?.cancel()
    // Kalem listeden çıkacağı için bildirimi BURADA kaldırmak zorundayız
    // (notifyProgress yalnızca hâlâ listedeki kalemleri temizler).
    items.remove(id)?.let { notifier.cancelProgress(it) }
    tempDir(id).deleteRecursively()
    fazBayt.remove(id); fazDone.remove(id); fazToplam.remove(id); fazOncul.remove(id); hizPenceresi.remove(id)
    persistNow()
    changed(true)
    activeChangeListener?.invoke(hasActiveLocked())
  }

  /** Tamamlanmış (veya başarısız) kaydı ve dosyalarını/harflerini siler. */
  fun remove(id: String) = synchronized(lock) {
    val item = items.remove(id)
    item?.let {
      notifier.cancelProgress(it)
      publisher.delete(item.publishedResult())
    }
    if (item?.status == DownloadStatus.FAILED) tempDir(id).deleteRecursively()
    fazBayt.remove(id); fazDone.remove(id); fazToplam.remove(id); fazOncul.remove(id); hizPenceresi.remove(id)
    persistNow()
    changed(true)
    activeChangeListener?.invoke(hasActiveLocked())
  }

  fun pauseAll() {
    snapshot().filter { it.status == DownloadStatus.DOWNLOADING || it.status == DownloadStatus.MERGING || it.status == DownloadStatus.PUBLISHING }
      .forEach { pause(it.id) }
  }

  fun resumeAll() {
    snapshot().filter { it.status == DownloadStatus.PAUSED }.forEach { resume(it.id) }
  }

  fun snapshot(): List<DownloadItem> = synchronized(lock) { items.values.toList() }

  /** Süreç yeniden başladı: state.json kayıtlarını durumlarıyla birlikte yükle. */
  fun restore(loaded: List<DownloadItem>) = synchronized(lock) {
    loaded.forEach { items[it.id] = it }
  }

  /** Android 15 `dataSync` 6 saat limiti: tüm indirmeleri duraklat. */
  fun onTimeout() {
    pauseAll()
  }

  private fun hasActiveLocked(): Boolean = items.values.any {
    it.status == DownloadStatus.DOWNLOADING ||
      it.status == DownloadStatus.MERGING ||
      it.status == DownloadStatus.PUBLISHING
  }

  /** Açılışta yarım kalan (kapanmadan önce indiriliyor olan) kayıtları yeniden başlatır. */
  fun resumeQueued() = synchronized(lock) { pump() }

  /** Es zamanli indirme limiti (ayar: maxConcurrentDownloads). */
  fun setMaxConcurrent(n: Int) = synchronized(lock) {
    maxConcurrent = n.coerceIn(1, 10)
    pump()
  }

  private fun pump() = synchronized(lock) {
    var slots = maxConcurrent - jobs.size
    for (entry in items.entries) {
      if (slots <= 0) break
      val item = entry.value
      if (item.status != DownloadStatus.QUEUED || jobs.containsKey(item.id)) continue
      doneSegments[item.id] = 0
      deltaBytes[item.id] = 0
      cumulativeBytes[item.id] = item.downloadedBytes
      hizPenceresi[item.id]?.clear()
      lastSpeedAt[item.id] = System.currentTimeMillis()
      items[item.id] = item.copy(status = DownloadStatus.DOWNLOADING)
      persistNow()
      jobs[item.id] = scope.launch { runItem(item.id) }
      slots--
    }
    changed(true)
    activeChangeListener?.invoke(hasActiveLocked())
  }

  private suspend fun runItem(id: String) {
    try {
      val item = synchronized(lock) { items[id] } ?: return
      val dir = tempDir(id).apply { mkdirs() }

      // 0) Doğrudan dosya (progressive MP4): HLS değil → tek dosya indir.
      //    IDM'in yaptığı yol: ~8 istek, ses/segment kuyruğu ve 429 yok.
      if (DirectFileFetcher.isDirect(item.sourceUrl)) {
        dogrudanDosyaIndir(id, item, dir)
        return
      }

      // 1) Master ve media oynat listeleri
      val masterText = playlists.text(item.sourceUrl, item.headers)
      val master = if (masterText.contains("#EXT-X-STREAM-INF")) {
        HlsPlanner.parseMaster(masterText, item.sourceUrl)
      } else {
        MasterPlaylist(emptyList(), emptyList())
      }
      val variant = pickVariant(master.variants, item)
      val videoUrl = variant?.url ?: item.sourceUrl
      // Otomatik kalitede motorun SEÇTİĞİ varyant kayda yazılır: bildirim
      // başlığında "(1920x804)" görünsün (CloudStream biçimi).
      if (variant != null) {
        synchronized(lock) {
          items[id]?.let {
            items[id] = it.copy(
              variantId = variant.id,
              variantBandwidth = variant.bandwidth,
              variantResolution = variant.resolution,
            )
          }
        }
      }
      val audioTrack = pickAudio(master.audioTracks, item)

      val videoPlaylist = HlsPlanner.parseMedia(playlists.text(videoUrl, item.headers), videoUrl)
      if (videoPlaylist.encrypted) throw EncryptedContentException()
      // Ses playlist şifreliyse yalnızca video alınır.
      val audioPlaylist = audioTrack?.let {
        HlsPlanner.parseMedia(playlists.text(it.url, item.headers), it.url)
      }?.takeIf { !it.encrypted }

      // 2) Disk alanı (madde: başlamadan 2.5× boş alan)
      val audioDurSec = audioPlaylist?.segments?.sumOf { it.durationSec } ?: 0.0
      val totalDurationSec = videoPlaylist.segments.sumOf { it.durationSec } + audioDurSec
      val estimate = StorageCheck.estimateBytes(
        item.variantBandwidth ?: maxOf(variant?.bandwidth ?: 0L, 2_000_000L),
        totalDurationSec,
      )
      val avail = availableBytes?.invoke() ?: StatFs(root.absolutePath).availableBytes
      if (!StorageCheck.hasRoom(avail, estimate)) throw DiskFullException(avail)
      // Bildirimde "X / Y MB" için toplam (tahmin) kaydı.
      synchronized(lock) {
        items[id]?.let { items[id] = it.copy(totalBytes = estimate) }
        totalBytes[id] = estimate
      }

      // 3) Segment indirme (tek fetchAll çağrısı; paralel worker içinden)
      val mediaJobs = jobsFor(videoPlaylist, prefix = "v")
      val audioJobs = audioPlaylist?.let { jobsFor(it, prefix = "a") } ?: emptyList()
      val allJobs = mediaJobs + audioJobs
      // Kaldığı yerden devam: diskte tamamlanmış segmentler zaten sayılır
      // (yüzde ve indirilen bayt doğru başlasın — CloudStream davranışı).
      val mevcut = allJobs.filter { File(dir, it.fileName).exists() }
      // Faz sayacı tohumu: video (~3-5MB) ve ses (~0.3MB) segment boyutları
      // birbirinden çok farklı; TEK cum×toplam/done tahmini video fazında
      // ŞİŞİYOR, ses fazında ÇÖKÜYORDU (4.5GB→2.4GB şikayeti). Faz başına
      // ayrı tahmin kararlı; başlamayan faz için öncül kullanılır.
      val sesOncul = (128_000L / 8) * audioDurSec.toLong() // ~128 kbps AAC
      val vDisk = mevcut.take(mediaJobs.size)
      val aDisk = mevcut.drop(mediaJobs.size)
      synchronized(lock) {
        doneSegments[id] = mevcut.size
        cumulativeBytes[id] = mevcut.sumOf { File(dir, it.fileName).length() }
        fazToplam[id] = hashMapOf("video" to mediaJobs.size, "audio" to audioJobs.size)
        fazBayt[id] = hashMapOf(
          "video" to vDisk.sumOf { File(dir, it.fileName).length() },
          "audio" to aDisk.sumOf { File(dir, it.fileName).length() },
        )
        fazDone[id] = hashMapOf("video" to vDisk.size, "audio" to aDisk.size)
        fazOncul[id] = hashMapOf(
          "video" to (estimate - sesOncul).coerceAtLeast(0L),
          "audio" to sesOncul,
        )
      }
      val cagrilar = aktifCagirmalar.getOrPut(id) { java.util.Collections.synchronizedSet(mutableSetOf<okhttp3.Call>()) }
      val onVideo = { bytes: Long, segDone: Int -> contributeProgress(id, bytes, segDone, allJobs.size, "video", mediaJobs.size) }
      val onAudio = { bytes: Long, segDone: Int -> contributeProgress(id, bytes, segDone, allJobs.size, "audio", audioJobs.size) }
      val refresh: suspend () -> Map<String, Segment>? = { refreshUrls(item, master, videoUrl, audioTrack) }
      val isci = item.workers ?: workersPerDownload
      // Sıralı fazlar (CloudStream tek mux'lu akışına en yakın düzen):
      // önce video, sonra ses — ses istekleri kendi taze penceresinde alır,
      // video'yla yarışıp 429 kotasını birlikte yakmaz.
      fetcher.fetchAll(mediaJobs, dir, item.headers, isci, onVideo, refresh, cagrilar)
      if (audioJobs.isNotEmpty()) {
        fetcher.fetchAll(audioJobs, dir, item.headers, isci, onAudio, refresh, cagrilar)
      }
      setPhase(id, DownloadStatus.MERGING)

      // 4) Yerel oynat listeleri + `-c copy` birleştirme
      val videoFile = File(dir, "video.m3u8")
      LocalPlaylistWriter.write(videoFile, videoPlaylist, allJobs.take(mediaJobs.size).map { File(dir, it.fileName) })
      val audioFile = audioPlaylist?.let { ap ->
        File(dir, "audio.m3u8").also { f ->
          LocalPlaylistWriter.write(f, ap, allJobs.drop(mediaJobs.size).map { File(dir, it.fileName) })
        }
      }
      // Altyazı (varsa) yan dosya olarak yerel.
      // ⚠️ Altyazı OPSİYONEL: hata (429/403/ağ) indirmeyi düşürmemeli,
      // srt olmadan devam edilir (Task 16 bulgusu).
      var srtFile: File? = null
      if (item.subtitleUrl != null) {
        srtFile = runCatching {
          File(dir, "sub.srt").also { it.writeText(playlists.text(item.subtitleUrl, item.headers)) }
        }.onFailure {
          android.util.Log.w("SPD", "altyazı indirilemedi, atlanıyor: ${it.message}")
        }.getOrNull()
      }

      val outMp4 = File(dir, "out.mp4")
      val result = merger.merge(
        videoFile,
        audioFile,
        outMp4,
        onProgress = { sec -> mergeProgress(id, sec, totalDurationSec) },
      )
      if (!result.ok) throw MergeFailedException(result.errorMessage ?: "birleştirme başarısız")

      /*
       * 6) Dosya UYGULAMA KLASÖRÜNDE kalır (android/data/<paket>/files/...):
       *    izin gerektirmez, kullanıcı "Dışa aktar" dediğinde Download/StreamPulse'a
       *    taşınıp özel klasörden silinir (çift kayıt olmaz) — export() 📤.
       */
      val current = synchronized(lock) { items[id] } ?: return
      finish(id) { it.copy(
        status = DownloadStatus.COMPLETED,
        progress = 1.0,
        outputUri = outMp4.toURI().toString(),
        outputPath = outMp4.absolutePath,
        subtitleUri = srtFile?.toURI()?.toString(),
        exported = false,
        completedAt = System.currentTimeMillis(),
      )}
      notifier.notifyCompleted(getItem(id) ?: return)
    } catch (e: Exception) {
      if (e is CancellationException) return // pause() işini duraklatılmış işaretledi; dokunma
      failItem(id, e)
    } finally {
      android.util.Log.e("SPD", "is bitti: id=$id")
      synchronized(lock) { jobs.remove(id) }
      pump()
    }
  }

  private fun jobsFor(playlist: MediaPlaylist, prefix: String): List<SegmentJob> {
    var mediaIdx = 0
    return playlist.segments.map { seg ->
      val name = if (seg.isInit) "${prefix}_init.mp4" else "$prefix%05d.ts".format(mediaIdx++)
      SegmentJob(index = 0, segment = seg, fileName = name)
    }
  }

  /** 403/410: imzalı URL'ler yenilendi; dosya adı → yeni (aynı ad, taze URL) Segment. */
  private suspend fun refreshUrls(
    item: DownloadItem,
    master: MasterPlaylist,
    videoUrl: String,
    audioTrack: AudioTrack?,
  ): Map<String, Segment>? = runCatching {
    val map = HashMap<String, Segment>()
    val vUrl = (if (master.variants.isEmpty()) null else pickVariant(master.variants, item)?.url) ?: videoUrl
    val newVideo = HlsPlanner.parseMedia(playlists.text(vUrl, item.headers), vUrl)
    jobsFor(newVideo, "v").forEachIndexed { i, job -> map[job.fileName] = newVideo.segments[i] }
    audioTrack?.let {
      val newAudio = HlsPlanner.parseMedia(playlists.text(it.url, item.headers), it.url)
      jobsFor(newAudio, "a").forEachIndexed { i, job -> map[job.fileName] = newAudio.segments[i] }
    }
    map
  }.getOrNull()

  /** Doğrudan dosya (progressive MP4): tek dosya, paralel Range, ses/merge yok. */
  private suspend fun dogrudanDosyaIndir(id: String, item: DownloadItem, dir: File) {
    val hedef = File(dir, "direct.mp4")
    val fetcher = DirectFileFetcher()
    val (total, _) = fetcher.probe(item.sourceUrl, item.headers)
    if (total > 0) {
      synchronized(lock) {
        items[id]?.let { items[id] = it.copy(totalBytes = total) }
        totalBytes[id] = total
        cumulativeBytes[id] = 0L
        hizPenceresi[id]?.clear()
      }
    }
    // Progressive MP4: tek dosya, kuyruk tabanlı küçük Range parçaları.
    // Segment yolu gibi CDN kota kapisi TAMPONLANMADIGI icin baglanti sayisi
    // artirilabilir; baglanti basina CDN ~0,5 MB/s sinirli oldugundan tum
    // baglantilar son parcaya kadar dolu tutulur.
    // Bağlantı sayısı ayardan gelir (varsayılan 6, max 16).
    val isci = (item.workers ?: workersPerDownload).coerceIn(1, 16)
    val cagrilar = aktifCagirmalar.getOrPut(id) { java.util.Collections.synchronizedSet(mutableSetOf<okhttp3.Call>()) }
    fetcher.download(
      item.sourceUrl,
      hedef,
      item.headers,
      isci,
      onProgress = { bytes, tot -> contributeBytes(id, bytes, tot) },
      calls = cagrilar,
      resumeFile = File(dir, "chunks.done"),
    )
    // Altyazı (varsa) yan dosya olarak yerel — opsiyonel, hata indirmeyi düşürmez.
    var srtFile: File? = null
    if (item.subtitleUrl != null) {
      srtFile = runCatching {
        File(dir, "sub.srt").also { it.writeText(playlists.text(item.subtitleUrl, item.headers)) }
      }.onFailure {
        android.util.Log.w("SPD", "altyazı indirilemedi, atlanıyor: ${it.message}")
      }.getOrNull()
    }
    val current = synchronized(lock) { items[id] } ?: return
    // Dosya uygulama klasöründe kalır; "Dışa aktar" ile Download/StreamPulse'a taşınır.
    finish(id) { it.copy(
      status = DownloadStatus.COMPLETED,
      progress = 1.0,
      outputUri = hedef.toURI().toString(),
      outputPath = hedef.absolutePath,
      subtitleUri = srtFile?.toURI()?.toString(),
      exported = false,
      completedAt = System.currentTimeMillis(),
    )}
    notifier.notifyCompleted(getItem(id) ?: return)
  }

  /** Doğrudan dosya ilerlemesi (bayt tabanlı). */
  private fun contributeBytes(id: String, bytes: Long, total: Long) {
    synchronized(lock) {
      val item = items[id] ?: return@synchronized
      cumulativeBytes[id] = bytes
      val now = System.currentTimeMillis()
      val pencere = hizPenceresi.getOrPut(id) { ArrayDeque() }
      pencere.addLast(now to bytes)
      while (pencere.isNotEmpty() && now - pencere.first().first > 10_000L) pencere.removeFirst()
      val ilkk = pencere.first()
      val sonk = pencere.last()
      val dt = sonk.first - ilkk.first
      val gercHiz = when {
        dt >= 2_000L -> ((sonk.second - ilkk.second) * 1000L / dt)
        now - sonk.first > 5_000L -> 0L
        else -> item.speedBps
      }
      items[id] = item.copy(
        progress = if (total > 0) (bytes.toDouble() / total).coerceIn(0.0, 1.0) else item.progress,
        downloadedBytes = bytes,
        totalBytes = if (total > 0) total else item.totalBytes,
        speedBps = gercHiz,
      )
      changed(false)
    }
  }

  private fun contributeProgress(
    id: String,
    bytes: Long,
    segDone: Int,
    total: Int,
    faz: String,
    fazTop: Int,
  ) {
    synchronized(lock) {
      val item = items[id] ?: return@synchronized
      if (segDone > 0) doneSegments[id] = (doneSegments[id] ?: 0) + segDone
      deltaBytes[id] = (deltaBytes[id] ?: 0L) + bytes
      // Kümülatif indirilen bayt — bildirimde "X / Y MB" için.
      cumulativeBytes[id] = (cumulativeBytes[id] ?: item.downloadedBytes) + bytes
      // Faz bazlı sayım (toplam tahminin kararlılığı için).
      val fzB = fazBayt.getOrPut(id) { hashMapOf() }
      fzB[faz] = (fzB[faz] ?: 0L) + bytes
      if (segDone > 0) {
        val fzD = fazDone.getOrPut(id) { hashMapOf() }
        fzD[faz] = (fzD[faz] ?: 0) + segDone
      }
      fazToplam.getOrPut(id) { hashMapOf() }[faz] = fazTop
      val now = System.currentTimeMillis()
      val started = lastSpeedAt[id] ?: now
      var refreshed = item
      val elapsed = now - started
      if (elapsed >= 1000) {
        deltaBytes[id] = 0L
        lastSpeedAt[id] = now
      }
      // GERÇEK anlık hız: son 10 sn'nin bayt farkı (EMA'nın 429'larda
      // bayat kalmaması için — telefonun kendi hız hesabıyla tutarlı).
      val cum = cumulativeBytes[id] ?: refreshed.downloadedBytes
      val pencere = hizPenceresi.getOrPut(id) { ArrayDeque() }
      pencere.addLast(now to cum)
      while (pencere.isNotEmpty() && now - pencere.first().first > 10_000L) pencere.removeFirst()
      val ilkk = pencere.first()
      val sonk = pencere.last()
      val dt = sonk.first - ilkk.first
      // Kayıt gelmezse hız YOK demektir: bayat değeri asılı bırakma (gerçek 0).
      val gercHiz = when {
        dt >= 2_000L -> ((sonk.second - ilkk.second) * 1000L / dt)
        now - sonk.first > 5_000L -> 0L
        else -> refreshed.speedBps
      }
      val done = doneSegments[id] ?: 0
      val frac = if (total > 0) done.toDouble() / total else 0.0
      // Toplam boyut: faz bazlı tahmin. Her faz kendi içinde üniform segment
      // boyutuna sahip olduğundan cum×(toplam/biten) KARARLI çıkar; faz
      // bitince gerçek toplam donar. Bitmemiş faz için öncül (128 kbps×süre)
      // kullanılır — 4.5GB→2.4GB küçülmesi buydu.
      fun fazTahmin(f: String): Long {
        val t = fazToplam[id]?.get(f) ?: 0
        if (t == 0) return 0L
        val d = fazDone[id]?.get(f) ?: 0
        val b = fazBayt[id]?.get(f) ?: 0L
        if (d >= t) return b // faz tamam: gerçek boyut
        if (d == 0) return fazOncul[id]?.get(f) ?: 0L // başlamadı: öncül
        return b * t / d
      }
      val toplamTahmin = fazTahmin("video") + fazTahmin("audio")
      totalBytes[id] = toplamTahmin
      items[id] = refreshed.copy(
        progress = frac.coerceIn(0.0, 1.0),
        downloadedBytes = cum,
        totalBytes = toplamTahmin,
        speedBps = gercHiz,
      )
      changed(false)
    }
  }

  private fun mergeProgress(id: String, processedSec: Double, totalSec: Double) {
    synchronized(lock) {
      val item = items[id] ?: return@synchronized
      val frac = if (totalSec > 0) (processedSec / totalSec).coerceIn(0.0, 1.0) else 0.0
      items[id] = item.copy(progress = frac)
      changed(false)
    }
  }

  private fun setPhase(id: String, phase: DownloadStatus) = synchronized(lock) {
    val item = items[id] ?: return@synchronized
    items[id] = item.copy(status = phase)
    persistNow()
    changed(true)
  }

  private fun finish(id: String, modify: (DownloadItem) -> DownloadItem) = synchronized(lock) {
    val item = items[id] ?: return@synchronized
    items[id] = modify(item)
    persistNow()
    changed(true)
  }

  private fun failItem(id: String, error: Exception) {
    val code = when (error) {
      is EncryptedContentException -> "HLS_ENCRYPTED"
      is DiskFullException -> "DISK_FULL"
      is MergeFailedException -> "MERGE_FAILED"
      is HttpStatusException -> "HTTP_ERROR"
      else -> "NETWORK_LOST"
    }
    val finished = synchronized(lock) {
      val existing = items[id] ?: return@synchronized null
      val item = existing.copy(
        status = DownloadStatus.FAILED,
        error = error.message ?: "bilinmeyen hata",
        errorCode = code,
        speedBps = 0,
      )
      items[id] = item
      persistNow()
      item
    }
    finished?.let { notifier.notifyFailed(it); changed(true) }
  }

  private fun persistNow() = synchronized(lock) { store.save(items.values.toList()) }

  private fun changed(force: Boolean) {
    val now = System.currentTimeMillis()
    if (!force && now - lastNotifyAt < notifyGapMs) return
    lastNotifyAt = now
    val snap = snapshot()
    listener?.invoke(snap)
    // İlerleme bildirimleri: ~1 Hz kısıtlı bu kanaldan (her aktif indirme
    // ayrı, ayrıntılı bildirim — CloudStream davranışı).
    notifier.notifyProgress(snap)
  }

  private fun identityKey(spec: EnqueueSpec): String =
    if (spec.kind == "episode" && spec.season != null && spec.episode != null) {
      "E:${spec.seriesTitle ?: spec.title}|${spec.season}|${spec.episode}"
    } else {
      "M:${spec.sourceUrl}"
    }

  /** Kayıtlı kalite yoksa: tam id → en yakın bant genişliği → en yüksek. */
  private fun pickVariant(variants: List<Variant>, item: DownloadItem): Variant? {
    if (variants.isEmpty()) return null
    item.variantId?.let { wanted -> variants.firstOrNull { it.id == wanted }?.let { return it } }
    item.variantBandwidth?.takeIf { it > 0 }?.let { bw ->
      variants.minByOrNull { abs(it.bandwidth - bw) }?.let { return it }
    }
    return variants.maxByOrNull { it.bandwidth }
  }

  private fun pickAudio(tracks: List<AudioTrack>, item: DownloadItem): AudioTrack? {
    if (tracks.isEmpty()) return null
    return item.audioLanguage?.lowercase()?.let { w -> tracks.firstOrNull { it.language == w } }
      ?: tracks.firstOrNull { it.isDefault }
      ?: tracks.first()
  }
}

private fun DownloadItem.toSpec() = EnqueueSpec(
  kind = kind,
  title = title,
  sourceUrl = sourceUrl,
  seriesTitle = seriesTitle,
  season = season,
  episode = episode,
  episodeTitle = episodeTitle,
  headers = headers,
  audioLanguage = audioLanguage,
  variantId = variantId,
  variantBandwidth = variantBandwidth,
  variantResolution = variantResolution,
  subtitleUrl = subtitleUrl,
  posterUrl = posterUrl,
  pluginName = pluginName,
  contentId = contentId,
  workers = workers,
)

private fun DownloadItem.publishedResult(): PublishResult {
  val uri = outputUri ?: return PublishResult("", null)
  return PublishResult(uri = uri, path = outputPath, subtitleUri = subtitleUri)
}


