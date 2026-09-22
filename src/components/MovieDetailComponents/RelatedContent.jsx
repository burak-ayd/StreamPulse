import { useThemeContext } from "@context/ThemeContext";
import { fetchRelatedContent as getRelatedApiContent } from "@/services/api";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
	Image,
	ScrollView,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from "react-native";

export default function RelatedContent({ contentType, currentId }) {
	const { colors } = useThemeContext();
	const router = useRouter();
	const [relatedContent, setRelatedContent] = useState([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		fetchRelated();
	}, [contentType, currentId]);

	const fetchRelated = async () => {
		try {
			setLoading(true);
			const data = await getRelatedApiContent(contentType, currentId);
			setRelatedContent(data || []);
		} catch (error) {
			console.error("Error fetching related content:", error);
		} finally {
			setLoading(false);
		}
	};

	if (loading || relatedContent.length === 0) return null;

	const handleContentPress = (id) => {
		router.push(`/(app)/MovieDetails/${id}`);
	};

	return (
		<View style={styles.container}>
			<Text style={[styles.sectionTitle, { color: colors.text }]}>
				Benzer İçerikler
			</Text>

			<ScrollView
				horizontal
				showsHorizontalScrollIndicator={false}
				contentContainerStyle={styles.scrollContent}>
				{relatedContent.map((item) => (
					<TouchableOpacity
						key={item.id}
						style={styles.contentCard}
						onPress={() => handleContentPress(item.id)}
						activeOpacity={0.8}>
						<View style={styles.posterContainer}>
							{item.poster_url ? (
								<Image
									source={{ uri: item.poster_url }}
									style={styles.poster}
									resizeMode="cover"
								/>
							) : (
								<View
									style={[
										styles.posterPlaceholder,
										{ backgroundColor: colors.cardBg },
									]}>
									<Ionicons
										name="film-outline"
										size={32}
										color={colors.textSecondary}
									/>
								</View>
							)}

							{item.rating && (
								<View style={styles.ratingBadge}>
									<Ionicons
										name="star"
										size={10}
										color="#F5C518"
									/>
									<Text style={styles.ratingText}>
										{Number(item.rating).toFixed(1)}
									</Text>
								</View>
							)}
						</View>

						<Text
							style={[
								styles.contentTitle,
								{ color: colors.text },
							]}
							numberOfLines={2}>
							{item.title}
						</Text>
					</TouchableOpacity>
				))}
			</ScrollView>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		marginBottom: 24,
	},
	sectionTitle: {
		fontSize: 18,
		fontWeight: "700",
		marginBottom: 12,
	},
	scrollContent: {
		gap: 12,
		paddingRight: 20,
	},
	contentCard: {
		width: 120,
	},
	posterContainer: {
		width: 120,
		height: 180,
		borderRadius: 12,
		overflow: "hidden",
		marginBottom: 8,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.3,
		shadowRadius: 6,
		elevation: 6,
	},
	poster: {
		width: "100%",
		height: "100%",
	},
	posterPlaceholder: {
		width: "100%",
		height: "100%",
		justifyContent: "center",
		alignItems: "center",
	},
	ratingBadge: {
		position: "absolute",
		top: 8,
		left: 8,
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		backgroundColor: "rgba(0, 0, 0, 0.75)",
		paddingHorizontal: 6,
		paddingVertical: 4,
		borderRadius: 6,
	},
	ratingText: {
		color: "#F5C518",
		fontSize: 11,
		fontWeight: "700",
	},
	contentTitle: {
		fontSize: 13,
		fontWeight: "600",
		lineHeight: 17,
	},
});
