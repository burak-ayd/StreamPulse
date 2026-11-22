/**
 * `useFocusCentering` — odaklanan öğeyi sabit bir ÇAPAYA hizalar (P1 + P2)
 * ======================================================================
 *
 * ⚠️ Neden `scrollToIndex` DEĞİL
 *
 * FlashList v2'de `scrollToIndex` native bir kaydırma değildir: JS'te 5
 * adımlı offset interpolasyonu yapar ve 200–300 ms boyunca offset
 * düzeltmesini kilitler (bkz.
 * `node_modules/@shopify/flash-list/dist/recyclerview/hooks/useRecyclerViewController.js`).
 * Odak her değiştiğinde bu zincir çalıştığı için kullanıcı "önce odak
 * gider, sayfa sonra peşinden gelir" hissini yaşıyordu.
 *
 * Burada hedef offset ekran tarafında BİLİNEN geometriden hesaplanır ve
 * tek bir native `scrollToOffset({ animated: false })` çağrısı yapılır:
 * aynı karede kayar, animasyon kuyruğu ve kilit yoktur.
 *
 * ⚠️ Neden ORTALAMA DEĞİL, ÇAPA
 *
 * Öğeyi ekranın ortasına taşımak her odak değişiminde büyük bir sıçrama
 * üretir. Netflix/Prime davranışı: odaklanan satır ekranın üstünden sabit
 * bir noktada (~%30) durur, içerik onun altında akar. `anchorRatio` bunu
 * verir.
 *
 * ── Geometri nereden gelir ────────────────────────────────────────
 *
 *   `itemSize` + `startOffset` → düzgün listeler/ızgaralar:
 *       offset = startOffset + satırIndex * itemSize     (satırIndex = index / columns)
 *   `getOffset(index)` → satır yükseklikleri ölçülen listeler (ana sayfa)
 *   hiçbiri yoksa → dinamik genişlikli küçük raylar için `scrollToIndex`
 *       yedeği (yalnızca bu durumda JS animasyonu devrede kalır).
 */

import { useCallback, useRef } from "react";
import { Platform, useWindowDimensions } from "react-native";

/** Çapa oranları: satır/kart ekranın bu noktasında sabitlenir. */
const ANCHOR_RATIO = { vertical: 0.3, horizontal: 0.22 };

/**
 * @param {object} options
 * @param {number} [options.columns=1] Dikey ızgara sütun sayısı (1 = düz liste).
 * @param {boolean} [options.horizontal=false] Yatay liste mi?
 * @param {number} [options.itemSize] Bir öğenin (veya ızgara satırının)
 *        bir sonrakine uzaklığı — px, aralık dahil.
 * @param {number} [options.startOffset=0] İlk öğeden önceki içerik boşluğu (px).
 * @param {(index:number)=>number} [options.getOffset] Özel offset hesabı.
 * @param {number} [options.anchorRatio] Çapa oranı (0–1).
 * @param {boolean} [options.animated=false] Native kaydırma animasyonlu olsun mu?
 * @param {boolean} [options.enabled=Platform.isTV]
 */
export function useFocusCentering(options = {}) {
	const {
		columns = 1,
		horizontal = false,
		itemSize = null,
		startOffset = 0,
		getOffset = null,
		anchorRatio,
		animated = false,
		enabled = Platform.isTV,
		onCentered = null,
	} = options;

	const listRef = useRef(null);
	/** Aynı hedefe tekrar scroll komutu gönderme. */
	const lastTargetRef = useRef(null);

	const { width, height } = useWindowDimensions();
	const viewport = horizontal ? width : height;
	const anchor = Math.round(
		(anchorRatio ?? (horizontal ? ANCHOR_RATIO.horizontal : ANCHOR_RATIO.vertical)) *
			viewport,
	);

	/**
	 * Öğe odaklandığında çağrılır (`onFocus` prop'una bağlanır).
	 *
	 * @param {number} index Liste içindeki öğe indeksi.
	 */
	const handleItemFocus = useCallback(
		(index) => {
			if (!enabled || index == null) return;
			const node = listRef.current;
			if (!node) return;

			const cols =
				Number.isFinite(columns) && columns > 0 ? columns : 1;
			const rowIndex = horizontal ? index : Math.floor(index / cols);

			let offset = null;
			if (typeof getOffset === "function") {
				offset = getOffset(index);
			} else if (itemSize) {
				offset = startOffset + rowIndex * itemSize;
			}

			if (offset != null) {
				const target = Math.max(0, Math.round(offset - anchor));
				if (target === lastTargetRef.current) {
					onCentered?.(index);
					return;
				}
				lastTargetRef.current = target;
				if (typeof node.scrollToOffset === "function") {
					node.scrollToOffset({ offset: target, animated });
				}
				onCentered?.(index);
				return;
			}

			/*
			 * Geometri bilinmiyor (dinamik genişlikli küçük ray). `scrollToIndex`
			 * tek çare; animasyonsuz çağrılır ki adım sayısı en aza insin.
			 */
			lastTargetRef.current = null;
			if (typeof node.scrollToIndex === "function") {
				node.scrollToIndex({
					index,
					animated,
					viewPosition: horizontal
						? ANCHOR_RATIO.horizontal
						: ANCHOR_RATIO.vertical,
				});
			}
			onCentered?.(index);
		},
		[
			enabled,
			columns,
			horizontal,
			itemSize,
			startOffset,
			getOffset,
			anchor,
			animated,
			onCentered,
		],
	);

	return { listRef, handleItemFocus };
}

export default useFocusCentering;