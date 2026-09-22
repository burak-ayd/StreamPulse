// @components/VerticalMovieCard.jsx
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import {
	Dimensions,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from "react-native";

const { width } = Dimensions.get("window");

const VerticalMovieCard = ({ title, colors, movies, onMoviePress }) => {
	const router = useRouter();

	const handlePress = (item) => {
		if (onMoviePress) {
			onMoviePress(item);
			return;
		}

		let itemData = { ...item };
		const epTitleMatch = (itemData.title || "").match(
			/^(.+?)\s+(\d+)\.\s*Sezon\s+(\d+)\.\s*Bölüm/i,
		);

		if (epTitleMatch) {
			itemData = {
				...itemData,
				seriesTitle: epTitleMatch[1].trim(),
				initialSeason: String(epTitleMatch[2]),
				initialEpisode: String(epTitleMatch[3]),
				is_series: true,
				content_type: "series",
			};
		}

		const id =
			itemData.id ||
			encodeURIComponent(
				itemData.url ||
					itemData.slug ||
					itemData.title,
			);
		router.push({
			pathname: "/(app)/MovieDetails/[id]",
			params: {
				id,
				movieData: JSON.stringify(itemData),
			},
		});
	};

	return (
		<View style={styles.sectionContainer}>
			<View style={styles.sectionHeader}>
				<Text style={[styles.sectionTitle, { color: colors.text }]}>
					{title || "Senin İçin Seçilenler"}
				</Text>
				<TouchableOpacity>
					<Text style={[styles.seeAll, { color: colors.primary }]}>
						Tümünü Gör
					</Text>
				</TouchableOpacity>
			</View>

			{movies.map((item, index) => (
				<TouchableOpacity
					key={item.id || item.url || item.slug || index}
					style={[
						styles.horizontalMovieCard,
						{ backgroundColor: colors.cardBg },
					]}
					activeOpacity={0.8}
					onPress={() => handlePress(item)}>
					<Image
						source={{ uri: item.poster || item.image }}
						style={styles.horizontalPoster}
						contentFit="cover"
						transition={150}
						cachePolicy="memory-disk"
					/>
					<View style={styles.horizontalMovieInfo}>
						<Text
							style={[styles.movieTitle, { color: colors.text }]}
							numberOfLines={1}>
							{item.title}
						</Text>
						<Text
							style={[
								styles.movieGenre,
								{ color: colors.primary },
							]}>
							{item.genre}
						</Text>
						<View style={styles.metaRow}>
							<Ionicons
								name="time-outline"
								size={14}
								color={colors.textSecondary}
							/>
							<Text
								style={[
									styles.horizontalMetaText,
									{ color: colors.textSecondary },
								]}>
								{item.duration}
							</Text>
							<View style={styles.metaSeparator} />
							<Ionicons
								name="star"
								size={14}
								color="#FFD700"
							/>
							<Text
								style={[
									styles.horizontalMetaText,
									{ color: colors.text },
								]}>
								{item.rating}
							</Text>
						</View>
					</View>
					<TouchableOpacity
						style={[
							styles.playButton,
							{ backgroundColor: colors.primary },
						]}>
						<Ionicons
							name="play"
							size={20}
							color="#ffffff"
						/>
					</TouchableOpacity>
				</TouchableOpacity>
			))}
		</View>
	);
};

export default VerticalMovieCard;

const styles = StyleSheet.create({
	sectionContainer: { marginBottom: 28 },
	sectionHeader: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		paddingHorizontal: 20,
		marginVertical: 16,
	},
	sectionTitle: { fontSize: 18, fontWeight: "bold" },

	seeAll: { fontSize: 13, fontWeight: "600" },
	horizontalMovieCard: {
		flexDirection: "row",
		marginHorizontal: 20,
		marginBottom: 12,
		borderRadius: 16,
		overflow: "hidden",
		padding: 12,
		alignItems: "center",
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.05,
		shadowRadius: 4,
		elevation: 2,
	},
	horizontalPoster: {
		width: 70,
		height: 90,
		borderRadius: 8,
		backgroundColor: "#333",
	},
	horizontalMovieInfo: { flex: 1, marginLeft: 16, justifyContent: "center" },

	movieTitle: { fontSize: 14, fontWeight: "bold", marginBottom: 4 },
	movieGenre: {
		fontSize: 12,
		fontWeight: "500",
		marginBottom: 6,
		marginTop: 2,
	},
	metaRow: { flexDirection: "row", alignItems: "center", gap: 4 },
	horizontalMetaText: { fontSize: 11, fontWeight: "500" },
	metaSeparator: {
		width: 4,
		height: 4,
		borderRadius: 2,
		backgroundColor: "#9ca3af",
		marginHorizontal: 4,
	},
	playButton: {
		width: 36,
		height: 36,
		borderRadius: 18,
		justifyContent: "center",
		alignItems: "center",
		marginLeft: 10,
	},
});
