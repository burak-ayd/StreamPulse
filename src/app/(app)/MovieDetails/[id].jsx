import { fetchPluginDetail } from "@/services/api";
import {
	getContentLibraryStatus,
	isFavorite,
	isInWatchlist,
	toggleFavorite,
	toggleWatchlist,
} from "@/utils/storage";
import { useThemeContext } from "@context/ThemeContext";
import { useContentDetails } from "@hooks/useContentDetails";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import ListSelectModal from "@components/modal/ListSelectModal";
import { Stack, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useMemo, useState } from "react";
import {
	Alert,
	Linking,
	ScrollView,
	Share,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from "react-native";

// Components
import ActionButtons from "@components/MovieDetailComponents/ActionButtons";
import CastSection from "@components/MovieDetailComponents/CastSection";
import CrewSection from "@components/MovieDetailComponents/CrewSection";
import ErrorState from "@components/MovieDetailComponents/ErrorState";
import HeroSection from "@components/MovieDetailComponents/HeroSection";
import LoadingState from "@components/MovieDetailComponents/LoadingState";
import MetadataSection from "@components/MovieDetailComponents/MetadataSection";
import OverviewSection from "@components/MovieDetailComponents/OverviewSection";
import RelatedContent from "@components/MovieDetailComponents/RelatedContent";
import SeasonsSection from "@components/MovieDetailComponents/SeasonsSection";

/**
 * Detay Sayfası Bölüm / Bileşen Aktiflik Ayarları
 * İstediğiniz bileşeni buradan true / false yaparak kolayca açıp kapatabilirsiniz.
 */
export const DETAIL_SECTIONS_CONFIG = {
	showTrailer: true, // Fragman butonu eylem gridinde yer almaktadır
	showCrew: false, // Kullanıcı isteği ile devre dışı bırakıldı (gözükmesin)
	showCast: true, // Oyuncular bölümü
	showOverview: true, // Açıklama / Özet bölümü
	showSeasons: true, // Sezonlar ve bölümler listesi
	showMetadata: true, // Film detay meta bilgileri (süre, puan, çıkış yılı vb.)
	showRelated: true, // Benzer içerikler bölümü
	showActionButtons: true, // Eylem butonları (Hemen İzle, Listem, Fragman, Favori, İndir)
	showFloatingBookmark: true, // Sağ altta kayan hızlı Liste/Kitaplık butonu
};

/**
 * Movie/Series Details Screen (Birleşik Modern Tasarım)
 * Dynamic route: /(app)/MovieDetails/[id]
 */
export default function MovieDetailsScreen() {
	const params = useLocalSearchParams();
	const id = params.id;
	const passedMovie = params.movieData
		? typeof params.movieData === "string"
			? JSON.parse(params.movieData)
			: params.movieData
		: null;

	const { colors, theme } = useThemeContext();

	const pluginName = passedMovie?.plugin || params.plugin;
	const movieUrl = passedMovie?.url || params.url;
	const isPlugin = Boolean(pluginName && movieUrl);

	const [pluginDetail, setPluginDetail] = useState(null);
	const [pluginLoading, setPluginLoading] = useState(isPlugin);
	const [activeTab, setActiveTab] = useState("overview"); // 'overview' | 'episodes' | 'related'

	// Normal statik / CMS içerikleri için hook (plugin değilse çağrılır)
	const {
		content: apiContent,
		loading: apiLoading,
		error: apiError,
		refetch: apiRefetch,
	} = useContentDetails(isPlugin ? null : id);

	// Plugin içerik detayını backend'den çek (/api/plugins/{name}/detail?url=...)
	useEffect(() => {
		let isMounted = true;
		if (isPlugin) {
			setPluginLoading(true);
			fetchPluginDetail(pluginName, movieUrl)
				.then((res) => {
					if (isMounted && res) {
						setPluginDetail(res);
					}
				})
				.catch((err) => {
					console.error("Plugin detay çekme hatası:", err);
				})
				.finally(() => {
					if (isMounted) setPluginLoading(false);
				});
		}
		return () => {
			isMounted = false;
		};
	}, [pluginName, movieUrl, isPlugin]);

	// Tüm verileri birleştir: pluginDetail > apiContent > passedMovie
	const content = useMemo(() => {
		if (pluginDetail) {
			const parsedRating = pluginDetail.rating
				? typeof pluginDetail.rating === "number"
					? pluginDetail.rating
					: parseFloat(pluginDetail.rating) || null
				: passedMovie?.rating
					? parseFloat(passedMovie.rating) || null
					: null;

			return {
				id: pluginDetail.slug || id,
				title: pluginDetail.title || passedMovie?.title,
				original_title:
					pluginDetail.original_title ||
					pluginDetail.title ||
					passedMovie?.title,
				tagline:
					pluginDetail.tagline ||
					pluginDetail.tags ||
					(Array.isArray(pluginDetail.genre)
						? pluginDetail.genre.join(" • ")
						: typeof pluginDetail.genre === "string"
							? pluginDetail.genre
							: null) ||
					passedMovie?.category ||
					null,
				overview:
					pluginDetail.description ||
					passedMovie?.description ||
					null,
				poster_url:
					pluginDetail.poster_url ||
					pluginDetail.poster ||
					passedMovie?.poster,
				backdrop_url:
					pluginDetail.backdrop_url ||
					passedMovie?.backdrop_url ||
					passedMovie?.backdrop ||
					pluginDetail.poster_url ||
					pluginDetail.poster ||
					passedMovie?.poster,
				rating: parsedRating,
				vote_count: pluginDetail.vote_count || null,
				runtime_minutes: pluginDetail.runtime_minutes || null,
				release_date:
					pluginDetail.release_date ||
					pluginDetail.year ||
					passedMovie?.release_date ||
					null,
				country: pluginDetail.country || null,
				language:
					pluginDetail.language || passedMovie?.language || null,
				age_rating: pluginDetail.age_rating || null,
				content_type:
					pluginDetail.content_type ||
					(pluginDetail.is_series || pluginDetail.seasons
						? "series"
						: "movie"),
				status: pluginDetail.status || null,
				director:
					pluginDetail.director ||
					pluginDetail.directors?.[0] ||
					null,
				creator: pluginDetail.creator || null,
				production_co: pluginDetail.production_co || null,
				cast_members:
					pluginDetail.cast_members ||
					(Array.isArray(pluginDetail.actors)
						? pluginDetail.actors
						: pluginDetail.actors
							? pluginDetail.actors.split(", ")
							: []),
				trailer_url:
					pluginDetail.fragman_url || pluginDetail.trailer_url,
				url: pluginDetail.url || movieUrl,
				plugin: pluginName,
				seasons: pluginDetail.seasons || passedMovie?.seasons || null,
				episodes:
					pluginDetail.episodes || passedMovie?.episodes || null,
				related: pluginDetail.related || null,
			};
		}

		if (apiContent) {
			return {
				...apiContent,
				status: apiContent.status || null,
				age_rating: apiContent.age_rating || null,
				director: apiContent.director || null,
				production_co: apiContent.production_co || null,
			};
		}

		if (passedMovie) {
			const isSeriesGuess =
				passedMovie.is_series ||
				Boolean(passedMovie.initialSeason) ||
				passedMovie.category?.toLowerCase()?.includes("dizi") ||
				passedMovie.title?.toLowerCase()?.includes("sezon") ||
				passedMovie.content_type === "series";

			return {
				id: passedMovie.id || id,
				title: passedMovie.seriesTitle || passedMovie.title,
				original_title: passedMovie.seriesTitle || passedMovie.title,
				tagline:
					passedMovie.initialSeason && passedMovie.initialEpisode
						? `${passedMovie.initialSeason}. Sezon ${passedMovie.initialEpisode}. Bölüm`
						: passedMovie.category || null,
				overview: passedMovie.description || null,
				poster_url:
					passedMovie.poster ||
					passedMovie.poster_url ||
					passedMovie.image,
				backdrop_url:
					passedMovie.backdrop_url ||
					passedMovie.backdrop ||
					passedMovie.poster ||
					passedMovie.poster_url ||
					passedMovie.image,
				rating: passedMovie.rating
					? typeof passedMovie.rating === "number"
						? passedMovie.rating
						: parseFloat(passedMovie.rating) || null
					: null,
				vote_count: null,
				runtime_minutes: null,
				release_date: passedMovie.release_date || null,
				language: passedMovie.language || null,
				age_rating: null,
				content_type: isSeriesGuess ? "series" : "movie",
				status: null,
				director: null,
				production_co: null,
				url: movieUrl,
				plugin: pluginName,
				seasons: null,
				episodes: null,
				cast_members: [],
			};
		}

		return null;
	}, [pluginDetail, apiContent, passedMovie, id, pluginName, movieUrl]);

	const loading = isPlugin ? pluginLoading && !content : apiLoading;
	const error = isPlugin ? null : apiError;

	const isSeries = Boolean(
		content?.content_type === "series" ||
		content?.seasons ||
		content?.episodes ||
		passedMovie?.is_series ||
		passedMovie?.category?.toLowerCase()?.includes("dizi") ||
		content?.title?.toLowerCase()?.includes("sezon"),
	);

	// Tür / Kategori listesi (Dram, Tarih, Epik Savaş vb.)
	const genreList = useMemo(() => {
		const raw =
			pluginDetail?.genre ||
			pluginDetail?.genres ||
			pluginDetail?.categories ||
			passedMovie?.genre ||
			passedMovie?.genres ||
			content?.tagline;

		if (Array.isArray(raw)) return raw;
		if (typeof raw === "string") {
			return raw
				.split(/[,/·•]/)
				.map((s) => s.trim())
				.filter(Boolean);
		}
		return [];
	}, [pluginDetail, passedMovie, content?.tagline]);

	// Toplam bölüm sayısı hesaplama
	const totalEpisodesCount = useMemo(() => {
		if (!content?.seasons) return 0;
		if (
			typeof content.seasons === "object" &&
			!Array.isArray(content.seasons)
		) {
			return Object.values(content.seasons).reduce(
				(acc, list) => acc + (Array.isArray(list) ? list.length : 0),
				0,
			);
		}
		if (Array.isArray(content.seasons)) {
			return content.seasons.reduce(
				(acc, s) =>
					acc + (Array.isArray(s.episodes) ? s.episodes.length : 1),
				0,
			);
		}
		return 0;
	}, [content?.seasons]);

	// Backend'den gelen Ses ve Altyazı seçeneklerini tespit et (varsa gösterilecek)
	const audioSubtitleOptions = useMemo(() => {
		const rawLanguage =
			pluginDetail?.language ||
			passedMovie?.language ||
			content?.language;
		const rawAudio =
			pluginDetail?.audio || pluginDetail?.dubbing || content?.audio;
		const rawSubtitles =
			pluginDetail?.subtitles ||
			pluginDetail?.subtitle ||
			content?.subtitles;
		const rawLanguages = pluginDetail?.languages || content?.languages;

		const options = [];

		const checkAndAdd = (text) => {
			if (!text || typeof text !== "string") return;
			const lower = text.toLowerCase();
			if (lower.includes("dublaj") || lower.includes("türkçe dublaj")) {
				if (!options.includes("Türkçe Dublaj")) {
					options.push("Türkçe Dublaj");
				}
			}
			if (
				lower.includes("altyazı") ||
				lower.includes("altyazılı") ||
				lower.includes("sub")
			) {
				if (!options.includes("TR Altyazı")) {
					options.push("TR Altyazı");
				}
			}
			if (lower.includes("orijinal") || lower.includes("original")) {
				if (!options.includes("Orijinal Dil")) {
					options.push("Orijinal Dil");
				}
			}
		};

		if (Array.isArray(rawLanguages)) {
			rawLanguages.forEach(checkAndAdd);
		} else if (rawLanguages) {
			checkAndAdd(rawLanguages);
		}

		if (rawLanguage) checkAndAdd(rawLanguage);
		if (rawAudio) checkAndAdd(rawAudio);
		if (rawSubtitles) checkAndAdd(rawSubtitles);

		if (Array.isArray(rawAudio)) {
			rawAudio.forEach((a) => {
				const label =
					typeof a === "string" ? a : a?.name || a?.language;
				if (label && !options.includes(label)) options.push(label);
			});
		}
		if (Array.isArray(rawSubtitles)) {
			rawSubtitles.forEach((s) => {
				const label =
					typeof s === "string" ? s : s?.name || s?.language;
				if (label && !options.includes(label)) options.push(label);
			});
		}

		return options;
	}, [pluginDetail, passedMovie, content]);

	// Favori ve Kitaplık / İzleme Listesi Durumları
	const [isFav, setIsFav] = useState(false);
	const [inWatchlist, setInWatchlist] = useState(false);
	const [watchlistStatus, setWatchlistStatus] = useState(null); // 'watching' | 'planned' | 'completed' | null
	const [isListSelectModalVisible, setIsListSelectModalVisible] = useState(false);
	const [selectedSeason, setSelectedSeason] = useState(
		passedMovie?.initialSeason ? String(passedMovie.initialSeason) : null,
	);

	const movieItem = useMemo(() => {
		if (!content) return null;
		const targetId = content.id || content.url;
		return {
			id: targetId,
			title: content.title,
			poster: content.poster_url || content.backdrop_url,
			type: isSeries ? "series" : "movie",
			plugin: content.plugin,
			url: content.url,
		};
	}, [content, isSeries]);

	useEffect(() => {
		const targetId = content?.id || content?.url;
		if (targetId) {
			getContentLibraryStatus(targetId)
				.then((status) => {
					setIsFav(Boolean(status?.isFav));
					setInWatchlist(Boolean(status?.currentList));
					setWatchlistStatus(status?.currentList || null);
				})
				.catch(() => {});
		}
	}, [content?.id, content?.url]);

	const handleToggleFavorite = async () => {
		if (!movieItem) return;
		try {
			const updated = await toggleFavorite(movieItem);
			setIsFav(Boolean(updated));
		} catch (e) {
			console.error("Favori değiştirme hatası:", e);
		}
	};

	const handleToggleWatchlist = () => {
		if (!movieItem) return;
		setIsListSelectModalVisible(true);
	};

	const handleListStatusChanged = (newList, newFav) => {
		setWatchlistStatus(newList);
		setInWatchlist(Boolean(newList));
		if (newFav !== undefined) {
			setIsFav(newFav);
		}
	};

	const handleShare = async () => {
		if (!content) return;
		try {
			await Share.share({
				message: `${content.title}\n\n${content.overview || "StreamPulse üzerinden harika bir içerik!"}`,
				title: content.title,
			});
		} catch (error) {
			console.error("Paylaşım hatası:", error);
		}
	};

	const handleOpenTrailer = async () => {
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
			console.error("Fragman açma hatası:", error);
			Linking.openURL(trailerUrl);
		}
	};

	// Loading state
	if (loading && !content) {
		return <LoadingState />;
	}

	// Error state
	if (error && !content) {
		return <ErrorState error={error} onRetry={apiRefetch} />;
	}

	// Content not found
	if (!content) {
		return <ErrorState error="İçerik bulunamadı" onRetry={apiRefetch} />;
	}

	const surfaceBg = theme === "dark" ? "#161B24" : "#ffffff";
	const surfaceBorder = theme === "dark" ? "#232A36" : "#E2E8F0";

	return (
		<View style={[styles.rootContainer, { backgroundColor: colors.bg }]}>
			<Stack.Screen options={{ headerShown: false }} />

			<ScrollView
				style={[styles.container, { backgroundColor: colors.bg }]}
				showsVerticalScrollIndicator={false}>
				{/* 1. HERO SECTION - Backdrop, başlık, rozetler, geri & paylaş */}
				<HeroSection
					content={content}
					onShare={handleShare}
					genreList={genreList}
				/>

				{/* 2. ANA İÇERİK ALANI */}
				<View style={styles.contentWrapper}>
					{/* Meta Hapları (Süre, Yıl, Yaş Sınırı, Kalite, Durum) */}
					{DETAIL_SECTIONS_CONFIG.showMetadata && (
						<MetadataSection content={content} />
					)}

					{/* Eylem Butonları (Hemen Şimdi İzle + Listem, Fragman, Favori, İndir) */}
					{DETAIL_SECTIONS_CONFIG.showActionButtons && (
						<ActionButtons
							content={content}
							inWatchlist={inWatchlist}
							watchlistStatus={watchlistStatus}
							isFav={isFav}
							onToggleWatchlist={handleToggleWatchlist}
							onToggleFavorite={handleToggleFavorite}
							onOpenTrailer={handleOpenTrailer}
						/>
					)}

					{/* Ses & Altyazı Bilgi Çubuğu (Yalnızca backend sonucunda varsa gösterilir) */}
					{audioSubtitleOptions.length > 0 && (
						<View
							style={[
								styles.audioSubtitleRow,
								{
									backgroundColor: surfaceBg,
									borderColor: surfaceBorder,
								},
							]}>
							<View style={styles.audioLeft}>
								<Ionicons
									name="chatbubbles-outline"
									size={16}
									color="#E50914"
								/>
								<Text
									style={[
										styles.audioLabel,
										{ color: colors.textSecondary },
									]}>
									Ses & Altyazı:
								</Text>
							</View>
							<View style={styles.audioChips}>
								{audioSubtitleOptions.map((optionText, idx) => (
									<View
										key={idx}
										style={[
											styles.audioChip,
											{
												backgroundColor:
													theme === "dark"
														? "#0B0E14"
														: "#f1f5f9",
												borderColor: surfaceBorder,
											},
										]}>
										<Text
											style={[
												styles.audioChipText,
												{ color: colors.text },
											]}>
											{optionText}
										</Text>
									</View>
								))}
							</View>
						</View>
					)}

					{/* 3. SEKME GEÇİŞİ (TABS SWITCHER) */}
					<View
						style={[
							styles.tabBar,
							{ borderBottomColor: surfaceBorder },
						]}>
						{/* Tab 1: Genel Bakış */}
						<TouchableOpacity
							style={[
								styles.tabItem,
								activeTab === "overview" &&
									styles.tabItemActive,
							]}
							onPress={() => setActiveTab("overview")}
							activeOpacity={0.7}>
							<Text
								style={[
									styles.tabText,
									{
										color:
											activeTab === "overview"
												? "#E50914"
												: colors.textSecondary,
										fontWeight:
											activeTab === "overview"
												? "800"
												: "600",
									},
								]}>
								Genel Bakış
							</Text>
							{activeTab === "overview" && (
								<View style={styles.tabIndicator} />
							)}
						</TouchableOpacity>

						{/* Tab 2: Bölümler (Eğer dizi ise) */}
						{isSeries && (
							<TouchableOpacity
								style={[
									styles.tabItem,
									activeTab === "episodes" &&
										styles.tabItemActive,
								]}
								onPress={() => setActiveTab("episodes")}
								activeOpacity={0.7}>
								<View style={styles.tabWithBadge}>
									<Text
										style={[
											styles.tabText,
											{
												color:
													activeTab === "episodes"
														? "#E50914"
														: colors.textSecondary,
												fontWeight:
													activeTab === "episodes"
														? "800"
														: "600",
											},
										]}>
										Bölümler
									</Text>
									{totalEpisodesCount > 0 && (
										<View style={styles.tabCountBadge}>
											<Text style={styles.tabCountText}>
												{totalEpisodesCount}
											</Text>
										</View>
									)}
								</View>
								{activeTab === "episodes" && (
									<View style={styles.tabIndicator} />
								)}
							</TouchableOpacity>
						)}

						{/* Tab 3: Benzerler */}
						<TouchableOpacity
							style={[
								styles.tabItem,
								activeTab === "related" && styles.tabItemActive,
							]}
							onPress={() => setActiveTab("related")}
							activeOpacity={0.7}>
							<Text
								style={[
									styles.tabText,
									{
										color:
											activeTab === "related"
												? "#E50914"
												: colors.textSecondary,
										fontWeight:
											activeTab === "related"
												? "800"
												: "600",
									},
								]}>
								Benzerler
							</Text>
							{activeTab === "related" && (
								<View style={styles.tabIndicator} />
							)}
						</TouchableOpacity>
					</View>

					{/* 4. SEKMELERE GÖRE İÇERİK GÖSTERİMİ */}

					{/* --- GENEL BAKIŞ SEKMESİ --- */}
					{activeTab === "overview" && (
						<>
							{/* Özet Bölümü */}
							{DETAIL_SECTIONS_CONFIG.showOverview && (
								<OverviewSection content={content} />
							)}

							{/* Dizi ise Sezon ve Bölümler Bölümü */}
							{isSeries && DETAIL_SECTIONS_CONFIG.showSeasons && (
								<SeasonsSection
									seasons={content.seasons}
									episodes={content.episodes}
									loading={pluginLoading && !content.seasons}
									initialSeason={passedMovie?.initialSeason}
									selectedSeason={selectedSeason}
									onSeasonChange={setSelectedSeason}
									seriesTitle={content.title}
									posterUrl={
										content.poster_url ||
										content.backdrop_url
									}
									content={content}
								/>
							)}

							{/* Oyuncular Bölümü */}
							{DETAIL_SECTIONS_CONFIG.showCast &&
								content.cast_members &&
								content.cast_members.length > 0 && (
									<CastSection cast={content.cast_members} />
								)}

							{/* Ekip Bilgisi (Gerektiğinde açılabilir) */}
							{DETAIL_SECTIONS_CONFIG.showCrew && (
								<CrewSection content={content} />
							)}

							{/* Detay Bilgileri Tablosu (Yönetmen, Orijinal Dil, Yayıncı Ağ - Yalnızca varsa gösterilir) */}
							{Boolean(
								content.director ||
								content.language ||
								content.production_co,
							) && (
								<View
									style={[
										styles.detailsTableCard,
										{
											backgroundColor: surfaceBg,
											borderColor: surfaceBorder,
										},
									]}>
									{Boolean(content.director) && (
										<View style={styles.detailsRow}>
											<Text
												style={[
													styles.detailsLabel,
													{
														color: colors.textSecondary,
													},
												]}>
												Yönetmen
											</Text>
											<Text
												style={[
													styles.detailsValue,
													{ color: colors.text },
												]}>
												{content.director}
											</Text>
										</View>
									)}

									{Boolean(
										content.director &&
										(content.language ||
											content.production_co),
									) && (
										<View
											style={[
												styles.detailsDivider,
												{
													backgroundColor:
														surfaceBorder,
												},
											]}
										/>
									)}

									{Boolean(content.language) && (
										<View style={styles.detailsRow}>
											<Text
												style={[
													styles.detailsLabel,
													{
														color: colors.textSecondary,
													},
												]}>
												Orijinal Dil
											</Text>
											<Text
												style={[
													styles.detailsValue,
													{ color: colors.text },
												]}>
												{content.language}
											</Text>
										</View>
									)}

									{Boolean(
										content.language &&
										content.production_co,
									) && (
										<View
											style={[
												styles.detailsDivider,
												{
													backgroundColor:
														surfaceBorder,
												},
											]}
										/>
									)}

									{Boolean(content.production_co) && (
										<View style={styles.detailsRow}>
											<Text
												style={[
													styles.detailsLabel,
													{
														color: colors.textSecondary,
													},
												]}>
												Yayıncı Ağ
											</Text>
											<Text
												style={[
													styles.detailsValue,
													{ color: colors.text },
												]}>
												{content.production_co}
											</Text>
										</View>
									)}
								</View>
							)}

							{/* Film ise veya benzer içerikler varsa göster */}
							{!isSeries &&
								DETAIL_SECTIONS_CONFIG.showRelated && (
									<RelatedContent
										contentType={content.content_type}
										currentId={content.id}
										pluginRelated={content.related}
									/>
								)}
						</>
					)}

					{/* --- BÖLÜMLER SEKMESİ --- */}
					{activeTab === "episodes" && isSeries && (
						<View style={styles.episodesTabContainer}>
							<SeasonsSection
								seasons={content.seasons}
								episodes={content.episodes}
								loading={pluginLoading && !content.seasons}
								initialSeason={passedMovie?.initialSeason}
								selectedSeason={selectedSeason}
								onSeasonChange={setSelectedSeason}
								seriesTitle={content.title}
								posterUrl={
									content.poster_url || content.backdrop_url
								}
								content={content}
							/>
						</View>
					)}

					{/* --- BENZERLER SEKMESİ --- */}
					{activeTab === "related" && (
						<View style={styles.relatedTabContainer}>
							<RelatedContent
								contentType={content.content_type}
								currentId={content.id}
								pluginRelated={content.related}
							/>
						</View>
					)}
				</View>
			</ScrollView>

			{/* 5. SAĞ ALTTA KAYAN HIZLI KİTAPLIK / LİSTEM BUTONU (FAB) */}
			{DETAIL_SECTIONS_CONFIG.showFloatingBookmark && (
				<TouchableOpacity
					style={[
						styles.floatingBookmark,
						{
							backgroundColor: inWatchlist
								? (watchlistStatus === "completed" ? "#10b981" : watchlistStatus === "planned" ? "#0284c7" : "#E50914")
								: surfaceBg,
							borderColor: inWatchlist
								? (watchlistStatus === "completed" ? "#10b981" : watchlistStatus === "planned" ? "#0284c7" : "#E50914")
								: surfaceBorder,
						},
					]}
					onPress={handleToggleWatchlist}
					activeOpacity={0.8}
					hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
					<Ionicons
						name={
							watchlistStatus === "watching"
								? "play-circle"
								: watchlistStatus === "completed"
									? "checkmark-circle"
									: inWatchlist
										? "bookmark"
										: "bookmark-outline"
						}
						size={22}
						color={inWatchlist ? "#ffffff" : "#E50914"}
					/>
				</TouchableOpacity>
			)}

			{/* List Selection Modal */}
			<ListSelectModal
				visible={isListSelectModalVisible}
				movie={movieItem}
				onClose={() => setIsListSelectModalVisible(false)}
				onStatusChanged={handleListStatusChanged}
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	rootContainer: {
		flex: 1,
	},
	container: {
		flex: 1,
	},
	contentWrapper: {
		paddingHorizontal: 20,
		paddingTop: 8,
		paddingBottom: 70,
	},

	/* Ses & Altyazı Bilgi Çubuğu */
	audioSubtitleRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: 14,
		paddingVertical: 10,
		borderRadius: 14,
		borderWidth: 1,
		marginBottom: 18,
	},
	audioLeft: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
	},
	audioLabel: {
		fontSize: 12,
		fontWeight: "600",
	},
	audioChips: {
		flexDirection: "row",
		gap: 6,
	},
	audioChip: {
		paddingHorizontal: 8,
		paddingVertical: 4,
		borderRadius: 8,
		borderWidth: 1,
	},
	audioChipText: {
		fontSize: 11,
		fontWeight: "600",
	},

	/* Sekmeler (Tab Bar) */
	tabBar: {
		flexDirection: "row",
		borderBottomWidth: 1,
		marginBottom: 20,
		gap: 24,
	},
	tabItem: {
		paddingBottom: 12,
		position: "relative",
	},
	tabItemActive: {},
	tabWithBadge: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
	},
	tabText: {
		fontSize: 15,
	},
	tabCountBadge: {
		backgroundColor: "rgba(100, 116, 139, 0.25)",
		paddingHorizontal: 6,
		paddingVertical: 1,
		borderRadius: 10,
	},
	tabCountText: {
		fontSize: 11,
		fontWeight: "700",
		color: "#94a3b8",
	},
	tabIndicator: {
		position: "absolute",
		bottom: -1,
		left: 0,
		right: 0,
		height: 3,
		borderRadius: 2,
		backgroundColor: "#E50914",
	},

	/* Sekme İçi Özel Alanlar */
	episodesTabContainer: {
		paddingTop: 4,
	},
	relatedTabContainer: {
		paddingTop: 4,
	},

	/* Detay Bilgileri Tablosu */
	detailsTableCard: {
		borderRadius: 16,
		borderWidth: 1,
		paddingHorizontal: 16,
		paddingVertical: 12,
		marginBottom: 22,
	},
	detailsRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingVertical: 8,
	},
	detailsLabel: {
		fontSize: 13,
		fontWeight: "500",
	},
	detailsValue: {
		fontSize: 13,
		fontWeight: "700",
	},
	detailsDivider: {
		height: 1,
		width: "100%",
	},

	/* Kayan Liste/Kitaplık Butonu (FAB) */
	floatingBookmark: {
		position: "absolute",
		bottom: 24,
		right: 20,
		width: 48,
		height: 48,
		borderRadius: 24,
		borderWidth: 1,
		justifyContent: "center",
		alignItems: "center",
		shadowColor: "#E50914",
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.35,
		shadowRadius: 8,
		elevation: 8,
		zIndex: 99,
	},
});
