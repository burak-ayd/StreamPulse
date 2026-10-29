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
import {
	episodeMetaOf,
	languageOf,
	posterOf,
	ratingOf,
	yearOf,
} from "@/utils/contentMeta";
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
 * Kaynak: `styles.poster` / `styles.title` / `styles.subtitle`.
 */
export const CARD_POSTER_RATIO = 2 / 3;
export const CARD_POSTER_RADIUS = 12;
export const CARD_TITLE_HEIGHT = 17; // lineHeight
export const CARD_TITLE_MARGIN_TOP = 6;
export const CARD_SUBTITLE_HEIGHT = 15; // lineHeight
export const CARD_SUBTITLE_MARGIN_TOP = 1;

/**
 * Izgara (kategori sayfası) kartının metin bloğu yüksekliği — başlık +
 * alt satır. Alt satır veri yoksa bile yer ayırdığı için (sorun 2)
 * bu değer HER ZAMAN kartın gerçek metin yüksekliğidir.
 */
export const CARD_GRID_TEXT_BLOCK =
	CARD_TITLE_MARGIN_TOP +
	CARD_TITLE_HEIGHT +
	CARD_SUBTITLE_MARGIN_TOP +
	CARD_SUBTITLE_HEIGHT;

/**
 * Izgara kartının bir satırdaki adım uzunluğu (px).
 *
 * Kategori sayfası `FlatList` için sabit adımlı `getItemLayout`
 * hesaplamak zorunda (TV'de satır başına ölçüm yapmak kaydırmayı
 * belirgin biçimde yavaşlatıyor). Bu değer kartın gerçekten ölçülen
 * yüksekliğiyle birebir aynı olduğu için ofset kayması — dolayısıyla
 * "yeni sayfa gelince ekran atlıyor" sorunu — ortadan kalkar.
 *
 * @param {number} width  - kart genişliği (px)
 * @param {number} gap    - kartlar arası boşluk (px)
 */
export function gridCardStride(width, gap) {
	return width / CARD_POSTER_RATIO + CARD_GRID_TEXT_BLOCK + gap;
}

function CategoryCard({
	item,
	/** "row" (ana sayfa) | "grid" (kategori sayfası) */
	variant = "row",
	/** "row" sabit genişliği kullanır; "grid" dışarıdan hesaplanan genişlik alır. */
	width,
	onPress,
	onLongPress,
	/**
	 * Odak callbacks'i (TV odak ortalama — sorun 5).
	 *
	 * Çağıran liste, kart odaklandığında `scrollToIndex` çağırarak
	 * kartı ekranın ortasına getirir. `TVPressable` zaten `onFocus`/
	 * `onBlur` destekliyor; bu ikisi kart görünümüne DEĞİL, gezinme
	 * katmanına ait olduğu için buradan açıkça geçiriyoruz.
	 */
	onFocus,
	onBlur,
}) {
	const { m3 } = useThemeContext();

	const isRow = variant === "row";
	const posterUri = posterOf(item);
	const rating = ratingOf(item);
	const lang = languageOf(item);
	const year = isRow ? null : yearOf(item);

	/**
	 * Bölüm kartı mı? (Son Bölümler kategorisi)
	 *
	 * Backend artık `series_name` / `season` / `episode` alanlarını dolduruyor.
	 * Bu kartlarda başlık satırı DİZİ ADI, alt satır "S. Sezon E. Bölüm"
	 * olur — Netflix/Prime'daki gibi. Normal film/dizi kartlarında alt satır
	 * yıl gösterir (grid varyantı) ya da boş kalır (row varyantı).
	 */
	const ep = episodeMetaOf(item);
	const title = ep ? ep.seriesName || "İçerik" : item?.title || "İçerik";
	const subtitle = ep ? `${ep.season}. Sezon ${ep.episode}. Bölüm` : year || "";

	const cardWidth = isRow ? ROW_CARD_WIDTH : width;

	return (
		<TVPressable
			style={[styles.card, { width: cardWidth }]}
			focusedStyle={styles.cardFocused}
			onPress={onPress}
			onLongPress={onLongPress}
			onFocus={onFocus}
			onBlur={onBlur}
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

					{/*
				 * ⚠️ SORUN 2 — "Izgara satırları yüklendikçe ekran atlıyor".
				 *
				 * Kategori sayfasındaki `FlatList` sabit adımlı
				 * `getItemLayout` kullanıyor (TV'de ölçüm atlamak için
				 * şart). Bu, ancak TÜM kartlar aynı yükseklikteyse doğrudur.
				 * Yılı olmayan kartta yıl satırı hiç çizilmediği için
				 * o satır 12px daha kısa oluyor, `getItemLayout` yanlış
				 * ofset üretiyor ve yeni sayfa geldiğinde liste kayıyordu.
				 *
				 * Çözüm: yıl satırı DAIMA yer ayırır; veri yoksa boş
				 * (saydam) bir satır basılır. Görsel değişmez, yükseklik
				 * sabitlenir.
				 */}
					<Text
						style={[
							styles.subtitle,
							{ color: m3.onSurfaceVariant },
						]}
						numberOfLines={1}>
						{subtitle || " "}
					</Text>
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
	/**
	 * Alt satır: bölüm kartlarında "S. Sezon E. Bölüm", diğerlerinde yıl.
	 *
	 * Satır HER ZAMAN yer ayırır (veri yoksa boş) — kart yüksekliği sabit
	 * kalmalı, yoksa `getItemLayout` ofsetleri kayar (bkz. SORUN 2).
	 */
	subtitle: {
		fontSize: 11,
		lineHeight: CARD_SUBTITLE_HEIGHT,
		marginTop: CARD_SUBTITLE_MARGIN_TOP,
	},
});
