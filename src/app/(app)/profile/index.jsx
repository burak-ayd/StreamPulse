import ContinueWatchingCard from "@/components/content/ContinueWatchingCard";
import { useAuth } from "@/context/AuthContext";
import { useThemeContext } from "@/context/ThemeContext";
import {
	getContinueWatching,
	getFavorites,
	getSelectedPlatform,
	getUserProfile,
	getWatchHistory,
	removeContinueWatching,
	resolvePluginName,
} from "@/utils/storage";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import {
	Stack,
	useFocusEffect,
	useLocalSearchParams,
	useRouter,
} from "expo-router";
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
	const { isLoggedIn, user } = useAuth();
	const router = useRouter();
	const params = useLocalSearchParams();

	const [profile, setProfile] = useState(null);
	const [selectedPlatform, setSelectedPlatform] = useState(null);
	const [activeTab, setActiveTab] = useState(
		params?.tab === "continue" ? "continue" : "history",
	);
	const [prevTab, setPrevTab] = useState(params?.tab);
	if (params?.tab !== prevTab) {
		setPrevTab(params?.tab);
		if (params?.tab) {
			setActiveTab(params.tab);
		}
	}
	const [favorites, setFavorites] = useState([]);
	const [history, setHistory] = useState([]);
	const [continueWatching, setContinueWatching] = useState([]);

	const loadData = useCallback(async () => {
		try {
			const [userProf, favs, hist, cont, platform] = await Promise.all([
				getUserProfile(),
				getFavorites(),
				getWatchHistory(),
				getContinueWatching(),
				getSelectedPlatform(),
			]);
			setProfile(userProf);
			setFavorites(favs || []);
			setHistory(hist || []); // Mock data kaldırıldı
			setContinueWatching(cont || []);
			if (platform) setSelectedPlatform(platform);
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

	const handleItemPress = (item) => {
		if (!item) return;

		const targetPlugin =
			resolvePluginName(item) ||
			item.plugin ||
			selectedPlatform?.name ||
			"hdfilmcehennemi";

		let movieWithPlugin = {
			...item,
			plugin: targetPlugin,
		};

		const epTitleMatch = (movieWithPlugin.title || "").match(
			/^(.+?)\s+(\d+)\.\s*Sezon\s+(\d+)\.\s*Bölüm/i,
		);

		if (epTitleMatch) {
			movieWithPlugin = {
				...movieWithPlugin,
				seriesTitle: epTitleMatch[1].trim(),
				initialSeason: String(epTitleMatch[2]),
				initialEpisode: String(epTitleMatch[3]),
				is_series: true,
				content_type: "series",
			};
		}

		const movieId =
			item.id ||
			encodeURIComponent(
				item.url || item.title || "content",
			);

		router.push({
			pathname: "/(app)/MovieDetails/[id]",
			params: {
				id: String(movieId),
				url: item.url || item.seriesUrl || "",
				plugin: targetPlugin,
				movieData: JSON.stringify(movieWithPlugin),
			},
		});
	};

	const displayList = activeTab === "history" ? history : favorites;

	// Profil bilgileri: Giriş yapıldıysa AuthContext'teki gerçek kullanıcı, değilse misafir
	const isDefaultProfile =
		!profile ||
		profile.username === "sinemasever" ||
		profile.email === "kullanici@cineverse.com";

	const displayName = isLoggedIn && user
		? user.display_name || user.username || user.email?.split("@")[0] || "Kullanıcı"
		: !isDefaultProfile && profile?.displayName
		? profile.displayName
		: "Misafir Kullanıcı";

	const userHandle = isLoggedIn && user
		? `@${user.username || user.email?.split("@")[0] || "kullanici"}`
		: !isDefaultProfile && profile?.username
		? `@${profile.username}`
		: "@misafir";

	const userBio = isLoggedIn && user
		? user.bio || (!isDefaultProfile && profile?.bio ? profile.bio : "")
		: !isDefaultProfile && profile?.bio && !profile.bio.includes("Sinema dünyasındaki")
		? profile.bio
		: "";

	const avatarUri = isLoggedIn && user?.avatar_url
		? user.avatar_url
		: profile?.avatarUrl || null;

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
				</View>

				<ScrollView
					showsVerticalScrollIndicator={false}
					contentContainerStyle={styles.scrollContainer}>
					{/* Profile Header */}
					<View style={styles.profileHeader}>
						{avatarUri ? (
							<Image
								source={{ uri: avatarUri }}
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
									{(displayName || "K")
										.charAt(0)
										.toUpperCase()}
								</Text>
							</View>
						)}

						<Text style={[styles.userName, { color: colors.text }]}>
							{displayName}
						</Text>
						<Text
							style={[
								styles.userHandle,
								{ color: colors.textSecondary },
							]}>
							{userHandle}
						</Text>
						{userBio ? (
							<Text
								style={[
									styles.userBio,
									{ color: colors.textSecondary },
								]}>
								{userBio}
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

						{/* Sync durumu kartı */}
						{isLoggedIn && user ? (
							<TouchableOpacity
								style={[
									styles.syncCard,
									{
										backgroundColor: "rgba(16, 185, 129, 0.08)",
										borderColor: "rgba(16, 185, 129, 0.2)",
									},
								]}
								onPress={() => router.push("/(app)/settings/sync")}
								activeOpacity={0.75}>
								<Ionicons name="cloud-done-outline" size={18} color="#10B981" />
								<Text style={[styles.syncCardText, { color: "#10B981" }]}>
									Senkronizasyon Aktif • {user.email}
								</Text>
								<Ionicons name="chevron-forward" size={16} color="#10B981" />
							</TouchableOpacity>
						) : (
							<TouchableOpacity
								style={[
									styles.syncCard,
									{
										backgroundColor: "rgba(56, 189, 248, 0.08)",
										borderColor: "rgba(56, 189, 248, 0.2)",
									},
								]}
								onPress={() => router.push("/(auth)/login")}
								activeOpacity={0.75}>
								<Ionicons name="sync-outline" size={18} color="#38bdf8" />
								<Text style={styles.syncCardText}>
									Giriş yap ve verilerini tüm cihazlarında senkronize et
								</Text>
								<Ionicons name="chevron-forward" size={16} color="#38bdf8" />
							</TouchableOpacity>
						)}
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
								{continueWatching.length}
							</Text>
							<Text
								style={[
									styles.statLabel,
									{ color: colors.textSecondary },
								]}>
								Devam Eden
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
							onPress={() => setActiveTab("continue")}
							style={[
								styles.tab,
								{
									borderBottomColor:
										activeTab === "continue"
											? colors.primary
											: "transparent",
								},
							]}>
							<Text
								style={[
									styles.tabText,
									{
										color:
											activeTab === "continue"
												? colors.primary
												: colors.textSecondary,
										fontWeight:
											activeTab === "continue"
												? "bold"
												: "600",
									},
								]}>
								Devam Et
								{continueWatching.length > 0
									? ` (${continueWatching.length})`
									: ""}
							</Text>
						</TouchableOpacity>
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

					{/* Tab Content */}
					{activeTab === "continue" ? (
						<View style={styles.continueListContainer}>
							{continueWatching.length === 0 ? (
								<View style={styles.emptyState}>
									<Ionicons
										name="play-circle-outline"
										size={48}
										color={colors.textSecondary}
									/>
									<Text
										style={[
											styles.emptyText,
											{ color: colors.textSecondary },
										]}>
										Kaldığınız yerden devam edebileceğiniz
										içerik bulunmuyor
									</Text>
								</View>
							) : (
								continueWatching.map((item) => (
									<ContinueWatchingCard
										key={item.id}
										item={item}
										width="100%"
										style={styles.profileContinueCard}
										onPress={(it) => {
											if (it.url) {
												router.push({
													pathname: "/player",
													params: {
														url: it.url,
														title: it.title,
														subtitle:
															it.episodeTitle ||
															it.seriesTitle ||
															"",
														poster: it.poster,
														id: it.id,
														type:
															it.type || "movie",
														seriesId: it.seriesId,
														season: it.season,
														episode: it.episode,
														episodeTitle:
															it.episodeTitle,
														currentTime:
															it.currentTime,
													},
												});
											} else if (it.id) {
												router.push(
													`/(app)/MovieDetails/${it.id}`,
												);
											}
										}}
										onRemove={async (id) => {
											const updated =
												await removeContinueWatching(
													id,
												);
											setContinueWatching(updated);
										}}
									/>
								))
							)}
						</View>
					) : (
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
									keyExtractor={(item, index) =>
										String(item.id || item.url || index)
									}
									numColumns={3}
									scrollEnabled={false}
									columnWrapperStyle={styles.gridRow}
									renderItem={({ item }) => {
										const itemPlugin = resolvePluginName(item);
										return (
											<TouchableOpacity
												style={[
													styles.gridItem,
													{
														backgroundColor:
															colors.cardBg,
													},
												]}
												onPress={() =>
													handleItemPress(item)
												}
												activeOpacity={0.8}>
												<Image
													source={{
														uri:
															item.poster ||
															item.poster_url ||
															item.image ||
															item.backdrop_url,
													}}
													style={styles.gridImage}
													contentFit="cover"
													contentPosition="center"
													transition={150}
													cachePolicy="memory-disk"
												/>
												{/* Eklenti Adı Rozeti */}
												{itemPlugin ? (
													<View
														style={
															styles.pluginBadge
														}>
														<Text
															style={
																styles.pluginBadgeText
															}
															numberOfLines={1}>
															{itemPlugin}
														</Text>
													</View>
												) : null}
											</TouchableOpacity>
										);
									}}
								/>
							)}
						</View>
					)}
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
		overflow: "hidden",
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
		aspectRatio: 2 / 3,
		borderRadius: 8,
		overflow: "hidden",
	},
	gridImage: {
		width: "100%",
		height: "100%",
		borderRadius: 8,
		overflow: "hidden",
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
	continueListContainer: {
		paddingHorizontal: 16,
		paddingTop: 8,
		paddingBottom: 24,
		gap: 16,
	},
	profileContinueCard: {
		marginRight: 0,
		marginBottom: 4,
	},
	pluginBadge: {
		position: "absolute",
		top: 6,
		left: 6,
		backgroundColor: "rgba(15, 23, 42, 0.85)",
		paddingHorizontal: 6,
		paddingVertical: 2,
		borderRadius: 4,
		borderWidth: 0.5,
		borderColor: "rgba(255, 255, 255, 0.25)",
		maxWidth: "85%",
	},
	pluginBadgeText: {
		color: "#38bdf8",
		fontSize: 9,
		fontWeight: "700",
		textTransform: "uppercase",
		letterSpacing: 0.3,
	},
	syncCard: {
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: 14,
		paddingVertical: 10,
		borderRadius: 12,
		borderWidth: 1,
		marginTop: 14,
		gap: 10,
	},
	syncCardText: {
		flex: 1,
		fontSize: 13,
		fontWeight: "600",
		color: "#38bdf8",
		lineHeight: 18,
	},
});
