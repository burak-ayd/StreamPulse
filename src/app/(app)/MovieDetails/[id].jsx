import { useThemeContext } from "@context/ThemeContext";
import { useContentDetails } from "@hooks/useContentDetails";
import { Stack, useLocalSearchParams } from "expo-router";
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
import TrailerSection from "@components/MovieDetailComponents/TrailerSection";

/**
 * Movie/Series Details Screen
 * Dynamic route: /(app)/MovieDetails/[id]
 *
 * Displays comprehensive information about a movie or series from API
 */
export default function MovieDetailsScreen() {
	const { id } = useLocalSearchParams();
	const { colors } = useThemeContext();
	const { content, loading, error, refetch } = useContentDetails(id);

	// Loading state
	if (loading) {
		return <LoadingState />;
	}

	// Error state
	if (error) {
		return <ErrorState error={error} onRetry={refetch} />;
	}

	// Content not found
	if (!content) {
		return <ErrorState error="İçerik bulunamadı" onRetry={refetch} />;
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
