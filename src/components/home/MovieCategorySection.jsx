import { fetchPlatformMainPage, getCachedCategoryMovies } from "@/services/api";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import { useEffect, useState } from "react";
import {
	ActivityIndicator,
	FlatList,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from "react-native";

export default function MovieCategorySection({
	platformName,
	category,
	onMoviePress,
	onSeeAll,
}) {
	const initialCached = getCachedCategoryMovies(platformName, category?.url);
	const [movies, setMovies] = useState(initialCached || []);
	const [loading, setLoading] = useState(
		!initialCached || initialCached.length === 0,
	);

	useEffect(() => {
		let isMounted = true;

		async function loadCategoryMovies() {
			const currentCached = getCachedCategoryMovies(
				platformName,
				category?.url,
			);
			if (currentCached && currentCached.length > 0) {
				if (isMounted) {
					setMovies(currentCached);
					setLoading(false);
				}
				return;
			}

			try {
				setLoading(true);
				const data = await fetchPlatformMainPage(
					platformName,
					category.url,
				);
				const items = Array.isArray(data)
					? data
					: data?.results || data?.data || [];

				if (isMounted) {
					setMovies(items);
				}
			} catch (error) {
				console.error(
					`[${category.name}] içerikleri yüklenirken hata:`,
					error,
				);
			} finally {
				if (isMounted) {
					setLoading(false);
				}
			}
		}

		if (platformName && category?.url) {
			loadCategoryMovies();
		}

		return () => {
			isMounted = false;
		};
	}, [platformName, category?.url, category?.name]);

	if (loading) {
		return (
			<View style={styles.loadingContainer}>
				<ActivityIndicator size="small" color="#2563EB" />
			</View>
		);
	}

	if (!movies || movies.length === 0) {
		return null;
	}

	return (
		<View style={styles.sectionContainer}>
			{/* Section Header */}
			<View style={styles.sectionHeader}>
				<Text style={styles.sectionTitle}>{category.name}</Text>
				<TouchableOpacity
					onPress={() => onSeeAll?.(category)}
					style={styles.arrowButton}
					activeOpacity={0.7}>
					<Ionicons name="arrow-forward" size={18} color="#ffffff" />
				</TouchableOpacity>
			</View>

			{/* Horizontal List of Cards */}
			<FlatList
				data={movies}
				keyExtractor={(item, index) =>
					item.id || item.url || `${category.name}-${index}`
				}
				horizontal
				showsHorizontalScrollIndicator={false}
				contentContainerStyle={styles.horizontalList}
				initialNumToRender={5}
				maxToRenderPerBatch={5}
				windowSize={3}
				renderItem={({ item }) => {
					const posterUri =
						item.poster ||
						item.poster_url ||
						item.image ||
						item.backdrop_url ||
						"https://images.unsplash.com/photo-1534447677768-be436bb09401?w=800&auto=format&fit=crop&q=60";
					const rating = item.rating ? String(item.rating) : null;

					return (
						<TouchableOpacity
							style={styles.cardContainer}
							activeOpacity={0.8}
							onPress={() => onMoviePress(item)}>
							{/* Poster Image Container */}
							<View style={styles.posterWrapper}>
								<Image
									source={{ uri: posterUri }}
									style={styles.poster}
									contentFit="cover"
									contentPosition="center"
									transition={150}
									cachePolicy="memory-disk"
								/>

								{/* Top-left Rating Badge */}
								{rating && (
									<View style={styles.ratingBadge}>
										<Ionicons
											name="star"
											size={10}
											color="#FFD700"
										/>
										<Text style={styles.ratingText}>
											{rating}
										</Text>
									</View>
								)}
							</View>

							{/* Title */}
							<Text style={styles.movieTitle} numberOfLines={1}>
								{item.title}
							</Text>
						</TouchableOpacity>
					);
				}}
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	sectionContainer: {
		marginBottom: 22,
	},
	sectionHeader: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		paddingHorizontal: 18,
		marginBottom: 10,
	},
	sectionTitle: {
		color: "#ffffff",
		fontSize: 16,
		fontWeight: "700",
		letterSpacing: -0.2,
	},
	arrowButton: {
		padding: 4,
	},
	horizontalList: {
		paddingHorizontal: 18,
		gap: 4,
	},
	cardContainer: {
		width: 124,
	},
	posterWrapper: {
		width: 124,
		height: 182,
		borderRadius: 12,
		overflow: "hidden",
		backgroundColor: "#1c1e24",
		position: "relative",
	},
	poster: {
		width: "100%",
		height: "100%",
		borderRadius: 12,
		overflow: "hidden",
	},
	ratingBadge: {
		position: "absolute",
		top: 6,
		left: 6,
		backgroundColor: "rgba(0, 0, 0, 0.75)",
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: 6,
		paddingVertical: 3,
		borderRadius: 12,
		gap: 3,
		borderWidth: 1,
		borderColor: "rgba(255, 255, 255, 0.1)",
	},
	ratingText: {
		color: "#ffffff",
		fontSize: 10,
		fontWeight: "700",
	},
	movieTitle: {
		color: "#ffffff",
		fontSize: 13,
		fontWeight: "600",
		marginTop: 6,
		letterSpacing: -0.1,
	},
	loadingContainer: {
		height: 140,
		justifyContent: "center",
		alignItems: "center",
	},
});
