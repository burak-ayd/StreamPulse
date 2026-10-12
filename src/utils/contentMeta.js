/**
 * İçerik Kartı Alan Çözümleyicileri — TEK KAYNAK
 *
 * Poster, puan, dil ve yıl alanları eklentiden eklentiye FARKLI isimlerle
 * geliyor. Bu çözümleyiciler önce `MovieCategorySection` (ana sayfa) ve
 * `category.jsx` (kategori sayfası) içinde AYRI AYRI kopyalanmıştı; iki kart
 * aynı içerik için farklı değer gösterebiliyordu.
 *
 * Kart görünümü değiştiğinde (bkz. `components/content/CategoryCard.jsx`) bu
 * dosyayı güncellemek yeterli — her ekran otomatik olarak tutarlı olur.
 */

/** Ana sayfadaki fallback afişle aynı. */
export const FALLBACK_POSTER =
	"https://images.unsplash.com/photo-1534447677768-be436bb09401?w=800&auto=format&fit=crop&q=60";

/**
 * Poster URL'sini çözer. Alan yoksa sabit bir yedek görsel döner — kartın
 * "boş" görünmesindense düzgün bir afiş göstermesi daha iyi.
 * @param {object} item
 * @returns {string}
 */
export function posterOf(item) {
	return (
		item?.poster ||
		item?.poster_url ||
		item?.image ||
		item?.backdrop_url ||
		FALLBACK_POSTER
	);
}

/**
 * Puanı metne çevirir. 0 veya geçersiz değer rozet basmaz.
 * @param {object} item
 * @returns {string|null}
 */
export function ratingOf(item) {
	const raw = item?.rating;
	if (raw === null || raw === undefined || raw === "") return null;
	const num = typeof raw === "number" ? raw : parseFloat(raw);
	return Number.isFinite(num) && num > 0 ? String(raw) : null;
}

/**
 * Yılı 4 haneye kısaltır.
 * @param {object} item
 * @returns {string|null}
 */
export function yearOf(item) {
	const raw = item?.year || item?.release_date || item?.first_air_date;
	if (!raw) return null;
	return String(raw).slice(0, 4);
}

/**
 * Ses/alt yazı dil alanını çözer. `null` dönerse rozet render edilmez.
 * @param {object} item
 * @returns {string|Array|null}
 */
export function languageOf(item) {
	return (
		item?.language ||
		item?.languages ||
		item?.lang ||
		item?.audio ||
		item?.subtitles ||
		null
	);
}

/**
 * İçeriğin eklentiden gelen KİMLİĞİ (tekilleştirme için).
 *
 * ⚠️ `contentKey`'den ayrı tutuldu çünkü ikisi farklı işe yarar:
 *   · `contentIdentity` → "bu içerik daha önce listede var mıydı?"
 *     (kategori sayfasında sayfa sayfa tekrarları ayıklanırken)
 *   · `contentKey`     → React liste anahtarı (benzersiz olmalı)
 *
 * Önceden ikisi de `id || url || slug || title` idi ve iki ayrı yerde
 * FARKLI öncelik sıralaması kullanılıyordu; aynı içerik için iki farklı
 * kimlik üretilebiliyordu.
 *
 * @returns {string|null} `null` → içerikte hiç kimlik alanı yok
 */
export function contentIdentity(item) {
	return item?.id || item?.url || item?.slug || item?.title || null;
}

/**
 * Kartın liste içinde tekil anahtarı (React `key`).
 *
 * ⚠️ İNDEKS SON EKİ ZORUNLU. Aynı başlığa sahip iki farklı içerik
 * olabiliyor (farklı yıl/oyuncu); anahtar yalnızca başlıktan türetilirse
 * React "iki çocuk aynı anahtara sahip" uyarısı üretir ve hücreleri
 * YENİDEN KULLANIR. Kullanıcının gördüğü sonuç, odaklı kartın
 * "kendiliğinden değişmesi"dir (sorun 2).
 *
 * @param {object} item
 * @param {number} index  - listedeki konumu
 * @returns {string}
 */
export function contentKey(item, index) {
	const identity = contentIdentity(item);
	return identity != null ? `${identity}~${index}` : `item-${index}`;
}
