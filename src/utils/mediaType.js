/**
 * İçerik Türü (Dizi / Film) — TEK KAYNAK
 *
 * ⚠️ BU DOSYA NEDEN VAR
 *
 * "Bu içerik dizi mi, film mi?" sorusu projede FARKLI FARKLI beş dosyada,
 * birbirinden FARKLI zincirlerle cevaplanıyordu:
 *
 *   MovieDetails/[id].jsx      → content_type || (is_series/seasons tahmini)
 *   library.jsx                → type/content_type + "/dizi/" URL kontrolü
 *   QuickPreviewModal.jsx      → is_series || content_type || season/episode
 *   ActionButtons.jsx          → content_type || is_series || seasons
 *   profileFormat.js           → type || season/episode
 *
 * Zincirler birbirinden sapınca aynı içerik farklı ekranlarda farklı
 * sınıflandırıldı: favoriye eklenen diziler `type: "movie"` ile kaydedildi
 * ve profil ekranında "Film" göründü. Yeni bir tespit yöntemi eklemek
 * beş yeri birden güncellemek anlamına geliyordu.
 *
 * ── Sinyal güvenilirlik sırası ──────────────────────────────────
 *
 *   1. `is_series === true`   Backend'de `isinstance(media_info, SeriesInfo)`
 *                             ile hesaplanır (api/routes/plugins.py:707).
 *                             Yani Python modelinin KENDİSİNE bakıyor —
 *                             en güvenilir sinyal, plugin'in verdiği `type`
 *                             alanına güvenmekten bile üstün.
 *   2. `media_type`           Backend sözleşmesi: yalnızca "Dizi" | "Film"
 *                             (Core/Plugin/PluginModels.py). Detay
 *                             modellerinde de normalize edilmiş hâlde gelir.
 *   3. `type` / `content_type` "series" | "tv" | "dizi"  ↔  "movie" | "film"
 *   4. Yapısal                seasons[] · seriesId · seriesTitle · season · episode
 *   5. URL                    /dizi/ · /series/ · /tv/ · /show/
 *   6. Metin                  başlık/kategoride "sezon" veya "dizi"
 *
 * 1'in 2'den önce gelmesi bilinçlidir: `media_type` yoksa `content_type`'tan
 * TÜRETİLİR ve modelin varsayılanına düşer. Yani dizi için `MovieInfo`
 * dönen bir plugin'da `media_type` "Film" olabilirken `is_series` doğru
 * kalır. Backend'da `_medya_tipi()` önce `media_type`'a baktığı için bu
 * sıralama orada da böyle olmalıdır.
 */

export const TYPE_SERIES = "series";
export const TYPE_MOVIE = "movie";

/** Türkçe'ye duyarlı küçük harfe indirme. */
function trLower(value) {
	if (typeof value !== "string") return "";
	return value.replace(/İ/g, "i").replace(/I/g, "ı").toLowerCase().trim();
}

/** Dizi tarafına düşmesi gereken yazımlar (backend `normalize_media_type` ile aynı). */
const SERIES_WORDS = [
	"dizi", "diziler", "tv", "series", "serie", "show", "anime", "animasyon",
	"tvshow", "tv show", "tvseries", "tv series", "tv_series", "dizisite",
	"serial", "web series", "webseries", "dizi/filmi",
];

/** Film tarafına düşmesi gereken yazımlar. */
const MOVIE_WORDS = ["film", "movie", "sinema", "films", "movies", "sinifilm"];

/**
 * Serbest metni ("Dizi İzle", "/dizi/", "TV Series") sınıfa indirger.
 * @param {any} value
 * @returns {"series"|"movie"|null} Tanınmıyorsa `null`
 */
export function normalizeMediaType(value) {
	if (value === null || value === undefined) return null;

	if (typeof value === "boolean") return value ? TYPE_SERIES : TYPE_MOVIE;

	const raw = trLower(value);
	if (!raw) return null;

	if (SERIES_WORDS.includes(raw)) return TYPE_SERIES;
	if (MOVIE_WORDS.includes(raw)) return TYPE_MOVIE;

	// İçinde geçen kelime. Dizi tarafı önce: "film" kelimesi "tv show" gibi
	// değil, "sinema filmi" gibi değerlerde geçebiliyor.
	if (/\b(dizi|serie|series|show|anime|tv)\b/.test(raw)) return TYPE_SERIES;
	if (/\b(film|movie|sinema)\b/.test(raw)) return TYPE_MOVIE;

	// URL kalıntıları
	if (raw.includes("/dizi/") || raw.includes("/series/")) return TYPE_SERIES;
	if (raw.includes("/film/") || raw.includes("/movie/")) return TYPE_MOVIE;

	return null;
}

/**
 * Bir nesnenin dizi olup olmadığını belirler.
 *
 * @param {object|null|undefined} item
 * @returns {boolean}
 */
export function isSeriesContent(item) {
	if (!item || typeof item !== "object") return false;

	// 1) Backend'in model sınıfından türettiği en güvenilir sinyal
	if (item.is_series === true || item.is_series === "true") return true;

	// 2) Backend sözleşmesi: "Dizi" | "Film"
	const fromMedia = normalizeMediaType(item.media_type);
	if (fromMedia) return fromMedia === TYPE_SERIES;

	// 3) Açık tip alanları
	const fromType = normalizeMediaType(item.type);
	if (fromType) return fromType === TYPE_SERIES;

	const fromContentType = normalizeMediaType(item.content_type);
	if (fromContentType) return fromContentType === TYPE_SERIES;

	// 4) Yapısal işaretler
	if (Array.isArray(item.seasons) && item.seasons.length > 0) return true;
	if (item.season !== undefined && item.season !== null && item.season !== "") {
		return true;
	}
	if (item.episode !== undefined && item.episode !== null && item.episode !== "") {
		return true;
	}
	if (item.seriesId || item.seriesTitle) return true;

	// 5) URL
	const fromUrl = normalizeMediaType(item.url || item.seriesUrl);
	if (fromUrl) return fromUrl === TYPE_SERIES;

	// 6) Metin — en zayıf sinyal, yalnızca öncekiler boş döndüyse
	const category = trLower(item.category);
	if (category.includes("dizi")) return true;
	if (trLower(item.title).includes("sezon")) return true;

	return false;
}

/**
 * Kanonik tür değeri — bu, `LIBRARY_FIELDS` içinde senkronize edilen
 * ve depolamada saklanan ALANIN değeridir.
 *
 * @param {object|null|undefined} item
 * @returns {"series"|"movie"}
 */
export function canonicalType(item) {
	return isSeriesContent(item) ? TYPE_SERIES : TYPE_MOVIE;
}

/**
 * Türkçe etiket (ekran metni).
 * @param {object|null|undefined} item
 * @returns {"Dizi"|"Film"}
 */
export function typeLabel(item) {
	return isSeriesContent(item) ? "Dizi" : "Film";
}

/**
 * Bir `media_type` / `content_type` DEĞERİNİ kanonik tipe çevirir.
 * Nesne olmadan, düz değer üzerinden çalışır.
 *
 * @param {any} value
 * @param {"series"|"movie"} fallback
 * @returns {"series"|"movie"}
 */
export function typeFromValue(value, fallback = TYPE_MOVIE) {
	const normalized = normalizeMediaType(value);
	return normalized ?? fallback;
}
