// src/components/HorizontalMovieCard.jsx

import { MaterialIcons } from "@expo/vector-icons";
import {
	FlatList,
	Image,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from "react-native";

const HorizontalMovieCard = ({ colors, movies, title }) => {
	return (
		<View style={styles.sectionContainer}>
			<View style={styles.sectionHeader}>
				<Text style={[styles.sectionTitle, { color: colors.text }]}>
					{title}
				</Text>
				<TouchableOpacity>
					<Text style={[styles.seeAll, { color: colors.primary }]}>
						Tümünü Gör
					</Text>
				</TouchableOpacity>
			</View>

			<FlatList
				data={movies}
				keyExtractor={(item) => item.id}
				horizontal
				showsHorizontalScrollIndicator={false}
				contentContainerStyle={styles.horizontalList}
				renderItem={({ item }) => (
					<TouchableOpacity
						style={[
							styles.movieCard,
							{ backgroundColor: colors.cardBg },
						]}
						activeOpacity={0.9}>
						<Image
							source={{ uri: item.image }}
							style={styles.moviePoster}
						/>
						<View style={styles.ratingBadge}>
							<MaterialIcons
								name="star"
								size={14}
								color="#FFD700"
							/>
							<Text style={styles.ratingText}>{item.rating}</Text>
						</View>
						<View style={styles.movieInfo}>
							<Text
								style={[
									styles.movieTitle,
									{ color: colors.text },
								]}
								numberOfLines={1}>
								{item.title}
							</Text>
							<Text
								style={[
									styles.movieMeta,
									{ color: colors.textSecondary },
								]}>
								{item.duration} • {item.genre.split(" / ")[0]}
							</Text>
						</View>
					</TouchableOpacity>
				)}
			/>
		</View>
	);
};

export default HorizontalMovieCard;

const styles = StyleSheet.create({
	movieCard: {
		width: 150,
		borderRadius: 16,
		overflow: "hidden",
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.1,
		shadowRadius: 6,
		elevation: 4,
	},
	moviePoster: { width: "100%", height: 200, backgroundColor: "#333" },
	ratingBadge: {
		position: "absolute",
		top: 10,
		left: 10,
		backgroundColor: "rgba(0, 0, 0, 0.75)",
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: 8,
		paddingVertical: 4,
		borderRadius: 20,
		gap: 4,
	},
	ratingText: { color: "#ffffff", fontSize: 11, fontWeight: "bold" },
	horizontalList: { paddingHorizontal: 20, gap: 16 },
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
	movieInfo: { padding: 12 },
	movieTitle: { fontSize: 14, fontWeight: "bold", marginBottom: 4 },
	movieMeta: { fontSize: 11 },
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
});
