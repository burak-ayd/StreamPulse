/**
 * Kullanıcı Belgeleri Birleştirme (Merge) — LWW + Belge Birleştirme
 *
 * player_settings, search_history, theme, selected_platform,
 * plugin_visibility, category_visibility, user_profile için birleştirme.
 */

import { compare } from "../hlc";
import { SIZE_CAPS, capList } from "../fieldWhitelist";

/**
 * İki belge nesnesini HLC LWW kuralıyla birleştirir.
 * @param {object} localDoc - { payload, _hlc, _deviceId, ... } veya düz obje
 * @param {object} remoteDoc - { payload, _hlc, _deviceId, ... } veya düz obje
 * @returns {object} Kazanan belge
 */
export function mergeDocument(localDoc, remoteDoc) {
	if (!localDoc && !remoteDoc) return null;
	if (!localDoc) return remoteDoc;
	if (!remoteDoc) return localDoc;

	const localHlc = localDoc._hlc || localDoc.hlc || { wall: 0, counter: 0 };
	const remoteHlc = remoteDoc._hlc || remoteDoc.hlc || { wall: 0, counter: 0 };

	const cmp = compare(
		{ ...localHlc, deviceId: localDoc._deviceId || localDoc.device_id },
		{ ...remoteHlc, deviceId: remoteDoc._deviceId || remoteDoc.device_id }
	);

	if (cmp > 0) {
		return localDoc;
	} else if (cmp < 0) {
		return remoteDoc;
	}

	// HLC eşitse alanları birleştir
	const localPayload = localDoc.payload || localDoc;
	const remotePayload = remoteDoc.payload || remoteDoc;

	const mergedPayload = {
		...remotePayload,
		...localPayload,
	};

	return {
		payload: mergedPayload,
		_hlc: localHlc,
		_deviceId: localDoc._deviceId || remoteDoc._deviceId,
	};
}

/**
 * Arama geçmişini birleştirir (Benzersiz sorgular, en yeniden en eskiye, cap 20)
 * @param {Array<string|object>} localHistory
 * @param {Array<string|object>} remoteHistory
 * @returns {Array<string>}
 */
export function mergeSearchHistory(localHistory = [], remoteHistory = []) {
	// ⚠️ `|| []` YETMEZ. Boş JSONB dizi bazı sunucu katmanlarında boş NESNE `{}`
	// olarak döner (Python'da `[] or {}` -> `{}`). `{}` truthy olduğu için
	// `payload || []` fallback'i onu yakalamaz ve `({}).forEach` undefined
	// döner → "undefined is not a function". Bu yüzden tip gerçekten doğrulanır.
	const asList = (value) => {
		if (Array.isArray(value)) return value;
		if (typeof value === "string" && value.trim().length > 0) {
			// Bazı istemciler JSON metni gönderebilir; bir kez çözmeyi dene
			try {
				const parsed = JSON.parse(value);
				return Array.isArray(parsed) ? parsed : [];
			} catch {
				return [];
			}
		}
		return [];
	};

	const normalizeItem = (item) => {
		if (typeof item === "string") return { q: item.trim(), time: 0 };
		if (item && typeof item === "object") {
			return {
				q: (item.q || item.query || "").trim(),
				time: item._hlc?.wall || item.time || 0,
			};
		}
		return null;
	};

	const itemsMap = new Map();

	const add = (item) => {
		const norm = normalizeItem(item);
		if (!norm || !norm.q) return;

		const existing = itemsMap.get(norm.q.toLowerCase());
		if (!existing || norm.time > existing.time) {
			itemsMap.set(norm.q.toLowerCase(), norm);
		}
	};

	asList(localHistory).forEach(add);
	asList(remoteHistory).forEach(add);

	// Sırala: en son aranan en başta
	const sorted = Array.from(itemsMap.values()).sort((a, b) => b.time - a.time);

	// String array olarak dön ve sınırla (20)
	const stringList = sorted.map((s) => s.q);
	return capList(stringList, SIZE_CAPS.search_history || 20);
}
