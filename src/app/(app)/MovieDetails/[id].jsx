import { fetchPluginDetail } from "@/services/api";
import { useThemeContext } from "@context/ThemeContext";
import { useContentDetails } from "@hooks/useContentDetails";
import { Stack, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

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

	const { colors } = useThemeContext();

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
		<>
			<Stack.Screen options={{ headerShown: false }} />

			<ScrollView
				style={[styles.container, { backgroundColor: colors.bg }]}
				showsVerticalScrollIndicator={false}>
				{/* Hero Section - Backdrop + Poster + Title */}
				<HeroSection content={content} />

				{/* Content Wrapper */}
				<View style={styles.contentWrapper}>
					{/* Action Buttons - Watch, Add to List, Share, Favorite */}
					<ActionButtons content={content} />

					{/* Metadata - Rating, Runtime, Year, Country, etc. */}
					<MetadataSection content={content} />

					{/* Overview - Description */}
					<OverviewSection content={content} />

					{/* Seasons & Episodes Section (Diziler için Sezonlar ve Bölümler) */}
					{(content.content_type === "series" ||
						content.seasons ||
						content.episodes ||
						passedMovie?.is_series) && (
						<SeasonsSection
							seasons={content.seasons}
							episodes={content.episodes}
							loading={pluginLoading && !content.seasons}
							initialSeason={passedMovie?.initialSeason}
							seriesTitle={content.title}
							posterUrl={content.poster_url || content.backdrop_url}
						/>
					)}

					{/* Cast - Actors */}
					{content.cast_members &&
						content.cast_members.length > 0 && (
							<CastSection cast={content.cast_members} />
						)}

					{/* Crew - Director, Creator, Production Company */}
					<CrewSection content={content} />

					{/* Trailer */}
					{content.trailer_url && (
						<TrailerSection trailerUrl={content.trailer_url} />
					)}

					{/* Related Content */}
					<RelatedContent
						contentType={content.content_type}
						currentId={content.id}
					/>
				</View>
			</ScrollView>
		</>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
	},
	contentWrapper: {
		paddingHorizontal: 20,
		paddingBottom: 40,
	},
});
