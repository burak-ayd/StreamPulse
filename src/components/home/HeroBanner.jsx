import LanguageBadge from "@/components/common/LanguageBadge";
import TVPressable from "@/components/common/TVPressable";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Dimensions, Platform, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const { width } = Dimensions.get("window");
const isTV = Platform.isTV;
const BANNER_HEIGHT = isTV ? 360 : 520;

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

	// TV'de varsa yatay arka plan (backdrop), yoksa afiş görseli kullan
	const posterUri =
		(isTV && (movie?.backdrop_url || movie?.backdrop)) ||
		movie?.poster ||
		movie?.poster_url ||
		movie?.image ||
		movie?.backdrop_url ||
		"https://images.unsplash.com/photo-1534447677768-be436bb09401?w=800&auto=format&fit=crop&q=60";

	return (
		<View style={styles.bannerContainer}>
			{/* Poster Image */}
			<Image
				source={{ uri: posterUri }}
				style={styles.bannerImage}
				contentFit="cover"
				contentPosition="center"
				transition={250}
				cachePolicy="memory-disk"
			/>

			{/* Top Gradient for Header Readability */}
			<LinearGradient
				colors={[
					"rgba(13, 14, 18, 0.85)",
					"rgba(13, 14, 18, 0.4)",
					"transparent",
				]}
				locations={[0, 0.6, 1]}
				style={styles.topGradient}
			/>

			{/* Bottom Gradient for Seamless Transition into Page Background */}
			<LinearGradient
				colors={[
					"transparent",
					"rgba(13, 14, 18, 0.2)",
					"rgba(13, 14, 18, 0.65)",
					"rgba(13, 14, 18, 0.92)",
					"#0d0e12",
					"#0d0e12",
				]}
				locations={[0, 0.25, 0.55, 0.8, 0.94, 1]}
				style={styles.bottomGradient}
			/>

			{/* Top Header Overlay */}
			<View
				style={[
					styles.topHeader,
					{ top: insets.top + (isTV ? 6 : 8) },
				]}>
				{/* Search Icon */}
				<TVPressable
					style={styles.headerIconButton}
					focusedStyle={styles.headerIconButtonFocused}
					onPress={onSearchPress}>
					<Ionicons
						name="search"
						size={isTV ? 20 : 24}
						color="#ffffff"
					/>
				</TVPressable>

				{/* Platform Selector Pill */}
				{platform && (
					<TVPressable
						style={styles.platformPill}
						focusedStyle={styles.platformPillFocused}
						onPress={onPlatformPress}>
						{platform.favicon ? (
							<Image
								source={{ uri: platform.favicon }}
								style={styles.platformFavicon}
								contentFit="contain"
							/>
						) : (
							<Ionicons
								name="film-outline"
								size={isTV ? 12 : 14}
								color="#ffffff"
							/>
						)}
						<Text style={styles.platformText} numberOfLines={1}>
							{platform.name}
						</Text>
						<Ionicons
							name="chevron-down"
							size={isTV ? 12 : 14}
							color="#9ca3af"
						/>
					</TVPressable>
				)}

				{/* User Profile Avatar with Blue Ring */}
				<TVPressable
					style={styles.profileButton}
					focusedStyle={styles.profileButtonFocused}
					onPress={onProfilePress}>
					{userAvatarUrl ? (
						<Image
							source={{ uri: userAvatarUrl }}
							style={styles.avatarImage}
							contentFit="cover"
						/>
					) : (
						<View style={styles.avatarPlaceholder}>
							<Ionicons
								name="person"
								size={isTV ? 16 : 20}
								color="#38bdf8"
							/>
						</View>
					)}
				</TVPressable>
			</View>

			{/* Bottom Hero Content: Title, Genres, Action Buttons */}
			<View style={styles.bottomContent}>
				{/* Movie Title */}
				<Text style={styles.movieTitle} numberOfLines={isTV ? 1 : 2}>
					{title}
				</Text>

				{/* Category / Genre Badges */}
				<Text
					style={[
						styles.genresText,
						!movieRawLang && styles.genresTextWithoutBadge,
					]}
					numberOfLines={1}>
					{genres}
				</Text>

				{/* Language & Dubbing Badges */}
				{movieRawLang ? (
					<View style={styles.heroLanguageBadge}>
						<LanguageBadge
							language={movieRawLang}
							size={isTV ? "small" : "normal"}
						/>
					</View>
				) : null}

				{/* Action Buttons Row */}
				<View style={styles.buttonsRow}>
					{/* Left: Listeye Ekle / Çıkar */}
					<TVPressable
						style={styles.actionColumn}
						focusedStyle={styles.actionColumnFocused}
						onPress={onToggleList}>
						<Ionicons
							name={isInList ? "checkmark" : "add"}
							size={isTV ? 20 : 24}
							color="#ffffff"
						/>
						<Text style={styles.actionLabel}>
							{isInList ? "Listede" : "Listem"}
						</Text>
					</TVPressable>

					{/* Center: Play Pill Button - TV'de Ana İlk Odak */}
					<TVPressable
						autoFocus={true}
						style={styles.playButton}
						focusedStyle={styles.playButtonFocused}
						onPress={onPlayPress}>
						<Ionicons
							name="play"
							size={isTV ? 16 : 19}
							color="#000000"
							style={{ marginLeft: 2 }}
						/>
						<Text style={styles.playButtonText}>Oynat</Text>
					</TVPressable>

					{/* Right: Bilgi */}
					<TVPressable
						style={styles.actionColumn}
						focusedStyle={styles.actionColumnFocused}
						onPress={onInfoPress}>
						<Ionicons
							name="information-circle-outline"
							size={isTV ? 20 : 24}
							color="#ffffff"
						/>
						<Text style={styles.actionLabel}>Bilgi</Text>
					</TVPressable>
				</View>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	bannerContainer: {
		width: "100%",
		height: BANNER_HEIGHT,
		position: "relative",
		backgroundColor: "#0d0e12",
		overflow: "hidden",
	},
	bannerImage: {
		top: 50,
		width: "100%",
		height: "100%",
		overflow: "hidden",
	},
	topGradient: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		height: isTV ? 80 : 120,
	},
	bottomGradient: {
		position: "absolute",
		bottom: 0,
		left: 0,
		right: 0,
		height: isTV ? 220 : 350,
	},
	topHeader: {
		position: "absolute",
		left: 0,
		right: 0,
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		paddingHorizontal: isTV ? 16 : 18,
		zIndex: 10,
	},
	bottomContent: {
		position: "absolute",
		bottom: isTV ? 16 : 24,
		left: 0,
		right: 0,
		alignItems: "center",
		paddingHorizontal: 20,
	},
	movieTitle: {
		color: "#ffffff",
		fontSize: isTV ? 22 : 26,
		fontWeight: "800",
		textAlign: "center",
		letterSpacing: -0.3,
		marginBottom: isTV ? 4 : 6,
		textShadowColor: "rgba(0, 0, 0, 0.8)",
		textShadowOffset: { width: 0, height: 2 },
		textShadowRadius: 6,
	},
	genresText: {
		color: "#D1D5DB",
		fontSize: isTV ? 12 : 13,
		fontWeight: "500",
		textAlign: "center",
		textShadowColor: "rgba(0, 0, 0, 0.8)",
		textShadowOffset: { width: 0, height: 1 },
		textShadowRadius: 4,
		marginBottom: isTV ? 4 : 6,
		maxWidth: isTV ? "85%" : width * 0.88,
	},
	genresTextWithoutBadge: {
		marginBottom: isTV ? 10 : 18,
	},
	heroLanguageBadge: {
		marginBottom: isTV ? 10 : 16,
		alignSelf: "center",
	},
	buttonsRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: isTV ? 30 : 40,
	},
	headerIconButton: {
		width: isTV ? 36 : 40,
		height: isTV ? 36 : 40,
		borderRadius: isTV ? 18 : 20,
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
		paddingHorizontal: isTV ? 10 : 12,
		paddingVertical: isTV ? 4 : 6,
		borderRadius: 20,
		gap: isTV ? 4 : 6,
		maxWidth: width * 0.5,
	},
	platformPillFocused: {
		backgroundColor: "rgba(255, 59, 48, 0.4)",
		borderColor: "#FF3B30",
		borderWidth: 1.5,
		transform: [{ scale: 1.08 }],
	},
	platformFavicon: {
		width: isTV ? 14 : 16,
		height: isTV ? 14 : 16,
		borderRadius: 4,
	},
	platformText: {
		color: "#ffffff",
		fontSize: isTV ? 12 : 13,
		fontWeight: "600",
		letterSpacing: 0.2,
	},
	profileButton: {
		width: isTV ? 36 : 40,
		height: isTV ? 36 : 40,
		borderRadius: isTV ? 18 : 20,
		borderWidth: 2,
		borderColor: "#2563EB",
		overflow: "hidden",
		justifyContent: "center",
		alignItems: "center",
		backgroundColor: "rgba(0, 0, 0, 0.35)",
	},
	profileButtonFocused: {
		borderColor: "#FF3B30",
		borderWidth: 3,
		transform: [{ scale: 1.15 }],
	},
	avatarImage: {
		width: "100%",
		height: "100%",
		borderRadius: isTV ? 16 : 18,
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
		width: isTV ? 54 : 60,
		gap: isTV ? 2 : 3,
		paddingVertical: isTV ? 4 : 6,
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
		fontSize: isTV ? 11 : 12,
		fontWeight: "500",
	},
	playButton: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "#FFFFFF",
		paddingHorizontal: isTV ? 22 : 28,
		paddingVertical: isTV ? 8 : 10,
		borderRadius: 24,
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
		fontSize: isTV ? 14 : 15,
		fontWeight: "700",
	},
});
