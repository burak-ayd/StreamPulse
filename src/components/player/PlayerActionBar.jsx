import React from "react";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { Platform, StyleSheet, Text, View } from "react-native";
import TVPressable from "@/components/common/TVPressable";
import AppPeekMenu from "@/components/peek/AppPeekMenu";
import { useAppMenu } from "@/components/peek/AppMenuProvider";
import { FontFamily, Palette } from "@/constants/theme";

/**
 * Oynatıcı alt eylem çubuğu (yeni tasarım: çip satırı).
 *
 * Bir eylemin `menuItems` listesi varsa, çip bir peek menüsü açar:
 * telefonda çipin üzerinde, TV'de merkezî panelde. Aksi hâlde `onPress`
 * doğrudan çalışır.
 *
 * Odak bölgesi: `onFocus` → `onFocusZone("bottom")`; kumanda bu bardayken
 * sol/sağ odak gezdirir, sarma yapmaz.
 */
export default function PlayerActionBar({
	actions,
	disabled = false,
	onFocusZone,
}) {
	const { open } = useAppMenu();

	if (!actions?.length) return null;

	const handleFocus = () => onFocusZone?.("bottom");
	const handleBlur = () => onFocusZone?.(null);

	const chipContent = (action, isActive) => (
		<>
			<Ionicons
				name={action.icon}
				size={15}
				color={
					isActive ? Palette.onPrimaryContainer : Palette.onSurface
				}
			/>
			<Text
				numberOfLines={1}
				style={[styles.label, isActive && styles.labelActive]}>
				{action.label}
			</Text>
		</>
	);

	return (
		<View style={styles.bar} pointerEvents="box-none">
			{actions.map((action) => {
				if (!action) return null;
				const isActive = Boolean(action.active);
				const chipStyle = ({ focused }) => [
					styles.item,
					isActive && styles.itemActive,
					focused && styles.itemFocused,
				];

				const hasMenu = action.menuItems?.length > 0;

				if (!hasMenu) {
					return (
						<TVPressable
							key={action.key}
							focusedStyle={null}
							style={chipStyle}
							disabled={disabled || action.disabled}
							cancelable={false}
							onFocus={handleFocus}
							onBlur={handleBlur}
							onPress={action.onPress}>
							{chipContent(action, isActive)}
						</TVPressable>
					);
				}

				const openMenu = () => {
					if (disabled || action.disabled) return;
					open({ items: action.menuItems });
				};

				if (Platform.isTV) {
					return (
						<TVPressable
							key={action.key}
							focusedStyle={null}
							style={chipStyle}
							disabled={disabled || action.disabled}
							cancelable={false}
							onFocus={handleFocus}
							onBlur={handleBlur}
							onPress={openMenu}>
							{chipContent(action, isActive)}
						</TVPressable>
					);
				}

				return (
					<AppPeekMenu
						key={action.key}
						items={action.menuItems}
						activateOn="tap"
						disabled={disabled || action.disabled}>
						<View
							style={[
								styles.item,
								isActive && styles.itemActive,
								(action.disabled || disabled) && {
									opacity: 0.5,
								},
							]}>
							{chipContent(action, isActive)}
						</View>
					</AppPeekMenu>
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