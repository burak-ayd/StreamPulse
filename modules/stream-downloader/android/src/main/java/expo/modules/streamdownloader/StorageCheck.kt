package expo.modules.streamdownloader

/**
 * Disk alanı tahmini ve kontrolü (saf; cihaz bağımsız).
 * Kural: boş alan ≥ tahmini boyut × 2.5 (birleştirme + kopya için pay).
 */
object StorageCheck {
  const val SAFETY_FACTOR = 2.5

  fun estimateBytes(bandwidthBitsPerSec: Long, durationSec: Double): Long =
    (bandwidthBitsPerSec / 8.0 * durationSec).toLong().coerceAtLeast(0L)

  fun hasRoom(availableBytes: Long, estimatedBytes: Long): Boolean =
    availableBytes >= estimatedBytes * SAFETY_FACTOR
}
