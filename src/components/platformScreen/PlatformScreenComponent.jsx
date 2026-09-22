import {
	fetchPlatformCategories,
	fetchPlatformMainPage,
	fetchRandomContents,
} from "@/services/api";
import FeaturedCarousel from "@components/FeaturedCarousel";
import HorizontalMovieCard from "@components/HorizontalMovieCard";
import { useThemeContext } from "@context/ThemeContext";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
	ActivityIndicator,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from "react-native";

/**
 * Her kategori için içeriği bağımsız çeken ve listeleyen bileşen
 */
const CategoryMovieSection = ({
	platformName,
	category,
	colors,
	onMoviePress,
}) => {
	const [movies, setMovies] = useState([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let isMounted = true;

		async function loadCategoryMovies() {
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
	}, [platformName, category.url]);

	if (loading) {
		return (
			<View style={styles.sectionLoading}>
				<ActivityIndicator size="small" color={colors.primary} />
			</View>
		);
	}

	if (!movies || movies.length === 0) {
		return null;
	}

	return (
		<HorizontalMovieCard
			title={category.name}
			colors={colors}
			movies={movies}
			onMoviePress={onMoviePress}
		/>
	);
};

const PlatformScreenComponent = ({ platform }) => {
	const router = useRouter();
	const { colors } = useThemeContext();
	const [loading, setLoading] = useState(true);
	const [categories, setCategories] = useState([]);
	const [visibleCount, setVisibleCount] = useState(5);
	const [randomMovies, setRandomMovies] = useState([]);

	const handleMoviePress = (movie) => {
		let movieWithPlugin = {
			...movie,
			plugin: movie.plugin || platform?.name,
		};

		// Eğer başlık bir dizi bölümü formatındaysa (örn: "Dizi Adı 3.Sezon 8.Bölüm")
		const epTitleMatch = (movieWithPlugin.title || "").match(
			/^(.+?)\s+(\d+)\.\s*Sezon\s+(\d+)\.\s*Bölüm/i,
		);

		if (epTitleMatch) {
			movieWithPlugin = {
				...movieWithPlugin,
				seriesTitle: epTitleMatch[1].trim(),
				initialSeason: String(epTitleMatch[2]),
				initialEpisode: String(epTitleMatch[3]),
				is_series: true,
				content_type: "series",
			};
		}

		const movieId =
			movieWithPlugin.id ||
			encodeURIComponent(
				movieWithPlugin.url ||
					movieWithPlugin.slug ||
					movieWithPlugin.title,
			);
		router.push({
			pathname: "/(app)/MovieDetails/[id]",
			params: {
				id: movieId,
				movieData: JSON.stringify(movieWithPlugin),
			},
		});
	};

	// 1. Kategorileri Yükle
	useEffect(() => {
		let isMounted = true;

		async function loadCategories() {
			try {
				setLoading(true);
				const res = await fetchPlatformCategories(platform?.name);
				const list = res?.categories || (Array.isArray(res) ? res : []);

				if (isMounted) {
					setCategories(list);
				}
			} catch (error) {
				console.error("Kategoriler yüklenirken hata:", error);
			} finally {
				if (isMounted) {
					setLoading(false);
				}
			}
		}

		if (platform?.name) {
			loadCategories();
		}

		return () => {
			isMounted = false;
		};
	}, [platform?.name]);

	// 2. Rastgele Filmleri (Featured) Yükle
	useEffect(() => {
		let isMounted = true;

		async function loadRandomMovies() {
			try {
				const res = await fetchRandomContents(platform?.name);
				if (isMounted) {
					setRandomMovies(res);
				}
			} catch (error) {
				console.error("Rastgele içerikler yüklenirken hata:", error);
			}
		}

		if (platform?.name) {
			loadRandomMovies();
		}

		return () => {
			isMounted = false;
		};
	}, [platform?.name]);

	// 3. Yükleme durumu kontrolü (tüm Hook'lardan sonra!)
	if (loading) {
		return (
			<View style={styles.loadingContainer}>
				<ActivityIndicator size="large" color={colors.primary} />
			</View>
		);
	}

	const visibleCategories = categories.slice(0, visibleCount);

	return (
		<View style={styles.container}>
			{randomMovies && randomMovies.length > 0 && (
				<FeaturedCarousel
					movies={randomMovies}
					oneMovieCard={true}
					onPress={handleMoviePress}
				/>
			)}
			{visibleCategories.map((category, index) => (
				<CategoryMovieSection
					key={category.url || category.name || index}
					platformName={platform?.name}
					category={category}
					colors={colors}
					onMoviePress={handleMoviePress}
				/>
			))}

			{visibleCount < categories.length && (
				<View style={styles.loadMoreContainer}>
					<TouchableOpacity
						style={[
							styles.loadMoreButton,
							{
								backgroundColor: colors.cardBg,
								borderColor: colors.border,
							},
						]}
						onPress={() => setVisibleCount((prev) => prev + 5)}>
						<Text
							style={[
								styles.loadMoreText,
								{ color: colors.primary },
							]}>
							Daha Fazla Kategori Göster (
							{categories.length - visibleCount})
						</Text>
					</TouchableOpacity>
				</View>
			)}
		</View>
	);
};

export default PlatformScreenComponent;

const styles = StyleSheet.create({
	container: {
		paddingVertical: 10,
	},
	loadingContainer: {
		paddingVertical: 40,
		alignItems: "center",
		justifyContent: "center",
	},
	sectionLoading: {
		height: 120,
		alignItems: "center",
		justifyContent: "center",
	},
	loadMoreContainer: {
		padding: 20,
		alignItems: "center",
	},
	loadMoreButton: {
		paddingVertical: 12,
		paddingHorizontal: 24,
		borderRadius: 20,
		borderWidth: 1,
	},
	loadMoreText: {
		fontWeight: "600",
		fontSize: 14,
	},
});
