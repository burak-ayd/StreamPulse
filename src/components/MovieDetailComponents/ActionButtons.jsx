import { useThemeContext } from "@context/ThemeContext";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import * as WebBrowser from "expo-web-browser";
import { useRouter } from "expo-router";
import {
	Alert,
	Linking,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from "react-native";

/**
 * ActionButtons – Mockup tasarımındaki birleşik eylem bölümü.
 *
 * İçerir:
 * 1. "Hemen Şimdi İzle" — Tam genişlik kırmızı CTA butonu
 * 2. 4'lü grid: Listem, Fragman, Favori, İndir
 */
export default function ActionButtons({
	content,
	inWatchlist = false,
	isFav = false,
	watchlistStatus = null,
	onToggleWatchlist,
	onToggleFavorite,
	onOpenTrailer,
}) {
	const { colors, theme } = useThemeContext();
	const router = useRouter();

	const handleWatch = () => {
		let playUrl = content?.url;
		let playTitle = content?.title;
		let playSubtitle = content?.tagline || "";

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
			Alert.alert(
				"Bilgi",
				"Bu içerik için oynatılabilir bağlantı bulunamadı.",
			);
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

	const handleTrailer = async () => {
		if (onOpenTrailer) {
			onOpenTrailer();
			return;
		}
		const trailerUrl = content?.trailer_url;
		if (!trailerUrl) {
			Alert.alert(
				"Bilgi",
				"Bu içerik için fragman bağlantısı bulunamadı.",
			);
			return;
		}
		try {
			await WebBrowser.openBrowserAsync(trailerUrl);
		} catch (error) {
			Linking.openURL(trailerUrl);
		}
	};

	const handleDownload = () => {
		Alert.alert("İndirme", "İndirme özelliği yakında eklenecek!");
	};

	// Determine watchlist display config based on watchlistStatus or inWatchlist
	const effectiveWatchlistStatus = watchlistStatus || (inWatchlist ? "planned" : null);
	let watchlistIcon = "bookmark-outline";
	let watchlistLabel = "Listem";
	let watchlistColor = colors.textSecondary;

	if (effectiveWatchlistStatus === "watching") {
		watchlistIcon = "play-circle";
		watchlistLabel = "İzleniyor";
		watchlistColor = "#E50914";
	} else if (effectiveWatchlistStatus === "completed") {
		watchlistIcon = "checkmark-circle";
		watchlistLabel = "Tamamlandı";
		watchlistColor = "#10b981";
	} else if (effectiveWatchlistStatus === "planned") {
		watchlistIcon = "bookmark";
		watchlistLabel = "Planlandı";
		watchlistColor = "#38bdf8";
	}

	const isWatchlistActive = Boolean(effectiveWatchlistStatus);

	const gridActions = [
		{
			key: "watchlist",
			icon: watchlistIcon,
			label: watchlistLabel,
			color: watchlistColor,
			onPress: onToggleWatchlist,
			active: isWatchlistActive,
		},
		{
			key: "trailer",
			icon: "play-circle",
			label: "Fragman",
			color: "#f43f5e",
			onPress: handleTrailer,
			hidden: !content?.trailer_url,
		},
		{
			key: "favorite",
			icon: isFav ? "heart" : "heart-outline",
			label: isFav ? "Favorilerde" : "Favori",
			color: isFav ? "#fb7185" : colors.textSecondary,
			onPress: onToggleFavorite,
			active: isFav,
		},
		{
			key: "download",
			icon: "download-outline",
			label: "İndir",
			color: "#38bdf8",
			onPress: handleDownload,
		},
	].filter((a) => !a.hidden);

	const surfaceBg = theme === "dark" ? "#161B24" : "#ffffff";
	const surfaceBorder = theme === "dark" ? "#232A36" : "#E2E8F0";

	return (
		<View style={styles.container}>
			{/* Primary CTA — Hemen Şimdi İzle */}
			<TouchableOpacity
				style={styles.primaryButton}
				onPress={handleWatch}
				activeOpacity={0.85}>
				<Ionicons name="play" size={22} color="#ffffff" />
				<Text style={styles.primaryButtonText}>Hemen Şimdi İzle</Text>
			</TouchableOpacity>

			{/* 4-Column Action Grid */}
			<View style={styles.gridRow}>
				{gridActions.map((action) => (
					<TouchableOpacity
						key={action.key}
						style={[
							styles.gridItem,
							{
								backgroundColor: surfaceBg,
								borderColor: action.active
									? "rgba(229,9,20,0.3)"
									: surfaceBorder,
							},
						]}
						onPress={action.onPress}
						activeOpacity={0.7}>
						<Ionicons
							name={action.icon}
							size={22}
							color={action.color}
						/>
						<Text
							style={[
								styles.gridLabel,
								{
									color: action.active
										? colors.primary
										: colors.textSecondary,
								},
							]}
							numberOfLines={1}>
							{action.label}
						</Text>
					</TouchableOpacity>
				))}
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		marginBottom: 16,
		gap: 12,
	},
	primaryButton: {
		backgroundColor: "#E50914",
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 10,
		paddingVertical: 15,
		borderRadius: 16,
		shadowColor: "#E50914",
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.45,
		shadowRadius: 12,
		elevation: 8,
	},
	primaryButtonText: {
		color: "#ffffff",
		fontSize: 16,
		fontWeight: "800",
		letterSpacing: 0.3,
	},
	gridRow: {
		flexDirection: "row",
		gap: 10,
	},
	gridItem: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		gap: 6,
		paddingVertical: 14,
		paddingHorizontal: 6,
		borderRadius: 14,
		borderWidth: 1,
	},
	gridLabel: {
		fontSize: 11,
		fontWeight: "500",
	},
});
