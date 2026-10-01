/**
 * Storage Değişiklik Aboneliği
 *
 * storage.js üzerinden yapılan yazmalar veya sync sonrası gelen güncellemeler
 * burada yayınlanır. UI ekranlarının useFocusEffect'e gerek kalmadan
 * reaktif güncellenmesini sağlar.
 */

import { useCallback, useEffect, useState } from "react";

// Anahtar bazlı dinleyiciler: Map<key, Set<callback>>
const listeners = new Map();
// Global dinleyiciler (tüm anahtarlar için)
const globalListeners = new Set();

// Son bilinen bellek önbelleği
const cache = new Map();

/**
 * Bir veya birden fazla storage anahtarındaki değişiklikleri dinler.
 * @param {string|string[]|'*'} key - Dinlenecek anahtar(lar) veya tümü için '*'
 * @param {(key: string, data: any) => void} callback
 * @returns {() => void} unsubscribe fonksiyonu
 */
export function subscribeStorage(key, callback) {
	if (key === "*") {
		globalListeners.add(callback);
		return () => globalListeners.delete(callback);
	}

	const keys = Array.isArray(key) ? key : [key];

	keys.forEach((k) => {
		if (!listeners.has(k)) {
			listeners.set(k, new Set());
		}
		listeners.get(k).add(callback);
	});

	return () => {
		keys.forEach((k) => {
			const set = listeners.get(k);
			if (set) {
				set.delete(callback);
				if (set.size === 0) listeners.delete(k);
			}
		});
	};
}

/**
 * Storage'a veri yazıldığında bildirim yayınlar.
 * @param {string} key - Değişen anahtar
 * @param {any} [data] - Yeni veri (varsa)
 */
export function notifyStorageChange(key, data = null) {
	if (data !== undefined && data !== null) {
		cache.set(key, data);
	}

	// Anahtar dinleyicileri
	const keySet = listeners.get(key);
	if (keySet) {
		keySet.forEach((cb) => {
			try {
				cb(key, data);
			} catch (err) {
				console.warn(`Storage listener hatası (${key}):`, err);
			}
		});
	}

	// Global dinleyiciler
	globalListeners.forEach((cb) => {
		try {
			cb(key, data);
		} catch (err) {
			console.warn("Global storage listener hatası:", err);
		}
	});
}

/**
 * Bir storage anahtarını dinamik olarak dinleyen React Hook'u
 * @param {string} key - AsyncStorage anahtarı
 * @param {() => Promise<any>} [initialFetcher] - Veri okuma fonksiyonu
 * @returns {[any, boolean, () => Promise<void>]} [data, loading, refetch]
 */
export function useStorageListener(key, initialFetcher) {
	const [data, setData] = useState(() => cache.get(key) ?? null);
	const [loading, setLoading] = useState(data === null);

	const refetch = useCallback(async () => {
		if (initialFetcher) {
			try {
				const fresh = await initialFetcher();
				cache.set(key, fresh);
				setData(fresh);
			} catch (err) {
				console.warn(`Veri tazeleme hatası (${key}):`, err);
			} finally {
				setLoading(false);
			}
		}
	}, [key, initialFetcher]);

	useEffect(() => {
		let isMounted = true;

		if (initialFetcher) {
			initialFetcher().then((fresh) => {
				if (isMounted) {
					cache.set(key, fresh);
					setData(fresh);
					setLoading(false);
				}
			}).catch(() => {
				if (isMounted) setLoading(false);
			});
		}

		const unsub = subscribeStorage(key, (changedKey, newData) => {
			if (!isMounted) return;
			if (newData !== null && newData !== undefined) {
				setData(newData);
				cache.set(key, newData);
			} else {
				refetch();
			}
		});

		return () => {
			isMounted = false;
			unsub();
		};
	}, [key, initialFetcher, refetch]);

	return [data, loading, refetch];
}
