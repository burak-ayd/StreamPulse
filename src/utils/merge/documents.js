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
 * Gelen değeri listeye çevirir.
 *
 * ⚠️ `|| []` YETMEZ. Boş JSONB dizi bazı sunucu katmanlarında boş NESNE `{}`
 * olarak döner (Python'da `[] or {}` -> `{}`). `{}` truthy olduğu için
 * `payload || []` fallback'i onu yakalamaz ve `({}).forEach` undefined
 * döner → "undefined is not a function". Bu yüzden tip gerçekten doğrulanır.
 * @param {unknown} value
 * @returns {Array<unknown>}
 */
function asSearchList(value) {
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
}

/**
 * Tek bir geçmiş kaydını `{ q, time }` biçimine çevirir.
 *
 * ⚠️ ESKİ SÜRÜMLER DÜZ METİN yazıyordu (`["matrix", "dune"]`). Bir damga
 * taşımadıkları için birleştirmede hepsinin `time` değeri 0 kalıyordu ve
 * sıralama hiçbir şey yapmıyordu: başka cihazda yapılan aramalar listenin
 * SONUNA düşüyordu (kullanıcı bildirimi). Eski kayıtlar yine kabul edilir;
 * damgası sonradan `normalizeSearchHistory` tarafından verilir.
 *
 * @param {string|object} item
 * @returns {{q: string, time: number}|null}
 */
export function normalizeSearchEntry(item) {
	if (typeof item === "string") {
		const q = item.trim();
		return q ? { q, time: 0 } : null;
	}
	if (item && typeof item === "object") {
		const q = String(item.q ?? item.query ?? "").trim();
		if (!q) return null;
		const raw = Number(item.time ?? item._hlc?.wall ?? 0);
		return { q, time: Number.isFinite(raw) && raw > 0 ? raw : 0 };
	}
	return null;
}

/**
 * Geçmiş listesini normalize eder: her kayıt `{ q, time }` olur, tekrarlar
 * (büyük/küçük harf duyarsız) atılır, SIRA KORUNUR.
 *
 * `fallbackTime` ("şimdi") verilirse damgasız kayıtlara listenin KENDİ sırası
 * korunarak azalan damga atanır (`fallbackTime - index`). Böylece eski
 * sürümden gelen geçmiş ilk senkronizasyonda karışmaz; en üstteki kayıt
 * "şimdi", altındaki bir milisaniye önce sayılır.
 *
 * @param {Array<string|object>} rawList
 * @param {{fallbackTime?: number}} [options] - 0 = damgasızları olduğu gibi bırak
 * @returns {Array<{q: string, time: number}>}
 */
export function normalizeSearchHistory(rawList, { fallbackTime = 0 } = {}) {
	const out = [];
	const seen = new Set();

	asSearchList(rawList).forEach((item, index) => {
		const entry = normalizeSearchEntry(item);
		if (!entry) return;

		const key = entry.q.toLowerCase();
		if (seen.has(key)) return;
		seen.add(key);

		if (entry.time === 0 && fallbackTime > 0) {
			entry.time = fallbackTime - index;
		}
		out.push(entry);
	});

	return out;
}

/**
 * Arama geçmişini birleştirir: sorgu başına EN SON aranma anı kazanır,
 * liste bu damgaya göre yeniden-eskiye sıralanır, 20 kayıtta kırpılır.
 *
 * @param {Array<string|object>} localHistory
 * @param {Array<string|object>} remoteHistory
 * @returns {Array<{q: string, time: number}>}
 */
export function mergeSearchHistory(localHistory = [], remoteHistory = []) {
	const now = Date.now();
	const local = normalizeSearchHistory(localHistory, { fallbackTime: now });
	const remote = normalizeSearchHistory(remoteHistory, { fallbackTime: now });

	const itemsMap = new Map();

	const add = (norm) => {
		const key = norm.q.toLowerCase();
		const existing = itemsMap.get(key);
		if (!existing || norm.time > existing.time) {
			itemsMap.set(key, norm);
		}
	};

	local.forEach(add);
	remote.forEach(add);

	// Sırala: en son aranan en başta
	const sorted = Array.from(itemsMap.values()).sort((a, b) => b.time - a.time);

	return capList(sorted, SIZE_CAPS.search_history || 20);
}
