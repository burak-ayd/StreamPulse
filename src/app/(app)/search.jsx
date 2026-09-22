import BottomNavigation from "@components/BottomNavigation";
import { useThemeContext } from "@context/ThemeContext";
import { searchContent } from "@/services/api";
import {
	addToSearchHistory,
	clearSearchHistory,
	getSearchHistory,
	removeFromSearchHistory,
} from "@/utils/storage";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import { Stack, useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
	ActivityIndicator,
	Keyboard,
	ScrollView,
	StatusBar,
	StyleSheet,
	Text,
	TextInput,
	TouchableOpacity,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// Arama ekranı hafıza önbelleği:
// Yalnızca arama sonuçlarından bir içeriğe (MovieDetails) tıklanıp geri gelindiğinde korunur.
// Ana sayfaya veya başka bir sekmeye gidildiğinde tamamen sıfırlanır.
let searchMemoryCache = {
	searchQuery: "",
	lastSearchedQuery: "",
	results: [],
	hasSearched: false,
	scrollPosition: 0,
};

// Sadece arama sonucundaki bir detay sayfasına gidilip gidilmediğini takip eden bayrak
let isNavigatingToDetail = false;

export const resetSearchMemoryCache = () => {
	searchMemoryCache = {
		searchQuery: "",
		lastSearchedQuery: "",
		results: [],
		hasSearched: false,
		scrollPosition: 0,
	};
};

export default function SearchScreen() {
	const { theme, colors } = useThemeContext();
	const router = useRouter();
	const scrollViewRef = useRef(null);

	const [searchQuery, setSearchQuery] = useState(
		searchMemoryCache.searchQuery,
	);
	const [lastSearchedQuery, setLastSearchedQuery] = useState(
		searchMemoryCache.lastSearchedQuery,
	);
	const [results, setResults] = useState(searchMemoryCache.results);
	const [loading, setLoading] = useState(false);
	const [hasSearched, setHasSearched] = useState(
		searchMemoryCache.hasSearched,
	);
	const [searchHistory, setSearchHistory] = useState([]);

	// Ekran yaşam döngüsü yönetimi:
	// Arama sayfasından çıkıldığında, eğer bir film/dizi detayına gidilmediyse
	// (yani ana sayfa, keşfet veya başka bir sayfaya gidildiyse) arama sıfırlanır.
	useEffect(() => {
		isNavigatingToDetail = false;

		// Kayıtlı arama geçmişini AsyncStorage'dan yükle
		getSearchHistory().then((history) => {
			setSearchHistory(history || []);
		});

		return () => {
			// Arama sayfasındaki listelenen içerikler DIŞINDA bir yere gidilirse sıfırla
			if (!isNavigatingToDetail) {
				resetSearchMemoryCache();
			}
		};
	}, []);

	// İçerik boyutu hazır olduğunda önceki kaydırma konumunu (scroll) geri yükle
	const handleContentSizeChange = () => {
		if (searchMemoryCache.scrollPosition > 0 && scrollViewRef.current) {
			scrollViewRef.current.scrollTo({
				y: searchMemoryCache.scrollPosition,
				animated: false,
			});
		}
	};

	// Aramayı başlatan fonksiyon (Buton, Enter veya geçmiş öğesine basınca)
	const handleSearch = async (queryOverride) => {
		const target = (
			typeof queryOverride === "string" ? queryOverride : searchQuery
		).trim();

		if (!target) return;

		Keyboard.dismiss();
		setSearchQuery(target);
		setLoading(true);
		setHasSearched(true);
		setLastSearchedQuery(target);

		// Arama geçmişine ekle ve listeyi güncelle
		addToSearchHistory(target).then((updated) => {
			if (updated) setSearchHistory(updated);
		});

		// Bellek önbelleğini güncelle
		searchMemoryCache.searchQuery = target;
		searchMemoryCache.lastSearchedQuery = target;
		searchMemoryCache.hasSearched = true;
		searchMemoryCache.scrollPosition = 0; // Yeni aramada scroll'u başa al

		try {
			const data = await searchContent(target);
			const list = Array.isArray(data) ? data : [];
			setResults(list);
			searchMemoryCache.results = list;
		} catch (error) {
			console.error("Arama hatası:", error);
			setResults([]);
			searchMemoryCache.results = [];
		} finally {
			setLoading(false);
		}
	};

	// Geçmişten tekil arama sorgusunu sil
	const handleDeleteHistoryItem = async (queryToDelete) => {
		const updated = await removeFromSearchHistory(queryToDelete);
		setSearchHistory(updated || []);
	};

	// Tüm geçmişi temizle
	const handleClearAllHistory = async () => {
		await clearSearchHistory();
		setSearchHistory([]);
	};

	// Arama alanını ve sonuçları sıfırla
	const clearSearch = () => {
		setSearchQuery("");
		setResults([]);
		setHasSearched(false);
		setLastSearchedQuery("");
		resetSearchMemoryCache();
	};

	// Sonuçları plugin (kaynak) bazında gruplandır
	const groupedResults = useMemo(() => {
		if (!results || results.length === 0) return {};
		return results.reduce((acc, item) => {
			const pluginName = item.plugin || "Diğer";
			if (!acc[pluginName]) {
				acc[pluginName] = [];
			}
			acc[pluginName].push(item);
			return acc;
		}, {});
	}, [results]);

	const pluginKeys = useMemo(
		() => Object.keys(groupedResults),
		[groupedResults],
	);

	// Arama listesindeki bir içeriğin detayına yönlendir:
	// Bu geçişte aramanın ve scroll konumunun korunması için bayrak işaretlenir.
	const handleItemPress = (item) => {
		isNavigatingToDetail = true;

		const movieWithPlugin = {
			...item,
			plugin: item.plugin,
		};
		const movieId =
			item.id ||
			encodeURIComponent(item.url || item.slug || item.title);

		router.push({
			pathname: "/(app)/MovieDetails/[id]",
			params: {
				id: movieId,
				movieData: JSON.stringify(movieWithPlugin),
			},
		});
	};

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

				{/* Header */}
				<View
					style={[
						styles.header,
						{
							borderBottomColor: colors.border,
							backgroundColor: colors.bg,
						},
					]}>
					<Text style={[styles.headerTitle, { color: colors.text }]}>
						Arama
					</Text>
				</View>

				{/* Search Input & Button Row */}
				<View style={styles.searchContainer}>
					<View style={styles.searchRow}>
						<View
							style={[
								styles.searchInputWrapper,
								{
									backgroundColor: colors.cardBg,
									borderColor: colors.border,
								},
							]}>
							<Ionicons
								name="search"
								size={20}
								color={colors.textSecondary}
							/>
							<TextInput
								style={[
									styles.searchInput,
									{ color: colors.text },
								]}
								placeholder="Film veya dizi ara..."
								placeholderTextColor={colors.textSecondary}
								value={searchQuery}
								onChangeText={(text) => {
									setSearchQuery(text);
									searchMemoryCache.searchQuery = text;
								}}
								onSubmitEditing={() => handleSearch()}
								returnKeyType="search"
								autoCorrect={false}
								autoCapitalize="none"
							/>
							{searchQuery.length > 0 && (
								<TouchableOpacity
									onPress={clearSearch}
									hitSlop={{
										top: 10,
										bottom: 10,
										left: 10,
										right: 10,
									}}>
									<Ionicons
										name="close-circle"
										size={18}
										color={colors.textSecondary}
									/>
								</TouchableOpacity>
							)}
						</View>

						{/* Arama Butonu */}
						<TouchableOpacity
							style={[
								styles.searchButton,
								{
									backgroundColor: colors.primary,
									opacity:
										searchQuery.trim().length === 0 || loading
											? 0.6
											: 1,
								},
							]}
							onPress={() => handleSearch()}
							disabled={searchQuery.trim().length === 0 || loading}
							activeOpacity={0.8}>
							{loading ? (
								<ActivityIndicator size="small" color="#fff" />
							) : (
								<>
									<Ionicons name="search" size={16} color="#fff" />
									<Text style={styles.searchButtonText}>Ara</Text>
								</>
							)}
						</TouchableOpacity>
					</View>
				</View>

				<ScrollView
					ref={scrollViewRef}
					onScroll={(e) => {
						searchMemoryCache.scrollPosition =
							e.nativeEvent.contentOffset.y;
					}}
					scrollEventThrottle={32}
					onContentSizeChange={handleContentSizeChange}
					showsVerticalScrollIndicator={false}
					keyboardShouldPersistTaps="handled"
					contentContainerStyle={styles.scrollContainer}>
					{/* Yükleniyor Durumu */}
					{loading && (
						<View style={styles.centerState}>
							<ActivityIndicator
								size="large"
								color={colors.primary}
							/>
							<Text
								style={[
									styles.stateSubText,
									{ color: colors.textSecondary },
								]}>
								"{lastSearchedQuery}" aranıyor...
							</Text>
						</View>
					)}

					{/* Arama Yapılmamışsa veya Arama Kutusu Boşsa Arama Geçmişi & Başlangıç Bilgisi */}
					{!loading && (!hasSearched || searchQuery.trim().length === 0) && (
						<View style={styles.historyContainer}>
							{/* Arama Geçmişi Bölümü */}
							{searchHistory.length > 0 && (
								<View style={styles.historySection}>
									<View style={styles.historyHeader}>
										<View style={styles.historyTitleRow}>
											<Ionicons
												name="time-outline"
												size={18}
												color={colors.text}
											/>
											<Text
												style={[
													styles.historyTitle,
													{ color: colors.text },
												]}>
												Son Aramalar
											</Text>
										</View>
										<TouchableOpacity
											onPress={handleClearAllHistory}
											hitSlop={{
												top: 8,
												bottom: 8,
												left: 8,
												right: 8,
											}}>
											<Text
												style={[
													styles.clearHistoryText,
													{ color: colors.primary },
												]}>
												Tümünü Temizle
											</Text>
										</TouchableOpacity>
									</View>

									{/* Geçmiş Öğeleri Listesi */}
									<View style={styles.historyList}>
										{searchHistory.map((item, index) => (
											<TouchableOpacity
												key={`${item}-${index}`}
												style={[
													styles.historyItem,
													{
														backgroundColor:
															colors.cardBg,
														borderColor:
															colors.border,
													},
												]}
												activeOpacity={0.7}
												onPress={() => handleSearch(item)}>
												<View style={styles.historyItemContent}>
													<Ionicons
														name="search-outline"
														size={16}
														color={
															colors.textSecondary
														}
													/>
													<Text
														style={[
															styles.historyItemText,
															{ color: colors.text },
														]}
														numberOfLines={1}>
														{item}
													</Text>
												</View>
												<TouchableOpacity
													onPress={() =>
														handleDeleteHistoryItem(
															item,
														)
													}
													hitSlop={{
														top: 10,
														bottom: 10,
														left: 10,
														right: 10,
													}}>
													<Ionicons
														name="close"
														size={16}
														color={
															colors.textSecondary
														}
													/>
												</TouchableOpacity>
											</TouchableOpacity>
										))}
									</View>
								</View>
							)}

							{/* Bilgi Kartı */}
							<View style={styles.centerState}>
								<Ionicons
									name="film-outline"
									size={52}
									color={colors.textSecondary}
								/>
								<Text
									style={[
										styles.stateTitle,
										{ color: colors.text },
									]}>
									Favori İçeriklerinizi Arayın
								</Text>
								<Text
									style={[
										styles.stateSubText,
										{ color: colors.textSecondary },
									]}>
									Dizibox, HDFilmCehennemi ve diğer tüm kaynaklarda
									hızlıca arama yapabilirsiniz.
								</Text>
							</View>
						</View>
					)}

					{/* Sonuç Bulunamadı Durumu */}
					{!loading && hasSearched && results.length === 0 && searchQuery.trim().length > 0 && (
						<View style={styles.centerState}>
							<Ionicons
								name="alert-circle-outline"
								size={56}
								color={colors.textSecondary}
							/>
							<Text
								style={[
									styles.stateTitle,
									{ color: colors.text },
								]}>
								Sonuç Bulunamadı
							</Text>
							<Text
								style={[
									styles.stateSubText,
									{ color: colors.textSecondary },
								]}>
								"{lastSearchedQuery}" için hiçbir kaynakta içerik
								bulunamadı.
							</Text>
						</View>
					)}

					{/* Gruplandırılmış Sonuçlar */}
					{!loading && hasSearched && pluginKeys.length > 0 && searchQuery.trim().length > 0 && (
						<View style={styles.resultsContainer}>
							<Text
								style={[
									styles.totalCountText,
									{ color: colors.textSecondary },
								]}>
								"{lastSearchedQuery}" için toplam {results.length}{" "}
								sonuç bulundu
							</Text>

							{pluginKeys.map((pluginName) => {
								const items = groupedResults[pluginName] || [];
								return (
									<View
										key={pluginName}
										style={styles.pluginSection}>
										{/* Plugin Başlığı */}
										<View style={styles.pluginHeader}>
											<View style={styles.pluginHeaderTitleRow}>
												<Ionicons
													name="server-outline"
													size={16}
													color={colors.primary}
												/>
												<Text
													style={[
														styles.pluginTitle,
														{ color: colors.text },
													]}>
													{pluginName}
												</Text>
											</View>
											<View
												style={[
													styles.countBadge,
													{
														backgroundColor:
															colors.primary + "1A",
													},
												]}>
												<Text
													style={[
														styles.countBadgeText,
														{
															color: colors.primary,
														},
													]}>
													{items.length} sonuç
												</Text>
											</View>
										</View>

										{/* Plugin İçerikleri */}
										<View style={styles.cardsList}>
											{items.map((item, index) => {
												const posterUri =
													item.poster ||
													item.poster_url ||
													item.image;

												return (
													<TouchableOpacity
														key={
															item.url ||
															`${pluginName}-${index}`
														}
														style={[
															styles.resultCard,
															{
																backgroundColor:
																	colors.cardBg,
																borderColor:
																	colors.border,
															},
														]}
														activeOpacity={0.75}
														onPress={() =>
															handleItemPress(item)
														}>
														{/* Poster Görseli */}
														{posterUri ? (
															<Image
																source={{
																	uri: posterUri,
																}}
																style={
																	styles.posterImage
																}
																contentFit="cover"
																transition={150}
																cachePolicy="memory-disk"
															/>
														) : (
															<View
																style={[
																	styles.posterPlaceholder,
																	{
																		backgroundColor:
																			colors.border,
																	},
																]}>
																<Ionicons
																	name="film-outline"
																	size={24}
																	color={
																		colors.textSecondary
																	}
																/>
															</View>
														)}

														{/* İçerik Bilgileri */}
														<View
															style={
																styles.cardDetails
															}>
															<Text
																style={[
																	styles.itemTitle,
																	{
																		color: colors.text,
																	},
																]}
																numberOfLines={2}>
																{item.title}
															</Text>

															<View
																style={
																	styles.badgesRow
																}>
																{/* Medya Türü (Film / Dizi) */}
																{item.media_type && (
																	<View
																		style={[
																			styles.typeBadge,
																			{
																				backgroundColor:
																					item.media_type
																						?.toLowerCase()
																						?.includes(
																							"dizi",
																						)
																						? "#6366f120"
																						: "#ec489920",
																			},
																		]}>
																		<Text
																			style={[
																				styles.typeBadgeText,
																				{
																					color: item.media_type
																						?.toLowerCase()
																						?.includes(
																							"dizi",
																						)
																						? "#6366f1"
																						: "#ec4899",
																				},
																			]}>
																			{item.media_type}
																		</Text>
																	</View>
																)}

																{/* Yıl */}
																{item.year && (
																	<Text
																		style={[
																			styles.metaText,
																			{
																				color: colors.textSecondary,
																			},
																		]}>
																		{item.year}
																	</Text>
																)}

																{/* Rating */}
																{item.rating && (
																	<View
																		style={
																			styles.ratingRow
																		}>
																		<Ionicons
																			name="star"
																			size={12}
																			color="#F5C518"
																		/>
																		<Text
																			style={
																				styles.ratingText
																			}>
																			{item.rating}
																		</Text>
																	</View>
																)}
															</View>
														</View>

														{/* Sağ Ok */}
														<Ionicons
															name="chevron-forward"
															size={18}
															color={
																colors.textSecondary
															}
															style={styles.chevron}
														/>
													</TouchableOpacity>
												);
											})}
										</View>
									</View>
								);
							})}
						</View>
					)}
				</ScrollView>

				<BottomNavigation activeRoute="/(app)/search" />
			</SafeAreaView>
		</>
	);
}

const styles = StyleSheet.create({
	safeArea: {
		flex: 1,
	},
	header: {
		height: 56,
		justifyContent: "center",
		alignItems: "center",
		borderBottomWidth: 1,
	},
	headerTitle: {
		fontSize: 18,
		fontWeight: "bold",
		letterSpacing: -0.015,
	},
	scrollContainer: {
		paddingBottom: 80,
	},
	searchContainer: {
		paddingHorizontal: 16,
		paddingTop: 12,
		paddingBottom: 8,
	},
	searchRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
	},
	searchInputWrapper: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: 12,
		borderRadius: 12,
		height: 48,
		borderWidth: 1,
		gap: 8,
	},
	searchInput: {
		flex: 1,
		fontSize: 15,
		paddingVertical: 0,
	},
	searchButton: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		height: 48,
		paddingHorizontal: 16,
		borderRadius: 12,
		gap: 6,
	},
	searchButtonText: {
		color: "#ffffff",
		fontSize: 14,
		fontWeight: "600",
	},
	historyContainer: {
		paddingHorizontal: 16,
		paddingTop: 8,
	},
	historySection: {
		marginBottom: 20,
	},
	historyHeader: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginBottom: 12,
	},
	historyTitleRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
	},
	historyTitle: {
		fontSize: 15,
		fontWeight: "700",
	},
	clearHistoryText: {
		fontSize: 13,
		fontWeight: "600",
	},
	historyList: {
		gap: 8,
	},
	historyItem: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: 14,
		paddingVertical: 12,
		borderRadius: 10,
		borderWidth: 1,
	},
	historyItemContent: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		marginRight: 8,
	},
	historyItemText: {
		fontSize: 14,
		fontWeight: "500",
	},
	centerState: {
		alignItems: "center",
		justifyContent: "center",
		paddingVertical: 60,
		paddingHorizontal: 32,
		gap: 12,
	},
	stateTitle: {
		fontSize: 17,
		fontWeight: "700",
		textAlign: "center",
	},
	stateSubText: {
		fontSize: 14,
		textAlign: "center",
		lineHeight: 20,
	},
	resultsContainer: {
		paddingHorizontal: 16,
		paddingTop: 8,
	},
	totalCountText: {
		fontSize: 13,
		fontWeight: "500",
		marginBottom: 12,
	},
	pluginSection: {
		marginBottom: 24,
	},
	pluginHeader: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginBottom: 10,
	},
	pluginHeaderTitleRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
	},
	pluginTitle: {
		fontSize: 16,
		fontWeight: "700",
	},
	countBadge: {
		paddingHorizontal: 8,
		paddingVertical: 3,
		borderRadius: 12,
	},
	countBadgeText: {
		fontSize: 12,
		fontWeight: "600",
	},
	cardsList: {
		gap: 10,
	},
	resultCard: {
		flexDirection: "row",
		alignItems: "center",
		borderRadius: 12,
		borderWidth: 1,
		padding: 8,
		gap: 12,
	},
	posterImage: {
		width: 58,
		height: 82,
		borderRadius: 8,
	},
	posterPlaceholder: {
		width: 58,
		height: 82,
		borderRadius: 8,
		justifyContent: "center",
		alignItems: "center",
	},
	cardDetails: {
		flex: 1,
		justifyContent: "center",
		gap: 6,
	},
	itemTitle: {
		fontSize: 14,
		fontWeight: "600",
		lineHeight: 18,
	},
	badgesRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		flexWrap: "wrap",
	},
	typeBadge: {
		paddingHorizontal: 6,
		paddingVertical: 2,
		borderRadius: 6,
	},
	typeBadgeText: {
		fontSize: 11,
		fontWeight: "600",
	},
	metaText: {
		fontSize: 12,
		fontWeight: "500",
	},
	ratingRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 3,
	},
	ratingText: {
		fontSize: 12,
		fontWeight: "700",
		color: "#F5C518",
	},
	chevron: {
		paddingRight: 4,
	},
});
