/**
 * Favoriler Birleştirme (Merge) — Set-Birleştirme (Add-Wins) + Tombstone
 *
 * Deterministik, sıra-bağımsız ve idempotent birleştirme sağlar.
 * HLC sıralaması: (wall, counter, deviceId)
 * Eşitlik durumunda: Ekleme silmeye karşı kazanır (Add-Wins).
 */

import { compare } from "../hlc";

const TOMBSTONE_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000; // 90 gün

/**
 * İçerik için benzersiz anahtar üretir (id veya url)
 * @param {object} item
 * @returns {string}
 */
export function getItemKey(item) {
	if (!item) return "";
	return String(item.id || item.url || "");
}

/**
 * Tek bir favori kaydı için iki sürümü birleştirir (LWW + Add-Wins)
 * @param {object} local - Yerel kayıt
 * @param {object} remote - Uzak / sunucudan gelen kayıt
 * @returns {object} Kazanan kayıt
 */
export function mergeSingleFavorite(local, remote) {
	if (!local && !remote) return null;
	if (!local) return remote;
	if (!remote) return local;

	const localHlc = local._hlc || { wall: 0, counter: 0 };
	const remoteHlc = remote._hlc || { wall: 0, counter: 0 };

	const cmp = compare(
		{ ...localHlc, deviceId: local._deviceId },
		{ ...remoteHlc, deviceId: remote._deviceId }
	);

	if (cmp > 0) {
		return local;
	} else if (cmp < 0) {
		return remote;
	}

	// HLC ve deviceId tamamen eşitse (nadir çakışma)
	// Add-Wins kuralı: biri silinmiş diğeri aktifse, aktif olan kazanır
	if (local._deleted && !remote._deleted) {
		return remote;
	}
	if (!local._deleted && remote._deleted) {
		return local;
	}

	// İkisi de aynı durumdaysa alanları birleştir
	return {
		...remote,
		...local,
		_hlc: localHlc,
		_deviceId: local._deviceId || remote._deviceId,
		_deleted: Boolean(local._deleted || remote._deleted),
	};
}

/**
 * İki favori listesini birleştirir.
 * @param {Array<object>} localList - Yerel favoriler (tombstone'lar dahil olabilir)
 * @param {Array<object>} remoteList - Uzaktan gelen favoriler
 * @returns {Array<object>} Birleşmiş liste (tombstone'lar dahil)
 */
export function mergeFavorites(localList = [], remoteList = []) {
	const map = new Map();
	const now = Date.now();

	const processItem = (item) => {
		if (!item) return;
		const key = getItemKey(item);
		if (!key) return;

		// 90 günden eski silinmiş tombstone'ları at
		if (item._deleted) {
			const itemWall = item._hlc?.wall || 0;
			if (itemWall > 0 && now - itemWall > TOMBSTONE_MAX_AGE_MS) {
				return;
			}
		}

		if (!map.has(key)) {
			map.set(key, item);
		} else {
			const existing = map.get(key);
			const merged = mergeSingleFavorite(existing, item);
			map.set(key, merged);
		}
	};

	// Sıra-bağımsızlık: her iki liste de aynı mantıkla map'e eklenir
	(localList || []).forEach(processItem);
	(remoteList || []).forEach(processItem);

	return Array.from(map.values());
}

/**
 * Sadece aktif (silinmemiş) favorileri UI için döndürür.
 * @param {Array<object>} allFavorites - Tombstone içeren liste
 * @returns {Array<object>}
 */
export function getActiveFavorites(allFavorites = []) {
	if (!Array.isArray(allFavorites)) return [];
	return allFavorites.filter((item) => !item._deleted);
}
