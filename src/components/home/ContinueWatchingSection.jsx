import ContinueWatchingCard from "@/components/content/ContinueWatchingCard";
import TVPressable from "@/components/common/TVPressable";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import {
	FlatList,
	StyleSheet,
	Text,
	View,
} from "react-native";

/** ContinueWatchingCard kartı sabit 124dp genişliğinde (bkz. card stili). */
const CARD_WIDTH = 124;
const CARD_GAP = 8;
const LIST_PAD_H = 18;
const CARD_STRIDE = CARD_WIDTH + CARD_GAP;

/** Kart yüksekliği sabit → dinamik ölçümü atla. */
function getItemLayout(_data, index) {
	return {
		length: CARD_STRIDE,
		offset: LIST_PAD_H + CARD_STRIDE * index,
		index,
	};
}

export default function ContinueWatchingSection({
	items = [],
	onItemPress,
	onItemLongPress,
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
					<TVPressable
						onPress={onSeeAllPress}
						style={styles.seeAllButton}
						focusedStyle={styles.seeAllButtonFocused}>
						<Text style={styles.seeAllText}>Tümü</Text>
						<Ionicons
							name="chevron-forward"
							size={16}
							color="#9CA3AF"
						/>
					</TVPressable>
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
				initialNumToRender={5}
				maxToRenderPerBatch={4}
				windowSize={3}
				// Yatay listede odaklı kart ekranda olduğu için kırpma güvenli.
				removeClippedSubviews={true}
				getItemLayout={getItemLayout}
				renderItem={({ item }) => (
					<ContinueWatchingCard
						item={item}
						onPress={onItemPress}
						onLongPress={onItemLongPress}
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
		borderRadius: 8,
	},
	seeAllButtonFocused: {
		backgroundColor: "rgba(255, 59, 48, 0.35)",
		borderColor: "#FF3B30",
		borderWidth: 1.5,
		transform: [{ scale: 1.08 }],
	},
	seeAllText: {
		color: "#9CA3AF",
		fontSize: 13,
		fontWeight: "600",
	},
	listContent: {
		paddingHorizontal: LIST_PAD_H,
		gap: CARD_GAP,
	},
});
