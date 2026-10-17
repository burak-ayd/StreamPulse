import TVPressable, {
	isTVPressSuppressed,
} from "@/components/common/TVPressable";
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
										color={action.iconColor || "#38bdf8"}
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
		backgroundColor: "rgba(0, 0, 0, 0.75)",
		justifyContent: "flex-end",
	},
	sheet: {
		backgroundColor: "#161B24",
		borderTopLeftRadius: 24,
		borderTopRightRadius: 24,
		borderTopWidth: 1,
		borderTopColor: "rgba(255, 255, 255, 0.1)",
		paddingTop: 10,
		paddingBottom: 24,
		paddingHorizontal: 20,
		// TV'de alt sayfa ekranın tamamına yayılmasın.
		width: "100%",
		maxWidth: 560,
		alignSelf: "center",
	},
	dragHandle: {
		width: 40,
		height: 4,
		borderRadius: 2,
		backgroundColor: "rgba(255, 255, 255, 0.2)",
		alignSelf: "center",
		marginBottom: 14,
	},
	header: {
		paddingBottom: 14,
		borderBottomWidth: 1,
		borderBottomColor: "rgba(255, 255, 255, 0.08)",
		marginBottom: 14,
	},
	title: {
		fontSize: 16,
		fontWeight: "800",
		color: "#ffffff",
		letterSpacing: -0.2,
		marginBottom: 3,
	},
	subtitle: {
		fontSize: 12,
		color: "#94a3b8",
	},
	actionsScroll: {
		maxHeight: 340,
	},
	actionsList: {
		gap: 8,
		marginBottom: 16,
	},
	actionRow: {
		flexDirection: "row",
		alignItems: "center",
		padding: 12,
		borderRadius: 14,
		backgroundColor: "rgba(30, 37, 50, 0.6)",
		borderWidth: 1,
		borderColor: "rgba(255, 255, 255, 0.05)",
		gap: 12,
	},
	destructiveRow: {
		backgroundColor: "rgba(244, 63, 94, 0.08)",
		borderColor: "rgba(244, 63, 94, 0.2)",
	},
	iconWrapper: {
		width: 38,
		height: 38,
		borderRadius: 12,
		justifyContent: "center",
		alignItems: "center",
	},
	actionTextCol: {
		flex: 1,
	},
	actionTitle: {
		fontSize: 13,
		fontWeight: "700",
		color: "#f1f5f9",
		marginBottom: 2,
	},
	actionDesc: {
		fontSize: 10,
		color: "#64748b",
	},
	cancelButton: {
		height: 44,
		borderRadius: 14,
		backgroundColor: "#1E2532",
		borderWidth: 1,
		borderColor: "rgba(255, 255, 255, 0.08)",
		justifyContent: "center",
		alignItems: "center",
	},
	cancelButtonText: {
		color: "#cbd5e1",
		fontSize: 13,
		fontWeight: "700",
	},
	actionRowFocused: {
		borderWidth: 1.5,
		borderColor: "#E50914",
		backgroundColor: "rgba(229, 9, 20, 0.15)",
		transform: [{ scale: 1.02 }],
	},
	actionRowDestructiveFocused: {
		borderWidth: 1.5,
		borderColor: "#f43f5e",
		backgroundColor: "rgba(244, 63, 94, 0.2)",
		transform: [{ scale: 1.02 }],
	},
	cancelButtonFocused: {
		borderWidth: 2,
		borderColor: "#FFFFFF",
		backgroundColor: "rgba(255, 255, 255, 0.15)",
		transform: [{ scale: 1.03 }],
	},
});
