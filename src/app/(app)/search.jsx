import Image from "@/components/common/SmartImage";
import BottomSheetModal from "@/components/modal/Bottomsheetmodal";
import { FontFamily, Palette } from "@/constants/theme";
import { useNavLayout } from "@/hooks/useNavLayout";
import {
	fetchPlatforms,
	searchContent,
	searchPluginContent,
} from "@/services/api";
import { normalizePluginValue } from "@/utils/pluginName";
import {
	addToSearchHistory,
	clearSearchHistory,
	getSearchHistory,
	getSelectedPlatform,
	removeFromSearchHistory,
} from "@/utils/storage";
import { useReactiveData } from "@/utils/storageListener";
import { useTvMetrics } from "@/utils/tvMetrics";
import BottomNavigation from "@components/BottomNavigation";
import { SkeletonBlock, SkeletonLine } from "@components/common/Skeleton";
import TVPressable from "@components/common/TVPressable";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import {
	Stack,
	useFocusEffect,
	useLocalSearchParams,
	useRouter,
} from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
			satirlar: devreli.map(
				(k) => k.mesaj || `${k.eklenti} kullanım dışı`,
			),
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

/** Dizi mi? (`media_type` backend'de "Film" / "Dizi" / "Mini Dizi"…) */
const isSeriesItem = (item) =>
	String(item?.media_type || "")
		.toLowerCase()
		.includes("dizi");

/* ── Kapsam hapı: "Bu platform" / "Tüm platformlar" ─────────────── */
function ScopePill({ label, active, onPress }) {
	const { sp } = useTvMetrics();
	return (
		<TVPressable
			onPress={onPress}
			activeOpacity={0.75}
			style={({ focused }) => [
				styles.scopePill,
				{
					height: sp(34),
					borderRadius: sp(17),
					paddingHorizontal: sp(14),
					gap: sp(8),
				},
				active ? styles.scopePillActive : styles.scopePillIdle,
				focused && styles.focusRing,
			]}>
			<View
				style={[
					styles.scopeDot,
					{
						width: sp(6),
						height: sp(6),
						borderRadius: sp(3),
						backgroundColor: active
							? Palette.secondary
							: Palette.outline,
					},
				]}
			/>
			<Text
				numberOfLines={1}
				style={[
					styles.scopeText,
					{
						fontSize: sp(13),
						color: active
							? Palette.secondary
							: Palette.onSurfaceVariant,
					},
				]}>
				{label}
			</Text>
		</TVPressable>
	);
}

/* ── Tür filtresi hapı: Tümü / Filmler / Diziler ────────────────── */
function TypeChip({ label, count, active, onPress }) {
	const { sp } = useTvMetrics();
	return (
		<TVPressable
			onPress={onPress}
			activeOpacity={0.75}
			style={({ focused }) => [
				styles.typeChip,
				{
					height: sp(34),
					borderRadius: sp(17),
					paddingHorizontal: sp(14),
				},
				active ? styles.typeChipActive : styles.typeChipIdle,
				focused && styles.focusRing,
			]}>
			<Text
				numberOfLines={1}
				style={[
					styles.typeChipText,
					{
						fontSize: sp(13),
						color: active
							? Palette.onPrimary
							: Palette.onSurfaceVariant,
					},
				]}>
				{count == null ? label : `${label} (${count})`}
			</Text>
		</TVPressable>
	);
}

/* ── Sonuç satırı: poster + ad + yıl/tür + puan ─────────────────── */
function ResultRow({ item, onPress }) {
	const { sp } = useTvMetrics();
	const posterUri =
		item.poster || item.poster_url || item.image || item.backdrop_url;
	const rating = Number.parseFloat(item.rating);
	const hasRating = Number.isFinite(rating) && rating > 0;
	const meta = [item.year, item.media_type].filter(Boolean).join(" · ");

	return (
		<TVPressable
			onPress={onPress}
			activeOpacity={0.75}
			style={({ focused }) => [
				styles.resultCard,
				{
					borderRadius: sp(12),
					padding: sp(8),
					gap: sp(12),
				},
				focused && styles.focusRing,
			]}>
			{posterUri ? (
				<Image
					source={{ uri: posterUri }}
					style={[
						styles.posterImage,
						{
							width: sp(56),
							height: sp(84),
							borderRadius: sp(8),
						},
					]}
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
							width: sp(56),
							height: sp(84),
							borderRadius: sp(8),
						},
					]}>
					<Ionicons
						name="film-outline"
						size={sp(22)}
						color={Palette.outline}
					/>
				</View>
			)}

			<View style={[styles.cardDetails, { gap: sp(6) }]}>
				<Text
					numberOfLines={2}
					style={[styles.itemTitle, { fontSize: sp(14) }]}>
					{item.title}
				</Text>
				<View style={[styles.metaRow, { gap: sp(10) }]}>
					{meta ? (
						<Text
							numberOfLines={1}
							style={[styles.metaText, { fontSize: sp(12) }]}>
							{meta}
						</Text>
					) : null}
					{hasRating ? (
						<View style={[styles.ratingRow, { gap: sp(3) }]}>
							<Ionicons
								name="star"
								size={sp(12)}
								color={Palette.tertiary}
							/>
							<Text
								style={[
									styles.ratingText,
									{ fontSize: sp(12) },
								]}>
								{rating.toFixed(1)}
							</Text>
						</View>
					) : null}
				</View>
			</View>

			<Ionicons
				name="chevron-forward"
				size={sp(16)}
				color={Palette.outline}
			/>
		</TVPressable>
	);
}

/* ── Filtre panelindeki kaynak satırı ───────────────────────────── */
function PluginFilterRow({ name, checked, onPress, autoFocus }) {
	const { sp } = useTvMetrics();
	return (
		<TVPressable
			onPress={onPress}
			activeOpacity={0.75}
			autoFocus={autoFocus}
			accessibilityLabel={name}
			style={({ focused }) => [
				styles.filterRow,
				{
					height: sp(48),
					borderRadius: sp(12),
					paddingHorizontal: sp(12),
					gap: sp(12),
				},
				checked && styles.filterRowChecked,
				focused && styles.focusRing,
			]}>
			<View
				style={[
					styles.checkbox,
					{
						width: sp(20),
						height: sp(20),
						borderRadius: sp(6),
					},
					checked && styles.checkboxChecked,
				]}>
				{checked ? (
					<Ionicons
						name="checkmark"
						size={sp(14)}
						color={Palette.onPrimary}
					/>
				) : null}
			</View>
			<Text
				numberOfLines={1}
				style={[styles.filterRowText, { fontSize: sp(14) }]}>
				{name}
			</Text>
		</TVPressable>
	);
}

export default function SearchScreen() {
	const router = useRouter();
	// Sol ray (TV / tablet yatay) varken icerik sola kayar.
	const { contentPaddingLeft } = useNavLayout();
	const { sp, isTV, gutter, contentMaxWidth } = useTvMetrics();
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

	/* Yeni tasarım: tür filtresi + kaynak (eklenti) filtresi. */
	const [typeFilter, setTypeFilter] = useState("all");
	const [pluginFilter, setPluginFilter] = useState(null); // null = tümü
	const [isFilterOpen, setIsFilterOpen] = useState(false);
	const [platformNames, setPlatformNames] = useState([]);

	// Filtre paneli kaynak listesi: backend'in eklenti listesi (bir kez).
	useEffect(() => {
		let alive = true;
		fetchPlatforms()
			.then((list) => {
				if (!alive) return;
				const names = (Array.isArray(list) ? list : [])
					.map((p) => p?.name)
					.filter(Boolean);
				setPlatformNames(names);
			})
			.catch(() => {});
		return () => {
			alive = false;
		};
	}, []);

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

	/*
	 * Geçmiş okumaları arasında sıra koruması.
	 *
	 * Aynı anda birden fazla okuma uçabilir (ekran açılışı + senkronizasyon
	 * bildirimi + silme sonrası). Geç dönen bir okuma, daha yeni bir sonucun
	 * üstüne yazarsa SİLİNEN arama ekranda geri gelir; her okumaya sıra
	 * numarası verip yalnızca en sonuncusunu uyguluyoruz.
	 */
	const historyLoadRef = useRef(0);

	// Arama geçmişini diskten yükler. `useCallback`: hem ekran açılışında hem
	// de senkronizasyon geçmişi değiştirdiğinde aynı fonksiyon kullanılır.
	const loadSearchHistory = useCallback(async () => {
		const loadId = ++historyLoadRef.current;
		const history = await getSearchHistory();
		if (loadId !== historyLoadRef.current) return;
		setSearchHistory(history || []);
	}, []);

	// Yazma işlemlerinin döndürdüğü listeyi uygular; uçuştaki eski okumaları
	// geçersiz kılar (kilit altında üretilmiş liste her zaman daha yenidir).
	const applySearchHistory = useCallback((list) => {
		historyLoadRef.current += 1;
		setSearchHistory(Array.isArray(list) ? list : []);
	}, []);

	// Ekran yaşam döngüsü yönetimi:
	// Arama sayfasından çıkıldığında, eğer bir film/dizi detayına gidilmediyse
	// (yani ana sayfa, keşfet veya başka bir sayfaya gidildiyse) arama sıfırlanır.
	useEffect(() => {
		isNavigatingToDetail = false;

		// Kayıtlı arama geçmişini AsyncStorage'dan yükle
		loadSearchHistory();

		return () => {
			// Arama sayfasındaki listelenen içerikler DIŞINDA bir yere gidilirse sıfırla
			if (!isNavigatingToDetail) {
				resetSearchMemoryCache();
			}
		};
	}, [loadSearchHistory]);

	// Başka bir cihazda yapılan arama senkronize olduğunda (sıralamasıyla
	// birlikte) liste yeniden okunur: ekran odaktayken açılıp kapanmasına
	// gerek kalmaz.
	useReactiveData(loadSearchHistory, "user_search_history");

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
		// Yeni sorgu → kaynak filtresi sıfırlanır (eski kaynaklar bu
		// sonuçlarda olmayabilir). Tür filtresi kullanıcının seçimidir, kalır.
		setPluginFilter(null);

		// Arama geçmişine ekle ve listeyi güncelle
		addToSearchHistory(target).then((updated) => {
			if (updated) applySearchHistory(updated);
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
		applySearchHistory(updated);
	};

	// Tüm geçmişi temizle
	const handleClearAllHistory = async () => {
		await clearSearchHistory();
		applySearchHistory([]);
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
				if (
					results.length > 0 ||
					searchQuery.length > 0 ||
					hasSearched
				) {
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

	/* Tür sayıları — filtre hapındaki parantezler. */
	const diziCount = useMemo(
		() => results.filter(isSeriesItem).length,
		[results],
	);
	const filmCount = results.length - diziCount;

	/* Filtre panelindeki kaynak listesi: eklentiler + sonuçlarda geçenler. */
	const availablePlugins = useMemo(() => {
		const names = new Set(platformNames);
		pluginKeys.forEach((name) => names.add(name));
		return Array.from(names);
	}, [platformNames, pluginKeys]);

	/* Görünen gruplar: tür + kaynak filtresi uygulanmış hâli. */
	const visibleGroups = useMemo(() => {
		return pluginKeys
			.filter((name) => !pluginFilter || pluginFilter.has(name))
			.map((name) => ({
				plugin: name,
				items: groupedResults[name].filter((item) =>
					typeFilter === "all"
						? true
						: typeFilter === "dizi"
							? isSeriesItem(item)
							: !isSeriesItem(item),
				),
			}))
			.filter((group) => group.items.length > 0);
	}, [pluginKeys, groupedResults, pluginFilter, typeFilter]);

	const visibleCount = visibleGroups.reduce(
		(acc, group) => acc + group.items.length,
		0,
	);

	/* Filtre paneli: açık kaynak sayısı. */
	const activeFilterCount = pluginFilter
		? pluginFilter.size
		: availablePlugins.length;

	const togglePlugin = (name) => {
		const next = pluginFilter
			? new Set(pluginFilter)
			: new Set(availablePlugins);
		if (next.has(name)) next.delete(name);
		else next.add(name);
		setPluginFilter(next.size === availablePlugins.length ? null : next);
	};

	const resetFilters = () => {
		setPluginFilter(null);
		setTypeFilter("all");
	};

	// Arama listesindeki bir içeriğin detayına yönlendir:
	// Bu geçişte aramanın ve scroll konumunun korunması için bayrak işaretlenir.
	const handleItemPress = (item) => {
		isNavigatingToDetail = true;

		const movieWithPlugin = {
			...item,
			plugin: normalizePluginValue(item.plugin),
		};
		const movieId =
			item.id || encodeURIComponent(item.url || item.slug || item.title);

		router.push({
			pathname: "/(app)/MovieDetails/[id]",
			params: {
				id: movieId,
				movieData: JSON.stringify(movieWithPlugin),
			},
		});
	};

	const showResults = !loading && hasSearched && results.length > 0;

	return (
		<>
			<Stack.Screen options={{ headerShown: false }} />
			<SafeAreaView
				edges={["top", "left", "right", "bottom"]}
				style={[styles.safeArea, { paddingLeft: contentPaddingLeft }]}>
				<StatusBar
					barStyle="light-content"
					backgroundColor={Palette.background}
				/>

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
					contentContainerStyle={styles.scrollContainer}>
					<View
						style={{
							width: "100%",
							maxWidth: contentMaxWidth,
							alignSelf: "center",
							paddingHorizontal: 16 + gutter,
						}}>
						{/* Marka satırı kaldırıldı: wordmark ve profil kısayolu
						    burada tekrarlanmıyor (ana sayfa header'ı + Ayarlar). */}

						{/* Arama alanı */}
						{isTV ? (
							<Text
								style={[
									styles.fieldLabel,
									{ fontSize: sp(11), marginBottom: sp(8) },
								]}>
								Arama Sorgusu
							</Text>
						) : null}

						<View
							style={[
								styles.searchPill,
								{
									height: sp(52),
									borderRadius: sp(26),
									paddingHorizontal: sp(16),
									gap: sp(10),
								},
							]}>
							<Ionicons
								name="search"
								size={sp(20)}
								color={Palette.onSurfaceVariant}
							/>
							<TextInput
								style={[
									styles.searchInput,
									{ fontSize: sp(16) },
								]}
								placeholder={
									searchScope === "plugin" && activePlugin
										? `${activePlugin} içinde ara...`
										: "Film, dizi, oyuncu veya tür ara..."
								}
								placeholderTextColor={Palette.outline}
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
							{loading ? (
								<ActivityIndicator
									size="small"
									color={Palette.primary}
								/>
							) : searchQuery.length > 0 ? (
								<TVPressable
									onPress={clearSearch}
									accessibilityLabel="Aramayı temizle"
									style={({ focused }) => [
										styles.clearButton,
										{
											width: sp(28),
											height: sp(28),
											borderRadius: sp(14),
										},
										focused && styles.focusRing,
									]}>
									<Ionicons
										name="close"
										size={sp(15)}
										color={Palette.onSurfaceVariant}
									/>
								</TVPressable>
							) : null}
						</View>

						{/* Kapsam: bu platform / tüm platformlar */}
						<View
							style={[
								styles.chipRow,
								{ marginTop: sp(12), gap: sp(8) },
							]}>
							{activePlugin ? (
								<ScopePill
									label={`Bu Platform: ${activePlugin}`}
									active={searchScope === "plugin"}
									onPress={() => handleScopeChange("plugin")}
								/>
							) : null}
							<ScopePill
								label="Tüm Platformlar"
								active={searchScope === "all"}
								onPress={() => handleScopeChange("all")}
							/>
						</View>

						{/*
						 * Kaynak Durumu Banner'ı
						 *
						 * Backend `durum` alanını sorun yoksa GÖNDERMEZ, bu yüzden
						 * normal aramalarda bu blok hiç render edilmez ve ekran
						 * yerleşimi değişmez.
						 */}
						{!loading && sourceStatusView ? (
							<View
								style={[
									styles.sourceStatusBanner,
									{
										borderRadius: sp(12),
										padding: sp(12),
										marginTop: sp(12),
										gap: sp(9),
									},
								]}>
								<Ionicons
									name="warning"
									size={sp(16)}
									color={Palette.tertiary}
									style={{ marginTop: sp(1) }}
								/>
								<View style={{ flex: 1, gap: sp(3) }}>
									<Text
										style={[
											styles.sourceStatusTitle,
											{ fontSize: sp(12) },
										]}>
										{sourceStatusView.baslik}
									</Text>
									{sourceStatusView.satirlar.map((s, i) => (
										<Text
											key={i}
											numberOfLines={2}
											style={[
												styles.sourceStatusDetail,
												{ fontSize: sp(11) },
											]}>
											• {s}
										</Text>
									))}
									{sourceStatusView.not ? (
										<Text
											style={[
												styles.sourceStatusNote,
												{ fontSize: sp(10) },
											]}>
											{sourceStatusView.not}
										</Text>
									) : null}
								</View>
							</View>
						) : null}

						{/* Sonuç başlığı + filtre hapı şeridi */}
						{showResults ? (
							<View style={{ marginTop: sp(20) }}>
								<Text
									numberOfLines={2}
									style={[
										styles.resultsTitle,
										{ fontSize: sp(isTV ? 22 : 18) },
									]}>
									{`"${lastSearchedQuery}" için sonuçlar`}
								</Text>
								<View
									style={[
										styles.chipRow,
										{ marginTop: sp(10), gap: sp(8) },
									]}>
									<TypeChip
										label="Tümü"
										count={results.length}
										active={typeFilter === "all"}
										onPress={() => setTypeFilter("all")}
									/>
									<TypeChip
										label="Filmler"
										count={filmCount}
										active={typeFilter === "film"}
										onPress={() => setTypeFilter("film")}
									/>
									<TypeChip
										label="Diziler"
										count={diziCount}
										active={typeFilter === "dizi"}
										onPress={() => setTypeFilter("dizi")}
									/>
									<TVPressable
										onPress={() => setIsFilterOpen(true)}
										activeOpacity={0.75}
										accessibilityLabel="Filtreler"
										style={({ focused }) => [
											styles.typeChip,
											styles.filterButton,
											{
												height: sp(34),
												borderRadius: sp(17),
												paddingHorizontal: sp(14),
												gap: sp(6),
											},
											focused && styles.focusRing,
										]}>
										<Ionicons
											name="options-outline"
											size={sp(14)}
											color={
												pluginFilter
													? Palette.primary
													: Palette.onSurfaceVariant
											}
										/>
										<Text
											style={[
												styles.typeChipText,
												{
													fontSize: sp(13),
													color: pluginFilter
														? Palette.primary
														: Palette.onSurfaceVariant,
												},
											]}>
											{pluginFilter
												? `Filtreler (${activeFilterCount})`
												: "Filtreler"}
										</Text>
									</TVPressable>
								</View>
							</View>
						) : null}

						{/* Yükleniyor Durumu */}
						{loading ? (
							<View
								style={{ marginTop: sp(20), gap: sp(10) }}
								pointerEvents="none">
								<SkeletonLine
									width={sp(180)}
									height={sp(13)}
									color={Palette.surfaceHigh}
									style={{ marginBottom: sp(4) }}
								/>
								{Array.from({ length: 5 }).map((_, index) => (
									<View
										key={`sk-sonuc-${index}`}
										style={[
											styles.resultCard,
											{
												borderRadius: sp(12),
												padding: sp(8),
												gap: sp(12),
											},
										]}>
										<SkeletonBlock
											width={sp(56)}
											height={sp(84)}
											radius={sp(8)}
											color={Palette.surfaceHigh}
										/>
										<View
											style={{
												flex: 1,
												justifyContent: "center",
												gap: sp(8),
											}}>
											<SkeletonLine
												width="82%"
												height={sp(14)}
												color={Palette.surfaceHigh}
											/>
											<SkeletonLine
												width="45%"
												height={sp(11)}
												color={Palette.surfaceHigh}
											/>
										</View>
									</View>
								))}
							</View>
						) : null}

						{/* Son Aramalar (arama yapılmamışken) */}
						{!loading &&
						(!hasSearched || searchQuery.trim().length === 0) &&
						searchHistory.length > 0 ? (
							<View style={{ marginTop: sp(24) }}>
								<View
									style={[
										styles.historyHeader,
										{ marginBottom: sp(12), gap: sp(6) },
									]}>
									<Ionicons
										name="time-outline"
										size={sp(15)}
										color={Palette.onSurfaceVariant}
									/>
									<Text
										style={[
											styles.historyTitle,
											{ fontSize: sp(12) },
										]}>
										Son Aramalar
									</Text>
									<View style={{ flex: 1 }} />
									<TVPressable
										onPress={handleClearAllHistory}
										accessibilityLabel="Aramaları temizle"
										style={({ focused }) => [
											styles.textButton,
											{
												paddingHorizontal: sp(6),
												paddingVertical: sp(4),
												borderRadius: sp(8),
											},
											focused && styles.focusRing,
										]}>
										<Text
											style={[
												styles.clearHistoryText,
												{ fontSize: sp(13) },
											]}>
											Temizle
										</Text>
									</TVPressable>
								</View>

								<View style={[styles.chipRow, { gap: sp(8) }]}>
									{searchHistory.map((item, index) => (
										<TVPressable
											key={`${item.q}-${index}`}
											activeOpacity={0.75}
											onPress={() => handleSearch(item.q)}
											style={({ focused }) => [
												styles.historyChip,
												{
													height: sp(34),
													borderRadius: sp(17),
													paddingHorizontal: sp(12),
													gap: sp(6),
												},
												focused && styles.focusRing,
											]}>
											<Ionicons
												name="search-outline"
												size={sp(13)}
												color={Palette.onSurfaceVariant}
											/>
											<Text
												numberOfLines={1}
												style={[
													styles.historyChipText,
													{ fontSize: sp(13) },
												]}>
												{item.q}
											</Text>
											<TVPressable
												onPress={() =>
													handleDeleteHistoryItem(
														item.q,
													)
												}
												accessibilityLabel={`${item.q} aramasını sil`}
												hitSlop={{
													top: 10,
													bottom: 10,
													left: 10,
													right: 10,
												}}
												style={({ focused }) => [
													{
														width: sp(18),
														height: sp(18),
														alignItems: "center",
														justifyContent:
															"center",
														borderRadius: sp(9),
													},
													focused && styles.focusRing,
												]}>
												<Ionicons
													name="close"
													size={sp(13)}
													color={Palette.outline}
												/>
											</TVPressable>
										</TVPressable>
									))}
								</View>
							</View>
						) : null}

						{/* Sonuç Bulunamadı Durumu */}
						{!loading &&
						hasSearched &&
						results.length === 0 &&
						searchQuery.trim().length > 0 ? (
							<View
								style={[
									styles.emptyState,
									{
										paddingVertical: sp(60),
										gap: sp(12),
									},
								]}>
								<Ionicons
									name="alert-circle-outline"
									size={sp(48)}
									color={Palette.outline}
								/>
								<Text
									style={[
										styles.stateTitle,
										{ fontSize: sp(17) },
									]}>
									Sonuç Bulunamadı
								</Text>
								<Text
									style={[
										styles.stateSubText,
										{ fontSize: sp(14) },
									]}>
									{"“"}
									{lastSearchedQuery}
									{"”"} için hiçbir kaynakta içerik bulunamadı.
								</Text>
							</View>
						) : null}

						{/* Filtre sonrası boş liste */}
						{showResults && visibleCount === 0 ? (
							<View
								style={[
									styles.emptyState,
									{
										paddingVertical: sp(48),
										gap: sp(12),
									},
								]}>
								<Ionicons
									name="filter-outline"
									size={sp(44)}
									color={Palette.outline}
								/>
								<Text
									style={[
										styles.stateTitle,
										{ fontSize: sp(16) },
									]}>
									Filtreye uyan sonuç yok
								</Text>
								<TVPressable
									onPress={resetFilters}
									activeOpacity={0.75}
									style={({ focused }) => [
										styles.typeChip,
										styles.typeChipIdle,
										{
											height: sp(34),
											borderRadius: sp(17),
											paddingHorizontal: sp(14),
											marginTop: sp(4),
										},
										focused && styles.focusRing,
									]}>
									<Text
										style={[
											styles.typeChipText,
											{
												fontSize: sp(13),
												color: Palette.primary,
											},
										]}>
										Filtreleri sıfırla
									</Text>
								</TVPressable>
							</View>
						) : null}

						{/* Gruplandırılmış Sonuçlar */}
						{showResults && visibleCount > 0 ? (
							<View style={{ marginTop: sp(18) }}>
								{visibleGroups.map((group) => (
									<View
										key={group.plugin}
										style={{ marginBottom: sp(22) }}>
										{/* Kaynak başlığı */}
										<View
											style={[
												styles.pluginHeader,
												{
													marginBottom: sp(10),
													gap: sp(8),
												},
											]}>
											<Text
												numberOfLines={1}
												style={[
													styles.pluginTitle,
													{ fontSize: sp(12) },
												]}>
												{group.plugin}
											</Text>
											<View
												style={[
													styles.countBadge,
													{
														borderRadius: sp(8),
														paddingHorizontal:
															sp(8),
														paddingVertical: sp(2),
													},
												]}>
												<Text
													style={[
														styles.countBadgeText,
														{ fontSize: sp(11) },
													]}>
													{group.items.length}
												</Text>
											</View>
										</View>

										<View style={{ gap: sp(10) }}>
											{group.items.map((item, index) => (
												<ResultRow
													key={
														item.url ||
														`${group.plugin}-${index}`
													}
													item={item}
													onPress={() =>
														handleItemPress(item)
													}
												/>
											))}
										</View>
									</View>
								))}
							</View>
						) : null}
					</View>
				</ScrollView>

				<BottomNavigation activeRoute="/(app)/search" />

				{/* Kaynak (eklenti) filtresi — tüm cihazlarda modal */}
				<BottomSheetModal
					visible={isFilterOpen}
					onClose={() => setIsFilterOpen(false)}
					snapToHeight={0.72}
					fitContent={false}
					title="Filtreler"
					opacity={0.7}
					handle={true}
					closeOnBackdrop={true}
					swipeable={true}>
					<Text
						style={[
							styles.filterSummary,
							{ fontSize: sp(12), marginBottom: sp(12) },
						]}>
						{`${activeFilterCount} / ${availablePlugins.length} kaynak açık`}
					</Text>

					<ScrollView
						showsVerticalScrollIndicator={false}
						contentContainerStyle={{
							gap: sp(8),
							paddingBottom: sp(12),
						}}>
						{availablePlugins.map((name, index) => (
							<PluginFilterRow
								key={name}
								name={name}
								autoFocus={index === 0}
								checked={
									pluginFilter ? pluginFilter.has(name) : true
								}
								onPress={() => togglePlugin(name)}
							/>
						))}
					</ScrollView>

					<TVPressable
						onPress={resetFilters}
						activeOpacity={0.75}
						accessibilityLabel="Filtreleri sıfırla"
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
							Tüm Filtreleri Temizle
						</Text>
					</TVPressable>
				</BottomSheetModal>
			</SafeAreaView>
		</>
	);
}

const styles = StyleSheet.create({
	safeArea: {
		flex: 1,
		backgroundColor: Palette.background,
	},
	scrollContainer: {
		paddingTop: 12,
		paddingBottom: 96,
	},
	/* ── Arama alanı ── */
	fieldLabel: {
		color: Palette.onSurfaceVariant,
		fontFamily: FontFamily.bold,
		letterSpacing: 1.2,
		textTransform: "uppercase",
	},
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
	/* ── Hap şeritleri ── */
	chipRow: {
		flexDirection: "row",
		alignItems: "center",
		flexWrap: "wrap",
	},
	scopePill: {
		flexDirection: "row",
		alignItems: "center",
		maxWidth: "100%",
	},
	scopePillIdle: {
		backgroundColor: Palette.surfaceLow,
	},
	scopePillActive: {
		backgroundColor: "rgba(76, 215, 246, 0.12)",
	},
	scopeDot: {},
	scopeText: {
		fontFamily: FontFamily.semiBold,
		flexShrink: 1,
	},
	typeChip: {
		alignItems: "center",
		justifyContent: "center",
	},
	typeChipIdle: {
		backgroundColor: Palette.surfaceLow,
	},
	typeChipActive: {
		backgroundColor: Palette.primary,
	},
	typeChipText: {
		fontFamily: FontFamily.semiBold,
	},
	filterButton: {
		flexDirection: "row",
		backgroundColor: Palette.surfaceLow,
	},
	/* ── Kaynak durumu banner'ı ── */
	sourceStatusBanner: {
		flexDirection: "row",
		alignItems: "flex-start",
		backgroundColor: "rgba(251, 188, 46, 0.10)",
		borderWidth: 1,
		borderColor: "rgba(251, 188, 46, 0.30)",
	},
	sourceStatusTitle: {
		color: Palette.tertiary,
		fontFamily: FontFamily.bold,
	},
	sourceStatusDetail: {
		color: Palette.onSurfaceVariant,
		fontFamily: FontFamily.regular,
	},
	sourceStatusNote: {
		color: Palette.outline,
		fontFamily: FontFamily.regular,
		fontStyle: "italic",
	},
	/* ── Sonuç başlığı ── */
	resultsTitle: {
		color: Palette.onSurface,
		fontFamily: FontFamily.bold,
	},
	/* ── Son Aramalar ── */
	historyHeader: {
		flexDirection: "row",
		alignItems: "center",
	},
	historyTitle: {
		color: Palette.onSurfaceVariant,
		fontFamily: FontFamily.bold,
		letterSpacing: 1.2,
		textTransform: "uppercase",
	},
	textButton: {},
	clearHistoryText: {
		color: Palette.secondary,
		fontFamily: FontFamily.semiBold,
	},
	historyChip: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: Palette.surfaceLow,
		maxWidth: "100%",
	},
	historyChipText: {
		color: Palette.onSurface,
		fontFamily: FontFamily.medium,
		flexShrink: 1,
	},
	/* ── Sonuç satırı ── */
	resultCard: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: Palette.surfaceLow,
	},
	posterImage: {
		overflow: "hidden",
	},
	posterPlaceholder: {
		backgroundColor: Palette.surfaceHigh,
		alignItems: "center",
		justifyContent: "center",
	},
	cardDetails: {
		flex: 1,
		justifyContent: "center",
	},
	itemTitle: {
		color: Palette.onSurface,
		fontFamily: FontFamily.semiBold,
	},
	metaRow: {
		flexDirection: "row",
		alignItems: "center",
		flexWrap: "wrap",
	},
	metaText: {
		color: Palette.onSurfaceVariant,
		fontFamily: FontFamily.medium,
	},
	ratingRow: {
		flexDirection: "row",
		alignItems: "center",
	},
	ratingText: {
		color: Palette.tertiary,
		fontFamily: FontFamily.bold,
	},
	/* ── Kaynak grubu ── */
	pluginHeader: {
		flexDirection: "row",
		alignItems: "center",
	},
	pluginTitle: {
		color: Palette.onSurfaceVariant,
		fontFamily: FontFamily.bold,
		letterSpacing: 1.2,
		textTransform: "uppercase",
		flexShrink: 1,
	},
	countBadge: {
		backgroundColor: "rgba(192, 193, 255, 0.14)",
	},
	countBadgeText: {
		color: Palette.primary,
		fontFamily: FontFamily.semiBold,
	},
	/* ── Boş durumlar ── */
	emptyState: {
		alignItems: "center",
		justifyContent: "center",
	},
	stateTitle: {
		color: Palette.onSurface,
		fontFamily: FontFamily.bold,
		textAlign: "center",
	},
	stateSubText: {
		color: Palette.onSurfaceVariant,
		fontFamily: FontFamily.regular,
		textAlign: "center",
		lineHeight: 20,
	},
	/* ── Filtre paneli ── */
	filterSummary: {
		color: Palette.onSurfaceVariant,
		fontFamily: FontFamily.medium,
	},
	filterRow: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: Palette.surfaceLow,
	},
	filterRowChecked: {
		backgroundColor: Palette.surface,
	},
	filterRowText: {
		color: Palette.onSurface,
		fontFamily: FontFamily.medium,
		flex: 1,
	},
	checkbox: {
		borderWidth: 1.5,
		borderColor: Palette.outline,
		alignItems: "center",
		justifyContent: "center",
	},
	checkboxChecked: {
		backgroundColor: Palette.primary,
		borderColor: Palette.primary,
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
	/* ── Odak: yalnızca halka ── */
	focusRing: {
		borderColor: Palette.primary,
		borderWidth: 2,
	},
});
