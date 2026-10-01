/**
 * Kütüphane Kayıtları Birleştirme (Merge) — LWW + Tombstone
 *
 * watchlist, watch_history, continue_watching için birleştirme.
 * HLC sıralaması (wall, counter, deviceId).
 * Boyut kapakları ve alan beyaz listesi uygulanır.
 */

import { compare } from "../hlc";
import { capList, SIZE_CAPS } from "../fieldWhitelist";

const TOMBSTONE_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * İçerik için benzersiz anahtar
 * @param {object} item
 * @returns {string}
 */
export function getLibraryItemKey(item) {
	if (!item) return "";
	return String(item.id || item.url || item.content_id || "");
}

/**
 * Tek bir kütüphane kaydı için iki sürümü birleştirir (LWW)
 * @param {object} local
 * @param {object} remote
 * @returns {object}
 */
export function mergeSingleLibraryItem(local, remote) {
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

	// HLC eşitse: izleme ilerlemesi (currentTime veya progress) büyük olan kazanır
	const localProg = local.currentTime || local.progress || 0;
	const remoteProg = remote.currentTime || remote.progress || 0;

	if (localProg !== remoteProg) {
		return localProg >= remoteProg ? local : remote;
	}

	// Son çare: remote ile local'i birleştir
	return {
		...remote,
		...local,
		_hlc: localHlc,
		_deviceId: local._deviceId || remote._deviceId,
	};
}

/**
 * İki kütüphane listesini birleştirir.
 * @param {Array<object>} localList
 * @param {Array<object>} remoteList
 * @param {string} type - 'watchlist' | 'watch_history' | 'continue_watching'
 * @returns {Array<object>}
 */
export function mergeLibraryList(localList = [], remoteList = [], type = "watchlist") {
	const map = new Map();
	const now = Date.now();

	const processItem = (item) => {
		if (!item) return;
		const key = getLibraryItemKey(item);
		if (!key) return;

		// 90 günden eski silinmiş kayıtları filtrele
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
			const merged = mergeSingleLibraryItem(existing, item);
			map.set(key, merged);
		}
	};

	(localList || []).forEach(processItem);
	(remoteList || []).forEach(processItem);

	let result = Array.from(map.values());

	// Sıralama: watch_history ve continue_watching için en son izlenen / güncellenen başta
	if (type === "watch_history" || type === "continue_watching") {
		result.sort((a, b) => {
			const timeA = new Date(a.watchedAt || a.updatedAt || a._hlc?.wall || 0).getTime();
			const timeB = new Date(b.watchedAt || b.updatedAt || b._hlc?.wall || 0).getTime();
			return timeB - timeA;
		});
	}

	// Boyut kapağı uygula
	const cap = SIZE_CAPS[type] || 100;
	return capList(result, cap);
}

/**
 * Aktif (silinmemiş) kayıtları filtreler.
 * @param {Array<object>} list
 * @returns {Array<object>}
 */
export function getActiveLibraryItems(list = []) {
	if (!Array.isArray(list)) return [];
	return list.filter((item) => !item._deleted);
}
