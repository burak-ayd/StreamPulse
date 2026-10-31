import ContinueWatchingCard, {
	CONTINUE_CARD_WIDTH,
} from "@/components/content/ContinueWatchingCard";
import TVPressable from "@/components/common/TVPressable";
import { FontFamily, Palette } from "@/constants/theme";
import { useFocusCentering } from "@/hooks/useFocusCentering";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useCallback, useEffect } from "react";
import { FlatList, Platform, StyleSheet, Text, View } from "react-native";

const CARD_GAP = 12;
const LIST_PAD_H = 16;
const CARD_STRIDE = CONTINUE_CARD_WIDTH + CARD_GAP;

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
	onRowFocused,
}) {
	/*
	 * SORUN 5 — kart odaklanınca satırın yatay ORTASINA taşınır.
	 *
	 * Android TV odaklanan öğeyi yalnızca ekrana getirir; kart satırın
	 * kenarına yapışıp başlığı yarım görünür. Ortak kanca bu davranışı
	 * `category.jsx` / `MovieCategorySection.jsx` ile aynı yerden verir.
	 */
	const {
		listRef,
		handleItemFocus: centerOnScreen,
		onScrollToIndexFailed,
		clearRetry,
	} = useFocusCentering({ horizontal: true });

	useEffect(() => clearRetry, [clearRetry]);

	const handleItemFocus = useCallback(
		(index) => {
			centerOnScreen(index);
			onRowFocused?.();
		},
		[centerOnScreen, onRowFocused],
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
			<FlatList
				ref={listRef}
				data={items}
				keyExtractor={(item, index) =>
					item.id || item.url || `continue-${index}`
				}
				horizontal
				showsHorizontalScrollIndicator={false}
				contentContainerStyle={styles.listContent}
				initialNumToRender={6}
				maxToRenderPerBatch={6}
				windowSize={7}
				// SORUN 2: TV'de kırpma, ekran dışındaki kartı detach
				// edip odaklı kartın odağını düşürüyordu.
				removeClippedSubviews={!Platform.isTV}
				getItemLayout={getItemLayout}
				onScrollToIndexFailed={onScrollToIndexFailed}
				renderItem={({ item, index }) => (
					<ContinueWatchingCard
						item={item}
						onPress={onItemPress}
						onLongPress={onItemLongPress}
						onRemove={onRemoveItem}
						onFocus={() => handleItemFocus(index)}
					/>
				)}
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
		gap: CARD_GAP,
		paddingVertical: 4,
	},
});
