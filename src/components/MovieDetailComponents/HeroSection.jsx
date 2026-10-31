import Image from "@/components/common/SmartImage";
import { FontFamily, Palette } from "@/constants/theme";
import { useTvMetrics } from "@/utils/tvMetrics";
import TVPressable from "@components/common/TVPressable";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { StatusBar, StyleSheet, Text, View } from "react-native";

import { RatingPill, buildMetaLine } from "./MetadataSection";

/**
 * HeroSection – içerik detayının backdrop'u.
 *
 * Başlık, puan ve künye HER cihazda görselin ÜZERİNDE durur; altında ayrı
 * bir başlık bloğu yoktur (ekranın üstü gereksiz siyah kalıyordu). Karartma
 * (scrim) hem yazının okunurluğunu hem de görselin sayfa arka planına
 * dikişsiz bağlanmasını sağlar.
 */
export default function HeroSection({
	content,
	onShare,
	genres = [],
	seasonCount = 0,
	actions = null,
}) {
	const router = useRouter();
	const { isTV, isWide, sp, width, height } = useTvMetrics();

	/*
	 * Prime (10-feet) düzeni: backdrop ekranın büyük kısmını kaplar, metin
	 * SOL sütunda (ekranın ~%46'sı) durur; sağda afiş görünür kalır. Bu
	 * yüzden karartma yukarıdan aşağıya değil, soldan sağa doğru.
	 */
	/*
	 * TV yüksekliği içerik türüne göre: dizide ilk ekranda bölüm şeridinin
	 * ucu görünsün (Prime), filmde metin sığsın diye daha uzun.
	 */
	const heroH = isTV
		? Math.round(Math.min(height * (seasonCount > 0 ? 0.72 : 0.86), 720))
		: isWide
			? Math.round(Math.min(height * 0.6, 560))
			: Math.round(Math.min(width * 0.8, height * 0.55));

	const title = content.title || "";
	const titleSize = sp(
		isTV ? 40 : isWide ? (title.length > 24 ? 32 : 40) : 30,
	);
	const metaLine = buildMetaLine({ content, genres, seasonCount });

	const backdrop =
		content.backdrop_url ||
		content.poster_url ||
		content.poster ||
		content.image;

	const pad = isWide ? 32 : 16;

	return (
		<View style={[styles.container, { height: heroH }]}>
			<StatusBar
				barStyle="light-content"
				backgroundColor="transparent"
				translucent
			/>

			<View style={styles.backdropLayer}>
				{backdrop ? (
					<Image
						source={{ uri: backdrop }}
						style={styles.media}
						contentFit="cover"
						contentPosition="center"
						transition={200}
						cachePolicy="memory-disk"
					/>
				) : (
					<View style={styles.media} />
				)}
			</View>

			<LinearGradient
				colors={[
					"rgba(19,19,21,0.22)",
					"rgba(19,19,21,0.6)",
					"rgba(19,19,21,0.9)",
					Palette.background,
				]}
				locations={[0, 0.4, 0.74, 1]}
				style={styles.scrim}
			/>

			{/* TV: soldan sağa karartma — metin solda, afiş sağda görünür. */}
			{isTV ? (
				<LinearGradient
					colors={[
						"rgba(19,19,21,0.92)",
						"rgba(19,19,21,0.6)",
						"rgba(19,19,21,0)",
					]}
					locations={[0, 0.45, 1]}
					start={{ x: 0, y: 0.5 }}
					end={{ x: 1, y: 0.5 }}
					style={styles.scrim}
				/>
			) : null}

			<TVPressable
				style={styles.headerButton}
				focusedStyle={styles.focusRing}
				onPress={() => router.back()}
				accessibilityLabel="Geri">
				<Ionicons name="arrow-back" size={22} color="#ffffff" />
			</TVPressable>

			{onShare ? (
				<TVPressable
					style={[styles.headerButton, styles.headerButtonRight]}
					focusedStyle={styles.focusRing}
					onPress={onShare}
					accessibilityLabel="Paylaş">
					<Ionicons
						name="share-social-outline"
						size={20}
						color="#ffffff"
					/>
				</TVPressable>
			) : null}

			<View
				style={[
					isTV ? styles.contentTV : styles.content,
					{
						paddingHorizontal: pad,
						/* TV: Prime gibi sol sütun — sağda afiş görünür. */
						maxWidth: isTV ? Math.round(width * 0.8) : undefined,
					},
				]}>
				<Text
					style={[
						styles.title,
						{
							fontSize: titleSize,
							lineHeight: Math.round(
								titleSize * (isTV ? 1.04 : 1.12),
							),
							...(isTV ? styles.titleTV : null),
						},
					]}
					numberOfLines={isTV ? 2 : 3}>
					{title}
				</Text>

				<View style={styles.metaRow}>
					<RatingPill rating={content.rating} size={sp(13)} />
					{metaLine ? (
						<Text style={styles.metaText} numberOfLines={2}>
							{metaLine}
						</Text>
					) : null}
				</View>

				{isWide && content.overview ? (
					<Text style={styles.overview} numberOfLines={2}>
						{content.overview}
					</Text>
				) : null}

				{content.plugin ? (
					isTV ? (
						/* Prime: "✓ Prime'a Dahil" — onay ikonu + cyan satır. */
						<View style={[styles.providerInline, { gap: sp(6) }]}>
							<Ionicons
								name="checkmark-circle"
								size={sp(18)}
								color={Palette.secondary}
							/>
							<Text
								style={[
									styles.providerInlineText,
									{ fontSize: sp(14) },
								]}
								numberOfLines={1}>
								{content.plugin}
							</Text>
						</View>
					) : (
						<View style={styles.providerPill}>
							<Text style={styles.providerText} numberOfLines={1}>
								{content.plugin}
							</Text>
						</View>
					)
				) : null}

				{/* TV: eylem butonları hero'nun içinde (10-feet düzeni). */}
				{actions ? (
					<View style={{ marginTop: sp(2) }}>{actions}</View>
				) : null}
			</View>
		</View>
	);
}

const TOP_INSET = StatusBar.currentHeight ? StatusBar.currentHeight + 10 : 20;

const styles = StyleSheet.create({
	container: {
		width: "100%",
		overflow: "hidden",
		backgroundColor: Palette.surfaceLowest,
	},
	media: {
		width: "100%",
		height: "100%",
		backgroundColor: Palette.surfaceLowest,
	},
	backdropLayer: {
		...StyleSheet.absoluteFill,
		overflow: "hidden",
	},
	scrim: {
		position: "absolute",
		left: 0,
		right: 0,
		bottom: 0,
		top: 0,
	},

	headerButton: {
		position: "absolute",
		top: TOP_INSET,
		left: 16,
		width: 40,
		height: 40,
		borderRadius: 20,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "rgba(32,31,33,0.85)",
		borderWidth: 1,
		borderColor: "rgba(255,255,255,0.12)",
	},
	headerButtonRight: {
		left: undefined,
		right: 16,
	},
	focusRing: {
		borderWidth: 2,
		borderColor: Palette.primary,
	},

	content: {
		position: "absolute",
		left: 0,
		right: 0,
		bottom: 16,
		gap: 8,
	},
	/* TV: metin sütunu mutlak kalır ama üst sınırı var — başlık geri/paylaş
	   düğmelerinin altına iner, içerik fazlaysa yukarı taşmaz. */
	contentTV: {
		position: "absolute",
		left: 0,
		right: 0,
		top: TOP_INSET + 10,
		bottom: 8,
		justifyContent: "center",
		gap: 6,
	},
	title: {
		color: Palette.onSurface,
		fontFamily: FontFamily.bold,
		letterSpacing: -0.5,
		textShadowColor: "rgba(0,0,0,0.45)",
		textShadowOffset: { width: 0, height: 2 },
		textShadowRadius: 6,
	},
	/* TV: referans başlık büyük harf, sıkı ve kalın. */
	titleTV: {
		textTransform: "uppercase",
		letterSpacing: -1,
	},
	metaRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
	},
	metaText: {
		flexShrink: 1,
		color: Palette.onSurfaceVariant,
		fontFamily: FontFamily.regular,
		fontSize: 13,
	},
	overview: {
		color: Palette.onSurfaceVariant,
		fontFamily: FontFamily.regular,
		fontSize: 14,
		lineHeight: 20,
		maxWidth: 640,
	},
	providerPill: {
		flexDirection: "row",
		alignItems: "center",
		alignSelf: "flex-start",
		gap: 6,
		paddingHorizontal: 10,
		paddingVertical: 4,
		borderRadius: 999,
		backgroundColor: "rgba(53,52,55,0.9)",
		maxWidth: "80%",
	},
	providerText: {
		color: Palette.primary,
		fontFamily: FontFamily.bold,
		fontSize: 11,
		letterSpacing: 0.8,
		textTransform: "uppercase",
	},
	/* TV: "✓ Prime'a Dahil" satırı (pill yok). */
	providerInline: {
		flexDirection: "row",
		alignItems: "center",
	},
	providerInlineText: {
		color: Palette.secondary,
		fontFamily: FontFamily.semiBold,
	},
});
