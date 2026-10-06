import TVPressable, { isTVPressSuppressed } from "@/components/common/TVPressable";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import React, { useEffect } from "react";
import {
	BackHandler,
	Modal,
	Pressable,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from "react-native";

export default function LibraryItemActionModal({
	visible,
	item,
	activeTab,
	onClose,
	onGoDetails,
	onChangeList,
	onRemove,
	onShare,
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

	if (!visible || !item) return null;

	const title = item.title || item.seriesTitle || "İçerik";
	const posterUri =
		item.poster ||
		item.poster_url ||
		item.image ||
		item.backdrop_url ||
		"https://images.unsplash.com/photo-1534447677768-be436bb09401?w=800&auto=format&fit=crop&q=60";

	const tabLabels = {
		watching: "İzleniyor Listesinde",
		completed: "Tamamlananlar Listesinde",
		planned: "Planlananlar Listesinde",
		favorites: "Favoriler Listesinde",
	};

	const currentTabLabel = tabLabels[activeTab] || "Kitaplıkta";

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
				<Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
					{/* Drag handle */}
					<View style={styles.dragHandle} />

					{/* Header with poster and title */}
					<View style={styles.header}>
						<Image
							source={{ uri: posterUri }}
							style={styles.poster}
							contentFit="cover"
						/>
						<View style={styles.headerTextCol}>
							<Text style={styles.title} numberOfLines={1}>
								{title}
							</Text>
							<Text style={styles.subtitle}>{currentTabLabel}</Text>
						</View>
					</View>

					{/* Action Buttons List */}
					<View style={styles.actionsList}>
						{/* 1. Detay Sayfasına Git */}
						<TVPressable
							style={styles.actionRow}
							focusedStyle={styles.actionRowFocused}
							autoFocus={true}
							onPress={() => {
								onClose();
								onGoDetails?.();
							}}
							activeOpacity={0.75}>
							<View
								style={[
									styles.iconWrapper,
									{ backgroundColor: "rgba(56, 189, 248, 0.15)" },
								]}>
								<Ionicons
									name="information-circle-outline"
									size={20}
									color="#38bdf8"
								/>
							</View>
							<View style={styles.actionTextCol}>
								<Text style={styles.actionTitle}>
									Detay Sayfasına Git
								</Text>
								<Text style={styles.actionDesc}>
									Oyuncular, bölümler ve fragman
								</Text>
							</View>
							<Ionicons
								name="chevron-forward"
								size={16}
								color="#64748b"
							/>
						</TVPressable>

						{/* 2. Listeyi Değiştir */}
						<TVPressable
							style={styles.actionRow}
							focusedStyle={styles.actionRowFocused}
							onPress={() => {
								onClose();
								onChangeList?.();
							}}
							activeOpacity={0.75}>
							<View
								style={[
									styles.iconWrapper,
									{ backgroundColor: "rgba(245, 197, 24, 0.15)" },
								]}>
								<Ionicons
									name="swap-horizontal"
									size={19}
									color="#f5c518"
								/>
							</View>
							<View style={styles.actionTextCol}>
								<Text style={styles.actionTitle}>
									Listeyi Değiştir
								</Text>
								<Text style={styles.actionDesc}>
									İzleniyor, Planlandı veya Tamamlandı'ya taşı
								</Text>
							</View>
							<Ionicons
								name="chevron-forward"
								size={16}
								color="#64748b"
							/>
						</TVPressable>

						{/* 3. Paylaş */}
						<TVPressable
							style={styles.actionRow}
							focusedStyle={styles.actionRowFocused}
							onPress={() => {
								onClose();
								onShare?.();
							}}
							activeOpacity={0.75}>
							<View
								style={[
									styles.iconWrapper,
									{ backgroundColor: "rgba(148, 163, 184, 0.15)" },
								]}>
								<Ionicons
									name="share-social-outline"
									size={18}
									color="#94a3b8"
								/>
							</View>
							<View style={styles.actionTextCol}>
								<Text style={styles.actionTitle}>Paylaş</Text>
								<Text style={styles.actionDesc}>
									Bağlantıyı arkadaşlarınla paylaş
								</Text>
							</View>
							<Ionicons
								name="chevron-forward"
								size={16}
								color="#64748b"
							/>
						</TVPressable>

						{/* 4. Kitaplıktan Kaldır (Destructive) */}
						<TVPressable
							style={[styles.actionRow, styles.destructiveRow]}
							focusedStyle={styles.actionRowDestructiveFocused}
							onPress={() => {
								onClose();
								onRemove?.();
							}}
							activeOpacity={0.75}>
							<View
								style={[
									styles.iconWrapper,
									{ backgroundColor: "rgba(244, 63, 94, 0.15)" },
								]}>
								<Ionicons
									name="trash-outline"
									size={19}
									color="#f43f5e"
								/>
							</View>
							<View style={styles.actionTextCol}>
								<Text
									style={[
										styles.actionTitle,
										{ color: "#f43f5e" },
									]}>
									Kitaplıktan Kaldır
								</Text>
								<Text style={styles.actionDesc}>
									Bu listeyi temizle
								</Text>
							</View>
						</TVPressable>
					</View>

					{/* Kapat Butonu */}
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
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		paddingBottom: 14,
		borderBottomWidth: 1,
		borderBottomColor: "rgba(255, 255, 255, 0.08)",
		marginBottom: 14,
	},
	poster: {
		width: 44,
		height: 64,
		borderRadius: 8,
		backgroundColor: "#1E2532",
	},
	headerTextCol: {
		flex: 1,
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
