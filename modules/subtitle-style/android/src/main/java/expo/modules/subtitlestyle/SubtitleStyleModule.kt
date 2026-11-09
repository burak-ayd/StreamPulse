package expo.modules.subtitlestyle

import android.graphics.Color
import android.util.TypedValue
import android.view.View
import android.view.ViewGroup
import androidx.media3.ui.CaptionStyleCompat
import androidx.media3.ui.SubtitleView
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * ── SubtitleStyle ─────────────────────────────────────────────
 *
 * Gömülü (container içi) altyazılar react-native-video → ExoPlayer
 * tarafından çizilir. `react-native-video`'nun `subtitleStyle` prop'u
 * yalnızca boyut/padding/opaklık taşır; metin ve arka plan rengi sistem
 * altyazı stilinden gelir. Bu yüzden uygulama ayarlarındaki renkler
 * gömülü altyazılara uygulanmıyordu.
 *
 * Bu modül, aktif penceredeki ExoPlayer `SubtitleView`'ını bulup
 * `CaptionStyleCompat` ile uygulama renklerini yazar. Gömülü stillerin
 * bu değerleri ezmemesi için `setApplyEmbeddedStyles(false)` kullanılır.
 *
 * ⚠️ Neden node_modules yaması değil: RNV dosyalarını değiştirmek bakım
 * maliyeti getirir; bu modül aynı etkiyi uygulama tarafında, kendi
 * kaynağımızda tutar. SubtitleView'a erişim görünüm ağacından yapılır;
 * RNV media3 `PlayerView` kullandığı sürece geçerlidir.
 */
class SubtitleStyleModule : Module() {

  override fun definition() = ModuleDefinition {
    Name("SubtitleStyle")

    /**
     * Stili uygular. JS, oynatıcı kurulduktan sonra ve ayarlar değişince
     * çağırır. Görünüm henüz hazır değilse sessizce `false` döner.
     */
    Function("apply") { options: Map<String, Any?> ->
      val activity = appContext.currentActivity ?: return@Function false

      val foreground = parseColor(options["color"] as? String) ?: Color.WHITE
      val background = parseColor(options["backgroundColor"] as? String) ?: Color.TRANSPARENT
      val edge = parseColor(options["edgeColor"] as? String) ?: Color.BLACK
      val textShadow = options["textShadow"] as? Boolean ?: true
      val fontSize = (options["fontSize"] as? Number)?.toFloat() ?: -1f
      val opacity = (options["opacity"] as? Number)?.toFloat() ?: 1f

      val captionStyle = CaptionStyleCompat(
        foreground,
        background,
        Color.TRANSPARENT,
        if (textShadow) CaptionStyleCompat.EDGE_TYPE_OUTLINE else CaptionStyleCompat.EDGE_TYPE_NONE,
        edge,
        null
      )

      activity.runOnUiThread {
        val root = activity.window?.decorView ?: return@runOnUiThread
        val views = mutableListOf<SubtitleView>()
        collect(root, views)
        views.forEach { view ->
          view.setApplyEmbeddedStyles(false)
          view.setStyle(captionStyle)
          if (fontSize > 0f) {
            view.setFixedTextSize(TypedValue.COMPLEX_UNIT_SP, fontSize)
          }
          view.alpha = opacity
        }
      }

      true
    }
  }

  /**
   * "#RRGGBB" / "#AARRGGBB" / "#RGB" → ARGB. Geçersiz değer `null`.
   *
   * ⚠️ JS'ten CSS `rgba(...)` gönderilmez: `Color.parseColor` onu kabul
   * etmez (bkz. VideoPlayer `subtitleBgColorArgb`).
   */
  private fun parseColor(value: String?): Int? {
    if (value.isNullOrBlank()) return null
    return try {
      Color.parseColor(value)
    } catch (_: IllegalArgumentException) {
      null
    }
  }

  private fun collect(view: View, out: MutableList<SubtitleView>) {
    if (view is SubtitleView) {
      out.add(view)
      return
    }
    if (view is ViewGroup) {
      for (index in 0 until view.childCount) {
        collect(view.getChildAt(index), out)
      }
    }
  }
}
