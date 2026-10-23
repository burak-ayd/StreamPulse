import TVPressable from "@/components/common/TVPressable";
import { useThemeContext } from "@/context/ThemeContext";
import { useDownload } from "@/context/DownloadContext";
import { useTvMetrics } from "@/utils/tvMetrics";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import * as WebBrowser from "expo-web-browser";
import { useRouter } from "expo-router";
import {
	Alert,
	Linking,
	StyleSheet,
	Text,
	View,
} from "react-native";

import { isSeriesContent } from "@/utils/mediaType";
import ContinueWatchingCard from "./ContinueWatchingCard";

/**
 * ActionButtons – Detay ekranının eylem satırı.
 *
 * Tüm butonlar (Oynat dahil) TEK satırda ve BİREBİR AYNI boyutta:
 * Oynat · Listem · Favori · İndir · Fragman
 *
 * "Oynat" yalnızca rengiyle (kırmızı zemin) öne çıkar — boyutuyle değil.
 * Eskiden ayrı bir dev CTA bandı vardı ve yanındaki kartlarla arasındaki
 * boyut farkı ekranı ikiye bölüyordu.
 *
 * İzleme sürerken bu satırın yerine `ContinueWatchingCard` gelir; sezon,
 * bölüm ve kalan süre bilgisi orada durur.
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
	const { requestDownload, isDownloaded } = useDownload();




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
						episode: Number(first.episode || first.episode_number || 1),
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
			Alert.alert(
				"Bilgi",
				"İndirme için oynatılabilir bölüm bağlantısı bulunamadı.",
			);
			return;
		}
		if (!isSeries && !content?.url) {
			Alert.alert("Bilgi", "İndirme için video bağlantısı bulunamadı.");
			return;
		}
		requestDownload({ content, episode: targetEpisode });
	};

	/** Bu içerik/bölüm indirildi mi? (#9: yeşil checkmark) */
	const episodeDownloaded = isDownloaded({
		contentId: content?.id || content?.url,
		seriesId: isSeries ? content?.id || content?.url : null,
		season: isSeries ? watchProgress?.season : null,
		episode: isSeries ? watchProgress?.episode : null,
	});
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
			// #9: indirildiyse yeşil checkmark-done; değilse indirme ikonu.
			icon: episodeDownloaded ? "checkmark-done-outline" : "download-outline",
			label: episodeDownloaded ? "İndirildi" : "İndir",
			color: episodeDownloaded ? colors.success || "#10b981" : "#38bdf8",
			onPress: handleDownload,
			active: episodeDownloaded,
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
	 * Buton metinleri — tile'a sığacak şekilde KISA tutuldu.
	 *
	 * ⚠️ Bu buton artık diğer eylem kartlarıyla AYNI boyutta bir "tile".
	 * Eskiden CTA'nın kendi genişliği/padding'i vardı ve yanındaki kartlardan
	 * belirgin şekilde büyüktü; "Oynat" ekranı boydan boya kaplayan bir
	 * bant, altındaki kartlar ise küçük sütunlar gibi duruyordu. Aynı
	 * satıra alınınca uzun metinler sığmadı, aşağıda kısaltıldı.
	 *
	 * Bilgi kaybolmadı: "Kaldığın Yerden Devam Et" durumunda o metin hiç
	 * üretilmiyor; o satır yerine `ContinueWatchingCard` render ediliyor ve
	 * sezon/bölüm/kalan süre orada duruyor.
	 *
	 * Kısaltma ilkesi: ikon anlamı zaten taşıyor (`play` / `refresh`),
	 * metin yalnızca ikonu tamamlıyor.
	 */
	let buttonTitle = "Oynat";
	let buttonIcon = "play";

	if (isCompleted) {
		buttonTitle = "Tekrar";
		buttonIcon = "refresh";
	}

	/**
	 * Eylem listesi: "Oynat" da diğerleriyle AYNI satırda, AYNI boyutta.
	 *
	 * Nasıl eşitleniyor:
	 * - Tüm kartlar `styles.tile` tabanını paylaşır: aynı padding, aynı
	 *   borderRadius, aynı ikon boyutu, aynı etiket puntosu.
	 * - `flexBasis` + `flexGrow: 1` her kartı aynı tabana oturtur ve kalan
	 *   payı eşit dağıtır; `flexShrink: 1` taşmada küçültür.
	 * - `flexWrap` yedeği duruyor: TV'de ölçek 1.2 ile 5 kart sığmazsa
	 *   alt satıra iner — yine aynı boyutta.
	 */
	const tileActions = [
		// ⚠️ `isInProgress` ikilisi: o durumda `ContinueWatchingCard` render
		// ediliyor ve kart zaten "Devam Et" işlevini taşıyor. Play tile'ı da
		// eklenseydi aynı anda hem kart hem 26 karakterlik
		// "Kaldığın Yerden Devam Et" butonu görünürdü — hem çift işlev,
		// hem de tile'a sığmayan metin.
		...(isInProgress
			? []
			: [
					{
						key: "play",
						icon: buttonIcon,
						label: buttonTitle,
						/** Oynat birincil görünür — kırmızı zemin, ama aynı boyutta. */
						color: "#ffffff",
						onPress: handleWatch,
						primary: true,
					},
				]),
		...gridActions,
	];

	/** Kart tabanı: 5 kart telefonda tek satıra sığar, TV'de gerekirse sarar. */
	const tileBasis = isTV ? "17%" : "18%";

	return (
		<View style={[styles.container, { marginBottom: sp(18), gap: sp(12) }]}>
			{/* Kaldığın Yerden Devam Et kartı — yalnızca izleme sürerken */}
			{isInProgress && (
				<ContinueWatchingCard
					content={content}
					watchProgress={watchProgress}
					isSeries={isSeries}
					onPress={handleWatch}
				/>
			)}

			{/* Tek satır, tek ölçek: Oynat + eylem kartları */}
			<View style={[styles.gridRow, { gap: sp(10), flexWrap: "wrap" }]}>
				{tileActions.map((action) => (
					<TVPressable
						key={action.key}
						autoFocus={Boolean(action.primary)}
						style={({ focused }) => [
							styles.tile,
							{
								backgroundColor: action.primary
									? isCompleted
										? "#1e293b"
										: "#E50914"
									: surfaceBg,
								borderColor: action.primary
									? isCompleted
										? "rgba(255, 255, 255, 0.15)"
										: "#E50914"
									: action.active
										? "rgba(229,9,20,0.3)"
										: surfaceBorder,
								gap: sp(6),
								paddingVertical: sp(13),
								paddingHorizontal: sp(6),
								borderRadius: sp(13),
								// ⚠️ Boyut eşitliği: flexBasis + flexGrow
								flexBasis: tileBasis,
								flexGrow: 1,
								flexShrink: 1,
								minWidth: sp(58),
							},
							focused && {
								borderWidth: 2,
								borderColor: "#E50914",
								backgroundColor: action.primary
									? isCompleted
										? "#0f172a"
										: "#ff1111"
									: "rgba(229, 9, 20, 0.18)",
								transform: [{ scale: focusScale }],
							},
						]}
						onPress={action.onPress}
						activeOpacity={0.85}>
						<Ionicons
							name={action.icon}
							size={sp(21)}
							color={action.color}
						/>
						<Text
							style={[
								styles.gridLabel,
								{
									color: action.primary
										? "#ffffff"
										: action.active
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
	);
}

const styles = StyleSheet.create({
	container: {},

	/**
	 * Eylem satırı: Oynat dahil TÜM butonlar burada, eşit boyutta.
	 *
	 * `alignItems: "stretch"` — etiket uzunlukları farklı olsa da kartlar
	 * aynı yükseklikte dursun.
	 */
	gridRow: {
		flexDirection: "row",
		alignItems: "stretch",
	},

	/**
	 * TEK kart stili — hem "Oynat" hem eylemler bunu kullanıyor.
	 *
	 * Eski `primaryButton` + `gridItem` ikilisi iki ayrı ölçek üretiyordu:
	 * CTA `paddingVertical: 15` / `paddingHorizontal: 24` / `fontSize: 17`
	 * ile dev bir bant, kartlar `13` / `8` / `12.5` ile küçük sütunlar.
	 * Artık ikisi de buradan ölçülüyor; boyut farkı kalmadı.
	 */
	tile: {
		flexDirection: "column",
		alignItems: "center",
		justifyContent: "center",
		borderWidth: 1,
	},

	gridLabel: {
		fontWeight: "600",
		textAlign: "center",
	},
});
