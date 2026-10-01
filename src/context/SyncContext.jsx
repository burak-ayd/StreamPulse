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
		if (isLoggedIn) {
			// Giriş yapıldı -> hemen senkronize et ve cihaz listesini al
			executeSyncNow().catch((err) => console.log("Login sync ertelendi:", err.message));
			getConnectedDevices().then((list) => {
				setDevices(Array.isArray(list) ? list : []);
			}).catch(() => {});
		} else {
			queueMicrotask(() => {
				setDevices([]);
			});
		}
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

	// ─── 7. Yerel Veri Değişikliklerinde Debounce'lu Push ────────
	//
	// ⚠️ Yalnızca KULLANICI kaynaklı değişiklikler push tetikler.
	// `applyPullData()` uzak veriyi AsyncStorage'a yazdıktan sonra
	// `{ source: "sync" }` ile bildirim yayınlar. O bildirimi de tetikleyici
	// kabul edersek döngü kapanmaz:
	//
	//     pull → yaz → bildirim → schedulePush → pull → yaz → ...
	//
	// Sonsuz döngü (birim zamanda tam döküm + push) hem pili hem veritabanını
	// yakar, hem de UI'ın veri geldikten sonra hiç güncellenmemesine yol açar.
	useEffect(() => {
		if (!isLoggedIn) return;

		const syncableKeys = [
			"user_favorites",
			"user_watchlist",
			"user_watch_history",
			"user_continue_watching",
			"app_player_settings",
			"user_search_history",
		];

		const unsub = subscribeStorage(syncableKeys, (_key, _data, meta) => {
			if (meta?.source === "sync") return; // uzak veri uygulandı, geri itme
			schedulePush();
		});

		return unsub;
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
