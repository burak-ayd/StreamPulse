import { useThemeContext } from "@context/ThemeContext";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import {
	StatusBar,
	StyleSheet,
	Text,
	TouchableOpacity,
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

	const BACKDROP_HEIGHT = width > 768 ? height * 0.65 : height * 0.48;

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
			<TouchableOpacity
				style={styles.headerButton}
				onPress={() => router.back()}
				activeOpacity={0.8}>
				<View style={styles.headerButtonInner}>
					<Ionicons name="arrow-back" size={22} color="#ffffff" />
				</View>
			</TouchableOpacity>

			{/* Share Button (Sağ üst) */}
			{onShare && (
				<TouchableOpacity
					style={[styles.headerButton, styles.headerButtonRight]}
					onPress={onShare}
					activeOpacity={0.8}>
					<View style={styles.headerButtonInner}>
						<Ionicons
							name="share-social-outline"
							size={20}
							color="#ffffff"
						/>
					</View>
				</TouchableOpacity>
			)}

			{/* Content Info (backdrop alt kısmı) */}
			<View style={styles.contentInfo}>
				{/* Badges Row: [Platform] [★ Rating] */}
				<View style={styles.badgesRow}>
					{content.plugin && (
						<View style={styles.pluginBadge}>
							<Text style={styles.pluginBadgeText}>
								{content.plugin.toUpperCase()}
							</Text>
						</View>
					)}
					{ratingText && (
						<View style={styles.ratingBadge}>
							<Ionicons
								name="star"
								size={12}
								color="#FBBF24"
							/>
							<Text style={styles.ratingText}>
								{ratingText} / 10
							</Text>
							{voteText && (
								<Text style={styles.ratingSubText}>
									{voteText}
								</Text>
							)}
						</View>
					)}
				</View>

				{/* Title */}
				<Text style={styles.title} numberOfLines={2}>
					{content.title}
				</Text>

				{/* Genre / Tagline */}
				{genreTagline && (
					<Text style={styles.tagline} numberOfLines={2}>
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
		top: TOP_INSET,
		left: 16,
		zIndex: 10,
	},
	headerButtonRight: {
		left: undefined,
		right: 16,
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
		bottom: 24,
		left: 20,
		right: 20,
		gap: 6,
	},
	badgesRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		marginBottom: 2,
	},
	pluginBadge: {
		backgroundColor: "#E50914",
		paddingHorizontal: 8,
		paddingVertical: 3,
		borderRadius: 6,
		shadowColor: "#E50914",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.4,
		shadowRadius: 4,
		elevation: 4,
	},
	pluginBadgeText: {
		color: "#ffffff",
		fontSize: 10,
		fontWeight: "900",
		letterSpacing: 0.8,
	},
	ratingBadge: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		backgroundColor: "rgba(0,0,0,0.55)",
		borderWidth: StyleSheet.hairlineWidth,
		borderColor: "rgba(251,191,36,0.3)",
		paddingHorizontal: 8,
		paddingVertical: 4,
		borderRadius: 6,
	},
	ratingText: {
		color: "#FBBF24",
		fontSize: 12,
		fontWeight: "700",
	},
	ratingSubText: {
		color: "#94a3b8",
		fontSize: 10,
		fontWeight: "400",
	},
	title: {
		fontSize: 28,
		fontWeight: "900",
		color: "#ffffff",
		letterSpacing: -0.5,
		lineHeight: 34,
		textShadowColor: "rgba(0,0,0,0.4)",
		textShadowOffset: { width: 0, height: 2 },
		textShadowRadius: 6,
	},
	tagline: {
		fontSize: 12,
		fontWeight: "500",
		color: "#cbd5e1",
		fontStyle: "italic",
		letterSpacing: 0.3,
	},
});
