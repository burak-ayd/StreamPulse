import BottomNavigation from "@/components/BottomNavigation";
import TVPressable from "@/components/common/TVPressable";
import LibraryItemActionModal from "@/components/modal/LibraryItemActionModal";
import ListSelectModal from "@/components/modal/ListSelectModal";
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
	removeContinueWatching,
	toggleFavorite,
	toggleWatchlist,
} from "@/utils/storage";
import { useReactiveData } from "@/utils/storageListener";
import { useTvMetrics } from "@/utils/tvMetrics";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import Image from "@/components/common/SmartImage";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
	ActivityIndicator,
	BackHandler,
	FlatList,
	Modal,
	Pressable,
	ScrollView,
	Share,
	StatusBar,
	StyleSheet,
	Text,
	TextInput,
	TouchableOpacity,
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
 * 190 → 150 (TV geri bildirimi): 864dp kutuda 4 sütun × ~197dp kartlar
 * hâlâ büyük duruyordu; 150 ile 5 sütun × ~155dp çıkar. Telefon dikeyde
 * sonuç değişmez (hâlâ 2 sütun).
 */
const MIN_CARD_WIDTH = 150;

// Göreceli zaman biçimlendirici (Türkçe)
function formatRelativeTime(dateString) {
	if (!dateString) return "Yakın zamanda";
	const diffMs = Date.now() - new Date(dateString).getTime();
	if (isNaN(diffMs)) return "Yakın zamanda";
	const diffMin = Math.floor(diffMs / 60000);
	if (diffMin < 1) return "Az önce";
	if (diffMin < 60) return `${diffMin} dk önce`;
	const diffHour = Math.floor(diffMin / 60);
	if (diffHour < 24) return `${diffHour} saat önce`;
	const diffDay = Math.floor(diffHour / 24);
	if (diffDay === 1) return "Dün";
	if (diffDay < 7) return `${diffDay} gün önce`;
	const diffWeek = Math.floor(diffDay / 7);
	if (diffWeek === 1) return "Geçen hafta";
	return `${diffWeek} hafta önce`;
}

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
	const { sp, contentMaxWidth, width: screenWidth } = useTvMetrics();

	/**
	 * Kitaplık kutusu: daraltılmış içerik sütunu varsa o, yoksa ekran.
	 */
	const boxWidth = contentMaxWidth ?? screenWidth;

	/**
	 * Sütun sayısı SABİT DEĞİL (eskiden `isTV ? 4 : 2`).
	 *
	 * ⚠️ Sabit sayı ara ekranlarda yanlış çıkıyordu: yatay telefonda
	 * (≈800dp) 2 sütun → ~345dp'lik dev kartlar, 10" tablet yatayda ise
	 * 4 sütun küçük kalıyordu. Kart sayısı kutunun genişliğinden türetilir
	 * (`hooks/useMeasuredColumns.js` ile aynı formül) — kutunun genişliği
	 * burada zaten bilindiği için `onLayout` ölçümüne gerek yok.
	 */
	const columns = Math.min(
		Math.max(
			Math.floor(
				(boxWidth - PADDING_HORIZONTAL * 2 + CARD_GAP) /
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
	const cardWidth = cardWidthFor(boxWidth, columns);

	// Durum Sekmeleri (Beklemede ve Bırakıldı kaldırıldı)
	const [activeTab, setActiveTab] = useState("watching"); // 'watching' | 'completed' | 'planned' | 'favorites'

	// Filtreler & Sıralama
	const [searchQuery, setSearchQuery] = useState("");
	const [sortBy, setSortBy] = useState("last_watched"); // 'last_watched' | 'date_added' | 'name_asc' | 'imdb_desc' | 'remaining_time'
	const [typeFilter, setTypeFilter] = useState("all"); // 'all' | 'movie' | 'series' | 'anime'
	const [progressFilter, setProgressFilter] = useState("all"); // 'all' | 'in_progress' | 'not_started'
	const [isSortModalVisible, setIsSortModalVisible] = useState(false);
	const [viewMode, setViewMode] = useState("grid"); // 'grid' | 'list'

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
				if (isActionModalVisible) {
					setIsActionModalVisible(false);
					return true;
				}
				if (isListSelectModalVisible) {
					setIsListSelectModalVisible(false);
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
			isActionModalVisible,
			isListSelectModalVisible,
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
						plugin: item.plugin || activePlatformName,
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
			list = list.filter((item) => {
				const tip = canonicalType(item);
				if (typeFilter === "movie") return tip === "movie";
				if (typeFilter === "series") return tip === "series";
				if (typeFilter === "anime") {
					// Anime ayrı bir filtre olarak duruyor ama veri modelinde
					// ayrı bir alanı yok; `normalizeMediaType` "anime" değerini
					// "series" sınıfına indirger. Bu yüzden burada içerik
					// metninden ayrıca aranır.
					const metin =
						`${item.title || ""} ${item.category || ""}`.toLowerCase();
					return tip === "series" && metin.includes("anime");
				}
				return true;
			});
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
	const handleRemoveItem = async (item) => {
		if (!item) return;
		try {
			if (activeTab === "watching") {
				await removeContinueWatching(item);
			} else if (activeTab === "planned") {
				await toggleWatchlist(item);
			} else if (activeTab === "completed") {
				await hideLibraryItem(item);
			} else if (activeTab === "favorites") {
				await toggleFavorite(item);
			}
			await loadLibraryData();
		} catch (error) {
			console.error("Kitaplıktan kaldırılırken hata:", error);
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

	// Sekme Yapılandırması
	const tabs = [
		{
			key: "watching",
			label: "İzleniyor",
			icon: "play-circle",
			count: continueWatchingList.length,
			iconColor: "#ffffff",
		},
		{
			key: "completed",
			label: "Tamamlandı",
			icon: "checkmark-circle",
			count: completedItemsGrouped.length,
			iconColor: "#34d399",
		},
		{
			key: "planned",
			label: "Planlandı",
			icon: "bookmark",
			count: watchlist.length,
			iconColor: "#60a5fa",
		},
		{
			key: "favorites",
			label: "Favoriler",
			icon: "heart",
			count: favoritesList.length,
			iconColor: "#f43f5e",
		},
	];

	// Sıralama Etiketi
	const sortLabels = {
		last_watched: "Son İzlenen",
		date_added: "Eklenme Tarihi",
		name_asc: "İsim (A-Z)",
		imdb_desc: "IMDb Puanı",
		remaining_time: "Kalan Süre",
	};

	// Kart Render Bileşeni (Grid Modu)
	const renderGridCard = ({ item }) => {
		const isCompletedSeriesGroup =
			item.completedEpisodesCount !== undefined;
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
				? `${item.season}. Sezon ${item.episode}. Bölüm`
				: item.runtime_minutes
					? `${item.runtime_minutes} dk`
					: isDizi
						? "Dizi"
						: "Film";

		return (
			<TVPressable
				style={[
					styles.card,
					{ width: cardWidth, borderRadius: sp(16) },
				]}
				focusedStyle={styles.cardFocused}
				onPress={() => handleOpenDetails(item)}>
				{/* Poster & Overlays */}
				<View style={styles.posterContainer}>
					<Image
						source={{
							uri:
								item.poster ||
								item.poster_url ||
								item.image ||
								item.backdrop_url,
						}}
						style={styles.posterImage}
						contentFit="cover"
						transition={0}
						recyclingKey={
							item.poster ||
							item.poster_url ||
							item.image ||
							item.backdrop_url
						}
					/>
					{/* Gradient Karartma */}
					<View style={styles.posterGradient} />

					{/* Sol Üst Rozet: Dizi / Film */}
					<View
						style={[
							styles.badgeType,
							isDizi ? styles.badgeDizi : styles.badgeFilm,
						]}>
						<Text style={styles.badgeTypeText}>
							{isDizi ? "DİZİ" : "FİLM"}
						</Text>
					</View>

					{/* Sağ Üst Rozet: IMDb Puanı */}
					{ratingVal && (
						<View style={styles.badgeRating}>
							<Ionicons name="star" size={11} color="#F5C518" />
							<Text style={styles.badgeRatingText}>
								{ratingVal}
							</Text>
						</View>
					)}

					{/* Ortadaki Canlı Kırmızı Play Butonu */}
					<TVPressable
						style={styles.centerPlayButton}
						focusedStyle={styles.centerPlayButtonFocused}
						onPress={() => handlePlayItem(item)}
						disabled={playingItemId === (item.id || item.url)}>
						{playingItemId === (item.id || item.url) ? (
							<ActivityIndicator size="small" color="#ffffff" />
						) : (
							<Ionicons name="play" size={20} color="#ffffff" />
						)}
					</TVPressable>

					{/* Poster Altındaki İlerleme & Süre Bilgisi */}
					<View style={styles.posterBottomInfo}>
						<View style={styles.progressTextRow}>
							<Text style={styles.episodeText} numberOfLines={1}>
								{episodeText}
							</Text>
							{remainingText && (
								<Text style={styles.remainingText}>
									{remainingText}
								</Text>
							)}
						</View>

						{/* İlerleme Çubuğu */}
						<View style={styles.progressBarTrack}>
							<View
								style={[
									styles.progressBarFill,
									{ width: `${progressPercent || 3}%` },
								]}
							/>
						</View>
					</View>
				</View>

				{/* Bilgi Gövdesi */}
				<View style={styles.cardBody}>
					<Text style={styles.cardTitle} numberOfLines={1}>
						{item.title || item.seriesTitle || "Başlıksız"}
					</Text>
					<Text style={styles.cardTagline} numberOfLines={1}>
						{item.tagline ||
							item.genre ||
							item.category ||
							(isDizi ? "Dizi" : "Film")}
					</Text>

					{/* Alt Zaman & Seçenekler Çubuğu */}
					<View style={styles.cardFooter}>
						<View style={styles.timeRow}>
							<Ionicons
								name="time-outline"
								size={12}
								color="#E50914"
							/>
							<Text style={styles.timeText}>
								{formatRelativeTime(
									item.updatedAt || item.watchedAt,
								)}
							</Text>
						</View>
						<TVPressable
							onPress={() => handleItemOptions(item)}
							hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
							style={styles.moreButton}
							focusedStyle={styles.moreButtonFocused}>
							<Ionicons
								name="ellipsis-vertical"
								size={14}
								color="#94a3b8"
							/>
						</TVPressable>
					</View>
				</View>
			</TVPressable>
		);
	};

	// Boş Durum Bileşeni (Mockup'taki Tasarım)
	const renderEmptyState = () => (
		<View style={styles.emptyContainer}>
			{/* Parıldayan Çember Rozet */}
			<View style={styles.emptyGlowWrapper}>
				<View style={styles.emptyGlow} />
				<View style={styles.emptyIconBox}>
					<Ionicons
						name="play-circle-outline"
						size={48}
						color="#E50914"
					/>
				</View>
			</View>

			<Text style={styles.emptyTitle}>Listenizde Henüz İçerik Yok</Text>
			<Text style={styles.emptySubtitle}>
				Daha sonra izlemek istediğiniz veya takip ettiğiniz dizi ve
				filmleri buraya ekleyerek kitaplığınızı oluşturabilirsiniz.
			</Text>

			{/* Keşfet Butonu */}
			<TVPressable
				style={styles.emptyCtaButton}
				focusedStyle={styles.emptyCtaButtonFocused}
				onPress={() => router.push("/(app)")}>
				<Ionicons name="compass-outline" size={18} color="#ffffff" />
				<Text style={styles.emptyCtaText}>İçerikleri Keşfet</Text>
			</TVPressable>
		</View>
	);

	return (
		<>
			<Stack.Screen options={{ headerShown: false }} />
			<SafeAreaView
				style={[styles.safeArea, { paddingLeft: contentPaddingLeft }]}
				edges={["top", "left", "right"]}>
				<StatusBar barStyle="light-content" backgroundColor="#0B0E14" />

				{/* 1. ÜST ARAMA VE EYLEM ÇUBUĞU */}
				<View
					style={[
						styles.topBar,
						contentMaxWidth
							? {
									width: "100%",
									maxWidth: contentMaxWidth,
									alignSelf: "center",
								}
							: null,
					]}>
					{/* Arama Kutusu */}
					<View style={styles.searchContainer}>
						<Ionicons
							name="search"
							size={18}
							color="#94a3b8"
							style={styles.searchIcon}
						/>
						<TextInput
							style={styles.searchInput}
							placeholder="Kitaplığımda ara..."
							placeholderTextColor="#64748b"
							value={searchQuery}
							onChangeText={setSearchQuery}
							returnKeyType="search"
						/>
						{searchQuery.length > 0 && (
							<TouchableOpacity
								onPress={() => setSearchQuery("")}
								hitSlop={{
									top: 6,
									bottom: 6,
									left: 6,
									right: 6,
								}}>
								<Ionicons
									name="close-circle"
									size={16}
									color="#94a3b8"
								/>
							</TouchableOpacity>
						)}
					</View>

					{/* Filtrele / Ayarlar Butonu */}
					<TVPressable
						style={styles.iconButton}
						focusedStyle={styles.iconButtonFocused}
						onPress={() => setIsSortModalVisible(true)}>
						<Ionicons
							name="options-outline"
							size={19}
							color="#cbd5e1"
						/>
					</TVPressable>

					{/* Izgara / Liste Görünüm Butonu */}
					<TVPressable
						style={styles.iconButton}
						focusedStyle={styles.iconButtonFocused}
						onPress={() =>
							setViewMode((prev) =>
								prev === "grid" ? "list" : "grid",
							)
						}>
						<Ionicons
							name={
								viewMode === "grid"
									? "grid-outline"
									: "list-outline"
							}
							size={19}
							color="#cbd5e1"
						/>
					</TVPressable>
				</View>

				{/* 2. YATAY KATEGORİ / DURUM SEKMELERİ */}
				<View style={styles.tabsWrapper}>
					<ScrollView
						horizontal
						showsHorizontalScrollIndicator={false}
						contentContainerStyle={styles.tabsScrollContent}>
						{tabs.map((tab) => {
							const isActive = activeTab === tab.key;
							return (
								<TVPressable
									key={tab.key}
									style={[
										styles.tabPill,
										isActive
											? styles.tabPillActive
											: styles.tabPillInactive,
									]}
									focusedStyle={styles.tabPillFocused}
									onPress={() => setActiveTab(tab.key)}>
									<Ionicons
										name={tab.icon}
										size={15}
										color={
											isActive
												? "#ffffff"
												: tab.iconColor || "#94a3b8"
										}
									/>
									<Text
										style={[
											styles.tabText,
											isActive
												? styles.tabTextActive
												: styles.tabTextInactive,
										]}>
										{tab.label}
									</Text>
									{typeof tab.count === "number" && (
										<View
											style={[
												styles.tabCountPill,
												isActive &&
													styles.tabCountPillActive,
											]}>
											<Text
												style={[
													styles.tabCountText,
													isActive &&
														styles.tabCountTextActive,
												]}>
												{tab.count}
											</Text>
										</View>
									)}
								</TVPressable>
							);
						})}
					</ScrollView>
				</View>

				{/* 3. LİSTE BAŞLIĞI: YAPIM SAYISI & SIRALAMA BUTONU */}
				<View style={styles.subHeader}>
					<View style={styles.subHeaderLeft}>
						<Text style={styles.itemCountText}>
							{displayedItems.length} Yapım
						</Text>
						<View style={styles.dotSeparator} />
						<Text style={styles.subHeaderDate}>
							Son Güncelleme: Bugün
						</Text>
					</View>

					<TVPressable
						style={styles.quickSortButton}
						focusedStyle={styles.quickSortButtonFocused}
						onPress={() => setIsSortModalVisible(true)}>
						<Ionicons
							name="swap-vertical"
							size={13}
							color="#cbd5e1"
						/>
						<Text style={styles.quickSortText}>
							{sortLabels[sortBy] || "Sırala"}
						</Text>
					</TVPressable>
				</View>

				{/* 4. MEDYA LİSTESİ (IZGARA / BOŞ DURUM) */}
				<FlatList
					contentInsetAdjustmentBehavior="automatic"
					data={displayedItems}
					renderItem={renderGridCard}
					keyExtractor={gridKeyExtractor}
					numColumns={columns}
					contentContainerStyle={[
						styles.listContent,
						displayedItems.length === 0 && styles.listContentEmpty,
						contentMaxWidth
							? {
									alignSelf: "center",
									width: "100%",
									maxWidth: contentMaxWidth,
								}
							: null,
					]}
					columnWrapperStyle={
						displayedItems.length > 0
							? styles.columnWrapper
							: undefined
					}
					ListEmptyComponent={renderEmptyState}
					showsVerticalScrollIndicator={false}
					// Sanallaştırma ayarları (ana medya ızgarası).
					// removeClippedSubviews TV'de false KALMALI: odaklı kartın
					// detache olması kumanda odağını kaybettirir.
					initialNumToRender={6}
					maxToRenderPerBatch={4}
					windowSize={5}
					removeClippedSubviews={false}
				/>

				{/* 5. KAYAN SIRALAMA BUTONU (FAB - Yalnızca liste doluyken) */}
				{displayedItems.length > 0 && (
					<View style={styles.floatingFabWrapper}>
						<TouchableOpacity
							style={styles.floatingFab}
							onPress={() => setIsSortModalVisible(true)}
							activeOpacity={0.85}>
							<Ionicons
								name="filter-outline"
								size={17}
								color="#E50914"
							/>
							<Text style={styles.floatingFabText}>Sırala</Text>
						</TouchableOpacity>
					</View>
				)}

				{/* 6. SIRALA VE FİLTRELE BOTTOM SHEET MODAL */}
				<Modal
					visible={isSortModalVisible}
					transparent
					animationType="fade"
					onRequestClose={() => setIsSortModalVisible(false)}>
					<Pressable
						style={styles.modalOverlay}
						onPress={() => setIsSortModalVisible(false)}>
						<Pressable style={styles.modalSheet}>
							{/* Çekme Çubuğu */}
							<View style={styles.modalDragHandle} />

							{/* Modal Başlığı */}
							<View style={styles.modalHeader}>
								<View>
									<View style={styles.modalTitleRow}>
										<Ionicons
											name="options-outline"
											size={20}
											color="#E50914"
										/>
										<Text style={styles.modalTitle}>
											Sırala ve Filtrele
										</Text>
									</View>
									<Text style={styles.modalSubtitle}>
										Kitaplık görünümünü özelleştirin
									</Text>
								</View>

								<View style={styles.modalHeaderActions}>
									<TouchableOpacity
										onPress={() => {
											setSortBy("last_watched");
											setTypeFilter("all");
											setProgressFilter("all");
										}}
										style={styles.resetButton}>
										<Text style={styles.resetButtonText}>
											Sıfırla
										</Text>
									</TouchableOpacity>
									<TouchableOpacity
										style={styles.closeButton}
										onPress={() =>
											setIsSortModalVisible(false)
										}>
										<Ionicons
											name="close"
											size={18}
											color="#94a3b8"
										/>
									</TouchableOpacity>
								</View>
							</View>

							{/* Kaydırılabilir Filtre Seçenekleri */}
							<ScrollView
								style={styles.modalScrollView}
								showsVerticalScrollIndicator={false}>
								{/* BÖLÜM 1: SIRALAMA ÖLÇÜTÜ */}
								<View style={styles.modalSection}>
									<View style={styles.sectionHeaderRow}>
										<Text style={styles.sectionTitle}>
											SIRALAMA ÖLÇÜTÜ
										</Text>
										<Text style={styles.sectionBadge}>
											1 Seçili
										</Text>
									</View>

									<View style={styles.radioList}>
										{[
											{
												key: "last_watched",
												label: "Son İzlenen",
												desc: "En son etkileşimde bulunulanlar üstte",
												isDefault: true,
											},
											{
												key: "date_added",
												label: "Eklenme Tarihi (En Yeni)",
												desc: "Son eklenen yapımlar önce",
											},
											{
												key: "name_asc",
												label: "İsim (A-Z)",
												desc: "Alfabetik sıralama",
											},
											{
												key: "imdb_desc",
												label: "IMDb Puanı (Yüksekten Düşüğe)",
												desc: "Puanı en yüksek yapımlar",
												hasStar: true,
											},
											{
												key: "remaining_time",
												label: "Kalan Süre",
												desc: "Bitmeye en yakın olanlar",
											},
										].map((opt) => {
											const isSelected =
												sortBy === opt.key;
											return (
												<TouchableOpacity
													key={opt.key}
													style={[
														styles.radioOption,
														isSelected &&
															styles.radioOptionActive,
													]}
													onPress={() =>
														setSortBy(opt.key)
													}
													activeOpacity={0.75}>
													<View
														style={
															styles.radioLeft
														}>
														<View
															style={[
																styles.radioCircle,
																isSelected &&
																	styles.radioCircleActive,
															]}>
															{isSelected && (
																<View
																	style={
																		styles.radioDot
																	}
																/>
															)}
														</View>
														<View>
															<View
																style={
																	styles.optionTitleRow
																}>
																<Text
																	style={[
																		styles.optionTitle,
																		isSelected &&
																			styles.optionTitleActive,
																	]}>
																	{opt.label}
																</Text>
																{opt.hasStar && (
																	<Ionicons
																		name="star"
																		size={
																			13
																		}
																		color="#F5C518"
																	/>
																)}
															</View>
															<Text
																style={
																	styles.optionDesc
																}>
																{opt.desc}
															</Text>
														</View>
													</View>

													{opt.isDefault && (
														<View
															style={
																styles.defaultBadge
															}>
															<Text
																style={
																	styles.defaultBadgeText
																}>
																Varsayılan
															</Text>
														</View>
													)}
												</TouchableOpacity>
											);
										})}
									</View>
								</View>

								{/* BÖLÜM 2: TÜR FİLTRESİ */}
								<View style={styles.modalSection}>
									<Text style={styles.sectionTitle}>
										TÜR FİLTRESİ
									</Text>
									<View style={styles.chipsRow}>
										{[
											{ key: "all", label: "Tümü" },
											{ key: "movie", label: "Filmler" },
											{ key: "series", label: "Diziler" },
											{ key: "anime", label: "Anime" },
										].map((chip) => {
											const isChipSelected =
												typeFilter === chip.key;
											return (
												<TouchableOpacity
													key={chip.key}
													style={[
														styles.filterChip,
														isChipSelected &&
															styles.filterChipActive,
													]}
													onPress={() =>
														setTypeFilter(chip.key)
													}
													activeOpacity={0.75}>
													<Text
														style={[
															styles.filterChipText,
															isChipSelected &&
																styles.filterChipTextActive,
														]}>
														{chip.label}
													</Text>
												</TouchableOpacity>
											);
										})}
									</View>
								</View>

								{/* BÖLÜM 3: İLERLEME DURUMU */}
								<View style={styles.modalSection}>
									<Text style={styles.sectionTitle}>
										İLERLEME DURUMU
									</Text>
									<View style={styles.progressRow}>
										<TouchableOpacity
											style={[
												styles.progressButton,
												progressFilter ===
													"in_progress" &&
													styles.progressButtonActive,
											]}
											onPress={() =>
												setProgressFilter((p) =>
													p === "in_progress"
														? "all"
														: "in_progress",
												)
											}
											activeOpacity={0.75}>
											<Ionicons
												name="play"
												size={14}
												color={
													progressFilter ===
													"in_progress"
														? "#E50914"
														: "#94a3b8"
												}
											/>
											<Text
												style={[
													styles.progressButtonText,
													progressFilter ===
														"in_progress" &&
														styles.progressButtonTextActive,
												]}>
												Devam Edenler
											</Text>
										</TouchableOpacity>

										<TouchableOpacity
											style={[
												styles.progressButton,
												progressFilter ===
													"not_started" &&
													styles.progressButtonActive,
											]}
											onPress={() =>
												setProgressFilter((p) =>
													p === "not_started"
														? "all"
														: "not_started",
												)
											}
											activeOpacity={0.75}>
											<Ionicons
												name="hourglass-outline"
												size={14}
												color={
													progressFilter ===
													"not_started"
														? "#E50914"
														: "#94a3b8"
												}
											/>
											<Text
												style={[
													styles.progressButtonText,
													progressFilter ===
														"not_started" &&
														styles.progressButtonTextActive,
												]}>
												Henüz Başlanmayanlar
											</Text>
										</TouchableOpacity>
									</View>
								</View>
							</ScrollView>

							{/* Alt Eylem Butonu */}
							<View style={styles.modalFooter}>
								<TouchableOpacity
									style={styles.applyFilterButton}
									onPress={() => setIsSortModalVisible(false)}
									activeOpacity={0.85}>
									<Ionicons
										name="filter"
										size={18}
										color="#ffffff"
									/>
									<Text style={styles.applyFilterButtonText}>
										Sonuçları Göster (
										{displayedItems.length} Yapım)
									</Text>
								</TouchableOpacity>
							</View>
						</Pressable>
					</Pressable>
				</Modal>

				{/* 8. KART EYLEM SEÇENEKLERİ MODALI (Alert yerine şık alt sayfa) */}
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

				{/* 9. LİSTE SEÇİM / TAŞIMA MODALI */}
				<ListSelectModal
					visible={isListSelectModalVisible}
					movie={listSelectTargetItem}
					onClose={() => setIsListSelectModalVisible(false)}
					onStatusChanged={async () => {
						await loadLibraryData();
					}}
				/>

				{/* 7. ALT GEZİNTİ ÇUBUĞU */}
				<BottomNavigation activeRoute="/(app)/library" />
			</SafeAreaView>
		</>
	);
}

const styles = StyleSheet.create({
	safeArea: {
		flex: 1,
		backgroundColor: "#0B0E14",
	},

	/* 1. Üst Çubuk */
	topBar: {
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: PADDING_HORIZONTAL,
		paddingTop: 8,
		paddingBottom: 10,
		gap: 10,
	},
	searchContainer: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: "#161B24",
		borderWidth: 1,
		borderColor: "rgba(255, 255, 255, 0.08)",
		borderRadius: 24,
		paddingHorizontal: 12,
		height: 40,
	},
	searchIcon: {
		marginRight: 8,
	},
	searchInput: {
		flex: 1,
		fontSize: 13,
		color: "#f1f5f9",
		paddingVertical: 0,
	},
	iconButton: {
		width: 40,
		height: 40,
		borderRadius: 20,
		backgroundColor: "#161B24",
		borderWidth: 1,
		borderColor: "rgba(255, 255, 255, 0.08)",
		justifyContent: "center",
		alignItems: "center",
	},
	iconButtonFocused: {
		borderColor: "#FF3B30",
		borderWidth: 1.5,
		transform: [{ scale: 1.15 }],
	},

	/* 2. Sekmeler (Tabs) */
	tabsWrapper: {
		paddingVertical: 4,
	},
	tabsScrollContent: {
		paddingHorizontal: PADDING_HORIZONTAL,
		gap: 8,
	},
	tabPill: {
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: 14,
		paddingVertical: 8,
		borderRadius: 20,
		gap: 6,
	},
	tabPillActive: {
		backgroundColor: "#E50914",
	},
	tabPillInactive: {
		backgroundColor: "#161B24",
		borderWidth: 1,
		borderColor: "rgba(255, 255, 255, 0.06)",
	},
	tabPillFocused: {
		borderColor: "#FF3B30",
		borderWidth: 1.5,
		transform: [{ scale: 1.08 }],
	},
	tabText: {
		fontSize: 12,
	},
	tabTextActive: {
		color: "#ffffff",
		fontWeight: "700",
	},
	tabTextInactive: {
		color: "#cbd5e1",
		fontWeight: "500",
	},
	tabCountPill: {
		backgroundColor: "rgba(0, 0, 0, 0.3)",
		paddingHorizontal: 6,
		paddingVertical: 1,
		borderRadius: 10,
		marginLeft: 2,
	},
	tabCountPillActive: {
		backgroundColor: "rgba(0, 0, 0, 0.25)",
	},
	tabCountText: {
		fontSize: 10,
		fontWeight: "700",
		color: "#94a3b8",
	},
	tabCountTextActive: {
		color: "#ffffff",
	},

	/* 3. Alt Başlık */
	subHeader: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: PADDING_HORIZONTAL,
		paddingTop: 12,
		paddingBottom: 10,
	},
	subHeaderLeft: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
	},
	itemCountText: {
		fontSize: 12,
		fontWeight: "700",
		color: "#e2e8f0",
	},
	dotSeparator: {
		width: 3,
		height: 3,
		borderRadius: 1.5,
		backgroundColor: "#64748b",
	},
	subHeaderDate: {
		fontSize: 11,
		color: "#64748b",
	},
	quickSortButton: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: "#161B24",
		borderWidth: 1,
		borderColor: "rgba(255, 255, 255, 0.06)",
		paddingHorizontal: 10,
		paddingVertical: 5,
		borderRadius: 8,
		gap: 5,
	},
	quickSortButtonFocused: {
		borderColor: "#FF3B30",
		borderWidth: 1.5,
		transform: [{ scale: 1.08 }],
	},
	quickSortText: {
		fontSize: 11,
		color: "#cbd5e1",
		fontWeight: "600",
	},

	/* 4. Liste & Kartlar */
	listContent: {
		paddingHorizontal: PADDING_HORIZONTAL,
		paddingBottom: 90,
	},
	listContentEmpty: {
		flexGrow: 1,
		justifyContent: "center",
	},
	columnWrapper: {
		// ⚠️ `space-between` DEĞİL: tam dolmayan son satırda kartları iki
		// uca yayıyordu ("yeterli veri yoksa arada boşluk oluşuyor").
		// Kart genişlikleri satırı tam doldurduğu için (cardWidthFor) `gap`
		// ile tam satırlar birebir aynı kalır, eksik satırlar sola paketlenir.
		justifyContent: "flex-start",
		gap: CARD_GAP,
		marginBottom: CARD_GAP,
	},
	card: {
		backgroundColor: "#161B24",
		overflow: "hidden",
		borderWidth: 1,
		borderColor: "rgba(255, 255, 255, 0.07)",
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.3,
		shadowRadius: 8,
		elevation: 6,
	},
	cardFocused: {
		borderColor: "#FF3B30",
		borderWidth: 2,
		transform: [{ scale: 1.05 }],
	},
	centerPlayButtonFocused: {
		borderColor: "#FFFFFF",
		borderWidth: 2,
		transform: [{ scale: 1.2 }],
	},
	moreButtonFocused: {
		backgroundColor: "rgba(255, 59, 48, 0.35)",
		borderRadius: 12,
		transform: [{ scale: 1.2 }],
	},
	emptyCtaButtonFocused: {
		backgroundColor: "#FF3B30",
		transform: [{ scale: 1.06 }],
	},
	posterContainer: {
		width: "100%",
		aspectRatio: 2 / 3,
		backgroundColor: "#0B0E14",
		position: "relative",
	},
	posterImage: {
		width: "100%",
		height: "100%",
	},
	posterGradient: {
		...StyleSheet.absoluteFill,
		backgroundColor: "rgba(0, 0, 0, 0.25)",
	},
	badgeType: {
		position: "absolute",
		top: 8,
		left: 8,
		paddingHorizontal: 6,
		paddingVertical: 2,
		borderRadius: 4,
	},
	badgeDizi: {
		backgroundColor: "#E50914",
	},
	badgeFilm: {
		backgroundColor: "rgba(30, 41, 59, 0.9)",
		borderWidth: 1,
		borderColor: "rgba(255, 255, 255, 0.1)",
	},
	badgeTypeText: {
		color: "#ffffff",
		fontSize: 9,
		fontWeight: "800",
		letterSpacing: 0.5,
	},
	badgeRating: {
		position: "absolute",
		top: 8,
		right: 8,
		flexDirection: "row",
		alignItems: "center",
		gap: 3,
		backgroundColor: "rgba(0, 0, 0, 0.65)",
		paddingHorizontal: 6,
		paddingVertical: 2,
		borderRadius: 6,
		borderWidth: 1,
		borderColor: "rgba(255, 255, 255, 0.1)",
	},
	badgeRatingText: {
		color: "#F5C518",
		fontSize: 10,
		fontWeight: "700",
	},
	centerPlayButton: {
		position: "absolute",
		top: "50%",
		left: "50%",
		width: 38,
		height: 38,
		borderRadius: 19,
		backgroundColor: "rgba(229, 9, 20, 0.9)",
		justifyContent: "center",
		alignItems: "center",
		transform: [{ translateX: -19 }, { translateY: -19 }],
		shadowColor: "#E50914",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.5,
		shadowRadius: 6,
		elevation: 6,
	},
	posterBottomInfo: {
		position: "absolute",
		bottom: 0,
		left: 0,
		right: 0,
		padding: 8,
		backgroundColor: "rgba(11, 14, 20, 0.8)",
	},
	progressTextRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginBottom: 4,
	},
	episodeText: {
		color: "#ffffff",
		fontSize: 10,
		fontWeight: "700",
		flex: 1,
	},
	remainingText: {
		color: "#94a3b8",
		fontSize: 9,
		fontWeight: "500",
	},
	progressBarTrack: {
		height: 3,
		borderRadius: 1.5,
		backgroundColor: "rgba(255, 255, 255, 0.2)",
		overflow: "hidden",
	},
	progressBarFill: {
		height: "100%",
		borderRadius: 1.5,
		backgroundColor: "#E50914",
	},
	cardBody: {
		padding: 10,
	},
	cardTitle: {
		fontSize: 13,
		fontWeight: "700",
		color: "#f8fafc",
		letterSpacing: -0.2,
		marginBottom: 2,
	},
	cardTagline: {
		fontSize: 10,
		color: "#94a3b8",
		marginBottom: 8,
	},
	cardFooter: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingTop: 6,
		borderTopWidth: 1,
		borderTopColor: "rgba(255, 255, 255, 0.06)",
	},
	timeRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
	},
	timeText: {
		fontSize: 10,
		color: "#cbd5e1",
	},
	moreButton: {
		padding: 2,
	},

	/* Boş Durum (Empty State) */
	emptyContainer: {
		alignItems: "center",
		justifyContent: "center",
		paddingVertical: 50,
		paddingHorizontal: 24,
	},
	emptyGlowWrapper: {
		width: 90,
		height: 90,
		justifyContent: "center",
		alignItems: "center",
		marginBottom: 20,
		position: "relative",
	},
	emptyGlow: {
		position: "absolute",
		width: 120,
		height: 120,
		borderRadius: 60,
		backgroundColor: "rgba(229, 9, 20, 0.12)",
	},
	emptyIconBox: {
		width: 76,
		height: 76,
		borderRadius: 24,
		backgroundColor: "#161B24",
		borderWidth: 1,
		borderColor: "rgba(255, 255, 255, 0.1)",
		justifyContent: "center",
		alignItems: "center",
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 6 },
		shadowOpacity: 0.5,
		shadowRadius: 10,
		elevation: 8,
	},
	emptyTitle: {
		fontSize: 17,
		fontWeight: "800",
		color: "#ffffff",
		marginBottom: 8,
		textAlign: "center",
		letterSpacing: -0.3,
	},
	emptySubtitle: {
		fontSize: 12,
		color: "#94a3b8",
		textAlign: "center",
		lineHeight: 18,
		maxWidth: 280,
		marginBottom: 24,
	},
	emptyCtaButton: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: "#E50914",
		paddingHorizontal: 22,
		paddingVertical: 12,
		borderRadius: 24,
		gap: 8,
		shadowColor: "#E50914",
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.35,
		shadowRadius: 8,
		elevation: 6,
	},
	emptyCtaText: {
		color: "#ffffff",
		fontSize: 13,
		fontWeight: "700",
	},

	/* Kayan FAB Sıralama Butonu */
	floatingFabWrapper: {
		position: "absolute",
		bottom: 75,
		right: 16,
		zIndex: 30,
	},
	floatingFab: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: "rgba(30, 37, 50, 0.95)",
		borderWidth: 1,
		borderColor: "rgba(255, 255, 255, 0.1)",
		paddingHorizontal: 16,
		paddingVertical: 10,
		borderRadius: 20,
		gap: 8,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.5,
		shadowRadius: 8,
		elevation: 8,
	},
	floatingFabText: {
		color: "#f8fafc",
		fontSize: 12,
		fontWeight: "700",
		letterSpacing: 0.3,
	},

	/* Sırala & Filtrele Bottom Sheet Modal */
	modalOverlay: {
		flex: 1,
		backgroundColor: "rgba(0, 0, 0, 0.75)",
		justifyContent: "flex-end",
	},
	modalSheet: {
		backgroundColor: "#161B24",
		borderTopLeftRadius: 28,
		borderTopRightRadius: 28,
		borderTopWidth: 1,
		borderTopColor: "rgba(255, 255, 255, 0.1)",
		maxHeight: "86%",
		paddingBottom: 20,
	},
	modalDragHandle: {
		width: 44,
		height: 4,
		borderRadius: 2,
		backgroundColor: "rgba(255, 255, 255, 0.2)",
		alignSelf: "center",
		marginTop: 10,
		marginBottom: 6,
	},
	modalHeader: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: 20,
		paddingVertical: 12,
		borderBottomWidth: 1,
		borderBottomColor: "rgba(255, 255, 255, 0.06)",
	},
	modalTitleRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
	},
	modalTitle: {
		fontSize: 17,
		fontWeight: "800",
		color: "#ffffff",
		letterSpacing: -0.2,
	},
	modalSubtitle: {
		fontSize: 11,
		color: "#94a3b8",
		marginTop: 2,
	},
	modalHeaderActions: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
	},
	resetButton: {
		paddingHorizontal: 8,
		paddingVertical: 4,
	},
	resetButtonText: {
		fontSize: 12,
		fontWeight: "600",
		color: "#94a3b8",
	},
	closeButton: {
		width: 32,
		height: 32,
		borderRadius: 16,
		backgroundColor: "#1E2532",
		borderWidth: 1,
		borderColor: "rgba(255, 255, 255, 0.08)",
		justifyContent: "center",
		alignItems: "center",
	},
	modalScrollView: {
		paddingHorizontal: 20,
		paddingVertical: 14,
	},
	modalSection: {
		marginBottom: 20,
	},
	sectionHeaderRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginBottom: 10,
	},
	sectionTitle: {
		fontSize: 11,
		fontWeight: "800",
		color: "#94a3b8",
		letterSpacing: 0.6,
		marginBottom: 10,
	},
	sectionBadge: {
		fontSize: 10,
		fontWeight: "700",
		color: "#E50914",
	},
	radioList: {
		gap: 8,
	},
	radioOption: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		padding: 12,
		borderRadius: 14,
		backgroundColor: "rgba(30, 37, 50, 0.6)",
		borderWidth: 1,
		borderColor: "rgba(255, 255, 255, 0.05)",
	},
	radioOptionActive: {
		backgroundColor: "rgba(229, 9, 20, 0.08)",
		borderColor: "rgba(229, 9, 20, 0.35)",
	},
	radioLeft: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		flex: 1,
	},
	radioCircle: {
		width: 18,
		height: 18,
		borderRadius: 9,
		borderWidth: 2,
		borderColor: "#64748b",
		justifyContent: "center",
		alignItems: "center",
	},
	radioCircleActive: {
		borderColor: "#E50914",
	},
	radioDot: {
		width: 8,
		height: 8,
		borderRadius: 4,
		backgroundColor: "#E50914",
	},
	optionTitleRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
	},
	optionTitle: {
		fontSize: 13,
		fontWeight: "600",
		color: "#cbd5e1",
	},
	optionTitleActive: {
		color: "#ffffff",
		fontWeight: "700",
	},
	optionDesc: {
		fontSize: 10,
		color: "#64748b",
		marginTop: 2,
	},
	defaultBadge: {
		backgroundColor: "rgba(229, 9, 20, 0.18)",
		borderWidth: 1,
		borderColor: "rgba(229, 9, 20, 0.3)",
		paddingHorizontal: 6,
		paddingVertical: 2,
		borderRadius: 4,
	},
	defaultBadgeText: {
		fontSize: 9,
		fontWeight: "800",
		color: "#E50914",
	},
	chipsRow: {
		flexDirection: "row",
		gap: 8,
	},
	filterChip: {
		flex: 1,
		paddingVertical: 10,
		borderRadius: 12,
		backgroundColor: "#1E2532",
		borderWidth: 1,
		borderColor: "rgba(255, 255, 255, 0.06)",
		alignItems: "center",
	},
	filterChipActive: {
		backgroundColor: "#E50914",
		borderColor: "#E50914",
	},
	filterChipText: {
		fontSize: 11,
		fontWeight: "600",
		color: "#cbd5e1",
	},
	filterChipTextActive: {
		color: "#ffffff",
		fontWeight: "700",
	},
	progressRow: {
		flexDirection: "row",
		gap: 10,
	},
	progressButton: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 6,
		paddingVertical: 11,
		borderRadius: 12,
		backgroundColor: "#1E2532",
		borderWidth: 1,
		borderColor: "rgba(255, 255, 255, 0.06)",
	},
	progressButtonActive: {
		backgroundColor: "rgba(255, 255, 255, 0.08)",
		borderColor: "rgba(229, 9, 20, 0.4)",
	},
	progressButtonText: {
		fontSize: 11,
		fontWeight: "600",
		color: "#94a3b8",
	},
	progressButtonTextActive: {
		color: "#ffffff",
		fontWeight: "700",
	},
	modalFooter: {
		paddingHorizontal: 20,
		paddingTop: 10,
		borderTopWidth: 1,
		borderTopColor: "rgba(255, 255, 255, 0.08)",
	},
	applyFilterButton: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		backgroundColor: "#E50914",
		paddingVertical: 14,
		borderRadius: 16,
		shadowColor: "#E50914",
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.4,
		shadowRadius: 10,
		elevation: 6,
	},
	applyFilterButtonText: {
		color: "#ffffff",
		fontSize: 14,
		fontWeight: "800",
		letterSpacing: 0.3,
	},
});
