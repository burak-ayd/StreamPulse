/**
 * Ekran yönü kilitleri — TEK KAYNAK
 * ================================
 *
 * Oynatıcı açılırken yataya kilitlenir ve çıkarken uygulamanın "temel"
 * yönüne döndürülür. Bu dönüş İKİ ayrı yerde yazılıydı
 * (`app/(app)/player.jsx` → `handleClose`, `VideoPlayer.jsx` → orientation
 * effect'in temizliği) ve ikisi de `PORTRAIT_UP` çağırıyordu.
 *
 * ⚠️ SORUN 7 (TV): Android TV'de `PORTRAIT_UP` çağırmak uygulamayı
 * DİKEYE çeviriyor. Kullanıcı oynatıcıdan çıkınca TV ekranı dönüyor ve
 * TV'ye ait yerleşim (sol ray, 4 sütun, yatay ızgara) bozuluyordu.
 * TV'de dönüş hedefi `LANDSCAPE`'dir; `ROOT_LAYOUT` açılışta da aynısını
 * kilitler (`_layout.jsx` → `lockTVOrientation`), yani buradaki değer
 * o açılış kararının BİR AYNASI olmalıdır.
 *
 * Telefon/tablette davranış DEĞİŞTİRİLMEDİ: uygulamanın dikey ana
 * yerleşimi korunur (kullanıcı oynatıcıdan dikey ana ekrana döner).
 */

import * as ScreenOrientation from "expo-screen-orientation";
import { Platform } from "react-native";

/**
 * Oynatıcı açılırken uygulanan kilit.
 *
 * ⚠️ TV zaten yatay kilitli (bkz. `app/_layout.jsx` → `lockTVOrientation`).
 * Yine de aynı hedef buradan çağrılır: "temel yön" tek bir kavramdır ve
 * oynatıcıdan dönüş de aynı değeri kullanır (aşağıya bak).
 */
export function lockPlayerOrientation() {
	return ScreenOrientation.lockAsync(
		ScreenOrientation.OrientationLock.LANDSCAPE,
	);
}

/**
 * Oynatıcıdan çıkarken uygulamanın temel yönüne döner.
 *
 * ⚠️ TV'DE `PORTRAIT_UP` ASLA ÇAĞRILMAZ — ekranı döndürür (sorun 7).
 *
 * @returns {Promise<void>} Çağıranın `.catch()` zincirlemesi için
 *   her zaman çözümlenen bir söz döner; native hata yutulur çünkü
 *   yön kilidi kritik olmayan bir görsel geri bildirimdir.
 */
export function restoreAppOrientation() {
	const lock = Platform.isTV
		? ScreenOrientation.OrientationLock.LANDSCAPE
		: ScreenOrientation.OrientationLock.PORTRAIT_UP;

	return ScreenOrientation.lockAsync(lock).catch(() => {
		// Bazı cihazlarda (TV / özel ROM) kilit çağrısı reddedilebilir;
		// ekranı bozuk bırakmamak için hata yutulur.
	});
}