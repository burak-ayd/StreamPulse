/**
 * CategoryCard — KATEGORİ İÇERİK KARTI (TEK KAYNAK)
 *
 * ⚠️ BU DOSYA NEDEN VAR
 *
 * Aynı kart iki yerde kopyalanmıştı:
 *   • `components/home/MovieCategorySection.jsx` — ana sayfa, yatay satır
 *   • `app/(app)/category.jsx`                  — kategori sayfası, ızgara
 *
 * Kopyalar birbirinden ayrıldı: ana sayfada uzun basınca hızlı önizleme
 * modalı açılıyordu, kategori sayfasında yoktu. Yeni bir davranış eklemek
 * (izlenilen işareti, paylaşım, "izlemeye devam" rozeti…) iki dosyada birden
 * yazılması gerekiyordu; biri unutulunca ekranlar sessizce ayrışıyordu.
 *
 * Artık davranış TEK YERDE: basma, uzun basma, görsel yükleme, rozetler,
 * odak stili. `variant` yalnızca BAĞLAMLA İLGİLİ yerleşimi değiştirir
 * (yıl satırı, dil rozetinin yeri) — bir özellik eklemek için iki ekranı
 * güncellemeye gerek yok.
 *
 * ── variant ──────────────────────────────────────────────────────
 *   "row"  → ana sayfa yatay satırı. Sabit genişlik, yıl satırı yok,
 *            dil rozeti alt-sağda (posterin alt köşesi boş kalıyor).
 *   "grid" → kategori sayfası ızgara. Genişlik dışarıdan gelir, 2:3 poster,
 *            yıl satırı var, dil rozeti üst-sağda.
 *
 * ── Alan çözümleme ───────────────────────────────────────────────
 * Poster/puan/dil/yıl alanları `utils/contentMeta.js`'de tek yerde
 * çözülüyor (eskiden iki dosyada kopyalıydı).
 *
 * ── TV odak ──────────────────────────────────────────────────────
 * Odak anında elevation/gölge DEĞİŞTİRİLMEZ. Android'de elevation
 * değişimi outline/clip-path'i geçersiz kılar ve gölge katmanını yeniden
 * rasterize eder; kumandaya her basışta bunu yapmak geçişleri takılı kılar.
 * Border + ölçek aynı görünümü GPU'da neredeyse bedava verir.
 */

import { useThemeContext } from "@/context/ThemeContext";
import TVPressable from "@/components/common/TVPressable";
import LanguageBadge from "@/components/common/LanguageBadge";
import { languageOf, posterOf, ratingOf, yearOf } from "@/utils/contentMeta";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import Image from "@/components/common/SmartImage";
import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

/** Ana sayfa yatay satırının sabit kart genişliği. */
export const ROW_CARD_WIDTH = 124;
/** Liste kenar boşluğu — `getItemLayout` ile aynı değeri kullanmalı. */
export const ROW_LIST_PAD_H = 18;
/** Ana sayfadaki kartlar arası boşluk. */
export const ROW_CARD_GAP = 6;

/**
 * Kart geometrisinin SAYILARI — iskelet de gerçek kart da bunları okur.
 *
 * Poster kutusu `styles.poster` içinde `aspectRatio` ile tanımlı; stil
 * nesnesinden okunamadığı için iskelet de aynı sayıyı kullanmak zorunda.
 * Kaynak: `styles.poster` / `styles.title` / `styles.year`.
 */
export const CARD_POSTER_RATIO = 2 / 3;
export const CARD_POSTER_RADIUS = 12;
export const CARD_TITLE_HEIGHT = 17; // lineHeight
export const CARD_TITLE_MARGIN_TOP = 6;
export const CARD_YEAR_HEIGHT = 15; // lineHeight
export const CARD_YEAR_MARGIN_TOP = 1;

function CategoryCard({
	item,
	/** "row" (ana sayfa) | "grid" (kategori sayfası) */
	variant = "row",
	/** "row" sabit genişliği kullanır; "grid" dışarıdan hesaplanan genişlik alır. */
	width,
	onPress,
	onLongPress,
}) {
	const { m3 } = useThemeContext();

	const isRow = variant === "row";
	const posterUri = posterOf(item);
	const rating = ratingOf(item);
	const lang = languageOf(item);
	const year = isRow ? null : yearOf(item);
	const title = item?.title || "İçerik";

	const cardWidth = isRow ? ROW_CARD_WIDTH : width;

	return (
		<TVPressable
			style={[styles.card, { width: cardWidth }]}
			focusedStyle={styles.cardFocused}
			onPress={onPress}
			onLongPress={onLongPress}
			accessibilityLabel={[title, year].filter(Boolean).join(", ")}>
			{({ focused }) => (
				<View>
					<View
						style={[
							styles.poster,
							{ backgroundColor: m3.surfaceContainerHigh },
							focused && {
								borderColor: m3.primaryContainer,
								backgroundColor: m3.surfaceContainerHighest,
							},
						]}>
						<Image
							source={{ uri: posterUri }}
							style={styles.posterImage}
							contentFit="cover"
							contentPosition="center"
							// Sanallaştırılmış listede her kart için crossfade
							// çalıştırmak decode animasyonu kuyruğunu dolduruyor.
							// `recyclingKey` Glide'ın view-recycling davranışını
							// tetikliyor — CloudStream'in sharedPool mantığının karşılığı.
							recyclingKey={posterUri}
							transition={0}
							cachePolicy="memory-disk"
						/>

						{rating ? (
							<View style={styles.ratingBadge} pointerEvents="none">
								<Ionicons name="star" size={10} color="#FFD700" />
								<Text style={[styles.ratingText, { color: m3.onSurface }]}>
									{rating}
								</Text>
							</View>
						) : null}

						{lang ? (
							<LanguageBadge
								language={lang}
								size="small"
								style={isRow ? styles.langBadgeRow : styles.langBadgeGrid}
							/>
						) : null}
					</View>

					<Text
						style={[
							styles.title,
							{ color: m3.onSurface },
							focused && { color: m3.primaryContainer, fontWeight: "700" },
						]}
						numberOfLines={1}>
						{title}
					</Text>

					{year ? (
						<Text style={[styles.year, { color: m3.onSurfaceVariant }]}>
							{year}
						</Text>
					) : null}
				</View>
			)}
		</TVPressable>
	);
}

/**
 * memo: ana sayfa yeniden render olduğunda, prop'ları değişmeyen kategori
 * satırları ve kartlar yeniden render olmaz. `index.jsx` içindeki
 * callback'ler `useCallback` ile sabitlendiği için bu gerçekten tutarlı çalışır.
 */
export default memo(CategoryCard);

const styles = StyleSheet.create({
	card: {
		// genişlik dışarıdan verilir
	},
	cardFocused: {
		// zIndex kaldırıldı: kardeş sıralamasını değiştirmek odak başına ayrı
		// bir commit demek. Ölçek + listedeki boşluk sayesinde kart komşusunun
		// altına girmez, görsel olarak da yeterince belirgin.
		transform: [{ scale: 1.06 }],
	},
	poster: {
		width: "100%",
		// Ana sayfada 124×182 ≈ 2:3 idi; ızgara da 2:3. Tek oran kullanmak
		// iki ekranın kartlarını görsel olarak hizalıyor.
		aspectRatio: CARD_POSTER_RATIO,
		borderRadius: CARD_POSTER_RADIUS,
		overflow: "hidden",
		borderWidth: 2,
		borderColor: "transparent",
	},
	posterImage: {
		width: "100%",
		height: "100%",
	},
	ratingBadge: {
		position: "absolute",
		top: 6,
		left: 6,
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: 6,
		paddingVertical: 3,
		borderRadius: 12,
		gap: 3,
		borderWidth: 1,
		borderColor: "rgba(255, 255, 255, 0.1)",
		backgroundColor: "rgba(0, 0, 0, 0.75)",
	},
	ratingText: {
		fontSize: 10,
		lineHeight: 12,
		fontWeight: "700",
	},
	/** Ana sayfa: dil rozeti posterin alt-sağ köşesinde. */
	langBadgeRow: {
		position: "absolute",
		bottom: 6,
		right: 6,
	},
	/** Kategori ızgarası: dil rozeti üst-sağda (puan rozetine komşu). */
	langBadgeGrid: {
		position: "absolute",
		top: 6,
		right: 6,
	},
	title: {
		fontSize: 13,
		lineHeight: CARD_TITLE_HEIGHT,
		fontWeight: "600",
		marginTop: CARD_TITLE_MARGIN_TOP,
		letterSpacing: -0.1,
	},
	year: {
		fontSize: 11,
		lineHeight: CARD_YEAR_HEIGHT,
		marginTop: CARD_YEAR_MARGIN_TOP,
	},
});
