import TVPressable, {
	isTVPressSuppressed,
} from "@/components/common/TVPressable";
import { FontFamily, Palette } from "@/constants/theme";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import React, { useEffect } from "react";
import {
	BackHandler,
	Modal,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";

/**
 * ActionMenuModal — Genel "bağlam menüsü" (context menu) alt sayfası.
 *
 * Diziler sekmesindeki bölüm/sezon "İzlendi işaretle" akışı için
 * tasarlandı; ileride indirme gibi yeni eylemler yalnızca `actions`
 * dizisine bir öğe eklenerek kullanılabilir.
 *
 * TV + dokunmatik uyumlu: satırlar `TVPressable` (DPAD odağı + OK),
 * ilk eylem `autoFocus` ile açılışta odaklanır, geri tuşu
 * `BackHandler` + `onRequestClose` ile kapatır.
 *
 * @param {object} props
 * @param {boolean} props.visible
 * @param {() => void} props.onClose
 * @param {string} [props.title]      Başlık (örn. "2. Sezon 5. Bölüm")
 * @param {string} [props.subtitle]   Alt başlık (örn. "Dizi adı • 45 dk")
 * @param {Array<{
 *   key: string,
 *   label: string,
 *   description?: string,
 *   icon?: string,
 *   iconColor?: string,
 *   iconBg?: string,
 *   destructive?: boolean,
 *   onPress: () => void,
 * }>} props.actions
 */
export default function ActionMenuModal({
	visible,
	onClose,
	title,
	subtitle,
	actions = [],
}) {
	useEffect(() => {
		if (!visible) return;
		const onBackPress = () => {
			onClose?.();
			return true;
		};
		const sub = BackHandler.addEventListener(
			"hardwareBackPress",
			onBackPress,
		);
		return () => sub.remove();
	}, [visible, onClose]);

	if (!visible) return null;

	return (
		<Modal
			visible={visible}
			transparent
			animationType="fade"
			statusBarTranslucent
			onRequestClose={onClose}>
			<Pressable
				style={styles.backdrop}
				onPress={() => {
					if (isTVPressSuppressed()) return;
					onClose?.();
				}}>
				<Pressable
					style={styles.sheet}
					onPress={(e) => e.stopPropagation()}>
					<View style={styles.dragHandle} />

					{Boolean(title) && (
						<View style={styles.header}>
							<Text style={styles.title} numberOfLines={2}>
								{title}
							</Text>
							{Boolean(subtitle) && (
								<Text style={styles.subtitle} numberOfLines={1}>
									{subtitle}
								</Text>
							)}
						</View>
					)}

					<ScrollView
						style={styles.actionsScroll}
						contentContainerStyle={styles.actionsList}
						showsVerticalScrollIndicator={false}>
						{actions.map((action, index) => (
							<TVPressable
								key={action.key || String(index)}
								style={[
									styles.actionRow,
									action.destructive &&
										styles.destructiveRow,
								]}
								focusedStyle={
									action.destructive
										? styles.actionRowDestructiveFocused
										: styles.actionRowFocused
								}
								autoFocus={index === 0}
								onPress={() => {
									onClose?.();
									action.onPress?.();
								}}
								activeOpacity={0.75}>
								<View
									style={[
										styles.iconWrapper,
										{
											backgroundColor:
												action.iconBg ||
												"rgba(56, 189, 248, 0.15)",
										},
									]}>
									<Ionicons
										name={
											action.icon || "ellipse-outline"
										}
										size={19}
										color={action.iconColor || Palette.secondary}
									/>
								</View>
								<View style={styles.actionTextCol}>
									<Text
										style={[
											styles.actionTitle,
											action.destructive && {
												color: "#f43f5e",
											},
										]}>
										{action.label}
									</Text>
									{Boolean(action.description) && (
										<Text style={styles.actionDesc}>
											{action.description}
										</Text>
									)}
								</View>
							</TVPressable>
						))}
					</ScrollView>

					<TVPressable
						style={styles.cancelButton}
						focusedStyle={styles.cancelButtonFocused}
						onPress={onClose}
						activeOpacity={0.8}>
						<Text style={styles.cancelButtonText}>Vazgeç</Text>
					</TVPressable>
				</Pressable>
			</Pressable>
		</Modal>
	);
}

const styles = StyleSheet.create({
	backdrop: {
		flex: 1,
		backgroundColor: "rgba(0, 0, 0, 0.62)",
		justifyContent: "flex-end",
	},
	sheet: {
		backgroundColor: Palette.surfaceLow,
		borderTopLeftRadius: 20,
		borderTopRightRadius: 20,
		borderTopWidth: 1,
		borderTopColor: "rgba(229, 225, 228, 0.08)",
		paddingTop: 10,
		paddingBottom: 20,
		paddingHorizontal: 16,
		width: "100%",
		maxWidth: 560,
		alignSelf: "center",
	},
	dragHandle: {
		width: 40,
		height: 4,
		borderRadius: 2,
		backgroundColor: "rgba(229, 225, 228, 0.20)",
		alignSelf: "center",
		marginBottom: 12,
	},
	header: {
		paddingBottom: 12,
		borderBottomWidth: 1,
		borderBottomColor: "rgba(229, 225, 228, 0.08)",
		marginBottom: 12,
	},
	title: {
		fontSize: 15,
		fontFamily: FontFamily.bold,
		color: Palette.onSurface,
		letterSpacing: -0.2,
		marginBottom: 2,
	},
	subtitle: {
		fontSize: 11,
		fontFamily: FontFamily.medium,
		color: Palette.onSurfaceVariant,
	},
	actionsScroll: {
		maxHeight: 340,
	},
	actionsList: {
		gap: 8,
		marginBottom: 14,
	},
	actionRow: {
		flexDirection: "row",
		alignItems: "center",
		padding: 11,
		borderRadius: 14,
		backgroundColor: Palette.surface,
		borderWidth: 2,
		borderColor: "transparent",
		gap: 12,
	},
	destructiveRow: {
		backgroundColor: "rgba(255, 180, 171, 0.08)",
	},
	iconWrapper: {
		width: 36,
		height: 36,
		borderRadius: 18,
		justifyContent: "center",
		alignItems: "center",
	},
	actionTextCol: {
		flex: 1,
	},
	actionTitle: {
		fontSize: 13,
		fontFamily: FontFamily.semiBold,
		color: Palette.onSurface,
		marginBottom: 1,
	},
	actionDesc: {
		fontSize: 10,
		fontFamily: FontFamily.regular,
		color: Palette.onSurfaceVariant,
	},
	cancelButton: {
		height: 44,
		borderRadius: 18,
		backgroundColor: Palette.surfaceHigh,
		borderWidth: 2,
		borderColor: "transparent",
		justifyContent: "center",
		alignItems: "center",
	},
	cancelButtonText: {
		color: Palette.onSurface,
		fontSize: 13,
		fontFamily: FontFamily.semiBold,
	},
	actionRowFocused: {
		borderColor: Palette.primary,
		backgroundColor: "rgba(192, 193, 255, 0.10)",
	},
	actionRowDestructiveFocused: {
		borderColor: Palette.error,
		backgroundColor: "rgba(255, 180, 171, 0.16)",
	},
	cancelButtonFocused: {
		borderColor: Palette.primary,
	},
});
