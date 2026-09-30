import ContinueWatchingCard from "@/components/content/ContinueWatchingCard";
import { Ionicons } from "@react-native-vector-icons/ionicons";
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
	onRemoveItem,
	onSeeAllPress,
}) {
	if (!items || items.length === 0) {
		return null;
	}

	return (
		<View style={styles.container}>
			{/* Section Header */}
			<View style={styles.header}>
				<View style={styles.headerLeft}>
					<View style={styles.headerAccent} />
					<Text style={styles.headerTitle}>
						Kaldığın Yerden Devam Et
					</Text>
				</View>
				{onSeeAllPress && (
					<TouchableOpacity
						onPress={onSeeAllPress}
						style={styles.seeAllButton}
						activeOpacity={0.7}>
						<Text style={styles.seeAllText}>Tümü</Text>
						<Ionicons
							name="chevron-forward"
							size={16}
							color="#9CA3AF"
						/>
					</TouchableOpacity>
				)}
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
				renderItem={({ item }) => (
					<ContinueWatchingCard
						item={item}
						onPress={onItemPress}
						onRemove={onRemoveItem}
					/>
				)}
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		marginTop: 8,
		marginBottom: 20,
	},
	header: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		paddingHorizontal: 18,
		marginBottom: 12,
	},
	headerLeft: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
	},
	headerAccent: {
		width: 3.5,
		height: 16,
		borderRadius: 2,
		backgroundColor: "#FF3B30",
	},
	headerTitle: {
		color: "#FFFFFF",
		fontSize: 17,
		fontWeight: "700",
		letterSpacing: -0.3,
	},
	seeAllButton: {
		flexDirection: "row",
		alignItems: "center",
		gap: 2,
		paddingVertical: 4,
		paddingHorizontal: 6,
	},
	seeAllText: {
		color: "#9CA3AF",
		fontSize: 13,
		fontWeight: "600",
	},
	listContent: {
		paddingHorizontal: 18,
	},
});
