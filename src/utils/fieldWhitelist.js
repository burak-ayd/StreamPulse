/**
 * Alan Beyaz Listesi
 *
 * Senkronize edilen kayıtlarda hangi alanların taşınacağını belirler.
 * Ham API nesnesi (search.jsx:216-219) seasons/episodes içerebilir —
 * bunlar senkronize EDİLMEZ.
 *
 * Boyut kapakları burada tanımlanır.
 */

/**
 * Kayıt bazlı (user_library) senkronize edilecek alanlar.
 * content payload'ında yalnızca bu alanlar sunucuya gönderilir.
 */
export const LIBRARY_FIELDS = [
	"id",
	"url",
	"title",
	"poster",
	"type",
	"plugin",
	"year",
	"season",
	"episode",
	"seriesId",
	"seriesTitle",
	"episodeTitle",
	"currentTime",
	"duration",
	"progress",
	"watchedAt",
	"isCompleted",
	"updatedAt",
];

/**
 * Senkronize edilecek belge türleri (user_documents).
 */
export const SYNCABLE_DOC_TYPES = [
	"player_settings",
	"search_history",
	"theme",
	"selected_platform",
	"plugin_visibility",
	"category_visibility",
];

/**
 * Senkronize edilecek kayıt türleri (user_library item_type).
 */
export const SYNCABLE_ITEM_TYPES = [
	"favorite",
	"watchlist",
	"watch_history",
	"continue_watching",
];

/**
 * Boyut kapakları — AsyncStorage'daki liste uzunluk sınırları.
 */
export const SIZE_CAPS = {
	favorites: 500,
	watchlist: 100,
	// ⚠️ 50 → 500: izleme geçmişi bölüm tamamlama kayıtlarını da tutar
	// ("Tamamlandı" sayacının kaynağı). 50 sınırıyla 50'den fazla bölüm
	// izlenen dizilerde eski bölüm kayıtları sessizce düşüyor ve sayaç
	// olduğundan AZ görünüyordu (kullanıcı: "Tamamlanan dizi bölümleri
	// yanlış hesaplanıyor"). 500, uzun dizileri baştan sona kapsar.
	watch_history: 500,
	continue_watching: 50,
	search_history: 20,
	downloads: 200,
};

/**
 * Payload'ı beyaz listeye göre filtreler.
 * Bilinmeyen alanları sessizce atar.
 * @param {object} payload - Ham kayıt nesnesi
 * @param {string[]} whitelist - İzin verilen alan listesi
 * @returns {object} Filtrelenmiş nesne
 */
export function filterPayload(payload, whitelist = LIBRARY_FIELDS) {
	if (!payload || typeof payload !== "object") return {};

	const filtered = {};
	for (const key of whitelist) {
		if (key in payload && payload[key] !== undefined) {
			filtered[key] = payload[key];
		}
	}
	return filtered;
}

/**
 * Listeyi boyut kapağına göre kırpar.
 * @param {Array} list - Kayıt listesi
 * @param {number} cap - Maksimum eleman sayısı
 * @returns {Array} Kırpılmış liste
 */
export function capList(list, cap) {
	if (!Array.isArray(list)) return [];
	if (list.length <= cap) return list;
	return list.slice(0, cap);
}
