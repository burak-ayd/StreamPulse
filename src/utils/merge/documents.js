/**
 * Kullanıcı Belgeleri Birleştirme (Merge) — LWW + Belge Birleştirme
 *
 * player_settings, search_history, theme, selected_platform,
 * plugin_visibility, category_visibility, user_profile için birleştirme.
 *
 * ⚠️ `search_history` diğer belgelerden farklıdır: içeriği tek parça LWW ile
 * ezilmez, kayıt kayıt birleştirilir (bkz. `mergeSearchHistoryDoc`). Belge v2
 * biçimindedir: `{ items, deleted, clearedAt }` — silme kayıtları ve
 * "tümünü temizle" damgası olmadan, öteki cihazdaki kopya silinen aramayı
 * geri getirirdi.
 */

import { compare } from "../hlc";
import { SIZE_CAPS, capList } from "../fieldWhitelist";

/** Arama geçmişi belgesinin sürümü (v1 = düz dizi, v2 = items/deleted/clearedAt). */
const SEARCH_DOC_VERSION = 2;

/**
 * Eski sürümden (düz metin dizi) gelen, damgası olmayan kayıtların
 * geriye tarihlenme miktarı.
 *
 * "Şimdi" damgası verilseydi bu kayıtlar yeni bir aramadan da yeni bir silme
 * kaydından da yeni sayılırdı: başka cihazda silinen bir sorgu, bu cihazın
 * eski listesinde durduğu için geri gelirdi.
 */
const LEGACY_BACKDATE_MS = 60 * 60 * 1000;

/**
 * Silme kaydının (tombstone) ömrü: bu süreden eski kayıtlar taşınmaz.
 * Listeler 20 kayıtta kırpıldığı için bu yaştan eski bir kaydın herhangi bir
 * cihazda hâlâ durması beklenmez.
 */
const TOMBSTONE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

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
 * damgası sonradan `resolveSearchDoc` tarafından verilir.
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
		return { q, time: Number.isFinite(raw) && raw !== 0 ? raw : 0 };
	}
	return null;
}

/**
 * Kayıt listesini tekilleştirir: aynı sorgunun EN YENİ damgalı hâli kalır.
 * @param {Array<unknown>} rawList
 * @returns {Array<{q: string, time: number}>}
 */
function dedupeSearchEntries(rawList) {
	const byQuery = new Map();

	asSearchList(rawList).forEach((item) => {
		const entry = normalizeSearchEntry(item);
		if (!entry) return;
		const key = entry.q.toLowerCase();
		const existing = byQuery.get(key);
		if (!existing || entry.time > existing.time) {
			byQuery.set(key, entry);
		}
	});

	return Array.from(byQuery.values());
}

/**
 * Arama geçmişi belgesini (v2) normalize eder.
 *
 * Belge biçimi:
 *   { v: 2, items: [{q, time}], deleted: [{q, time}], clearedAt: number }
 *
 * `items`  → görünen geçmiş (en yeni önce, ≤20).
 * `deleted`→ SİLME KAYITLARI (tombstone). Silinen sorgu listeden çıkar ama
 *            buraya damgasıyla yazılır; aksi halde öteki cihazın listesinde
 *            duran kopya bir sonraki birleştirmede öğeyi GERİ GETİRİR
 *            (kullanıcı bildirimi: "sildiğim aramalar diğer cihazdan geri
 *            geliyor").
 * `clearedAt` → "Tümünü Temizle" damgası: bu andan eski tüm kayıtlar hem
 *            yerelde hem öteki cihazlarda düşer. Yalnızca boş liste göndermek
 *            yetmiyordu; birleştirme boş listeyi "hiç kayıt yok" sayıp
 *            sunucudaki kopyayı geri getiriyordu.
 *
 * v1 (düz dizi) ve bozuk/boş payload'lar da kabul edilir.
 *
 * @param {unknown} raw
 * @returns {{v: number, items: Array<{q,time}>, deleted: Array<{q,time}>, clearedAt: number}}
 */
export function normalizeSearchDoc(raw) {
	if (Array.isArray(raw)) {
		// v1: düz liste (["matrix"] veya [{q, time}])
		return {
			v: SEARCH_DOC_VERSION,
			items: dedupeSearchEntries(raw),
			deleted: [],
			clearedAt: 0,
		};
	}

	if (raw && typeof raw === "object") {
		const clearedAt = Number(raw.clearedAt);
		return {
			v: SEARCH_DOC_VERSION,
			items: dedupeSearchEntries(raw.items),
			deleted: dedupeSearchEntries(raw.deleted),
			clearedAt: Number.isFinite(clearedAt) && clearedAt > 0 ? clearedAt : 0,
		};
	}

	return {
		v: SEARCH_DOC_VERSION,
		items: [],
		deleted: [],
		clearedAt: 0,
	};
}

/**
 * Belgeyi tek ve tutarlı bir hâle getirir.
 *
 *   1. Damgasız kayıtlar tarihlenir. Damga "şimdi" DEĞİL, `now - 1 saat`tir:
 *      eski sürümden gelen geçmiş yeni bir aramadan ve yeni bir silme
 *      kaydından DAİMA eski sayılmalı, ama kendi içindeki sıra korunmalı.
 *      ("şimdi" damgası verilseydi, başka cihazda yapılan bir silme bu eski
 *      kayıtları silemezdi.)
 *   2. Silme kayıtları yaşlandırılır ve sınırlanır (tombstone budama).
 *   3. `clearedAt` damgasından eski kayıtlar düşer (Tümünü Temizle).
 *   4. Silme kaydı kadar yeni olmayan kayıtlar düşer (tombstone uygulanır);
 *      yeniden aranmış sorgunun silme kaydı artık gereksizdir, atılır.
 *   5. Görünen liste en yeni önce sıralanır ve 20'de kırpılır.
 *
 * @param {{v?: number, items?: Array<unknown>, deleted?: Array<unknown>, clearedAt?: number}} doc
 * @param {{now?: number}} [options]
 * @returns {{v: number, items: Array<{q,time}>, deleted: Array<{q,time}>, clearedAt: number}}
 */
export function resolveSearchDoc(doc, { now = Date.now() } = {}) {
	const normalized = normalizeSearchDoc(doc);
	const legacyBase = now - LEGACY_BACKDATE_MS;

	// 1) Damgasız kayıtları, kendi sıralarını koruyarak geriye tarihle.
	const stampLegacy = (list) =>
		list.map((entry, index) =>
			entry.time > 0 ? entry : { q: entry.q, time: legacyBase - index },
		);

	const items = stampLegacy(normalized.items);
	const clearedAt = normalized.clearedAt;

	// 2) Silme kayıtları: eskimiş olanlar atılır (yaş + sayı sınırı), en yeni önce.
	const tombstones = stampLegacy(normalized.deleted)
		.filter((entry) => entry.time >= now - TOMBSTONE_MAX_AGE_MS)
		.sort((a, b) => b.time - a.time)
		.slice(0, SIZE_CAPS.search_history_deleted || 50);

	const tombstoneByQuery = new Map(
		tombstones.map((entry) => [entry.q.toLowerCase(), entry.time]),
	);

	// 3) Tümünü Temizle: damgadan eski kayıtlar düşer.
	const alive = items.filter((entry) => entry.time >= clearedAt);

	// 4) Silme kaydı kaydı bastırır (eşitlikte silme kazanır: aynı milisaniyede
	//    hem arama hem silme olan bir yarışta kullanıcının son hareketi silmedir).
	const survivors = alive.filter((entry) => {
		const deletedAt = tombstoneByQuery.get(entry.q.toLowerCase());
		return deletedAt === undefined || entry.time > deletedAt;
	});

	// 4b) Yeniden aranan sorgu: kaydın damgası silme kaydından yeni olduğu için
	//     silme kaydı artık işe yaramaz ve taşınmasına gerek yoktur.
	const keptTombstones = tombstones.filter(
		(entry) => !survivors.some((item) => item.q.toLowerCase() === entry.q.toLowerCase()),
	);

	// 5) En yeni önce, 20 kayıtta kırpılmış.
	return {
		v: SEARCH_DOC_VERSION,
		items: capList(
			survivors.sort((a, b) => b.time - a.time),
			SIZE_CAPS.search_history || 20,
		),
		deleted: keptTombstones,
		clearedAt,
	};
}

/**
 * Sunucudan gelen arama geçmişi belgesini yerel belgeyle birleştirir.
 *
 * Sorgu başına EN SON damga kazanır; silme kaydı kaydı bastırır; "Tümünü
 * Temizle" damgası iki taraftan en yenisi olur.
 *
 * @param {unknown} localDoc - v2 belge veya v1 dizi
 * @param {unknown} remoteDoc - v2 belge veya v1 dizi
 * @returns {{v: number, items: Array<{q,time}>, deleted: Array<{q,time}>, clearedAt: number}}
 */
export function mergeSearchHistoryDoc(localDoc = null, remoteDoc = null) {
	const local = normalizeSearchDoc(localDoc);
	const remote = normalizeSearchDoc(remoteDoc);

	return resolveSearchDoc({
		v: SEARCH_DOC_VERSION,
		items: [...local.items, ...remote.items],
		deleted: [...local.deleted, ...remote.deleted],
		clearedAt: Math.max(local.clearedAt, remote.clearedAt),
	});
}
