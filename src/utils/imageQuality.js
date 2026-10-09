import NetInfo from "@react-native-community/netinfo";

/**
 * ── Uyarlanabilir görsel kalitesi ──────────────────────────────
 *
 * Sorun: "yavaş bağlantı hızında resimler tam yüklenmiyor".
 *
 * ⚠️ NEDEN NETINFO TEK BAŞINA YETMEZ:
 *
 * `NetInfo` bağlantının **çeşidini** verir (wifi / hücresel) ama
 * **genişliğini** vermez. "Kullanıcı hücresel bağlı" demek "yavaş"
 * demek değildir; 5G hücresel çok hızlıdır. Öte yandan asıl sorun
 * bağlantı türü değil, **gerçekte ne kadar sürede yüklendiğidir**.
 *
 * Bu yüzden karar İKİ sinyale dayanır:
 *
 *   1. HÜCRESEL (`isConnectionExpensive`) → başlangıçta DÜŞÜK kalite.
 *      Yanlışlık maliyeti düşük (kullanıcı 1 saniye bekler), doğru
 *      kararın maliyeti yüksek (posterler hiç yüklenmez).
 *   2. GERÇEK YÜKLEME SÜRESİ → ağırlıklı ortalama (EWMA). Birkaç
 *      görsel yavaş yüklendiğinde otomatik düşer, hepsi hızlı
 *      yüklendiğinde otomatik yükselir.
 *
 * ⚠️ NEDEN EWMA:
 * Anlık ölçüm çok gürültülüdür (tek bir istek CDN cache'e takılır,
 * bir sonraki 10 ms'de döner). Ortalama, bu gürültüyü söndürür ama
 * "son 3 görselin ortalaması" çok yavaş tepki verirdi. EWMA ikisinin
 * arasında: yeni ölçüme hızlıca uyar, ama tek bir ölçümle karar
 * değiştirme.
 */

/** Yükleme süresi bu değerin üstündeyse ağ "yavaş" sayılır. */
const SLOW_MS = 1200;
/** Hızlı sayılacak yükleme süresi; bu altındaysa ağ "iyi". */
const FAST_MS = 400;

/**
 * Görselin "iyi" sayılabilmesi için gereken minimum örnek.
 * Tek bir hızlı görsel yükseltme yapmaya yetmez: ilk istek zaten
 * cache'ten gelir ve yanıltıcıdır.
 */
const FAST_SAMPLES_FOR_UPGRADE = 4;

/** TMDB boyut kodları — düşükten yükseğe. */
const TMDB_SIZES = [
	"w185",
	"w300",
	"w342",
	"w500",
	"w780",
	"original",
];

let quality = "high";
let ewmaMs = 0;
let fastSampleCount = 0;
let hasSample = false;

const listeners = new Set();

function emit() {
	for (const cb of listeners) {
		try {
			cb(quality);
		} catch {}
	}
}

function setQuality(next) {
	if (next === quality) return;
	quality = next;
	emit();
}

/**
 * Bir görsel yüklemesinin sonucunu sisteme bildirir.
 *
 * @param {number} durationMs Yükleme süresi (ms)
 * @param {boolean} ok Başarılı mı
 */
export function reportImageLoad(durationMs, ok) {
	if (!Number.isFinite(durationMs) || durationMs < 0) return;

	// Başarısız yükleme: kesin olarak kötü sinyal.
	if (!ok) {
		ewmaMs = Math.max(ewmaMs, SLOW_MS * 2);
		hasSample = true;
		fastSampleCount = 0;
		setQuality("low");
		return;
	}

	// EWMA: yeni ölçüme %35 ağırlık. İlk örnek doğrudan alınır.
	ewmaMs = hasSample ? ewmaMs * 0.65 + durationMs * 0.35 : durationMs;
	hasSample = true;

	if (ewmaMs > SLOW_MS) {
		fastSampleCount = 0;
		setQuality("low");
	} else if (ewmaMs < FAST_MS) {
		fastSampleCount += 1;
		// Yeterli sayıda HIZLI örnek birikmeden yükseltme yapma.
		if (fastSampleCount >= FAST_SAMPLES_FOR_UPGRADE) {
			setQuality("high");
			// Yükselttikten sonra sayacı sıfırla ki bir sonraki hızlı
			// örnekler tekrar sayılmasın.
			fastSampleCount = 0;
		}
	} else {
		// Belirsiz bölge: kararı değiştirme, sadece sayacı sıfırla.
		fastSampleCount = 0;
	}
}

/** Anlık kalite durumu: `"high"` | `"low"`. */
export function getImageQuality() {
	return quality;
}

/** Kalite değiştiğinde abone ol. @returns {() => void} */
export function subscribeImageQuality(cb) {
	listeners.add(cb);
	return () => listeners.delete(cb);
}

/**
 * TMDB görsel URL'ini kaliteye göre yeniden yazar.
 *
 * TMDB URL yapısı: `https://image.tmdb.org/t/p/{size}/{hash}.jpg`
 * Boyut kodu URL'e gömülüdür, sunucu tarafında başka boyut seçilemez —
 * URL'yi değiştirmek ZORUNLU.
 *
 * @param {string} uri
 * @returns {string}
 */
export function smartImageUri(uri) {
	if (typeof uri !== "string" || uri.length === 0) return uri;

	if (quality === "high") return uri;

	// Sadece TMDB'yi yeniden yaz; diğer CDN'ler dokunulmaz.
	const m = uri.match(/^(https:\/\/image\.tmdb\.org\/t\/p\/)([^/]+)(\/.+)$/);
	if (!m) return uri;

	const [, prefix, size, suffix] = m;
	const idx = TMDB_SIZES.indexOf(size);
	// Bilinmeyen boyut (örn. `w600_and_h900_face`) — indekslenemez,
	// dokunmadan bırak.
	if (idx === -1) return uri;

	const cap = TMDB_SIZES.indexOf("w500");
	const target = idx > cap ? cap : idx;
	if (target === idx) return uri;

	return prefix + TMDB_SIZES[target] + suffix;
}

/** Küçük kartlar (liste satırı, küçük kapak) için düşük kalite sınırı. */
export function isLowQuality() {
	return quality === "low";
}

/**
 * Ağ durumunu izlemeyi başlatır. Bir kez çağrılmalı (uygulama açılışında).
 *
 * Hücresel bağlantıda düşük kaliteye geçer; kabloya dönünce yükseltme
 * YAPILMAZ — yükseltme kararı yükleme sürelerine bırakılmıştır. Aksi
 * hâlde "hücreselden çık, hâlâ yavaş" diye kalıcı düşük kalemek gibi
 * yanlış bir güvenlik kilidi oluşurdu.
 *
 * @returns {() => void} aboneliği bitiren fonksiyon
 */
export function startNetworkQualityWatch() {
	return NetInfo.addEventListener((state) => {
		const expensive =
			state.type === "cellular" || state.details?.isConnectionExpensive;

		if (!state.isConnected) {
			// Bağlantı yokken yükseltilmemeli.
			fastSampleCount = 0;
			setQuality("low");
			return;
		}

		if (expensive) {
			fastSampleCount = 0;
			setQuality("low");
		}
	});
}