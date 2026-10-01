/**
 * Storage Değişiklik Aboneliği
 *
 * storage.js üzerinden yapılan yazmalar veya sync sonrası gelen güncellemeler
 * burada yayınlanır. UI ekranlarının useFocusEffect'e gerek kalmadan
 * reaktif güncellenmesini sağlar.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
 *
 * @param {string} key - Değişen anahtar
 * @param {any} [data] - Yeni veri (varsa)
 * @param {{source?: 'sync'|'user'|'local'}} [options] - Değişikliğin kaynağı.
 *   'sync' = uzak veri uygulandı. Sync motoru bu bildirimlere TETİKLEYİCİ OLARAK
 *   tepki vermemelidir (aksi halde pull → yaz → push → pull sonsuz döngüsü);
 *   ekranlar ise yine de güncellenmelidir.
 */
export function notifyStorageChange(key, data = null, options = {}) {
	if (data !== undefined && data !== null) {
		cache.set(key, data);
	}

	const meta = { source: options.source || "user" };

	// Anahtar dinleyicileri
	const keySet = listeners.get(key);
	if (keySet) {
		keySet.forEach((cb) => {
			try {
				cb(key, data, meta);
			} catch (err) {
				console.warn(`Storage listener hatası (${key}):`, err);
			}
		});
	}

	// Global dinleyiciler
	globalListeners.forEach((cb) => {
		try {
			cb(key, data, meta);
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

/**
 * Bir ekranın veri yükleyicisini storage değişikliklerine bağlar.
 *
 * Neden gerekir: ekranlar veriyi `useFocusEffect(() => load())` ile okur ve bu
 * hook YALNIZCA ekran odak kazandığında çalışır. Kullanıcı giriş yaptıktan
 * sonra sync gelen veriyi AsyncStorage'a yazar; ekran zaten odaktaysa odak
 * değişimi olmaz, `load()` tekrar çalışmaz ve kullanıcı içerikleri ancak
 * sayfa değiştirince (ya da uygulamayı yeniden başlatınca) görür.
 *
 * Kullanım — ekranın mevcut yükleyicisini sarın, `useFocusEffect` KORUNUR:
 *
 *     const load = useCallback(async () => { ... }, []);
 *     useFocusEffect(load);                      // odaklanınca
 *     useReactiveData(load, ["user_favorites"]); // sync geldiğinde de
 *
 * @param {() => any} load - Veri yükleyici (async olabilir)
 * @param {string|string[]} syncKeys - Dinlenecek storage anahtar(lar)ı
 */
export function useReactiveData(load, syncKeys) {
	// Yükleyiciyi effect içinde güncelle (render sırasında ref yazmak yasak):
	// böylece her render'da yeni bir closure oluşsa da abonelik yeniden
	// kurulmaz, sadece en güncel yükleyici çağrılır.
	const loadRef = useRef(load);

	useEffect(() => {
		loadRef.current = load;
	}, [load]);

	// Anahtar listesi çağrı başına yeni dizi olsa da kimlik değişmesin
	const keySig = Array.isArray(syncKeys)
		? syncKeys.join("|")
		: syncKeys || "*";

	const keys = useMemo(() => keySig.split("|").filter(Boolean), [keySig]);

	useEffect(() => {
		const unsub = subscribeStorage(keys.length ? keys : "*", () => {
			Promise.resolve(loadRef.current()).catch((err) => {
				console.warn("Reaktif veri tazeleme hatası:", err);
			});
		});
		return unsub;
	}, [keys]);
}
