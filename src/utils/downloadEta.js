/**
 * İndirme kartındaki kalan süre tahmini.
 *
 * Native motor hızı (`speedBps`) ve toplam boyutu verdiğinde anlamlıdır;
 * bilinmiyorsa (0) kart bu satırı hiç göstermez — uydurma süre yazılmaz.
 *
 * @param {{speedBps?: number, totalBytes?: number, downloadedBytes?: number}} item
 * @returns {string|null} "48 sn kaldı" | "3 dk kaldı" | "2 sa 5 dk kaldı" | null
 */
export function etaLabel(item) {
	const speed = Number(item?.speedBps || 0);
	const total = Number(item?.totalBytes || 0);
	const kalan = total - Number(item?.downloadedBytes || 0);
	if (speed <= 0 || kalan <= 0) return null;
	const sn = Math.ceil(kalan / speed);
	if (sn < 60) return `${sn} sn kaldı`;
	if (sn < 3600) return `${Math.ceil(sn / 60)} dk kaldı`;
	return `${Math.floor(sn / 3600)} sa ${Math.ceil((sn % 3600) / 60)} dk kaldı`;
}
