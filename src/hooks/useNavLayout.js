import { Platform, useWindowDimensions } from "react-native";

/**
 * Gezinme yerleşimi kuralları — tüm ekranlar ve BottomNavigation aynı
 * kararı vermek ZORUNDA, yoksa içerik rail'in altında kalır.
 *
 * Kural:
 *   • TV                      → daima sol kenarda (dikey ray)
 *   • Telefon                 → daima altta (yatay bar)
 *   • Tablet DİKEY            → altta (yatay bar)
 *   • Tablet YANDEĞER          → sol kenarda (dikey ray)
 * Yani: sol ray yalnızca "TV ya da yatay tablet" durumunda kullanılır.
 */

/** Tablet eşiği: Android `sw600dp` / iPad portrait minDimension ile aynı. */
export const TABLET_MIN_SIDE = 600;

/** Sol rayın genişliği (içerik bu kadar sola kaydırılır). */
export const NAV_RAIL_WIDTH = 56;

/**
 * Cihazı telefon/tablet olarak ayırır.
 * TV cihazlar da geniş raporlandığı için "tablet" sayılır — TV için
 * ayrıca `Platform.isTV` kontrolü yapılır.
 */
export function isTabletSize(width, height) {
	return Math.min(width, height) >= TABLET_MIN_SIDE;
}

/**
 * Sol ray kullanılmalı mı?
 * @returns {boolean} true → dikey ray (sol), false → yatay bar (alt)
 */
export function shouldUseSideRail({ width, height, isTV = Platform.isTV }) {
	if (isTV) return true;
	if (!isTabletSize(width, height)) return false; // telefon → altta
	return width > height; // tablet: yalnızca yatayda → solda
}

/**
 * Ekranların kullanacağı hazır hook.
 * @returns {{isSideRail: boolean, railWidth: number, contentPaddingLeft: number}}
 */
export function useNavLayout() {
	const { width, height } = useWindowDimensions();
	const isSideRail = shouldUseSideRail({ width, height });

	return {
		isSideRail,
		railWidth: NAV_RAIL_WIDTH,
		// İçerik sadece ray varken sola kaydırılır.
		contentPaddingLeft: isSideRail ? NAV_RAIL_WIDTH : 0,
	};
}