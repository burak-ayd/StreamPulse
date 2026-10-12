/**
 * AÇILIŞ KAPISI (SPLASH GATE)
 * ===========================
 *
 * Sorun: splash ekranı, uygulama açılır açılmaz kayboluyordu. Kullanıcı
 * isteği: ekran, uygulamanın açılış API istekleri bitene kadar **1–2 saniye**
 * görünsün ve çıkışı ANİMASYONLU olsun.
 *
 * ── Neden üç parça? ────────────────────────────────────────────────
 *
 *  1. `SplashScreen.preventAutoHideAsync()` — expo-router, ilk ekran
 *     çizilir çizilmez native splash'ı KENDİSİ gizler. Bu çağrı olmazsa
 *     JS tarafı ne kadar beklerse beklesin splash yine kaybolur.
 *     Expo dokümanı bunu **global scope'da, await edilmeden** çağırmayı
 *     şart koşar; component içinde çağrılırsa "çok geç" kalır.
 *
 *  2. `waitForStartupGate()` — açılışta uçuşa kalkan istekleri sayar ve
 *     "hepsi bitti + kısa bir sessizlik" koşulunu bekler. Sabit bir
 *     `setTimeout` yerine bunu kullanmanın sebebi: 3 gün kapalı kalmış bir
 *     cihazda `getMe` isteği saniyeler sürebilir; sabit bekleme o zaman
 *     boş ekrana bakma demektir, istek sayacı ise ekranı doğru anda kapatır.
 *
 *  3. `hideNativeSplash()` — JS katmanı hazır olduğunda native splash'ı
 *     kapatır. Animasyon JS tarafında olur (bkz. components/splash).
 *
 * ── TV ─────────────────────────────────────────────────────────────
 * Android TV'de native splash **hiç görünmez**: AndroidX `core-splashscreen`
 * yalnızca Android 12+ ve TV olmayan cihazlarda splash penceresi açar;
 * TV cihazları doğrudan uygulama Activity'sini başlatır. Bu yüzden TV'de
 * ekranı JS tarafında kurmamız gerekiyor — bkz. `SplashOverlay`.
 */
import * as SplashScreen from "expo-splash-screen";
import { Platform } from "react-native";

/** Ekran EN AZ bu kadar süre splash'te kalır (kullanıcı isteği: 1–2 sn). */
export const MIN_SPLASH_MS = 1200;

/**
 * Ekran EN FAZLA bu kadar bekler.
 *
 * ⚠️ Üst sınır OLMASA uygulama sonsuza dek splash'te kalabilirdi: uçuşta
 * kalan ya da sürekli yenilenen bir istek (ör. polling) sayacı hiç sıfırlamaz.
 * Bu değer "çok yavaş ağ" durumunda bile kullanıcıyı içeriye bırakır.
 */
export const MAX_SPLASH_MS = 3000;

/**
 * Kaç süredir uçuşta istek yok sayılacağı.
 *
 * "Alanda hiç istek yok" (`_inFlight === 0`) tek başına yetmez: kapı
 * `minMs` dolduğu anda henüz hiç istek FIRLATILMAMIŞ olabilir (ör. oturum
 * yoksa AuthContext sunucuya hiç gitmez). Sessizlik payı bu boşluğu kapatır:
 * istek başlayınca sayaç sıfırlanır, kapı tekrar bekler.
 */
export const QUIET_MS = 400;

const IS_WEB = Platform.OS === "web";

// ⚠️ AWAIT EDİLMEZ ve component içinde DEĞİL — Expo dokümanı bunu açıkça
// söylüyor. Web'de modül yalnızca `Platform.OS === "web"` uyarısı basar.
if (!IS_WEB) {
	SplashScreen.preventAutoHideAsync();
}

/**
 * Uçuşta olan API isteği sayısı ve "son hareket" zaman damgası.
 *
 * @type {number}
 */
let _inFlight = 0;

/** @type {number} */
let _lastActivityAt = Date.now();

/** @returns {number} */
function _settle() {
	_inFlight = Math.max(0, _inFlight - 1);
	_lastActivityAt = Date.now();
}

/**
 * `fetch`'i sayma amacıyla sarar.
 *
 * ⚠️ NEDEN GLOBAL SARMA: projede isteklerin tek bir boğazı yok —
 * `apiClient.js` `authFetch` kullanıyor, `api.js` ise dokuz ayrı yerde
 * düz `fetch` çağırıyor. Bu ikisinin dokuzunu da elle değiştirmek yerine
 * tek bir sarmalayıcı, "hangi istekten bahsediliyor" sorusunu değiştirmeden
 * tek doğruluk kaynağı bırakır.
 *
 * Yalnızca `/api/` içeren URL'ler sayılır. Üçüncü taraf görsel CDN'leri
 * (`images.unsplash.com/...`) bu kalıbı taşımadığı için sayaç onları görmez.
 */
function _instrumentFetch() {
	if (typeof globalThis.fetch !== "function") return;
	if (globalThis.fetch.__streamPulseSplashPatched) return;

	const original = globalThis.fetch;

	function patched(input, init) {
		const url =
			typeof input === "string" ? input : (input && input.url) || "";

		if (typeof url !== "string" || !url.includes("/api/")) {
			return original.call(this, input, init);
		}

		_inFlight += 1;
		_lastActivityAt = Date.now();

		let result;
		try {
			result = original.call(this, input, init);
		} catch (error) {
			// Senkron atış (geçersiz URL vb.) — sayaç asılı kalmasın.
			_settle();
			throw error;
		}

		// `then(ok, hata)` — `finally` yerine: reddedilen istekte çağıranın
		// hatayı ALMASI korunur (`.finally` zincirle de korurdu, ama
		// `then(ok, err)` "handled" olduğu için gereksiz zincir üretmez).
		return Promise.resolve(result).then(
			(value) => {
				_settle();
				return value;
			},
			(error) => {
				_settle();
				throw error;
			}
		);
	}

	patched.__streamPulseSplashPatched = true;
	globalThis.fetch = patched;
}

_instrumentFetch();

/** @param {number} ms */
function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Uçuşta API isteği sayısı — teşhis için (log).
 * @returns {number}
 */
export function getInFlightRequestCount() {
	return _inFlight;
}

/**
 * Açılış kapısı: en az `minMs` bekler, sonra uçuşta istek kalmayana ve
 * `quietMs` boyunca yeni istek başlamayana kadar bekler. `maxMs` aşılırsa
 * mevcut durumla döner.
 *
 * @param {object} [options]
 * @param {number} [options.minMs]
 * @param {number} [options.maxMs]
 * @param {number} [options.quietMs]
 * @returns {Promise<{ elapsed: number, timedOut: boolean }>}
 *   `elapsed`  → gerçekte geçen süre (ms)
 *   `timedOut` → `maxMs` dolduğu için hâlâ istek vardı
 */
export async function waitForStartupGate(options = {}) {
	const {
		minMs = MIN_SPLASH_MS,
		maxMs = MAX_SPLASH_MS,
		quietMs = QUIET_MS,
	} = options;

	const startedAt = Date.now();
	const deadline = startedAt + maxMs;

	await sleep(Math.max(0, startedAt + minMs - Date.now()));

	while (Date.now() < deadline) {
		if (_inFlight === 0 && Date.now() - _lastActivityAt >= quietMs) break;
		await sleep(50);
	}

	const elapsed = Date.now() - startedAt;
	return { elapsed, timedOut: _inFlight > 0 };
}

/**
 * Native splash'ı kapatır.
 *
 * Bu, JS tarafındaki animasyon BAŞLAMADAN çağrılmalıdır. Aksi hâlde telefon
 * ve tablette animasyon native splash'ın ARKASINDA oynar, native splash
 * kapanınca içerik hazır olur ve geçiş "sıçrama" olur. Doğru sıra:
 * `hideNativeSplash()` → sonra JS animasyonu.
 *
 * @returns {Promise<void>}
 */
export async function hideNativeSplash() {
	if (IS_WEB) return;
	try {
		await SplashScreen.hideAsync();
	} catch (error) {
		// Gizleme başarısız olsa bile uygulama kilitli kalmamalı: JS splash
		// zaten üstte, kullanıcı içeriği görebilir.
		console.warn("Native splash kapatılamadı:", error?.message);
	}
}