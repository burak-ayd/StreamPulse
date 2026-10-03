import LanguageBadge from "@/components/common/LanguageBadge";
import TVPressable from "@/components/common/TVPressable";
import { fetchPlatformMainPage, getCachedCategoryMovies } from "@/services/api";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import { memo, useEffect, useState } from "react";
import {
	ActivityIndicator,
	FlatList,
	StyleSheet,
	Text,
	View,
} from "react-native";

/**
 * memo: üst bileşen (ana sayfa) yeniden render olduğunda, prop'ları değişmeyen
 * kategori satırları yeniden render olmaz. index.jsx'deki callback'ler
 * useCallback ile sabitlendiği için bu gerçekten tutarlı çalışır.
 */
function MovieCategorySection({
	platformName,
	category,
	onMoviePress,
	onMovieLongPress,
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
				<TVPressable
					onPress={() => onSeeAll?.(category)}
					style={styles.arrowButton}
					focusedStyle={styles.arrowButtonFocused}>
					<Ionicons name="arrow-forward" size={18} color="#ffffff" />
				</TVPressable>
			</View>

			{/* Horizontal List of Cards */}
			<FlatList
				data={movies}
				keyExtractor={(item, index) =>
					`${item.id || item.url || category?.name || "movie"}-${index}`
				}
				horizontal
				showsHorizontalScrollIndicator={false}
				contentContainerStyle={styles.horizontalList}
				initialNumToRender={5}
				maxToRenderPerBatch={4}
				windowSize={3}
				// TV'de false KALMALI: true, odaklı kartı detache edip kumanda
				// odağını kaybettirir. Sanallaştırma windowSize ile yapılır.
				removeClippedSubviews={false}
				renderItem={({ item }) => {
					const posterUri =
						item.poster ||
						item.poster_url ||
						item.image ||
						item.backdrop_url ||
						"https://images.unsplash.com/photo-1534447677768-be436bb09401?w=800&auto=format&fit=crop&q=60";
					const rating = item.rating ? String(item.rating) : null;
					const movieRawLang =
						item.language ||
						item.languages ||
						item.lang ||
						item.audio ||
						item.subtitles;

					return (
						<TVPressable
							style={styles.cardContainer}
							focusedStyle={styles.cardContainerFocused}
							onPress={() => onMoviePress(item)}
							onLongPress={() => onMovieLongPress?.(item)}>
							{({ focused }) => (
								<View>
									{/* Poster Image Container */}
									<View
										style={[
											styles.posterWrapper,
											focused && styles.posterWrapperFocused,
										]}>
										<Image
											source={{ uri: posterUri }}
											style={styles.poster}
											contentFit="cover"
											contentPosition="center"
											// Sanallaştırılmış listede her kart için crossfade
											// çalıştırmak decode animasyonu kuyruğunu
											// dolduruyor. Glide'ın view-recycling davranışını
											// tetikleyen recyclingKey veriyoruz — CloudStream'in
											// sharedPool mantığının karşılığı.
											recyclingKey={posterUri}
											transition={0}
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

										{/* Bottom-right Language Badge */}
										{movieRawLang ? (
											<LanguageBadge
												language={movieRawLang}
												size="small"
												style={styles.languageBadge}
											/>
										) : null}
									</View>

									{/* Title */}
									<Text
										style={[
											styles.movieTitle,
											focused && styles.movieTitleFocused,
										]}
										numberOfLines={1}>
										{item.title}
									</Text>
								</View>
							)}
						</TVPressable>
					);
				}}
			/>
		</View>
	);
}

export default memo(MovieCategorySection);

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
	arrowButtonFocused: {
		backgroundColor: "rgba(255, 59, 48, 0.35)",
		borderRadius: 12,
		transform: [{ scale: 1.15 }],
	},
	horizontalList: {
		paddingHorizontal: 18,
		gap: 6,
		paddingVertical: 6,
	},
	cardContainer: {
		width: 124,
	},
	cardContainerFocused: {
		// zIndex kaldırıldı: kardeş sıralamasını değiştirmek odak başına
		// ayrı bir commit demek. Ölçek 1.06 ve listedeki 6dp boşluk sayesinde
		// kart komşusunun altına girmez, görsel olarak da yeterince belirgin.
		transform: [{ scale: 1.06 }],
	},
	posterWrapper: {
		width: 124,
		height: 182,
		borderRadius: 12,
		overflow: "hidden",
		backgroundColor: "#1c1e24",
		position: "relative",
		borderWidth: 2,
		borderColor: "transparent",
	},
	posterWrapperFocused: {
		// TV performans: odak anında elevation/shadow DEĞİŞTİRİLMEZ.
		// Android'de elevation değişimi outline/clip-path'i geçersiz kılar ve
		// gölge katmanını yeniden rasterize eder; kumandaya her basışta bunu
		// yapmak geçişleri takılı kılar. Border + arka plan aynı görünümü
		// GPU'da neredeyse bedava verir.
		borderColor: "#FF3B30",
		backgroundColor: "#2a1216",
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
	languageBadge: {
		position: "absolute",
		bottom: 6,
		right: 6,
	},
	movieTitle: {
		color: "#ffffff",
		fontSize: 13,
		fontWeight: "600",
		marginTop: 6,
		letterSpacing: -0.1,
	},
	movieTitleFocused: {
		color: "#FF3B30",
		fontWeight: "700",
	},
	loadingContainer: {
		height: 140,
		justifyContent: "center",
		alignItems: "center",
	},
});
