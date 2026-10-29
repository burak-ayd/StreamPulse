/*
 * İçerik → eklenti adı çözümü (madde 5, saf modül).
 *
 * Kök neden: kaynak alan adları (ör. `s231.lol`) birer YANSI (mirror)
 * alan adıdır; eski kod `hostname.split('.')[0]` ile bunu eklenti adı
 * sanıp kaydediyordu. Alan adı tahmini kaldırıldı: bilinen site adları +
 * bilinen yansı önekleri dışında `null` döner.
 */

/** Bilinen yansı öneki → gerçek eklenti adı. Sırayla denenir. */
export const MIRROR_PLUGIN_PREFIXES = [
	["s231", "hdfilmcehennemi"],
];

/** Bilinen eklenti site adı → eklenti adı (hostname içinde aranır). */
const KNOWN_PLUGINS = [
	"dizibox",
	"hdfilmcehennemi",
	"filmmodu",
	"dizipal",
	"sezonlukdizi",
	"diziyou",
	"sinefy",
	"fullhdfilmizlesene",
];

/** Dolu plugin alanı yansı önekiyse gerçek ada taşınır (hatalı eski kayıt).
 *  Case-sensitive'dı: "S231" yazımlı kayıt eşleşmiyor, ham "S231" adıyla
 *  detay fetch'i 404'te sessizce null'a düşüyor, Özet/Oyuncular/Bildirim
 *  gizleniyordu (Tur 12 keşif raporu). Küçük harfe indirip eşleştir. */
function fixPluginValue(plugin) {
	if (typeof plugin !== "string") return null;
	const lower = plugin.toLowerCase();
	for (const [prefix, name] of MIRROR_PLUGIN_PREFIXES) {
		if (lower.includes(prefix)) return name;
	}
	return plugin;
}

/**
 * @param {object|null} item — {plugin?, url?, seriesUrl?, id?}
 * @returns {string|null} eklenti adı ya da null (tahmin yok)
 */export function resolvePluginName(item) {
	if (!item) return null;
	// `pluginName` alanı native indirme kayıtlarında kullanılıyor.
	if (item.pluginName && typeof item.pluginName === "string") {
		const cozulen = fixPluginValue(item.pluginName);
		if (cozulen) return cozulen;
	}
	if (item.plugin && typeof item.plugin === "string") {
		return fixPluginValue(item.plugin);
	}
	const rawUrl =
		item.url ||
		item.seriesUrl ||
		(typeof item.id === "string" ? item.id : "");
	if (!rawUrl) return null;
	const lower = String(rawUrl).toLowerCase();

	for (const [prefix, plugin] of MIRROR_PLUGIN_PREFIXES) {
		if (lower.includes(prefix)) return plugin;
	}
	for (const name of KNOWN_PLUGINS) {
		if (lower.includes(name)) return name;
	}
	// Bilinmeyen host → tahmin YOK (madde 5'in kök nedeni buydu).
	return null;
}

/** Rozet/listeler için: ham yansı adı ("S231") çözülür; bilinmiyorsa ham
 *  değer korunur (null → davranış değişmesin). */
export function normalizePluginValue(plugin) {
	return resolvePluginName({ plugin }) || plugin || null;
}
