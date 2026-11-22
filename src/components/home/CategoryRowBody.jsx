import { FlashList } from "@shopify/flash-list";
import { useCallback } from "react";
import { useFocusCentering } from "@/hooks/useFocusCentering";
import CategoryCard, { ROW_CARD_WIDTH } from "@/components/content/CategoryCard";
import ContentPeekMenu from "@/components/peek/ContentPeekMenu";
import TVPressable from "@/components/common/TVPressable";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { contentKey } from "@/utils/contentMeta";
import { SEE_ALL_SENTINEL, SeeAllTile } from "./CategoryRowConstants";
import { FontFamily, Palette } from "@/constants/theme";
import { Platform, StyleSheet, Text, View } from "react-native";

/** Kartlar arası boşluk. FlashList v2 `gap` desteklemediği için separator ile verilir. */
const ROW_CARD_GAP = 12;
const ESTIMATED_CARD_SIZE = ROW_CARD_WIDTH + ROW_CARD_GAP;
/** Listenin sol/sağ boşluğu — `contentContainerStyle.paddingHorizontal` ile aynı. */
const ROW_LIST_PAD_H = 16;

function RowSeparator() {
	return <View style={styles.rowSeparator} />;
}

/**
 * CategoryRowBody - Kategori satırının render gövdesi.
 *
 * ⚠️ FlashList v2: `estimatedItemSize` / `overrideItemLayout` boyutu YOK
 * SAYILIR, `contentContainerStyle` içindeki `gap` de uygulanmaz (öğeler
 * mutlak konumlanır). Aralık bu yüzden `ItemSeparatorComponent` ile verilir.
 */
export default function CategoryRowBody({
	category,
	movies,
	platformName,
	onMoviePress,
	onSeeAll,
	onRowFocused,
	onRowMeasured,
	showSeeAllTile,
}) {
	const categoryName = category?.name;

	const handleSeeAll = useCallback(() => {
		onSeeAll?.(category);
	}, [onSeeAll, category]);

	/*
	 * Yatayda da çapa: odaklanan kart ekranın solundan ~%22'de durur,
	 * satır onun altında kayar. Hedef offset sabit kart adımından
	 * (`genişlik + aralık`) hesaplandığı için native `scrollToOffset`
	 * kullanılır — animasyon kuyruğu yok.
	 */
	const { listRef, handleItemFocus: centerOnScreen } = useFocusCentering({
		horizontal: true,
		itemSize: ESTIMATED_CARD_SIZE,
		startOffset: ROW_LIST_PAD_H,
	});

	/*
	 * Kart ve satır kaydırması AYNI karede verilir (P4). Eskiden dikey
	 * satır hizalaması 90 ms geciktiriliyordu; iki animasyon üst üste
	 * binip titreme üretiyordu.
	 */
	const handleCardFocus = useCallback(
		(index) => {
			centerOnScreen(index);
			onRowFocused?.();
		},
		[centerOnScreen, onRowFocused],
	);

	const rowData =
		(showSeeAllTile || onSeeAll) && movies.length > 0
			? [...movies, SEE_ALL_SENTINEL]
			: movies;

	const keyExtractor = useCallback(
		(item, index) =>
			item === SEE_ALL_SENTINEL
				? `see-all-${categoryName || "cat"}`
				: `${contentKey(item, index)}-${categoryName || "movie"}`,
		[categoryName],
	);

	const renderItem = useCallback(
		({ item, index }) => {
			if (item === SEE_ALL_SENTINEL) {
				return <SeeAllTile onPress={handleSeeAll} />;
			}
			return (
				<ContentPeekMenu
					item={item}
					platformName={platformName}
					onPlay={onMoviePress}
					onDetails={onMoviePress}>
					{(peek) => (
						<CategoryCard
							item={item}
							variant="row"
							onPress={() => onMoviePress(item)}
							onLongPress={
								Platform.isTV
									? () => peek.openMenu()
									: undefined
							}
							onFocus={() => handleCardFocus(index)}
						/>
					)}
				</ContentPeekMenu>
			);
		},
		[
			handleSeeAll,
			onMoviePress,
			handleCardFocus,
			platformName,
		],
	);

	return (
		<View
			style={styles.sectionContainer}
			onLayout={(e) => onRowMeasured?.(e.nativeEvent.layout.height)}>
			<View style={styles.sectionHeader}>
				<View style={styles.sectionTitleRow}>
					<View style={styles.sectionDot} />
					<Text style={styles.sectionTitle} numberOfLines={1}>
						{category?.name}
					</Text>
				</View>
				<TVPressable
					onPress={() => category && onSeeAll?.(category)}
					style={styles.arrowButton}
					focusedStyle={styles.arrowButtonFocused}
					accessibilityLabel="Kategorinin tümünü göster">
					<Text style={styles.arrowText}>Tümünü Gör</Text>
					<Ionicons
						name="chevron-forward"
						size={16}
						color={Palette.primary}
					/>
				</TVPressable>
			</View>

			<FlashList
				ref={listRef}
				data={rowData}
				keyExtractor={keyExtractor}
				horizontal
				showsHorizontalScrollIndicator={false}
				contentContainerStyle={styles.horizontalList}
				ItemSeparatorComponent={RowSeparator}
				drawDistance={Platform.isTV ? 600 : 250}
				renderItem={renderItem}
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	sectionContainer: {
		marginBottom: 24,
	},
	sectionHeader: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		paddingHorizontal: 16,
		marginBottom: 12,
		gap: 12,
	},
	sectionTitleRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		flexShrink: 1,
	},
	sectionDot: {
		width: 8,
		height: 8,
		borderRadius: 4,
		backgroundColor: Palette.primary,
	},
	sectionTitle: {
		color: Palette.onSurface,
		fontFamily: FontFamily.semiBold,
		fontSize: 18,
		lineHeight: 24,
		letterSpacing: -0.2,
		flexShrink: 1,
	},
	arrowButton: {
		flexDirection: "row",
		alignItems: "center",
		gap: 2,
		paddingVertical: 4,
		paddingHorizontal: 6,
		borderRadius: 8,
		borderWidth: 2,
		borderColor: "transparent",
	},
	arrowButtonFocused: {
		borderColor: Palette.primary,
	},
	arrowText: {
		color: Palette.primary,
		fontFamily: FontFamily.medium,
		fontSize: 13,
	},
	horizontalList: {
		paddingHorizontal: 16,
		// Odakta kart 1.08× büyüyor (~10px her yöne). Liste çocuklarını
		// kendi sınırlarına kırptığı için pay bu büyümeyi karşılamalı;
		// aksi hâlde kartın üstü başlığın altında kalıyordu.
		paddingVertical: 18,
	},
	rowSeparator: {
		width: ROW_CARD_GAP,
	},
});
