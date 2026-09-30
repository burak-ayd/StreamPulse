import {
	getContentLibraryStatus,
	setContentLibraryList,
	toggleFavorite,
} from "@/utils/storage";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import React, { useEffect, useState } from "react";
import {
	Dimensions,
	Modal,
	Pressable,
	StyleSheet,
	Text,
	TouchableOpacity,
	Vibration,
	View,
} from "react-native";

const { width } = Dimensions.get("window");

const LIST_OPTIONS = [
	{
		key: "watching",
		label: "İzleniyor",
		desc: "Kaldığın yerden devam et listesine ekler",
		icon: "play-circle",
		color: "#E50914",
		badge: "Devam Eden",
	},
	{
		key: "planned",
		label: "Planlandı (Listem)",
		desc: "Daha sonra izlemek üzere listeye kaydeder",
		icon: "bookmark",
		color: "#38bdf8",
		badge: "İzlenecek",
	},
	{
		key: "completed",
		label: "Tamamlandı",
		desc: "Bitirdiğin yapımlara ve geçmişe ekler",
		icon: "checkmark-circle",
		color: "#10b981",
		badge: "Bitti",
	},
];

export default function ListSelectModal({
	visible,
	movie,
	onClose,
	onStatusChanged,
}) {
	const [currentList, setCurrentList] = useState(null);
	const [isFav, setIsFav] = useState(false);
	const [loading, setLoading] = useState(false);

	const movieId = movie?.id || movie?.url;

	useEffect(() => {
		if (!visible || !movie) return;

		let isMounted = true;
		async function checkStatus() {
			try {
				const status = await getContentLibraryStatus(movieId);
				if (isMounted) {
					setCurrentList(status.currentList);
					setIsFav(status.isFav);
				}
			} catch (e) {
				console.warn("ListSelectModal checkStatus hata:", e);
			}
		}
		checkStatus();

		try {
			Vibration.vibrate(30);
		} catch (e) {}

		return () => {
			isMounted = false;
		};
	}, [visible, movie, movieId]);

	if (!visible || !movie) return null;

	const posterUri =
		movie.poster ||
		movie.poster_url ||
		movie.image ||
		movie.backdrop_url ||
		"https://images.unsplash.com/photo-1534447677768-be436bb09401?w=800&auto=format&fit=crop&q=60";

	const title = movie.title || movie.name || "İçerik";

	const handleSelectList = async (targetList) => {
		try {
			setLoading(true);
			const result = await setContentLibraryList(movie, targetList);
			setCurrentList(result);
			onStatusChanged?.(result, isFav);
			onClose();
		} catch (e) {
			console.error("handleSelectList hata:", e);
		} finally {
			setLoading(false);
		}
	};

	const handleToggleFav = async () => {
		try {
			const newFav = await toggleFavorite({ ...movie, id: movieId });
			setIsFav(newFav);
			onStatusChanged?.(currentList, newFav);
		} catch (e) {
			console.error("handleToggleFav hata:", e);
		}
	};

	return (
		<Modal
			visible={visible}
			transparent
			animationType="fade"
			statusBarTranslucent
			onRequestClose={onClose}>
			<Pressable style={styles.backdrop} onPress={onClose}>
				<Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
					{/* Drag Handle */}
					<View style={styles.dragHandle} />

					{/* Header: Poster + Title + Current Status */}
					<View style={styles.headerRow}>
						<Image
							source={{ uri: posterUri }}
							style={styles.headerPoster}
							contentFit="cover"
						/>
						<View style={styles.headerInfo}>
							<Text style={styles.headerTitle} numberOfLines={1}>
								{title}
							</Text>
							<Text style={styles.headerSub}>
								{currentList
									? `Şu anda "${LIST_OPTIONS.find((o) => o.key === currentList)?.label || currentList}" listesinde`
									: "Herhangi bir izleme listesinde değil"}
							</Text>
						</View>
					</View>

					{/* Section Title */}
					<Text style={styles.sectionTitle}>LİSTEYE EKLE / DÜZENLE</Text>

					{/* List Options */}
					<View style={styles.optionsList}>
						{LIST_OPTIONS.map((opt) => {
							const isSelected = currentList === opt.key;
							return (
								<TouchableOpacity
									key={opt.key}
									style={[
										styles.optionCard,
										isSelected && styles.optionCardSelected,
									]}
									onPress={() => handleSelectList(opt.key)}
									activeOpacity={0.8}
									disabled={loading}>
									<View style={styles.optionLeft}>
										<View
											style={[
												styles.iconCircle,
												{ backgroundColor: `${opt.color}20` },
											]}>
											<Ionicons
												name={opt.icon}
												size={20}
												color={opt.color}
											/>
										</View>
										<View style={styles.optionTextCol}>
											<View style={styles.optionLabelRow}>
												<Text
													style={[
														styles.optionLabel,
														isSelected && styles.optionLabelSelected,
													]}>
													{opt.label}
												</Text>
												<View
													style={[
														styles.badge,
														{ borderColor: `${opt.color}40` },
													]}>
													<Text
														style={[
															styles.badgeText,
															{ color: opt.color },
														]}>
														{opt.badge}
													</Text>
												</View>
											</View>
											<Text style={styles.optionDesc}>
												{opt.desc}
											</Text>
										</View>
									</View>

									{/* Radio / Checkmark Indicator */}
									<View
										style={[
											styles.radioCircle,
											isSelected && styles.radioCircleActive,
										]}>
										{isSelected && (
											<Ionicons
												name="checkmark"
												size={14}
												color="#ffffff"
											/>
										)}
									</View>
								</TouchableOpacity>
							);
						})}

						{/* Listeden Kaldır Butonu (Eğer bir listedeyse) */}
						{currentList && (
							<TouchableOpacity
								style={styles.removeButton}
								onPress={() => handleSelectList(null)}
								activeOpacity={0.8}
								disabled={loading}>
								<Ionicons
									name="trash-outline"
									size={18}
									color="#f43f5e"
								/>
								<Text style={styles.removeButtonText}>
									İzleme Listelerinden Kaldır
								</Text>
							</TouchableOpacity>
						)}
					</View>

					{/* Favori Hızlı Geçiş Butonu */}
					<View style={styles.footerRow}>
						<TouchableOpacity
							style={[
								styles.favButton,
								isFav && styles.favButtonActive,
							]}
							onPress={handleToggleFav}
							activeOpacity={0.8}>
							<Ionicons
								name={isFav ? "heart" : "heart-outline"}
								size={18}
								color={isFav ? "#f43f5e" : "#cbd5e1"}
							/>
							<Text
								style={[
									styles.favButtonText,
									isFav && styles.favButtonTextActive,
								]}>
								{isFav ? "Favorilerden Çıkar" : "Favorilere Ekle"}
							</Text>
						</TouchableOpacity>

						<TouchableOpacity
							style={styles.closeButton}
							onPress={onClose}
							activeOpacity={0.8}>
							<Text style={styles.closeButtonText}>Kapat</Text>
						</TouchableOpacity>
					</View>
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
		borderTopLeftRadius: 26,
		borderTopRightRadius: 26,
		borderTopWidth: 1,
		borderTopColor: "rgba(255, 255, 255, 0.1)",
		paddingTop: 10,
		paddingBottom: 24,
		paddingHorizontal: 20,
		maxHeight: "86%",
	},
	dragHandle: {
		width: 40,
		height: 4,
		borderRadius: 2,
		backgroundColor: "rgba(255, 255, 255, 0.2)",
		alignSelf: "center",
		marginBottom: 14,
	},
	headerRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		paddingBottom: 14,
		borderBottomWidth: 1,
		borderBottomColor: "rgba(255, 255, 255, 0.08)",
		marginBottom: 16,
	},
	headerPoster: {
		width: 44,
		height: 64,
		borderRadius: 8,
		backgroundColor: "#1E2532",
	},
	headerInfo: {
		flex: 1,
	},
	headerTitle: {
		fontSize: 16,
		fontWeight: "800",
		color: "#ffffff",
		letterSpacing: -0.2,
		marginBottom: 3,
	},
	headerSub: {
		fontSize: 11,
		color: "#94a3b8",
	},
	sectionTitle: {
		fontSize: 11,
		fontWeight: "800",
		color: "#94a3b8",
		letterSpacing: 0.6,
		marginBottom: 10,
	},
	optionsList: {
		gap: 8,
		marginBottom: 16,
	},
	optionCard: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		padding: 12,
		borderRadius: 14,
		backgroundColor: "rgba(30, 37, 50, 0.6)",
		borderWidth: 1,
		borderColor: "rgba(255, 255, 255, 0.06)",
	},
	optionCardSelected: {
		backgroundColor: "rgba(229, 9, 20, 0.1)",
		borderColor: "rgba(229, 9, 20, 0.4)",
	},
	optionLeft: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		flex: 1,
	},
	iconCircle: {
		width: 38,
		height: 38,
		borderRadius: 19,
		justifyContent: "center",
		alignItems: "center",
	},
	optionTextCol: {
		flex: 1,
	},
	optionLabelRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		marginBottom: 2,
	},
	optionLabel: {
		fontSize: 13,
		fontWeight: "700",
		color: "#cbd5e1",
	},
	optionLabelSelected: {
		color: "#ffffff",
	},
	badge: {
		paddingHorizontal: 5,
		paddingVertical: 1,
		borderRadius: 4,
		borderWidth: 1,
	},
	badgeText: {
		fontSize: 9,
		fontWeight: "700",
	},
	optionDesc: {
		fontSize: 10,
		color: "#64748b",
	},
	radioCircle: {
		width: 22,
		height: 22,
		borderRadius: 11,
		borderWidth: 1.5,
		borderColor: "#64748b",
		justifyContent: "center",
		alignItems: "center",
	},
	radioCircleActive: {
		backgroundColor: "#E50914",
		borderColor: "#E50914",
	},
	removeButton: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		paddingVertical: 12,
		borderRadius: 12,
		backgroundColor: "rgba(244, 63, 94, 0.1)",
		borderWidth: 1,
		borderColor: "rgba(244, 63, 94, 0.3)",
		marginTop: 4,
	},
	removeButtonText: {
		color: "#f43f5e",
		fontSize: 12,
		fontWeight: "700",
	},
	footerRow: {
		flexDirection: "row",
		gap: 10,
	},
	favButton: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 6,
		paddingVertical: 12,
		borderRadius: 12,
		backgroundColor: "#1E2532",
		borderWidth: 1,
		borderColor: "rgba(255, 255, 255, 0.08)",
	},
	favButtonActive: {
		borderColor: "rgba(244, 63, 94, 0.4)",
		backgroundColor: "rgba(244, 63, 94, 0.12)",
	},
	favButtonText: {
		color: "#cbd5e1",
		fontSize: 12,
		fontWeight: "700",
	},
	favButtonTextActive: {
		color: "#f43f5e",
	},
	closeButton: {
		paddingHorizontal: 20,
		paddingVertical: 12,
		borderRadius: 12,
		backgroundColor: "rgba(255, 255, 255, 0.08)",
		justifyContent: "center",
		alignItems: "center",
	},
	closeButtonText: {
		color: "#ffffff",
		fontSize: 12,
		fontWeight: "700",
	},
});
