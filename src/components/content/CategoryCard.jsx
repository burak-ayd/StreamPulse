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
 * Reanimated worklet ile elevation/border/scale UI thread'de animasyon.
 */

import { FontFamily, Palette } from "@/constants/theme";
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
import Animated, {
	useSharedValue,
	useAnimatedStyle,
	withSpring,
	interpolate,
	interpolateColor,
} from "react-native-reanimated";
import { StyleSheet, Text, View } from "react-native";

/** Ana sayfa yatay satırının sabit kart genişliği. */
export const ROW_CARD_WIDTH = 144;
/** Liste kenar boşluğu — `getItemLayout` ile aynı değeri kullanmalı. */
export const ROW_LIST_PAD_H = 16;
/** Ana sayfadaki kartlar arası boşluk. */
export const ROW_CARD_GAP = 12;

/**
 * Kart geometrisinin SAYILARI — iskelet de gerçek kart da bunları okur.
 *
 * Poster kutusu `styles.poster` içinde `aspectRatio` ile tanımlı; stil
 * nesnesinden okunamadığı için iskelet de aynı sayıyı kullanmak zorunda.
 * Kaynak: `styles.poster` / `styles.title` / `styles.subtitle`.
 */
export const CARD_POSTER_RATIO = 2 / 3;
export const CARD_POSTER_RADIUS = 12;
export const CARD_TITLE_HEIGHT = 20; // lineHeight
export const CARD_TITLE_MARGIN_TOP = 8;
export const CARD_SUBTITLE_HEIGHT = 16; // lineHeight
export const CARD_SUBTITLE_MARGIN_TOP = 2;

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

// Netflix tarzı spring konfigürasyonu
const FOCUS_SPRING = { damping: 18, stiffness: 200, mass: 0.8 };
const BLUR_SPRING = { damping: 22, stiffness: 160, mass: 0.8 };

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
	const isRow = variant === "row";
	const posterUri = posterOf(item);
	const rating = ratingOf(item);
	const lang = languageOf(item);
	const year = isRow ? null : yearOf(item);

	/** Reanimated shared values — UI thread'de animasyon */
	const focusProgress = useSharedValue(0);

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

	// Animated styles for focus — UI thread'de çalışır
	const animatedCardStyle = useAnimatedStyle(() => {
		const scale = interpolate(focusProgress.value, [0, 1], [1, 1.06]);
		return {
			transform: [{ scale }],
			zIndex: focusProgress.value > 0 ? 10 : 1,
		};
	});

	const animatedPosterStyle = useAnimatedStyle(() => {
		const borderWidth = interpolate(focusProgress.value, [0, 1], [1, 2.5]);
		const borderColor = interpolateColor(
			focusProgress.value,
			[0, 1],
			["rgba(70, 69, 84, 0.6)", Palette.primary]
		);
		const shadowOpacity = interpolate(focusProgress.value, [0, 1], [0, 0.6]);
		const shadowRadius = interpolate(focusProgress.value, [0, 1], [0, 12]);
		return {
			borderWidth,
			borderColor,
			shadowColor: Palette.primary,
			shadowOffset: { width: 0, height: 0 },
			shadowOpacity,
			shadowRadius,
		};
	});

	const animatedTitleStyle = useAnimatedStyle(() => {
		const color = interpolateColor(
			focusProgress.value,
			[0, 1],
			[Palette.onSurface, Palette.primary]
		);
		return { color };
	});

	return (
		<Animated.View style={animatedCardStyle}>
			<TVPressable
				style={[styles.card, { width: cardWidth }]}
				focusedStyle={null} // Animated style kullanıyoruz, TVPressable scale/border yapmasın
				onPress={onPress}
				onLongPress={onLongPress}
				onFocus={() => {
					focusProgress.value = withSpring(1, FOCUS_SPRING);
					onFocus?.();
				}}
				onBlur={() => {
					focusProgress.value = withSpring(0, BLUR_SPRING);
					onBlur?.();
				}}
				accessibilityLabel={[title, year].filter(Boolean).join(", ")}>
				{({ focused, pressed }) => (
					<View>
						<Animated.View
							style={[
								styles.poster,
								animatedPosterStyle,
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

							{/* Alt kenar karartması: rozetler ve metin okunur kalsın. */}
							<View style={styles.posterScrim} pointerEvents="none" />

							{rating ? (
								<View style={styles.ratingBadge} pointerEvents="none">
									<Ionicons
										name="star"
										size={10}
										color={Palette.tertiary}
									/>
									<Text style={styles.ratingText}>{rating}</Text>
								</View>
							) : null}

							{lang ? (
								<LanguageBadge
									language={lang}
									size="small"
									style={styles.langBadge}
									textStyle={styles.langBadgeText}
								/>
							) : null}
						</Animated.View>

						<Animated.View style={styles.title}>
							<Animated.Text
								style={animatedTitleStyle}
								numberOfLines={1}>
								{title}
							</Animated.Text>
						</Animated.View>

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
						<View style={styles.subtitle}>
							<Text
								style={ep ? styles.subtitleEpisode : undefined}
								numberOfLines={1}>
								{subtitle || " "}
							</Text>
						</View>
					</View>
				)}
			</TVPressable>
		</Animated.View>
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
	// Animated style'lar transform, elevation, shadow, border'ı yönetiyor
	// Bu cardFocused sadece fallback (non-TV veya Reanimated çalışmadığında)
	cardFocused: {
		transform: [{ scale: 1.08 }],
		shadowColor: Palette.primary,
		shadowOffset: { width: 0, height: 0 },
		shadowOpacity: 0.5,
		shadowRadius: 12,
		elevation: 6,
		zIndex: 1,
	},
	poster: {
		width: "100%",
		// Ana sayfada 124×182 ≈ 2:3 idi; ızgara da 2:3. Tek oran kullanmak
		// iki ekranın kartlarını görsel olarak hizalıyor.
		aspectRatio: CARD_POSTER_RATIO,
		borderRadius: CARD_POSTER_RADIUS,
		overflow: "hidden",
		backgroundColor: Palette.surfaceLow,
		// Referans: `ring-1 ring-outline-variant/30`.
		borderWidth: 1,
		borderColor: "rgba(70, 69, 84, 0.6)",
	},
	// Animated poster style borderWidth/borderColor yönetiyor
	posterFocused: {
		borderColor: Palette.primary,
		borderWidth: 3,
	},
	posterImage: {
		width: "100%",
		height: "100%",
	},
	posterScrim: {
		position: "absolute",
		left: 0,
		right: 0,
		bottom: 0,
		height: "33%",
		backgroundColor: "rgba(19, 19, 21, 0.35)",
	},
	ratingBadge: {
		position: "absolute",
		top: 8,
		right: 8,
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: 6,
		paddingVertical: 2,
		borderRadius: 999,
		gap: 2,
		backgroundColor: "rgba(32, 31, 33, 0.9)",
	},
	ratingText: {
		color: Palette.tertiary,
		fontFamily: FontFamily.semiBold,
		fontSize: 10,
		lineHeight: 12,
	},
	/** Dil rozeti: her iki varyantta da posterin üst-sol köşesinde. */
	langBadge: {
		position: "absolute",
		top: 8,
		left: 8,
		backgroundColor: "#353437",
		borderWidth: 0,
		paddingHorizontal: 6,
		paddingVertical: 2,
		borderRadius: 4,
	},
	langBadgeText: {
		color: Palette.secondary,
		fontFamily: FontFamily.semiBold,
		fontSize: 10,
		letterSpacing: 0,
	},
	title: {
		color: Palette.onSurface,
		fontFamily: FontFamily.semiBold,
		fontSize: 14,
		lineHeight: CARD_TITLE_HEIGHT,
		marginTop: CARD_TITLE_MARGIN_TOP,
		letterSpacing: -0.1,
	},
	// Animated title style color yönetiyor
	titleFocused: {
		color: Palette.primary,
	},
	/**
	 * Alt satır: bölüm kartlarında "S. Sezon E. Bölüm", diğerlerinde yıl.
	 *
	 * Satır HER ZAMAN yer ayırır (veri yoksa boş) — kart yüksekliği sabit
	 * kalmalı, yoksa `getItemLayout` ofsetleri kayar (bkz. SORUN 2).
	 */
	subtitle: {
		color: Palette.onSurfaceVariant,
		fontFamily: FontFamily.regular,
		fontSize: 12,
		lineHeight: CARD_SUBTITLE_HEIGHT,
		marginTop: CARD_SUBTITLE_MARGIN_TOP,
	},
	subtitleEpisode: {
		color: Palette.primary,
		fontFamily: FontFamily.medium,
	},
});