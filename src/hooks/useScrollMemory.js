/**
 * `useScrollMemory` — kaydırma konumunu hatırlayan kanca (sorun 4)
 * ==============================================================
 *
 * `FlatList`/`ScrollView` için iki şey verir:
 *
 *   1. `onScroll`      → kaydırma sırasında ofseti tek bir yere yazar.
 *   2. `restoreOffset` → içerik ÖLÇÜLDÜKTEN SONRA bir kez çalıştırılır;
 *      liste hazır olduğu anda eski konuma atlar.
 *
 * ⚠️ Neden `onContentSizeChange` gerekiyor: içerik henüz yokken
 * `scrollToOffset` çağırmak sessizce başarısız olur (ya da 0'a
 * düşer). Kategori sayfası gibi ekranlarda veri asenkron geldiği için
 * geri yükleme "liste ilk kez ölçüldüğünde" yapılmalıdır.
 *
 * Kullanım:
 *
 *   const listRef = useRef(null);
 *   const { onScroll, restoreOffset } = useScrollMemory("home");
 *   <FlatList ref={listRef} onScroll={onScroll} onContentSizeChange={restoreOffset} />
 */

import { useCallback, useRef } from "react";
import {
	recallScrollOffset,
	rememberScrollOffset,
} from "@/utils/scrollMemory";

/** `scrollEventThrottle`: 32ms → saniyede ~30 kare, TV'de bedava. */
const THROTTLE = 32;

export function useScrollMemory(key) {
	// Aynı ekranda iki kez restore edilmesin (StrictMode / yeniden mount).
	const restoredRef = useRef(false);

	const onScroll = useCallback(
		(event) => {
			rememberScrollOffset(
				key,
				event?.nativeEvent?.contentOffset?.y ?? 0,
			);
		},
		[key],
	);

	/**
	 * Liste içeriği ölçüldüğünde çağrılır.
	 * @param {object} listRef  listenin ref'i
	 * @param {boolean} force  aynı ekranda yeniden uygulamak istiyorsan
	 */
	const restoreOffset = useCallback(
		(listRef, force = false) => {
			if (!force && restoredRef.current) return;
			const offset = recallScrollOffset(key);
			if (!offset) {
				restoredRef.current = true;
				return;
			}
			const node = listRef?.current;
			if (!node) return;
			restoredRef.current = true;
			node.scrollToOffset({ offset, animated: false });
		},
		[key],
	);

	return { onScroll, restoreOffset, scrollEventThrottle: THROTTLE };
}

export default useScrollMemory;