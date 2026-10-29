package expo.modules.streamdownloader

import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.concurrent.ConcurrentHashMap

/**
 * ThrottleGate (host bazlı, 2026-10-28):
 *  - Aynı host'ta istekler aralıkla sıralanır (yarış yok).
 *  - 429 yalnız O host'un aralığını büyütür; diğer host'lar etkilenmez.
 *  - Ceza yoksa aralık zamanla yarıya iner (taban 200 ms).
 */
class ThrottleGateTest {

  private val host = "cdn.test"

  private fun stateOf(h: String): Any {
    val f = ThrottleGate::class.java.getDeclaredField("hosts")
    f.isAccessible = true
    @Suppress("UNCHECKED_CAST")
    val map = f.get(null) as ConcurrentHashMap<String, Any>
    return map.getOrPut(h) { map.getOrPut(h) { newHostState() } }
  }

  private fun newHostState(): Any {
    val cls = Class.forName("expo.modules.streamdownloader.ThrottleGate\$HostState")
    val ctor = cls.getDeclaredConstructor()
    ctor.isAccessible = true
    return ctor.newInstance()
  }

  private fun atomicOf(state: Any, name: String): java.util.concurrent.atomic.AtomicLong {
    val f = state.javaClass.getDeclaredField(name)
    f.isAccessible = true
    return f.get(state) as java.util.concurrent.atomic.AtomicLong
  }

  @Test
  fun `429 yalniz o hostu yavaslatir`() {
    assertEquals(200L, atomicOf(stateOf(host), "gap").get())
    ThrottleGate.noteThrottled(host)
    assertEquals(400L, atomicOf(stateOf(host), "gap").get())
    ThrottleGate.noteThrottled(host)
    assertEquals(800L, atomicOf(stateOf(host), "gap").get())
    // Başka host'un temposu bozulmaz.
    assertEquals(200L, atomicOf(stateOf("baska.test"), "gap").get())
  }

  @Test
  fun `eszamanli istekler ayri yuva kapar - yarissiz`() = runBlocking {
    val s = stateOf(host)
    atomicOf(s, "gap").set(200L)
    atomicOf(s, "nextSlotAt").set(0L)
    val baslangic = System.currentTimeMillis()
    // Dört worker aynı anda kapıya saldırır; her biri +200ms ertelenmelidir.
    (1..4).map { async { ThrottleGate.gate(host) } }.awaitAll()
    val son = atomicOf(s, "nextSlotAt").get()
    assertTrue("yuva ilerlemedi: $son", son >= baslangic + 4 * 200)
    assertTrue(son <= baslangic + 5 * 200)
  }

  @Test
  fun `ceza sonrasi saglikli kalinda aralik yarilanir`() = runBlocking {
    val s = stateOf(host)
    atomicOf(s, "gap").set(800L)
    ThrottleGate.noteThrottled(host)
    assertEquals(1600L, atomicOf(s, "gap").get())
    // Son throttle eskimiş: kapı açılışında toparlanma devreye girer.
    atomicOf(s, "lastThrottleAt").set(System.currentTimeMillis() - 16_000L)
    atomicOf(s, "lastRecoveryAt").set(0L)
    ThrottleGate.gate(host)
    assertEquals(800L, atomicOf(s, "gap").get())
    // Tabanın (200 ms) altına inemez.
    repeat(6) {
      atomicOf(s, "lastThrottleAt").set(System.currentTimeMillis() - 16_000L)
      atomicOf(s, "lastRecoveryAt").set(0L)
      ThrottleGate.gate(host)
    }
    assertTrue("taban altı: ${atomicOf(s, "gap").get()}", atomicOf(s, "gap").get() >= 200L)
  }
}
