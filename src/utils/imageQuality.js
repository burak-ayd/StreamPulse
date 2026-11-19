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

/**
 * Kart görseli için hedef piksel genişliğine göre uygun TMDB boyutu
 * seçer / özel CDN'leri küçültür.
 *
 * - TMDB: `targetPx` piksel genişliğine en yakın *küçük* TMDB boyutunu
 *   seçer (w92, w154, w185, w342, w500...). Mevcut URL'deki boyuttan
 *   daha büyük bir boyut ASLA seçmez (upscale yok).
 * - hdfilmcehennemi `@2x.webp`: `targetPx` < 400 ise `@2x.` kısmını
 *   atar (1x versiyonu) — 2x görseller 2× decode maliyeti getirirdi.
 * - Diğer CDN'ler: dokunmaz.
 *
 * @param {string} uri
 * @param {number} targetPx  hedef piksel genişlik (ör. kartGenişliği * PixelRatio)
 * @returns {string}
 */
/**
 * Kart posterinde kaynak piksel = görüntülenen fiziksel piksel × bu oran.
 *
 * 0.6 → kart posterinde TMDB w342 yerine w185 istenir (piksel ~%45 az;
 * 1080p TV'de kart ~150dp geniş, gözle fark edilmez). 1 yapılırsa tam
 * çözünürlük (eski davranış) geri gelir.
 */
export const POSTER_QUALITY_FACTOR = 0.6;

export function cardImageUri(uri, targetPx) {
	if (typeof uri !== "string" || uri.length === 0) return uri;

	// TMDB URL'si
	const tmdbMatch = uri.match(
		/^(https:\/\/image\.tmdb\.org\/t\/p\/)([^/]+)(\/.+)$/,
	);
	if (tmdbMatch) {
		const [, prefix, size, suffix] = tmdbMatch;

		// "w1280"/"w92" gibi listeye yazılmamış boyutlar da geliyor
		// (backdrop'lar `posterOf` üzerinden poster yerine geçebiliyor).
		const currentPx = /^w(\d+)$/.test(size)
			? parseInt(size.slice(1), 10)
			: Infinity; // "original" veya bilinmeyen → sınır yok

		for (const s of TMDB_SIZES) {
			const px = parseInt(s.slice(1), 10); // "w342" → 342
			if (!Number.isFinite(px)) continue; // "original"
			if (px < targetPx) continue; // çok küçük
			if (px > currentPx) break; // büyütme yok
			return s === size ? uri : prefix + s + suffix;
		}
		return uri;
	}

	// hdfilmcehennemi @2x → 1x (targetPx küçükse)
	if (targetPx < 400) {
		const at2x = uri.replace(/@2x\./, ".");
		if (at2x !== uri) return at2x;
	}

	return uri;
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