/**
 * Senkronizasyon Motoru (Sync Engine)
 *
 * Sorumluluklar:
 * - push / pull orkestrasyonu
 * - Delta çekme (?since=<son_zaman>)
 * - Çakışma uzlaştırma (rejected sunucu sürümünü yerelle birleştirme)
 * - Kuyruk ve debounce
 * - Ağ ve kimlik doğrulama kontrolleri
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { authFetch, getAuthOutcome, REFRESH_OUTCOME } from "./apiClient";
import { getDeviceId, getDeviceName, getDevicePlatform } from "@/utils/deviceId";
import { now as getHlcNow } from "@/utils/hlc";
import { filterPayload } from "@/utils/fieldWhitelist";
import { mergeFavorites } from "@/utils/merge/favorites";
import { mergeLibraryList } from "@/utils/merge/library";
import { mergeDocument, mergeSearchHistory } from "@/utils/merge/documents";
import { notifyStorageChange } from "@/utils/storageListener";
import { hasSession } from "./token";
import { STORAGE_KEYS } from "@/utils/storage";

const LAST_SYNCED_KEY = STORAGE_KEYS.LAST_SYNCED_AT;
const PENDING_CHANGES_KEY = STORAGE_KEYS.PENDING_SYNC_COUNT;
const SYNC_OWNER_KEY = STORAGE_KEYS.SYNC_OWNER;

/**
 * Otomatik senkronize edilen ayar/kayıt grupları.
 *
 * Sunucu tarafında karşılık gelen belge türleri `DOCUMENT_TYPES` ile aynıdır
 * (player_settings, search_history, plugin_visibility, category_visibility).
 *
 * `selected_platform` BİLEREK burada yoktur: seçili platform cihaza özeldir
 * (telefon Dizipox, TV HDFilmCehennemi kullanıyor olabilir) ve global
 * senkronizasyonda cihazları birbirine karıştırır.
 *
 * @type {{[group: string]: {label: string, doc: string, key: string}}}
 */
export const SYNC_GROUPS = {
	player_settings: {
		label: "Oynatıcı ve altyazı ayarları",
		doc: "player_settings",
		key: STORAGE_KEYS.PLAYER_SETTINGS,
	},
	search_history: {
		label: "Arama geçmişi",
		doc: "search_history",
		key: STORAGE_KEYS.SEARCH_HISTORY,
	},
	plugin_visibility: {
		label: "Eklenti görünürlüğü",
		doc: "plugin_visibility",
		key: STORAGE_KEYS.PLUGIN_VISIBILITY,
	},
	category_visibility: {
		label: "Kategori görünürlüğü",
		doc: "category_visibility",
		key: STORAGE_KEYS.CATEGORY_VISIBILITY,
	},
};

/** Tüm grup adları (varsayılan: hepsi = global). */
export const ALL_SYNC_GROUPS = Object.keys(SYNC_GROUPS);


let _isSyncing = false;

/**
 * Anlık push kuyruğu.
 *
 * `syncNow` çalışırken yeni bir değişiklik gelirse (ör. kullanıcı video
 * izlerken ayar değiştirdi) push doğrudan düşürülürse o değişiklik KAYBOLUR.
 * Bu bayrak, mevcut tur bitince bir tur daha çalıştırılmasını ister.
 */
let _resyncRequested = false;
let _debounceTimer = null;
const DEBOUNCE_DELAY_MS = 2000;

// Sync durum dinleyicileri
const syncListeners = new Set();

function emitSyncState(state) {
	syncListeners.forEach((listener) => {
		try {
			listener(state);
		} catch (err) {
			console.warn("Sync listener hatası:", err);
		}
	});
}

/**
 * Sync durum değişikliklerine abone olur
 * @param {(state: { status: 'idle'|'syncing'|'error', lastSyncedAt: string|null, error: any }) => void} callback
 */
export function subscribeSyncState(callback) {
	syncListeners.add(callback);
	return () => syncListeners.delete(callback);
}

/**
 * Son başarılı senkronizasyon zamanını getirir
 * @returns {Promise<string|null>}
 */
export async function getLastSyncedAt() {
	try {
		return await AsyncStorage.getItem(LAST_SYNCED_KEY);
	} catch {
		return null;
	}
}

/**
 * Son başarılı senkronizasyon zamanını kaydeder
 * @param {string} isoString
 */
export async function setLastSyncedAt(isoString) {
	try {
		await AsyncStorage.setItem(LAST_SYNCED_KEY, isoString);
	} catch (err) {
		console.warn("Son sync zamanı kaydedilemedi:", err);
	}
}

/**
 * Bekleyen yerel değişiklik sayısını getirir
 */
export async function getPendingChangesCount() {
	try {
		const val = await AsyncStorage.getItem(PENDING_CHANGES_KEY);
		return val ? parseInt(val, 10) : 0;
	} catch {
		return 0;
	}
}

export async function setPendingChangesCount(count) {
	try {
		await AsyncStorage.setItem(PENDING_CHANGES_KEY, String(Math.max(0, count)));
	} catch {}
}

/**
 * Delta damgasının sahibi olan hesabı bildirir.
 *
 * ⚠️ Damga bir "bu cihaz şu ana kadar şunu indirdi" işaretidir ve HESABA BAĞLIDIR.
 * Cihaz geneli tutulursa iki kullanıcı birbirinin damgasını miras alır:
 * Kullanıcı B giriş yaptığında `since` Kullanıcı A'nın damgası olur, sunucudaki
 * B kayıtları daha eski sayılır ve B hiçbir şey görmez.
 *
 * Hesap değiştiyse damga silinir → yeni hesap tam döküm çeker.
 *
 * @param {string|null} userId - Oturumdaki kullanıcı kimliği
 */
export async function setSyncOwner(userId) {
	if (!userId) return;
	try {
		const prev = await AsyncStorage.getItem(SYNC_OWNER_KEY);
		if (prev && prev !== userId) {
			await AsyncStorage.multiRemove([LAST_SYNCED_KEY, PENDING_CHANGES_KEY]);
		}
		if (prev !== userId) {
			await AsyncStorage.setItem(SYNC_OWNER_KEY, userId);
		}
	} catch (err) {
		console.warn("Sync sahibi kaydedilemedi:", err);
	}
}

/**
 * Senkronizasyon durumunu tamamen sıfırlar (çıkış / veri temizleme).
 * Sonraki senkronizasyon tam döküm çeker.
 */
export async function resetSyncState() {
	try {
		await AsyncStorage.multiRemove([
			LAST_SYNCED_KEY,
			PENDING_CHANGES_KEY,
			SYNC_OWNER_KEY,
		]);
	} catch (err) {
		console.warn("Sync durumu sıfırlanamadı:", err);
	}
}

/**
 * Cihaz meta verilerini hazırlar
 */
async function getDeviceMetadata() {
	const [deviceId, deviceName] = await Promise.all([
		getDeviceId(),
		getDeviceName(),
	]);

	return {
		device_id: deviceId,
		device_name: deviceName,
		platform: getDevicePlatform(),
		app_version: "1.0.0",
	};
}

/**
 * AsyncStorage'daki senkronize edilebilir yerel verileri toplar (Push payload'ı için)
 */
async function collectLocalPushData() {
	const deviceId = await getDeviceId();
	const records = [];
	const documents = {};
	// Gerçekte gönderilen gruplar (raporlama için)
	const sent = [];

	// 1. Favoriler
	try {
		const rawFavs = await AsyncStorage.getItem("user_favorites");
		if (rawFavs) {
			const favs = JSON.parse(rawFavs);
			if (Array.isArray(favs)) {
				favs.forEach((item) => {
					records.push({
						item_type: "favorite",
						content_id: String(item.id || item.url),
						payload: filterPayload(item),
						is_deleted: Boolean(item._deleted),
						hlc: item._hlc || getHlcNow(),
						device_id: item._deviceId || deviceId,
						client_updated_at: item.updatedAt || new Date().toISOString(),
					});
				});
			}
		}
	} catch (e) {
		console.warn("Favoriler push verisi toplanırken hata:", e);
	}

	// 2. Watchlist (Listem)
	try {
		const rawWl = await AsyncStorage.getItem("user_watchlist");
		if (rawWl) {
			const wl = JSON.parse(rawWl);
			if (Array.isArray(wl)) {
				wl.forEach((item) => {
					records.push({
						item_type: "watchlist",
						content_id: String(item.id || item.url),
						payload: filterPayload(item),
						is_deleted: Boolean(item._deleted),
						hlc: item._hlc || getHlcNow(),
						device_id: item._deviceId || deviceId,
						client_updated_at: item.updatedAt || new Date().toISOString(),
					});
				});
			}
		}
	} catch (e) {
		console.warn("Watchlist push verisi toplanırken hata:", e);
	}

	// 3. Watch History
	try {
		const rawWh = await AsyncStorage.getItem("user_watch_history");
		if (rawWh) {
			const wh = JSON.parse(rawWh);
			if (Array.isArray(wh)) {
				wh.forEach((item) => {
					records.push({
						item_type: "watch_history",
						content_id: String(item.id || item.url),
						payload: filterPayload(item),
						is_deleted: Boolean(item._deleted),
						hlc: item._hlc || getHlcNow(),
						device_id: item._deviceId || deviceId,
						client_updated_at: item.watchedAt || item.updatedAt || new Date().toISOString(),
					});
				});
			}
		}
	} catch (e) {
		console.warn("Geçmiş push verisi toplanırken hata:", e);
	}

	// 4. Continue Watching
	try {
		const rawCw = await AsyncStorage.getItem("user_continue_watching");
		if (rawCw) {
			const cw = JSON.parse(rawCw);
			if (Array.isArray(cw)) {
				cw.forEach((item) => {
					records.push({
						item_type: "continue_watching",
						content_id: String(item.id || item.url),
						payload: filterPayload(item),
						is_deleted: Boolean(item._deleted),
						hlc: item._hlc || getHlcNow(),
						device_id: item._deviceId || deviceId,
						client_updated_at: item.updatedAt || new Date().toISOString(),
					});
				});
			}
		}
	} catch (e) {
		console.warn("Devam et push verisi toplanırken hata:", e);
	}

	// 5. Belgeler (Documents)
	//    Yalnızca seçili gruplar gönderilir — kullanıcı yedekleme sırasında
	//    hangi ayarların kopyalanacağını seçebilir.
	const doc = async (group) => {
		const meta = SYNC_GROUPS[group];
		try {
			const raw = await AsyncStorage.getItem(meta.key);
			if (raw === null || raw === undefined) return;
			documents[meta.doc] = {
				payload: JSON.parse(raw),
				hlc: getHlcNow(),
				device_id: deviceId,
				client_updated_at: new Date().toISOString(),
			};
			sent.push(group);
		} catch (e) {
			console.warn(`${meta.label} push verisi toplanırken hata:`, e);
		}
	};

	await doc("player_settings");
	await doc("search_history");
	await doc("plugin_visibility");
	await doc("category_visibility");

	return { records, documents, sentGroups: sent };
}

/**
 * Sunucudan gelen delta verilerini (pull yanıtı) yerel depolama ile birleştirir.
 * @param {object} pullData
 * @param {string[]} [groups] - Uygulanacak belge grupları (varsayılan: tümü)
 */
async function applyPullData(pullData) {
	if (!pullData) return;
	const { records = [], documents = {} } = pullData;

	// Türlerine göre kayıtları ayır
	const favRecords = [];
	const wlRecords = [];
	const whRecords = [];
	const cwRecords = [];

	records.forEach((rec) => {
		const item = {
			...(rec.payload || {}),
			id: rec.content_id,
			_hlc: rec.hlc,
			_deviceId: rec.device_id,
			_deleted: Boolean(rec.is_deleted),
		};

		if (rec.item_type === "favorite") favRecords.push(item);
		else if (rec.item_type === "watchlist") wlRecords.push(item);
		else if (rec.item_type === "watch_history") whRecords.push(item);
		else if (rec.item_type === "continue_watching") cwRecords.push(item);
	});

	// Favorileri birleştir
	if (favRecords.length > 0) {
		try {
			const localRaw = await AsyncStorage.getItem("user_favorites");
			const localList = localRaw ? JSON.parse(localRaw) : [];
			const merged = mergeFavorites(localList, favRecords);
			await AsyncStorage.setItem("user_favorites", JSON.stringify(merged));
			notifyStorageChange("user_favorites", merged, { source: "sync" });
		} catch (e) {
			console.error("Pull favori birleştirme hatası:", e);
		}
	}

	// Watchlist birleştir
	if (wlRecords.length > 0) {
		try {
			const localRaw = await AsyncStorage.getItem("user_watchlist");
			const localList = localRaw ? JSON.parse(localRaw) : [];
			const merged = mergeLibraryList(localList, wlRecords, "watchlist");
			await AsyncStorage.setItem("user_watchlist", JSON.stringify(merged));
			notifyStorageChange("user_watchlist", merged, { source: "sync" });
		} catch (e) {
			console.error("Pull watchlist birleştirme hatası:", e);
		}
	}

	// Watch history birleştir
	if (whRecords.length > 0) {
		try {
			const localRaw = await AsyncStorage.getItem("user_watch_history");
			const localList = localRaw ? JSON.parse(localRaw) : [];
			const merged = mergeLibraryList(localList, whRecords, "watch_history");
			await AsyncStorage.setItem("user_watch_history", JSON.stringify(merged));
			notifyStorageChange("user_watch_history", merged, { source: "sync" });
		} catch (e) {
			console.error("Pull izleme geçmişi birleştirme hatası:", e);
		}
	}

	// Continue watching birleştir
	if (cwRecords.length > 0) {
		try {
			const localRaw = await AsyncStorage.getItem("user_continue_watching");
			const localList = localRaw ? JSON.parse(localRaw) : [];
			const merged = mergeLibraryList(localList, cwRecords, "continue_watching");
			await AsyncStorage.setItem("user_continue_watching", JSON.stringify(merged));
			notifyStorageChange("user_continue_watching", merged, { source: "sync" });
		} catch (e) {
			console.error("Pull devam et birleştirme hatası:", e);
		}
	}

	// Belgeleri birleştir
	if (documents.player_settings) {
		try {
			const localRaw = await AsyncStorage.getItem("app_player_settings");
			const localSettings = localRaw ? JSON.parse(localRaw) : null;
			const merged = mergeDocument(localSettings, documents.player_settings);
			const payload = merged?.payload || merged;
			if (payload) {
				await AsyncStorage.setItem("app_player_settings", JSON.stringify(payload));
				notifyStorageChange("app_player_settings", payload, { source: "sync" });
			}
		} catch (e) {
			console.error("Pull player_settings birleştirme hatası:", e);
		}
	}

	if (documents.search_history) {
		try {
			const localRaw = await AsyncStorage.getItem("user_search_history");
			const localHistory = localRaw ? JSON.parse(localRaw) : [];
			// Sunucu boş diziyi `{}` olarak dönebilir; mergeSearchHistory zaten
			// tipi doğruluyor ama burada da netleştiriyoruz.
			const rawRemote = documents.search_history?.payload;
			const remoteHistory = Array.isArray(rawRemote) ? rawRemote : [];
			const merged = mergeSearchHistory(localHistory, remoteHistory);
			await AsyncStorage.setItem("user_search_history", JSON.stringify(merged));
			notifyStorageChange("user_search_history", merged, { source: "sync" });
		} catch (e) {
			console.error("Pull search_history birleştirme hatası:", e);
		}
	}

	// ── Global görünürlük belgeleri ──────────────────────────
	// Bu ayarlar hesap genelinde GEÇERLİDİR (bir cihazda yapılan değişiklik
	// tüm cihazlara yansır). Birleştirme sunucu-otoriter: sunucunun verdiği
	// değerler uygulanır, sunucunun bilmediği yerel anahtarlar korunur.
	for (const group of ["plugin_visibility", "category_visibility"]) {
		const doc = documents[SYNC_GROUPS[group].doc];
		if (!doc) continue;
		if (doc.is_deleted) continue; // tombstone: görünürlük haritası silinmez

		try {
			const meta = SYNC_GROUPS[group];
			const remote = doc.payload || {};
			const localRaw = await AsyncStorage.getItem(meta.key);
			const local = localRaw ? JSON.parse(localRaw) : {};

			const merged = group === "category_visibility"
				? mergeNestedVisibility(local, remote)
				: { ...local, ...remote };

			await AsyncStorage.setItem(meta.key, JSON.stringify(merged));
			notifyStorageChange(meta.key, merged, { source: "sync" });
		} catch (e) {
			console.error(`Pull ${SYNC_GROUPS[group].label} birleştirme hatası:`, e);
		}
	}
}

/**
 * `{ eklenti: { kategori: bool } }` yapısını sunucu-otoriter birleştirir.
 * İki katmanlı olduğu için düz yayılım yetmez: iç haritalar da ayrı ayrı
 * birleştirilir, aksi halde bir eklentinin tüm kategorileri diğer cihazdaki
 * değişikliklerle ezilir.
 */
function mergeNestedVisibility(local = {}, remote = {}) {
	const out = { ...local };
	for (const [plugin, remoteCats] of Object.entries(remote || {})) {
		if (!remoteCats || typeof remoteCats !== "object") continue;
		out[plugin] = { ...(out[plugin] || {}), ...remoteCats };
	}
	return out;
}

/**
 * Sunucunun reddettiği (rejected) kayıtları yerel sürüm ile uzlaştırır.
 */
async function reconcileRejectedItems(rejected = [], documentsRejected = []) {
	if (rejected.length > 0) {
		const favs = [];
		const wls = [];
		const whs = [];
		const cws = [];

		rejected.forEach((rej) => {
			if (!rej.server_version) return;
			const item = {
				...(rej.server_version.payload || {}),
				id: rej.content_id,
				_hlc: rej.server_version.hlc,
				_deviceId: rej.server_version.device_id,
				_deleted: Boolean(rej.server_version.is_deleted),
			};

			if (rej.item_type === "favorite") favs.push(item);
			else if (rej.item_type === "watchlist") wls.push(item);
			else if (rej.item_type === "watch_history") whs.push(item);
			else if (rej.item_type === "continue_watching") cws.push(item);
		});

		// applyPullData ile aynı birleştirme uygulanır
		await applyPullData({
			records: [
				...favs.map((f) => ({ item_type: "favorite", content_id: f.id, payload: f, hlc: f._hlc, device_id: f._deviceId, is_deleted: f._deleted })),
				...wls.map((w) => ({ item_type: "watchlist", content_id: w.id, payload: w, hlc: w._hlc, device_id: w._deviceId, is_deleted: w._deleted })),
				...whs.map((h) => ({ item_type: "watch_history", content_id: h.id, payload: h, hlc: h._hlc, device_id: h._deviceId, is_deleted: h._deleted })),
				...cws.map((c) => ({ item_type: "continue_watching", content_id: c.id, payload: c, hlc: c._hlc, device_id: c._deviceId, is_deleted: c._deleted })),
			],
		});
	}
}

/**
 * Ana senkronizasyon fonksiyonu (Push -> Pull döngüsü)
 *
 * ⚠️ SIRA ÖNEMLİ: önce PUSH, sonra PULL.
 * Ters sırada (pull → push) bir senkronizasyon tam olarak yerel bir değişikliğin
 * üstüne denk gelirse, pull sunucudaki ESKİ değeri yerele yazar ve push da bu
 * ezilmiş değeri geri gönderir — yerel değişiklik kalıcı olarak kaybolur.
 * Önce push ile yerel durum en yeni HLC ile sunucuya yazılır; LWW kararını sunucu
 * verir, sonraki pull güncel hali (kendi değişikliğimiz dahil) geri getirir.
 *
 * @param {object} [options]
 * @param {boolean} [options.full] - `since` damgasını yok sayıp tam döküm çek
 * @returns {Promise<{ success: boolean, error?: string, pushed?: boolean }>}
 */
export async function syncNow(options = {}) {
	const full = Boolean(options.full);

	const loggedIn = await hasSession();
	if (!loggedIn) {
		return { success: false, error: "not_authenticated" };
	}

	if (_isSyncing) {
		// Devam eden bir tur varsa onu DÜŞÜRME. Tur bitince yeniden çalıştır,
		// yoksa o araya gelen değişiklik sunucuya hiç ulaşmaz.
		_resyncRequested = true;
		return { success: false, error: "already_syncing" };
	}

	_isSyncing = true;
	emitSyncState({ status: "syncing", lastSyncedAt: await getLastSyncedAt(), error: null });

	try {
		const lastSynced = await getLastSyncedAt();
		const device = await getDeviceMetadata();

		// ─── 1. PUSH (Yerel değişiklikleri sunucuya gönder) ──────
		const localData = await collectLocalPushData();
		const pushRes = await authFetch("/api/sync/push", {
			method: "POST",
			body: JSON.stringify({
				device,
				records: localData.records,
				documents: localData.documents,
			}),
		});

		let pushed = false;
		let pushError = null;
		let pushDetail = "";
		const sentCount = (localData.sentGroups || []).length;

		if (pushRes.ok) {
			pushed = true;
			const pushData = await pushRes.json();
			// Reddedilenleri yerelle uzlaştır
			await reconcileRejectedItems(pushData.rejected, pushData.documents_rejected);

			const appliedDocs = pushData.documents_applied || [];
			const rejectedDocs = pushData.documents_rejected || [];

			if (sentCount === 0) {
				pushDetail =
					"Seçilen ayarların henüz kaydedilecek bir değeri yok. Bir ayara dokunup tekrar deneyin.";
			} else {
				const names = (localData.sentGroups || [])
					.map((g) => SYNC_GROUPS[g].label)
					.join(", ");
				pushDetail = `${names} hesabınıza kaydedildi.`;
				if (rejectedDocs.length > 0) {
					pushDetail += `\n\n${rejectedDocs.length} belge reddedildi: hesabınızdaki kayıt daha yeni.`;
				}
			}

			// Sunucu 200 döndü ama hiçbir şey uygulamamış olabilir. Bu bir hata
			// değil; ama kullanıcıya "kaydedildi" demek yanlış olur.
			if (
				sentCount > 0 &&
				appliedDocs.length === 0 &&
				rejectedDocs.length === 0
			) {
				pushError = "push_nothing_applied";
			}
		} else if (pushRes.status === 401) {
			// ⚠️ 401 tek başına "oturum bitti" DEMEK DEĞİLDİR: yenileme
			// denemesi sunucu 5xx / ağ hatası yüzünden transient dönmüş olabilir
			// (bkz. apiClient.refreshSession). "unauthorized" YALNIZCA yenileme
			// terminal sonuc verdiyse üretilir; aksi halde kullanıcıya var olmayan
			// bir "oturumunuzun süresi dolmuş" uyarısı gösterilir.
			if (getAuthOutcome(pushRes) === REFRESH_OUTCOME.TERMINAL) {
				emitSyncState({ status: "error", lastSyncedAt: lastSynced, error: "unauthorized" });
				return { success: false, error: "unauthorized" };
			}
			pushError = "push_failed_401";
			pushDetail = await pushRes.text().catch(() => "");
		} else {
			// ⚠️ Push başarısızsa bunu SESSİZCE geçmiyoruz. Önceden burada yalnızca
			// konsola yazılıyordu ve fonksiyon `success: true` döndürüyordu; kullanıcı
			// "yedeklendi" uyarısı görüyor, DB'de ise hiçbir şey olmuyordu.
			pushError = `push_failed_${pushRes.status}`;
			pushDetail = await pushRes.text().catch(() => "");
			console.warn("Push başarısız oldu:", pushRes.status, pushDetail);
		}

		// ─── 2. PULL (Sunucudan delta çek) ──────────────────────
		const since = full ? null : lastSynced;
		const pullUrl = since
			? `/api/sync/pull?since=${encodeURIComponent(since)}`
			: `/api/sync/pull`;

		const pullRes = await authFetch(pullUrl, { method: "GET" });
		let serverTime = since;
		let pullError = null;
		let pullDetail = "";

		if (pullRes.ok) {
			const pullData = await pullRes.json();
			await applyPullData(pullData);
			// Damga PULL'dan gelir: sunucu bu değemi OKUMADAN ÖNCE hesaplar,
			// yani okuma anında yazılan satırlar bir sonraki çekişte teslim edilir.
			if (pullData.server_time) {
				serverTime = pullData.server_time;
			} else {
				// 200 ama damga yok → veri geldi, nereden devam edeceğimiz
				// bilinmiyor. Damgayı ilerletmek riskli, ilerletmemek güvenli:
				// sonraki tur aynı veriyi idempotent olarak tekrar çeker, ama
				// hiçbir kayıt kaybolmaz.
				pullError = "pull_missing_server_time";
			}
		} else if (pullRes.status === 401) {
			// Aynı kural: terminal değilse geçici hatadır, "oturum bitti" değil.
			// ⚠️ Burada DÜŞMEK YOK: `serverTime` `since` olmadığında (ilk tam
			// döküm) `new Date()`'e düşer ve damga ilerletilir. Veri hiç
			// çekilmediği hâlde damga ilerletmek, bir sonraki pull'da o verilerin
			// kalıcı atlanmasına yol açar. Bu yüzden erken dönüyoruz.
			if (getAuthOutcome(pullRes) === REFRESH_OUTCOME.TERMINAL) {
				emitSyncState({ status: "error", lastSyncedAt: lastSynced, error: "unauthorized" });
				return { success: false, error: "unauthorized" };
			}
			// Not: `pullError` ile gölgelenmesin diye `authError` adı kullanıldı.
			const authError = pushError || "pull_failed_401";
			emitSyncState({ status: "error", lastSyncedAt: lastSynced, error: authError });
			return { success: false, error: authError };
		} else {
			// ⚠️ 5xx / 429 / 400 ve ağ hatası. Önceden bu dal HİÇ YOKTU: kod
			// doğrudan aşağıdaki damga satırına düşüyordu. `serverTime` `since`
			// olduğu için, ilk sync'te (`since === null`) `new Date()`'e
			// düşüyor ve damga "bugüne kadar her şeyi indirdim" anlamına
			// geliyordu — oysa sunucudan HİÇBİR satır alınmamıştı. Sonraki tur
			// `since=<bugün>` soruyor, sunucu da `updated_at > since` diye
			// filtrelediği için hiç indirilmemiş kayıtlar KALICI olarak
			// atlanır: kullanıcı boş kütüphane görür ve `full` seçeneği
			// hiçbir yerden tetiklenmediği için kendi kendine toparlanamaz.
			pullError = `pull_failed_${pullRes.status}`;
			pullDetail = await pullRes.text().catch(() => "");
			console.warn("Pull başarısız oldu:", pullRes.status, pullDetail);
		}

		// ⚠️ Damga ilerletme kuralı: YALNIZCA pull 200 döndüyse.
		// Başarısız çekişte damga olduğu gibi bırakılır; bir sonraki başarılı
		// tur aynı veriyi tekrar ister (güvenli), hiçbir kayıt atlanmaz.
		// `lastSynced` null ise hiçbir şey YAZILMAZ — `setLastSyncedAt(null)`
		// "null" metnini kaydedip bir sonraki turu bozardı.
		const finalTime = pullRes.ok && serverTime ? serverTime : lastSynced;

		if (finalTime) await setLastSyncedAt(finalTime);
		await setPendingChangesCount(0);

		// Push ve pull BİRLİKTE başarılı olmadan "idle" gösterme: pull
		// sessizce başarısız olduğunda kullanıcı "yedeklendi" sanıyordu
		// ama kütüphanesi hiç güncellenmemişti.
		const syncError = pushError || pullError;

		emitSyncState({
			status: syncError ? "error" : "idle",
			lastSyncedAt: finalTime,
			error: syncError,
		});
		return {
			success: !syncError,
			pushed,
			error: syncError || undefined,
			// ⚠️ Yalnızca pushDetail insan-okunur Türkçe metindir. `pullDetail`
			// sunucunun HAM gövdesidir (JSON bile olabilir) ve UI'ya ASLA
			// verilmez — yalnızca yukarıdaki konsol kaydı için tutulur.
			detail: pushDetail || undefined,
		};
	} catch (error) {
		console.warn("Senkronizasyon hatası (çevrimdışı olabilir):", error);
		const lastSynced = await getLastSyncedAt();
		emitSyncState({ status: "error", lastSyncedAt: lastSynced, error: error.message });
		return { success: false, error: error.message };
	} finally {
		_isSyncing = false;

		// Bu turun sırasında yeni bir değişiklik geldiyse (ör. kullanıcı ayarı
		// değiştirdi) onu da gönder. Bu turda toplanan veri o değişikliği
		// İÇERMEZ, bu yüzden turun tamamen atlanırsa veri kaybolur.
		if (_resyncRequested) {
			_resyncRequested = false;
			// Yeni turun başlaması için mevcut turunun sıfırlamasını bekle
			setTimeout(() => {
				syncNow().catch((err) =>
					console.log("Takip eden sync ertelendi:", err.message),
				);
			}, 0);
		}
	}
}


/**
 * Debounce'lu senkronizasyon tetikleyicisi.
 *
 * Yalnızca SIK DEĞİŞEN kayıtlar için kullanılır (izleme listesi, geçmiş,
 * devam et). Video oynatılırken ilerleme sürekli güncellenir; her kare için
 * istek atmak pili ve bağlantıyı yakar, bu yüzden 2 saniyelik debounce vardır.
 */
export function schedulePush() {
	if (_debounceTimer) {
		clearTimeout(_debounceTimer);
	}

	_debounceTimer = setTimeout(async () => {
		const loggedIn = await hasSession();
		if (loggedIn) {
			syncNow().catch((err) => console.log("Otomatik sync ertelendi:", err.message));
		}
	}, DEBOUNCE_DELAY_MS);
}

/**
 * ANLIK senkronizasyon — debounce YOK.
 *
 * Ayar değişiklikleri (oynatıcı ayarları, eklenti/kategori görünürlüğü) ve arama
 * geçmişi için kullanılır: kullanıcı tercihini değiştirdiği anda hesabına
 * yazılsın istiyoruz, "birazdan" değil.
 *
 * Senkronizasyon zaten sürüyorsa değişiklik düşürülmez: `syncNow` bitince
 * kendiliğinden bir tur daha çalışır (bkz. `_resyncRequested`).
 */
export function pushImmediately() {
	if (_debounceTimer) {
		clearTimeout(_debounceTimer);
		_debounceTimer = null;
	}
	syncNow().catch((err) => console.log("Anlık sync ertelendi:", err.message));
}

/**
 * Bağlı cihazları listeler
 */
export async function getConnectedDevices() {
	try {
		const res = await authFetch("/api/sync/devices", { method: "GET" });
		if (res.ok) {
			return await res.json();
		}
		return [];
	} catch (error) {
		console.warn("Cihaz listesi alınamadı:", error);
		return [];
	}
}

/**
 * Bir cihazın yetkisini kaldırır (revoke)
 */
export async function revokeDevice(deviceId) {
	try {
		const res = await authFetch(`/api/sync/devices/${deviceId}`, {
			method: "DELETE",
		});
		return res.ok;
	} catch (error) {
		console.warn("Cihaz yetkisi kaldırılamadı:", error);
		return false;
	}
}
