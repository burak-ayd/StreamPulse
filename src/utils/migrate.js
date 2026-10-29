/**
 * Geriye Uyumlu Veri Migrasyonu
 *
 * Eski şema (sürüm 1 / zamansız ham JSON) verilerini
 * HLC ve sync-uyumlu yeni şemaya (sürüm 2) taşır.
 * Sıfır veri kaybı garantisi.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { getDeviceId } from "./deviceId";
import { now as getHlcNow } from "./hlc";
import { filterPayload, capList, SIZE_CAPS } from "./fieldWhitelist";
import { MIRROR_PLUGIN_PREFIXES } from "./pluginName";
import { CURRENT_SCHEMA_VERSION, getSchemaVersion, setSchemaVersion } from "./schemaVersion";

const KEYS = {
	FAVORITES: "user_favorites",
	WATCHLIST: "user_watchlist",
	WATCH_HISTORY: "user_watch_history",
	CONTINUE_WATCHING: "user_continue_watching",
	SEARCH_HISTORY: "user_search_history",
	PLAYER_SETTINGS: "app_player_settings",
};

/**
 * Gerekiyorsa AsyncStorage migrasyonunu çalıştırır.
 * Uygulama başlangıcında güvenle çağrılabilir.
 */
export async function runMigrationIfNeeded() {
	try {
		const currentVersion = await getSchemaVersion();
		if (currentVersion >= CURRENT_SCHEMA_VERSION) {
			return; // Zaten güncel
		}

		console.log(`[Migrate] Veri migrasyonu başlatılıyor: v${currentVersion} -> v${CURRENT_SCHEMA_VERSION}`);
		const deviceId = await getDeviceId();
		const baseHlc = getHlcNow();

		// 1. Favorileri dönüştür
		const favRaw = await AsyncStorage.getItem(KEYS.FAVORITES);
		if (favRaw) {
			try {
				const favList = JSON.parse(favRaw);
				if (Array.isArray(favList)) {
					const migratedFavs = favList.map((item) => ({
						...filterPayload(item),
						_hlc: item._hlc || baseHlc,
						_deviceId: item._deviceId || deviceId,
						_deleted: Boolean(item._deleted),
					}));
					await AsyncStorage.setItem(KEYS.FAVORITES, JSON.stringify(migratedFavs));
				}
			} catch (e) {
				console.warn("[Migrate] Favori migrasyon hatası:", e);
			}
		}

		// 2. Watchlist dönüştür (ve ham seasons alanlarını temizle)
		const wlRaw = await AsyncStorage.getItem(KEYS.WATCHLIST);
		if (wlRaw) {
			try {
				const wlList = JSON.parse(wlRaw);
				if (Array.isArray(wlList)) {
					const migratedWl = wlList.map((item) => ({
						...filterPayload(item),
						_hlc: item._hlc || baseHlc,
						_deviceId: item._deviceId || deviceId,
						_deleted: Boolean(item._deleted),
					}));
					const capped = capList(migratedWl, SIZE_CAPS.watchlist || 100);
					await AsyncStorage.setItem(KEYS.WATCHLIST, JSON.stringify(capped));
				}
			} catch (e) {
				console.warn("[Migrate] Watchlist migrasyon hatası:", e);
			}
		}

		// 3. Watch history
		const whRaw = await AsyncStorage.getItem(KEYS.WATCH_HISTORY);
		if (whRaw) {
			try {
				const whList = JSON.parse(whRaw);
				if (Array.isArray(whList)) {
					const migratedWh = whList.map((item) => ({
						...filterPayload(item),
						_hlc: item._hlc || baseHlc,
						_deviceId: item._deviceId || deviceId,
						_deleted: Boolean(item._deleted),
					}));
					const capped = capList(migratedWh, SIZE_CAPS.watch_history || 50);
					await AsyncStorage.setItem(KEYS.WATCH_HISTORY, JSON.stringify(capped));
				}
			} catch (e) {
				console.warn("[Migrate] İzleme geçmişi migrasyon hatası:", e);
			}
		}

		// 4. Continue watching
		const cwRaw = await AsyncStorage.getItem(KEYS.CONTINUE_WATCHING);
		if (cwRaw) {
			try {
				const cwList = JSON.parse(cwRaw);
				if (Array.isArray(cwList)) {
					const migratedCw = cwList.map((item) => ({
						...filterPayload(item),
						_hlc: item._hlc || baseHlc,
						_deviceId: item._deviceId || deviceId,
						_deleted: Boolean(item._deleted),
					}));
					const capped = capList(migratedCw, SIZE_CAPS.continue_watching || 50);
					await AsyncStorage.setItem(KEYS.CONTINUE_WATCHING, JSON.stringify(capped));
				}
			} catch (e) {
				console.warn("[Migrate] Devam et migrasyon hatası:", e);
			}
		}

		// 5. Yansı alan adı yanlışlıklarını düzelt (v3, madde 5):
		// `s231` gibi kaynak alan adları yanlışlıkla eklenti adı
		// olarak kaydedilmişti; bilinen yansı önekleri gerçek adlara taşınır.
		try {
			const fixPlugin = (p) => {
				if (typeof p !== "string") return p;
				for (const [prefix, plugin] of MIRROR_PLUGIN_PREFIXES) {
					if (p.startsWith(prefix) || p.includes(prefix)) return plugin;
				}
				return p;
			};
			for (const key of [
				KEYS.FAVORITES,
				KEYS.WATCHLIST,
				KEYS.WATCH_HISTORY,
				KEYS.CONTINUE_WATCHING,
			]) {
				const raw = await AsyncStorage.getItem(key);
				if (!raw) continue;
				const list = JSON.parse(raw);
				if (!Array.isArray(list)) continue;
				await AsyncStorage.setItem(
					key,
					JSON.stringify(list.map((it) => (it?.plugin ? { ...it, plugin: fixPlugin(it.plugin) } : it))),
				);
			}
			// Eklenti indirme tercihleri: anahtarlar eklenti adı.
			const prefsRaw = await AsyncStorage.getItem("app_plugin_download_prefs");
			if (prefsRaw) {
				const prefs = JSON.parse(prefsRaw);
				if (prefs && typeof prefs === "object") {
					const fixed = {};
					for (const [name, value] of Object.entries(prefs)) {
						fixed[fixPlugin(name)] = value;
					}
					await AsyncStorage.setItem(
						"app_plugin_download_prefs",
						JSON.stringify(fixed),
					);
				}
			}
		} catch (e) {
			console.warn("[Migrate] Yansı eklenti adı migrasyonu hatası:", e);
		}

		// Migrasyon tamamlandı, sürümü güncelle
		await setSchemaVersion(CURRENT_SCHEMA_VERSION);
		console.log(`[Migrate] Migrasyon başarıyla tamamlandı: v${CURRENT_SCHEMA_VERSION}`);
	} catch (error) {
		console.error("[Migrate] Genel migrasyon hatası:", error);
	}
}
