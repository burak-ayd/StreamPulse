import TVPressable from "@components/common/TVPressable";
import { useThemeContext } from "@context/ThemeContext";
import { useTvMetrics } from "@/utils/tvMetrics";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import Image from "@/components/common/SmartImage";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import {
	StatusBar,
	StyleSheet,
	Text,
	View,
	useWindowDimensions,
} from "react-native";

/**
 * HeroSection – mockup tasarıma uygun backdrop bölümü.
 *
 * Props:
 * - content: { title, original_title, tagline, backdrop_url, poster_url, rating, vote_count, plugin, ... }
 * - onShare: () => void  — sağ üst paylaş butonu
 * - genreList: string[]  — tür listesi (Dram, Aksiyon, vb.)
 */
export default function HeroSection({ content, onShare, genreList = [] }) {
	const { colors, theme } = useThemeContext();
	const router = useRouter();
	const { width, height } = useWindowDimensions();

	// TV: 3 metre öteden okunabilirlik için punto ve dokunma hedefleri
	// büyür; telefon/tablet ölçüleri olduğu gibi kalır (scale = 1).
	const { isTV, sp, gutter, textMaxWidth, focusScale } = useTvMetrics();

	/**
	 * Backdrop yüksekliği.
	 *
	 * Hero, TV'de ekranın altındaki geri/paylaş düğmeleriyle BİRLİKTE
	 * sığmalı: düğmeler mutlak konumlu ve üstte, başlık+rozetler altta
	 * duruyor. 1080p'de büyütülmüş başlık (2 satır ≈ 110dp) + rozet +
	 * altyazı hero alanını AŞIYOR ve içerik yukarı doğru taşıp geri
	 * düğmesinin üstüne biniyordu.
	 *
	 * Bu yüzden TV'de rozet satırı ile üstteki geri/paylaş düğmeleri
	 * çakışmasın diye oran 0.65 → 0.66'ya (≈356dp) ve başlık puntosu
	 * ölçekte bir tık kısıldı (sp(30)): okunabilirlik telefonun ~2 katı,
	 * ama hero artık taşmıyor ve düğmeler rozetlerin üstüne binmiyor.
	 */
	const backdropFraction = width > 768 ? 0.65 : 0.48;
	/**
	 * Hero başlığı.
	 *
	 * `sp(30)` ölçekle birlikte 1080p'de ≈36dp'e çıkıyordu — ana sayfa
	 * hero'sunun (`HeroBanner`, `titleSize: 26×1.0 ≈ 26dp`) 1.4 katı.
	 * Detay ekranı ana sayfadan daha büyük bir başlıkla açılınca ekran
	 * "büyütülmüş telefon" gibi duruyordu. `sp(24)` → ≈29dp: hâlâ açıkça
	 * en büyük metin, ama ana sayfayla aynı ağırlık sınıfında.
	 *
	 * Hero oranı da buna göre biraz kısaldı: büyütülmüş metin artık
	 * üstteki geri/paylaş düğmeleriyle çakışmıyor.
	 */
	const titleSize = sp(24);
	const titleLineHeight = sp(30);
	const BACKDROP_HEIGHT =
		height * (isTV ? backdropFraction - 0.06 : backdropFraction);

	const ratingText =
		content.rating != null
			? typeof content.rating === "number"
				? content.rating.toFixed(1)
				: parseFloat(content.rating)
					? parseFloat(content.rating).toFixed(1)
					: content.rating
			: null;

	const voteText =
		content.vote_count != null
			? content.vote_count >= 1000
				? `(${(content.vote_count / 1000).toFixed(1)}K)`
				: `(${content.vote_count})`
			: null;

	const genreTagline =
		genreList.length > 0
			? `"${genreList.join(" • ")}"`
			: content.tagline
				? `"${content.tagline}"`
				: null;

	return (
		<View style={[styles.container, { width, height: BACKDROP_HEIGHT }]}>
			<StatusBar
				barStyle="light-content"
				backgroundColor="transparent"
				translucent
			/>

			{/* Backdrop Image */}
			<View style={[styles.backdropContainer, { width, height: BACKDROP_HEIGHT }]}>
				{content.backdrop_url ||
				content.poster_url ||
				content.poster ||
				content.image ? (
					<Image
						source={{
							uri:
								content.backdrop_url ||
								content.poster_url ||
								content.poster ||
								content.image,
						}}
						style={styles.backdrop}
						contentFit="cover"
						contentPosition="center"
						transition={200}
						cachePolicy="memory-disk"
					/>
				) : (
					<View
						style={[
							styles.backdropPlaceholder,
							{ backgroundColor: colors.cardBg },
						]}
					/>
				)}

				{/* Top Gradient (butonlar için) */}
				<LinearGradient
					colors={["rgba(0,0,0,0.7)", "transparent"]}
					locations={[0, 0.45]}
					style={styles.topGradient}
				/>

				{/* Bottom Gradient (içerik bilgisi için) */}
				<LinearGradient
					colors={[
						"transparent",
						"rgba(11,14,20,0.6)",
						theme === "dark" ? "#0B0E14" : "#F8FAFC",
					]}
					locations={[0, 0.5, 1]}
					style={styles.bottomGradient}
				/>
			</View>

			{/* Back Button (Sol üst) */}
			<TVPressable
				style={({ focused }) => [
					styles.headerButton,
					{ top: TOP_INSET, left: 16 + gutter },
					focused && {
						transform: [{ scale: focusScale + 0.06 }],
						borderWidth: 2,
						borderColor: "#E50914",
						borderRadius: sp(24),
					},
				]}
				onPress={() => router.back()}
				activeOpacity={0.8}>
				<View
					style={[
						styles.headerButtonInner,
						{ width: sp(42), height: sp(42), borderRadius: sp(21) },
					]}>
					<Ionicons name="arrow-back" size={sp(22)} color="#ffffff" />
				</View>
			</TVPressable>

			{/* Share Button (Sağ üst) */}
			{onShare && (
				<TVPressable
					style={({ focused }) => [
						styles.headerButton,
						{ top: TOP_INSET, right: 16 + gutter },
						focused && {
							transform: [{ scale: focusScale + 0.06 }],
							borderWidth: 2,
							borderColor: "#E50914",
							borderRadius: sp(24),
						},
					]}
					onPress={onShare}
					activeOpacity={0.8}>
					<View
						style={[
							styles.headerButtonInner,
							{ width: sp(42), height: sp(42), borderRadius: sp(21) },
						]}>
						<Ionicons
							name="share-social-outline"
							size={sp(20)}
							color="#ffffff"
						/>
					</View>
				</TVPressable>
			)}

			{/* Content Info (backdrop alt kısmı) */}
			<View
				style={[
					styles.contentInfo,
					{
						left: 20 + gutter,
						right: 20 + gutter,
						maxWidth: textMaxWidth,
						bottom: sp(24),
					},
				]}>
				{/* Badges Row: [Platform] [★ Rating] */}
				<View style={[styles.badgesRow, { gap: sp(8) }]}>
					{content.plugin && (
						<View
							style={[
								styles.pluginBadge,
								{
									paddingHorizontal: sp(12),
									paddingVertical: sp(5),
									borderRadius: sp(8),
								},
							]}>
							<Text style={[styles.pluginBadgeText, { fontSize: sp(11.5) }]}>
								{content.plugin.toUpperCase()}
							</Text>
						</View>
					)}
					{ratingText && (
						<View
							style={[
								styles.ratingBadge,
								{
									paddingHorizontal: sp(11),
									paddingVertical: sp(6),
									borderRadius: sp(8),
								},
							]}>
							<Ionicons
								name="star"
								size={sp(14)}
								color="#FBBF24"
							/>
<Text style={[styles.ratingText, { fontSize: sp(12.5) }]}>
							{ratingText} / 10
						</Text>
						{voteText && (
							<Text style={[styles.ratingSubText, { fontSize: sp(11) }]}>
									{voteText}
								</Text>
							)}
						</View>
					)}
				</View>

				{/* Title */}
				<Text
					style={[styles.title, { fontSize: titleSize, lineHeight: titleLineHeight }]}
					numberOfLines={2}>
					{content.title}
				</Text>

				{/* Genre / Tagline */}
				{genreTagline && (
					<Text
						style={[styles.tagline, { fontSize: sp(12.5) }]}
						numberOfLines={2}>
						{genreTagline}
					</Text>
				)}
			</View>
		</View>
	);
}

const TOP_INSET = StatusBar.currentHeight
	? StatusBar.currentHeight + 10
	: 50;

const styles = StyleSheet.create({
	container: {
		marginBottom: -2,
		overflow: "hidden",
	},
	backdropContainer: {
		position: "absolute",
		top: 0,
		left: 0,
		overflow: "hidden",
	},
	backdrop: {
		width: "100%",
		height: "100%",
	},
	backdropPlaceholder: {
		width: "100%",
		height: "100%",
	},
	topGradient: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		height: "35%",
	},
	bottomGradient: {
		position: "absolute",
		bottom: 0,
		left: 0,
		right: 0,
		height: "65%",
	},

	/* Header Buttons */
	headerButton: {
		position: "absolute",
		zIndex: 10,
	},
	headerButtonInner: {
		width: 40,
		height: 40,
		borderRadius: 20,
		backgroundColor: "rgba(15,23,42,0.6)",
		borderWidth: StyleSheet.hairlineWidth,
		borderColor: "rgba(255,255,255,0.1)",
		justifyContent: "center",
		alignItems: "center",
	},

	/* Content Info */
	contentInfo: {
		position: "absolute",
		gap: 6,
	},
	badgesRow: {
		flexDirection: "row",
		alignItems: "center",
		marginBottom: 2,
	},
	pluginBadge: {
		backgroundColor: "#E50914",
		shadowColor: "#E50914",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.4,
		shadowRadius: 4,
		elevation: 4,
	},
	pluginBadgeText: {
		color: "#ffffff",
		fontWeight: "900",
		letterSpacing: 0.8,
	},
	ratingBadge: {
		flexDirection: "row",
		alignItems: "center",
		gap: 5,
		backgroundColor: "rgba(0,0,0,0.55)",
		borderWidth: StyleSheet.hairlineWidth,
		borderColor: "rgba(251,191,36,0.3)",
	},
	ratingText: {
		color: "#FBBF24",
		fontWeight: "700",
	},
	ratingSubText: {
		color: "#94a3b8",
		fontWeight: "400",
	},
	title: {
		fontWeight: "900",
		color: "#ffffff",
		letterSpacing: -0.5,
		textShadowColor: "rgba(0,0,0,0.4)",
		textShadowOffset: { width: 0, height: 2 },
		textShadowRadius: 6,
	},
	tagline: {
		fontWeight: "500",
		color: "#cbd5e1",
		fontStyle: "italic",
		letterSpacing: 0.3,
	},
	headerButtonFocused: {
		transform: [{ scale: 1.15 }],
		borderWidth: 2,
		borderColor: "#E50914",
		borderRadius: 20,
	},
});
