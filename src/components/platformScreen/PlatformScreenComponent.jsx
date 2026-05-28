import FeaturedCarousel from "@components/FeaturedCarousel";
import HorizontalMovieCard from "@components/HorizontalMovieCard";
import { FEATURED_MOVIES, POPULAR_MOVIES } from "@constants/data";
import { useThemeContext } from "@context/ThemeContext";
import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";

const PlatformScreenComponent = () => {
	const router = useRouter();
	const { theme, colors, toggleTheme } = useThemeContext();
	const movies = POPULAR_MOVIES;

	return (
		<View style={styles.container}>
			{/* carousel gelecek*/}
			<FeaturedCarousel
				movies={FEATURED_MOVIES} // API'nızdan gelen veri
				oneMovieCard={true}
				onPress={(movie) =>
					router.push({
						pathname: "/(app)/detail",
						params: { movie },
					})
				}
			/>
			{/* Yeni eklenen Filmler- Diziler */}
			<HorizontalMovieCard
				title="Yeni Eklenen"
				colors={colors}
				movies={movies}
			/>
			{/* En çok izlenenler */}
			<HorizontalMovieCard
				title="En Çok İzlenenler"
				colors={colors}
				movies={movies}
			/>
			{/* IMDB Top 250 */}
			<HorizontalMovieCard
				title="IMDB Top 250"
				colors={colors}
				movies={movies}
			/>
			{/* Sinemalardaki Yeni Filmler */}
			<HorizontalMovieCard
				title="Sinemalardaki Yeni Filmler"
				colors={colors}
				movies={movies}
			/>
			{/* En Çok İzlenenler - Sinema */}
			<HorizontalMovieCard
				title="En Çok İzlenenler - Sinema"
				colors={colors}
				movies={movies}
			/>
		</View>
	);
};

export default PlatformScreenComponent;

const styles = StyleSheet.create({
	container: {
		paddingVertical: 20,
	},
});
