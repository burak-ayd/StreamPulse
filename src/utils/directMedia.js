/**
 * Doğrudan medya dosyası mı (progressive MP4) — HLS playlist değil.
 *
 * Kaynak seçimi için önemli: "Rapidrame" extractor'ı İKİ kaynak üretir
 * (HLS master + CehennemPass progressive MP4). Sadece extractor adına göre
 * tercih tutulursa ikisi ayırt edilemez → yanlış kaynak indirilir.
 */
export function isDirectMediaUrl(url) {
	if (typeof url !== "string") return false;
	const path = url.split("?")[0].toLowerCase();
	return (
		path.endsWith(".mp4") ||
		path.endsWith(".m4v") ||
		path.endsWith(".mkv") ||
		path.endsWith(".mov") ||
		path.endsWith(".webm")
	);
}

/**
 * Kaynak listesini indirme modalı ile AYNI sıraya getirir: doğrudan dosya
 * (progressive MP4) önce gelir — tek dosya indirme daha hızlı/verimli.
 */
export function preferDirectSources(sources) {
	if (!Array.isArray(sources)) return [];
	return [...sources].sort((a, b) => {
		const dogrudan = (s) => (isDirectMediaUrl(s?.result?.url) ? 0 : 1);
		return dogrudan(a) - dogrudan(b);
	});
}
