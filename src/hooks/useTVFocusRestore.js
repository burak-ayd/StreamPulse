import { useCallback, useEffect, useRef } from "react";
import { Platform, UIManager, findNodeHandle } from "react-native";
import { useFocusEffect } from "expo-router";

/**
 * useTVFocusRestore — Sayfa/ekran geçişlerinde TV odak hafızası.
 *
 * Android TV'de bir ekrandan ayrılıp geri dönüldüğünde odak
 * her zaman ilk öğeye düşüyordu. Bu hook, ekrandan ayrılırken
 * son odaklanan öğenin native tag'ini kaydeder ve ekrana
 * geri dönüldüğünde o öğeye programatik odak verir.
 *
 * @param {string} screenKey - Ekran için benzersiz anahtar (örn. "home", "category:plugin|url")
 * @returns {object} { saveFocus: (nativeTag) => void, restoreFocus: () => void }
 */
export function useTVFocusRestore(screenKey) {
	const lastFocusedRef = useRef(null);
	const isMountedRef = useRef(false);

	/**
	 * Odaklanan öğenin native tag'ini kaydet.
	 * Çağıran bileşen (örn. TVPressable) onFocus'te bu fonksiyonu
	 * `findNodeHandle(ref.current)` ile çağırır.
	 */
	const saveFocus = useCallback((nativeTag) => {
		if (nativeTag != null) {
			lastFocusedRef.current = nativeTag;
		}
	}, []);

	/**
	 * Kaydedilmiş odağı geri yükle.
	 * Ekran mount olduğunda veya focus efekti tetiklendiğinde çağrılır.
	 */
	const restoreFocus = useCallback(() => {
		if (Platform.isTV && lastFocusedRef.current) {
			UIManager.dispatchViewManagerCommand(
				lastFocusedRef.current,
				"requestTVFocus",
				[]
			);
		}
	}, []);

	// Expo Router'ın useFocusEffect ile ekran odaklandığında geri yükle
	useFocusEffect(
		useCallback(() => {
			isMountedRef.current = true;
			// Küçük gecikme ile render'in bitmesini bekle
			const timer = setTimeout(() => {
				if (isMountedRef.current) {
					restoreFocus();
				}
			}, 100);
			return () => {
				isMountedRef.current = false;
				clearTimeout(timer);
			};
		}, [restoreFocus])
	);

	// Global storage ile cross-screen focus restore (opsiyonel)
	// Farklı ekranlar arası geçişte (örn. Home -> Category -> Home)
	// aynı screenKey için odak konumunu paylaşmak istersek:
	useEffect(() => {
		if (!screenKey) return;
		const storageKey = `tv_focus_${screenKey}`;
		
		// Restore from global on mount
		try {
			const saved = globalThis.__TV_FOCUS_STORAGE__?.[storageKey];
			if (saved != null) {
				lastFocusedRef.current = saved;
			}
		} catch (_e) {
			// ignore
		}

		return () => {
			// Save to global on unmount
			if (lastFocusedRef.current != null) {
				if (!globalThis.__TV_FOCUS_STORAGE__) {
					globalThis.__TV_FOCUS_STORAGE__ = {};
				}
				globalThis.__TV_FOCUS_STORAGE__[storageKey] = lastFocusedRef.current;
			}
		};
	}, [screenKey]);

	return { saveFocus, restoreFocus };
}

export default useTVFocusRestore;