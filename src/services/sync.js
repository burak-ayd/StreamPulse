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
import { authFetch } from "./apiClient";
import { getDeviceId, getDeviceName, getDevicePlatform } from "@/utils/deviceId";
import { now as getHlcNow } from "@/utils/hlc";
import { filterPayload } from "@/utils/fieldWhitelist";
import { mergeFavorites } from "@/utils/merge/favorites";
import { mergeLibraryList } from "@/utils/merge/library";
import { mergeDocument, mergeSearchHistory } from "@/utils/merge/documents";
import { notifyStorageChange } from "@/utils/storageListener";
import { hasSession } from "./token";

const LAST_SYNCED_KEY = "streampulse_last_synced_at";
const PENDING_CHANGES_KEY = "streampulse_pending_sync_count";

let _isSyncing = false;
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
	try {
		const playerSettingsRaw = await AsyncStorage.getItem("app_player_settings");
		if (playerSettingsRaw) {
			documents.player_settings = {
				payload: JSON.parse(playerSettingsRaw),
				hlc: getHlcNow(),
				device_id: deviceId,
				client_updated_at: new Date().toISOString(),
			};
		}

		const searchHistoryRaw = await AsyncStorage.getItem("user_search_history");
		if (searchHistoryRaw) {
			documents.search_history = {
				payload: JSON.parse(searchHistoryRaw),
				hlc: getHlcNow(),
				device_id: deviceId,
				client_updated_at: new Date().toISOString(),
			};
		}
	} catch (e) {
		console.warn("Belge push verisi toplanırken hata:", e);
	}

	return { records, documents };
}

/**
 * Sunucudan gelen delta verilerini (pull yanıtı) yerel depolama ile birleştirir.
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
			const remoteHistory = documents.search_history?.payload || [];
			const merged = mergeSearchHistory(localHistory, remoteHistory);
			await AsyncStorage.setItem("user_search_history", JSON.stringify(merged));
			notifyStorageChange("user_search_history", merged, { source: "sync" });
		} catch (e) {
			console.error("Pull search_history birleştirme hatası:", e);
		}
	}
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
 * Ana senkronizasyon fonksiyonu (Pull -> Push döngüsü)
 * @param {object} options
 * @param {boolean} options.force - Zaman kısıtlamasını yoksay
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function syncNow(options = {}) {
	const loggedIn = await hasSession();
	if (!loggedIn) {
		return { success: false, error: "not_authenticated" };
	}

	if (_isSyncing) {
		return { success: false, error: "already_syncing" };
	}

	_isSyncing = true;
	emitSyncState({ status: "syncing", lastSyncedAt: await getLastSyncedAt(), error: null });

	try {
		const lastSynced = await getLastSyncedAt();
		const device = await getDeviceMetadata();

		// ─── 1. PULL (Sunucudan delta çek) ──────────────────────
		const pullUrl = lastSynced
			? `/api/sync/pull?since=${encodeURIComponent(lastSynced)}`
			: `/api/sync/pull`;

		const pullRes = await authFetch(pullUrl, { method: "GET" });
		if (pullRes.ok) {
			const pullData = await pullRes.json();
			await applyPullData(pullData);
		} else if (pullRes.status === 401) {
			emitSyncState({ status: "error", lastSyncedAt: lastSynced, error: "unauthorized" });
			return { success: false, error: "unauthorized" };
		}

		// ─── 2. PUSH (Yerel değişiklikleri sunucuya gönder) ──────
		const localData = await collectLocalPushData();
		const pushPayload = {
			device,
			records: localData.records,
			documents: localData.documents,
		};

		const pushRes = await authFetch("/api/sync/push", {
			method: "POST",
			body: JSON.stringify(pushPayload),
		});

		if (pushRes.ok) {
			const pushData = await pushRes.json();
			// Reddedilenleri yerelle uzlaştır
			await reconcileRejectedItems(pushData.rejected, pushData.documents_rejected);

			const serverTime = pushData.server_time || new Date().toISOString();
			await setLastSyncedAt(serverTime);
			await setPendingChangesCount(0);

			emitSyncState({ status: "idle", lastSyncedAt: serverTime, error: null });
			return { success: true };
		} else {
			const errText = await pushRes.text();
			console.warn("Push başarısız oldu:", pushRes.status, errText);
			emitSyncState({ status: "error", lastSyncedAt: lastSynced, error: `push_failed_${pushRes.status}` });
			return { success: false, error: `push_failed_${pushRes.status}` };
		}
	} catch (error) {
		console.warn("Senkronizasyon hatası (çevrimdışı olabilir):", error);
		const lastSynced = await getLastSyncedAt();
		emitSyncState({ status: "error", lastSyncedAt: lastSynced, error: error.message });
		return { success: false, error: error.message };
	} finally {
		_isSyncing = false;
	}
}

/**
 * Debounce'lu senkronizasyon tetikleyici (yerel veri değiştiğinde çağrılır)
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
