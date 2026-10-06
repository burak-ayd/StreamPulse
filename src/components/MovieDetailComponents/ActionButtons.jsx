import TVPressable from "@/components/common/TVPressable";
import { useThemeContext } from "@/context/ThemeContext";
import { useTvMetrics } from "@/utils/tvMetrics";
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
import { isSeriesContent } from "@/utils/mediaType";
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

	// TV: punto, yükseklik ve odak ölçeği büyür (bkz. utils/tvMetrics.js).
	const { sp, isTV, focusScale } = useTvMetrics();

	// Tek kaynak: `utils/mediaType.js` (bkz. o dosyanın başlığı).
	const isSeries = isSeriesContent(content);

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

	/**
	 * Buton metinleri.
	 *
	 * Varsayılan "Oynat": TV'de CTA 300dp genişliğinde yan yana duruyor ve
	 * "Hemen Şimdi İzle" (14 karakter) sığmıyor — kırpılıyordu. Tek
	 * kelime hem sığar hem de ikonu (oynat üçgeni) tek başına anlatır.
	 * Ana sayfadaki hero butonu da zaten "Oynat" diyor; iki ekran artık
	 * aynı kelimeyi kullanıyor.
	 *
	 * Durum metinleri ("Tekrar İzle", "Kaldığın Yerden Devam Et") korunur —
	 * bunlar kullanıcıya ne olacağını anlatır, kısaltılamaz.
	 */
	let buttonTitle = "Oynat";
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

	/**
	 * TV yerleşimi: CTA ve 4'lü eylem grid'i YAN YANA.
	 *
	 * Önceki denemede CTA kendi satırında tam genişlikteydi ve TV'de ekranı
	 * boydan boya kaplayan dev bir kırmızı bant oluyordu. Grid'i yanına
	 * alınca kartlara ~200dp düştü ve "İzleniyor/Favori/İndir/Fragman"
	 * etiketleri kırpıldı — kumandada hedefi belli olmayan düğmeler.
	 *
	 * Çözüm: CTA'ya sabit bir taban verip kalanı grid'e bırakmak.
	 * 1080p'de ölçek 1.2, sütun ≈864dp: CTA `sp(250)` ≈300dp, kalan
	 * ≈550dp. Grid kartları `flexBasis: "22%"` + `flexGrow` ile eşit
	 * paylaşır → kart başına ≈125dp; en uzun etiket "Tamamlandı"
	 * (10 karakter) `sp(12.5)` ≈15dp puntoyla ≈78dp — rahat sığar.
	 *
	 * `flexShrink: 0` CTA'nın grid altına sıkışmasını engeller; grid
	 * `flexWrap` ile yine de taşarsa alt satıra iner, ekran taşmaz.
	 */
	const primaryButtonStyle = [
		styles.primaryButton,
		{
			gap: sp(10),
			paddingVertical: sp(15),
			paddingHorizontal: sp(24),
			borderRadius: sp(14),
		},
		isTV && {
			flexGrow: 0,
			flexShrink: 0,
			width: sp(250),
		},
	];

	return (
		<View style={[styles.container, { marginBottom: sp(18), gap: sp(12) }]}>
			<View style={[styles.actionRow, isTV && styles.actionRowTv]}>
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
							primaryButtonStyle,
							isCompleted && styles.primaryButtonCompleted,
							focused && {
								borderWidth: 2,
								borderColor: "#FFFFFF",
								transform: [{ scale: focusScale }],
							},
						]}
						onPress={handleWatch}
						activeOpacity={0.85}>
						<Ionicons name={buttonIcon} size={sp(22)} color="#ffffff" />
						<View style={styles.primaryButtonTextWrapper}>
							<Text
								style={[
									styles.primaryButtonText,
									{ fontSize: sp(17) },
								]}>
								{buttonTitle}
							</Text>
							{buttonSubtitle ? (
								<Text
									style={[
										styles.primaryButtonSubtext,
										{ fontSize: sp(12) },
									]}>
									{buttonSubtitle}
								</Text>
							) : null}
						</View>
					</TVPressable>
				)}

				{/* 4-Column Action Grid — TV'de CTA'nın yanında, esnek */}
				<View
					style={[
						styles.gridRow,
						{
							gap: sp(10),
							flex: isTV ? 1 : undefined,
							minWidth: 0,
							flexWrap: isTV ? "wrap" : "nowrap",
						},
					]}>
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
									gap: sp(6),
									paddingVertical: sp(13),
									paddingHorizontal: sp(8),
									borderRadius: sp(13),
									// TV: kart tabanı yok, esnek — grid kalan
									// genişliği eşit paylaşır, taşarsa alt satır.
									flexBasis: isTV ? "22%" : undefined,
									flexGrow: isTV ? 1 : undefined,
									minWidth: isTV ? sp(92) : undefined,
								},
								focused && {
									borderWidth: 2,
									borderColor: "#E50914",
									backgroundColor: "rgba(229, 9, 20, 0.18)",
									transform: [{ scale: focusScale }],
								},
							]}
							onPress={action.onPress}
							activeOpacity={0.7}>
							<Ionicons
								name={action.icon}
								size={sp(21)}
								color={action.color}
							/>
							<Text
								style={[
									styles.gridLabel,
									{
										color: action.active
											? colors.primary
											: colors.textSecondary,
										fontSize: sp(12.5),
									},
								]}
								numberOfLines={1}>
								{action.label}
							</Text>
						</TVPressable>
					))}
				</View>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {},
	/** CTA ve eylem grid'i TV'de yan yana durur. */
	actionRow: {},
	actionRowTv: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
	},
	primaryButton: {
		backgroundColor: "#E50914",
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
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
		fontWeight: "800",
		letterSpacing: 0.3,
	},
	primaryButtonSubtext: {
		color: "rgba(255, 255, 255, 0.85)",
		fontWeight: "600",
		marginTop: 2,
	},
	gridRow: {
		flexDirection: "row",
	},
	gridItem: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		borderWidth: 1,
	},
	gridLabel: {
		fontWeight: "500",
	},
});
