import TVPressable from "@/components/common/TVPressable";
import { useThemeContext } from "@/context/ThemeContext";
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

import { formatTime } from "@/utils/formatters";
import ContinueWatchingCard from "./ContinueWatchingCard";

/**
 * ActionButtons – Mockup tasarımındaki birleşik eylem bölümü.
 *
 * İçerir:
 * 1. "Hemen Şimdi İzle" / "Kaldığın Yerden Devam Et" / "Tekrar İzle" — Tam genişlik kırmızı CTA butonu
 * 2. 4'lü grid: Listem, Fragman, Favori, İndir
 */
export default function ActionButtons({
	content,
	inWatchlist = false,
	isFav = false,
	watchlistStatus = null,
	watchProgress = null,
	totalEpisodesCount = 0,
	onToggleWatchlist,
	onToggleFavorite,
	onOpenTrailer,
}) {
	const { colors, theme } = useThemeContext();
	const router = useRouter();

	const isSeries = Boolean(
		content?.content_type === "series" ||
		content?.is_series ||
		content?.seasons ||
		content?.episodes,
	);

	const isCompleted = watchProgress?.status === "completed";
	const isInProgress = watchProgress?.status === "in_progress";

	const handleWatch = () => {
		// 1. Durum: Kaldığın Yerden Devam Et (in_progress)
		if (isInProgress) {
			if (isSeries) {
				const continueUrl = watchProgress.url;
				const season = watchProgress.season || 1;
				const episode = watchProgress.episode || 1;
				const epTitle = watchProgress.episodeTitle || `${episode}. Bölüm`;

				// Sonraki bölümü bul (varsa)
				let nextEp = null;
				if (content?.seasons && content.seasons[String(season)]) {
					const sEpisodes = content.seasons[String(season)];
					const currentIdx = sEpisodes.findIndex(
						(e) => (e.episode || e.episode_number) === episode || e.url === continueUrl,
					);
					if (currentIdx !== -1 && sEpisodes[currentIdx + 1]) {
						const next = sEpisodes[currentIdx + 1];
						nextEp = {
							id: next.id || next.url,
							url: next.url,
							title: next.title,
							season,
							episode: next.episode || next.episode_number || episode + 1,
							poster: next.poster || content?.poster_url,
						};
					}
				}

				if (!continueUrl) {
					Alert.alert("Bilgi", "Oynatılacak bölüm bağlantısı bulunamadı.");
					return;
				}

				const epUniqueId =
					continueUrl ||
					`${content?.id || content?.url || "series"}_s${season}_e${episode}`;

				router.push({
					pathname: "/player",
					params: {
						url: continueUrl,
						title: content?.title || "Dizi",
						subtitle: `${season}. Sezon ${episode}. Bölüm${epTitle ? ` - ${epTitle}` : ""}`,
						poster: content?.poster_url || content?.backdrop_url,
						id: epUniqueId,
						type: "episode",
						plugin: content?.plugin || watchProgress?.plugin,
						seriesId: content?.id || content?.url,
						seriesTitle: content?.title,
						season,
						episode,
						episodeTitle: epTitle,
						totalEpisodes: totalEpisodesCount || undefined,
						currentTime: watchProgress.currentTime || 0,
						nextEpisode: nextEp ? JSON.stringify(nextEp) : undefined,
					},
				});
				return;
			} else {
				// Film için kaldığı yerden devam
				router.push({
					pathname: "/player",
					params: {
						url: watchProgress.url || content?.url,
						title: content?.title,
						subtitle: content?.tagline || "",
						poster: content?.poster_url || content?.backdrop_url,
						id: content?.id,
						type: "movie",
						plugin: content?.plugin || watchProgress?.plugin,
						currentTime: watchProgress.currentTime || 0,
					},
				});
				return;
			}
		}

		// 2. Durum: Tekrar İzle (completed) veya Sıfırdan Başla (not_started)
		let playUrl = content?.url;
		let playTitle = content?.title;
		let playSubtitle = content?.tagline || "";
		let initialSeason = 1;
		let initialEpisode = 1;
		let nextEp = null;

		if (isSeries && content?.seasons) {
			const seasons = content.seasons;
			const seasonKeys = Object.keys(seasons).sort((a, b) => Number(a) - Number(b));
			const firstSeasonKey = seasonKeys[0] || "1";
			const firstEpList = seasons[firstSeasonKey];
			if (Array.isArray(firstEpList) && firstEpList.length > 0) {
				const firstEp = firstEpList[0];
				if (firstEp?.url) {
					playUrl = firstEp.url;
					initialSeason = Number(firstSeasonKey);
					initialEpisode = Number(firstEp.episode || firstEp.episode_number || 1);
					playSubtitle = `${firstSeasonKey}. Sezon 1. Bölüm${firstEp.title ? ` - ${firstEp.title}` : ""}`;
					if (firstEpList[1]) {
						const next = firstEpList[1];
						nextEp = {
							id: next.id || next.url,
							url: next.url,
							title: next.title,
							season: initialSeason,
							episode: next.episode || next.episode_number || 2,
							poster: next.poster || content?.poster_url,
						};
					}
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

		const epUniqueId = isSeries
			? playUrl ||
				`${content?.id || content?.url || "series"}_s${initialSeason}_e${initialEpisode}`
			: content?.id;

		router.push({
			pathname: "/player",
			params: {
				url: playUrl,
				title: playTitle,
				subtitle: playSubtitle,
				poster: content?.poster_url || content?.backdrop_url,
				id: epUniqueId,
				type: isSeries ? "episode" : "movie",
				plugin: content?.plugin,
				seriesId: isSeries ? (content?.id || content?.url) : undefined,
				seriesTitle: isSeries ? content?.title : undefined,
				season: isSeries ? initialSeason : undefined,
				episode: isSeries ? initialEpisode : undefined,
				totalEpisodes: isSeries ? (totalEpisodesCount || undefined) : undefined,
				currentTime: 0,
				nextEpisode: nextEp ? JSON.stringify(nextEp) : undefined,
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
		} catch (_error) {
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
		{
			key: "trailer",
			icon: "play-circle",
			label: "Fragman",
			color: "#f43f5e",
			onPress: handleTrailer,
			hidden: !content?.trailer_url,
		},
	].filter((a) => !a.hidden);

	const surfaceBg = theme === "dark" ? "#161B24" : "#ffffff";
	const surfaceBorder = theme === "dark" ? "#232A36" : "#E2E8F0";

	let buttonTitle = "Hemen Şimdi İzle";
	let buttonSubtitle = null;
	let buttonIcon = "play";

	if (isCompleted) {
		buttonTitle = "Tekrar İzle";
		buttonIcon = "refresh";
		buttonSubtitle = isSeries ? "1. Sezon 1. Bölümden Başlat" : "Baştan İzle";
	} else if (isInProgress) {
		buttonTitle = "Kaldığın Yerden Devam Et";
		buttonIcon = "play";
		if (isSeries && watchProgress.season && watchProgress.episode) {
			buttonSubtitle = `${watchProgress.season}. Sezon ${watchProgress.episode}. Bölüm • ${formatTime(watchProgress.currentTime)}`;
		} else if (watchProgress.currentTime > 0) {
			buttonSubtitle = `${formatTime(watchProgress.currentTime)}'den devam et`;
		}
	}

	return (
		<View style={styles.container}>
			{/* Kaldığın Yerden Devam Et Kartı VEYA Ana CTA Butonu */}
			{isInProgress ? (
				<ContinueWatchingCard
					content={content}
					watchProgress={watchProgress}
					isSeries={isSeries}
					onPress={handleWatch}
				/>
			) : (
				<TVPressable
					autoFocus={true}
					style={({ focused }) => [
						styles.primaryButton,
						isCompleted && styles.primaryButtonCompleted,
						focused && styles.primaryButtonFocused,
					]}
					onPress={handleWatch}
					activeOpacity={0.85}>
					<Ionicons name={buttonIcon} size={22} color="#ffffff" />
					<View style={styles.primaryButtonTextWrapper}>
						<Text style={styles.primaryButtonText}>{buttonTitle}</Text>
						{buttonSubtitle ? (
							<Text style={styles.primaryButtonSubtext}>
								{buttonSubtitle}
							</Text>
						) : null}
					</View>
				</TVPressable>
			)}

			{/* 4-Column Action Grid */}
			<View style={styles.gridRow}>
				{gridActions.map((action) => (
					<TVPressable
						key={action.key}
						style={({ focused }) => [
							styles.gridItem,
							{
								backgroundColor: surfaceBg,
								borderColor: action.active
									? "rgba(229,9,20,0.3)"
									: surfaceBorder,
							},
							focused && styles.gridItemFocused,
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
					</TVPressable>
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
		paddingVertical: 13,
		borderRadius: 16,
		shadowColor: "#E50914",
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.45,
		shadowRadius: 12,
		elevation: 8,
	},
	primaryButtonCompleted: {
		backgroundColor: "#1e293b",
		shadowColor: "#0f172a",
		borderWidth: 1,
		borderColor: "rgba(255, 255, 255, 0.15)",
	},
	primaryButtonTextWrapper: {
		alignItems: "center",
		justifyContent: "center",
	},
	primaryButtonText: {
		color: "#ffffff",
		fontSize: 16,
		fontWeight: "800",
		letterSpacing: 0.3,
	},
	primaryButtonSubtext: {
		color: "rgba(255, 255, 255, 0.85)",
		fontSize: 12,
		fontWeight: "600",
		marginTop: 2,
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
	primaryButtonFocused: {
		borderWidth: 2,
		borderColor: "#FFFFFF",
		transform: [{ scale: 1.03 }],
	},
	gridItemFocused: {
		borderWidth: 2,
		borderColor: "#E50914",
		transform: [{ scale: 1.08 }],
	},
});
