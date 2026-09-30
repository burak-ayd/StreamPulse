import { fetchPluginDetail } from "@/services/api";
import {
	isFavorite,
	isInWatchlist,
	toggleFavorite,
	toggleWatchlist,
} from "@/utils/storage";
import { useThemeContext } from "@context/ThemeContext";
import { useContentDetails } from "@hooks/useContentDetails";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { Stack, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
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
import * as WebBrowser from "expo-web-browser";

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
import TrailerSection from "@components/MovieDetailComponents/TrailerSection";

/**
 * Detay Sayfası Bölüm / Bileşen Aktiflik Ayarları
 * İstediğiniz bileşeni buradan true / false yaparak kolayca açıp kapatabilirsiniz.
 */
export const DETAIL_SECTIONS_CONFIG = {
	showTrailer: true, // Fragman bölümü (sayfanın üst kısmına alındı)
	showCrew: false, // Kullanıcı isteği ile devre dışı bırakıldı (gözükmesin)
	showCast: true, // Oyuncular bölümü
	showOverview: true, // Açıklama / Özet bölümü
	showSeasons: true, // Sezonlar ve bölümler listesi
	showMetadata: true, // Film detay meta bilgileri (süre, puan, çıkış yılı vb.)
	showRelated: true, // Benzer içerikler bölümü
	showActionButtons: true, // Eylem butonları (İzle, Listem, Favori, Paylaş)
	showFloatingBookmark: true, // Sağ altta kayan hızlı Liste/Kitaplık butonu
};

/**
 * Movie/Series Details Screen
 * Dynamic route: /(app)/MovieDetails/[id]
 *
 * Displays comprehensive information about a movie or series from API / Plugins
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
						? pluginDetail.genre.join(" · ")
						: "") ||
					passedMovie?.category ||
					"",
				overview:
					pluginDetail.description ||
					passedMovie?.description ||
					`${pluginDetail.title || passedMovie?.title} açıklaması.`,
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
				rating: pluginDetail.rating
					? typeof pluginDetail.rating === "number"
						? pluginDetail.rating
						: parseFloat(pluginDetail.rating) || 8.0
					: passedMovie?.rating
						? parseFloat(passedMovie.rating) || 8.0
						: 8.0,
				vote_count: pluginDetail.vote_count || 100,
				runtime_minutes: pluginDetail.runtime_minutes || 0,
				release_date:
					pluginDetail.release_date ||
					pluginDetail.year ||
					passedMovie?.release_date ||
					"2025",
				country: pluginDetail.country || "Türkiye",
				language:
					pluginDetail.language || passedMovie?.language || "tr",
				age_rating: pluginDetail.age_rating || "13+",
				content_type:
					pluginDetail.content_type ||
					(pluginDetail.is_series || pluginDetail.seasons
						? "series"
						: "movie"),
				status: pluginDetail.status || "Yayınlandı",
				director: pluginDetail.director,
				creator: pluginDetail.creator,
				production_co: pluginDetail.production_co,
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
				episodes: pluginDetail.episodes || passedMovie?.episodes || null,
			};
		}

		if (apiContent) {
			return apiContent;
		}

		if (passedMovie) {
			const isSeries =
				passedMovie.is_series ||
				Boolean(passedMovie.initialSeason) ||
				passedMovie.category?.toLowerCase()?.includes("dizi") ||
				passedMovie.title?.toLowerCase()?.includes("sezon") ||
				passedMovie.content_type === "series";

			return {
				id: passedMovie.id || id,
				title: passedMovie.seriesTitle || passedMovie.title,
				original_title:
					passedMovie.seriesTitle || passedMovie.title,
				tagline:
					passedMovie.initialSeason && passedMovie.initialEpisode
						? `${passedMovie.initialSeason}. Sezon ${passedMovie.initialEpisode}. Bölüm`
						: passedMovie.category || passedMovie.description || "",
				overview:
					passedMovie.description ||
					`${passedMovie.seriesTitle || passedMovie.title} detayları yükleniyor...`,
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
						: parseFloat(passedMovie.rating) || 8.0
					: 8.0,
				release_date: passedMovie.release_date || "2025",
				language: passedMovie.language || "tr",
				content_type: isSeries ? "series" : "movie",
				status: "Yayınlandı",
				url: movieUrl,
				plugin: pluginName,
				seasons: null,
				episodes: null,
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

	// Tür / Kategori listesi (Dram, Aksiyon, Macera vb.)
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
				.split(/[,/·]/)
				.map((s) => s.trim())
				.filter(Boolean);
		}
		return [];
	}, [pluginDetail, passedMovie, content?.tagline]);

	// Favori ve Kitaplık / İzleme Listesi Durumları (İki ayrı bağımsız özellik)
	const [isFav, setIsFav] = useState(false);
	const [inWatchlist, setInWatchlist] = useState(false);

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
			isFavorite(targetId).then(setIsFav).catch(() => {});
			isInWatchlist(targetId).then(setInWatchlist).catch(() => {});
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

	const handleToggleWatchlist = async () => {
		if (!movieItem) return;
		try {
			const updated = await toggleWatchlist(movieItem);
			setInWatchlist(Boolean(updated));
		} catch (e) {
			console.error("İzleme listesi (kitaplık) değiştirme hatası:", e);
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

	// Loading state - Sadece elimizde hiçbir veri yoksa yükleniyor göster
	if (loading && !content) {
		return <LoadingState />;
	}

	// Error state - Sadece elimizde hiçbir veri yoksa hata göster
	if (error && !content) {
		return <ErrorState error={error} onRetry={apiRefetch} />;
	}

	// Content not found
	if (!content) {
		return <ErrorState error="İçerik bulunamadı" onRetry={apiRefetch} />;
	}

	return (
		<View style={[styles.rootContainer, { backgroundColor: colors.bg }]}>
			<Stack.Screen options={{ headerShown: false }} />

			<ScrollView
				style={[styles.container, { backgroundColor: colors.bg }]}
				showsVerticalScrollIndicator={false}>
				{/* Hero Section - Backdrop (Sağ üstte Paylaş, sol üstte Geri butonu) */}
				<HeroSection
					content={isSeries ? { ...content, title: "" } : content}
					onShare={handleShare}
				/>

				{/* Content Wrapper */}
				<View style={styles.contentWrapper}>
					{isSeries ? (
						/* ======================================================== */
						/* 1. DİZİ SAYFA YAPISI (Birebir Kırmızı-Siyah Tema Düzeni)   */
						/* ======================================================== */
						<>
							{/* Dizi Başlığı */}
							<Text
								style={[styles.seriesTitle, { color: colors.text }]}>
								{content.title}
							</Text>

							{/* Dizi Alt Rozetleri: [Platform] Dizi Yıl */}
							<View style={styles.seriesMetaRow}>
								{content.plugin && (
									<View
										style={[
											styles.platformBadge,
											{
												backgroundColor: colors.primary, // Canlı Kırmızı (#ea2a33)
											},
										]}>
										<Text style={styles.platformBadgeText}>
											{content.plugin}
										</Text>
									</View>
								)}
								<Text
									style={[
										styles.seriesMetaText,
										{ color: colors.textSecondary },
									]}>
									Dizi
								</Text>
								{content.release_date ? (
									<Text
										style={[
											styles.seriesMetaText,
											{ color: colors.textSecondary },
										]}>
										{String(content.release_date).slice(0, 4)}
									</Text>
								) : null}
							</View>

							{/* Açıklama / Özet */}
							{DETAIL_SECTIONS_CONFIG.showOverview &&
							content.overview ? (
								<Text
									style={[
										styles.seriesOverviewText,
										{ color: colors.textSecondary },
									]}
									numberOfLines={4}>
									{content.overview}
								</Text>
							) : null}

							{/* Tür / Kategori Rozetleri: [Dram] [Aksiyon] [Macera] */}
							{genreList.length > 0 && (
								<View style={styles.genreChipsRow}>
									{genreList.map((genre, idx) => (
										<View
											key={idx}
											style={[
												styles.genreChip,
												{
													backgroundColor:
														theme === "dark"
															? "#1A1A1A"
															: "#f1f5f9",
													borderColor:
														theme === "dark"
															? "#2E2E2E"
															: colors.border,
												},
											]}>
											<Text
												style={[
													styles.genreChipText,
													{ color: colors.text },
												]}>
												{genre}
											</Text>
										</View>
									))}
								</View>
							)}

							{/* Dizi Eylem Butonları: [Listem/Kitaplık] [Favori] [Paylaş] */}
							{DETAIL_SECTIONS_CONFIG.showActionButtons && (
								<View style={styles.seriesActionRow}>
									{/* 1. Kitaplık / İzleme Listesi */}
									<TouchableOpacity
										style={[
											styles.seriesActionButton,
											inWatchlist
												? {
														backgroundColor:
															colors.primary,
														borderColor:
															colors.primary,
												  }
												: {
														backgroundColor:
															theme === "dark"
																? "#1A1A1A"
																: "#ffffff",
														borderColor:
															theme === "dark"
																? "#2E2E2E"
																: colors.border,
												  },
										]}
										onPress={handleToggleWatchlist}
										activeOpacity={0.75}>
										<Ionicons
											name={
												inWatchlist
													? "bookmark"
													: "bookmark-outline"
											}
											size={18}
											color={
												inWatchlist
													? "#ffffff"
													: colors.primary
											}
										/>
										<Text
											style={[
												styles.seriesActionText,
												{
													color: inWatchlist
														? "#ffffff"
														: colors.text,
												},
											]}>
											{inWatchlist
												? "Listemde"
												: "Listem"}
										</Text>
									</TouchableOpacity>

									{/* 2. Favori */}
									<TouchableOpacity
										style={[
											styles.seriesActionButton,
											isFav
												? {
														backgroundColor:
															theme === "dark"
																? "#281214"
																: "#fee2e2",
														borderColor:
															colors.primary,
												  }
												: {
														backgroundColor:
															theme === "dark"
																? "#1A1A1A"
																: "#ffffff",
														borderColor:
															theme === "dark"
																? "#2E2E2E"
																: colors.border,
												  },
										]}
										onPress={handleToggleFavorite}
										activeOpacity={0.75}>
										<Ionicons
											name={
												isFav
													? "heart"
													: "heart-outline"
											}
											size={18}
											color={colors.primary}
										/>
										<Text
											style={[
												styles.seriesActionText,
												{
													color: isFav
														? colors.primary
														: colors.text,
												},
											]}>
											{isFav ? "Favorilerde" : "Favori"}
										</Text>
									</TouchableOpacity>

									{/* 3. Fragman (Paylaş butonunun yerine yerleştirildi) */}
									{Boolean(content.trailer_url) && (
										<TouchableOpacity
											style={[
												styles.seriesActionButton,
												{
													backgroundColor:
														theme === "dark"
															? "#1A1A1A"
															: "#ffffff",
													borderColor:
														theme === "dark"
															? "#2E2E2E"
															: colors.border,
												},
											]}
											onPress={handleOpenTrailer}
											activeOpacity={0.75}>
											<Ionicons
												name="play-circle-outline"
												size={19}
												color={colors.primary}
											/>
											<Text
												style={[
													styles.seriesActionText,
													{ color: colors.text },
												]}>
												Fragman
											</Text>
										</TouchableOpacity>
									)}
								</View>
							)}

							{/* Sezonlar & Bölümler */}
							{DETAIL_SECTIONS_CONFIG.showSeasons && (
								<SeasonsSection
									seasons={content.seasons}
									episodes={content.episodes}
									loading={pluginLoading && !content.seasons}
									initialSeason={passedMovie?.initialSeason}
									seriesTitle={content.title}
									posterUrl={
										content.poster_url ||
										content.backdrop_url
									}
									content={content}
								/>
							)}

							{/* Oyuncular */}
							{DETAIL_SECTIONS_CONFIG.showCast &&
								content.cast_members &&
								content.cast_members.length > 0 && (
									<CastSection cast={content.cast_members} />
								)}

							{/* Ekip Bilgisi (Kullanıcı İsteği: Devre Dışı) */}
							{DETAIL_SECTIONS_CONFIG.showCrew && (
								<CrewSection content={content} />
							)}

							{/* Benzer İçerikler */}
							{DETAIL_SECTIONS_CONFIG.showRelated && (
								<RelatedContent
									contentType={content.content_type}
									currentId={content.id}
								/>
							)}
						</>
					) : (
						/* ======================================================== */
						/* 2. FİLM SAYFA YAPISI                                      */
						/* ======================================================== */
						<>
							{/* Action Buttons - İzle, Listem, Fragman, Favori */}
							{DETAIL_SECTIONS_CONFIG.showActionButtons && (
								<ActionButtons
									content={content}
									inWatchlist={inWatchlist}
									isFav={isFav}
									onToggleWatchlist={handleToggleWatchlist}
									onToggleFavorite={handleToggleFavorite}
									onOpenTrailer={handleOpenTrailer}
								/>
							)}

							{/* Metadata - Rating, Runtime, Year, Country, etc. */}
							{DETAIL_SECTIONS_CONFIG.showMetadata && (
								<MetadataSection content={content} />
							)}

							{/* Overview - Description */}
							{DETAIL_SECTIONS_CONFIG.showOverview && (
								<OverviewSection content={content} />
							)}

							{/* Cast - Actors */}
							{DETAIL_SECTIONS_CONFIG.showCast &&
								content.cast_members &&
								content.cast_members.length > 0 && (
									<CastSection cast={content.cast_members} />
								)}

							{/* Crew - Director, Creator, Production Company (Devre Dışı) */}
							{DETAIL_SECTIONS_CONFIG.showCrew && (
								<CrewSection content={content} />
							)}

							{/* Related Content */}
							{DETAIL_SECTIONS_CONFIG.showRelated && (
								<RelatedContent
									contentType={content.content_type}
									currentId={content.id}
								/>
							)}
						</>
					)}
				</View>
			</ScrollView>

			{/* Sağ Altta Kayan Hızlı Kitaplık / İzleme Listesi Butonu (Floating Bookmark) */}
			{DETAIL_SECTIONS_CONFIG.showFloatingBookmark && (
				<TouchableOpacity
					style={[
						styles.floatingBookmark,
						{
							backgroundColor: inWatchlist
								? colors.primary
								: theme === "dark"
									? "#1A1A1A"
									: "#ffffff",
							borderColor: inWatchlist
								? colors.primary
								: theme === "dark"
									? "#333333"
									: colors.border,
						},
					]}
					onPress={handleToggleWatchlist}
					activeOpacity={0.8}
					hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
					<Ionicons
						name={inWatchlist ? "bookmark" : "bookmark-outline"}
						size={22}
						color={inWatchlist ? "#ffffff" : colors.primary}
					/>
				</TouchableOpacity>
			)}
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
		paddingBottom: 60,
	},
	/* Dizi Sayfa Yapısı Stilleri */
	seriesTitle: {
		fontSize: 22,
		fontWeight: "800",
		letterSpacing: -0.4,
		marginBottom: 8,
		marginTop: 2,
	},
	seriesMetaRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		marginBottom: 14,
	},
	platformBadge: {
		paddingHorizontal: 9,
		paddingVertical: 3,
		borderRadius: 6,
	},
	platformBadgeText: {
		fontSize: 11,
		fontWeight: "800",
		color: "#ffffff",
	},
	seriesMetaText: {
		fontSize: 13,
		fontWeight: "600",
	},
	topTrailerSection: {
		marginBottom: 16,
	},
	seriesOverviewText: {
		fontSize: 13,
		lineHeight: 19,
		marginBottom: 14,
	},
	genreChipsRow: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: 8,
		marginBottom: 16,
	},
	genreChip: {
		paddingHorizontal: 14,
		paddingVertical: 6,
		borderRadius: 8,
		borderWidth: 1,
	},
	genreChipText: {
		fontSize: 12,
		fontWeight: "600",
	},
	seriesActionRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		marginBottom: 20,
	},
	seriesActionButton: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 6,
		paddingVertical: 12,
		borderRadius: 12,
		borderWidth: 1,
	},
	seriesActionText: {
		fontSize: 13,
		fontWeight: "700",
	},
	floatingBookmark: {
		position: "absolute",
		bottom: 24,
		right: 20,
		width: 50,
		height: 50,
		borderRadius: 16,
		borderWidth: 1.5,
		justifyContent: "center",
		alignItems: "center",
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.4,
		shadowRadius: 8,
		elevation: 10,
		zIndex: 99,
	},
});
