import BottomNavigation from "@components/BottomNavigation";
import { useNavLayout } from "@/hooks/useNavLayout";
import TVPressable from "@components/common/TVPressable";
import { SkeletonBlock, SkeletonLine } from "@components/common/Skeleton";
import { useThemeContext } from "@context/ThemeContext";
import { searchContent, searchPluginContent } from "@/services/api";
import {
	addToSearchHistory,
	clearSearchHistory,
	getSearchHistory,
	getSelectedPlatform,
	removeFromSearchHistory,
} from "@/utils/storage";
import { useTvMetrics } from "@/utils/tvMetrics";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import Image from "@/components/common/SmartImage";
import {
	Stack,
	useFocusEffect,
	useLocalSearchParams,
	useRouter,
} from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	ActivityIndicator,
	BackHandler,
	Keyboard,
	ScrollView,
	StatusBar,
	StyleSheet,
	Text,
	TextInput,
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

/**
 * Backend'in `/api/search` yanıtındaki `durum` nesnesini ekranda
 * gösterilecek bir görünüme çevirir.
 *
 * Neden gerekli? `durum` YALNIZCA sorun varsa gelir ve içinde üç farklı
 * bilgi taşıyabilir:
 *
 *   1) `kullanim_disi` — devreye girmiş kaynaklar. Bunlar "geçici olarak
 *      kullanım dışı"dir ve `mesaj` alanı daima doludur.
 *   2) `dusenler` — yalnızca BU aramada hata vermiş kaynaklar. Devre henüz
 *      açılmamıştır, dolayısıyla `mesaj` boştur. Bu kaynaklar "kullanım
 *      dışı" DEĞİLDİR; sadece bu sorguyu karşılamadı.
 *   3) `mesaj` — backend'in özeti (çoğunlukla 1. durum için).
 *
 * Bu ayrım önemli: 2. durumda "kullanım dışı" demek yanlış bilgi olurdu.
 * (Gerçek backend yanıtında bu ayrım ölçülerek doğrulandı: devre henüz
 * açılmamışken `kullanim_disi` ve `mesaj` boş, yalnızca `dusenler` dolu.)
 *
 * @returns {{baslik: string, satirlar: string[], not: string|null}|null}
 */
function durumGorunum(durum) {
	if (!durum) return null;

	const devreli = durum.kullanim_disi ?? [];
	const dusenler = durum.dusenler ?? [];

	// 1) Devreye girmiş kaynaklar — en bilgilendirici durum.
	if (devreli.length > 0) {
		const n = devreli.length;
		return {
			baslik:
				durum.mesaj ||
				`${n} kaynak geçici olarak kullanım dışı: ` +
					devreli.map((k) => k.eklenti).join(", "),
			satirlar: devreli.map((k) => k.mesaj || `${k.eklenti} kullanım dışı`),
			not:
				n > 1 && durum.basarili > 0
					? "Sonuçlar diğer kaynaklardan geliyor."
					: null,
		};
	}

	// 2) Yalnızca bu aramada düşen kaynaklar — devre henüz açılmamış.
	if (dusenler.length > 0) {
		const adlar = dusenler
			.map((d) => d.eklenti)
			.filter(Boolean)
			.filter((v, i, a) => a.indexOf(v) === i); // yinelenenleri at
		const n = adlar.length || dusenler.length;
		return {
			baslik:
				durum.mesaj ||
				`${n} kaynak bu aramayı karşılayamadı` +
					(adlar.length ? `: ${adlar.join(", ")}` : ""),
			satirlar: adlar.map((a) => `${a} yanıt vermedi`),
			not:
				durum.basarili > 0
					? "Sonuçlar diğer kaynaklardan geliyor."
					: null,
		};
	}

	// 3) Adı geçen kaynak yok — yalnızca genel durum.
	return {
		baslik: durum.mesaj || "Arama kısmen tamamlanamadı.",
		satirlar: [],
		not: null,
	};
}

export default function SearchScreen() {
	const { theme, colors } = useThemeContext();
	const router = useRouter();
	// Sol ray (TV / tablet yatay) varken icerik sola kayar.
	const { contentPaddingLeft } = useNavLayout();
	// TV: arama kutusu, kapsam hapları ve sonuç ızgarası ekranı
	// kenardan kenara dolduruyordu. `contentMaxWidth` hepsini ortalanmış
	// bir sütuna toplar; telefon/tablette değer `undefined`, yerleşim aynen
	// korunur.
	const { contentMaxWidth, gutter } = useTvMetrics();
	const params = useLocalSearchParams();
	const scrollViewRef = useRef(null);

	const [activePlugin, setActivePlugin] = useState(params?.plugin || "");
	const [searchScope, setSearchScope] = useState(
		params?.plugin ? "plugin" : "all",
	);

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

	/*
	 * Arama sırasında düşen kaynakların durumu.
	 *
	 * Backend `durum` alanını YALNIZCA sorun varsa gönderir; tam başarılı
	 * aramada `null` gelir ve banner hiç render edilmez. Bu, ekranın normal
	 * kullanımda tamamen değişmemiş kalmasını sağlar.
	 */
	const [sourceStatus, setSourceStatus] = useState(null);

	// `durum` nesnesini ekran metnine çevirir. useMemo: aynı `durum`
	// nesnesi için yeniden hesaplanmaz.
	const sourceStatusView = useMemo(
		() => durumGorunum(sourceStatus),
		[sourceStatus],
	);

	useEffect(() => {
		if (params?.plugin) {
			// eslint-disable-next-line react-hooks/set-state-in-effect
			setActivePlugin(params.plugin);
			setSearchScope("plugin");
		} else {
			getSelectedPlatform().then((p) => {
				if (p && p.name && p.name !== "None") {
					setActivePlugin(p.name);
				}
			});
		}
	}, [params?.plugin]);

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
	const handleSearch = async (queryOverride, scopeOverride) => {
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

		const targetScope = scopeOverride || searchScope;

		try {
			// `searchContent` / `searchPluginContent` artık
			// `{ results, durum }` döner. `durum` yalnızca bir kaynak
			// çöktüğünde gelir ve "neden az sonuç var" sorusunu yanıtlar.
			let list;
			let durum = null;

			if (targetScope === "plugin" && activePlugin) {
				({ results: list, durum } = await searchPluginContent(
					activePlugin,
					target,
				));
			} else {
				({ results: list, durum } = await searchContent(target));
			}

			const sonuclar = Array.isArray(list) ? list : [];
			setResults(sonuclar);
			searchMemoryCache.results = sonuclar;

			// Kaynak durumunu göster: devrede olan kaynakları kullanıcıya
			// bildir. Tam başarıda `durum` null gelir ve banner gizlenir.
			setSourceStatus(durum ?? null);
		} catch (error) {
			console.error("Arama hatası:", error);
			setResults([]);
			searchMemoryCache.results = [];
			setSourceStatus(null);
		} finally {
			setLoading(false);
		}
	};

	const handleScopeChange = (newScope) => {
		setSearchScope(newScope);
		if (searchQuery.trim().length > 0) {
			handleSearch(searchQuery, newScope);
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

	// ODAK'a bağlı kayıt: ekran odakta değilken geri tuşunu yutmaz;
	// sorgu/sonuç varken ilk basış aramayı temizler, sonraki geri gider.
	// (Tanım sırası: `clearSearch` bildirildikten SONRA gelir.)
	useFocusEffect(
		useCallback(() => {
			const onBackPress = () => {
				if (results.length > 0 || searchQuery.length > 0 || hasSearched) {
					clearSearch();
					return true;
				}
				if (router.canGoBack()) router.back();
				else router.replace("/(app)");
				return true;
			};

			const subscription = BackHandler.addEventListener(
				"hardwareBackPress",
				onBackPress,
			);
			return () => subscription.remove();
		}, [results.length, searchQuery, hasSearched, router]),
	);

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
				style={[styles.safeArea, { backgroundColor: colors.bg, paddingLeft: contentPaddingLeft }]}>
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
						// TV: başlık da ortalanmış sütunla hizalansın ki
						// "Arama" yazısı sonuçların üstünde ortada dursun.
						contentMaxWidth
							? { width: "100%", maxWidth: contentMaxWidth, alignSelf: "center" }
							: null,
					]}>
					<Text style={[styles.headerTitle, { color: colors.text }]}>
						Arama
					</Text>
				</View>

				{/* Search Input & Button Row */}
				<View
					style={[
						styles.searchContainer,
						contentMaxWidth
							? { width: "100%", maxWidth: contentMaxWidth, alignSelf: "center" }
							: null,
					]}>
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
								placeholder={
									searchScope === "plugin" && activePlugin
										? `${activePlugin} içinde ara...`
										: "Tüm eklentilerde ara..."
								}
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
								<TVPressable
									onPress={clearSearch}
									style={({ focused }) => [
										focused && styles.iconButtonFocused,
									]}
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
								</TVPressable>
							)}
						</View>

						{/* Arama Butonu */}
						<TVPressable
							style={({ focused }) => [
								styles.searchButton,
								{
									backgroundColor: colors.primary,
									opacity:
										searchQuery.trim().length === 0 || loading
											? 0.6
											: 1,
								},
								focused && styles.searchButtonFocused,
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
						</TVPressable>
					</View>

					{/* Arama Kapsamı (Genel vs Eklenti İçi) */}
					<View style={styles.scopeRow}>
						<TVPressable
							style={({ focused }) => [
								styles.scopePill,
								searchScope === "all"
									? styles.scopePillActive
									: {
											backgroundColor: colors.cardBg,
											borderColor: colors.border,
										},
								focused && styles.scopePillFocused,
							]}
							onPress={() => handleScopeChange("all")}
							activeOpacity={0.7}>
							<Ionicons
								name="globe-outline"
								size={13}
								color={
									searchScope === "all"
										? "#ffffff"
										: colors.textSecondary
								}
							/>
							<Text
								style={[
									styles.scopeText,
									{
										color:
											searchScope === "all"
												? "#ffffff"
												: colors.textSecondary,
										fontWeight:
											searchScope === "all" ? "700" : "500",
									},
								]}>
								Genel Arama
							</Text>
						</TVPressable>

						{activePlugin ? (
							<TVPressable
								style={({ focused }) => [
									styles.scopePill,
									searchScope === "plugin"
										? styles.scopePillActive
										: {
												backgroundColor: colors.cardBg,
												borderColor: colors.border,
											},
									focused && styles.scopePillFocused,
								]}
								onPress={() => handleScopeChange("plugin")}
								activeOpacity={0.7}>
								<Ionicons
									name="film-outline"
									size={13}
									color={
										searchScope === "plugin"
											? "#ffffff"
											: colors.textSecondary
									}
								/>
								<Text
									style={[
										styles.scopeText,
										{
											color:
												searchScope === "plugin"
													? "#ffffff"
													: colors.textSecondary,
											fontWeight:
												searchScope === "plugin"
													? "700"
													: "500",
										},
									]}
									numberOfLines={1}>
									{activePlugin}
								</Text>
							</TVPressable>
						) : null}
					</View>
				</View>

				<ScrollView
					ref={scrollViewRef}
					contentInsetAdjustmentBehavior="automatic"
					onScroll={(e) => {
						searchMemoryCache.scrollPosition =
							e.nativeEvent.contentOffset.y;
					}}
					scrollEventThrottle={32}
					onContentSizeChange={handleContentSizeChange}
					showsVerticalScrollIndicator={false}
					keyboardShouldPersistTaps="handled"
					contentContainerStyle={[
						styles.scrollContainer,
						contentMaxWidth
							? {
								// TV: sonuçlar ortalanmış sütunda kalsın.
								alignSelf: "center",
								width: "100%",
								maxWidth: contentMaxWidth,
								paddingHorizontal: gutter,
							}
							: null,
					]}>
					{/*
					 * Kaynak Durumu Banner'ı
					 *
					 * Backend `durum` alanını sorun yoksa GÖNDERMEZ, bu yüzden
					 * normal aramalarda bu blok hiç render edilmez ve ekran
					 * yerleşimi değişmez.
					 *
					 * Metin `durumGorunum()` tarafından üretilir; orada
					 * "devreye girmiş kaynak" ile "yalnızca bu aramayı
					 * karşılamayan kaynak" ayrımı yapılır.
					 */}
					{!loading && sourceStatusView ? (
						<View style={styles.sourceStatusBanner}>
							<Ionicons
								name="warning"
								size={16}
								color="#f59e0b"
								style={styles.sourceStatusIcon}
							/>
							<View style={styles.sourceStatusBody}>
								<Text style={styles.sourceStatusTitle}>
									{sourceStatusView.baslik}
								</Text>
								{sourceStatusView.satirlar.map((s, i) => (
									<Text
										key={i}
										style={styles.sourceStatusDetail}
										numberOfLines={2}>
										• {s}
									</Text>
								))}
								{sourceStatusView.not ? (
									<Text style={styles.sourceStatusNote}>
										{sourceStatusView.not}
									</Text>
								) : null}
							</View>
						</View>
					) : null}

					{/* Yükleniyor Durumu */}
					{/*
					 * Sonuç kartı iskeleti. Gerçek sonuç satırının
					 * geometrisi (58×86 poster + 12px yarıçap + 12px satır
					 * yüksekliği) birebir taklit ediliyor; arama bitince
					 * sonuçlar yerine oturuyor, sayfa zıplamıyor.
					 */}
					{loading && (
						<View style={styles.resultsContainer} pointerEvents="none">
							<SkeletonLine
								width={180}
								height={13}
								color={colors.border}
								style={{ marginBottom: 12 }}
							/>
							<View style={styles.cardsList}>
								{Array.from({ length: 6 }).map((_, index) => (
									<View
										key={`sk-sonuc-${index}`}
										style={[
											styles.resultCard,
											{
												backgroundColor: colors.cardBg,
												borderColor: colors.border,
											},
										]}>
										<SkeletonBlock
											width={58}
											height={86}
											radius={8}
											color={colors.border}
										/>
										<View style={styles.cardDetails}>
											<SkeletonLine
												width="82%"
												height={14}
												color={colors.border}
											/>
											<SkeletonLine
												width="52%"
												height={12}
												color={colors.border}
											/>
											<View style={styles.badgesRow}>
												<SkeletonBlock
													width={54}
													height={20}
													radius={6}
													color={colors.border}
												/>
												<SkeletonBlock
													width={40}
													height={20}
													radius={6}
													color={colors.border}
												/>
											</View>
										</View>
									</View>
								))}
							</View>
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
										<TVPressable
											onPress={handleClearAllHistory}
											style={({ focused }) => [
												focused && styles.textButtonFocused,
											]}
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
										</TVPressable>
									</View>

									{/* Geçmiş Öğeleri Listesi */}
									<View style={styles.historyList}>
										{searchHistory.map((item, index) => (
											<TVPressable
												key={`${item}-${index}`}
												style={({ focused }) => [
													styles.historyItem,
													{
														backgroundColor:
															colors.cardBg,
														borderColor:
															colors.border,
													},
													focused && styles.historyItemFocused,
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
												<TVPressable
													onPress={() =>
														handleDeleteHistoryItem(
															item,
														)
													}
													style={({ focused }) => [
														focused && styles.iconButtonFocused,
													]}
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
												</TVPressable>
											</TVPressable>
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
													item.image ||
													item.backdrop_url;

												return (
													<TVPressable
														key={
															item.url ||
															`${pluginName}-${index}`
														}
														style={({ focused }) => [
															styles.resultCard,
															{
																backgroundColor:
																	colors.cardBg,
																borderColor:
																	focused ? colors.primary : colors.border,
															},
															focused && styles.resultCardFocused,
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
																contentPosition="center"
																transition={0}
																recyclingKey={posterUri}
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
													</TVPressable>
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
	/* ── Kaynak durumu banner'ı ── */
	sourceStatusBanner: {
		flexDirection: "row",
		alignItems: "flex-start",
		backgroundColor: "rgba(245, 158, 11, 0.12)",
		borderWidth: 1,
		borderColor: "rgba(245, 158, 11, 0.35)",
		borderRadius: 10,
		padding: 12,
		marginHorizontal: 16,
		marginBottom: 10,
		gap: 9,
	},
	sourceStatusIcon: {
		marginTop: 1,
	},
	sourceStatusBody: {
		flex: 1,
		gap: 3,
	},
	sourceStatusTitle: {
		color: "#fbbf24",
		fontSize: 12,
		fontWeight: "700",
	},
	sourceStatusDetail: {
		color: "#fcd34d",
		fontSize: 11,
		lineHeight: 15,
	},
	sourceStatusNote: {
		color: "#9ca3af",
		fontSize: 10,
		fontStyle: "italic",
		marginTop: 1,
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
		height: 86,
		borderRadius: 8,
		overflow: "hidden",
	},
	posterPlaceholder: {
		width: 58,
		height: 86,
		borderRadius: 8,
		overflow: "hidden",
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
	scopeRow: {
		flexDirection: "row",
		gap: 8,
		marginTop: 10,
	},
	scopePill: {
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: 12,
		paddingVertical: 6,
		borderRadius: 16,
		borderWidth: 1,
		borderColor: "transparent",
		gap: 5,
	},
	scopePillActive: {
		backgroundColor: "#2563EB",
		borderColor: "#2563EB",
	},
	scopeText: {
		fontSize: 12,
	},
	searchButtonFocused: {
		borderWidth: 2,
		borderColor: "#FFFFFF",
		transform: [{ scale: 1.05 }],
	},
	scopePillFocused: {
		borderWidth: 2,
		borderColor: "#FFFFFF",
		transform: [{ scale: 1.06 }],
	},
	historyItemFocused: {
		borderWidth: 2,
		borderColor: "#E50914",
		transform: [{ scale: 1.02 }],
	},
	resultCardFocused: {
		borderWidth: 2,
		borderColor: "#E50914",
		transform: [{ scale: 1.02 }],
	},
	iconButtonFocused: {
		transform: [{ scale: 1.2 }],
	},
	textButtonFocused: {
		borderBottomWidth: 1,
		borderBottomColor: "#E50914",
	},
});
