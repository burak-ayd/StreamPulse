import LanguageBadge from "@/components/common/LanguageBadge";
import TVPressable from "@/components/common/TVPressable";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useMemo, useState } from "react";
import {
	Platform,
	StyleSheet,
	Text,
	View,
	useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const isTV = Platform.isTV;

/**
 * CloudStream'in ana sayfa kuralı: görselin kutusu, görselin KENDİ oranına
 * yakın olacak şekilde seçilir; ekran yüzdesiyle seçilip `cover` ile
 * ezilmez. CloudStream kartları sabit dp kutulardır (114×180dp poster ≈ 2:3,
 * 180×114dp yatay ≈ 16:10) ve hangi oranın kullanılacağına veri karar verir
 * (`HomeParentItemAdapter`: `isHorizontal = info.isHorizontalImages`).
 *
 * TMDB w1280 backdrop 16:9'dur. TV hero'su tam içerik genişliğinde, yuvarlak
 * köşeli bir KART olarak kurulur; yükseklik ekrana orantılıdır ve sinematik
 * kırpma oranı her çözünürlükte sabit kalır.
 */
const POSTER_RATIO = 2 / 3;
/** Hero kutusunun hedef oranı (21:9 sinematik). Backdrop 16:9 → yanlarda değil, üst/altta kırpılır. */
const HERO_BOX_RATIO = 2.35;

const PAGE_BG = "#0d0e12";
const TV_SIDE = 24; // kartın kenar boşluğu
const TV_CARD_H_FRACTION = 0.6; // hero kartı en fazla ekranın %60'ı
const TV_REF_CARD_H = 420; // TV ölçek referansı
const CARD_RADIUS = 16;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

export default function HeroBanner({
	movie,
	platform,
	isInList,
	userAvatarUrl,
	onPlayPress,
	onInfoPress,
	onLongPress,
	onToggleList,
	onPlatformPress,
	onSearchPress,
	onProfilePress,
}) {
	const insets = useSafeAreaInsets();
	const { width: winW, height: winH } = useWindowDimensions();

	// TV'de ana container `paddingLeft: 56` (navigation rail) uyguladığı için
	// banner'ın gerçek genişliği ekran genişliğinden küçüktür — ölçüyoruz.
	const [boxW, setBoxW] = useState(0);
	const handleLayout = (e) => {
		const w = e.nativeEvent.layout.width;
		if (w > 0 && Math.abs(w - boxW) > 0.5) setBoxW(w);
	};

	const title = movie?.title || "StreamPulse";
	const rawGenres = movie?.category || movie?.genres;
	const genres =
		(Array.isArray(rawGenres) ? rawGenres.join(" • ") : rawGenres) ||
		(movie?.release_date
			? `${movie.release_date} • Film`
			: "Aksiyon • Macera • Bilim Kurgu");
	const movieRawLang =
		movie?.language ||
		movie?.languages ||
		movie?.lang ||
		movie?.audio ||
		movie?.subtitles;

	const backdropUri = movie?.backdrop_url || movie?.backdrop || null;
	const posterUri =
		movie?.poster ||
		movie?.poster_url ||
		movie?.image ||
		backdropUri ||
		"https://images.unsplash.com/photo-1534447677768-be436bb09401?w=800&auto=format&fit=crop&q=60";

	const ui = useMemo(() => {
		const w = boxW > 0 ? boxW : winW;

		if (isTV) {
			// --- Yatay backdrop varsa: geniş sinematik kart ---
			if (backdropUri) {
				// Kart genişliği içerik alanı; yükseklik önce sinematik orandan,
				// sonra ekran payından sınırlanır. Böylece hem oran hem de
				// kırpma oranı her çözünürlükte sabit kalır.
				const cardW = Math.max(320, w - TV_SIDE * 2);
				const maxH = winH * TV_CARD_H_FRACTION;
				const minH = Math.min(winH * 0.42, maxH);
				const cardH = clamp(
					Math.min(cardW / HERO_BOX_RATIO, maxH),
					minH,
					maxH,
				);
				const s = clamp(cardH / TV_REF_CARD_H, 0.85, 1.4);
				// Kenar boşluğu sabit: ölçeklenirse kart genişlik hesabı
				// ile uyuşmaz ve kart kapsayıcıyı taşabilir.
				const side = TV_SIDE;
				return {
					mode: "wide",
					cardW,
					cardH,
					s,
					side,
					// Hero'nun üstündeki boşluk
					topGap: Math.round(14 * s) + insets.top,
					bottomGap: Math.round(18 * s),
					headerGap: Math.round(14 * s),
					radius: Math.round(CARD_RADIUS * s),
					headerBtn: Math.round(38 * s),
					headerIcon: Math.round(21 * s),
					platformIcon: Math.round(15 * s),
					platformText: Math.round(12 * s),
					titleSize: Math.round(26 * s),
					metaSize: Math.round(13 * s),
					actionIcon: Math.round(21 * s),
					actionLabel: Math.round(11 * s),
					actionColW: Math.round(58 * s),
					playPadH: Math.round(24 * s),
					playPadV: Math.round(9 * s),
					playIcon: Math.round(17 * s),
					playText: Math.round(15 * s),
					buttonsGap: Math.round(30 * s),
					overlayPadX: Math.round(26 * s),
					overlayPadB: Math.round(20 * s),
					contentMaxW: cardW - Math.round(52 * s),
				};
			}

			// --- Backdrop yok: dikey poster kartı (2:3) ---
			const cardH = clamp(winH * 0.54, 300, 540);
			const cardW = Math.round(cardH * POSTER_RATIO);
			const s = clamp(cardH / 390, 0.85, 1.4);
			const side = Math.round(22 * s);
			const rowGap = Math.round(22 * s);
			return {
				mode: "poster",
				cardW,
				cardH,
				s,
				side,
				topGap: Math.round(16 * s) + insets.top,
				bottomGap: Math.round(18 * s),
				headerGap: Math.round(14 * s),
				rowGap,
				radius: Math.round(CARD_RADIUS * s),
				headerBtn: Math.round(38 * s),
				headerIcon: Math.round(21 * s),
				platformIcon: Math.round(15 * s),
				platformText: Math.round(12 * s),
				titleSize: Math.round(24 * s),
				metaSize: Math.round(13 * s),
				actionIcon: Math.round(21 * s),
				actionLabel: Math.round(11 * s),
				actionColW: Math.round(58 * s),
				playPadH: Math.round(24 * s),
				playPadV: Math.round(9 * s),
				playIcon: Math.round(17 * s),
				playText: Math.round(15 * s),
				buttonsGap: Math.round(30 * s),
				contentMaxW: Math.max(180, w - side * 2 - cardW - rowGap),
			};
		}

		// --- Mobil: tam ekran poster hero (mevcut davranış) ---
		const bandH = clamp(Math.min(w / POSTER_RATIO, winH * 0.58), 260, 620);
		return {
			mode: "fullbleed",
			bandH,
			s: 1,
			side: 18,
			topGap: 0,
			bottomGap: 24,
			headerGap: 0,
			headerBtn: 40,
			headerIcon: 24,
			platformIcon: 16,
			platformText: 13,
			titleSize: 26,
			metaSize: 13,
			actionIcon: 24,
			actionLabel: 12,
			actionColW: 60,
			playPadH: 28,
			playPadV: 10,
			playIcon: 19,
			playText: 15,
			buttonsGap: 40,
			contentMaxW: w * 0.9,
		};
	}, [boxW, winW, winH, insets.top, backdropUri]);

	// ------------------------------------------------------------------
	// Ortak parçalar
	// ------------------------------------------------------------------
	const renderHeader = (extra) => (
		<View style={[styles.topHeader, { paddingHorizontal: ui.side }, extra]}>
			<TVPressable
				style={[
					styles.headerIconButton,
					{
						width: ui.headerBtn,
						height: ui.headerBtn,
						borderRadius: ui.headerBtn / 2,
					},
				]}
				focusedStyle={styles.headerIconButtonFocused}
				onPress={onSearchPress}>
				<Ionicons name="search" size={ui.headerIcon} color="#ffffff" />
			</TVPressable>

			{platform && (
				<TVPressable
					style={styles.platformPill}
					focusedStyle={styles.platformPillFocused}
					onPress={onPlatformPress}>
					{platform.favicon ? (
						<Image
							source={{ uri: platform.favicon }}
							style={{
								width: ui.platformIcon,
								height: ui.platformIcon,
								borderRadius: 4,
							}}
							contentFit="contain"
						/>
					) : (
						<Ionicons
							name="film-outline"
							size={Math.round(ui.platformIcon * 0.85)}
							color="#ffffff"
						/>
					)}
					<Text
						style={[styles.platformText, { fontSize: ui.platformText }]}
						numberOfLines={1}>
						{platform.name}
					</Text>
					<Ionicons
						name="chevron-down"
						size={Math.round(ui.platformIcon * 0.85)}
						color="#9ca3af"
					/>
				</TVPressable>
			)}

			<TVPressable
				style={[
					styles.profileButton,
					{
						width: ui.headerBtn,
						height: ui.headerBtn,
						borderRadius: ui.headerBtn / 2,
						borderWidth: 2,
					},
				]}
				focusedStyle={styles.profileButtonFocused}
				onPress={onProfilePress}>
				{userAvatarUrl ? (
					<Image
						source={{ uri: userAvatarUrl }}
						style={[
							styles.avatarImage,
							{ borderRadius: ui.headerBtn / 2 - 2 },
						]}
						contentFit="cover"
					/>
				) : (
					<View
						style={[
							styles.avatarPlaceholder,
							{ borderRadius: ui.headerBtn / 2 - 2 },
						]}>
						<Ionicons
							name="person"
							size={Math.round(ui.headerIcon * 0.8)}
							color="#38bdf8"
						/>
					</View>
				)}
			</TVPressable>
		</View>
	);

	const renderActions = (align) => (
		<View
			style={[
				styles.buttonsRow,
				{ gap: ui.buttonsGap, justifyContent: align },
			]}>
			<TVPressable
				style={[styles.actionColumn, { width: ui.actionColW }]}
				focusedStyle={styles.actionColumnFocused}
				onPress={onToggleList}>
				<Ionicons
					name={isInList ? "checkmark" : "add"}
					size={ui.actionIcon}
					color="#ffffff"
				/>
				<Text style={[styles.actionLabel, { fontSize: ui.actionLabel }]}>
					{isInList ? "Listede" : "Listem"}
				</Text>
			</TVPressable>

			<TVPressable
				autoFocus={true}
				style={[
					styles.playButton,
					{
						paddingHorizontal: ui.playPadH,
						paddingVertical: ui.playPadV,
						borderRadius: Math.round(ui.playPadV * 3),
					},
				]}
				focusedStyle={styles.playButtonFocused}
				onPress={onPlayPress}>
				<Ionicons
					name="play"
					size={ui.playIcon}
					color="#000000"
					style={{ marginLeft: 2 }}
				/>
				<Text style={[styles.playButtonText, { fontSize: ui.playText }]}>
					Oynat
				</Text>
			</TVPressable>

			<TVPressable
				style={[styles.actionColumn, { width: ui.actionColW }]}
				focusedStyle={styles.actionColumnFocused}
				onPress={onInfoPress}>
				<Ionicons
					name="information-circle-outline"
					size={ui.actionIcon}
					color="#ffffff"
				/>
				<Text style={[styles.actionLabel, { fontSize: ui.actionLabel }]}>
					Bilgi
				</Text>
			</TVPressable>
		</View>
	);

	/** Kategori + dil rozeti tek satırda. */
	const renderMetaRow = (align) => (
		<View
			style={[
				styles.metaRow,
				{
					alignSelf: align === "center" ? "center" : "flex-start",
					justifyContent: align === "center" ? "center" : "flex-start",
				},
			]}>
			{movieRawLang ? (
				<LanguageBadge
					language={movieRawLang}
					size={isTV ? "small" : "normal"}
				/>
			) : null}
			<Text
				style={[
					styles.metaText,
					{ fontSize: ui.metaSize, maxWidth: ui.contentMaxW },
				]}
				numberOfLines={1}>
				{genres}
			</Text>
		</View>
	);

	// ------------------------------------------------------------------
	// TV — geniş sinematik hero KARTI (üstte boşluk + yuvarlak kenarlar)
	// ------------------------------------------------------------------
	if (ui.mode === "wide") {
		return (
			<View
				style={[styles.cardScreen, { paddingTop: ui.topGap }]}
				onLayout={handleLayout}>
				{renderHeader({ marginBottom: ui.headerGap })}

				<View
					style={[
						styles.heroCard,
						{
							width: ui.cardW,
							height: ui.cardH,
							borderRadius: ui.radius,
							marginHorizontal: ui.side,
						},
					]}>
					<Image
						source={{ uri: backdropUri }}
						style={styles.heroCardImage}
						contentFit="cover"
						contentPosition="center"
						transition={250}
						cachePolicy="memory-disk"
					/>

					{/* Alt karartma: içerik okunurluğu + sayfa zeminine yumuşak geçiş */}
					<LinearGradient
						colors={[
							"transparent",
							"rgba(13, 14, 18, 0.45)",
							"rgba(13, 14, 18, 0.88)",
						]}
						locations={[0.3, 0.66, 1]}
						style={styles.heroScrim}
					/>

					<View
						style={[
							styles.heroOverlay,
							{
								paddingLeft: ui.overlayPadX,
								paddingRight: ui.overlayPadX,
								paddingBottom: ui.overlayPadB,
							},
						]}>
						<Text
							style={[
								styles.heroTitle,
								{ fontSize: ui.titleSize, maxWidth: ui.contentMaxW },
							]}
							numberOfLines={2}>
							{title}
						</Text>

						<View style={{ marginBottom: 10 * ui.s }}>
							{renderMetaRow("left")}
						</View>

						{renderActions("flex-start")}
					</View>
				</View>

				<View style={{ height: ui.bottomGap }} />
			</View>
		);
	}

	// ------------------------------------------------------------------
	// TV — backdrop yoksa dikey poster kartı (2:3)
	// ------------------------------------------------------------------
	if (ui.mode === "poster") {
		return (
			<View
				style={[styles.cardScreen, { paddingTop: ui.topGap }]}
				onLayout={handleLayout}>
				{renderHeader({ marginBottom: ui.headerGap })}

				<View
					style={[
						styles.heroRow,
						{ paddingHorizontal: ui.side, gap: ui.rowGap },
					]}>
					<View
						style={[
							styles.heroCard,
							{
								width: ui.cardW,
								height: ui.cardH,
								borderRadius: ui.radius,
							},
						]}>
						<Image
							source={{ uri: posterUri }}
							style={styles.heroCardImage}
							contentFit="cover"
							contentPosition="center"
							transition={250}
							cachePolicy="memory-disk"
						/>
						<LinearGradient
							colors={["transparent", "rgba(0,0,0,0.35)"]}
							locations={[0.55, 1]}
							style={styles.heroCardFade}
						/>
					</View>

					<View style={[styles.heroTextCol, { width: ui.contentMaxW }]}>
						<Text
							style={[
								styles.heroTitle,
								{ fontSize: ui.titleSize, maxWidth: ui.contentMaxW },
							]}
							numberOfLines={2}>
							{title}
						</Text>
						<View style={{ marginBottom: 10 * ui.s }}>
							{renderMetaRow("left")}
						</View>
						{renderActions("flex-start")}
					</View>
				</View>

				<View style={{ height: ui.bottomGap }} />
			</View>
		);
	}

	// ------------------------------------------------------------------
	// Mobil — tam ekran poster hero
	// ------------------------------------------------------------------
	return (
		<View
			style={[styles.bannerContainer, { height: ui.bandH }]}
			onLayout={handleLayout}>
			<Image
				source={{ uri: posterUri }}
				style={StyleSheet.absoluteFill}
				contentFit="cover"
				contentPosition="center"
				transition={250}
				cachePolicy="memory-disk"
			/>

			<LinearGradient
				colors={[
					"rgba(13, 14, 18, 0.85)",
					"rgba(13, 14, 18, 0.4)",
					"transparent",
				]}
				locations={[0, 0.6, 1]}
				style={styles.topGradient}
			/>

			<LinearGradient
				colors={[
					"transparent",
					"rgba(13, 14, 18, 0.2)",
					"rgba(13, 14, 18, 0.65)",
					"rgba(13, 14, 18, 0.92)",
					PAGE_BG,
					PAGE_BG,
				]}
				locations={[0, 0.25, 0.55, 0.8, 0.94, 1]}
				style={styles.bottomGradient}
			/>

			{renderHeader({ top: insets.top + 8, position: "absolute" })}

			<View style={[styles.bottomContent, { bottom: ui.bottomGap }]}>
				<Text
					style={[
						styles.movieTitle,
						{ fontSize: ui.titleSize, maxWidth: ui.contentMaxW },
					]}
					numberOfLines={2}>
					{title}
				</Text>
				<View style={{ marginBottom: 12 }}>
					{renderMetaRow("center")}
				</View>
				{renderActions("center")}
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	/** Hero bloğu: sayfa zemininde, üstte boşluk bırakarak */
	cardScreen: {
		width: "100%",
		backgroundColor: PAGE_BG,
	},
	/** Yuvarlak köşeli hero görsel kutusu */
	heroCard: {
		overflow: "hidden",
		backgroundColor: "#1c1e24",
		borderWidth: 1,
		borderColor: "rgba(255,255,255,0.08)",
		position: "relative",
	},
	heroCardImage: {
		width: "100%",
		height: "100%",
	},
	/** Geniş kartın alt karartması */
	heroScrim: {
		position: "absolute",
		left: 0,
		right: 0,
		bottom: 0,
		height: "68%",
	},
	/** Poster kartının alt karartması */
	heroCardFade: {
		position: "absolute",
		left: 0,
		right: 0,
		bottom: 0,
		height: "30%",
	},
	/** Kartın sol-alt köşesindeki içerik */
	heroOverlay: {
		position: "absolute",
		left: 0,
		right: 0,
		bottom: 0,
		alignItems: "flex-start",
	},
	/** Poster kartı yanındaki metin sütunu */
	heroRow: {
		flexDirection: "row",
		alignItems: "flex-start",
	},
	heroTextCol: {
		flexShrink: 1,
		justifyContent: "center",
		paddingTop: 2,
	},

	/** Mobil tam ekran banner */
	bannerContainer: {
		width: "100%",
		position: "relative",
		backgroundColor: PAGE_BG,
		overflow: "hidden",
	},
	topGradient: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		height: 120,
	},
	bottomGradient: {
		position: "absolute",
		bottom: 0,
		left: 0,
		right: 0,
		height: 350,
	},
	topHeader: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
	},
	bottomContent: {
		position: "absolute",
		left: 0,
		right: 0,
		alignItems: "center",
		paddingHorizontal: 16,
	},
	heroTitle: {
		color: "#ffffff",
		fontWeight: "800",
		letterSpacing: -0.3,
		marginBottom: 6,
		textShadowColor: "rgba(0, 0, 0, 0.85)",
		textShadowOffset: { width: 0, height: 2 },
		textShadowRadius: 6,
	},
	movieTitle: {
		color: "#ffffff",
		fontWeight: "800",
		textAlign: "center",
		letterSpacing: -0.3,
		marginBottom: 6,
		textShadowColor: "rgba(0, 0, 0, 0.8)",
		textShadowOffset: { width: 0, height: 2 },
		textShadowRadius: 6,
	},
	/** Kategori + dil rozeti satırı */
	metaRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
	},
	metaText: {
		color: "#D1D5DB",
		fontWeight: "500",
		flexShrink: 1,
	},
	buttonsRow: {
		flexDirection: "row",
		alignItems: "center",
	},
	headerIconButton: {
		backgroundColor: "rgba(0, 0, 0, 0.35)",
		justifyContent: "center",
		alignItems: "center",
	},
	headerIconButtonFocused: {
		backgroundColor: "rgba(255, 59, 48, 0.35)",
		borderColor: "#FF3B30",
		borderWidth: 1.5,
		transform: [{ scale: 1.15 }],
	},
	platformPill: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: "rgba(22, 27, 34, 0.8)",
		borderColor: "rgba(255, 255, 255, 0.15)",
		borderWidth: 1,
		paddingHorizontal: isTV ? 11 : 12,
		paddingVertical: isTV ? 5 : 6,
		borderRadius: 20,
		gap: isTV ? 4 : 6,
		flexShrink: 1,
	},
	platformPillFocused: {
		backgroundColor: "rgba(255, 59, 48, 0.4)",
		borderColor: "#FF3B30",
		borderWidth: 1.5,
		transform: [{ scale: 1.08 }],
	},
	platformText: {
		color: "#ffffff",
		fontWeight: "600",
		letterSpacing: 0.2,
	},
	profileButton: {
		borderColor: "#2563EB",
		overflow: "hidden",
		justifyContent: "center",
		alignItems: "center",
		backgroundColor: "rgba(0, 0, 0, 0.35)",
	},
	profileButtonFocused: {
		borderColor: "#FF3B30",
		transform: [{ scale: 1.15 }],
	},
	avatarImage: {
		width: "100%",
		height: "100%",
		overflow: "hidden",
	},
	avatarPlaceholder: {
		width: "100%",
		height: "100%",
		justifyContent: "center",
		alignItems: "center",
		backgroundColor: "rgba(37, 99, 235, 0.2)",
	},
	actionColumn: {
		alignItems: "center",
		justifyContent: "center",
		gap: 3,
		paddingVertical: 5,
		borderRadius: 12,
	},
	actionColumnFocused: {
		backgroundColor: "rgba(255, 59, 48, 0.25)",
		borderColor: "#FF3B30",
		borderWidth: 1.5,
		transform: [{ scale: 1.12 }],
	},
	actionLabel: {
		color: "#E5E7EB",
		fontWeight: "500",
	},
	playButton: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "#FFFFFF",
		gap: 6,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 3 },
		shadowOpacity: 0.3,
		shadowRadius: 5,
		elevation: 4,
		borderWidth: 2,
		borderColor: "transparent",
	},
	playButtonFocused: {
		backgroundColor: "#FF3B30",
		borderColor: "#FFFFFF",
		transform: [{ scale: 1.12 }],
		elevation: 10,
		shadowColor: "#FF3B30",
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.6,
		shadowRadius: 10,
	},
	playButtonText: {
		color: "#000000",
		fontWeight: "700",
	},
});