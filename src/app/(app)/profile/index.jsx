import { WATCH_HISTORY } from "@constants/data";
import { useThemeContext } from "@context/ThemeContext";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import {
	getFavorites,
	getUserProfile,
	getWatchHistory,
} from "@utils/storage";
import { Image } from "expo-image";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
	Dimensions,
	FlatList,
	ScrollView,
	StatusBar,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const { width } = Dimensions.get("window");

export default function ProfileScreen() {
	const { theme, colors } = useThemeContext();
	const router = useRouter();

	const [profile, setProfile] = useState(null);
	const [activeTab, setActiveTab] = useState("history");
	const [favorites, setFavorites] = useState([]);
	const [history, setHistory] = useState([]);

	const loadData = useCallback(async () => {
		try {
			const [userProf, favs, hist] = await Promise.all([
				getUserProfile(),
				getFavorites(),
				getWatchHistory(),
			]);
			setProfile(userProf);
			setFavorites(favs);
			setHistory(hist.length > 0 ? hist : WATCH_HISTORY);
		} catch (error) {
			console.error("Profil bilgileri yüklenirken hata:", error);
		}
	}, []);

	useFocusEffect(
		useCallback(() => {
			loadData();
		}, [loadData]),
	);

	const handleBack = () => {
		router.back();
	};

	const displayList = activeTab === "history" ? history : favorites;

	return (
		<>
			<Stack.Screen options={{ headerShown: false }} />
			<SafeAreaView
				edges={["top", "left", "right", "bottom"]}
				style={[styles.safeArea, { backgroundColor: colors.bg }]}>
				<StatusBar
					barStyle={
						theme === "dark" ? "light-content" : "dark-content"
					}
					backgroundColor={colors.bg}
				/>

				{/* Top App Bar */}
				<View
					style={[
						styles.topBar,
						{
							borderBottomColor: colors.border,
							backgroundColor: colors.bg,
						},
					]}>
					<TouchableOpacity
						onPress={handleBack}
						style={styles.backButton}>
						<Ionicons
							name="arrow-back"
							size={24}
							color={colors.text}
						/>
					</TouchableOpacity>
					<Text style={[styles.topBarTitle, { color: colors.text }]}>
						Profil
					</Text>
					<TouchableOpacity
						onPress={() => router.push("/settings")}
						style={styles.settingsButton}>
						<Ionicons
							name="settings-outline"
							size={22}
							color={colors.text}
						/>
					</TouchableOpacity>
				</View>

				<ScrollView
					showsVerticalScrollIndicator={false}
					contentContainerStyle={styles.scrollContainer}>
					{/* Profile Header */}
					<View style={styles.profileHeader}>
						{profile?.avatarUrl ? (
							<Image
								source={{ uri: profile.avatarUrl }}
								style={styles.avatar}
								contentFit="cover"
								transition={150}
							/>
						) : (
							<View
								style={[
									styles.avatar,
									{ backgroundColor: colors.primary },
								]}>
								<Text style={styles.avatarText}>
									{(profile?.displayName || "S")
										.charAt(0)
										.toUpperCase()}
								</Text>
							</View>
						)}

						<Text style={[styles.userName, { color: colors.text }]}>
							{profile?.displayName || "Sinema Sever"}
						</Text>
						<Text
							style={[
								styles.userHandle,
								{ color: colors.textSecondary },
							]}>
							@{profile?.username || "sinemasever"}
						</Text>
						{profile?.bio ? (
							<Text
								style={[
									styles.userBio,
									{ color: colors.textSecondary },
								]}>
								{profile.bio}
							</Text>
						) : null}

						<TouchableOpacity
							style={[
								styles.editButton,
								{
									borderColor: colors.primary,
									backgroundColor: colors.cardBg,
								},
							]}
							onPress={() => router.push("/profile/EditProfile")}>
							<Text
								style={[
									styles.editButtonText,
									{ color: colors.primary },
								]}>
								Profili Düzenle
							</Text>
						</TouchableOpacity>
					</View>

					{/* Stats Component */}
					<View style={styles.statsContainer}>
						<View
							style={[
								styles.statCard,
								{ backgroundColor: colors.cardBg },
							]}>
							<Text
								style={[
									styles.statNumber,
									{ color: colors.text },
								]}>
								{history.length}
							</Text>
							<Text
								style={[
									styles.statLabel,
									{ color: colors.textSecondary },
								]}>
								İzlenenler
							</Text>
						</View>
						<View
							style={[
								styles.statCard,
								{ backgroundColor: colors.cardBg },
							]}>
							<Text
								style={[
									styles.statNumber,
									{ color: colors.text },
								]}>
								{favorites.length}
							</Text>
							<Text
								style={[
									styles.statLabel,
									{ color: colors.textSecondary },
								]}>
								Favoriler
							</Text>
						</View>
						<View
							style={[
								styles.statCard,
								{ backgroundColor: colors.cardBg },
							]}>
							<Text
								style={[
									styles.statNumber,
									{ color: colors.text },
								]}>
								{profile?.language || "Türkçe"}
							</Text>
							<Text
								style={[
									styles.statLabel,
									{ color: colors.textSecondary },
								]}>
								Dil
							</Text>
						</View>
					</View>

					{/* Tabs */}
					<View
						style={[
							styles.tabsContainer,
							{ borderBottomColor: colors.border },
						]}>
						<TouchableOpacity
							onPress={() => setActiveTab("history")}
							style={[
								styles.tab,
								{
									borderBottomColor:
										activeTab === "history"
											? colors.primary
											: "transparent",
								},
							]}>
							<Text
								style={[
									styles.tabText,
									{
										color:
											activeTab === "history"
												? colors.primary
												: colors.textSecondary,
										fontWeight:
											activeTab === "history"
												? "bold"
												: "600",
									},
								]}>
								İzleme Geçmişi
							</Text>
						</TouchableOpacity>
						<TouchableOpacity
							onPress={() => setActiveTab("favorites")}
							style={[
								styles.tab,
								{
									borderBottomColor:
										activeTab === "favorites"
											? colors.primary
											: "transparent",
								},
							]}>
							<Text
								style={[
									styles.tabText,
									{
										color:
											activeTab === "favorites"
												? colors.primary
												: colors.textSecondary,
										fontWeight:
											activeTab === "favorites"
												? "bold"
												: "600",
									},
								]}>
								Favoriler
							</Text>
						</TouchableOpacity>
					</View>

					{/* Image Grid */}
					<View style={styles.gridContainer}>
						{displayList.length === 0 ? (
							<View style={styles.emptyState}>
								<Ionicons
									name={
										activeTab === "favorites"
											? "heart-outline"
											: "film-outline"
									}
									size={48}
									color={colors.textSecondary}
								/>
								<Text
									style={[
										styles.emptyText,
										{ color: colors.textSecondary },
									]}>
									{activeTab === "favorites"
										? "Henüz favori içerik eklenmedi"
										: "İzleme geçmişiniz henüz boş"}
								</Text>
							</View>
						) : (
							<FlatList
								data={displayList}
								keyExtractor={(item) => String(item.id)}
								numColumns={3}
								scrollEnabled={false}
								columnWrapperStyle={styles.gridRow}
								renderItem={({ item }) => (
									<TouchableOpacity
										style={[
											styles.gridItem,
											{ backgroundColor: colors.cardBg },
										]}
										onPress={() =>
											router.push(
												`/(app)/MovieDetails/${item.id}`,
											)
										}
										activeOpacity={0.8}>
										<Image
											source={{
												uri:
													item.image ||
													item.poster ||
													item.poster_url,
											}}
											style={styles.gridImage}
											contentFit="cover"
											transition={150}
											cachePolicy="memory-disk"
										/>
									</TouchableOpacity>
								)}
							/>
						)}
					</View>
				</ScrollView>
			</SafeAreaView>
		</>
	);
}

const styles = StyleSheet.create({
	safeArea: {
		flex: 1,
	},
	topBar: {
		height: 60,
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		paddingHorizontal: 16,
		borderBottomWidth: 1,
	},
	backButton: {
		width: 48,
		height: 48,
		justifyContent: "center",
		alignItems: "center",
	},
	topBarTitle: {
		flex: 1,
		fontSize: 18,
		fontWeight: "bold",
		textAlign: "center",
		letterSpacing: -0.015,
	},
	settingsButton: {
		width: 48,
		height: 48,
		justifyContent: "center",
		alignItems: "center",
	},
	scrollContainer: {
		paddingBottom: 40,
	},
	profileHeader: {
		alignItems: "center",
		paddingVertical: 24,
		paddingHorizontal: 16,
	},
	avatar: {
		width: 100,
		height: 100,
		borderRadius: 50,
		justifyContent: "center",
		alignItems: "center",
		marginBottom: 12,
	},
	avatarText: {
		color: "#ffffff",
		fontSize: 38,
		fontWeight: "bold",
	},
	userName: {
		fontSize: 20,
		fontWeight: "bold",
		marginBottom: 2,
	},
	userHandle: {
		fontSize: 14,
		fontWeight: "400",
		marginBottom: 6,
	},
	userBio: {
		fontSize: 13,
		textAlign: "center",
		paddingHorizontal: 20,
		marginBottom: 12,
	},
	editButton: {
		paddingHorizontal: 20,
		paddingVertical: 8,
		borderRadius: 20,
		borderWidth: 1,
		marginTop: 6,
	},
	editButtonText: {
		fontSize: 13,
		fontWeight: "600",
	},
	statsContainer: {
		flexDirection: "row",
		paddingHorizontal: 16,
		gap: 12,
		marginBottom: 24,
	},
	statCard: {
		flex: 1,
		borderRadius: 12,
		padding: 14,
		alignItems: "center",
		justifyContent: "center",
	},
	statNumber: {
		fontSize: 18,
		fontWeight: "bold",
		marginBottom: 2,
	},
	statLabel: {
		fontSize: 11,
		fontWeight: "500",
	},
	tabsContainer: {
		flexDirection: "row",
		borderBottomWidth: 1,
		paddingHorizontal: 16,
		marginBottom: 16,
	},
	tab: {
		flex: 1,
		paddingVertical: 14,
		borderBottomWidth: 3,
		alignItems: "center",
	},
	tabText: {
		fontSize: 14,
		letterSpacing: 0.015,
	},
	gridContainer: {
		paddingHorizontal: 16,
		paddingBottom: 20,
	},
	gridRow: {
		justifyContent: "space-between",
		marginBottom: 12,
	},
	gridItem: {
		width: (width - 48) / 3,
		aspectRatio: 3 / 4,
		borderRadius: 8,
		overflow: "hidden",
	},
	gridImage: {
		width: "100%",
		height: "100%",
	},
	emptyState: {
		alignItems: "center",
		justifyContent: "center",
		paddingVertical: 40,
		gap: 12,
	},
	emptyText: {
		fontSize: 14,
	},
});
