import { Platform } from "react-native";
import ScreenControlModule from "../../modules/screen-control/src";

/**
 * Cihaz parlaklığı / ses seviyesi kontrolü.
 *
 * ⚠️ BU DOSYA İKİ KULLANICI ŞİKÂYETİNİ DOĞRUDAN ÇÖZER:
 *
 * (1) "CloudStream bunu izin istemeden yapıyor."
 *     → Native modül (`modules/screen-control`) önce sistem parlaklığını
 *       dener, izin YOKSA sessizce `window.attributes.screenBrightness`
 *       alanına düşer. CloudStream'in `useTrueSystemBrightness` yedeğiyle
 *       birebir aynı strateji. Kullanıcı hiçbir sistem ayarı ekranı
 *       görmez ve telefonun parlaklığı kalıcı olarak BOZULMAZ (pencere
 *       alanı uygulama kapanınca kendiliğinden sıfırlanır).
 *
 * (2) "Playerdan sesi arttırınca telefonun ses seviyesi değişmiyor."
 *     → `setSystemVolumeAsync` doğrudan `AudioManager.setStreamVolume`
 *       çağırır (hiçbir izin gerektirmez). Böylece oynatıcı jesti ile
 *       telefonun ses düğmesi AYNI akışı (STREAM_MUSIC) kontrol eder;
 *       ikisi ayrışamaz. Kullanıcının "telefonu full'e çekiyorum ama
 *       telefondan hâlâ arttırabiliyorum" gözlemi bu yüzden oluyordu.
 *
 * ÖNCEKİ YAPILAR VE BAŞARISIZLIK NEDENLERİ (silinmeleri bir tesadüf
 * değil, ikisi de sessizce başarısız oluyordu):
 *
 *   · `expo-brightness` → `Settings.System.SCREEN_BRIGHTNESS` yazar ve
 *     `WRITE_SETTINGS` ister. İzin verilmezse çağrı HATA BİLE VERMEZ,
 *     sadece uygulanmaz → kullanıcı "gösterge değişiyor ama ekran
 *     değişmiyor" der. Üstelik izin ekranı kullanıcıyı sistem
 *     ayarlarında gezinmeye zorlar.
 *
 *   · `react-native-volume-manager` → Java tarafı `config.getString("type")`
 *     çağırıp `assert type != null` yapıyor; eksik alanla çağrıldığında
 *     hata verir ve sistem sesi hiç değişmez. (Ayrıca `getVolume()` bir
 *     sayı değil `{volume}` nesnesi döndürür ve `volume` ham kademedir.)
 *
 * Bu katman platform desteklenmediğinde oynatıcı içi karartmaya düşer;
 * bir modül eksikliği oyuncuyu bozmaz.
 */

/**
 * Native modül.
 *
 * ⚠️ `Platform.isTV` ve web'de modül YOKTUR; `requireNativeModule` bu
 * durumda çağrıldığında hata fırlatır. Bu yüzden yalnızca Android'de
 * import ediliyor, aksi hâlde uygulama açılışta ÇÖKER.
 */
const ScreenControl = Platform.OS === "android" ? ScreenControlModule : null;

/** Sistem parlaklığına yazılabiliyor mu (`WRITE_SETTINGS` verilmiş mi)? */
let brightnessWritable = false;

/** Cihazda parlaklık değiştirmenin anlamlı olduğu platformlar */
export const canAdjustBrightness =
	Platform.OS === "ios" || (Platform.OS === "android" && !Platform.isTV);

/** Cihazda ses kontrolü anlamlı (web'de yok) */
export const canAdjustVolume = Platform.OS !== "web";

/**
 * ⚠️ ARTARDI HESAP KURMA GEREKTİRMEZ.
 *
 * Eski sürümde ilk açılışta `requestPermissionsAsync()` ile sistem
 * ayarları izin ekranı açılıyordu. CloudStream hiçbir izin istemediği
 * için biz de istemiyoruz: parlaklık pencereye yazılır (izin gerekmez).
 *
 * Sistem izni zaten verilmişse (`brightnessWritable === true`) parlaklık
 * cihaz geneline yazılır ve bu durumda eski değeri geri yüklemek
 * kullanıcının tercihini korumak için gereklidir.
 */
export async function ensureBrightnessPermission() {
	if (!ScreenControl || Platform.isTV) {
		brightnessWritable = false;
		return false;
	}
	try {
		brightnessWritable = Boolean(
			await ScreenControl.hasSystemPermission("android.permission.WRITE_SETTINGS"),
		);
	} catch {
		brightnessWritable = false;
	}
	return brightnessWritable;
}

/** Sistem parlaklığını okur (0..1). Pencere modu aktifse `null`. */
export async function getBrightness() {
	if (!ScreenControl || !brightnessWritable) return null;
	try {
		const value = await ScreenControl.getSystemBrightnessAsync?.();
		return typeof value === "number" ? value : null;
	} catch {
		return null;
	}
}

/**
 * Ekran parlaklığını 0..1 aralığında ayarlar.
 *
 * @returns {Promise<boolean>} true → sistem seviyesi değişti (tüm cihaz)
 *   false → pencere seviyesi değişti (görsel etki yine de var)
 */
export async function setBrightness(value) {
	if (!ScreenControl) return false;
	try {
		return Boolean(await ScreenControl.setBrightnessAsync(value));
	} catch (error) {
		console.warn("Parlaklık ayarlanamadı:", error);
		return false;
	}
}

/**
 * Geri yüklenecek eski parlaklığı döndürür.
 *
 * ⚠️ Pencere modunda `null` döner: `window.attributes.screenBrightness`
 * uygulama kapanınca KENDİLİĞİNDEN sıfırlanır, geri yükleme gerekmez
 * ve telefonun parlaklığı olduğu gibi kalır. Bu, kullanıcı için en
 * iyi davranıştır.
 */
export async function captureOriginalBrightness() {
	if (!brightnessWritable) return null;
	return await getBrightness();
}

// ── Ses ──────────────────────────────────────────────────────

/**
 * Sistem medya sesini okur (0..1).
 *
 * ⚠️ `react-native-volume-manager`'ın `getVolume()` metodu bir SAYI
 * değil, `{ volume, type }` nesnesi döndürür ve `volume` Android'de
 * HAM kademedir (0..15). Önceki sürüm hem yanlış tipi hem de yanlış
 * ölçeği okuyordu.
 */
export async function getSystemVolume() {
	if (!ScreenControl) return null;
	try {
		const value = await ScreenControl.getSystemVolumeAsync();
		return typeof value === "number" ? value : null;
	} catch {
		return null;
	}
}

/**
 * Sistem medya sesini ayarlar (0..1).
 *
 * `AudioManager.setStreamVolume` HİÇBİR İZİN GEREKTİRMEZ. Sistem
 * medya çubuğu gösterilmez (`flags = 0`) çünkü kendi HUD'umuzu
 * kullanıyoruz; ikisi birlikte ekranı kirletirdi.
 *
 * @returns {Promise<boolean>} gerçekten yazıldıysa true
 */
export async function setSystemVolume(value) {
	if (!ScreenControl) return false;
	try {
		await ScreenControl.setSystemVolumeAsync(
			Math.max(0, Math.min(1, value)),
		);
		return true;
	} catch (error) {
		console.warn("Sistem sesi ayarlanamadı:", error);
		return false;
	}
}

/** Sistem sesi yazılabiliyor mu (UI ipucu için). */
export function isVolumeSupported() {
	return Boolean(ScreenControl);
}

/*
 * ── Senkron okumalar (jest taban değeri için) ──
 *
 * ⚠️ Neden senkron: dikey jest tabanı, jestin ARM olduğu anda okunur.
 * Asenkron okumada parmak hareket etmeye başladığında değer henüz
 * dönmemiş olabilir ve jest 0.5'ten başlar. Senkron okuma bu yarışı
 * tamamen ortadan kaldırır — asenkron kardeşler yalnızca açılışta ve
 * geri yüklemede kullanılır.
 */

/**
 * Sistem medya sesini SENKRON okur (0..1).
 * @returns {number | null} modül yoksa `null`
 */
export function getSystemVolumeSync() {
	if (!ScreenControl) return null;
	try {
		const v = ScreenControl.getSystemVolume?.();
		return typeof v === "number" ? v : null;
	} catch {
		return null;
	}
}

/**
 * Ekran parlaklığını SENKRON okur (0..1).
 * @returns {number | null} modül yoksa veya ölçülemiyorsa `null`
 */
export function getBrightnessSync() {
	if (!ScreenControl) return null;
	try {
		const v = ScreenControl.getBrightness?.();
		return typeof v === "number" ? v : null;
	} catch {
		return null;
	}
}

/**
 * Fiziksel ses tuşlarını yakalar; sistem ses paneli AÇILMAZ.
 *
 * Oynatıcı açıkken `true`, kapanırken `false` çağrılmalıdır — aksi
 * hâlde tuşlar yutulmuş ve oynatıcı dışında da çalışmaz hâlde kalır.
 */
export function setVolumeKeyIntercept(enabled) {
	if (!ScreenControl || Platform.isTV) return;
	try {
		ScreenControl.setVolumeKeyIntercept?.(enabled);
	} catch {}
}

/**
 * Oynatıcı DIŞI ses değişikliklerini dinler.
 *
 * Kaynaklar: telefonun fiziksel ses tuşları, bildirim paneli, Bluetooth
 * kumanda, başka uygulamalar. Bunlar `STREAM_MUSIC` üzerinden aynı
 * seviyeyi değiştirdiği için HUD'un senkron kalması gerekir.
 *
 * @param {(volume: number) => void} callback
 * @returns {() => void} aboneliği bitiren fonksiyon
 */
export function subscribeSystemVolume(callback) {
	if (!ScreenControl?.addListener) return () => {};
	let sub;
	try {
		sub = ScreenControl.addListener("onVolumeChange", (e) => {
			if (typeof e?.volume === "number") callback(e.volume);
		});
	} catch {
		return () => {};
	}
	return () => {
		try {
			sub?.remove?.();
		} catch {}
	};
}

/**
 * Oynatıcıdan çıkarken parlaklığı oynatıcı ÖNCESİNE döndürür.
 *
 * ⚠️ Neden gerekli: `window.attributes.screenBrightness` yalnızca
 * Activity YOK OLUNCA sıfırlanır. Oynatıcıdan çıkarken Activity yaşamaya
 * devam eder, dolayısıyla yazılan değer pencerede kalıyor ve kullanıcı
 * oynatıcıdan çıktığında ekranı hâlâ kısık görüyordu.
 *
 * Native taraf iki işlemi yapar:
 *   1. Pencere override'ını `BRIGHTNESS_OVERRIDE_NONE` (-1f) yapar,
 *   2. Sistem parlaklığına yazıldıysa eski değeri geri yükler.
 *
 * Güvenli: birden fazla çağrılsa da zararsızdır.
 */
export function resetBrightness() {
	if (!ScreenControl || Platform.isTV) return;
	try {
		ScreenControl.resetBrightness?.();
	} catch {}
}

/** Hud ikonu için parlaklık kademesi (0..6) */
export function brightnessIconLevel(ratio) {
	return Math.max(0, Math.min(6, Math.round(ratio * 6)));
}

/** Hud ikonu için ses kademesi (0..2) */
export function volumeIconLevel(ratio) {
	return Math.max(0, Math.min(2, Math.round(ratio * 2)));
}