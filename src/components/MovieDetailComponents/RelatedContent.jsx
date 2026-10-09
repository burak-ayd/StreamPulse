import TVPressable from "@components/common/TVPressable";
import { useThemeContext } from "@context/ThemeContext";
import { useTvMetrics } from "@/utils/tvMetrics";
import { fetchRelatedContent as getRelatedApiContent } from "@/services/api";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import Image from "@/components/common/SmartImage";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
	ScrollView,
	StyleSheet,
	Text,
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
	const { sp, gutter, focusScale } = useTvMetrics();

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
		<View style={[styles.container, { marginBottom: sp(28) }]}>
			{/* Section Title with red accent bar */}
			<View
				style={[styles.titleRow, { gap: sp(12), marginBottom: sp(16) }]}>
				<View
					style={[
						styles.accentBar,
						{ width: sp(5), height: sp(26), borderRadius: sp(3) },
					]}
				/>
				<Text
					style={[
						styles.sectionTitle,
						{ color: colors.text, fontSize: sp(21) },
					]}>
					Benzer İçerikler
				</Text>
			</View>

			<ScrollView
				horizontal
				showsHorizontalScrollIndicator={false}
				removeClippedSubviews={false}
				contentContainerStyle={[
					styles.scrollContent,
					{ gap: sp(14), paddingRight: 20 + gutter },
				]}>
				{displayList.map((item, index) => {
					const posterUri =
						item.poster_url || item.poster || item.image;

					return (
						<TVPressable
							key={item.id || item.url || index}
							style={({ focused }) => [
								styles.contentCard,
								{ width: sp(140) },
								focused && {
									transform: [{ scale: focusScale }],
								},
							]}
							onPress={() => handleContentPress(item)}
							activeOpacity={0.8}>
							{({ focused }) => (
								<>
									<View
										style={[
											styles.posterContainer,
											{
												borderColor: surfaceBorder,
												width: sp(140),
												height: sp(204),
												borderRadius: sp(16),
												marginBottom: sp(10),
											},
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
													size={sp(36)}
													color={colors.textSecondary}
												/>
											</View>
										)}

										{item.rating && (
											<View
												style={[
													styles.ratingBadge,
													{
														top: sp(7),
														left: sp(7),
														paddingHorizontal: sp(7),
														paddingVertical: sp(3),
														borderRadius: sp(8),
													},
												]}>
												<Ionicons
													name="star"
													size={sp(12)}
													color="#FBBF24"
												/>
												<Text
													style={[
														styles.ratingText,
														{ fontSize: sp(13) },
													]}>
													{Number(item.rating).toFixed(1)}
												</Text>
											</View>
										)}
									</View>

									<Text
										style={[
											styles.contentTitle,
											{
												color: colors.text,
												fontSize: sp(15),
												lineHeight: sp(20),
											},
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
	container: {},
	titleRow: {
		flexDirection: "row",
		alignItems: "center",
	},
	accentBar: {
		backgroundColor: "#E50914",
	},
	sectionTitle: {
		fontWeight: "700",
		letterSpacing: -0.2,
	},
	scrollContent: {},
	contentCard: {},
	posterContainer: {
		overflow: "hidden",
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
		flexDirection: "row",
		alignItems: "center",
		gap: 3,
		backgroundColor: "rgba(0, 0, 0, 0.75)",
	},
	ratingText: {
		color: "#FBBF24",
		fontWeight: "700",
	},
	contentTitle: {
		fontWeight: "600",
	},
	posterContainerFocused: {
		borderColor: "#E50914",
		borderWidth: 2,
	},
});
