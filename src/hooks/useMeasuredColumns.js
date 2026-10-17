/**
 * Ölçülen ızgara sütunları (responsive grid)
 * =========================================
 *
 * Neden ölçüm, neden sabit sayı değil?
 *
 * Izgaraların sütun sayısı sabit kodlanınca (ör. "TV'de 4, telefonda 2")
 * aradaki HER ekran boyutu için hesap yanlış çıkıyor: 10" tablet yatayda
 * kartlar devleşiyor, katlanabilir/küçük tablette diziliş bozuluyor.
 * Bu kanca sütun sayısını **kabın gerçek genişliğinden** türetir:
 *
 *   1. `onLayout` ile kap ölçülür (ekran değil — kenar payı, ray ve
 *      içerik sütunu zaten düşülmüş genişlik).
 *   2. İstenen en küçük kart genişliği (`minItemWidth`) ile kaç sütun
 *      sığdığı hesaplanır.
 *   3. `min`/`max` arasına kırpılır; `itemWidth` tam olarak kabı
 *      doldurur (kalıntı yüzünden sağda boşluk kalmaz).
 *
 * ⚠️ İlk karede kap henüz ölçülmemiştir (`onLayout` bir sonraki karede
 * gelir). O anda sütun sayısı 1'e düşerse kartlar bir kare boyunca tam
 * genişlikte görünür ve "zıplama" olur. Bunun için ölçüm gelmeden önce
 * ekran genişliğinden geçici bir tahmin kullanılır.
 *
 * ⚠️ `FlatList`'te `numColumns` render sonrası DEĞİŞTİRİLEMEZ. Sütun
 * sayısını besleyen listenin `key`'ine sütunu ekleyin
 * (`key={`grid-${columns}`}`) — liste yeni sütun sayısıyla yeniden kurulur.
 */

import { useCallback, useMemo, useState } from "react";
import { useWindowDimensions } from "react-native";

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

/**
 * @param {{
 *   minItemWidth: number,   // bir kartın okunabilir en küçük genişliği
 *   gap?: number,           // kartlar arası boşluk (yatay)
 *   max?: number,           // üst sınır (ör. 6)
 *   min?: number,           // alt sınır (ör. 1)
 *   padding?: number,       // kabın kendi yatay iç boşluğu (her iki yanda)
 *   fallbackWidth?: number, // ölçüm öncesi tahmin; verilmezse ekran genişliği
 * }} options
 * @returns {{
 *   onLayout: (e: object) => void,
 *   columns: number,
 *   itemWidth: number,
 *   boxWidth: number,
 * }}
 */
export function useMeasuredColumns({
	minItemWidth,
	gap = 12,
	max = 8,
	min = 1,
	padding = 0,
	fallbackWidth = 0,
}) {
	const { width: windowWidth } = useWindowDimensions();
	const [boxWidth, setBoxWidth] = useState(0);

	const onLayout = useCallback((event) => {
		const next = event?.nativeEvent?.layout?.width ?? 0;
		// Aynı genişlik için yeniden render tetiklenmesin (odak halkaları
		// ölçümü tekrar tekrar tetikleyebiliyor).
		setBoxWidth((prev) => (Math.abs(prev - next) > 0.5 ? next : prev));
	}, []);

	// Ölçüm gelmeden önceki ilk kare: çağıran tahmin verdiyse o, yoksa
	// ekran genişliği. (İki sütunlu profilde kap ekrandan dardır; ekran
	// genişliğiyle hesaplanan ilk kare yanlış sütunla kurulurdu.)
	const effectiveWidth = boxWidth > 0 ? boxWidth : fallbackWidth || windowWidth;

	const { columns, itemWidth } = useMemo(() => {
		const inner = effectiveWidth - padding * 2;
		if (inner <= 0) return { columns: min, itemWidth: 0 };
		const count = clamp(
			Math.floor((inner + gap) / (minItemWidth + gap)),
			min,
			max,
		);
		return {
			columns: count,
			itemWidth: (inner - gap * (count - 1)) / count,
		};
	}, [effectiveWidth, minItemWidth, gap, max, min, padding]);

	return { onLayout, columns, itemWidth, boxWidth };
}

export default useMeasuredColumns;
