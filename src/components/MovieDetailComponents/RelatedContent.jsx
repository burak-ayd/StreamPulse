import TVPressable from "@components/common/TVPressable";
import { useThemeContext } from "@context/ThemeContext";
import { fetchRelatedContent as getRelatedApiContent } from "@/services/api";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
	ScrollView,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from "react-native";

/**
 * RelatedContent – Benzer İçerikler bölümü.
 * Mockup tasarımındaki kırmızı accent çizgisi ve modern kart stiliyle.
 */
export default function RelatedContent({
	contentType,
	currentId,
	pluginRelated,
}) {
	const { colors, theme } = useThemeContext();
	const router = useRouter();

	const hasPluginRelated = Array.isArray(pluginRelated) && pluginRelated.length > 0;
	const [apiRelated, setApiRelated] = useState([]);
	const [loading, setLoading] = useState(!hasPluginRelated);

	useEffect(() => {
		// Eğer eklentiden gelen benzer içerikler varsa harici API çağrısı yapma
		if (hasPluginRelated) {
			setLoading(false);
			return;
		}

		let isMounted = true;
		const fetchRelated = async () => {
			if (!currentId || typeof getRelatedApiContent !== "function") {
				if (isMounted) setLoading(false);
				return;
			}
			try {
				setLoading(true);
				const data = await getRelatedApiContent(contentType, currentId);
				if (isMounted) {
					setApiRelated(Array.isArray(data) ? data : []);
				}
			} catch (error) {
				console.error("Error fetching related content:", error);
			} finally {
				if (isMounted) setLoading(false);
			}
		};

		fetchRelated();
		return () => {
			isMounted = false;
		};
	}, [contentType, currentId, hasPluginRelated]);

	const displayList = hasPluginRelated ? pluginRelated : apiRelated;

	if (loading || !displayList || displayList.length === 0) return null;

	const handleContentPress = (item) => {
		if (item.url) {
			router.push({
				pathname: `/(app)/MovieDetails/${encodeURIComponent(item.id || item.url)}`,
				params: {
					movieData: JSON.stringify(item),
					url: item.url,
					plugin: item.plugin,
				},
			});
		} else if (item.id) {
			router.push(`/(app)/MovieDetails/${item.id}`);
		}
	};

	const surfaceBorder = theme === "dark" ? "#232A36" : "#E2E8F0";

	return (
		<View style={styles.container}>
			{/* Section Title with red accent bar */}
			<View style={styles.titleRow}>
				<View style={styles.accentBar} />
				<Text style={[styles.sectionTitle, { color: colors.text }]}>
					Benzer İçerikler
				</Text>
			</View>

			<ScrollView
				horizontal
				showsHorizontalScrollIndicator={false}
				removeClippedSubviews={false}
				contentContainerStyle={styles.scrollContent}>
				{displayList.map((item, index) => {
					const posterUri =
						item.poster_url || item.poster || item.image;

					return (
						<TVPressable
							key={item.id || item.url || index}
							style={({ focused }) => [
								styles.contentCard,
								focused && styles.contentCardFocused,
							]}
							onPress={() => handleContentPress(item)}
							activeOpacity={0.8}>
							{({ focused }) => (
								<>
									<View
										style={[
											styles.posterContainer,
											{ borderColor: surfaceBorder },
											focused && styles.posterContainerFocused,
										]}>
										{posterUri ? (
											<Image
												source={{ uri: posterUri }}
												style={styles.poster}
												contentFit="cover"
												contentPosition="center"
												transition={0}
												recyclingKey={posterUri}
												cachePolicy="memory-disk"
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
													color="#FBBF24"
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
										{item.title || item.name}
									</Text>
								</>
							)}
						</TVPressable>
					);
				})}
			</ScrollView>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		marginBottom: 24,
	},
	titleRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		marginBottom: 14,
	},
	accentBar: {
		width: 4,
		height: 22,
		borderRadius: 2,
		backgroundColor: "#E50914",
	},
	sectionTitle: {
		fontSize: 18,
		fontWeight: "700",
		letterSpacing: -0.2,
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
		height: 175,
		borderRadius: 14,
		overflow: "hidden",
		marginBottom: 8,
		borderWidth: 1,
		backgroundColor: "rgba(0,0,0,0.2)",
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
		top: 6,
		left: 6,
		flexDirection: "row",
		alignItems: "center",
		gap: 3,
		backgroundColor: "rgba(0, 0, 0, 0.75)",
		paddingHorizontal: 6,
		paddingVertical: 3,
		borderRadius: 6,
	},
	ratingText: {
		color: "#FBBF24",
		fontSize: 11,
		fontWeight: "700",
	},
	contentTitle: {
		fontSize: 13,
		fontWeight: "600",
		lineHeight: 18,
	},
	contentCardFocused: {
		transform: [{ scale: 1.08 }],
	},
	posterContainerFocused: {
		borderColor: "#E50914",
		borderWidth: 2,
	},
});
