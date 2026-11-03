import { useFeedback } from "@/components/feedback/AppFeedbackProvider";
import TVPressable from "@/components/common/TVPressable";
import { FontFamily, Palette } from "@/constants/theme";
import { useDownload } from "@/context/DownloadContext";
import { useTvMetrics } from "@/utils/tvMetrics";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { formatTime } from "@utils/formatters";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { Alert, Linking, StyleSheet, Text, View } from "react-native";

import { isSeriesContent } from "@/utils/mediaType";

/**
 * ActionButtons – detay ekranının eylem alanı.
 *
 * İzleme sürerken referans tasarımdaki "devam ediyor" paneli gösterilir:
 * durum satırı → tam genişlikte "Devam Et · S2 B5" hapı → ilerleme çubuğu.
 * İzleme yokken yalnızca hap ("Oynat" / "Tekrar"). Altında ikon kutusu
 * satırı: Listem · Favori · İndir (film) · Fragman.
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
	const { toast } = useFeedback();
	const router = useRouter();
	const { requestDownload, isDownloaded } = useDownload();

	// TV: punto, yükseklik ve odak ölçeği büyür (bkz. utils/tvMetrics.js).
	const { sp, isTV, isLandscape } = useTvMetrics();

	/*
	 * TV ve yatay tablet: eylemler TEK satır (referans: 10-feet düzeni —
	 * birincil hap + ikincil haplar yan yana). Telefon dikeyde ise hap
	 * üstte, ikon kutuları altında kalır.
	 */
	const compactRow = isTV || isLandscape;

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
				const epTitle =
					watchProgress.episodeTitle || `${episode}. Bölüm`;

				// Sonraki bölümü bul (varsa)
				let nextEp = null;
				if (content?.seasons && content.seasons[String(season)]) {
					const sEpisodes = content.seasons[String(season)];
					const currentIdx = sEpisodes.findIndex(
						(e) =>
							(e.episode || e.episode_number) === episode ||
							e.url === continueUrl,
					);
					if (currentIdx !== -1 && sEpisodes[currentIdx + 1]) {
						const next = sEpisodes[currentIdx + 1];
						nextEp = {
							id: next.id || next.url,
							url: next.url,
							title: next.title,
							season,
							episode:
								next.episode ||
								next.episode_number ||
								episode + 1,
							poster: next.poster || content?.poster_url,
						};
					}
				}

				if (!continueUrl) {
					toast.info("Oynatılacak bölüm bağlantısı bulunamadı.");
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
						nextEpisode: nextEp
							? JSON.stringify(nextEp)
							: undefined,
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
			const seasonKeys = Object.keys(seasons).sort(
				(a, b) => Number(a) - Number(b),
			);
			const firstSeasonKey = seasonKeys[0] || "1";
			const firstEpList = seasons[firstSeasonKey];
			if (Array.isArray(firstEpList) && firstEpList.length > 0) {
				const firstEp = firstEpList[0];
				if (firstEp?.url) {
					playUrl = firstEp.url;
					initialSeason = Number(firstSeasonKey);
					initialEpisode = Number(
						firstEp.episode || firstEp.episode_number || 1,
					);
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
			toast.info("Bu içerik için oynatılabilir bağlantı bulunamadı.");
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
				seriesId: isSeries ? content?.id || content?.url : undefined,
				seriesTitle: isSeries ? content?.title : undefined,
				season: isSeries ? initialSeason : undefined,
				episode: isSeries ? initialEpisode : undefined,
				totalEpisodes: isSeries
					? totalEpisodesCount || undefined
					: undefined,
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
			toast.info("Bu içerik için fragman bağlantısı bulunamadı.");
			return;
		}
		try {
			await WebBrowser.openBrowserAsync(trailerUrl);
		} catch (_error) {
			Linking.openURL(trailerUrl);
		}
	};

	/**
	 * İndirme hedef bölümünü seçer (dizi): izleme sürüyorsa o bölüm,
	 * değilse ilk sezonun ilk URL'li bölümü. URL yoksa null.
	 */
	const resolveDownloadEpisode = () => {
		if (isInProgress && watchProgress?.url) {
			return {
				season: watchProgress.season || 1,
				episode: watchProgress.episode || 1,
				episodeTitle: watchProgress.episodeTitle || null,
				url: watchProgress.url,
			};
		}
		if (!content?.seasons) return null;
		const seasonKeys = Object.keys(content.seasons).sort(
			(a, b) => Number(a) - Number(b),
		);
		for (const sKey of seasonKeys) {
			const epList = content.seasons[sKey];
			if (Array.isArray(epList) && epList.length > 0) {
				const first = epList.find((e) => e?.url) || epList[0];
				if (first?.url) {
					return {
						season: Number(sKey),
						episode: Number(
							first.episode || first.episode_number || 1,
						),
						episodeTitle: first.title || null,
						url: first.url,
					};
				}
			}
		}
		return null;
	};

	/**
	 * İndirme tetikleyicisi: akışın tamamı DownloadContext'te.
	 * (Hızlı yol / modal kararı, ses-altyazı seçenekleri ve kuyruk orada.)
	 */
	const handleDownload = () => {
		const targetEpisode = isSeries ? resolveDownloadEpisode() : null;
		if (isSeries && !targetEpisode?.url) {
			toast.info("İndirme için oynatılabilir bölüm bağlantısı bulunamadı.");
			return;
		}
		if (!isSeries && !content?.url) {
			toast.info("İndirme için video bağlantısı bulunamadı.");
			return;
		}
		requestDownload({ content, episode: targetEpisode });
	};

	/** Bu içerik/bölüm indirildi mi? */
	const episodeDownloaded = isDownloaded({
		contentId: content?.id || content?.url,
		seriesId: isSeries ? content?.id || content?.url : null,
		season: isSeries ? watchProgress?.season : null,
		episode: isSeries ? watchProgress?.episode : null,
	});

	// Kitaplık durumu → ikon ve etiket
	const effectiveWatchlistStatus =
		watchlistStatus || (inWatchlist ? "planned" : null);
	let watchlistIcon = "bookmark-outline";
	let watchlistLabel = "Listem";

	if (effectiveWatchlistStatus === "watching") {
		watchlistIcon = "play-circle";
		watchlistLabel = "İzleniyor";
	} else if (effectiveWatchlistStatus === "completed") {
		watchlistIcon = "checkmark-circle";
		watchlistLabel = "Tamamlandı";
	} else if (effectiveWatchlistStatus === "planned") {
		watchlistIcon = "bookmark";
		watchlistLabel = "Planlandı";
	}

	const actions = [
		{
			key: "watchlist",
			icon: watchlistIcon,
			label: watchlistLabel,
			onPress: onToggleWatchlist,
			active: Boolean(effectiveWatchlistStatus),
		},
		{
			key: "favorite",
			icon: isFav ? "heart" : "heart-outline",
			label: isFav ? "Favoride" : "Favori",
			onPress: onToggleFavorite,
			active: isFav,
		},
		{
			key: "download",
			// Dizi bölümleri bölüm listesindeki indirmeye girer.
			icon: episodeDownloaded
				? "checkmark-done-outline"
				: "download-outline",
			label: episodeDownloaded ? "İndirildi" : "İndir",
			onPress: handleDownload,
			active: episodeDownloaded,
			hidden: isSeries,
		},
		{
			key: "trailer",
			icon: "play-circle-outline",
			label: "Fragman",
			onPress: handleTrailer,
			hidden: !content?.trailer_url,
		},
	].filter((a) => !a.hidden);

	/*
	 * Sezon/bölüm etiketi YALNIZCA dizide anlamlı. Filmde de
	 * `watchProgress.season` dolu gelebildiği için "Devam Et · S1 B1"
	 * yazıyordu (tasarımda filmde yalnızca "Devam Et").
	 */
	const epLabel =
		isInProgress && isSeries
			? `S${watchProgress?.season || 1} B${watchProgress?.episode || 1}`
			: null;

	const duration = watchProgress?.duration || 0;
	const currentTime = watchProgress?.currentTime || 0;
	const progressPercent =
		duration > 0
			? Math.min(
					100,
					Math.max(0, Math.round((currentTime / duration) * 100)),
				)
			: 0;
	const kalanDk =
		duration > 0
			? Math.max(0, Math.round((duration - currentTime) / 60))
			: null;

	const playLabel = isInProgress
		? `Devam Et${epLabel ? ` · ${epLabel}` : ""}`
		: isCompleted
			? "Tekrar"
			: "Oynat";

	const playPill = (
		<TVPressable
			autoFocus={!isInProgress}
			style={[
				styles.playPill,
				{ height: sp(48), borderRadius: sp(24), gap: sp(8) },
			]}
			focusedStyle={styles.focusRing}
			onPress={handleWatch}
			activeOpacity={0.9}>
			<Ionicons
				name={isCompleted && !isInProgress ? "refresh" : "play"}
				size={sp(20)}
				color={Palette.onPrimaryContainer}
			/>
			<Text
				style={[styles.playText, { fontSize: sp(15) }]}
				numberOfLines={1}>
				{playLabel}
			</Text>
		</TVPressable>
	);

	/*
	 * TV / yatay tablet (10-feet) referansı: eylemler ikon kutusu değil,
	 * YUVARLAK HAP butonlar — birincil dolgulu, kalanlar yüzey rengi —
	 * ve HEPSİ tek satırda yan yana.
	 */
	if (compactRow) {
		return (
			<View style={[styles.pillRow, { gap: sp(8) }]}>
				<TVPressable
					autoFocus={!isInProgress}
					style={[
						styles.playPill,
						{
							height: sp(48),
							borderRadius: sp(24),
							gap: sp(8),
							paddingHorizontal: sp(24),
						},
					]}
					focusedStyle={styles.focusRing}
					onPress={handleWatch}
					activeOpacity={0.9}>
					<Ionicons
						name={isCompleted && !isInProgress ? "refresh" : "play"}
						size={sp(20)}
						color={Palette.onPrimaryContainer}
					/>
					<Text
						style={[styles.playText, { fontSize: sp(15) }]}
						numberOfLines={1}>
						{playLabel}
					</Text>
				</TVPressable>

				{actions.map((action) => (
					<TVPressable
						key={action.key}
						style={[
							styles.pill,
							{
								height: sp(48),
								borderRadius: sp(24),
								gap: sp(6),
								paddingHorizontal: sp(14),
							},
						]}
						focusedStyle={styles.focusRing}
						onPress={action.onPress}
						activeOpacity={0.85}>
						<Ionicons
							name={action.icon}
							size={sp(18)}
							color={
								action.active
									? Palette.primary
									: Palette.onSurface
							}
						/>
						<Text
							style={[
								styles.pillText,
								{
									fontSize: sp(14),
									color: action.active
										? Palette.primary
										: Palette.onSurface,
								},
							]}
							numberOfLines={1}>
							{action.label}
						</Text>
					</TVPressable>
				))}
			</View>
		);
	}

	return (
		<View style={[styles.container, { marginBottom: sp(20), gap: sp(14) }]}>
			{isInProgress ? (
				<View
					style={[
						styles.panel,
						{ padding: sp(16), borderRadius: sp(16), gap: sp(12) },
					]}>
					<View style={styles.statusRow}>
						<View style={styles.statusLeft}>
							<View style={styles.statusDot} />
							<Text
								style={[
									styles.statusLabel,
									{ fontSize: sp(11) },
								]}>
								İZLEMEYE DEVAM EDİLİYOR
							</Text>
						</View>
						<Text style={[styles.statusMeta, { fontSize: sp(12) }]}>
							{[
								epLabel,
								kalanDk ? `${kalanDk} dk kaldı` : null,
							]
								.filter(Boolean)
								.join(" · ")}
						</Text>
					</View>

					{playPill}

					<View style={{ gap: sp(6) }}>
						<View style={[styles.track, { height: sp(6) }]}>
							<View
								style={[
									styles.trackFill,
									{ width: `${progressPercent}%` },
								]}
							/>
						</View>
						<View style={styles.timesRow}>
							<Text
								style={[styles.timeText, { fontSize: sp(12) }]}>
								{formatTime(currentTime)} izlendi
							</Text>
							<Text
								style={[styles.timeText, { fontSize: sp(12) }]}>
								Toplam {formatTime(duration)}
							</Text>
						</View>
					</View>
				</View>
			) : (
				playPill
			)}

			<View style={[styles.actionsRow, { gap: sp(10) }]}>
				{actions.map((action) => (
					<TVPressable
						key={action.key}
						style={[
							styles.tile,
							{
								gap: sp(6),
								paddingVertical: sp(10),
								borderRadius: sp(12),
								backgroundColor: action.active
									? Palette.surfaceHigh
									: Palette.surface,
								minWidth: isTV ? sp(90) : 0,
							},
						]}
						focusedStyle={styles.focusRing}
						onPress={action.onPress}
						activeOpacity={0.85}>
						<Ionicons
							name={action.icon}
							size={sp(21)}
							color={
								action.active
									? Palette.primary
									: Palette.onSurfaceVariant
							}
						/>
						<Text
							style={[
								styles.tileLabel,
								{
									fontSize: sp(11.5),
									color: action.active
										? Palette.primary
										: Palette.onSurfaceVariant,
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
	container: {},

	/* TV: tek satır hap butonlar. */
	pillRow: {
		flexDirection: "row",
		alignItems: "center",
		flexWrap: "wrap",
	},
	pill: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: Palette.surfaceHigh,
	},
	pillText: {
		fontFamily: FontFamily.semiBold,
	},

	panel: {
		backgroundColor: Palette.surfaceLow,
	},
	statusRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 8,
	},
	statusLeft: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
	},
	statusDot: {
		width: 8,
		height: 8,
		borderRadius: 4,
		backgroundColor: Palette.secondary,
	},
	statusLabel: {
		color: Palette.secondary,
		fontFamily: FontFamily.bold,
		letterSpacing: 0.6,
	},
	statusMeta: {
		color: Palette.onSurfaceVariant,
		fontFamily: FontFamily.regular,
	},

	playPill: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: Palette.primaryContainer,
	},
	playText: {
		color: Palette.onPrimaryContainer,
		fontFamily: FontFamily.semiBold,
	},

	track: {
		width: "100%",
		borderRadius: 999,
		overflow: "hidden",
		backgroundColor: Palette.surfaceHighest,
	},
	trackFill: {
		height: "100%",
		borderRadius: 999,
		backgroundColor: Palette.secondary,
	},
	timesRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
	timeText: {
		color: Palette.onSurfaceVariant,
		fontFamily: FontFamily.regular,
	},

	actionsRow: {
		flexDirection: "row",
		alignItems: "stretch",
	},
	tile: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
	},
	tileLabel: {
		fontFamily: FontFamily.medium,
		textAlign: "center",
	},

	focusRing: {
		borderWidth: 2,
		borderColor: Palette.primary,
	},
});
