import { FontFamily, Palette } from "@/constants/theme";
import TVPressable from "@/components/common/TVPressable";
import Image from "@/components/common/SmartImage";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { StyleSheet, Text, View } from "react-native";

/**
 * Peek menüsünün görünümü — telefon, tablet ve TV için TEK liste.
 *
 * Satır düzeni tek satırlık bilgi taşır: solda ikon + başlık, sağda değer
 * rozeti (`value`). "Durum: İzleniyor" gibi bilgiler başlığın ALTINA değil,
 * aynı satırın sağına yazılır. Açıklama (`description`) yalnızca gerçekten
 * ikinci satır gerektiren eylemlerde kullanılır.
 *
 * @param {object} props
 * @param {Array<object>} props.items
 * @param {{title?: string, subtitle?: string, posterUri?: string}} [props.header]
 * @param {(item: object) => void} props.onItemPress
 * @param {boolean} [props.autoFocusFirst]  TV panelinde ilk satıra odak ver
 * @param {number} [props.width]
 */
export default function AppMenuList({
	items = [],
	onItemPress,
	autoFocusFirst = false,
	width = 320,
}) {
	return (
		<View style={[styles.menu, { width, maxWidth: "100%" }]}>
			{items.map((item, index) => {
				if (item.type === "header") {
					return (
						<View
							key={item.key || item.title}
							style={styles.header}>
							{item.posterUri ? (
								<Image
									source={{ uri: item.posterUri }}
									style={styles.poster}
									contentFit="cover"
								/>
							) : null}
							<View style={styles.headerText}>
								<Text
									style={styles.headerTitle}
									numberOfLines={2}>
									{item.title}
								</Text>
								{Boolean(item.subtitle) && (
									<Text
										style={styles.headerSubtitle}
										numberOfLines={1}>
										{item.subtitle}
									</Text>
								)}
							</View>
						</View>
					);
				}
				if (item.type === "info") {
					return (
						<View
							key={item.key || item.title}
							style={styles.infoRow}>
							<Text style={styles.infoTitle}>{item.title}</Text>
							<Text
								style={[
									styles.infoValue,
									item.valueColor && {
										color: item.valueColor,
									},
								]}
								numberOfLines={1}>
								{item.value}
							</Text>
						</View>
					);
				}
				if (item.type === "label") {
					return (
						<Text key={item.key || item.title} style={styles.sectionLabel}>
							{item.title}
						</Text>
					);
				}

				return (
					<TVPressable
						key={item.key || item.title}
						style={[
							styles.row,
							item.selected && styles.rowSelected,
							item.destructive && styles.rowDestructive,
						]}
						focusedStyle={
							item.destructive
								? styles.rowFocusedDestructive
								: styles.rowFocused
						}
						autoFocus={autoFocusFirst && index === 0}
						disabled={item.disabled}
						onPress={() => onItemPress?.(item)}
						activeOpacity={0.75}>
						{item.icon ? (
							<View
								style={[
									styles.iconBox,
									{
										backgroundColor:
											item.iconBg ||
											"rgba(192, 193, 255, 0.12)",
									},
								]}>
								<Ionicons
									name={item.icon}
									size={17}
									color={
										item.iconColor ||
										(item.destructive
											? Palette.error
											: Palette.primary)
									}
								/>
							</View>
						) : null}

						<View style={styles.textCol}>
							<Text
								style={[
									styles.title,
									item.selected && styles.titleSelected,
									item.destructive && styles.titleDestructive,
									item.disabled && styles.titleDisabled,
								]}
								numberOfLines={1}>
								{item.title}
							</Text>
							{Boolean(item.description) && (
								<Text style={styles.description} numberOfLines={1}>
									{item.description}
								</Text>
							)}
						</View>

						{Boolean(item.value) && (
							<View
								style={[
									styles.valueBadge,
									item.valueColor && {
										borderColor: `${item.valueColor}66`,
										backgroundColor: `${item.valueColor}1f`,
									},
								]}>
								<Text
									style={[
										styles.valueText,
										item.valueColor && {
											color: item.valueColor,
										},
									]}
									numberOfLines={1}>
									{item.value}
								</Text>
							</View>
						)}

						{item.selected ? (
							<Ionicons
								name="checkmark"
								size={17}
								color={Palette.primary}
							/>
						) : null}
					</TVPressable>
				);
			})}
		</View>
	);
}

const styles = StyleSheet.create({
	menu: {
		backgroundColor: Palette.surfaceLow,
		borderRadius: 16,
		borderWidth: 1,
		borderColor: "rgba(229, 225, 228, 0.10)",
		padding: 6,
		overflow: "hidden",
	},
	header: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		paddingHorizontal: 10,
		paddingTop: 6,
		paddingBottom: 10,
		marginBottom: 4,
		borderBottomWidth: 1,
		borderBottomColor: "rgba(229, 225, 228, 0.08)",
	},
	poster: {
		width: 34,
		height: 50,
		borderRadius: 6,
		backgroundColor: Palette.surfaceHigh,
	},
	headerText: {
		flex: 1,
		minWidth: 0,
	},
	headerTitle: {
		fontSize: 14,
		fontFamily: FontFamily.bold,
		color: Palette.onSurface,
	},
	headerSubtitle: {
		fontSize: 11,
		fontFamily: FontFamily.medium,
		color: Palette.onSurfaceVariant,
		marginTop: 2,
	},
	infoRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 8,
		paddingHorizontal: 10,
		paddingVertical: 8,
		borderRadius: 10,
		backgroundColor: "rgba(255, 255, 255, 0.04)",
	},
	infoTitle: {
		fontSize: 12,
		fontFamily: FontFamily.medium,
		color: Palette.onSurfaceVariant,
	},
	infoValue: {
		fontSize: 12,
		fontFamily: FontFamily.bold,
		color: Palette.onSurface,
		flexShrink: 1,
		textAlign: "right",
	},
	sectionLabel: {
		fontSize: 10,
		fontFamily: FontFamily.bold,
		letterSpacing: 0.6,
		color: Palette.onSurfaceVariant,
		paddingHorizontal: 10,
		paddingTop: 10,
		paddingBottom: 4,
	},
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		paddingVertical: 9,
		paddingHorizontal: 10,
		borderRadius: 11,
		borderWidth: 2,
		borderColor: "transparent",
	},
	rowSelected: {
		backgroundColor: "rgba(192, 193, 255, 0.10)",
	},
	rowDestructive: {
		backgroundColor: "rgba(255, 180, 171, 0.08)",
	},
	rowFocused: {
		borderColor: Palette.primary,
		backgroundColor: "rgba(192, 193, 255, 0.14)",
	},
	rowFocusedDestructive: {
		borderColor: Palette.error,
		backgroundColor: "rgba(255, 180, 171, 0.16)",
	},
	iconBox: {
		width: 30,
		height: 30,
		borderRadius: 9,
		alignItems: "center",
		justifyContent: "center",
	},
	textCol: {
		flex: 1,
		minWidth: 0,
	},
	title: {
		fontSize: 13.5,
		fontFamily: FontFamily.semiBold,
		color: Palette.onSurface,
	},
	titleSelected: {
		color: Palette.primary,
	},
	titleDestructive: {
		color: Palette.error,
	},
	titleDisabled: {
		color: Palette.outline,
	},
	description: {
		fontSize: 10.5,
		fontFamily: FontFamily.regular,
		color: Palette.onSurfaceVariant,
		marginTop: 1,
	},
	valueBadge: {
		paddingHorizontal: 7,
		paddingVertical: 2,
		borderRadius: 6,
		borderWidth: 1,
		borderColor: "rgba(192, 193, 255, 0.35)",
		backgroundColor: "rgba(192, 193, 255, 0.12)",
		maxWidth: 132,
	},
	valueText: {
		fontSize: 10.5,
		fontFamily: FontFamily.bold,
		color: Palette.primary,
	},
});