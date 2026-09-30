import { useThemeContext } from "@context/ThemeContext";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import * as WebBrowser from "expo-web-browser";
import { useRouter } from "expo-router";
import {
	Alert,
	Linking,
	Share,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from "react-native";

export default function ActionButtons({
	content,
	inWatchlist = false,
	isFav = false,
	onToggleWatchlist,
	onToggleFavorite,
	onOpenTrailer,
}) {
	const { colors, theme } = useThemeContext();
	const router = useRouter();

	const handleWatch = () => {
		// Determine target watch URL
		let playUrl = content?.url;
		let playTitle = content?.title;
		let playSubtitle = content?.tagline || "";

		// If it's a series and has seasons, get the first episode
		if (content?.content_type === "series" || content?.seasons) {
			const seasons = content.seasons;
			if (seasons) {
				const firstSeasonKey = Object.keys(seasons)[0];
				const firstEpisode = seasons[firstSeasonKey]?.[0];
				if (firstEpisode?.url) {
					playUrl = firstEpisode.url;
					playSubtitle = `${firstSeasonKey}. Sezon 1. Bölüm${firstEpisode.title ? ` - ${firstEpisode.title}` : ""}`;
				}
			}
		}

		if (!playUrl) {
			Alert.alert("Bilgi", "Bu içerik için oynatılabilir bağlantı bulunamadı.");
			return;
		}

		router.push({
			pathname: "/player",
			params: {
				url: playUrl,
				title: playTitle,
				subtitle: playSubtitle,
				poster: content?.poster_url || content?.backdrop_url,
				id: content?.id,
			},
		});
	};

	const handleAddToList = () => {
		if (onToggleWatchlist) {
			onToggleWatchlist();
		} else {
			Alert.alert("Listem", "Bu özellik yakında eklenecek!");
		}
	};

	const handleTrailer = async () => {
		if (onOpenTrailer) {
			onOpenTrailer();
			return;
		}
		const trailerUrl = content?.trailer_url;
		if (!trailerUrl) {
			Alert.alert("Bilgi", "Bu içerik için fragman bağlantısı bulunamadı.");
			return;
		}
		try {
			await WebBrowser.openBrowserAsync(trailerUrl);
		} catch (error) {
			console.error("Fragman açma hatası:", error);
			Linking.openURL(trailerUrl);
		}
	};

	const handleFavorite = () => {
		if (onToggleFavorite) {
			onToggleFavorite();
		} else {
			Alert.alert("Favoriler", "Bu özellik yakında eklenecek!");
		}
	};

	return (
		<View style={styles.container}>
			{/* Primary Button - Watch */}
			<TouchableOpacity
				style={[
					styles.primaryButton,
					{ backgroundColor: colors.primary },
				]}
				onPress={handleWatch}
				activeOpacity={0.8}>
				<Ionicons name="play" size={20} color="#ffffff" />
				<Text style={styles.primaryButtonText}>Şimdi İzle</Text>
			</TouchableOpacity>

			{/* Secondary Buttons */}
			<View style={styles.secondaryButtons}>
				<TouchableOpacity
					style={[
						styles.secondaryButton,
						inWatchlist
							? {
									backgroundColor: colors.primary,
									borderColor: colors.primary,
							  }
							: {
									backgroundColor:
										theme === "dark"
											? "#1A1A1A"
											: colors.cardBg,
									borderColor:
										theme === "dark"
											? "#2E2E2E"
											: colors.border,
							  },
					]}
					onPress={handleAddToList}
					activeOpacity={0.8}>
					<Ionicons
						name={inWatchlist ? "bookmark" : "bookmark-outline"}
						size={18}
						color={inWatchlist ? "#ffffff" : colors.primary}
					/>
					<Text
						style={[
							styles.secondaryButtonText,
							{
								color: inWatchlist ? "#ffffff" : colors.text,
							},
						]}>
						{inWatchlist ? "Listemde" : "Listem"}
					</Text>
				</TouchableOpacity>

				{/* Fragman Butonu (Paylaş butonunun yerine konuldu) */}
				{Boolean(content?.trailer_url) && (
					<TouchableOpacity
						style={[
							styles.secondaryButton,
							{
								backgroundColor:
									theme === "dark"
										? "#1A1A1A"
										: colors.cardBg,
								borderColor:
									theme === "dark"
										? "#2E2E2E"
										: colors.border,
							},
						]}
						onPress={handleTrailer}
						activeOpacity={0.8}>
						<Ionicons
							name="play-circle-outline"
							size={19}
							color={colors.primary}
						/>
						<Text
							style={[
								styles.secondaryButtonText,
								{ color: colors.text },
							]}>
							Fragman
						</Text>
					</TouchableOpacity>
				)}

				<TouchableOpacity
					style={[
						styles.iconButton,
						isFav
							? {
									backgroundColor:
										theme === "dark"
											? "#281214"
											: "#fee2e2",
									borderColor: colors.primary,
							  }
							: {
									backgroundColor:
										theme === "dark"
											? "#1A1A1A"
											: colors.cardBg,
									borderColor:
										theme === "dark"
											? "#2E2E2E"
											: colors.border,
							  },
					]}
					onPress={handleFavorite}
					activeOpacity={0.8}>
					<Ionicons
						name={isFav ? "heart" : "heart-outline"}
						size={20}
						color={colors.primary}
					/>
				</TouchableOpacity>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		marginBottom: 24,
	},
	primaryButton: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		paddingVertical: 14,
		borderRadius: 12,
		marginBottom: 12,
	},
	primaryButtonText: {
		color: "#ffffff",
		fontSize: 16,
		fontWeight: "700",
	},
	secondaryButtons: {
		flexDirection: "row",
		gap: 8,
	},
	secondaryButton: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 6,
		paddingVertical: 12,
		borderRadius: 12,
		borderWidth: 1,
	},
	secondaryButtonText: {
		fontSize: 14,
		fontWeight: "600",
	},
	iconButton: {
		width: 48,
		height: 48,
		justifyContent: "center",
		alignItems: "center",
		borderRadius: 12,
		borderWidth: 1,
	},
});
