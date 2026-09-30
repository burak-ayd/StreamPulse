import { Ionicons } from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import {
	Dimensions,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const { width } = Dimensions.get("window");
const BANNER_HEIGHT = 520;

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
	const genres =
		movie?.category ||
		movie?.genres ||
		(movie?.language ? `${movie.language} • ${movie.release_date || ""}` : "Aksiyon • Macera • Bilim Kurgu");
	const posterUri =
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
				colors={["rgba(13, 14, 18, 0.85)", "rgba(13, 14, 18, 0.4)", "transparent"]}
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
			<View style={[styles.topHeader, { top: insets.top + 8 }]}>
				{/* Search Icon */}
				<TouchableOpacity
					style={styles.headerIconButton}
					onPress={onSearchPress}
					activeOpacity={0.7}>
					<Ionicons name="search" size={24} color="#ffffff" />
				</TouchableOpacity>

				{/* Platform Selector Pill */}
				{platform && (
					<TouchableOpacity
						style={styles.platformPill}
						onPress={onPlatformPress}
						activeOpacity={0.8}>
						{platform.favicon ? (
							<Image
								source={{ uri: platform.favicon }}
								style={styles.platformFavicon}
								contentFit="contain"
							/>
						) : (
							<Ionicons
								name="film-outline"
								size={14}
								color="#ffffff"
							/>
						)}
						<Text style={styles.platformText} numberOfLines={1}>
							{platform.name}
						</Text>
						<Ionicons
							name="chevron-down"
							size={14}
							color="#9ca3af"
						/>
					</TouchableOpacity>
				)}

				{/* User Profile Avatar with Blue Ring */}
				<TouchableOpacity
					style={styles.profileButton}
					onPress={onProfilePress}
					activeOpacity={0.7}>
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
								size={16}
								color="#38bdf8"
							/>
						</View>
					)}
				</TouchableOpacity>
			</View>

			{/* Bottom Details Section */}
			<TouchableOpacity
				activeOpacity={0.95}
				onLongPress={onLongPress}
				style={styles.bottomContent}>
				{/* Movie Title */}
				<Text style={styles.movieTitle} numberOfLines={2}>
					{title}
				</Text>

				{/* Genres / Metadata */}
				<Text style={styles.genresText} numberOfLines={1}>
					{genres}
				</Text>

				{/* 3 Buttons Row */}
				<View style={styles.buttonsRow}>
					{/* Left: Listem */}
					<TouchableOpacity
						style={styles.actionColumn}
						onPress={onToggleList}
						activeOpacity={0.7}>
						<Ionicons
							name={isInList ? "checkmark" : "add"}
							size={24}
							color="#ffffff"
						/>
						<Text style={styles.actionLabel}>
							{isInList ? "Listede" : "Listem"}
						</Text>
					</TouchableOpacity>

					{/* Center: Play Pill Button */}
					<TouchableOpacity
						style={styles.playButton}
						onPress={onPlayPress}
						activeOpacity={0.85}>
						<Ionicons
							name="play"
							size={19}
							color="#000000"
							style={{ marginLeft: 2 }}
						/>
						<Text style={styles.playButtonText}>Oynat</Text>
					</TouchableOpacity>

					{/* Right: Bilgi */}
					<TouchableOpacity
						style={styles.actionColumn}
						onPress={onInfoPress}
						activeOpacity={0.7}>
						<Ionicons
							name="information-circle-outline"
							size={24}
							color="#ffffff"
						/>
						<Text style={styles.actionLabel}>Bilgi</Text>
					</TouchableOpacity>
				</View>
			</TouchableOpacity>
		</View>
	);
}

const styles = StyleSheet.create({
	bannerContainer: {
		width,
		height: BANNER_HEIGHT,
		position: "relative",
		backgroundColor: "#0d0e12",
		overflow: "hidden",
	},
	bannerImage: {
		width: "100%",
		height: "100%",
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
		position: "absolute",
		left: 0,
		right: 0,
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		paddingHorizontal: 18,
		zIndex: 10,
	},
	headerIconButton: {
		width: 40,
		height: 40,
		borderRadius: 20,
		backgroundColor: "rgba(0, 0, 0, 0.35)",
		justifyContent: "center",
		alignItems: "center",
	},
	platformPill: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: "rgba(22, 27, 34, 0.8)",
		borderColor: "rgba(255, 255, 255, 0.15)",
		borderWidth: 1,
		paddingHorizontal: 12,
		paddingVertical: 6,
		borderRadius: 20,
		gap: 6,
		maxWidth: width * 0.5,
	},
	platformFavicon: {
		width: 16,
		height: 16,
		borderRadius: 4,
	},
	platformText: {
		color: "#ffffff",
		fontSize: 13,
		fontWeight: "600",
		letterSpacing: 0.2,
	},
	profileButton: {
		width: 40,
		height: 40,
		borderRadius: 20,
		borderWidth: 2,
		borderColor: "#2563EB",
		overflow: "hidden",
		justifyContent: "center",
		alignItems: "center",
		backgroundColor: "rgba(0, 0, 0, 0.35)",
	},
	avatarImage: {
		width: "100%",
		height: "100%",
		borderRadius: 18,
		overflow: "hidden",
	},
	avatarPlaceholder: {
		width: "100%",
		height: "100%",
		justifyContent: "center",
		alignItems: "center",
		backgroundColor: "rgba(37, 99, 235, 0.2)",
	},
	bottomContent: {
		position: "absolute",
		bottom: 24,
		left: 0,
		right: 0,
		alignItems: "center",
		paddingHorizontal: 20,
	},
	movieTitle: {
		color: "#ffffff",
		fontSize: 26,
		fontWeight: "800",
		textAlign: "center",
		letterSpacing: -0.3,
		marginBottom: 6,
		textShadowColor: "rgba(0, 0, 0, 0.8)",
		textShadowOffset: { width: 0, height: 2 },
		textShadowRadius: 6,
	},
	genresText: {
		color: "#D1D5DB",
		fontSize: 13,
		fontWeight: "500",
		textAlign: "center",
		marginBottom: 18,
		textShadowColor: "rgba(0, 0, 0, 0.8)",
		textShadowOffset: { width: 0, height: 1 },
		textShadowRadius: 4,
	},
	buttonsRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 40,
	},
	actionColumn: {
		alignItems: "center",
		justifyContent: "center",
		width: 60,
		gap: 3,
	},
	actionLabel: {
		color: "#E5E7EB",
		fontSize: 12,
		fontWeight: "500",
	},
	playButton: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "#FFFFFF",
		paddingHorizontal: 28,
		paddingVertical: 10,
		borderRadius: 24,
		gap: 6,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 3 },
		shadowOpacity: 0.3,
		shadowRadius: 5,
		elevation: 4,
	},
	playButtonText: {
		color: "#000000",
		fontSize: 15,
		fontWeight: "700",
	},
});
