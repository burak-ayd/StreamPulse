import LanguageBadge from "@/components/common/LanguageBadge";
import TVPressable from "@/components/common/TVPressable";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useMemo, useState } from "react";
import {
	StyleSheet,
	Text,
	View,
	useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * Hero tasarımı TEK bir kuralla tüm cihazlarda aynıdır:
 *
 *   1. Üstte boşluk bırakılır (header bu boşluğun içinde durur).
 *   2. Görsel, kenarları YUVARLATILMIŞ bir KART içinde gösterilir.
 *   3. Kartın en-boy oranı görselin oranından türetilir (CloudStream'in
 *      kuralı: kutu görselin kendi oranına yakın olur, ekran yüzdesiyle
 *      ezilmez. CloudStream kartları sabit dp kutulardır — 114×180dp
 *      poster ≈ 2:3, 180×114dp yatay ≈ 16:10 — ve oranı veri belirler:
 *      `HomeParentItemAdapter`: `isHorizontal = info.isHorizontalImages`).
 *   4. Kart daima yüksekliğe sığmıyorsa GENİŞLİĞİ küçülür; oranı bozulmaz.
 *
 * Sadece YERLEŞİM cihaza göre değişir:
 *   • Yeterli yer varsa → metin kartın altında/solunda yer alır
 *   • Geniş ve yüksek kart (TV, tablet yatay) → metin kartın sol-altına
 *     bindirilir (sinematik görünüm)
 *
 * Yatay kaynak = 16:9 backdrop, dikey kaynak = 2:3 poster.
 */
/** Hero kartının hedef oranı (kaynak oranına göre hafif kırpma). */
const BACKDROP_CARD_RATIO = 1.9; // yatay 16:9 backdrop
const POSTER_CARD_RATIO = 0.78; // dikey 2:3 poster

const PAGE_BG = "#0d0e12";
const CARD_RADIUS = 16;

/** Bu genişliğin üstü "geniş ekran" sayılır (TV / tablet). */
const ROOMY_WIDTH = 700;
/** Metnin kartın yanında sığması için gereken en az genişlik. */
const MIN_TEXT_COLUMN = 250;
/** Sinematik yerleşim için ekranın yatay ve yeterince yüksek olması. */
const CINEMATIC_MIN_HEIGHT = 480;
/** Sinematik kartın ekranın en fazla bu kadarını kaplaması. */
const CINEMATIC_MAX_FRACTION = 0.66;
/** Metin kartın altındaysa kartın ekranın en fazla bu kadarını kaplaması. */
const STACKED_MAX_FRACTION = 0.46;

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

	// İçerik alanının gerçek genişliği. Sol ray (TV / tablet yatay) açıkken
	// ekran genişliğinden küçüktür; bu yüzden tahmin etmiyoruz, ölçüyoruz.
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

	const hasBackdrop = !!backdropUri;

	const ui = useMemo(() => {
		const w = boxW > 0 ? boxW : winW;

		// ---- 1) Yerleşim kararı, kart ölçüsünden BAĞIMSIZ ----
		const landscape = winW > winH;
		const roomy = w >= ROOMY_WIDTH;

		// Yatay backdrop varsa ve ekran yatay/yeterince yüksekse → sinematik
		// (TV, tablet yatay). Metin kartın içine bindirilir.
		const cinematic = hasBackdrop && landscape && winH >= CINEMATIC_MIN_HEIGHT;
		// Poster gibi dikey kaynaklarda, geniş yatay ekranda metin yanına gider.
		const textBeside = !cinematic && roomy && landscape;

		// ---- 2) Sabit yerleşim ölçüleri ----
		const side = roomy ? 24 : 16;
		const topGap = (roomy ? 14 : 10) + insets.top;
		const headerH = 38;
		const headerGap = roomy ? 14 : 10;
		const bottomGap = roomy ? 18 : 14;

		// ---- 3) Metin bloğu yüksekliği (yerleşime göre yer ayır) ----
		// Büyütülmüş punto ile: başlık 2 satır + meta + buton sırası.
		const textScale = clamp(Math.min(w, winH) / 460, 0.72, 1.3);
		const textBlock = cinematic ? 0 : Math.round(165 * textScale);
		const availH = Math.max(
			160,
			winH - topGap - headerH - headerGap - textBlock - bottomGap,
		);

		// ---- 4) Kart boyutu: oran korunur, gerekirse küçülür ----
		const cardRatio = hasBackdrop ? BACKDROP_CARD_RATIO : POSTER_CARD_RATIO;
		const fullW = w - side * 2;
		let cardW;
		let cardH;

		if (cinematic) {
			// Tam genişlik, sinematik oran; ekranın %66'sını aşmaz.
			cardW = fullW;
			cardH = cardW / cardRatio;
			const cap = winH * CINEMATIC_MAX_FRACTION;
			if (cardH > cap) {
				cardH = cap;
				cardW = cardH * cardRatio;
			}
		} else if (textBeside) {
			// Kart solda, metin sağda: ikisi birlikte sığmalı.
			const maxCardW = Math.max(
				160,
				fullW - (roomy ? 22 : 14) - MIN_TEXT_COLUMN,
			);
			cardW = Math.min(fullW, maxCardW);
			cardH = Math.min(cardW / cardRatio, availH);
			cardW = cardH * cardRatio;
		} else {
			// Kart üstte, metin altta: dikey ekranda kart oranı uzun olduğu için
			// ekran payı da sınırlanır.
			cardW = fullW;
			cardH = Math.min(cardW / cardRatio, availH, winH * STACKED_MAX_FRACTION);
			if (cardH * cardRatio < cardW * 0.6) cardW = cardH * cardRatio;
		}

		cardW = Math.round(cardW);
		cardH = Math.round(cardH);

		const gap = roomy ? 22 : 14;
		const textW = Math.max(MIN_TEXT_COLUMN, fullW - cardW - gap);

		const mode = cinematic ? "overlay" : textBeside ? "side" : "below";

		// Ölçek artık EKRANDAN türer, hero kartından değil. Önceden kart
		// yüksekliğine bağlıydı; telefonda backdrop'lı kart kısa (≈190dp)
		// kaldığı için ölçek 0.78'e düşüyor ve header/metin küçülüyordu.
		// Alt sınır 1.0: telefonda tam punto, TV'de kart yüksekliğine göre
		// biraz büyük.
		const s = clamp(cardH / 420, 1, 1.45);

		return {
			mode,
			sideBySide: textBeside,
			overlay: cinematic,
			rowDirection: textBeside ? "row" : "column",
			cardW,
			cardH,
			side,
			gap,
			textW,
			topGap,
			headerGap,
			bottomGap,
			radius: Math.round(CARD_RADIUS * s),
			s,
			headerBtn: Math.round(40 * s),
			headerIcon: Math.round(22 * s),
			platformIcon: Math.round(16 * s),
			platformText: Math.round(13 * s),
			titleSize: Math.round(26 * s),
			metaSize: Math.round(14 * s),
			actionIcon: Math.round(23 * s),
			actionLabel: Math.round(12 * s),
			actionColW: Math.round(62 * s),
			playPadH: Math.round(26 * s),
			playPadV: Math.round(10 * s),
			playIcon: Math.round(18 * s),
			playText: Math.round(16 * s),
			buttonsGap: Math.round(30 * s),
			overlayPadX: Math.round(26 * s),
			overlayPadB: Math.round(20 * s),
			// Poster kartlarında üst kısım (yüzler) korunur.
			contentPosition: hasBackdrop ? "center" : "top",
		};
	}, [boxW, winW, winH, insets.top, hasBackdrop]);

	// ------------------------------------------------------------------
	// Ortak parçalar
	// ------------------------------------------------------------------
	const renderHeader = () => (
		<View
			style={[styles.topHeader, { paddingHorizontal: ui.side }]}
			onLayout={handleLayout}>
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

	const renderTitle = (align, maxWidth) => (
		<Text
			style={[
				styles.heroTitle,
				{ fontSize: ui.titleSize, textAlign: align, maxWidth },
			]}
			numberOfLines={2}>
			{title}
		</Text>
	);

	const renderMeta = (align, maxWidth) => (
		<View
			style={[
				styles.metaRow,
				{
					maxWidth,
					alignSelf: align === "center" ? "center" : "flex-start",
					justifyContent:
						align === "center" ? "center" : "flex-start",
				},
			]}>
			{movieRawLang ? (
				<LanguageBadge language={movieRawLang} size="small" />
			) : null}
			<Text
				style={[styles.metaText, { fontSize: ui.metaSize }]}
				numberOfLines={2}>
				{genres}
			</Text>
		</View>
	);

	// ------------------------------------------------------------------
	// Hero görseli: her modda aynı yuvarlak kart
	// ------------------------------------------------------------------
	const renderCard = (withOverlayContent) => (
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
				source={{ uri: hasBackdrop ? backdropUri : posterUri }}
				style={styles.heroCardImage}
				contentFit="cover"
				contentPosition={ui.contentPosition}
				recyclingKey={hasBackdrop ? backdropUri : posterUri}
				transition={0}
				cachePolicy="memory-disk"
			/>

			{withOverlayContent ? (
				<>
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
						{renderTitle("left", ui.cardW - ui.overlayPadX * 2)}
						<View style={{ marginBottom: 10 * ui.s }}>
							{renderMeta(
								"left",
								ui.cardW - ui.overlayPadX * 2,
							)}
						</View>
						{renderActions("flex-start")}
					</View>
				</>
			) : (
				<LinearGradient
					colors={["transparent", "rgba(0,0,0,0.32)"]}
					locations={[0.72, 1]}
					style={styles.heroCardFade}
				/>
			)}
		</View>
	);

	// ------------------------------------------------------------------
	// Sinematik: metin kartın sol-altına bindirilir (TV / tablet yatay)
	// ------------------------------------------------------------------
	if (ui.overlay) {
		return (
			<View style={[styles.cardScreen, { paddingTop: ui.topGap }]}>
				{renderHeader()}
				<View style={{ marginTop: ui.headerGap, alignItems: "center" }}>
					{renderCard(true)}
				</View>
				<View style={{ height: ui.bottomGap }} />
			</View>
		);
	}

	// ------------------------------------------------------------------
	// Metin kartın yanında (yatay yer varsa)
	// ------------------------------------------------------------------
	if (ui.sideBySide) {
		return (
			<View style={[styles.cardScreen, { paddingTop: ui.topGap }]}>
				{renderHeader()}
				<View
					style={[
						styles.heroRow,
						{
							flexDirection: "row",
							alignItems: "flex-start",
							marginTop: ui.headerGap,
							paddingHorizontal: ui.side,
							gap: ui.gap,
						},
					]}>
					{renderCard(false)}
					<View style={{ width: ui.textW }}>
						{renderTitle("left", ui.textW)}
						<View style={{ marginBottom: 10 * ui.s }}>
							{renderMeta("left", ui.textW)}
						</View>
						{renderActions("flex-start")}
					</View>
				</View>
				<View style={{ height: ui.bottomGap }} />
			</View>
		);
	}

	// ------------------------------------------------------------------
	// Metin kartın altında (dar ekran / dikey telefon)
	// ------------------------------------------------------------------
	return (
		<View style={[styles.cardScreen, { paddingTop: ui.topGap }]}>
			{renderHeader()}
			<View
				style={[
					styles.heroRow,
					{
						marginTop: ui.headerGap,
						paddingHorizontal: ui.side,
						gap: ui.gap,
					},
				]}>
				{renderCard(false)}
				<View style={{ width: ui.cardW, marginTop: 4 * ui.s }}>
					{renderTitle("left", ui.cardW)}
					<View style={{ marginBottom: 10 * ui.s }}>
						{renderMeta("left", ui.cardW)}
					</View>
					{renderActions("center")}
				</View>
			</View>
			<View style={{ height: ui.bottomGap }} />
		</View>
	);
}

const styles = StyleSheet.create({
	/** Hero bloğu: üstte boşluk, sayfa zemini */
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
		height: "70%",
	},
	/** Alttaki metin kartları için hafif karartma */
	heroCardFade: {
		position: "absolute",
		left: 0,
		right: 0,
		bottom: 0,
		height: "28%",
	},
	/** Kartın sol-alt köşesindeki bindirilmiş içerik */
	heroOverlay: {
		position: "absolute",
		left: 0,
		right: 0,
		bottom: 0,
		alignItems: "flex-start",
	},
	/** Kart + metin satırı */
	heroRow: {
		flexDirection: "column",
		alignItems: "center",
	},
	topHeader: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
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
	/** Kategori + dil rozeti satırı */
	metaRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		flexWrap: "wrap",
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
		paddingHorizontal: 11,
		paddingVertical: 5,
		borderRadius: 20,
		gap: 4,
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
		borderWidth: 2,
		borderColor: "transparent",
	},
	playButtonFocused: {
		backgroundColor: "#FF3B30",
		borderColor: "#FFFFFF",
		transform: [{ scale: 1.12 }],
	},
	playButtonText: {
		color: "#000000",
		fontWeight: "700",
	},
});