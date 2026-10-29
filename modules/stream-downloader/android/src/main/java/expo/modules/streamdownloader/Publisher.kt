package expo.modules.streamdownloader

import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import java.io.File

data class PublishResult(
  val uri: String,
  val path: String?,
  val subtitleUri: String? = null,
)

interface Publishing {
  /** MP4 (ve varsa .srt) `Download/StreamPulse` altına yazar. */
  fun publish(item: DownloadItem, mp4: File, srt: File?): PublishResult

  /** Tamamlanmış bir indirimenin dış dosyalarını siler. */
  fun delete(result: PublishResult)
}

/**
 * API 29+: `MediaStore.Downloads` (`IS_PENDING` kalıbı, izin gerektirmez).
 * API 24–28: doğrudan dosya kopyası (`WRITE_EXTERNAL_STORAGE` çalışma zamanında).
 */
class Publisher(private val context: Context) : Publishing {

  private companion object {
    const val TAMPON = 1 shl 20
  }

  override fun publish(item: DownloadItem, mp4: File, srt: File?): PublishResult {
    if (Build.VERSION.SDK_INT >= 29) {
      return publishViaMediaStore(item, mp4, srt, OutputNaming.folder(item))
    }
    return publishDirect(item, mp4, srt, OutputNaming.folder(item))
  }

  // ── API 29+ ────────────────────────────────────────────────────────────

  private fun publishViaMediaStore(
    item: DownloadItem,
    mp4: File,
    srt: File?,
    folder: String?,
  ): PublishResult {
    val resolver = context.contentResolver
    val relDir = "Download/StreamPulse" + (folder?.let { "/$it" } ?: "")
    var mp4Uri: Uri? = null
    try {
      mp4Uri = insert(resolver, relDir, OutputNaming.fileName(item, "mp4"), "video/mp4")
      copyTo(mp4Uri, mp4, resolver)
      clearPending(resolver, mp4Uri)
      var srtUri: Uri? = null
      if (srt != null) {
        srtUri = insert(resolver, relDir, OutputNaming.fileName(item, "srt"), "application/x-subrip")
        copyTo(srtUri, srt, resolver)
        clearPending(resolver, srtUri)
      }
      return PublishResult(
        uri = mp4Uri.toString(),
        path = "/storage/emulated/0/$relDir/${OutputNaming.fileName(item, "mp4")}",
        subtitleUri = srtUri?.toString(),
      )
    } catch (e: Exception) {
      mp4Uri?.let { runCatching { resolver.delete(it, null, null) } }
      throw e
    }
  }

  private fun insert(
    resolver: android.content.ContentResolver,
    relDir: String,
    fileName: String,
    mime: String,
  ): Uri {
    val values = ContentValues().apply {
      put(MediaStore.MediaColumns.DISPLAY_NAME, fileName)
      put(MediaStore.MediaColumns.MIME_TYPE, mime)
      put(MediaStore.MediaColumns.RELATIVE_PATH, relDir)
      put(MediaStore.MediaColumns.IS_PENDING, 1)
    }
    return resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
      ?: throw IllegalStateException("MediaStore kaydı oluşturulamadı")
  }

  private fun copyTo(uri: Uri, file: File, resolver: android.content.ContentResolver) {
    // 1 MB tampon: 8 KB varsayılanı FUSE üzerinden 300 MB'ı dakikalara yayıyordu.
    resolver.openOutputStream(uri)!!.use { os -> file.inputStream().use { it.copyTo(os, TAMPON) } }
  }

  private fun clearPending(resolver: android.content.ContentResolver, uri: Uri) {
    resolver.update(uri, ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING, 0) }, null, null)
  }

  // ── API 24–28 ─────────────────────────────────────────────────────────

  private fun publishDirect(
    item: DownloadItem,
    mp4: File,
    srt: File?,
    folder: String?,
  ): PublishResult {
    val base = File(
      Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS),
      "StreamPulse" + (folder?.let { "/$it" } ?: ""),
    )
    base.mkdirs()
    val mp4Target = File(base, OutputNaming.fileName(item, "mp4"))
    mp4.inputStream().use { input -> mp4Target.outputStream().use { input.copyTo(it, TAMPON) } }
    var srtTarget: File? = null
    if (srt != null) {
      srtTarget = File(base, OutputNaming.fileName(item, "srt"))
      srt.inputStream().use { input -> srtTarget!!.outputStream().use { input.copyTo(it, TAMPON) } }
    }
    // Dosya yöneticileri görsün: MediaScanner'a bildir.
    context.sendBroadcast(Intent(Intent.ACTION_MEDIA_SCANNER_SCAN_FILE, Uri.fromFile(mp4Target)))
    return PublishResult(
      uri = mp4Target.toURI().toString(),
      path = mp4Target.absolutePath,
      subtitleUri = srtTarget?.toURI()?.toString(),
    )
  }

  // ── Silme ─────────────────────────────────────────────────────────────

  override fun delete(result: PublishResult) {
    val resolver = context.contentResolver
    // MediaStore kaydı (content://)
    if (result.uri.startsWith("content:")) {
      runCatching { resolver.delete(Uri.parse(result.uri), null, null) }
    }
    result.subtitleUri?.let { u ->
      runCatching {
        if (u.startsWith("content:")) {
          resolver.delete(Uri.parse(u), null, null)
        } else {
          File(Uri.parse(u).path ?: return@runCatching).delete()
        }
      }
    }
    // API 24–28 doğrudan dosya
    result.path?.let { p ->
      runCatching { File(p).delete() }
    }
  }
}
