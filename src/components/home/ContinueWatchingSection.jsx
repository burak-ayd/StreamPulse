import { Ionicons } from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import React, { useState } from "react";
import {
	FlatList,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from "react-native";

export default function ContinueWatchingSection({
	items = [],
	onItemPress,
	onSeeAllPress,
}) {
	const [activeFilter, setActiveFilter] = useState("planned"); // 'watching' | 'planned'

	if (!items || items.length === 0) {
		return null;
	}

	return (
		<View style={styles.container}>
			{/* Section Header */}
			<View style={styles.header}>
				<Text style={styles.headerTitle}>İzlemeye Devam Et</Text>
				<TouchableOpacity
					onPress={onSeeAllPress}
					style={styles.arrowButton}
					activeOpacity={0.7}>
					<Ionicons name="arrow-forward" size={18} color="#ffffff" />
				</TouchableOpacity>
			</View>

			{/* Horizontal List */}
			<FlatList
				data={items}
				keyExtractor={(item, index) =>
					item.id || item.url || `continue-${index}`
				}
				horizontal
				showsHorizontalScrollIndicator={false}
				contentContainerStyle={styles.listContent}
				renderItem={({ item }) => {
					const posterUri =
						item.backdrop_url ||
						item.backdrop ||
						item.thumbnail ||
						item.image ||
						item.poster_url ||
						item.poster ||
						"https://images.unsplash.com/photo-1534447677768-be436bb09401?w=800&auto=format&fit=crop&q=60";
					const duration =
						item.durationText ||
						(item.currentTime
							? `${Math.floor(item.currentTime / 60)}:${String(
									Math.floor(item.currentTime % 60),
								).padStart(2, "0")}`
							: "91:8s");

					return (
						<TouchableOpacity
							style={styles.cardContainer}
							onPress={() => onItemPress?.(item)}
							activeOpacity={0.8}>
							{/* Thumbnail Wrapper */}
							<View style={styles.thumbnailWrapper}>
								<Image
									source={{ uri: posterUri }}
									style={styles.thumbnail}
									contentFit="cover"
									contentPosition="center"
									transition={150}
									cachePolicy="memory-disk"
								/>
								<View style={styles.overlay} />

								{/* Center Play Button */}
								<View style={styles.playButtonCircle}>
									<Ionicons
										name="play"
										size={16}
										color="#ffffff"
										style={{ marginLeft: 2 }}
									/>
								</View>

								{/* Time Indicator Badge */}
								<View style={styles.timeBadge}>
									<Text style={styles.timeText}>
										{duration}
									</Text>
								</View>
							</View>

							{/* Title */}
							<Text style={styles.cardTitle} numberOfLines={1}>
								{item.title}
							</Text>
						</TouchableOpacity>
					);
				}}
			/>

			{/* Filter Pills Row */}
			<View style={styles.filtersRow}>
				<View style={styles.filterPillsGroup}>
					<TouchableOpacity
						style={[
							styles.filterPill,
							activeFilter === "watching"
								? styles.filterPillActive
								: styles.filterPillInactive,
						]}
						onPress={() => setActiveFilter("watching")}
						activeOpacity={0.7}>
						<Text
							style={[
								styles.filterPillText,
								activeFilter === "watching"
									? styles.filterPillTextActive
									: styles.filterPillTextInactive,
							]}>
							İzleniyor
						</Text>
					</TouchableOpacity>

					<TouchableOpacity
						style={[
							styles.filterPill,
							activeFilter === "planned"
								? styles.filterPillActive
								: styles.filterPillInactive,
						]}
						onPress={() => setActiveFilter("planned")}
						activeOpacity={0.7}>
						<Text
							style={[
								styles.filterPillText,
								activeFilter === "planned"
									? styles.filterPillTextActive
									: styles.filterPillTextInactive,
							]}>
							Planlandı
						</Text>
					</TouchableOpacity>
				</View>

				<TouchableOpacity
					onPress={onSeeAllPress}
					style={styles.arrowButton}
					activeOpacity={0.7}>
					<Ionicons name="arrow-forward" size={18} color="#ffffff" />
				</TouchableOpacity>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		marginTop: 8,
		marginBottom: 16,
	},
	header: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		paddingHorizontal: 18,
		marginBottom: 12,
	},
	headerTitle: {
		color: "#ffffff",
		fontSize: 16,
		fontWeight: "700",
		letterSpacing: -0.2,
	},
	arrowButton: {
		padding: 4,
	},
	listContent: {
		paddingHorizontal: 18,
		gap: 12,
	},
	cardContainer: {
		width: 155,
	},
	thumbnailWrapper: {
		width: 155,
		height: 96,
		borderRadius: 10,
		overflow: "hidden",
		position: "relative",
		backgroundColor: "#1c1e24",
	},
	thumbnail: {
		width: "100%",
		height: "100%",
		borderRadius: 10,
		overflow: "hidden",
	},
	overlay: {
		...StyleSheet.absoluteFillObject,
		backgroundColor: "rgba(0, 0, 0, 0.25)",
	},
	playButtonCircle: {
		position: "absolute",
		top: "50%",
		left: "50%",
		transform: [{ translateX: -17 }, { translateY: -17 }],
		width: 34,
		height: 34,
		borderRadius: 17,
		backgroundColor: "rgba(0, 0, 0, 0.6)",
		borderWidth: 1,
		borderColor: "rgba(255, 255, 255, 0.3)",
		justifyContent: "center",
		alignItems: "center",
	},
	timeBadge: {
		position: "absolute",
		bottom: 6,
		right: 6,
		backgroundColor: "rgba(0, 0, 0, 0.7)",
		paddingHorizontal: 5,
		paddingVertical: 2,
		borderRadius: 4,
	},
	timeText: {
		color: "#E5E7EB",
		fontSize: 10,
		fontWeight: "600",
	},
	cardTitle: {
		color: "#ffffff",
		fontSize: 12,
		fontWeight: "600",
		marginTop: 6,
	},
	filtersRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		paddingHorizontal: 18,
		marginTop: 14,
	},
	filterPillsGroup: {
		flexDirection: "row",
		gap: 8,
	},
	filterPill: {
		paddingHorizontal: 14,
		paddingVertical: 6,
		borderRadius: 8,
	},
	filterPillActive: {
		backgroundColor: "#2563EB",
	},
	filterPillInactive: {
		backgroundColor: "#1a1d24",
		borderWidth: 1,
		borderColor: "rgba(255, 255, 255, 0.08)",
	},
	filterPillText: {
		fontSize: 12,
		fontWeight: "600",
	},
	filterPillTextActive: {
		color: "#ffffff",
	},
	filterPillTextInactive: {
		color: "#9ca3af",
	},
});
