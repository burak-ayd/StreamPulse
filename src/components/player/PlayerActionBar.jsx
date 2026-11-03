import React from "react";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { StyleSheet, Text, View } from "react-native";
import TVPressable from "@/components/common/TVPressable";
import { FontFamily, Palette } from "@/constants/theme";

/**
 * Oynatıcı alt eylem çubuğu (yeni tasarım: çip satırı).
 *
 * Her eylem yarı saydam koyu bir hap içinde ikon + etiket olarak çizilir;
 * etkin olan (ör. kilit açık) vurgu rengini alır. Eylem listesi
 * `VideoPlayer`'dan gelir — bu bileşen yalnızca görünümü tanımlar.
 *
 * Odak bölgesi: `onFocus` → `onFocusZone("bottom")`; kumanda bu bardayken
 * sol/sağ odak gezdirir, sarma yapmaz.
 */
export default function PlayerActionBar({ actions, disabled = false, onFocusZone }) {
	if (!actions?.length) return null;

	const handleFocus = () => onFocusZone?.("bottom");
	const handleBlur = () => onFocusZone?.(null);

	return (
		<View style={styles.bar} pointerEvents="box-none">
			{actions.map((action) => {
				if (!action) return null;
				const isActive = Boolean(action.active);
				return (
					<TVPressable
						key={action.key}
						focusedStyle={null}
						style={({ focused }) => [
							styles.item,
							isActive && styles.itemActive,
							focused && styles.itemFocused,
						]}
						disabled={disabled || action.disabled}
						cancelable={false}
						onFocus={handleFocus}
						onBlur={handleBlur}
						onPress={action.onPress}>
						<Ionicons
							name={action.icon}
							size={15}
							color={
								isActive
									? Palette.onPrimaryContainer
									: Palette.onSurface
							}
						/>
						<Text
							numberOfLines={1}
							style={[
								styles.label,
								isActive && styles.labelActive,
							]}>
							{action.label}
						</Text>
					</TVPressable>
				);
			})}
		</View>
	);
}

const styles = StyleSheet.create({
	bar: {
		flexDirection: "row",
		alignItems: "center",
		flexWrap: "wrap",
		gap: 8,
		paddingTop: 10,
	},
	item: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		paddingHorizontal: 12,
		paddingVertical: 8,
		borderRadius: 18,
		backgroundColor: "rgba(0, 0, 0, 0.45)",
		borderWidth: 2,
		borderColor: "transparent",
	},
	itemActive: {
		backgroundColor: Palette.primary,
	},
	itemFocused: {
		borderColor: Palette.primary,
	},
	label: {
		color: Palette.onSurface,
		fontFamily: FontFamily.semiBold,
		fontSize: 12,
	},
	labelActive: {
		color: Palette.onPrimaryContainer,
		fontFamily: FontFamily.bold,
	},
});
