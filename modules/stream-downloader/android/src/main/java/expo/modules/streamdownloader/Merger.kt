package expo.modules.streamdownloader

import com.arthenica.ffmpegkit.FFmpegKit
import com.arthenica.ffmpegkit.FFmpegSession
import com.arthenica.ffmpegkit.FFmpegSessionCompleteCallback
import com.arthenica.ffmpegkit.FFprobeKit
import com.arthenica.ffmpegkit.LogCallback
import com.arthenica.ffmpegkit.StatisticsCallback
import java.io.File
import kotlin.coroutines.resume
import kotlinx.coroutines.suspendCancellableCoroutine

data class MergeResult(val ok: Boolean, val errorMessage: String?, val durationSec: Double?)

interface Merging {
  /**
   * Video (ve varsa ses) oynatma listelerini tek MP4'e `-c copy` ile paketler.
   * [onProgress] işlenen süreyi (saniye) bildirir.
   */
  suspend fun merge(video: File, audio: File?, out: File, onProgress: (Double) -> Unit): MergeResult
}

class Merger : Merging {

  override suspend fun merge(
    video: File,
    audio: File?,
    out: File,
    onProgress: (Double) -> Unit,
  ): MergeResult {
    out.delete()
    val args = buildArgs(video, audio, out)
    val session = suspendCancellableCoroutine<FFmpegSession> { cont ->
      val s = FFmpegKit.executeWithArgumentsAsync(
        args,
        FFmpegSessionCompleteCallback { done -> if (cont.isActive) cont.resume(done) },
        LogCallback { },
        StatisticsCallback { st -> onProgress(st.time / 1000.0) },
      )
      cont.invokeOnCancellation { FFmpegKit.cancel(s.sessionId) }
    }
    if (!session.returnCode.isValueSuccess) {
      val reason = session.failStackTrace ?: session.allLogsAsString?.takeLast(400) ?: "bilinmeyen"
      return MergeResult(false, "FFmpeg hatası: $reason", null)
    }
    val duration = probeDuration(out)
    if (!out.exists() || out.length() == 0L || duration == null || duration <= 0.0) {
      return MergeResult(false, "birleştirilen dosya doğrulanamadı", null)
    }
    return MergeResult(true, null, duration)
  }

  private fun probeDuration(file: File): Double? =
    FFprobeKit.getMediaInformation(file.absolutePath).mediaInformation?.duration?.toDoubleOrNull()

  companion object {
    /** Ses ayrı rendition ise onu kullanır; değilse videonun (varsa) sesi. */
    internal fun buildArgs(video: File, audio: File?, out: File): Array<String> {
      val a = mutableListOf(
        "-y",
        "-allowed_extensions", "ALL",
        "-protocol_whitelist", "file,crypto,data",
        "-i", video.absolutePath,
      )
      if (audio != null) {
        a += listOf("-i", audio.absolutePath, "-map", "0:v:0", "-map", "1:a:0")
      } else {
        a += listOf("-map", "0:v:0", "-map", "0:a:0?")
      }
      a += listOf("-c", "copy", "-movflags", "+faststart", out.absolutePath)
      return a.toTypedArray()
    }
  }
}
