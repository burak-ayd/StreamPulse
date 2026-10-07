/**
 * Skeleton — CloudStream yaklaşımı: DÜZ, ANİMASYONSUZ iskelet blokları
 * ================================================================
 *
 * ── Neden bu dosya var ────────────────────────────────────────────
 *
 * Uygulamada yükleme göstergesi olarak `ActivityIndicator` kullanılıyordu.
 * Sorun şuydu: spinner'ın ekranı kapladığı geometri ile içeriğin gerçek
 * geometrisi FARKLI. İçerik gelince spinner kalkıp kartlar/kahraman görseli
 * ekrana giriyor — ekran "zıplıyor", kullanıcı da ne olup bittiğini
 * anlamıyor. CloudStream'de bu sorun yok çünkü iskelet, içeriğin
 * KENDİ yerleşimini taklit eder: aynı kart boyutu, aynı boşluklar, aynı
 * sıralama. İçerik geldiğinde bloklar birebir yerine oturur.
 *
 * ── Tasarım kuralları ─────────────────────────────────────────────
 *
 * 1. **Animasyon yok.** Shimmer/parlama, 1080p TV'de sürekli yeniden
 *    çizim demek; 40+ bloklu bir ızgara kare düşürüyor. Düz blok
 *    CloudStream'in gerçek davranışı ve TV'de bedava.
 *
 * 2. **Ölçü tek kaynaktan gelir.** İskeletler kendi boyutlarını
 *    UYDURMAZ; içerik bileşenlerinin zaten dışa aktardığı sabitlerden
 *    (`ROW_CARD_WIDTH`, `GRID_GAP`…) okur. Böylece iskelet ile gerçek
 *    kart aynı ölçüde olur ve içerik geldiğinde kayma olmaz.
 *
 * 3. **Renk temadan gelir.** `useSkeletonColors()` M3 yüzey rampasını
 *    kullanır. Sabit koyu palet kullanan ekranlar (Canlı TV) çıktıdan
 *    `FIXED_DARK_SKELETON` alır.
 *
 * 4. **`pointerEvents="none"`.** İskelet bir `View`'dır; TV kumandası
 *    odağı onu yakalayamaz, ekran arka planındaki gerçek öğelere gider.
 */

import { useThemeContext } from "@/context/ThemeContext";
import { ColorsM3 } from "@/constants/theme";
import { StyleSheet, View } from "react-native";

/** Sabit koyu palet kullanan ekranlar için (bkz. `ChannelCard` gerekçesi). */
export const FIXED_DARK_SKELETON = {
	block: ColorsM3.dark.skeletonBlock,
	line: ColorsM3.dark.skeletonLine,
};

/**
 * Tema bağlamından iskelet renklerini okur.
 * @returns {{ block: string, line: string }}
 */
export function useSkeletonColors() {
	const { m3 } = useThemeContext();
	return { block: m3.skeletonBlock, line: m3.skeletonLine };
}

/**
 * Tek bir iskelet bloğu.
 *
 * @param {object}   props
 * @param {number|string} props.width
 * @param {number|string} props.height
 * @param {number}   [props.radius=0]
 * @param {string}   [props.color]      Verilirse tema rengi yerine bunu kullanır.
 * @param {boolean}  [props.line=false] `true` ise metin çubuğu tonu (`line`).
 * @param {object}   [props.style]
 */
export function SkeletonBlock({
	width,
	height,
	radius = 0,
	color,
	line = false,
	style,
}) {
	const colors = useSkeletonColors();
	return (
		<View
			pointerEvents="none"
			style={[
				styles.block,
				{
					width,
					height,
					borderRadius: radius,
					backgroundColor:
						color ?? (line ? colors.line : colors.block),
				},
				style,
			]}
		/>
	);
}

/**
 * Satır içi metin çubuğu — `line` tonu varsayılan.
 * Başlık/sağlık metni gibi blokların yanına konan ince çubuklar için.
 */
export function SkeletonLine({ width, height = 12, radius = 6, color, style }) {
	return (
		<SkeletonBlock
			width={width}
			height={height}
			radius={radius}
			color={color}
			line
			style={style}
		/>
	);
}

const styles = StyleSheet.create({
	block: {},
});

export default SkeletonBlock;