import TVPressable from "@components/common/TVPressable";
import { FontFamily, Palette } from "@/constants/theme";
import { useTvMetrics } from "@/utils/tvMetrics";
import { fetchRelatedContent as getRelatedApiContent } from "@/services/api";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import Image from "@/components/common/SmartImage";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

/**
 * RelatedContent – "Benzer İçerikler" şeridi.
 * Eklentiden gelen `related` listesi varsa API çağrısı yapılmaz.
 */
export default function RelatedContent({
	contentType,
	currentId,
	pluginRelated,
}) {
	const router = useRouter();
	const { sp, gutter } = useTvMetrics();

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

	const cardWidth = sp(140);

	return (
		<View style={[styles.container, { marginBottom: sp(28), gap: sp(12) }]}>
			<Text style={[styles.sectionTitle, { fontSize: sp(18) }]}>
				Benzer İçerikler
			</Text>

			<ScrollView
				horizontal
				showsHorizontalScrollIndicator={false}
				removeClippedSubviews={false}
				contentContainerStyle={[
					styles.scrollContent,
					{ gap: sp(14), paddingRight: gutter },
				]}>
				{displayList.map((item, index) => {
					const posterUri = item.poster_url || item.poster || item.image;
					const rating = Number(item.rating);
					const meta = [item.year || item.release_date, item.category]
						.filter(Boolean)
						.join(" · ");

					return (
						<TVPressable
							key={item.id || item.url || index}
							style={[styles.contentCard, { width: cardWidth }]}
							focusedStyle={styles.focusRing}
							onPress={() => handleContentPress(item)}
							activeOpacity={0.8}>
							<View
								style={[
									styles.posterContainer,
									{
										width: cardWidth,
										height: Math.round(cardWidth * 1.5),
										borderRadius: sp(12),
										marginBottom: sp(8),
									},
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
									<View style={styles.posterPlaceholder}>
										<Ionicons
											name="film-outline"
											size={sp(32)}
											color={Palette.onSurfaceVariant}
										/>
									</View>
								)}

								{Number.isFinite(rating) && rating > 0 ? (
									<View style={styles.ratingBadge}>
										<Ionicons
											name="star"
											size={sp(11)}
											color={Palette.tertiary}
										/>
										<Text
											style={[
												styles.ratingText,
												{ fontSize: sp(11) },
											]}>
											{rating.toFixed(1)}
										</Text>
									</View>
								) : null}
							</View>

							<Text
								style={[styles.contentTitle, { fontSize: sp(13.5) }]}
								numberOfLines={1}>
								{item.title || item.name}
							</Text>
							{meta ? (
								<Text
									style={[styles.contentMeta, { fontSize: sp(12) }]}
									numberOfLines={1}>
									{meta}
								</Text>
							) : null}
						</TVPressable>
					);
				})}
			</ScrollView>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {},
	sectionTitle: {
		color: Palette.onSurface,
		fontFamily: FontFamily.semiBold,
	},
	scrollContent: {
		flexDirection: "row",
	},
	contentCard: {},
	posterContainer: {
		overflow: "hidden",
		backgroundColor: Palette.surfaceHigh,
	},
	poster: {
		width: "100%",
		height: "100%",
	},
	posterPlaceholder: {
		width: "100%",
		height: "100%",
		alignItems: "center",
		justifyContent: "center",
	},
	ratingBadge: {
		position: "absolute",
		top: 6,
		right: 6,
		flexDirection: "row",
		alignItems: "center",
		gap: 3,
		paddingHorizontal: 6,
		paddingVertical: 2,
		borderRadius: 999,
		backgroundColor: "rgba(14,14,16,0.9)",
	},
	ratingText: {
		color: Palette.tertiary,
		fontFamily: FontFamily.bold,
	},
	contentTitle: {
		color: Palette.onSurface,
		fontFamily: FontFamily.medium,
	},
	contentMeta: {
		color: Palette.onSurfaceVariant,
		fontFamily: FontFamily.regular,
		marginTop: 2,
	},
	focusRing: {
		borderWidth: 2,
		borderColor: Palette.primary,
		borderRadius: 12,
	},
});
