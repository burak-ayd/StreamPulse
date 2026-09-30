import PlatformList from "@/components/content/PlatformList";
import ContinueWatchingSection from "@/components/home/ContinueWatchingSection";
import HeroBanner from "@/components/home/HeroBanner";
import MovieCategorySection from "@/components/home/MovieCategorySection";
import BottomSheetModal from "@/components/modal/Bottomsheetmodal";
import {
	clearPluginCache,
	fetchPlatformCategories,
	fetchPlatforms,
	fetchRandomContents,
	getCachedCategories,
	getCachedHeroMovie,
} from "@/services/api";
import {
	NONE_PLATFORM,
	getContinueWatching,
	getDownloads,
	getPluginVisibilitySettings,
	getSelectedPlatform,
	getUserProfile,
	isFavorite,
	removeContinueWatching,
	saveSelectedPlatform,
	toggleFavorite,
} from "@/utils/storage";
import BottomNavigation from "@components/BottomNavigation";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
	ActivityIndicator,
	RefreshControl,
	ScrollView,
	StatusBar,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function Index() {
	const router = useRouter();
	const params = useLocalSearchParams();
	const insets = useSafeAreaInsets();

	const [selectedPlatform, setSelectedPlatform] = useState(null);
	const [loadingPlatform, setLoadingPlatform] = useState(true);
	const [categories, setCategories] = useState([]);
	const [featuredMovie, setFeaturedMovie] = useState(null);
	const [continueWatching, setContinueWatching] = useState([]);
	const [downloadedItems, setDownloadedItems] = useState([]);
	const [isInList, setIsInList] = useState(false);
	const [userAvatarUrl, setUserAvatarUrl] = useState("");
	const [isPlatformModalVisible, setIsPlatformModalVisible] = useState(false);
	const [refreshing, setRefreshing] = useState(false);
	const [visibleCount, setVisibleCount] = useState(6);

	const isNoneMode =
		!selectedPlatform ||
		selectedPlatform.id === "none" ||
		selectedPlatform.name === "None";

	const fetchUserData = useCallback(async () => {
		try {
			const [profile, downloads, continueList] =
				await Promise.all([
					getUserProfile(),
					getDownloads(),
					getContinueWatching(),
				]);
			if (profile?.avatarUrl) {
				setUserAvatarUrl(profile.avatarUrl);
			}
			setDownloadedItems(downloads || []);
			setContinueWatching(continueList || []);
		} catch (error) {
			console.error("Kullanıcı verisi yüklenirken hata:", error);
		}
	}, []);

	useFocusEffect(
		useCallback(() => {
			fetchUserData();
		}, [fetchUserData]),
	);

	const fetchPlatformData = useCallback(async (platform, force = false) => {
		if (!platform || platform.id === "none" || platform.name === "None") {
			setCategories([]);
			const downloads = await getDownloads();
			setDownloadedItems(downloads || []);
			if (downloads && downloads.length > 0) {
				setFeaturedMovie(downloads[0]);
			} else {
				setFeaturedMovie({
					id: "offline-placeholder",
					title: "Çevrimdışı İndirilenler",
					category: "Çevrimdışı Mod • İndirilen İçerikler",
					poster: "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=800&auto=format&fit=crop&q=60",
					is_offline: true,
				});
			}
			return;
		}

		// Check if we have cached data when not forcing refresh
		if (!force) {
			const cachedCats = getCachedCategories(platform.name);
			const cachedHero = getCachedHeroMovie(platform.name);
			if (cachedCats && cachedHero) {
				const catList = cachedCats?.categories || (Array.isArray(cachedCats) ? cachedCats : []);
				setCategories(catList);
				const heroItem = Array.isArray(cachedHero) && cachedHero.length > 0 ? cachedHero[0] : cachedHero;
				if (heroItem) {
					setFeaturedMovie(heroItem);
					isFavorite(heroItem.id || heroItem.url).then(fav => setIsInList(fav));
				}
				return;
			}
		}

		try {
			const [catRes, randRes] = await Promise.all([
				fetchPlatformCategories(platform.name, force),
				fetchRandomContents(platform.name, 1, force),
			]);

			const catList =
				catRes?.categories || (Array.isArray(catRes) ? catRes : []);
			setCategories(catList);

			const randomItem =
				Array.isArray(randRes) && randRes.length > 0
					? randRes[0]
					: null;

			if (randomItem) {
				setFeaturedMovie(randomItem);
				const fav = await isFavorite(
					randomItem.id || randomItem.url,
				);
				setIsInList(fav);
			}
		} catch (error) {
			console.error("Platform içeriği yüklenirken hata:", error);
		}
	}, []);

	// 1. Initial platform load: retrieve last selected platform or default to first/none
	useEffect(() => {
		let isMounted = true;

		async function initPlatform() {
			try {
				const [savedPlatform, platforms, visibility] = await Promise.all([
					getSelectedPlatform(),
					fetchPlatforms(),
					getPluginVisibilitySettings(),
				]);

				const list = Array.isArray(platforms) ? platforms : [];
				const visiblePlatforms = list.filter(
					(p) => visibility?.[p.name || p.id] !== false,
				);

				let platform = savedPlatform;
				// If currently saved platform is hidden, fallback to first visible or NONE_PLATFORM
				if (
					platform &&
					platform.id !== "none" &&
					visibility?.[platform.name || platform.id] === false
				) {
					platform = visiblePlatforms.length > 0 ? visiblePlatforms[0] : NONE_PLATFORM;
					await saveSelectedPlatform(platform);
				} else if (!platform) {
					if (visiblePlatforms.length > 0) {
						platform = visiblePlatforms[0];
						await saveSelectedPlatform(platform);
					} else {
						platform = NONE_PLATFORM;
						await saveSelectedPlatform(platform);
					}
				}

				if (isMounted && platform) {
					setSelectedPlatform(platform);
				}
			} catch (error) {
				console.error("Platform başlatılırken hata:", error);
				if (isMounted) {
					setSelectedPlatform(NONE_PLATFORM);
				}
			} finally {
				if (isMounted) {
					setLoadingPlatform(false);
				}
			}
		}

		initPlatform();
		// eslint-disable-next-line react-hooks/set-state-in-effect
		fetchUserData();

		return () => {
			isMounted = false;
		};
	}, [fetchUserData]);

	useEffect(() => {
		if (params?.openPlatforms === "true") {
			const timer = setTimeout(() => {
				setIsPlatformModalVisible(true);
			}, 50);
			return () => clearTimeout(timer);
		}
	}, [params?.openPlatforms]);

	useEffect(() => {
		if (selectedPlatform) {
			// eslint-disable-next-line react-hooks/set-state-in-effect
			fetchPlatformData(selectedPlatform, false);
		}
	}, [selectedPlatform, fetchPlatformData]);

	const onRefresh = useCallback(async () => {
		setRefreshing(true);
		if (selectedPlatform?.name) {
			clearPluginCache(selectedPlatform.name);
		}
		await Promise.all([
			fetchUserData(),
			selectedPlatform ? fetchPlatformData(selectedPlatform, true) : Promise.resolve(),
		]);
		setRefreshing(false);
	}, [fetchUserData, fetchPlatformData, selectedPlatform]);

	// Select a new platform from modal
	const handleSelectPlatform = async (platform) => {
		setIsPlatformModalVisible(false);
		if (platform) {
			await saveSelectedPlatform(platform);
			setSelectedPlatform(platform);
		}
	};

	// Open movie details / player
	const handleMoviePress = (movie) => {
		if (!movie || movie.id === "offline-placeholder") return;

		let movieWithPlugin = {
			...movie,
			plugin: movie.plugin || selectedPlatform?.name,
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
			movieWithPlugin.id ||
			encodeURIComponent(
				movieWithPlugin.url ||
					movieWithPlugin.slug ||
					movieWithPlugin.title,
			);

		router.push({
			pathname: "/(app)/MovieDetails/[id]",
			params: {
				id: movieId,
				movieData: JSON.stringify(movieWithPlugin),
			},
		});
	};

	const handleContinueWatchingPress = (item) => {
		if (item.url) {
			router.push({
				pathname: "/player",
				params: {
					url: item.url,
					title: item.title,
					subtitle: item.episodeTitle || item.seriesTitle || "",
					poster: item.poster,
					id: item.id,
					type: item.type || "movie",
					seriesId: item.seriesId,
					season: item.season,
					episode: item.episode,
					episodeTitle: item.episodeTitle,
					currentTime: item.currentTime,
				},
			});
		} else if (item.id) {
			handleMoviePress(item);
		}
	};

	const handleRemoveContinueWatching = async (id) => {
		const updated = await removeContinueWatching(id);
		setContinueWatching(updated);
	};

	const handleToggleFavorite = async () => {
		if (!featuredMovie || featuredMovie.id === "offline-placeholder") return;
		try {
			const updated = await toggleFavorite(featuredMovie);
			setIsInList(updated);
		} catch (error) {
			console.error("Favori güncellenirken hata:", error);
		}
	};

	// Search handler: Eklenti içi arama (Header'dan tetiklenince)
	const handleHeaderSearch = () => {
		if (!isNoneMode && selectedPlatform?.name) {
			router.push({
				pathname: "/(app)/search",
				params: { plugin: selectedPlatform.name },
			});
		} else {
			router.push("/(app)/search");
		}
	};

	return (
		<>
			<Stack.Screen options={{ headerShown: false }} />
			<View style={styles.container}>
				<StatusBar
					barStyle="light-content"
					translucent={true}
					backgroundColor="transparent"
				/>

				{loadingPlatform ? (
					<View style={styles.centerLoading}>
						<ActivityIndicator size="large" color="#2563EB" />
					</View>
				) : (
					<ScrollView
						showsVerticalScrollIndicator={false}
						contentContainerStyle={styles.scrollContent}
						refreshControl={
							<RefreshControl
								refreshing={refreshing}
								onRefresh={onRefresh}
								tintColor="#2563EB"
								progressViewOffset={insets.top + 20}
							/>
						}>
						{/* 1. Hero Featured Banner */}
						<HeroBanner
							movie={featuredMovie}
							platform={selectedPlatform}
							isInList={isInList}
							userAvatarUrl={userAvatarUrl}
							onPlayPress={() => handleMoviePress(featuredMovie)}
							onInfoPress={() => handleMoviePress(featuredMovie)}
							onToggleList={handleToggleFavorite}
							onPlatformPress={() =>
								setIsPlatformModalVisible(true)
							}
							onSearchPress={handleHeaderSearch}
							onProfilePress={() => router.push("/(app)/profile")}
						/>

						{/* 2. Offline Mode State or Normal Categories */}
						{isNoneMode ? (
							<View style={styles.offlineSection}>
								{/* Downloaded Items */}
								{downloadedItems.length > 0 ? (
									<View style={styles.sectionContainer}>
										<View style={styles.sectionHeader}>
											<Text style={styles.sectionTitle}>
												İndirilen İçerikler (
												{downloadedItems.length})
											</Text>
											<TouchableOpacity
												onPress={() =>
													router.push("/(app)/downloads")
												}>
												<Ionicons
													name="arrow-forward"
													size={18}
													color="#ffffff"
												/>
											</TouchableOpacity>
										</View>

										<ScrollView
											horizontal
											showsHorizontalScrollIndicator={false}
											contentContainerStyle={
												styles.horizontalList
											}>
											{downloadedItems.map(
												(item, index) => (
													<TouchableOpacity
														key={
															item.id ||
															`down-${index}`
														}
														style={
															styles.downloadCard
														}
														onPress={() =>
															handleMoviePress(item)
														}
														activeOpacity={0.8}>
														<View
															style={
																styles.downloadCardPoster
															}>
															<Ionicons
																name="play-circle"
																size={36}
																color="#ffffff"
															/>
														</View>
														<Text
															style={
																styles.downloadCardTitle
															}
															numberOfLines={1}>
															{item.title}
														</Text>
													</TouchableOpacity>
												),
											)}
										</ScrollView>
									</View>
								) : (
									/* Empty Offline Card */
									<View style={styles.offlineEmptyCard}>
										<Ionicons
											name="cloud-offline-outline"
											size={46}
											color="#6b7280"
										/>
										<Text style={styles.offlineEmptyTitle}>
											Henüz İndirilmiş İçerik Yok
										</Text>
										<Text
											style={styles.offlineEmptySubtitle}>
											Çevrimdışı izlemek için bir eklenti
											seçip içerikleri cihazınıza
											indirebilirsiniz.
										</Text>
										<TouchableOpacity
											style={styles.selectPlatformBtn}
											onPress={() =>
												setIsPlatformModalVisible(true)
											}
											activeOpacity={0.8}>
											<Ionicons
												name="grid-outline"
												size={16}
												color="#ffffff"
											/>
											<Text
												style={
													styles.selectPlatformBtnText
												}>
												Eklenti Seç
											</Text>
										</TouchableOpacity>
									</View>
								)}

								{/* Offline Continue Watching */}
								{continueWatching.length > 0 && (
									<ContinueWatchingSection
										items={continueWatching}
										onItemPress={handleContinueWatchingPress}
										onRemoveItem={handleRemoveContinueWatching}
										onSeeAllPress={() =>
											router.push({
												pathname: "/(app)/profile",
												params: { tab: "continue" },
											})
										}
									/>
								)}
							</View>
						) : (
							/* Online Normal Mode */
							<>
								{/* Continue Watching ("Kaldığın Yerden Devam Et") */}
								{continueWatching.length > 0 && (
									<ContinueWatchingSection
										items={continueWatching}
										onItemPress={handleContinueWatchingPress}
										onRemoveItem={handleRemoveContinueWatching}
										onSeeAllPress={() =>
											router.push({
												pathname: "/(app)/profile",
												params: { tab: "continue" },
											})
										}
									/>
								)}

								{/* Platform Dynamic Category Sections */}
								{categories
									.slice(0, visibleCount)
									.map((category, index) => (
										<MovieCategorySection
											key={
												category.url ||
												category.name ||
												index
											}
											platformName={
												selectedPlatform?.name
											}
											category={category}
											onMoviePress={handleMoviePress}
											onSeeAll={(cat) => {
												// Optional see all
											}}
										/>
									))}

								{/* Load more categories button */}
								{visibleCount < categories.length && (
									<View style={styles.loadMoreContainer}>
										<TouchableOpacity
											style={styles.loadMoreButton}
											onPress={() =>
												setVisibleCount(
													(prev) => prev + 5,
												)
											}
											activeOpacity={0.8}>
											<Text style={styles.loadMoreText}>
												Daha Fazla Kategori Göster (
												{categories.length -
													visibleCount}
												)
											</Text>
										</TouchableOpacity>
									</View>
								)}
							</>
						)}
					</ScrollView>
				)}

				{/* Bottom Navigation */}
				<BottomNavigation activeRoute="/(app)" />

				{/* Platform Selection Bottom Sheet Modal */}
				<BottomSheetModal
					visible={isPlatformModalVisible}
					onClose={() => setIsPlatformModalVisible(false)}
					snapToHeight={0.78}
					fitContent={false}
					title=""
					opacity={0.7}
					handle={true}
					closeOnBackdrop={true}
					swipeable={true}>
					<PlatformList
						onSelectPlatform={handleSelectPlatform}
					/>
				</BottomSheetModal>
			</View>
		</>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: "#0d0e12",
	},
	centerLoading: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
	},
	scrollContent: {
		paddingBottom: 24,
	},
	offlineSection: {
		paddingTop: 8,
	},
	sectionContainer: {
		marginBottom: 20,
	},
	sectionHeader: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		paddingHorizontal: 18,
		marginBottom: 10,
	},
	sectionTitle: {
		color: "#ffffff",
		fontSize: 16,
		fontWeight: "700",
	},
	horizontalList: {
		paddingHorizontal: 18,
		gap: 12,
	},
	downloadCard: {
		width: 130,
	},
	downloadCardPoster: {
		width: 130,
		height: 85,
		borderRadius: 10,
		backgroundColor: "#161b22",
		borderWidth: 1,
		borderColor: "rgba(255, 255, 255, 0.08)",
		justifyContent: "center",
		alignItems: "center",
	},
	downloadCardTitle: {
		color: "#ffffff",
		fontSize: 12,
		fontWeight: "600",
		marginTop: 6,
	},
	offlineEmptyCard: {
		marginHorizontal: 18,
		marginVertical: 16,
		padding: 28,
		borderRadius: 16,
		backgroundColor: "#161b22",
		borderWidth: 1,
		borderColor: "rgba(255, 255, 255, 0.06)",
		alignItems: "center",
	},
	offlineEmptyTitle: {
		color: "#ffffff",
		fontSize: 17,
		fontWeight: "700",
		marginTop: 12,
	},
	offlineEmptySubtitle: {
		color: "#9ca3af",
		fontSize: 13,
		textAlign: "center",
		marginTop: 6,
		marginBottom: 18,
		lineHeight: 18,
	},
	selectPlatformBtn: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: "#2563EB",
		paddingHorizontal: 18,
		paddingVertical: 10,
		borderRadius: 20,
		gap: 6,
	},
	selectPlatformBtnText: {
		color: "#ffffff",
		fontSize: 14,
		fontWeight: "600",
	},
	loadMoreContainer: {
		paddingVertical: 16,
		alignItems: "center",
	},
	loadMoreButton: {
		paddingVertical: 10,
		paddingHorizontal: 22,
		borderRadius: 20,
		borderWidth: 1,
		borderColor: "rgba(255, 255, 255, 0.15)",
		backgroundColor: "#161b22",
	},
	loadMoreText: {
		color: "#38bdf8",
		fontSize: 13,
		fontWeight: "600",
	},
});
