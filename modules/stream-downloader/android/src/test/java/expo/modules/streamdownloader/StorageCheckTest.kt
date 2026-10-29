package expo.modules.streamdownloader

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class StorageCheckTest {
  @Test
  fun hasRoomNeedsTwoAndHalfTimes() {
    assertTrue(StorageCheck.hasRoom(2500, 1000))
    assertFalse(StorageCheck.hasRoom(2499, 1000))
  }

  @Test
  fun estimateUsesBandwidthAndDuration() {
    // 2.8 Mbit/s × 3600 sn / 8 ≈ 1.26 GB
    assertEquals(1_260_000_000L, StorageCheck.estimateBytes(2_800_000L, 3600.0))
  }

  @Test
  fun zeroAndNegativeAreSafe() {
    assertTrue(StorageCheck.hasRoom(0, 0))
    assertEquals(0L, StorageCheck.estimateBytes(0L, 3600.0))
  }
}
