package expo.modules.screencontrol

import android.content.Context
import android.database.ContentObserver
import android.media.AudioManager
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.KeyEvent
import android.view.Window
import android.view.WindowManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlin.math.roundToInt

/**
 * ── ScreenControl ──────────────────────────────────────────
 *
 * `expo-brightness` sistem parlaklığını `Settings.System.SCREEN_BRIGHTNESS`
 * üzerinden yazar; bu da `WRITE_SETTINGS` izni gerektirir ve kullanıcıya
 * sistem ayarları ekranı açmak zorunda kalır.
 *
 * CloudStream bu sorunu şöyle çözer: önce `Settings.System` dener, izin
 * yoksa sessizce `useTrueSystemBrightness = false` yapıp
 * `Activity.window.attributes.screenBrightness` alanına düşer. Bu alan
 * PENCEREye özeldir, izin gerektirmez ve uygulama kapanınca otomatik
 * eski değere döner — kullanıcının telefon parlaklığı kalıcı olarak
 * bozulmaz.
 *
 * Bu modül aynı stratejiyi uygular ve İKİ şey yapar:
 *
 *  1. `setBrightness(value)` — sistem izni yoksa pencere parlaklığına yazar.
 *  2. `setVolume(value)` — `AudioManager.setStreamVolume` üzerinden
 *     SİSTEM medya sesini değiştirir. Oynatıcının `volume` prop'u yerine
 *     bunu kullanırız; böylece telefonun ses düğmesi ve oynatıcı jesti
 *     AYNI seviyeyi kontrol eder (CloudStream davranışı).
 *
 * ⚠️ Sistem izni (`WRITE_SETTINGS`) VERİLMEDİĞİ sürece parlaklık yalnızca
 * uygulama penceresine uygulanır. `hasSystemPermission()` ile ayrım
 * raporlanır; JS tarafı buna göre karartma katmanını açıp kapatır.
 */
public class ScreenControlModule : Module() {

  // `Activity.window.attributes.screenBrightness` alanına yazmak için
  // aktif Activity'yi bulmamız gerekir. expo-modules-core bunu
  // `appContext.currentActivity` ile sağlar.
  private fun currentActivity(): android.app.Activity? =
    appContext.currentActivity

  private fun audio(): AudioManager? =
    appContext.reactContext?.getSystemService(Context.AUDIO_SERVICE) as? AudioManager

  /** Sistem medya sesinin 0..1 oranı. */
  private fun volumeRatio(am: AudioManager): Double {
    val max = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
    return if (max <= 0) 1.0
    else am.getStreamVolume(AudioManager.STREAM_MUSIC).toDouble() / max
  }

  /**
   * JS'e ses seviyesini bildirir.
   *
   * `force = false` → yalnızca kademe GERÇEKTEN değiştiyse gönderir
   * (kendi yazdığımız değer için gereksiz event üretmemek için).
   */
  private fun emitVolume(force: Boolean) {
    val am = audio() ?: return
    val step = am.getStreamVolume(AudioManager.STREAM_MUSIC)
    if (!force && step == lastStep) return
    lastStep = step
    sendEvent("onVolumeChange", mapOf("volume" to volumeRatio(am)))
  }

  // Tuş yakalama durumu (aşağıda `enableKeyIntercept`).
  private var originalCallback: Window.Callback? = null
  private var wrappedCallback: Window.Callback? = null
  private var volumeObserver: ContentObserver? = null
  private var lastStep = -1

  /**
   * Sistem parlaklığına yazılmadan ÖNCE kaydedilen değerler.
   *
   * Sistem dalı gerçekten çalışırsa (`Settings.System.canWrite` true)
   * kullanıcının parlaklığı kalıcı olarak değişmiş olur. Oynatıcıdan
   * çıkarken bu değerler geri yüklenir; aksi hâlde kullanıcı oynatıcıdan
   * çıkınca ekranının parlaklığının değişmiş olduğunu görür.
   *
   * `null` = hiç yazılmadı → geri yüklenecek bir şey yok.
   */
  private var savedSystemBrightness: Int? = null
  private var savedSystemMode: Int? = null

  /**
   * Bildirim paneli / Bluetooth / başka uygulama gibi oynatıcı DIŞI kaynaklardan
   * gelen ses değişikliklerini izler.
   *
   * Kendi `setStreamVolume` çağrılarımız da bu gözlemciyi tetikler; bu yüzden
   * `emitVolume(force = false)` yalnızca kademe değiştiyse yayın yapar ve
   * JS tarafında gereksiz HUD sıçraması olmaz.
   */
  private fun startVolumeObserver() {
    if (volumeObserver != null) return
    val ctx = appContext.reactContext ?: return
    val obs = object : ContentObserver(Handler(Looper.getMainLooper())) {
      override fun onChange(selfChange: Boolean) {
        emitVolume(force = false)
      }
    }
    // ⚠️ `Settings.System.CONTENT_URI` TÜM sistem ayarlarını izler.
    // `notifyForDescendants = true` gerekiyor çünkü akış sesleri
    // alt kayıtlarda tutuluyor.
    ctx.contentResolver.registerContentObserver(
      Settings.System.CONTENT_URI, true, obs
    )
    /*
     * ⚠️ OYNATICI AÇILINCA HUD'UN YANIP SÖNMESİNİ ÖNLER.
     *
     * `lastStep` başlangıçta `-1` idi; bu yüzden gözlemci kaydından
     * gelen İLK bildirim her zaman "ses değişti" kabul ediliyor ve
     * HUD bir saniye görünüp kayboluyordu — kullanıcı bunu oynatıcı
     * açılırken ses seviyesinin belirdiği ve gittiği şeklinde
     * bildiriyordu.
     *
     * Gözlemciyi kurmadan ÖNCE mevcut kademeyi okuyup `lastStep`'e
     * yazıyoruz. Böylece yalnızca GERÇEKTEN değişen kademeler
     * yayınlanır; ilk (alakasız) bildirim sessizce yutulur.
     */
    lastStep = audio()?.getStreamVolume(AudioManager.STREAM_MUSIC) ?: -1
    volumeObserver = obs
  }

  private fun stopVolumeObserver() {
    val obs = volumeObserver ?: return
    appContext.reactContext?.contentResolver?.unregisterContentObserver(obs)
    volumeObserver = null
  }

  /**
   * Fiziksel ses tuşlarını Activity penceresinde yakalar.
   *
   * ⚠️ "TEK GÖSTERGE"nin kritik parçası (kullanıcı şikâyeti):
   * "Telefondan ses açtığımda telefonun kendi ayarı açılıyor, ben bunu
   * istemiyorum, CloudStream gibi tek bir gösterge istiyorum."
   *
   * Tuş olayını TÜKETİP (`true`) sesi `flags = 0` ile kendimiz
   * değiştiriyoruz. `flags = 0` `FLAG_SHOW_UI`'ın karşıtıdır: Android'ın
   * kendi ses paneli AÇILMAZ. Böylece ekranda tek gösterge — bizim
   * HUD'umuz — görünür ve seviye zaten `STREAM_MUSIC` üzerinden
   * değiştiği için telefonla da aynıdır.
   *
   * `MainActivity`'ye dokunulmaz; `Window.Callback` çalışma zamanında
   * sarılır ve kapatıldığında orijinali geri konur.
   */
  private fun enableKeyIntercept() {
    val activity = currentActivity() ?: return
    activity.runOnUiThread {
      val window = activity.window ?: return@runOnUiThread
      val current = window.callback ?: return@runOnUiThread
      if (current === wrappedCallback) return@runOnUiThread

      val wrapper = object : Window.Callback by current {
        override fun dispatchKeyEvent(event: KeyEvent): Boolean {
          val code = event.keyCode
          if (code == KeyEvent.KEYCODE_VOLUME_UP ||
            code == KeyEvent.KEYCODE_VOLUME_DOWN
          ) {
            // `ACTION_UP` dahil HİÇBİR şeyi sistem iletmez: yalnızca
            // `ACTION_DOWN`da seviyeyi bir kademe değiştir.
            if (event.action == KeyEvent.ACTION_DOWN) {
              audio()?.adjustStreamVolume(
                AudioManager.STREAM_MUSIC,
                if (code == KeyEvent.KEYCODE_VOLUME_UP) AudioManager.ADJUST_RAISE
                else AudioManager.ADJUST_LOWER,
                0, // FLAG_SHOW_UI YOK → sistem paneli açılmaz
              )
              // Maksimumdayken de HUD görünsün diye `force = true`.
              emitVolume(force = true)
            }
            return true // olayı tüket
          }
          return current.dispatchKeyEvent(event)
        }
      }
      originalCallback = current
      wrappedCallback = wrapper
      window.callback = wrapper
    }
  }

  private fun disableKeyIntercept() {
    val activity = currentActivity()
    val original = originalCallback
    val wrapped = wrappedCallback
    originalCallback = null
    wrappedCallback = null
    if (activity == null || original == null) return
    activity.runOnUiThread {
      if (activity.window?.callback === wrapped) {
        activity.window?.callback = original
      }
    }
  }

  override fun definition() = ModuleDefinition {
    Name("ScreenControl")

    Events("onVolumeChange")

    OnStartObserving { startVolumeObserver() }
    OnStopObserving { stopVolumeObserver() }

    OnDestroy {
      stopVolumeObserver()
      disableKeyIntercept()
    }

    /**
     * Sistem parlaklığı değiştirilebiliyor mu?
     *
     * ⚠️ `WRITE_SETTINGS` ÖZEL bir izindir; `checkSelfPermission` ile
     * kontrol EDİLEMEZ (daima `DENIED` döner). Doğru API:
     * `Settings.System.canWrite(context)`.
     *
     * Bu yanlış kontrol sayesinde önceden her zaman "izin yok" çıkıyor ve
     * parlaklık hep pencere moduna düşüyordu — yani görsel olarak doğru
     * ama sistem parlaklığına hiç dokunulmuyordu. Artık izin verilmiş bir
     * cihazda gerçekten sistem seviyesi değişecek.
     */
    Function("hasSystemPermission") { permission: String ->
      val ctx = appContext.reactContext ?: return@Function false
      if (android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.M) {
        return@Function true
      }
      when (permission) {
        "android.permission.WRITE_SETTINGS" -> Settings.System.canWrite(ctx)
        else ->
          ctx.checkSelfPermission(permission) ==
            android.content.pm.PackageManager.PERMISSION_GRANTED
      }
    }

    /**
     * Ekran parlaklığını 0..1 aralığında okur (SENKRON).
     *
     * ⚠️ Neden senkron bir `AsyncFunction` değil: jest başlangıcında taban
     * değer okunuyor. Asenkron okuma, parmak hareket etmeye başladığında
     * henüz dönmemiş olabilir ve jest 0.5'ten başlardı. Senkron okuma bu
     * yarışı tamamen ortadan kaldırır.
     *
     * Öncelik: pencere değeri ayarlanmışsa O (bize ait), yoksa sistem
     * değeri. Pencere modu aktifken sistem değeri 0..1'e çevrilemez
     * olduğu için `null` döner.
     */
    Function("getBrightness") {
      val w = currentActivity()?.window?.attributes?.screenBrightness ?: -1f
      if (w >= 0f) return@Function w.toDouble()
      val ctx = appContext.reactContext ?: return@Function null
      try {
        (Settings.System.getInt(
          ctx.contentResolver,
          Settings.System.SCREEN_BRIGHTNESS,
        ) / 255.0).coerceIn(0.0, 1.0)
      } catch (_: Exception) {
        null
      }
    }

    /**
     * Oynatıcıdan çıkarken parlaklığı oynatıcı ÖNCESİNE döndürür.
     *
     * ⚠️ Neden gerekli (kullanıcı gözlemi):
     *
     * `window.attributes.screenBrightness` yalnızca Activity YOK OLUNCA
     * kendiliğinden sıfırlanmaz. Oynatıcıdan çıkarken Activity yaşamaya
     * devam eder (tek Activity'li uygulama), dolayısıyla yazılan değer
     * pencerede KALIYOR ve kullanıcı oynatıcıdan çıktığında ekranı hâlâ
     * kısık görür.
     *
     * Çözüm iki adımdan oluşur:
     *  1. Pencere override'ı `BRIGHTNESS_OVERRIDE_NONE` (-1f) yapılır →
     *     "sistem ne diyorsa o" anlamına gelir.
     *  2. Sistem seviyesine gerçekten yazıldıysa (`savedSystemBrightness`
     *     null değil) kullanıcının eski değeri geri yüklenir.
     *
     * Güvenli/idempotent: birden fazla çağrılsa da zararsızdır.
     */
    Function("resetBrightness") {
      // 1) Pencere override'ını kaldır.
      val activity = currentActivity()
      activity?.runOnUiThread {
        val window = activity.window ?: return@runOnUiThread
        val lp = window.attributes
        // `BRIGHTNESS_OVERRIDE_NONE` = -1f: sistem varsayılanına dön.
        lp.screenBrightness = WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE
        window.attributes = lp
      }

      // 2) Sistem seviyesine yazıldıysa eski değeri geri yükle.
      val ctx = appContext.reactContext
      val b = savedSystemBrightness
      val m = savedSystemMode
      if (ctx != null && b != null) {
        try {
          Settings.System.putInt(
            ctx.contentResolver, Settings.System.SCREEN_BRIGHTNESS, b
          )
          if (m != null) {
            Settings.System.putInt(
              ctx.contentResolver, Settings.System.SCREEN_BRIGHTNESS_MODE, m
            )
          }
        } catch (_: Exception) {
          // Geri yükleme başarısız olursa oynatıcıyı kilitlemeyelim.
        }
      }
      savedSystemBrightness = null
      savedSystemMode = null
    }

    /**
     * Sistem medya sesini 0..1 aralığında okur (SENKRON).
     *
     * Asenkron kardeşi `getSystemVolumeAsync` ile aynı değeri döner;
     * fark yalnızca jest başlangıcında yarış olmamasıdır.
     */
    Function("getSystemVolume") {
      audio()?.let { volumeRatio(it) }
    }

    /**
     * Fiziksel ses tuşlarını yakalar / bırakır.
     *
     * Oynatıcı açıkken `true`, kapanınca `false` çağrılır. `false`
     * çağrılmazsa tuşlar tüm uygulama boyunca yutulur kalırdı.
     */
    Function("setVolumeKeyIntercept") { enabled: Boolean ->
      if (enabled) enableKeyIntercept() else disableKeyIntercept()
    }

    /**
     * Ekran parlaklığını 0..1 aralığında ayarlar.
     *
     * Öncelik sırası (CloudStream ile aynı):
     *   1. Sistem izni varsa `Settings.System` → tüm cihazı etkiler.
     *   2. Yoksa pencere özniteliği → yalnızca bu uygulama, izin gerekmez.
     *
     * @return true → sistem seviyesi değişti
     * @return false → pencere seviyesi değişti (yine de görsel etki var)
     */
    AsyncFunction("setBrightnessAsync") { value: Double ->
      val ctx = appContext.reactContext
        ?: return@AsyncFunction false
      val brightness = value.coerceIn(0.004, 1.0)

      // ⚠️ ÖZEL İZİN KONTROLÜ: `checkSelfPermission(WRITE_SETTINGS)`
      // her zaman DENIED döner. Doğrusu `Settings.System.canWrite(ctx)`.
      val canWriteSystem =
        android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.M ||
          android.provider.Settings.System.canWrite(ctx)

      if (canWriteSystem) {
        try {
          // ⚠️ Geri yükleme için eski değeri YALNIZCA İLK YAZIMDA sakla.
          // Her karede saklarsak, oynatıcı boyunca kullanıcının kendi
          // yaptığı parlaklık değişikliği de "eski" sayılır ve çıkışta
          // yanlış değer geri yüklenir.
          if (savedSystemBrightness == null) {
            savedSystemBrightness = android.provider.Settings.System.getInt(
              ctx.contentResolver,
              android.provider.Settings.System.SCREEN_BRIGHTNESS,
              128,
            )
            savedSystemMode = android.provider.Settings.System.getInt(
              ctx.contentResolver,
              android.provider.Settings.System.SCREEN_BRIGHTNESS_MODE,
              android.provider.Settings.System.SCREEN_BRIGHTNESS_MODE_MANUAL,
            )
          }
          // ⚠️ Yazma `Settings.System.putInt(...)` ile yapılır, bir
          // `ContentResolver` üzerinden DEĞİL. `ContentResolver` yalnızca
          // `query()` sunar; yazma yetkisi `Settings.System`'in statik
          // metotlarındadır. (CloudStream'in yaptığı da budur.)
          android.provider.Settings.System.putInt(
            ctx.contentResolver,
            android.provider.Settings.System.SCREEN_BRIGHTNESS_MODE,
            android.provider.Settings.System.SCREEN_BRIGHTNESS_MODE_MANUAL,
          )
          android.provider.Settings.System.putInt(
            ctx.contentResolver,
            android.provider.Settings.System.SCREEN_BRIGHTNESS,
            (brightness * 255).toInt(),
          )
          return@AsyncFunction true
        } catch (_: Exception) {
          // Sistem yazımı başarısız → pencereye düş.
        }
      }

      // Pencere yedeği: izin gerektirmez, uygulama kapanınca eski değere döner.
      val activity = currentActivity()
      if (activity != null) {
        activity.runOnUiThread {
          val lp = activity.window?.attributes ?: return@runOnUiThread
          // `screenBrightness` bir `Float` alan; JS'ten `Double` geldiği
          // için açık dönüşüm gerekiyor (Kotlin örtük dönüşüm yapmaz).
          lp.screenBrightness = brightness.toFloat()
          activity.window?.attributes = lp
        }
      }
      false
    }

    /**
     * Sistem parlaklığını 0..1 aralığında okur.
     *
     * Pencere modu aktifken (`screenBrightness < 0`) `-1f` döner; bu
     * "sistem varsayılanı kullanılıyor" demektir ve 0..1'e çevrilemez.
     */
    AsyncFunction("getSystemBrightnessAsync") {
      val ctx = appContext.reactContext ?: return@AsyncFunction null
      try {
        val resolver = ctx.contentResolver
        val raw = android.provider.Settings.System.getInt(
          resolver,
          android.provider.Settings.System.SCREEN_BRIGHTNESS,
        )
        (raw / 255.0).coerceIn(0.0, 1.0)
      } catch (_: Exception) {
        null
      }
    }

    /**
     * Sistem medya sesini 0..1 aralığında ayarlar.
     *
     * `AudioManager.setStreamVolume` herhangi bir izin GEREKTİRMEZ
     * (MODIFY_AUDIO_SETTINGS yalnızca bazı akışlar için). Bu yüzden
     * sistem sesi doğrudan değiştirilebilir — telefondaki ses düğmesi de
     * aynı akışı kontrol ettiği için iki yol birebir aynı seviye olur.
     */
    AsyncFunction("setSystemVolumeAsync") { value: Double ->
      val ctx = appContext.reactContext
        ?: return@AsyncFunction false
      val am = ctx.getSystemService(android.content.Context.AUDIO_SERVICE)
        as? android.media.AudioManager
        ?: return@AsyncFunction false
      val clamped = value.coerceIn(0.0, 1.0)
      try {
        val max = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
        am.setStreamVolume(
          AudioManager.STREAM_MUSIC,
          // ⚠️ `roundToInt()`, `toInt()` DEĞİL: yuvarlama olmadan
          // örn. 0.30 × 15 = 4.5 → 4 kademe yazılır ve HUD %30 derken
          // gerçekte %27 çalar (sistemin kademeli ölçeği yuvarlar).
          // Bu, "gösterge ile gerçek ses uyuşmuyor" kaynaklı bir ofset
          // yaratıyordu.
          (clamped * max).roundToInt().coerceIn(0, max),
          0, // Sistem çubuğunu GÖSTERME — kendi HUD'umuz var.
        )
        // Kendi yazdığımız değer için event üretme: JS zaten biliyor.
        lastStep = am.getStreamVolume(AudioManager.STREAM_MUSIC)
        true
      } catch (_: Exception) {
        false
      }
    }

    /** Sistem medya sesini 0..1 aralığında okur. */
    AsyncFunction("getSystemVolumeAsync") {
      val ctx = appContext.reactContext ?: return@AsyncFunction 1.0
      val am = ctx.getSystemService(android.content.Context.AUDIO_SERVICE)
        as? android.media.AudioManager ?: return@AsyncFunction 1.0
      val max = am.getStreamMaxVolume(android.media.AudioManager.STREAM_MUSIC)
      if (max <= 0) 1.0 else am.getStreamVolume(android.media.AudioManager.STREAM_MUSIC).toDouble() / max
    }
  }
}