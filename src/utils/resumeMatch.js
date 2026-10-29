/*
 * Devam-izleme kaydı eşleştirme (madde 11).
 * Keni eşi: dizi kayıtları için sezon/bölüm de eşleşmelidir; aksi halde
 * yeni bölümün devam konumu eski bölümün konumuna düşer.
 */

/**
 * @param {object} entry — kayıt ({id, url?, seriesTitle?, season?, episode?})
 * @param {{contentId?: string, url?: string, seriesTitle?: string, season?: number, episode?: number}} target
 * @returns {boolean}
 */
export function matchesResumeEntry(entry, target = {}) {
	if (!entry) return false;

	const idMatch =
		target.contentId != null &&
		(entry.id === target.contentId || entry.url === target.contentId);
	const urlMatch =
		target.url != null && (entry.url === target.url || entry.id === target.url);
	// Üçüncü kanal (eski kayıtlar): içerik kimliği taşımayan kayıtlarda
	// dizi adı + sezon/bölüm eşleşmesi yeter (İndirilenler'den oynatma).
	const titleMatch =
		target.seriesTitle != null &&
		String(entry.seriesTitle || "").toLowerCase().trim() ===
			String(target.seriesTitle).toLowerCase().trim() &&
		Number.isFinite(Number(target.season)) &&
		Number.isFinite(Number(target.episode));
	if (!idMatch && !urlMatch && !titleMatch) return false;

	// Bölüm kaydıysa (kayıtta sezon/bölüm var): zorunlu eşleşme.
	// Film kayıtları bu alanları taşımaz; hedefteki sezon/bölüm yok sayılır.
	const isEpisodeEntry = entry.season != null || entry.episode != null;
	if (isEpisodeEntry) {
		const season = Number(target.season);
		const episode = Number(target.episode);
		if (
			Number(entry.season) !== season ||
			Number(entry.episode) !== episode
		) {
			return false;
		}
	}
	return true;
}
