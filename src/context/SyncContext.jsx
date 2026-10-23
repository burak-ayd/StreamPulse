/**
 * SyncContext — Senkronizasyon Durumu ve Tetikleyicileri
 *
 * Sorumluluklar:
 * - Senkronizasyon durumu (idle, syncing, error)
 * - Otomatik tetikleyiciler:
 *   1. Uygulama ön plana geldiğinde (AppState active)
 *   2. Giriş yapıldığında (login sonrası ilk sync)
 *   3. 30 dakikalık periyodik tetikleme
 * - Manuel tetikleme (syncNow)
 * - Bağlı cihaz listesi ve yönetimi
 */

import React, {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { AppState } from "react-native";
import { useAuth } from "./AuthContext";
import {
	getLastSyncedAt,
	getPendingChangesCount,
	subscribeSyncState,
	syncNow as executeSyncNow,
	getConnectedDevices,
	revokeDevice as executeRevokeDevice,
	schedulePush,
	pushImmediately,
} from "@/services/sync";
import { runMigrationIfNeeded } from "@/utils/migrate";
import { subscribeStorage } from "@/utils/storageListener";

const PERIODIC_SYNC_INTERVAL_MS = 30 * 60 * 1000; // 30 dakika

const SyncContext = createContext({
	status: "idle", // 'idle' | 'syncing' | 'error'
	isSyncing: false,
	lastSyncedAt: null,
	pendingCount: 0,
	error: null,
	devices: [],
	isLoadingDevices: false,
	syncNow: async () => {},
	refreshDevices: async () => {},
	revokeDevice: async () => {},
});

export function SyncProvider({ children }) {
	const { isLoggedIn } = useAuth();
	const [status, setStatus] = useState("idle");
	const [lastSyncedAt, setLastSyncedAtState] = useState(null);
	const [pendingCount, setPendingCount] = useState(0);
	const [error, setError] = useState(null);
	const [devices, setDevices] = useState([]);
	const [isLoadingDevices, setIsLoadingDevices] = useState(false);

	const appState = useRef(AppState.currentState);

	// ─── 0. Veri Şeması Migrasyonu (İlk açılışta) ──────────────
	useEffect(() => {
		runMigrationIfNeeded().catch((err) => {
			console.warn("Veri migrasyonu kontrolü hatası:", err);
		});
	}, []);

	// ─── 1. Sync Motoru Durum Dinleyicisi ──────────────────────
	useEffect(() => {
		// Başlangıçta son sync zamanını oku
		getLastSyncedAt().then((val) => setLastSyncedAtState(val));
		getPendingChangesCount().then((cnt) => setPendingCount(cnt));

		const unsubscribe = subscribeSyncState((state) => {
			setStatus(state.status);
			setLastSyncedAtState(state.lastSyncedAt);
			setError(state.error);
			if (state.status === "idle") {
				getPendingChangesCount().then((cnt) => setPendingCount(cnt));
			}
		});

		return unsubscribe;
	}, []);

	// ─── 2. Manuel Senkronizasyon ─────────────────────────────
	const syncNow = useCallback(async () => {
		if (!isLoggedIn) return { success: false, error: "not_logged_in" };
		return await executeSyncNow();
	}, [isLoggedIn]);

	// ─── 3. Cihaz Yönetimi ────────────────────────────────────
	const refreshDevices = useCallback(async () => {
		if (!isLoggedIn) {
			setDevices([]);
			return;
		}
		setIsLoadingDevices(true);
		try {
			const list = await getConnectedDevices();
			setDevices(Array.isArray(list) ? list : []);
		} catch (err) {
			console.warn("Cihazlar alınamadı:", err);
		} finally {
			setIsLoadingDevices(false);
		}
	}, [isLoggedIn]);

	const revokeDevice = useCallback(
		async (deviceId) => {
			const ok = await executeRevokeDevice(deviceId);
			if (ok) {
				setDevices((prev) => prev.filter((d) => d.device_id !== deviceId));
			}
			return ok;
		},
		[],
	);

	// ─── 4. Oturum Değiştiğinde İlk Senkronizasyon ────────────
	useEffect(() => {
		if (!isLoggedIn) {
			queueMicrotask(() => {
				setDevices([]);
			});
			return;
		}

		// Giriş yapıldı -> hemen senkronize et ve cihaz listesini al.
		//
		// ⚠️ İkisi TEK bir `Promise.allSettled` içinde toplanır:
		// 1) `executeSyncNow()` kendi içinde zaten eşzamanlı turu engelliyor,
		//    `getConnectedDevices()` ise AYRI bir istek — ikisi aynı anda
		//    gitmeden önce 401 alırsa ikisi de aynı anda refresh tetikler
		//    (daha önceki hata: yenilenen token'lar birbirini eziyordu).
		// 2) `.then().catch()` zinciri REJECT edilen bir çağrıda hata
		//    yolunu sessizce yutuyordu; `allSettled` her sonucu ayrı ayrı
		//    raporlar ve BİRİ başarısız olunca diğeri etkilenmez.
		let cancelled = false;

		(async () => {
			const [syncResult, devicesResult] = await Promise.allSettled([
				executeSyncNow(),
				getConnectedDevices(),
			]);

			if (cancelled) return;

			if (syncResult.status === "rejected") {
				console.log("Login sync ertelendi:", syncResult.reason?.message);
			}
			if (devicesResult.status === "fulfilled") {
				const list = devicesResult.value;
				setDevices(Array.isArray(list) ? list : []);
			} else {
				console.warn("Cihazlar alınamadı:", devicesResult.reason?.message);
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [isLoggedIn]);

	// ─── 5. AppState (Ön Plana Geçiş) Tetikleyicisi ───────────
	useEffect(() => {
		const subscription = AppState.addEventListener("change", (nextAppState) => {
			if (
				appState.current.match(/inactive|background/) &&
				nextAppState === "active"
			) {
				if (isLoggedIn) {
					executeSyncNow().catch((err) => console.log("Foreground sync ertelendi:", err.message));
				}
			}
			appState.current = nextAppState;
		});

		return () => {
			subscription.remove();
		};
	}, [isLoggedIn]);

	// ─── 6. Periyodik Tetikleyici (30 dk) ──────────────────────
	useEffect(() => {
		if (!isLoggedIn) return;

		const interval = setInterval(() => {
			if (AppState.currentState === "active") {
				executeSyncNow().catch((err) => console.log("Periyodik sync ertelendi:", err.message));
			}
		}, PERIODIC_SYNC_INTERVAL_MS);

		return () => clearInterval(interval);
	}, [isLoggedIn]);

	// ─── 7. Yerel Veri Değişikliklerinde Push ────────────────────
	//
	// ⚠️ Yalnızca KULLANICI kaynaklı değişiklikler push tetikler.
	// `applyPullData()` uzak veriyi AsyncStorage'a yazdıktan sonra
	// `{ source: "sync" }` ile bildirim yayınlar. O bildirimi de tetikleyici
	// kabul edersek döngü kapanmaz:
	//
	//     pull → yaz → bildirim → push → pull → yaz → ...
	//
	// Sonsuz döngü (birim zamanda tam döküm + push) hem pili hem veritabanını
	// yakar, hem de UI'ın veri geldikten sonra hiç güncellenmemesine yol açar.
	useEffect(() => {
		if (!isLoggedIn) return;

		// A) ANLIK kaydedilenler — kullanıcı tercihi değiştirdiği anda hesabına
		//    yazılsın. Bunlar seyrek değişir (birkaç dokunuş), debounce'un
		//    getireceği "birazdan olacak" gecikmesi gereksiz.
		const IMMEDIATE_KEYS = [
			"user_profile",                 // profil (avatar, ad, bio...)
			"app_player_settings",          // oynatıcı / altyazı ayarları
			"streampulse_plugin_visibility",   // eklenti görünürlüğü
			"streampulse_category_visibility", // kategori görünürlüğü
			"user_search_history",             // arama yapıldıkça eklenir
		];

		// B) DEBOUNCE'lu kaydedilenler — video oynatılırken ilerleme her saniye
		//    değişir; her değişiklikte istek atmak bağlantıyı/pili yakar.
		const DEBOUNCED_KEYS = [
			"user_favorites",
			"user_watchlist",
			"user_watch_history",
			"user_continue_watching",
		];

		const handleChange = (immediate) => (_key, _data, meta) => {
			if (meta?.source === "sync") return; // uzak veri uygulandı, geri itme
			if (immediate) pushImmediately();
			else schedulePush();
		};

		const unsubImmediate = subscribeStorage(IMMEDIATE_KEYS, handleChange(true));
		const unsubDebounced = subscribeStorage(DEBOUNCED_KEYS, handleChange(false));

		return () => {
			unsubImmediate();
			unsubDebounced();
		};
	}, [isLoggedIn]);

	const value = useMemo(
		() => ({
			status,
			isSyncing: status === "syncing",
			lastSyncedAt,
			pendingCount,
			error,
			devices,
			isLoadingDevices,
			syncNow,
			refreshDevices,
			revokeDevice,
		}),
		[
			status,
			lastSyncedAt,
			pendingCount,
			error,
			devices,
			isLoadingDevices,
			syncNow,
			refreshDevices,
			revokeDevice,
		],
	);

	return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync() {
	const context = useContext(SyncContext);
	if (!context) {
		throw new Error("useSync hook'u SyncProvider içinde kullanılmalıdır.");
	}
	return context;
}
