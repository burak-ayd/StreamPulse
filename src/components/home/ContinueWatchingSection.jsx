import ContinueWatchingCard, {
	CONTINUE_CARD_WIDTH,
} from "@/components/content/ContinueWatchingCard";
import TVPressable from "@/components/common/TVPressable";
import { FontFamily, Palette } from "@/constants/theme";
import { useFocusCentering } from "@/hooks/useFocusCentering";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useCallback } from "react";
import { FlashList } from "@shopify/flash-list";
import { Platform, StyleSheet, Text, View } from "react-native";

const CARD_GAP = 12;
const LIST_PAD_H = 16;

/** FlashList v2 `gap` desteklemez — kart aralığı separator ile verilir. */
function ItemSeparator() {
	return <View style={styles.itemSeparator} />;
}

export default function ContinueWatchingSection({
	items = [],
	onItemPress,
	onItemLongPress,
	onRemoveItem,
	onSeeAllPress,
	onRowFocused,
}) {
	const { listRef, handleItemFocus: centerOnScreen } = useFocusCentering({
		horizontal: true,
		itemSize: CONTINUE_CARD_WIDTH + CARD_GAP,
		startOffset: LIST_PAD_H,
	});

	/*
	 * Yatay kart ve dikey satır kaydırması aynı karede (P4) — 90 ms
	 * gecikme kaldırıldı.
	 */
	const handleItemFocus = useCallback(
		(index) => {
			centerOnScreen(index);
			onRowFocused?.();
		},
		[centerOnScreen, onRowFocused],
	);

	const keyExtractor = useCallback(
		(item, index) => item.id || item.url || `continue-${index}`,
		[],
	);

	const renderItem = useCallback(
		({ item, index }) => (
			<ContinueWatchingCard
				item={item}
				onPress={onItemPress}
				onLongPress={onItemLongPress}
				onRemove={onRemoveItem}
				onFocus={() => handleItemFocus(index)}
			/>
		),
		[onItemPress, onItemLongPress, onRemoveItem, handleItemFocus],
	);

	if (!items || items.length === 0) {
		return null;
	}

	return (
		<View style={styles.container}>
			{/* Section Header */}
			<View style={styles.header}>
				<Text style={styles.headerTitle}>İzlemeye Devam Et</Text>
				{onSeeAllPress && (
					<TVPressable
						onPress={onSeeAllPress}
						style={styles.seeAllButton}
						focusedStyle={styles.seeAllButtonFocused}>
						<Text style={styles.seeAllText}>Tümü</Text>
						<Ionicons
							name="chevron-forward"
							size={16}
							color={Palette.primary}
						/>
					</TVPressable>
				)}
			</View>

			{/* Horizontal List */}
			<FlashList
				ref={listRef}
				data={items}
				keyExtractor={keyExtractor}
				horizontal
				showsHorizontalScrollIndicator={false}
				contentContainerStyle={styles.listContent}
				ItemSeparatorComponent={ItemSeparator}
				drawDistance={Platform.isTV ? 600 : 250}
				renderItem={renderItem}
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		marginTop: 24,
		marginBottom: 8,
	},
	header: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		paddingHorizontal: LIST_PAD_H,
		marginBottom: 12,
	},
	headerTitle: {
		color: Palette.onSurface,
		fontFamily: FontFamily.semiBold,
		fontSize: 18,
		lineHeight: 24,
		letterSpacing: -0.2,
	},
	seeAllButton: {
		flexDirection: "row",
		alignItems: "center",
		gap: 2,
		paddingVertical: 4,
		paddingHorizontal: 6,
		borderRadius: 8,
		borderWidth: 2,
		borderColor: "transparent",
	},
	seeAllButtonFocused: {
		borderColor: Palette.primary,
	},
	seeAllText: {
		color: Palette.primary,
		fontFamily: FontFamily.medium,
		fontSize: 13,
	},
	listContent: {
		paddingHorizontal: LIST_PAD_H,
		// Odakta kart 1.06× büyüyor; liste kendi sınırlarına kırptığı için
		// pay bu büyümeyi karşılamalı.
		paddingVertical: 14,
	},
	itemSeparator: {
		width: CARD_GAP,
	},
});
