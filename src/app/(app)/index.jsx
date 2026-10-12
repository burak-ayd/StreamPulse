import PlatformList from "@/components/content/PlatformList";
import ContinueWatchingSection from "@/components/home/ContinueWatchingSection";
import HeroBanner from "@/components/home/HeroBanner";
import MovieCategorySection, {
	MovieCategoryRowSkeleton,
} from "@/components/home/MovieCategorySection";
import HomeSkeleton from "@/components/home/HomeSkeleton";
import BottomSheetModal from "@/components/modal/Bottomsheetmodal";
import QuickPreviewModal from "@/components/modal/QuickPreviewModal";
import ListSelectModal from "@/components/modal/ListSelectModal";
import {
	clearPluginCache,
	fetchPlatformCategories,
	fetchPlatforms,
	fetchPluginDetail,
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
	getContentLibraryStatus,
	removeContinueWatching,
	saveSelectedPlatform,
} from "@/utils/storage";
import { useReactiveData } from "@/utils/storageListener";
import BottomNavigation from "@components/BottomNavigation";
import { useFocusCentering } from "@/hooks/useFocusCentering";
import { useNavLayout } from "@/hooks/useNavLayout";
import { useScrollMemory } from "@/hooks/useScrollMemory";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import TVPressable from "@/components/common/TVPressable";
import {
	BackHandler,
	FlatList,
	Platform,
	RefreshControl,
	ScrollView,
	StatusBar,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
	useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Stabil referans: useMemo içinde yeni dizi üretmemek için. */
const EMPTY_ARRAY = [];

export default function Index() {
	const router = useRouter();
	// Sol ray (TV / tablet yatay) varken icerik sola kayar.
	const { contentPaddingLeft, isSideRail } = useNavLayout();
	const params = useLocalSearchParams();
	const insets = useSafeAreaInsets();
	// İskelet satır sayısı ekranın YÖNÜNE göre değişir (bkz.
	// `skeletonRowCount`): TV yatay → az satır, telefon dikey → çok satır.
	const { width: winW, height: winH } = useWindowDimensions();

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
	const [previewMovie, setPreviewMovie] = useState(null);
	const [isPreviewModalVisible, setIsPreviewModalVisible] = useState(false);
	const [isHeroListSelectVisible, setIsHeroListSelectVisible] = useState(false);

	// Android TV Kumanda Geri Tuşu: Açık modal varsa kapat
	useEffect(() => {
		const onBackPress = () => {
			if (isPlatformModalVisible) {
				setIsPlatformModalVisible(false);
				return true;
			}
			if (isPreviewModalVisible) {
				setIsPreviewModalVisible(false);
				return true;
			}
			if (isHeroListSelectVisible) {
				setIsHeroListSelectVisible(false);
				return true;
			}
			return false;
		};

		const sub = BackHandler.addEventListener(
			"hardwareBackPress",
			onBackPress,
		);
		return () => sub.remove();
	}, [isPlatformModalVisible, isPreviewModalVisible, isHeroListSelectVisible]);

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

	// Sync gelen veriyi odak değişimi olmadan da ekrana yansıt
	useReactiveData(fetchUserData, [
		"user_continue_watching",
		"user_watch_history",
		"user_favorites",
	]);

	// ---------------------------------------------------------------
	// Hero backdrop hidrasyonu
	//
	// ÖNEMLİ: Ana sayfa hero içeriği `fetchRandomContents` (GET /random)
	// ile gelir. Bu endpoint bir LİSTE öğesi döndürür ve bu öğelerde
	// genellikle yalnızca 2:3 dikey `poster` bulunur; `backdrop_url` YOKTUR.
	// Hero ise yatay (16:9) bir kompozisyon beklediği için poster, sinematik
	// banda sığdırıldığında ya çok kırpılır ya da ince bir sütuna
	// sıkışıp kalır (CloudStream'de kart kutusu oranı verinin kendisinden
	// gelir — bkz. HomeParentItemAdapter: `isHorizontal = info.isHorizontalImages`).
	//
	// Bu yüzden MovieDetails'in yaptığı gibi plugin detayı çekilip gerçek
	// backdrop hydrate edilir. Poster anında gösterilir, backdrop gelince
	// keskinleşir (görsel zaten `transition` kullanıyor).
	// ---------------------------------------------------------------
	const hydrateHeroBackdrop = useCallback(
		async (item, platformName) => {
			if (!item || item.id === "offline-placeholder") return item;
			if (!platformName) return item;
			// Zaten yatay görsel varsa tekrar istek atmaya gerek yok.
			if (item.backdrop_url || item.backdrop) return item;

			const detailUrl = item.url || item.slug;
			if (!detailUrl) return item;

			try {
				const detail = await fetchPluginDetail(platformName, detailUrl);
				const backdrop =
					detail?.backdrop_url ||
					detail?.backdrop ||
					detail?.background ||
					detail?.landscape_url;
				if (!backdrop) return item;
				return {
					...item,
					backdrop_url: backdrop,
					plugin: item.plugin || platformName,
				};
			} catch (error) {
				// Detay alınamazsa poster ile devam et – hero boş kalmaz.
				console.warn("Hero backdrop alınamadı:", error?.message);
				return item;
			}
		},
		[],
	);

	// featuredMovie'yi set eder ve arka planı (varsa) arka planda hydrate eder.
	const setFeaturedMovieWithBackdrop = useCallback(
		(item, platformName) => {
			setFeaturedMovie(item);
			if (!item) return;
			hydrateHeroBackdrop(item, platformName).then((hydrated) => {
				if (hydrated && hydrated !== item) {
					setFeaturedMovie(hydrated);
				}
			});
		},
		[hydrateHeroBackdrop],
	);

	/*
	 * Eklenti içeriği (kategoriler + hero) ağdan gelene kadar "busy".
	 *
	 * ⚠️ `featuredMovie === null` BUNUN İÇİN KULLANILMAZ. Hero iskeleti
	 * `loadingContent`'e bağlıdır; çünkü istek BAŞARISIZ olursa
	 * `featuredMovie` hep null kalır ve `null`'a bakarsak ekran sonsuza
	 * dek iskelette kilitlenir. Oysa hata halinde gerçek (boş) hero
	 * gösterilmelidir.
	 */
	const [loadingContent, setLoadingContent] = useState(false);

	const fetchPlatformData = useCallback(async (platform, force = false) => {
		if (!platform || platform.id === "none" || platform.name === "None") {
			setLoadingContent(false);
			setCategories([]);
			const downloads = await getDownloads();
			setDownloadedItems(downloads || []);
			if (downloads && downloads.length > 0) {
				setFeaturedMovieWithBackdrop(downloads[0], platform.name);
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
				// Önbellek anında geliyor: iskelet hiç gösterilmemeli,
				// yoksa içerik zaten ekrandayken bir kez titreriz.
				setLoadingContent(false);
				const catList = cachedCats?.categories || (Array.isArray(cachedCats) ? cachedCats : []);
				setCategories(catList);
				const heroItem = Array.isArray(cachedHero) && cachedHero.length > 0 ? cachedHero[0] : cachedHero;
				if (heroItem) {
					setFeaturedMovieWithBackdrop(heroItem, platform.name);
					getContentLibraryStatus(heroItem.id || heroItem.url).then((st) =>
						setIsInList(Boolean(st?.currentList || st?.isFav)),
					);
				}
				return;
			}
		}

		try {
			setLoadingContent(true);
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
				setFeaturedMovieWithBackdrop(randomItem, platform.name);
				const status = await getContentLibraryStatus(
					randomItem.id || randomItem.url,
				);
				setIsInList(Boolean(status?.currentList || status?.isFav));
			}
		} catch (error) {
			console.error("Platform içeriği yüklenirken hata:", error);
		} finally {
			// Hata da olsa iskelet kalkmalı: aksi halde ekran kalıcı olarak
			// iskelette kilitlenir ve kullanıcı "yükleniyor" sanar.
			setLoadingContent(false);
		}
	}, [setFeaturedMovieWithBackdrop]);

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
	// useCallback: bu fonksiyon kimliği her render'da değişirse tüm kategori
	// satırları yeniden render olur (TV'de kaydırma takılır).
	const handleMoviePress = useCallback(
		(movie) => {
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
		},
		[router, selectedPlatform],
	);

	// Uzun basma ile Hızlı Önizleme Modalı aç
	const handleMovieLongPress = useCallback(
		(movie) => {
			if (!movie || movie.id === "offline-placeholder") return;
			setPreviewMovie({
				...movie,
				plugin: movie.plugin || selectedPlatform?.name,
			});
			setIsPreviewModalVisible(true);
		},
		[selectedPlatform],
	);

	const handleContinueWatchingPress = useCallback(
		(item) => {
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
						seriesUrl: item.seriesUrl,
						seriesTitle: item.seriesTitle || item.title,
						plugin: item.plugin || selectedPlatform?.name,
						season: item.season,
						episode: item.episode,
						episodeTitle: item.episodeTitle,
						totalEpisodes: item.totalEpisodes,
						currentTime: item.currentTime,
						nextEpisode: item.nextEpisode
							? typeof item.nextEpisode === "string"
								? item.nextEpisode
								: JSON.stringify(item.nextEpisode)
							: undefined,
					},
				});
			} else if (item.id) {
				handleMoviePress(item);
			}
		},
		[router, selectedPlatform, handleMoviePress],
	);

	const handleRemoveContinueWatching = useCallback(async (id) => {
		const updated = await removeContinueWatching(id);
		setContinueWatching(updated);
	}, []);

	// Search handler: Eklenti içi arama (Header'dan tetiklenince)
	const handleHeaderSearch = useCallback(() => {
		if (!isNoneMode && selectedPlatform?.name) {
			router.push({
				pathname: "/(app)/search",
				params: { plugin: selectedPlatform.name },
			});
		} else {
			router.push("/(app)/search");
		}
	}, [router, isNoneMode, selectedPlatform]);

	// Kategori satırındaki ok → kategorinin tamamını listeleyen ekran.
	// ⚠️ URL query parametresi olarak taşınıyor; kategori adı Türkçe/uzun
	// olabilir ama `encodeURIComponent` expo-router tarafından zaten
	// güvenli şekilde kodlanıyor.
	const handleSeeAllCategory = useCallback(
		(category) => {
			if (!category?.url || !selectedPlatform?.name) return;
			router.push({
				pathname: "/(app)/category",
				params: {
					platform: selectedPlatform.name,
					url: category.url,
					name: category.name || "",
				},
			});
		},
		[router, selectedPlatform],
	);

	// ------------------------------------------------------------------
	// Ana sayfa listesi parçaları (TV performansı)
	//
	// Dikey FlatList satırları sanallaştırır: ScrollView tüm kategori
	// satırlarını aynı anda mount ediyordu. CloudStream de tek bir
	// RecyclerView + paylaşımlı view pool ile aynı sonuca ulaşıyor.
	// ------------------------------------------------------------------
	const visibleCategories = useMemo(
		() => (isNoneMode ? EMPTY_ARRAY : categories.slice(0, visibleCount)),
		[isNoneMode, categories, visibleCount],
	);

	/*
	 * Kategori listesi gelene kadar gösterilecek iskelet satır sayısı.
	 *
	 * Ekrana göre: TV'de hero yüksekliği ekranın ~%60'ını kapladığı için
	 * 2 satır yeter; telefonda hero kısa olduğu için daha çok satır
	 * görünmeli (aksi halde ekranın alt yarısı boş kalır).
	 *
	 * Sabit sayı KULLANILMAZ: 1080p TV'de telefonun katsayısıyla 5 satır
	 * çizilirse ekran taşar, telefonda 2 satır çizilirse ekran boş görünür.
	 */
	const skeletonRowCount = useMemo(() => {
		const landscape = winW > winH;
		return landscape ? 2 : 4;
	}, [winW, winH]);

	/*
	 * Satır iskeletleri yalnızca liste BOŞKEN gösterilir. Kategoriler
	 * geldiğinde her satır kendi yükleme durumunu kendi yönetir
	 * (`MovieCategorySection`), yani iki mekanizma asla çakışmaz.
	 */
	const showSkeletonRows =
		loadingContent && !isNoneMode && visibleCategories.length === 0;

	const categoryKeyExtractor = useCallback(
		(category, index) => category.url || category.name || `cat-${index}`,
		[],
	);

	/*
	 * SORUN 5 — dikeyde de odak ortalanır.
	 *
	 * `MovieCategorySection`, satırdaki bir kart odaklandığında
	 * `onRowFocused` çağırır. Android TV odaklanan öğeyi yalnızca
	 * EKRANA GETİRİR (en az kaydırma) — satır ekranın alt kenarına
	 * yapışır ve kartın başlığı yarım görünür ("önce scroll yapıp
	 * sonra içerik seçiliyor"). `viewPosition: 0.5` satırı ekranın
	 * dikey ortasına sabitler.
	 */
	/*
	 * SORUN 4 (GENEL) — geri dönüşte kaydırma konumu.
	 *
	 * `<Stack/>` ekranı mount durumunda tuttuğu için çoğu zaman bu
	 * yedeğe gerek kalmaz; ancak `router.replace()` ya da bellek
	 * baskısıyla ekran yeniden kurulursa konum sıfırlanmasın.
	 */
	const rememberScroll = useScrollMemory("home");

	/*
	 * SORUN 5 dikey yarısı — ortak kanca (`useFocusCentering`).
	 *
	 * Bu ana liste bir "satır listesi" (her satır bir kategori yatay
	 * dizisi); dolayısıyla ızgara sütun çevirisi YOKTUR ve
	 * `scrollRowToCenter` doğrudan hedef satırın indeksini alır.
	 *
	 * Aynı kanca `category.jsx`, `live.jsx`,
	 * `MovieCategorySection.jsx` ve `ContinueWatchingSection.jsx`
	 * içinde elle kopyalanmış dört ayrı örnekten oluşuyordu; kanca
	 * tek doğruluk kaynağı oldu.
	 */
	const {
		listRef: homeListRef,
		scrollRowToCenter: centerRowOnScreen,
		onScrollToIndexFailed: handleHomeScrollToIndexFailed,
		clearRetry,
	} = useFocusCentering();

	useEffect(() => clearRetry, [clearRetry]);

	// useCallback: kimliği her render'da değişirse FlatList tüm satırları
	// yeniden render eder (TV'de kaydırma takılır).
	const renderCategoryRow = useCallback(
		({ item: category, index: rowIndex }) => (
			<MovieCategorySection
				platformName={selectedPlatform?.name}
				category={category}
				onMoviePress={handleMoviePress}
				onMovieLongPress={handleMovieLongPress}
				onSeeAll={handleSeeAllCategory}
				// Sorun 1: sol ray bulunan düzende satır sonunda
				// odaklanabilir "Tümünü Gör" kutusu.
				showSeeAllTile={isSideRail}
				// Sorun 5: odaklanan satır ekranın ortasına taşınır.
				onRowFocused={
					Platform.isTV
						? () => centerRowOnScreen(rowIndex)
						: undefined
				}
			/>
		),
		[
			selectedPlatform,
			handleMoviePress,
			handleMovieLongPress,
			handleSeeAllCategory,
			isSideRail,
			centerRowOnScreen,
		],
	);

	const handleLoadMore = useCallback(() => {
		setVisibleCount((prev) => prev + 5);
	}, []);

	const homeListFooter = useMemo(() => {
		if (isNoneMode || visibleCount >= categories.length) return null;
		return (
			<View style={styles.loadMoreContainer}>
				<TVPressable
					style={styles.loadMoreButton}
					focusedStyle={styles.loadMoreButtonFocused}
					onPress={handleLoadMore}>
					<Text style={styles.loadMoreText}>
						Daha Fazla Kategori Göster (
						{categories.length - visibleCount})
					</Text>
				</TVPressable>
			</View>
		);
	}, [isNoneMode, visibleCount, categories.length, handleLoadMore]);

	return (
		<>
			<Stack.Screen options={{ headerShown: false }} />
			<View style={[styles.container, { paddingLeft: contentPaddingLeft }]}>
				<StatusBar
					barStyle="light-content"
					translucent={true}
					backgroundColor="transparent"
				/>

				{/*
				 * ⚠️ ESKİ DAVRANIŞ: `loadingPlatform` sırasında ekranın TAMAMI
				 * spinner ile değiştiriliyordu. İçerik gelince hero + kategori
				 * satırları ekrana giriyor ve kullanıcı "sayfa belirdi" diye
				 * algılıyordu — aslında iki farklı düzen çiziliyordu.
				 *
				 * YENİ: liste render ediliyor, veri gelene kadar iskeletler
				 * duruyor. Hero kendi geometrisini (`skeleton` prop'u),
				 * kategoriler de `MovieCategoryRowSkeleton` ile çiziyor.
				 */}
				{loadingPlatform ? (
					<HomeSkeleton
						platform={selectedPlatform}
						userAvatarUrl={userAvatarUrl}
						onPlatformPress={() => setIsPlatformModalVisible(true)}
						onSearchPress={handleHeaderSearch}
						onProfilePress={() => router.push("/(app)/profile")}
					/>
				) : (
					<FlatList
						ref={homeListRef}
						contentInsetAdjustmentBehavior="automatic"
						data={visibleCategories}
						keyExtractor={categoryKeyExtractor}
						renderItem={renderCategoryRow}
						onScrollToIndexFailed={handleHomeScrollToIndexFailed}
						onScroll={rememberScroll.onScroll}
						scrollEventThrottle={rememberScroll.scrollEventThrottle}
						onContentSizeChange={() =>
							rememberScroll.restoreOffset(homeListRef)
						}
						ListFooterComponent={homeListFooter}
						showsVerticalScrollIndicator={false}
						contentContainerStyle={styles.scrollContent}
						// TV: satır sanallaştırması. ScrollView tüm kategori satırlarını
						// aynı anda mount ediyordu; CloudStream tek bir RecyclerView +
						// paylaşımlı view pool kullanıyor. removeClippedSubviews TV'de
						// false KALMALI: odaklı kartın detache olması kumanda odağını
						// kaybettirir.
						initialNumToRender={2}
						maxToRenderPerBatch={2}
						windowSize={3}
						removeClippedSubviews={false}
						refreshControl={
							<RefreshControl
								refreshing={refreshing}
								onRefresh={onRefresh}
								tintColor="#2563EB"
								progressViewOffset={insets.top + 20}
							/>
						}
						ListHeaderComponent={
							<>
						{/* 1. Hero Featured Banner */}
						<HeroBanner
							movie={featuredMovie}
							platform={selectedPlatform}
							isInList={isInList}
						/*
						 * İskelet, içerik ağdan gelene kadar. `movie={null}` iken
						 * HeroBanner eskiden uydurma bir başlık ("StreamPulse") ve
						 * örnek poster gösteriyor, sonra gerçek içerikle
						 * değişiyordu — ekran iki kez yer değiştiriyordu.
						 */
						skeleton={loadingContent}
							userAvatarUrl={userAvatarUrl}
							onPlayPress={() => handleMoviePress(featuredMovie)}
							onInfoPress={() => handleMoviePress(featuredMovie)}
							onLongPress={() => handleMovieLongPress(featuredMovie)}
							onToggleList={() => {
								if (!featuredMovie || featuredMovie.id === "offline-placeholder") return;
								setIsHeroListSelectVisible(true);
							}}
							onPlatformPress={() =>
								setIsPlatformModalVisible(true)
							}
							onSearchPress={handleHeaderSearch}
							onProfilePress={() => router.push("/(app)/profile")}
						/>

						{/*
					 * Kategori listesi gelene kadar satır iskeletleri.
					 *
					 * Kategoriler boşken `FlatList` hiç render etmiyor ve
					 * ekran "hero + boşluk" görünüyordu. Satır sayısı ekran
					 * YÜKSEKLİĞİNE göre: telefonda daha çok, TV'de daha az
					 * (TV'de hero çok daha uzun yer kaplıyor).
					 */}
					{showSkeletonRows
						? Array.from({ length: skeletonRowCount }).map((_, i) => (
								<MovieCategoryRowSkeleton key={`sk-satir-${i}`} />
							))
						: null}

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
										<TVPressable
											style={styles.selectPlatformBtn}
											focusedStyle={styles.selectPlatformBtnFocused}
											onPress={() =>
												setIsPlatformModalVisible(true)
											}>
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
										</TVPressable>
									</View>
								)}

								{/* Offline Continue Watching */}
								{continueWatching.length > 0 && (
									<ContinueWatchingSection
										items={continueWatching}
										onItemPress={handleContinueWatchingPress}
										onItemLongPress={handleMovieLongPress}
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
										onItemLongPress={handleMovieLongPress}
										onRemoveItem={handleRemoveContinueWatching}
										onSeeAllPress={() =>
											router.push({
												pathname: "/(app)/profile",
												params: { tab: "continue" },
											})
										}
									/>
								)}

								{/* Kategori satırları artık FlatList'in data'sı;
								    "daha fazla" butonu da footer olarak taşındı. */}
							</>
							)}
							</>
						}
					/>
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
						/* Canlı TV kartı `handlePlatformSelect`'e GİRMEZ;
						   navigasyona çevrilir (bkz. PlatformList →
						   `canliTvAc`). Rota burada veriliyor çünkü modal
						   içinden `router.push` çağırmak, ekranın kendi
						   gezinme yığınını yönetmesi demek. */
						onOpenLiveTv={() => router.push("/(app)/live")}
					/>
				</BottomSheetModal>

				{/* Quick Preview Modal (Long-press) */}
				<QuickPreviewModal
					visible={isPreviewModalVisible}
					movie={previewMovie}
					platformName={selectedPlatform?.name}
					onClose={() => setIsPreviewModalVisible(false)}
					onPlayPress={(item) => {
						setIsPreviewModalVisible(false);
						handleMoviePress(item);
					}}
					onDetailsPress={(item) => {
						setIsPreviewModalVisible(false);
						handleMoviePress(item);
					}}
				/>

				{/* Hero Movie List Select Modal */}
				<ListSelectModal
					visible={isHeroListSelectVisible}
					movie={featuredMovie}
					onClose={() => setIsHeroListSelectVisible(false)}
					onStatusChanged={(newStatus, newFav) => {
						setIsInList(Boolean(newStatus || newFav));
					}}
				/>
			</View>
		</>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: "#0d0e12",
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
	selectPlatformBtnFocused: {
		backgroundColor: "#FF3B30",
		borderColor: "#FFFFFF",
		borderWidth: 2,
		transform: [{ scale: 1.08 }],
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
	loadMoreButtonFocused: {
		backgroundColor: "rgba(255, 59, 48, 0.35)",
		borderColor: "#FF3B30",
		borderWidth: 1.5,
		transform: [{ scale: 1.08 }],
	},
	loadMoreText: {
		color: "#38bdf8",
		fontSize: 13,
		fontWeight: "600",
	},
});
