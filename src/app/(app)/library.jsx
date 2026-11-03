import BottomNavigation from "@/components/BottomNavigation";
import TVPressable from "@/components/common/TVPressable";
import LibraryItemActionModal from "@/components/modal/LibraryItemActionModal";
import ListSelectModal from "@/components/modal/ListSelectModal";
import BottomSheetModal from "@/components/modal/Bottomsheetmodal";
import { FontFamily, Palette } from "@/constants/theme";
import { useNavLayout } from "@/hooks/useNavLayout";
import { fetchPluginDetail } from "@/services/api";
import { canonicalType, isSeriesContent } from "@/utils/mediaType";
import {
	getContinueWatching,
	getEpisodeKey,
	getFavorites,
	getHiddenLibraryItems,
	getSelectedPlatform,
	getSeriesTotalEpisodesMap,
	getWatchHistory,
	getWatchlist,
	hideLibraryItem,
	isLibraryHidden,
	markContentCompleted,
	removeContinueWatching,
	setContentLibraryList,
	toggleFavorite,
	toggleWatchlist,
} from "@/utils/storage";
import { useReactiveData } from "@/utils/storageListener";
import { normalizePluginValue } from "@/utils/pluginName";
import { useTvMetrics } from "@/utils/tvMetrics";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import Image from "@/components/common/SmartImage";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
	ActivityIndicator,
	BackHandler,
	FlatList,
	ScrollView,
	Share,
	StatusBar,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const CARD_GAP = 14;
const PADDING_HORIZONTAL = 16;

/**
 * Kart genişliği ekranın genişliğine göre HESAPLANIR.
 *
 * Sabit bir `Dimensions.get("window")` değeri TV'de 1920px'i veriyordu ve
 * 2 sütunla birlikte kart başına ~940px çıkıyordu. Artık sütun sayısı
 * kutunun genişliğinden türetildiği için (aşağıda), ölçüm kutudan alınır.
 */
function cardWidthFor(screenWidth, numColumns) {
	return (
		(screenWidth - PADDING_HORIZONTAL * 2 - CARD_GAP * (numColumns - 1)) /
		numColumns
	);
}

/**
 * Bir kartın okunabilir en küçük genişliği (sütun hesabı için).
 * Alt sınır 2 sütun (dar telefon), üst sınır 6 sütun (geniş ekran).
 *
 * 190 → 150 → 140 → 130 (TV geri bildirimi): sağdaki Hızlı İşlemler paneli
 * ızgaradan yer aldığı için kart genişliği kısıtlı; 130 ile TV'de tasarımdaki
 * gibi 4 sütun çıkar. Telefon dikeyde sonuç değişmez (2 sütun).
 */
const MIN_CARD_WIDTH = 130;

/**
 * Tür filtresi eşleşmesi — hem liste süzgeci hem filtre sayıları aynı
 * kuralı okusun diye tek yerde.
 */
function matchesTypeFilter(item, filter) {
	if (filter === "all") return true;
	const tip = canonicalType(item);
	if (filter === "movie") return tip === "movie";
	if (filter === "series") return tip === "series";
	if (filter === "anime") {
		// Anime ayrı bir alan değil; `normalizeMediaType` "anime"i "series"e
		// indirger, bu yüzden içerik metninden ayrıca aranır.
		const metin = `${item.title || ""} ${item.category || ""}`.toLowerCase();
		return tip === "series" && metin.includes("anime");
	}
	return true;
}

/** Kitaplık kaydından kartın gösterdiği tüm metinleri türetir. */
function cardMeta(item) {
	const isCompletedSeriesGroup = item.completedEpisodesCount !== undefined;
	const isDizi =
		item.type === "series" ||
		item.content_type === "series" ||
		isCompletedSeriesGroup ||
		Boolean(item.season);

	const ratingVal = item.rating
		? typeof item.rating === "number"
			? item.rating.toFixed(1)
			: parseFloat(item.rating)
				? parseFloat(item.rating).toFixed(1)
				: item.rating
		: null;

	const progressPercent = Math.min(
		100,
		Math.max(0, Math.round((item.progress || 0) * 100)),
	);

	const remainingText = isCompletedSeriesGroup
		? item.totalEpisodesCount > 0
			? item.completedEpisodesCount >= item.totalEpisodesCount
				? "Tamamlandı"
				: `${item.totalEpisodesCount - item.completedEpisodesCount} bölüm kaldı`
			: "Tamamlanan"
		: item.duration && item.currentTime
			? `${Math.max(1, Math.round((item.duration - item.currentTime) / 60))} dk kaldı`
			: progressPercent > 0
				? `%${progressPercent} izlendi`
				: null;

	const episodeText = isCompletedSeriesGroup
		? item.totalEpisodesCount > 0
			? `${item.completedEpisodesCount}/${item.totalEpisodesCount} Bölüm`
			: `${item.completedEpisodesCount} Bölüm İzlendi`
		: item.season && item.episode
			? `S${item.season} B${item.episode}`
			: item.runtime_minutes
				? `${item.runtime_minutes} dk`
				: isDizi
					? "Dizi"
					: "Film";

	return {
		isDizi,
		ratingVal,
		progressPercent,
		remainingText,
		episodeText,
		posterUri:
			item.poster ||
			item.poster_url ||
			item.image ||
			item.backdrop_url ||
			null,
		plugin: normalizePluginValue(item.plugin),
		genre: item.genre || item.category || item.tagline || null,
		title: item.title || item.seriesTitle || "Başlıksız",
	};
}

const itemKey = (item) => item.id || item.url;

export default function LibraryScreen() {
	const router = useRouter();
	// Sol ray (TV / tablet yatay) varken icerik sola kayar.
	const { contentPaddingLeft } = useNavLayout();

	/**
	 * TV ölçüleri.
	 *
	 * `contentMaxWidth`: kitaplık ızgarası TV'de 1920px'e yayılıyordu;
	 * iki kart, ekranın iki ucunu dolduruyor, ortası bomboştu (sütun
	 * sayısı ve kart genişliği aşağıda bu kutudan türetilir).
	 */
	const { sp, contentMaxWidth, width: screenWidth, isTV, isLarge } =
		useTvMetrics();

	/**
	 * Kitaplık kutusu: daraltılmış içerik sütunu varsa o, yoksa ekran.
	 */
	const boxWidth = contentMaxWidth ?? screenWidth;

	/**
	 * Hızlı İşlemler paneli — yalnız TV ve geniş ekran (tablet yatay).
	 * Panel sağda sabit genişlikte durur, ızgara kalan alana sığar.
	 */
	const showQuickActions = isTV || isLarge;
	const panelWidth = Math.min(sp(340), Math.round(boxWidth * 0.26));
	const gridWidth =
		boxWidth - (showQuickActions ? panelWidth + PADDING_HORIZONTAL : 0);

	// Durum Sekmeleri (Beklemede ve Bırakıldı kaldırıldı)
	const [activeTab, setActiveTab] = useState("watching"); // 'watching' | 'completed' | 'planned' | 'favorites'

	// Filtreler & Sıralama
	const [searchQuery, setSearchQuery] = useState("");
	const [sortBy, setSortBy] = useState("last_watched"); // 'last_watched' | 'date_added' | 'name_asc' | 'imdb_desc' | 'remaining_time'
	const [typeFilter, setTypeFilter] = useState("all"); // 'all' | 'movie' | 'series' | 'anime'
	const [progressFilter, setProgressFilter] = useState("all"); // 'all' | 'in_progress' | 'not_started'
	const [isSortModalVisible, setIsSortModalVisible] = useState(false);
	const [viewMode, setViewMode] = useState("grid"); // 'grid' | 'list'

	// Seçim modu (Düzenle): kart basışı seçer, alttaki çubuk toplu eylem sunar.
	const [isSelectionMode, setIsSelectionMode] = useState(false);
	const [selectedIds, setSelectedIds] = useState(() => new Set());
	const [isBulkListSheetVisible, setIsBulkListSheetVisible] = useState(false);
	// Hızlı İşlemler paneli odaklanan kartı izler.
	const [focusedItemId, setFocusedItemId] = useState(null);

	/**
	 * Sütun sayısı SABİT DEĞİL (eskiden `isTV ? 4 : 2`).
	 *
	 * ⚠️ Sabit sayı ara ekranlarda yanlış çıkıyordu: yatay telefonda
	 * (≈800dp) 2 sütun → ~345dp'lik dev kartlar, 10" tablet yatayda ise
	 * 4 sütun küçük kalıyordu. Kart sayısı kutunun genişliğinden türetilir
	 * (`hooks/useMeasuredColumns.js` ile aynı formül) — kutunun genişliği
	 * burada zaten bilindiği için `onLayout` ölçümüne gerek yok.
	 */
	const columns =
		viewMode === "list"
			? 1
			: Math.min(
					Math.max(
						Math.floor(
							(gridWidth - PADDING_HORIZONTAL * 2 + CARD_GAP) /
								(MIN_CARD_WIDTH + CARD_GAP),
						),
						2,
					),
					6,
				);

	/**
	 * Kart genişliği, ızgaranın oturacağı KUTudan hesaplanır.
	 *
	 * ⚠️ Burada `FlatList`'in `onLayout` ölçümü KULLANILMAZ: FlatList'in
	 * kendisi her zaman tam ekran genişliğindedir (içerik kabı
	 * `contentContainerStyle` ile daraltılıyor), dolayısıyla ölçüm ekranı
	 * verir ve kartlar daraltılmış kaba SIĞMAZ, taşıp ekranın sağından
	 * kırpılırdı.
	 */
	const cardWidth = cardWidthFor(gridWidth, columns);

	// Özel Seçenekler & Liste Değiştirme Modalları
	const [selectedActionItem, setSelectedActionItem] = useState(null);
	const [isActionModalVisible, setIsActionModalVisible] = useState(false);
	const [listSelectTargetItem, setListSelectTargetItem] = useState(null);
	const [isListSelectModalVisible, setIsListSelectModalVisible] =
		useState(false);

	// Veri Listeleri
	const [continueWatchingList, setContinueWatchingList] = useState([]);
	const [watchlist, setWatchlist] = useState([]);
	const [favoritesList, setFavoritesList] = useState([]);
	const [watchHistoryList, setWatchHistoryList] = useState([]);
	const [seriesTotalsMap, setSeriesTotalsMap] = useState({});
	// Kitaplıktan kaldırılan (gizlenen) içerikler — yalnızca görünürlük
	// filtresi; izlenme verisi silinmez (bkz. storage.hideLibraryItem).
	const [hiddenItems, setHiddenItems] = useState([]);
	const [activePlatformName, setActivePlatformName] = useState(null);
	const [playingItemId, setPlayingItemId] = useState(null);

	// Android TV Kumanda Geri Tuşu: Açık modal varsa kapat; önceki ekran varsa ona dön, yoksa ana sayfa
	useFocusEffect(
		useCallback(() => {
			const onBackPress = () => {
				if (isSortModalVisible) {
					setIsSortModalVisible(false);
					return true;
				}
				if (isBulkListSheetVisible) {
					setIsBulkListSheetVisible(false);
					return true;
				}
				if (isActionModalVisible) {
					setIsActionModalVisible(false);
					return true;
				}
				if (isListSelectModalVisible) {
					setIsListSelectModalVisible(false);
					return true;
				}
				if (isSelectionMode) {
					setIsSelectionMode(false);
					setSelectedIds(new Set());
					return true;
				}
				if (router.canGoBack()) router.back();
				else router.replace("/(app)");
				return true;
			};
			const sub = BackHandler.addEventListener(
				"hardwareBackPress",
				onBackPress,
			);
			return () => sub.remove();
		}, [
			isSortModalVisible,
			isBulkListSheetVisible,
			isActionModalVisible,
			isListSelectModalVisible,
			isSelectionMode,
			// Setter'lar sabit; React Compiler deps listesinde görmek istiyor.
			setIsSortModalVisible,
			setIsBulkListSheetVisible,
			setIsActionModalVisible,
			setIsListSelectModalVisible,
			setIsSelectionMode,
			setSelectedIds,
			router,
		]),
	);

	// Verileri AsyncStorage'dan yükle
	const loadLibraryData = useCallback(async () => {
		try {
			const [cw, wl, fav, hist, totals, platform, hidden] =
				await Promise.all([
					getContinueWatching(),
					getWatchlist(),
					getFavorites(),
					getWatchHistory(),
					getSeriesTotalEpisodesMap(),
					getSelectedPlatform(),
					getHiddenLibraryItems(),
				]);
			setContinueWatchingList(Array.isArray(cw) ? cw : []);
			setWatchlist(Array.isArray(wl) ? wl : []);
			setFavoritesList(Array.isArray(fav) ? fav : []);
			setWatchHistoryList(Array.isArray(hist) ? hist : []);
			setSeriesTotalsMap(
				totals && typeof totals === "object" ? totals : {},
			);
			setHiddenItems(Array.isArray(hidden) ? hidden : []);
			setActivePlatformName(platform?.name || null);
		} catch (error) {
			console.error("Kitaplık yükleme hatası:", error);
		}
	}, []);

	// Sayfa her odaklandığında kitaplığı tazele
	useFocusEffect(
		useCallback(() => {
			loadLibraryData();
		}, [loadLibraryData]),
	);

	// Sync gelen veriyi odak değişimi olmadan da ekrana yansıt
	useReactiveData(loadLibraryData, [
		"user_favorites",
		"user_watchlist",
		"user_watch_history",
		"user_continue_watching",
		"user_library_hidden",
	]);

	// Tamamlanan içerikleri grupla (Diziler için bölümleri toplayıp x/y bölüm olarak sun)
	const completedItemsGrouped = useMemo(() => {
		const completedRaw = watchHistoryList.filter(
			(i) => i.isCompleted || (i.progress && i.progress >= 0.9),
		);

		const seriesGroupMap = new Map();
		const result = [];

		for (const item of completedRaw) {
			const isEpisode =
				item.type === "episode" || Boolean(item.season && item.episode);
			const isSeries = item.type === "series" || isEpisode;

			if (isSeries) {
				const seriesKey = (
					item.seriesId ||
					item.seriesTitle ||
					item.title ||
					item.id ||
					""
				)
					.toString()
					.toLowerCase()
					.trim();

				if (!seriesGroupMap.has(seriesKey)) {
					const totalFromMap =
						seriesTotalsMap[seriesKey] ||
						(item.seriesTitle
							? seriesTotalsMap[
									item.seriesTitle.toLowerCase().trim()
								]
							: 0) ||
						(item.title
							? seriesTotalsMap[item.title.toLowerCase().trim()]
							: 0) ||
						0;

					const group = {
						id: item.seriesId || item.id || item.url,
						seriesId: item.seriesId || item.id,
						seriesUrl: item.seriesUrl || item.seriesId || item.url,
						title: item.seriesTitle || item.title || "Dizi",
						seriesTitle: item.seriesTitle || item.title || "Dizi",
						poster:
							item.poster ||
							item.poster_url ||
							item.image ||
							item.backdrop_url,
						poster_url:
							item.poster ||
							item.poster_url ||
							item.image ||
							item.backdrop_url,
						backdrop_url: item.backdrop_url,
						url: item.seriesUrl || item.seriesId || item.url,
						type: "series",
						content_type: "series",
						plugin: normalizePluginValue(item.plugin || activePlatformName),
						rating: item.rating,
						genre: item.genre || item.tagline,
						updatedAt: item.updatedAt || item.watchedAt,
						watchedAt: item.watchedAt,
						completedEpisodesMap: new Map(),
						// Liste seçiminden gelen seri seviyesi "tamamlandı"
						// beyanı — bölüm sayaçları bunu yansıtmalı.
						seriesLevelCompleted: false,
						totalEpisodes:
							item.totalEpisodes ||
							item.totalEpisodesCount ||
							totalFromMap ||
							0,
					};
					seriesGroupMap.set(seriesKey, group);
					result.push(group);
				}

				const group = seriesGroupMap.get(seriesKey);
				if (item.totalEpisodes && !group.totalEpisodes) {
					group.totalEpisodes = item.totalEpisodes;
				}

				if (isEpisode) {
					// ⚠️ Sayaç anahtarı TEKİLLEŞTİRİR: eski/kirli kayıtlarda
					// season/episode alanları eksik olabildiği için anahtar
					// id/url içindeki `_s1_e2` kalıbından da türetilir
					// (kullanıcı: "Tamamlanan dizi bölümleri yanlış
					// hesaplanıyor").
					const epKey = getEpisodeKey(item);
					group.completedEpisodesMap.set(epKey, item);
				} else {
					// type:"series" kaydı — tüm dizi "tamamlandı" beyanı.
					group.seriesLevelCompleted = true;
				}

				const itemDate = new Date(
					item.watchedAt || item.updatedAt || 0,
				).getTime();
				const groupDate = new Date(
					group.watchedAt || group.updatedAt || 0,
				).getTime();
				if (itemDate > groupDate) {
					group.watchedAt = item.watchedAt || item.updatedAt;
					group.updatedAt = item.updatedAt || item.watchedAt;
				}
			} else {
				// Film
				result.push(item);
			}
		}

		// ── Başlık bazlı birleştirme ────────────────────────────
		// Seri beyanı satırı (type:"series", liste akışından) ile
		// bölüm işaret satırları (işaretleme akışlarından) farklı
		// seriesId alanları taşıyabilir (id vs url vs hiçbiri). Anahtar
		// biçimleri ayrışınca aynı seri için İKİ kart gösterilir;
		// ad eşleşen seri grupları tek kartta birleştirilir.
		const mergedByKey = new Map();
		const merged = [];
		for (const group of result) {
			if (!group?.completedEpisodesMap) {
				merged.push(group);
				continue;
			}
			const titleKey = (group.seriesTitle || group.title || "")
				.toLowerCase()
				.trim();
			if (!titleKey) {
				merged.push(group);
				continue;
			}
			const existing = mergedByKey.get(titleKey);
			if (!existing) {
				mergedByKey.set(titleKey, group);
				merged.push(group);
				continue;
			}

			// Aynı seri — birleştir.
			for (const [k, v] of group.completedEpisodesMap) {
				if (!existing.completedEpisodesMap.has(k)) {
					existing.completedEpisodesMap.set(k, v);
				}
			}
			existing.seriesLevelCompleted =
				existing.seriesLevelCompleted || group.seriesLevelCompleted;
			existing.totalEpisodes = Math.max(
				existing.totalEpisodes || 0,
				group.totalEpisodes || 0,
			);
			const gDate = new Date(
				group.watchedAt || group.updatedAt || 0,
			).getTime();
			const eDate = new Date(
				existing.watchedAt || existing.updatedAt || 0,
			).getTime();
			if (gDate > eDate) {
				// Daha yeni kaydın kimliği kalsın: kebab "Detay'a Git" ve
				// detay ekranı güncel içerik kimliğiyle eşleşir.
				existing.id = group.id || existing.id;
				existing.seriesId = group.seriesId || existing.seriesId;
				existing.seriesUrl = group.seriesUrl || existing.seriesUrl;
				existing.url = group.url || existing.url;
				existing.plugin = group.plugin || existing.plugin;
				existing.poster = group.poster || existing.poster;
				existing.poster_url = group.poster_url || existing.poster_url;
				existing.rating = group.rating || existing.rating;
				existing.watchedAt = group.watchedAt;
				existing.updatedAt = group.updatedAt || group.watchedAt;
			}
		}

		return (
			merged
				// Kaldırılan (gizlenen) içerikler kitaplıkta gösterilmez —
				// izlenme verileri KORUNUR (bkz. storage.hideLibraryItem).
				.filter((item) => !isLibraryHidden(hiddenItems, item))
				.map((item) => {
					if (item.completedEpisodesMap) {
						let completedCount = item.completedEpisodesMap.size;
						const totalCount = item.totalEpisodes || 0;
						// Seri seviyesi "tamamlandı" beyanı tüm bölümleri
						// kapsar; "0/N Bölüm" görünmemesi için sayaç en az
						// toplam kadar gösterilir.
						if (item.seriesLevelCompleted && totalCount > 0) {
							completedCount = Math.max(
								completedCount,
								totalCount,
							);
						}
						const progress =
							totalCount > 0 ? completedCount / totalCount : 1.0;
						return {
							...item,
							completedEpisodesCount: completedCount,
							totalEpisodesCount: totalCount,
							progress,
							isCompleted:
								totalCount > 0
									? completedCount >= totalCount
									: true,
						};
					}
					return item;
				})
		);
	}, [watchHistoryList, seriesTotalsMap, activePlatformName, hiddenItems]);

	// Aktif sekmeye göre ham liste seçimi
	const rawTabItems = useMemo(() => {
		switch (activeTab) {
			case "watching":
				return continueWatchingList;
			case "completed":
				return completedItemsGrouped;
			case "planned":
				return watchlist;
			case "favorites":
				return favoritesList;
			default:
				return continueWatchingList;
		}
	}, [
		activeTab,
		continueWatchingList,
		completedItemsGrouped,
		watchlist,
		favoritesList,
	]);

	// Filtrelenmiş ve Sıralanmış Liste
	const displayedItems = useMemo(() => {
		let list = [...rawTabItems];

		// 1. Arama Filtresi
		if (searchQuery.trim().length > 0) {
			const query = searchQuery.toLowerCase().trim();
			list = list.filter(
				(item) =>
					item.title?.toLowerCase().includes(query) ||
					item.seriesTitle?.toLowerCase().includes(query),
			);
		}

		// 2. Tür Filtresi — `utils/mediaType.js` tek kaynağı
		if (typeFilter !== "all") {
			list = list.filter((item) => matchesTypeFilter(item, typeFilter));
		}

		// 3. İlerleme Durumu Filtresi
		if (progressFilter === "in_progress") {
			list = list.filter((i) => i.progress > 0 && i.progress < 0.9);
		} else if (progressFilter === "not_started") {
			list = list.filter((i) => !i.progress || i.progress === 0);
		}

		// 4. Sıralama
		list.sort((a, b) => {
			if (sortBy === "last_watched") {
				const dateA = new Date(
					a.updatedAt || a.watchedAt || 0,
				).getTime();
				const dateB = new Date(
					b.updatedAt || b.watchedAt || 0,
				).getTime();
				return dateB - dateA;
			}
			if (sortBy === "date_added") {
				const dateA = new Date(
					a.createdAt || a.updatedAt || 0,
				).getTime();
				const dateB = new Date(
					b.createdAt || b.updatedAt || 0,
				).getTime();
				return dateB - dateA;
			}
			if (sortBy === "name_asc") {
				const titleA = (a.title || a.seriesTitle || "").toLowerCase();
				const titleB = (b.title || b.seriesTitle || "").toLowerCase();
				return titleA.localeCompare(titleB, "tr");
			}
			if (sortBy === "imdb_desc") {
				const ratingA = parseFloat(a.rating) || 0;
				const ratingB = parseFloat(b.rating) || 0;
				return ratingB - ratingA;
			}
			if (sortBy === "remaining_time") {
				const remA =
					a.duration && a.currentTime
						? a.duration - a.currentTime
						: 99999;
				const remB =
					b.duration && b.currentTime
						? b.duration - b.currentTime
						: 99999;
				return remA - remB;
			}
			return 0;
		});

		return list;
	}, [rawTabItems, searchQuery, typeFilter, progressFilter, sortBy]);

	/* Filtre hapındaki sayılar — süzgeç öncesi sekme toplamı. */
	const typeCounts = useMemo(
		() => ({
			all: rawTabItems.length,
			movie: rawTabItems.filter((i) => matchesTypeFilter(i, "movie"))
				.length,
			series: rawTabItems.filter((i) => matchesTypeFilter(i, "series"))
				.length,
			anime: rawTabItems.filter((i) => matchesTypeFilter(i, "anime"))
				.length,
		}),
		[rawTabItems],
	);

	/* Hızlı İşlemler: odaklanan kart listeden düştüyse ilk karta döner. */
	const quickActionItem = useMemo(() => {
		if (displayedItems.length === 0) return null;
		return (
			displayedItems.find((i) => itemKey(i) === focusedItemId) ||
			displayedItems[0]
		);
	}, [displayedItems, focusedItemId]);

	// ── Seçim modu ───────────────────────────────────────────────────
	const selectedItems = displayedItems.filter((i) =>
		selectedIds.has(itemKey(i)),
	);

	const exitSelection = () => {
		setIsSelectionMode(false);
		setSelectedIds(new Set());
	};

	const toggleSelect = (item) => {
		const key = itemKey(item);
		setSelectedIds((prev) => {
			const next = new Set(prev);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});
	};

	const handleCardPress = (item) => {
		if (isSelectionMode) toggleSelect(item);
		else handleOpenDetails(item);
	};

	const handleCardLongPress = (item) => {
		setIsSelectionMode(true);
		toggleSelect(item);
	};

	const toggleSelectAll = () => {
		setSelectedIds((prev) =>
			prev.size >= displayedItems.length
				? new Set()
				: new Set(displayedItems.map(itemKey)),
		);
	};

	// Seçenekler Menüsü (Kart Menüsü) - Artık Alert yerine şık modal açılıyor
	const handleItemOptions = (item) => {
		setSelectedActionItem(item);
		setIsActionModalVisible(true);
	};

	// Kitaplıktan Kaldır (Tamamlananlar dahil tüm sekmeler için çalışır)
	//
	// ⚠️ "Tamamlandı" sekmesinde kaldırma artık izleme geçmişini SİLMEZ
	// (eski davranış `removeFromWatchHistory` çağırıyordu ve tüm dizi
	// bölümlerinin işaretlerini tombstone'luyordu). Kaldırma yalnızca
	// görünürlük kaydı yazar; izlenme verisi hesaba bağlı kalır
	// (kullanıcı: "Veriler sıfırlanmadan silinmemeli").
	/**
	 * Tek öğeyi aktif sekmenin listesinden çıkarır (yeniden yükleme YOK —
	 * toplu eylemler tek seferde yüklesin diye ayrıldı).
	 */
	const removeItemFromList = async (item) => {
		if (!item) return;
		if (activeTab === "watching") {
			await removeContinueWatching(item);
		} else if (activeTab === "planned") {
			await toggleWatchlist(item);
		} else if (activeTab === "completed") {
			await hideLibraryItem(item);
		} else if (activeTab === "favorites") {
			await toggleFavorite(item);
		}
	};

	const handleRemoveItem = async (item) => {
		if (!item) return;
		try {
			await removeItemFromList(item);
			await loadLibraryData();
		} catch (error) {
			console.error("Kitaplıktan kaldırılırken hata:", error);
		}
	};

	// ── Toplu eylemler (seçim çubuğu) ────────────────────────────────
	const handleBulkRemove = async () => {
		try {
			for (const item of selectedItems) {
				await removeItemFromList(item);
			}
			exitSelection();
			await loadLibraryData();
		} catch (error) {
			console.error("Toplu kaldırma hatası:", error);
		}
	};

	const handleBulkMarkWatched = async () => {
		try {
			for (const item of selectedItems) {
				await markContentCompleted(item);
			}
			exitSelection();
			await loadLibraryData();
		} catch (error) {
			console.error("Toplu izlendi işaretleme hatası:", error);
		}
	};

	const handleBulkMoveToList = async (targetList) => {
		setIsBulkListSheetVisible(false);
		try {
			for (const item of selectedItems) {
				await setContentLibraryList(item, targetList);
			}
			exitSelection();
			await loadLibraryData();
		} catch (error) {
			console.error("Toplu liste taşıma hatası:", error);
		}
	};

	const handleMarkWatched = async (item) => {
		if (!item) return;
		try {
			await markContentCompleted(item);
			await loadLibraryData();
		} catch (error) {
			console.error("İzlendi işaretleme hatası:", error);
		}
	};

	// Listeyi Değiştir Modalı Aç
	const handleChangeList = (item) => {
		setListSelectTargetItem(item);
		setIsListSelectModalVisible(true);
	};

	// Oynatıcıyı Başlat
	const handlePlayItem = async (item) => {
		if (!item) return;

		// Tek kaynak: `utils/mediaType.js` (bkz. o dosyanın başlığı).
		// Eskiden buradaki zincir `content_type`'ı ÖNCE okuyordu ve
		// `completedEpisodesCount`/`season` gibi alanlara bakıyordu.
		const isDizi = isSeriesContent(item);

		let resolvedPlugin = item.plugin || activePlatformName;
		if (!resolvedPlugin) {
			try {
				const activePlat = await getSelectedPlatform();
				resolvedPlugin = activePlat?.name || "hdfilmcehennemi";
			} catch {
				resolvedPlugin = "hdfilmcehennemi";
			}
		}

		// 1. Zaten tekil bir bölüm ise (İzleniyor sekmesindeki devam eden bölüm)
		if (
			item.type === "episode" &&
			item.url &&
			item.season &&
			item.episode
		) {
			router.push({
				pathname: "/player",
				params: {
					url: item.url,
					title: item.seriesTitle || item.title || "Dizi",
					subtitle: `${item.season}. Sezon ${item.episode}. Bölüm${item.episodeTitle ? ` - ${item.episodeTitle}` : ""}`,
					poster: item.poster || item.poster_url || item.image,
					id: item.id || item.url,
					type: "episode",
					seriesId: item.seriesId,
					seriesUrl: item.seriesUrl || item.seriesId,
					seriesTitle: item.seriesTitle || item.title,
					season: item.season,
					episode: item.episode,
					episodeTitle: item.episodeTitle,
					totalEpisodes:
						item.totalEpisodes || item.totalEpisodesCount,
					currentTime: item.currentTime || 0,
					plugin: resolvedPlugin,
					nextEpisode: item.nextEpisode
						? typeof item.nextEpisode === "string"
							? item.nextEpisode
							: JSON.stringify(item.nextEpisode)
						: undefined,
				},
			});
			return;
		}

		// 2. Dizi ise (Planlanan, Favoriler, Tamamlanan veya genel dizi kartı):
		// İlk bölümden başlat (1. Sezon 1. Bölüm)
		if (isDizi) {
			const seriesUrl =
				item.seriesUrl ||
				item.url ||
				(String(item.id).startsWith("http") ? item.id : null);

			if (!seriesUrl) {
				handleOpenDetails(item);
				return;
			}

			const itemIdKey = item.id || item.url;
			try {
				setPlayingItemId(itemIdKey);
				// Bölüm listesini almak için plugin detayını çek
				let detail = item;
				if (!detail.seasons) {
					const res = await fetchPluginDetail(
						resolvedPlugin,
						seriesUrl,
					);
					if (res) {
						detail = res;
					}
				}

				const seasons = detail?.seasons;
				if (seasons && typeof seasons === "object") {
					const seasonKeys = Object.keys(seasons).sort(
						(a, b) => Number(a) - Number(b),
					);
					const firstSeasonKey = seasonKeys[0] || "1";
					const firstEpList = seasons[firstSeasonKey];
					if (Array.isArray(firstEpList) && firstEpList.length > 0) {
						const firstEp = firstEpList[0];
						const nextEp = firstEpList[1]
							? {
									id: firstEpList[1].id || firstEpList[1].url,
									url: firstEpList[1].url,
									title: firstEpList[1].title,
									season: Number(firstSeasonKey),
									episode: Number(
										firstEpList[1].episode ||
											firstEpList[1].episode_number ||
											2,
									),
									poster:
										firstEpList[1].poster ||
										item.poster ||
										item.poster_url,
								}
							: undefined;

						let totalEpCount = 0;
						seasonKeys.forEach((k) => {
							if (Array.isArray(seasons[k])) {
								totalEpCount += seasons[k].length;
							}
						});

						if (firstEp?.url) {
							router.push({
								pathname: "/player",
								params: {
									url: firstEp.url,
									title:
										item.title ||
										detail?.title ||
										item.seriesTitle ||
										"Dizi",
									subtitle: `${firstSeasonKey}. Sezon ${firstEp.episode || 1}. Bölüm${firstEp.title ? ` - ${firstEp.title}` : ""}`,
									poster:
										firstEp.poster ||
										item.poster ||
										item.poster_url ||
										item.image,
									id:
										firstEp.url ||
										`${seriesUrl}_s${firstSeasonKey}_e${firstEp.episode || 1}`,
									type: "episode",
									seriesId:
										item.seriesId || seriesUrl || item.id,
									seriesUrl: seriesUrl,
									seriesTitle:
										item.title ||
										detail?.title ||
										item.seriesTitle,
									season: Number(firstSeasonKey),
									episode: Number(firstEp.episode || 1),
									episodeTitle: firstEp.title || "",
									totalEpisodes:
										totalEpCount ||
										item.totalEpisodes ||
										item.totalEpisodesCount,
									plugin: resolvedPlugin,
									nextEpisode: nextEp
										? JSON.stringify(nextEp)
										: undefined,
								},
							});
							return;
						}
					}
				}

				// Eğer sezon/bölüm bulunamadıysa detay sayfasına yönlendir
				handleOpenDetails(item);
			} catch (err) {
				console.error("Dizi ilk bölümü başlatılırken hata:", err);
				handleOpenDetails(item);
			} finally {
				setPlayingItemId(null);
			}
			return;
		}

		// 3. Film için: Oynatılabilir url varsa oynat, yoksa detay sayfasına git
		const targetUrl =
			item.url || (String(item.id).startsWith("http") ? item.id : null);
		if (!targetUrl) {
			handleOpenDetails(item);
			return;
		}

		router.push({
			pathname: "/player",
			params: {
				url: targetUrl,
				title: item.title || "Film",
				subtitle: item.tagline || item.overview || "",
				poster: item.poster || item.poster_url || item.image,
				id: item.id || targetUrl,
				type: "movie",
				currentTime: item.currentTime || 0,
				plugin: resolvedPlugin,
			},
		});
	};

	// Detay Sayfasına Yönlendir
	// Detay Sayfasına Yönlendir
	const handleOpenDetails = (item) => {
		if (!item) return;

		const targetUrl =
			item.seriesUrl ||
			(item.type === "episode" &&
			item.seriesId &&
			(String(item.seriesId).startsWith("http") ||
				String(item.seriesId).startsWith("/"))
				? item.seriesId
				: null) ||
			item.url;

		const itemId = item.seriesId || item.id || targetUrl;
		const plugin = item.plugin || activePlatformName;

		const movieWithPlugin = {
			...item,
			id: itemId,
			url: targetUrl || item.url,
			seriesUrl: targetUrl || item.seriesUrl,
			plugin,
		};

		router.push({
			pathname: "/(app)/MovieDetails/[id]",
			params: {
				id: String(itemId),
				url: targetUrl || item.url,
				plugin,
				movieData: JSON.stringify(movieWithPlugin),
			},
		});
	};

	/**
	 * Izgara anahtarlari sabit fonksiyon. (Proje `reactCompiler: true` ile
	 * calistigi icin handler'lar zaten otomatik memoize ediliyor; bu yuzden
	 * elle useCallback eklemeye calismak compiler'in kuralina takiliyor.)
	 */
	const gridKeyExtractor = useCallback(
		(item, index) => item.id || item.url || String(index),
		[],
	);

	// Sekme Yapılandırması — adlar tasarımdan, sıra mevcut akıştan.
	const tabs = [
		{
			key: "watching",
			label: "İzlemeye Devam Edenler",
			count: continueWatchingList.length,
		},
		{
			key: "completed",
			label: "Tamamlananlar",
			count: completedItemsGrouped.length,
		},
		{
			key: "planned",
			label: "Planlananlar",
			count: watchlist.length,
		},
		{
			key: "favorites",
			label: "Favoriler",
			count: favoritesList.length,
		},
	];

	const activeTabLabel =
		tabs.find((t) => t.key === activeTab)?.label ?? "Kitaplık";

	const typeLabels = {
		all: "Tümü",
		movie: "Filmler",
		series: "Diziler",
		anime: "Anime",
	};

	// Sıralama Etiketi
	const sortLabels = {
		last_watched: "Son İzlenen",
		date_added: "Eklenme Tarihi",
		name_asc: "İsim (A-Z)",
		imdb_desc: "IMDb Puanı",
		remaining_time: "Kalan Süre",
	};

	// Kart Render Bileşeni (Grid Modu)
	const renderGridCard = ({ item }) => (
		<LibraryCard
			item={item}
			width={cardWidth}
			selected={selectedIds.has(itemKey(item))}
			onPress={() => handleCardPress(item)}
			onLongPress={() => handleCardLongPress(item)}
			onFocus={() => setFocusedItemId(itemKey(item))}
			onMore={() => handleItemOptions(item)}
		/>
	);

	// Liste Modu Satırı
	const renderListRow = ({ item }) => (
		<LibraryRow
			item={item}
			selected={selectedIds.has(itemKey(item))}
			onPress={() => handleCardPress(item)}
			onLongPress={() => handleCardLongPress(item)}
			onFocus={() => setFocusedItemId(itemKey(item))}
			onMore={() => handleItemOptions(item)}
		/>
	);

	// Sıralama seçenekleri — sheet satırları.
	const sortOptions = [
		{ key: "last_watched", label: "Son İzlenen" },
		{ key: "date_added", label: "Eklenme Tarihi (En Yeni)" },
		{ key: "name_asc", label: "İsim (A-Z)" },
		{ key: "imdb_desc", label: "IMDb Puanı (Yüksekten Düşüğe)" },
		{ key: "remaining_time", label: "Kalan Süre" },
	];

	const resetFilters = () => {
		setSortBy("last_watched");
		setTypeFilter("all");
		setProgressFilter("all");
	};

	// Boş Durum
	const renderEmptyState = () => (
		<View style={[styles.emptyContainer, { gap: sp(10) }]}>
			<View
				style={[
					styles.emptyIconBox,
					{
						width: sp(72),
						height: sp(72),
						borderRadius: sp(22),
						marginBottom: sp(6),
					},
				]}>
				<Ionicons
					name="library-outline"
					size={sp(34)}
					color={Palette.primary}
				/>
			</View>
			<Text style={[styles.emptyTitle, { fontSize: sp(17) }]}>
				{searchQuery.trim().length > 0
					? "Eşleşen İçerik Yok"
					: "Listenizde Henüz İçerik Yok"}
			</Text>
			<Text
				style={[
					styles.emptySubtitle,
					{ fontSize: sp(13), maxWidth: 320 },
				]}>
				{searchQuery.trim().length > 0
					? `"${searchQuery.trim()}" için kitaplığınızda sonuç bulunamadı.`
					: "Daha sonra izlemek istediğiniz veya takip ettiğiniz dizi ve filmleri buraya ekleyerek kitaplığınızı oluşturabilirsiniz."}
			</Text>
			{searchQuery.trim().length > 0 ? null : (
				<TVPressable
					onPress={() => router.push("/(app)")}
					activeOpacity={0.85}
					style={({ focused }) => [
						styles.emptyCtaButton,
						{
							height: sp(44),
							borderRadius: sp(22),
							paddingHorizontal: sp(20),
							marginTop: sp(8),
						},
						focused && styles.focusRing,
					]}>
					<Ionicons
						name="compass-outline"
						size={sp(17)}
						color={Palette.onPrimaryContainer}
					/>
					<Text style={[styles.emptyCtaText, { fontSize: sp(13) }]}>
						İçerikleri Keşfet
					</Text>
				</TVPressable>
			)}
		</View>
	);

	// Hızlı İşlemler paneli (TV / tablet yatay)
	const renderQuickActions = () => {
		const item = quickActionItem;
		if (!item) return null;
		const m = cardMeta(item);
		const playing = playingItemId === itemKey(item);

		// Panel satırları — tasarımdaki sıra: çıkar → taşı → izlendi → detay.
		const rows = [
			{
				key: "remove",
				icon: "remove-circle-outline",
				label: "Listeden Çıkar",
				onPress: () => handleRemoveItem(item),
				danger: true,
			},
			{
				key: "move",
				icon: "folder-open-outline",
				label: "Başka Listeye Taşı",
				onPress: () => handleChangeList(item),
			},
			{
				key: "watched",
				icon: "checkmark-done",
				label: "İzlendi Olarak İşaretle",
				onPress: () => handleMarkWatched(item),
			},
			{
				key: "details",
				icon: "information-circle-outline",
				label: "Detay Sayfasına Git",
				onPress: () => handleOpenDetails(item),
			},
		];

		return (
			<View
				style={[
					styles.panel,
					{
						width: panelWidth,
						borderRadius: sp(16),
						padding: sp(12),
						gap: sp(4),
						marginRight: PADDING_HORIZONTAL,
					},
				]}>
				<View style={[styles.panelHeaderRow, { gap: sp(8) }]}>
					<Text style={[styles.panelTitle, { fontSize: sp(13) }]}>
						Hızlı İşlemler
					</Text>
					<View
						style={[
							styles.panelPlugin,
							{
								borderRadius: sp(8),
								paddingHorizontal: sp(6),
								paddingVertical: sp(1),
							},
						]}>
						<Text
							numberOfLines={1}
							style={[
								styles.panelPluginText,
								{ fontSize: sp(9) },
							]}>
							{m.title}
						</Text>
					</View>
				</View>

				<TVPressable
					onPress={() => handlePlayItem(item)}
					disabled={playing}
					activeOpacity={0.85}
					style={({ focused }) => [
						styles.panelPrimaryButton,
						{
							height: sp(40),
							borderRadius: sp(20),
							gap: sp(8),
							marginVertical: sp(4),
						},
						focused && styles.focusRing,
					]}>
					{playing ? (
						<ActivityIndicator
							size="small"
							color={Palette.onPrimaryContainer}
						/>
					) : (
						<Ionicons
							name="play"
							size={sp(15)}
							color={Palette.onPrimaryContainer}
						/>
					)}
					<Text
						numberOfLines={1}
						style={[styles.panelPrimaryText, { fontSize: sp(12) }]}>
						Oynatmaya Devam Et
					</Text>
				</TVPressable>

				{rows.map((row) => (
					<TVPressable
						key={row.key}
						onPress={row.onPress}
						activeOpacity={0.75}
						style={({ focused }) => [
							styles.panelGhostButton,
							{
								paddingVertical: sp(5),
								paddingHorizontal: sp(6),
								borderRadius: sp(10),
								gap: sp(8),
							},
							focused && styles.focusRing,
						]}>
						<Ionicons
							name={row.icon}
							size={sp(14)}
							color={
								row.danger ? Palette.error : Palette.onSurface
							}
						/>
						<Text
							numberOfLines={1}
							style={[styles.panelGhostText, { fontSize: sp(12) }]}>
							{row.label}
						</Text>
					</TVPressable>
				))}
			</View>
		);
	};

	// Seçim çubuğu (telefon/tablet: altta, gezinme çubuğunun üstünde)
	const renderSelectionBar = () => {
		const actions = [
			{
				key: "remove",
				icon: "remove-circle-outline",
				label: "Çıkar",
				onPress: handleBulkRemove,
			},
			{
				key: "move",
				icon: "folder-open-outline",
				label: "Listeye Taşı",
				onPress: () => setIsBulkListSheetVisible(true),
			},
			{
				key: "watched",
				icon: "checkmark-done",
				label: "İzlendi",
				onPress: handleBulkMarkWatched,
			},
			{
				key: "details",
				icon: "open-outline",
				label: "Detaya Git",
				onPress: () => handleOpenDetails(selectedItems[0]),
				disabled: selectedItems.length !== 1,
			},
		];

		return (
			<View
				style={[
					styles.selectionBar,
					{
						paddingHorizontal: PADDING_HORIZONTAL,
						paddingTop: sp(10),
						paddingBottom: sp(10),
						gap: sp(10),
					},
				]}>
				<View style={[styles.selectionHeader, { gap: sp(8) }]}>
					<View
						style={[
							styles.selectionDot,
							{
								width: sp(8),
								height: sp(8),
								borderRadius: sp(4),
							},
						]}
					/>
					<Text
						style={[styles.selectionCount, { fontSize: sp(13) }]}>
						{selectedIds.size} İçerik Seçildi
					</Text>
					<TVPressable
						onPress={exitSelection}
						activeOpacity={0.75}
						style={({ focused }) => [
							{
								paddingHorizontal: sp(8),
								paddingVertical: sp(2),
								borderRadius: sp(8),
							},
							focused && styles.focusRing,
						]}>
						<Text
							style={[
								styles.selectionCancel,
								{ fontSize: sp(12) },
							]}>
							iptal
						</Text>
					</TVPressable>
				</View>

				<View style={[styles.selectionActions, { gap: sp(8) }]}>
					{actions.map((action) => (
						<TVPressable
							key={action.key}
							onPress={action.onPress}
							disabled={action.disabled}
							activeOpacity={0.8}
							style={({ focused }) => [
								styles.selectionAction,
								{
									borderRadius: sp(12),
									paddingVertical: sp(10),
									gap: sp(4),
									opacity: action.disabled ? 0.45 : 1,
								},
								action.key === "watched" &&
									styles.selectionActionSecondary,
								action.key === "details" &&
									styles.selectionActionPrimary,
								focused && styles.focusRing,
							]}>
							<Ionicons
								name={action.icon}
								size={sp(16)}
								color={
									action.key === "watched"
										? Palette.surfaceLowest
										: action.key === "details"
											? Palette.onPrimaryContainer
											: Palette.onSurface
								}
							/>
							<Text
								numberOfLines={1}
								style={[
									styles.selectionActionText,
									{
										fontSize: sp(11),
										color:
											action.key === "watched"
												? Palette.surfaceLowest
												: action.key === "details"
													? Palette.onPrimaryContainer
													: Palette.onSurface,
									},
								]}>
								{action.label}
							</Text>
						</TVPressable>
					))}
				</View>
			</View>
		);
	};

	return (
		<>
			<Stack.Screen options={{ headerShown: false }} />
			<SafeAreaView
				style={[styles.safeArea, { paddingLeft: contentPaddingLeft }]}
				edges={["top", "left", "right"]}>
				<StatusBar
					barStyle="light-content"
					backgroundColor={Palette.background}
				/>

				<View
					style={[
						styles.page,
						contentMaxWidth
							? {
									width: "100%",
									maxWidth: contentMaxWidth,
									alignSelf: "center",
								}
							: null,
					]}>
					{/* 1. BAŞLIK: Kitaplık + içerik sayısı + görünüm/düzenle */}
					<View
						style={[
							styles.titleRow,
							{
								paddingHorizontal: PADDING_HORIZONTAL,
								paddingTop: sp(10),
								gap: sp(10),
							},
						]}>
						<Text
							style={[
								styles.screenTitle,
								{ fontSize: sp(isTV ? 26 : 24) },
							]}>
							Kitaplık
						</Text>
						<View
							style={[
								styles.countPill,
								{
									borderRadius: sp(12),
									paddingHorizontal: sp(8),
									paddingVertical: sp(3),
								},
							]}>
							<Text
								style={[
									styles.countPillText,
									{ fontSize: sp(11) },
								]}>
								{displayedItems.length} İçerik
							</Text>
						</View>

						<View style={{ flex: 1 }} />

						<TVPressable
							onPress={() => setIsSortModalVisible(true)}
							accessibilityLabel="Sırala ve filtrele"
							style={({ focused }) => [
								styles.iconButton,
								{
									width: sp(36),
									height: sp(36),
									borderRadius: sp(18),
								},
								focused && styles.focusRing,
							]}>
							<Ionicons
								name="options-outline"
								size={sp(17)}
								color={Palette.onSurface}
							/>
						</TVPressable>
					</View>

					{/* 2. ARAMA */}
					<View
						style={[
							styles.searchPill,
							{
								marginHorizontal: PADDING_HORIZONTAL,
								marginTop: sp(10),
								height: sp(44),
								borderRadius: sp(22),
								paddingHorizontal: sp(14),
								gap: sp(8),
							},
						]}>
						<Ionicons
							name="search"
							size={sp(17)}
							color={Palette.onSurfaceVariant}
						/>
						<TextInput
							style={[
								styles.searchInput,
								{ fontSize: sp(14) },
							]}
							placeholder="Kitaplığımda ara..."
							placeholderTextColor={Palette.outline}
							value={searchQuery}
							onChangeText={setSearchQuery}
							returnKeyType="search"
							autoCorrect={false}
						/>
						{searchQuery.length > 0 && (
							<TVPressable
								onPress={() => setSearchQuery("")}
								accessibilityLabel="Aramayı temizle"
								style={({ focused }) => [
									styles.clearButton,
									{
										width: sp(26),
										height: sp(26),
										borderRadius: sp(13),
									},
									focused && styles.focusRing,
								]}>
								<Ionicons
									name="close"
									size={sp(14)}
									color={Palette.onSurfaceVariant}
								/>
							</TVPressable>
						)}
					</View>

					{/* 3. SEKMELER */}
					<ScrollView
						horizontal
						showsHorizontalScrollIndicator={false}
						style={{ marginTop: sp(12), flexGrow: 0 }}
						contentContainerStyle={{
							paddingHorizontal: PADDING_HORIZONTAL,
							gap: sp(8),
						}}>
						{tabs.map((tab) => {
							const isActive = activeTab === tab.key;
							return (
								<TVPressable
									key={tab.key}
									onPress={() => {
										setActiveTab(tab.key);
										exitSelection();
									}}
									activeOpacity={0.8}
									style={({ focused }) => [
										styles.tabPill,
										{
											height: sp(36),
											borderRadius: sp(18),
											paddingHorizontal: sp(14),
											gap: sp(6),
										},
										isActive
											? styles.tabPillActive
											: styles.tabPillIdle,
										focused && styles.focusRing,
									]}>
									<Text
										numberOfLines={1}
										style={[
											styles.tabText,
											{
												fontSize: sp(12),
												color: isActive
													? Palette.onPrimary
													: Palette.onSurfaceVariant,
											},
										]}>
										{tab.label}
									</Text>
									<View
										style={[
											styles.tabCountPill,
											{
												borderRadius: sp(8),
												paddingHorizontal: sp(6),
												paddingVertical: sp(1),
											},
											isActive &&
												styles.tabCountPillActive,
										]}>
										<Text
											style={[
												styles.tabCountText,
												{
													fontSize: sp(10),
													color: isActive
														? Palette.onPrimary
														: Palette.onSurfaceVariant,
												},
											]}>
											{tab.count}
										</Text>
									</View>
								</TVPressable>
							);
						})}
					</ScrollView>

					{/* 4. ARAÇ ÇUBUĞU: görünüm + sıralama + tür + düzenle */}
					<View
						style={[
							styles.toolbar,
							{
								paddingHorizontal: PADDING_HORIZONTAL,
								marginTop: sp(12),
								gap: sp(8),
							},
						]}>
						<View
							style={[
								styles.segmented,
								{
									borderRadius: sp(10),
									padding: sp(2),
									gap: sp(2),
								},
							]}>
							{[
								{ key: "grid", icon: "grid-outline" },
								{ key: "list", icon: "list-outline" },
							].map((mode) => (
								<TVPressable
									key={mode.key}
									onPress={() => setViewMode(mode.key)}
									accessibilityLabel={
										mode.key === "grid"
											? "Izgara görünümü"
											: "Liste görünümü"
									}
									style={({ focused }) => [
										styles.segmentItem,
										{
											width: sp(32),
											height: sp(28),
											borderRadius: sp(8),
										},
										viewMode === mode.key &&
											styles.segmentItemActive,
										focused && styles.focusRing,
									]}>
									<Ionicons
										name={mode.icon}
										size={sp(15)}
										color={
											viewMode === mode.key
												? Palette.onSurface
												: Palette.onSurfaceVariant
										}
									/>
								</TVPressable>
							))}
						</View>
						<Pill
							icon="swap-vertical"
							label={sortLabels[sortBy] || "Sırala"}
							onPress={() => setIsSortModalVisible(true)}
						/>
						<Pill
							icon="funnel-outline"
							label={`${typeLabels[typeFilter]} (${typeCounts[typeFilter] ?? 0})`}
							active={typeFilter !== "all"}
							onPress={() => setIsSortModalVisible(true)}
						/>
						{progressFilter !== "all" ? (
							<Pill
								icon="hourglass-outline"
								label={
									progressFilter === "in_progress"
										? "Devam Edenler"
										: "Başlanmayanlar"
								}
								active
								onPress={resetFilters}
							/>
						) : null}
						<Pill
							icon="checkmark-circle-outline"
							label={
								selectedIds.size > 0
									? `Düzenle (${selectedIds.size})`
									: "Düzenle"
							}
							active={isSelectionMode}
							onPress={() =>
								isSelectionMode
									? exitSelection()
									: setIsSelectionMode(true)
							}
						/>
					</View>

					{/* 5-6. İÇERİK: sol sütun (bölüm başlığı + ızgara) + sağda Hızlı İşlemler.
					    Panel bölüm başlığı hizasından başlar; ızgaranın altından
					    başlayınca ekranın altına taşıyordu. */}
					<View style={[styles.contentRow, { gap: PADDING_HORIZONTAL }]}>
						<View style={styles.contentColumn}>
							<View
								style={[
									styles.sectionRow,
									{
										paddingHorizontal: PADDING_HORIZONTAL,
										marginTop: sp(14),
										marginBottom: sp(10),
										gap: sp(8),
									},
								]}>
								<Text
									numberOfLines={1}
									style={[
										styles.sectionTitle,
										{ fontSize: sp(11) },
									]}>
									{`${activeTabLabel} (${
										isSelectionMode
											? `${selectedIds.size} Seçili`
											: displayedItems.length
									})`}
								</Text>
								{isSelectionMode && displayedItems.length > 0 ? (
									<TVPressable
										onPress={toggleSelectAll}
										activeOpacity={0.75}
										style={({ focused }) => [
											{
												paddingHorizontal: sp(8),
												paddingVertical: sp(2),
												borderRadius: sp(8),
											},
											focused && styles.focusRing,
										]}>
										<Text
											style={[
												styles.selectAllText,
												{ fontSize: sp(12) },
											]}>
											{selectedIds.size >=
											displayedItems.length
												? "Seçimi Kaldır"
												: "Tümünü Seç"}
										</Text>
									</TVPressable>
								) : null}
							</View>

							<FlatList
								key={
									viewMode === "list"
										? "list"
										: `grid-${columns}`
								}
								contentInsetAdjustmentBehavior="automatic"
								data={displayedItems}
								renderItem={
									viewMode === "list"
										? renderListRow
										: renderGridCard
								}
								keyExtractor={gridKeyExtractor}
								numColumns={columns}
								style={{ flex: 1 }}
								contentContainerStyle={[
									styles.listContent,
									displayedItems.length === 0 &&
										styles.listContentEmpty,
								]}
								columnWrapperStyle={
									columns > 1 ? styles.columnWrapper : undefined
								}
								ListEmptyComponent={renderEmptyState}
								showsVerticalScrollIndicator={false}
								// removeClippedSubviews TV'de false KALMALI: odaklı
								// kartın detache olması kumanda odağını kaybettirir.
								initialNumToRender={6}
								maxToRenderPerBatch={4}
								windowSize={5}
								removeClippedSubviews={false}
							/>
						</View>
						{showQuickActions ? renderQuickActions() : null}
					</View>

					{/* 7. SEÇİM ÇUBUĞU */}
					{isSelectionMode && displayedItems.length > 0
						? renderSelectionBar()
						: null}
				</View>

				<BottomNavigation activeRoute="/(app)/library" />

				{/* 8. SIRALA VE FİLTRELE */}
				<BottomSheetModal
					visible={isSortModalVisible}
					onClose={() => setIsSortModalVisible(false)}
					snapToHeight={isTV ? 0.9 : 0.68}
					title="Sırala ve Filtrele"
					opacity={0.7}
					handle={true}>
					<ScrollView
						showsVerticalScrollIndicator={false}
						contentContainerStyle={{ paddingBottom: sp(12) }}>
						<Text
							style={[
								styles.sheetLabel,
								{ fontSize: sp(11), marginBottom: sp(8) },
							]}>
							SIRALAMA ÖLÇÜTÜ
						</Text>
						<View style={{ gap: sp(6) }}>
							{sortOptions.map((opt) => {
								const isSelected = sortBy === opt.key;
								return (
									<TVPressable
										key={opt.key}
										onPress={() => setSortBy(opt.key)}
										activeOpacity={0.75}
										style={({ focused }) => [
											styles.sheetRow,
											{
												height: sp(44),
												borderRadius: sp(12),
												paddingHorizontal: sp(12),
												gap: sp(10),
											},
											isSelected &&
												styles.sheetRowActive,
											focused && styles.focusRing,
										]}>
										<View
											style={[
												styles.radio,
												{
													width: sp(18),
													height: sp(18),
													borderRadius: sp(9),
												},
												isSelected &&
													styles.radioActive,
											]}>
											{isSelected ? (
												<View
													style={[
														styles.radioDot,
														{
															width: sp(8),
															height: sp(8),
															borderRadius: sp(4),
														},
													]}
												/>
											) : null}
										</View>
										<Text
											numberOfLines={1}
											style={[
												styles.sheetRowText,
												{
													fontSize: sp(13),
													color: isSelected
														? Palette.onSurface
														: Palette.onSurfaceVariant,
												},
											]}>
											{opt.label}
										</Text>
									</TVPressable>
								);
							})}
						</View>

						<Text
							style={[
								styles.sheetLabel,
								{
									fontSize: sp(11),
									marginTop: sp(18),
									marginBottom: sp(8),
								},
							]}>
							TÜR
						</Text>
						<View style={[styles.chipRow, { gap: sp(8) }]}>
							{Object.keys(typeLabels).map((key) => (
								<Pill
									key={key}
									label={`${typeLabels[key]} (${typeCounts[key] ?? 0})`}
									active={typeFilter === key}
									onPress={() => setTypeFilter(key)}
								/>
							))}
						</View>

						<Text
							style={[
								styles.sheetLabel,
								{
									fontSize: sp(11),
									marginTop: sp(18),
									marginBottom: sp(8),
								},
							]}>
							İLERLEME DURUMU
						</Text>
						<View style={[styles.chipRow, { gap: sp(8) }]}>
							<Pill
								label="Devam Edenler"
								active={progressFilter === "in_progress"}
								onPress={() =>
									setProgressFilter((p) =>
										p === "in_progress"
											? "all"
											: "in_progress",
									)
								}
							/>
							<Pill
								label="Henüz Başlanmayanlar"
								active={progressFilter === "not_started"}
								onPress={() =>
									setProgressFilter((p) =>
										p === "not_started"
											? "all"
											: "not_started",
									)
								}
							/>
						</View>
					</ScrollView>

					<TVPressable
						onPress={resetFilters}
						activeOpacity={0.75}
						style={({ focused }) => [
							styles.resetButton,
							{
								height: sp(46),
								borderRadius: sp(23),
								marginTop: sp(12),
							},
							focused && styles.focusRing,
						]}>
						<Ionicons
							name="refresh"
							size={sp(16)}
							color={Palette.onSurface}
						/>
						<Text
							style={[
								styles.resetButtonText,
								{ fontSize: sp(14) },
							]}>
							Filtreleri Sıfırla
						</Text>
					</TVPressable>
				</BottomSheetModal>

				{/* 9. TOPLU LİSTE SEÇİMİ */}
				<BottomSheetModal
					visible={isBulkListSheetVisible}
					onClose={() => setIsBulkListSheetVisible(false)}
					fitContent={true}
					title={`${selectedIds.size} içeriği taşı`}
					opacity={0.7}
					handle={true}>
					<View style={{ gap: sp(8), paddingBottom: sp(8) }}>
						{[
							{
								key: "watching",
								label: "İzlemeye Devam Edenler",
								icon: "play-circle-outline",
							},
							{
								key: "planned",
								label: "Planlananlar",
								icon: "bookmark-outline",
							},
							{
								key: "completed",
								label: "Tamamlananlar",
								icon: "checkmark-circle-outline",
							},
						].map((opt) => (
							<TVPressable
								key={opt.key}
								onPress={() => handleBulkMoveToList(opt.key)}
								activeOpacity={0.75}
								style={({ focused }) => [
									styles.sheetRow,
									{
										height: sp(50),
										borderRadius: sp(12),
										paddingHorizontal: sp(12),
										gap: sp(10),
									},
									focused && styles.focusRing,
								]}>
								<Ionicons
									name={opt.icon}
									size={sp(18)}
									color={Palette.primary}
								/>
								<Text
									numberOfLines={1}
									style={[
										styles.sheetRowText,
										{
											fontSize: sp(14),
											color: Palette.onSurface,
										},
									]}>
									{opt.label}
								</Text>
							</TVPressable>
						))}
					</View>
				</BottomSheetModal>

				{/* 10. KART EYLEM MENÜSÜ */}
				<LibraryItemActionModal
					visible={isActionModalVisible}
					item={selectedActionItem}
					activeTab={activeTab}
					onClose={() => setIsActionModalVisible(false)}
					onGoDetails={() => {
						if (selectedActionItem)
							handleOpenDetails(selectedActionItem);
					}}
					onChangeList={() => {
						if (selectedActionItem)
							handleChangeList(selectedActionItem);
					}}
					onRemove={() => {
						if (selectedActionItem)
							handleRemoveItem(selectedActionItem);
					}}
					onShare={async () => {
						if (selectedActionItem) {
							try {
								await Share.share({
									title:
										selectedActionItem.title ||
										"StreamPulse",
									message: `StreamPulse'da "${selectedActionItem.title}" izle! ${selectedActionItem.url || ""}`,
								});
							} catch (_e) {}
						}
					}}
				/>

				{/* 11. TEK ÖĞE LİSTE SEÇİMİ */}
				<ListSelectModal
					visible={isListSelectModalVisible}
					movie={listSelectTargetItem}
					onClose={() => setIsListSelectModalVisible(false)}
					onStatusChanged={async () => {
						await loadLibraryData();
					}}
				/>
			</SafeAreaView>
		</>
	);
}

/* ── Sunum bileşenleri (liste dışında: yeniden kurulmasın) ───────── */

function Pill({ icon, label, active = false, onPress }) {
	const { sp } = useTvMetrics();
	return (
		<TVPressable
			onPress={onPress}
			activeOpacity={0.75}
			style={({ focused }) => [
				styles.pill,
				{
					height: sp(34),
					borderRadius: sp(17),
					paddingHorizontal: sp(12),
					gap: sp(6),
				},
				active && styles.pillActive,
				focused && styles.focusRing,
			]}>
			{icon ? (
				<Ionicons
					name={icon}
					size={sp(13)}
					color={active ? Palette.onPrimary : Palette.onSurfaceVariant}
				/>
			) : null}
			<Text
				numberOfLines={1}
				style={[
					styles.pillText,
					{
						fontSize: sp(12),
						color: active ? Palette.onPrimary : Palette.onSurfaceVariant,
					},
				]}>
				{label}
			</Text>
		</TVPressable>
	);
}

function LibraryCard({
	item,
	width,
	selected,
	onPress,
	onLongPress,
	onFocus,
	onMore,
}) {
	const { sp } = useTvMetrics();
	const m = cardMeta(item);

	return (
		<TVPressable
			onPress={onPress}
			onLongPress={onLongPress}
			onFocus={onFocus}
			activeOpacity={0.85}
			accessibilityLabel={m.title}
			style={({ focused }) => [
				styles.card,
				{ width, borderRadius: sp(14) },
				(selected || focused) && styles.cardActive,
			]}>
			<View style={styles.posterWrap}>
				<Image
					source={{ uri: m.posterUri }}
					style={styles.posterImage}
					contentFit="cover"
					transition={0}
					recyclingKey={m.posterUri}
				/>

				{m.plugin ? (
					<View
						style={[
							styles.pluginBadge,
							{
								borderRadius: sp(6),
								paddingHorizontal: sp(6),
								paddingVertical: sp(2),
							},
						]}>
						<Text
							numberOfLines={1}
							style={[
								styles.pluginBadgeText,
								{ fontSize: sp(9) },
							]}>
							{m.plugin}
						</Text>
					</View>
				) : null}

				{m.ratingVal ? (
					<View
						style={[
							styles.ratingBadge,
							{
								borderRadius: sp(8),
								paddingHorizontal: sp(6),
								paddingVertical: sp(2),
								gap: sp(3),
							},
						]}>
						<Ionicons
							name="star"
							size={sp(10)}
							color={Palette.tertiary}
						/>
						<Text
							style={[
								styles.ratingText,
								{ fontSize: sp(10) },
							]}>
							{m.ratingVal}
						</Text>
					</View>
				) : null}
			</View>

			<View style={styles.progressTrack}>
				<View
					style={[
						styles.progressFill,
						{ width: `${m.progressPercent || 0}%` },
					]}
				/>
			</View>

			<View
				style={[
					styles.cardBody,
					{
						paddingHorizontal: sp(10),
						paddingTop: sp(8),
						paddingBottom: sp(10),
						gap: sp(4),
					},
				]}>
				<View style={[styles.cardTitleRow, { gap: sp(6) }]}>
					<Text
						numberOfLines={1}
						style={[styles.cardTitle, { fontSize: sp(14) }]}>
						{m.title}
					</Text>
					<TVPressable
						onPress={onMore}
						hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
						accessibilityLabel="Seçenekler"
						style={({ focused }) => [
							{
								width: sp(20),
								height: sp(20),
								borderRadius: sp(10),
								alignItems: "center",
								justifyContent: "center",
							},
							focused && styles.focusRing,
						]}>
						<Ionicons
							name="ellipsis-vertical"
							size={sp(13)}
							color={Palette.onSurfaceVariant}
						/>
					</TVPressable>
				</View>

				<View style={[styles.cardMetaRow, { gap: sp(6) }]}>
					<Text
						numberOfLines={1}
						style={[styles.cardMeta, { fontSize: sp(11) }]}>
						{m.episodeText}
						{m.progressPercent > 0
							? ` · %${m.progressPercent}`
							: ""}
					</Text>
					{m.remainingText ? (
						<Text
							numberOfLines={1}
							style={[
								styles.cardRemaining,
								{ fontSize: sp(11) },
							]}>
							{m.remainingText}
						</Text>
					) : null}
				</View>
			</View>
		</TVPressable>
	);
}

function LibraryRow({
	item,
	selected,
	onPress,
	onLongPress,
	onFocus,
	onMore,
}) {
	const { sp } = useTvMetrics();
	const m = cardMeta(item);

	return (
		<TVPressable
			onPress={onPress}
			onLongPress={onLongPress}
			onFocus={onFocus}
			activeOpacity={0.85}
			accessibilityLabel={m.title}
			style={({ focused }) => [
				styles.row,
				{
					borderRadius: sp(12),
					padding: sp(8),
					gap: sp(12),
				},
				(selected || focused) && styles.cardActive,
			]}>
			<Image
				source={{ uri: m.posterUri }}
				style={[
					styles.rowPoster,
					{
						width: sp(56),
						height: sp(84),
						borderRadius: sp(8),
					},
				]}
				contentFit="cover"
				transition={0}
				recyclingKey={m.posterUri}
			/>

			<View style={[styles.rowBody, { gap: sp(6) }]}>
				<Text
					numberOfLines={1}
					style={[styles.rowTitle, { fontSize: sp(14) }]}>
					{m.title}
				</Text>
				<Text
					numberOfLines={1}
					style={[styles.rowMeta, { fontSize: sp(11) }]}>
					{m.episodeText}
				</Text>
				<View style={styles.progressTrack}>
					<View
						style={[
							styles.progressFill,
							{ width: `${m.progressPercent || 0}%` },
						]}
					/>
				</View>
			</View>

			{m.remainingText ? (
				<Text
					numberOfLines={1}
					style={[styles.cardRemaining, { fontSize: sp(11) }]}>
					{m.remainingText}
				</Text>
			) : null}

			<TVPressable
				onPress={onMore}
				hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
				accessibilityLabel="Seçenekler"
				style={({ focused }) => [
					{
						width: sp(24),
						height: sp(24),
						borderRadius: sp(12),
						alignItems: "center",
						justifyContent: "center",
					},
					focused && styles.focusRing,
				]}>
				<Ionicons
					name="ellipsis-vertical"
					size={sp(14)}
					color={Palette.onSurfaceVariant}
				/>
			</TVPressable>
		</TVPressable>
	);
}

const styles = StyleSheet.create({
	safeArea: {
		flex: 1,
		backgroundColor: Palette.background,
	},
	page: {
		flex: 1,
	},

	/* 1. Başlık */
	titleRow: {
		flexDirection: "row",
		alignItems: "center",
	},
	screenTitle: {
		color: Palette.onSurface,
		fontFamily: FontFamily.bold,
		letterSpacing: -0.4,
	},
	countPill: {
		backgroundColor: Palette.surfaceHigh,
	},
	countPillText: {
		color: Palette.onSurfaceVariant,
		fontFamily: FontFamily.semiBold,
	},
	segmented: {
		flexDirection: "row",
		backgroundColor: Palette.surfaceLow,
	},
	iconButton: {
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: Palette.surfaceHigh,
	},
	segmentItem: {
		alignItems: "center",
		justifyContent: "center",
	},
	segmentItemActive: {
		backgroundColor: Palette.surfaceHighest,
	},

	/* Hap (sıralama / tür / düzenle) */
	pill: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: Palette.surfaceLow,
		maxWidth: "100%",
	},
	pillActive: {
		backgroundColor: Palette.primary,
	},
	pillText: {
		fontFamily: FontFamily.semiBold,
		flexShrink: 1,
	},

	/* 2. Arama */
	searchPill: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: Palette.surfaceHigh,
	},
	searchInput: {
		flex: 1,
		paddingVertical: 0,
		color: Palette.onSurface,
		fontFamily: FontFamily.medium,
	},
	clearButton: {
		backgroundColor: Palette.surfaceHighest,
		alignItems: "center",
		justifyContent: "center",
	},

	/* 3. Sekmeler */
	tabPill: {
		flexDirection: "row",
		alignItems: "center",
	},
	tabPillActive: {
		backgroundColor: Palette.primary,
	},
	tabPillIdle: {
		backgroundColor: Palette.surfaceLow,
	},
	tabText: {
		fontFamily: FontFamily.semiBold,
	},
	tabCountPill: {
		backgroundColor: "rgba(14, 14, 16, 0.28)",
	},
	tabCountPillActive: {
		backgroundColor: "rgba(14, 14, 16, 0.18)",
	},
	tabCountText: {
		fontFamily: FontFamily.bold,
	},

	/* 4. Araç çubuğu */
	toolbar: {
		flexDirection: "row",
		alignItems: "center",
		flexWrap: "wrap",
	},

	/* 5. Bölüm başlığı */
	sectionRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
	sectionTitle: {
		flexShrink: 1,
		color: Palette.onSurfaceVariant,
		fontFamily: FontFamily.bold,
		letterSpacing: 1.1,
		textTransform: "uppercase",
	},
	selectAllText: {
		color: Palette.primary,
		fontFamily: FontFamily.semiBold,
	},

	/* 6. İçerik */
	contentRow: {
		flex: 1,
		flexDirection: "row",
	},
	contentColumn: {
		flex: 1,
	},
	listContent: {
		paddingHorizontal: PADDING_HORIZONTAL,
		paddingBottom: 24,
	},
	listContentEmpty: {
		flexGrow: 1,
		justifyContent: "center",
	},
	columnWrapper: {
		// ⚠️ `space-between` DEĞİL: tam dolmayan son satırda kartları iki
		// uca yayıyordu. Kart genişlikleri satırı tam doldurduğu için
		// (cardWidthFor) `gap` ile tam satırlar birebir aynı kalır.
		justifyContent: "flex-start",
		gap: CARD_GAP,
		marginBottom: CARD_GAP,
	},

	/* Kart */
	card: {
		backgroundColor: Palette.surfaceLow,
		overflow: "hidden",
	},
	cardActive: {
		borderColor: Palette.primary,
		borderWidth: 2,
	},
	posterWrap: {
		width: "100%",
		aspectRatio: 2 / 3,
		backgroundColor: Palette.surfaceLowest,
		position: "relative",
	},
	posterImage: {
		width: "100%",
		height: "100%",
	},
	pluginBadge: {
		position: "absolute",
		top: 8,
		left: 8,
		maxWidth: "58%",
		backgroundColor: "rgba(14, 14, 16, 0.78)",
	},
	pluginBadgeText: {
		color: Palette.onSurface,
		fontFamily: FontFamily.bold,
		letterSpacing: 0.5,
		textTransform: "uppercase",
	},
	ratingBadge: {
		position: "absolute",
		top: 8,
		right: 8,
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: "rgba(14, 14, 16, 0.78)",
	},
	ratingText: {
		color: Palette.tertiary,
		fontFamily: FontFamily.bold,
	},
	progressTrack: {
		height: 3,
		backgroundColor: "rgba(229, 225, 228, 0.16)",
	},
	progressFill: {
		height: "100%",
		backgroundColor: Palette.primary,
	},
	cardBody: {},
	cardTitleRow: {
		flexDirection: "row",
		alignItems: "center",
	},
	cardTitle: {
		flex: 1,
		color: Palette.onSurface,
		fontFamily: FontFamily.semiBold,
	},
	cardMetaRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
	cardMeta: {
		flexShrink: 1,
		color: Palette.onSurfaceVariant,
		fontFamily: FontFamily.medium,
	},
	cardRemaining: {
		color: Palette.secondary,
		fontFamily: FontFamily.semiBold,
	},

	/* Liste satırı */
	row: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: Palette.surfaceLow,
		marginBottom: 8,
	},
	rowPoster: {
		backgroundColor: Palette.surfaceHigh,
	},
	rowBody: {
		flex: 1,
	},
	rowTitle: {
		color: Palette.onSurface,
		fontFamily: FontFamily.semiBold,
	},
	rowMeta: {
		color: Palette.onSurfaceVariant,
		fontFamily: FontFamily.medium,
	},

	/* Hızlı İşlemler paneli */
	panel: {
		alignSelf: "flex-start",
		backgroundColor: Palette.surfaceLow,
		borderWidth: 1,
		borderColor: "rgba(229, 225, 228, 0.08)",
	},
	panelHeaderRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
	panelTitle: {
		color: Palette.onSurface,
		fontFamily: FontFamily.bold,
		flexShrink: 0,
	},
	panelPlugin: {
		backgroundColor: "rgba(192, 193, 255, 0.14)",
		flexShrink: 1,
		minWidth: 0,
	},
	panelPluginText: {
		color: Palette.primary,
		fontFamily: FontFamily.semiBold,
		letterSpacing: 0.4,
		textTransform: "uppercase",
	},
	panelPrimaryButton: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: Palette.primaryContainer,
	},
	panelPrimaryText: {
		color: Palette.onPrimaryContainer,
		fontFamily: FontFamily.bold,
		flexShrink: 1,
	},
	panelGhostButton: {
		flexDirection: "row",
		alignItems: "center",
	},
	panelGhostText: {
		color: Palette.onSurface,
		fontFamily: FontFamily.medium,
		flexShrink: 1,
	},

	/* Seçim çubuğu */
	selectionBar: {
		backgroundColor: Palette.surfaceLow,
		borderTopWidth: 1,
		borderTopColor: "rgba(229, 225, 228, 0.08)",
	},
	selectionHeader: {
		flexDirection: "row",
		alignItems: "center",
	},
	selectionDot: {
		backgroundColor: Palette.secondary,
	},
	selectionCount: {
		flex: 1,
		color: Palette.onSurface,
		fontFamily: FontFamily.semiBold,
	},
	selectionCancel: {
		color: Palette.onSurfaceVariant,
		fontFamily: FontFamily.medium,
	},
	selectionActions: {
		flexDirection: "row",
	},
	selectionAction: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: Palette.surfaceHigh,
	},
	selectionActionSecondary: {
		backgroundColor: Palette.secondary,
	},
	selectionActionPrimary: {
		backgroundColor: Palette.primaryContainer,
	},
	selectionActionText: {
		fontFamily: FontFamily.semiBold,
		textAlign: "center",
	},

	/* Boş durum */
	emptyContainer: {
		alignItems: "center",
		justifyContent: "center",
		paddingVertical: 48,
		paddingHorizontal: 24,
	},
	emptyIconBox: {
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: Palette.surfaceHigh,
	},
	emptyTitle: {
		color: Palette.onSurface,
		fontFamily: FontFamily.bold,
		textAlign: "center",
	},
	emptySubtitle: {
		color: Palette.onSurfaceVariant,
		fontFamily: FontFamily.regular,
		textAlign: "center",
		lineHeight: 20,
	},
	emptyCtaButton: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: Palette.primaryContainer,
	},
	emptyCtaText: {
		color: Palette.onPrimaryContainer,
		fontFamily: FontFamily.bold,
	},

	/* Sheet */
	sheetLabel: {
		color: Palette.onSurfaceVariant,
		fontFamily: FontFamily.bold,
		letterSpacing: 1.1,
	},
	sheetRow: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: Palette.surfaceLow,
	},
	sheetRowActive: {
		backgroundColor: Palette.surface,
	},
	sheetRowText: {
		flexShrink: 1,
		fontFamily: FontFamily.medium,
	},
	radio: {
		borderWidth: 1.5,
		borderColor: Palette.outline,
		alignItems: "center",
		justifyContent: "center",
	},
	radioActive: {
		borderColor: Palette.primary,
	},
	radioDot: {
		backgroundColor: Palette.primary,
	},
	chipRow: {
		flexDirection: "row",
		alignItems: "center",
		flexWrap: "wrap",
	},
	resetButton: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: Palette.surfaceHigh,
		gap: 8,
	},
	resetButtonText: {
		color: Palette.onSurface,
		fontFamily: FontFamily.semiBold,
	},

	/* Odak: yalnızca halka */
	focusRing: {
		borderColor: Palette.primary,
		borderWidth: 2,
	},
});
