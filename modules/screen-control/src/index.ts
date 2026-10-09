/**
 * ── screen-control ──────────────────────────────────────────
 *
 * Android'de sistem parlaklığı ve medya sesini kontrol eden Expo modülü.
 *
 * ⚠️ NEDEN BU MODÜL VAR (CloudStream davranışı):
 *
 * · PARLAKLIK — `expo-brightness` `Settings.System.SCREEN_BRIGHTNESS`
 *   yazar ve `WRITE_SETTINGS` ister; izin verilmezse çağrı SESSİZCE
 *   başarısız olur (kullanıcı "gösterge değişiyor ama ekran değişmiyor"
 *   der) ve kullanıcı sistem ayarlarında gezinmek zorunda kalır.
 *   Bu modül önce sistemi dener, olmazsa `window.attributes` alanına
 *   yazar — izin GEREKMEZ ve uygulama kapanınca eski değere döner.
 *
 * · SES — `AudioManager.setStreamVolume` hiçbir izin gerektirmez. Bu
 *   yüzden oynatıcı jesti ile telefonun ses düğmesi aynı seviyeyi
 *   kontrol eder (CloudStream'te de böyle).
 */
import { requireNativeModule } from "expo-modules-core";

const ScreenControl = requireNativeModule("ScreenControl");

/**
 * Sistem parlaklığına yazılabiliyor mu (`WRITE_SETTINGS` verilmiş mi)?
 *
 * @returns {Promise<boolean>}
 */
export function hasSystemPermission(permission) {
	return ScreenControl.hasSystemPermission(permission);
}

/**
 * Ekran parlaklığını 0..1 aralığında ayarlar.
 *
 * @returns {Promise<boolean>} true → sistem seviyesi değişti;
 *   false → pencere seviyesi değişti (görsel etki yine de var).
 */
export function setBrightnessAsync(value) {
	return ScreenControl.setBrightnessAsync(value);
}

/** Sistem parlaklığını 0..1 aralığında okur. Pencere modunda `null`. */
export function getSystemBrightnessAsync() {
	return ScreenControl.getSystemBrightnessAsync();
}

/**
 * Sistem medya sesini 0..1 aralığında ayarlar.
 *
 * Sistem medya çubuğu gösterilmez; kendi HUD'umuzu kullanıyoruz.
 */
export function setSystemVolumeAsync(value) {
	return ScreenControl.setSystemVolumeAsync(value);
}

/** Sistem medya sesini 0..1 aralığında okur. */
export function getSystemVolumeAsync() {
	return ScreenControl.getSystemVolumeAsync();
}

/*
 * ── Senkron okumalar (jest başlangıcı için) ──
 *
 * ⚠️ Neden senkron: jest taban değeri jestin ARM olduğu anda okunur.
 * Asenkron okuma, parmak hareket etmeye başladığında henüz dönmemiş
 * olabilir; o durumda jest 0.5'ten başlar ve kullanıcı "her sürükleme
 * 0.5'ten başlıyor" diye bildirir.
 */

/**
 * Ekran parlaklığını 0..1 aralığında SENKRON okur.
 * Pencere değeri ayarlanmışsa onu, yoksa sistem değerini döner.
 *
 * @returns {number | null}
 */
export function getBrightness() {
	return ScreenControl.getBrightness();
}

/**
 * Sistem medya sesini 0..1 aralığında SENKRON okur.
 *
 * @returns {number | null}
 */
export function getSystemVolume() {
	return ScreenControl.getSystemVolume();
}

/**
 * Fiziksel ses tuşlarını yakalar (sistem ses paneli AÇILMAZ).
 *
 * Oynatıcı açılınca `true`, kapanınca `false` çağrılmalıdır.
 *
 * @param {boolean} enabled
 */
export function setVolumeKeyIntercept(enabled) {
	ScreenControl.setVolumeKeyIntercept(enabled);
}

/**
 * Oynatıcıdan çıkarken parlaklığı oynatıcı ÖNCESİNE döndürür.
 *
 * `window.attributes.screenBrightness` yalnızca Activity yok olunca
 * sıfırlanır; oynatıcıdan çıkarken Activity yaşamaya devam ettiği için
 * değer pencerede kalır. Bu fonksiyon pencere override'ını kaldırır ve
 * sistem seviyesine yazıldıysa eski değeri geri yükler.
 */
export function resetBrightness() {
	ScreenControl.resetBrightness();
}

export default ScreenControl;