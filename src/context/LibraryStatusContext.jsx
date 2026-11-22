import {
	STORAGE_KEYS,
	getContinueWatching,
	getFavorites,
	getHiddenLibraryItems,
	getWatchHistory,
	getWatchlist,
} from "@/utils/storage";
import { subscribeStorage } from "@/utils/storageListener";
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";

/**
 * Kitaplık durumlarının bellekteki TEK kaynağı.
 *
 * Peek menüleri açılırken "Durum: İzleniyor / Planlandı / Tamamlandı" satırını
 * ANINDA göstermek zorunda. Her kart için AsyncStorage okumak (yüzlerce kart ×
 * dört liste) kabul edilemez; bu yüzden dört liste bir kez okunur ve storage
 * değişimlerinde tazelenir. Sahiplik: `utils/storage.js` yazma tarafı,
 * burası yalnızca okuma tarafı.
 */

const KEYS = [
	STORAGE_KEYS.CONTINUE_WATCHING,
	STORAGE_KEYS.WATCHLIST,
	STORAGE_KEYS.WATCH_HISTORY,
	STORAGE_KEYS.FAVORITES,
	STORAGE_KEYS.LIBRARY_HIDDEN,
];

const emptyIndex = {
	status: new Map(),
	fav: new Set(),
};

function toId(item) {
	return String(item?.id || item?.url || "");
}

function buildIndex({ watching, planned, history, favorites, hidden }) {
	const index = { status: new Map(), fav: new Set() };
	const hiddenIds = new Set(hidden.map(toId).filter(Boolean));

	for (const item of watching) {
		const id = toId(item);
		if (id) index.status.set(id, "watching");
	}
	for (const item of planned) {
		const id = toId(item);
		if (id && !index.status.has(id)) index.status.set(id, "planned");
	}
	for (const item of history) {
		const id = toId(item);
		const completed =
			!hiddenIds.has(id) &&
			(item.isCompleted || (item.progress && item.progress >= 0.9));
		if (id && completed && !index.status.has(id)) {
			index.status.set(id, "completed");
		}
	}
	for (const item of favorites) {
		const id = toId(item);
		if (id) index.fav.add(id);
	}

	return index;
}

const LibraryStatusContext = createContext({
	statusOf: () => null,
	isFavorite: () => false,
});

export function LibraryStatusProvider({ children }) {
	const [index, setIndex] = useState(emptyIndex);

	const reload = useCallback(async () => {
		try {
			const [watching, planned, history, favorites, hidden] =
				await Promise.all([
					getContinueWatching(),
					getWatchlist(),
					getWatchHistory(),
					getFavorites(),
					getHiddenLibraryItems(),
				]);
			setIndex(
				buildIndex({ watching, planned, history, favorites, hidden }),
			);
		} catch (e) {
			console.warn("Kitaplık durumu yüklenemedi:", e);
		}
	}, []);

	useEffect(() => {
		const timer = setTimeout(() => {
			reload();
		}, 0);
		// Oynatma sırasında `continue_watching` sık yazılır; her yazıda beş
		// listeyi yeniden okumak yerine kısa bir gecikmeyle bir kez oku.
		let debounce = null;
		const unsubscribe = subscribeStorage(KEYS, () => {
			if (debounce) clearTimeout(debounce);
			debounce = setTimeout(() => {
				debounce = null;
				reload();
			}, 600);
		});
		return () => {
			clearTimeout(timer);
			if (debounce) clearTimeout(debounce);
			unsubscribe();
		};
	}, [reload]);

	const value = useMemo(
		() => ({
			statusOf: (item) => index.status.get(toId(item)) || null,
			isFavorite: (item) => index.fav.has(toId(item)),
			reload,
		}),
		[index, reload],
	);

	return (
		<LibraryStatusContext.Provider value={value}>
			{children}
		</LibraryStatusContext.Provider>
	);
}

export function useLibraryStatus() {
	return useContext(LibraryStatusContext);
}