/**
 * Kategori Ekranı — bir eklenti kategorisinin TÜM içeriği
 *
 * Ana sayfada her kategori yatay bir satır olarak ilk 20 içeriği gösterir;
 * satır başındaki ok (`onSeeAll`) bu ekranı açar. Burada kategori
 * sayfa sayfa (sonsuz kaydırma) listelenir.
 *
 * Tasarım: `C:\Users\Burak\Desktop\kategori-screen` referansı; renkler ve
 * ölçüler uygulamanın Material 3 paletinden (`useThemeContext().m3`) gelir.
 * Referansla aynı: telefon 3 sütun, tablet/TV 4 sütun.
 *
 * ⚠️ TOPLAM SAYI GÖSTERİLMEZ. Referans "1.420 Yapım" rozeti gösteriyor ama
 * backend yanıtı yalnızca `{plugin, page, category, results}` — toplam sayı
 * vermiyor, plugin'ler de kategori toplamını bilmiyor. Sayı uydurmak yerine
 * YÜKLENEN içerik sayısı gösterilir ve kaydırma sürerken büyür.
 *
 * Sayfalama: backend `page` parametresini destekliyor, sayfa başına 20
 * içerik dönüyor (bkz. api/routes/plugins.py:601).
 */

import BottomNavigation from "@/components/BottomNavigation";
import TVPressable from "@/components/common/TVPressable";
import CategoryCard, {
	gridCardStride,
} from "@/components/content/CategoryCard";
import CategoryCardSkeleton from "@/components/content/CategoryCardSkeleton";
import QuickPreviewModal from "@/components/modal/QuickPreviewModal";
import { useThemeContext } from "@/context/ThemeContext";
import { useNavLayout } from "@/hooks/useNavLayout";
import { useFocusCentering } from "@/hooks/useFocusCentering";
import { useScrollMemory } from "@/hooks/useScrollMemory";
import { fetchPlatformMainPage, getCachedCategoryMovies } from "@/services/api";
import { contentIdentity, contentKey } from "@/utils/contentMeta";
import { canonicalType } from "@/utils/mediaType";
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
	FlatList,
	Platform,
	StatusBar,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/**
 * ⚠️ SABİT SAYFA BOYUTU YOKTUR.
 *
 * Ölçülen değerler (canlı API, 2026-10): hdfilmcehennemi 20/28,
 * fullhdfilmizlesene 18, dizibox 15 (kategoriye göre değişiyor). Bu yüzden
 * "şu sayfadan az döndü, bitti" tahmini kullanılamaz; liste bitişi yalnızca
 * "sayfa hiç yeni içerik getirmedi" ile belirlenir.
 */

const GAP = 10;
const GUTTER = 14;
/** Liste içeriğinin üst boşluğu — `getItemLayout` ile Aynı değer. */
const LIST_PAD_TOP = GAP + 2;
/** Kategori adı çok uzunsa tek satırda kısalır. */
const MAX_TITLE_CHARS = 22;

/** Kategori adını kısaltır: "Yeni Eklenen Diziler" → "Yeni Eklenen Di…" */
function shortenTitle(name) {
	if (!name) return "Kategori";
	if (name.length <= MAX_TITLE_CHARS) return name;
	return `${name.slice(0, MAX_TITLE_CHARS - 1).trimEnd()}…`;
}

// ════════════════════════════════════════════════════════════════
// Ekran
// ════════════════════════════════════════════════════════════════

export default function CategoryScreen() {
	const { m3, theme } = useThemeContext();
	const router = useRouter();
	// Sol ray (TV / tablet yatay) varken içerik sola kayar — ana sayfa,
	// arama ve ayarlarla aynı karar (bkz. hooks/useNavLayout.js).
	const { contentPaddingLeft } = useNavLayout();
	const { platform, url, name } = useLocalSearchParams();

	const platformName = typeof platform === "string" ? platform : "";
	const categoryURL = typeof url === "string" ? url : "";
	const categoryName = typeof name === "string" ? name : "";
	/** Hedeften parametre geldi mi? Yanıtsız ekranda sonsuz yükleme göstermemek için. */
	const hasTarget = Boolean(platformName && categoryURL);

	/**
	 * 1. sayfa önbelleği — ana sayfada bu kategori zaten yüklendiği için çoğu
	 * zaman hazırdır. `useMemo` saf bir okuma; ilk karede boş ekran görünmesini
	 * de engeller.
	 */
	const cachedFirstPage = useMemo(
		() =>
			hasTarget
				? getCachedCategoryMovies(platformName, categoryURL, 1)
				: null,
		[hasTarget, platformName, categoryURL],
	);

	const [items, setItems] = useState(cachedFirstPage ?? []);
	const [page, setPage] = useState(cachedFirstPage?.length ? 1 : 0);
	// Önbellek varsa bekleme ekranı göstermeye gerek yok.
	const [loading, setLoading] = useState(
		hasTarget && !cachedFirstPage?.length,
	);
	const [loadingMore, setLoadingMore] = useState(false);
	const [exhausted, setExhausted] = useState(false);
	const [error, setError] = useState(null);

	/** Eşzamanlı iki sayfa isteğini engeller (uçak modu / 5xx). */
	const inFlight = useRef(false);

	// Ekran genişliği: telefon 3, tablet/TV 4 sütun (referansla aynı).
	const [layout, setLayout] = useState({ width: 0, columns: 3 });
	const onLayout = useCallback((e) => {
		const w = e.nativeEvent.layout.width;
		setLayout((prev) => {
			const columns = w >= 720 ? 4 : 3;
			if (prev.width === w && prev.columns === columns) return prev;
			return { width: w, columns };
		});
	}, []);

	const cardWidth =
		layout.width > 0
			? (layout.width - GUTTER * 2 - GAP * (layout.columns - 1)) /
				layout.columns
			: 0;

	/*
	 * SORUN 2 — "Kategori sayfasında yeni sayfalar yüklendikçe ekran
	 * atlıyor / seçili içerik değişiyor".
	 *
	 * `FlatList` sabit adımlı `getItemLayout` kullanır (TV'de satır
	 * başına ölçüm yapmak kaydırmayı belirgin yavaşlatıyor). Bu yalnızca
	 * tüm kartlar AYNI yükseklikteyse doğrudur. Kart artık yıl satırını
	 * veri yoksa bile çizdiği için (`CategoryCard`) yükseklik sabit ve
	 * adım `gridCardStride` ile BİREBİR ölçümle aynı.
	 *
	 * Önceden adım kartın kendi yılına göre hesaplanıyordu; yılı olmayan
	 * bir kart satırı 12px kısa oluyor, ofsetler kayan `getItemLayout`
	 * her yeni sayfada kaydırma konumunu saptırıyordu.
	 */
	const cardStride = useMemo(
		() => (cardWidth > 0 ? gridCardStride(cardWidth, GAP) : 0),
		[cardWidth],
	);

	/*
	 * SORUN 5 — "İçeriklere odak olunmalı ve içerik ekrana
	 * ortalanmalı". Android TV odaklandığında öğeyi yalnızca EKRANA
	 * GETİRİR (en az kaydırma) — kart ekranın kenarına yapışır ve
	 * başlığı yarım görünür. `scrollToIndex({viewPosition: 0.5})`
	 * öğeyi ekranın dikey ortasına sabitler.
	 */
	/*
	 * SORUN 4 (GENEL) — geri dönüşte kaydırma konumu korunur.
	 *
	 * Anahtar kategoriye ÖZGÜ: aynı uygulamada birden çok kategori
	 * ekranı açılabiliyor; hepsi "category" adıyla saklanırsa son
	 * girilen kategorinin konumu diğerine bulaşırdı.
	 */
	const scrollKey = `category:${platformName}|${categoryURL}`;
	const rememberScroll = useScrollMemory(scrollKey);

	/*
	 * SORUN 5 — odaklanan kartın satırı ekranın dikey ortasına taşınır.
	 *
	 * Davranış artık ortak kancada (`useFocusCentering`); bu ekran yalnızca
	 * sütun sayısını verir. Aynı mantık `live.jsx`,
	 * `MovieCategorySection.jsx` ve `ContinueWatchingSection.jsx` içinde
	 * ayrı ayrı kopyalanmıştı; kanca tek doğruluk kaynağı oldu.
	 */
	const {
		listRef,
		handleItemFocus: handleCardFocus,
		onScrollToIndexFailed,
		clearRetry,
	} = useFocusCentering({ columns: layout.columns });

	useEffect(() => clearRetry, [clearRetry]);

	const handleBack = useCallback(() => {
		if (router.canGoBack()) router.back();
		else router.replace("/(app)");
	}, [router]);

	// Android donanım geri tuşu — ODAĞA bağlıdır: Stack altında duran
	// ekranların kaydı blur'da silinir; geri tuşu asla yutulmaz.
	useFocusEffect(
		useCallback(() => {
			if (Platform.OS !== "android") return;
			const sub = BackHandler.addEventListener("hardwareBackPress", () => {
				handleBack();
				return true;
			});
			return () => sub.remove();
		}, [handleBack]),
	);

	// ── 1) AĞ: state'e dokunmaz, sadece veri getirir ────────────────
	//
	// Ağ ile state uygulaması AYRILMIŞTIR. Böylece:
	//   • effect gövdesinde senkron setState olmaz (cascading render),
	//   • aynı kod hem ilk yükleme hem kaydırma hem yeniden deneme için
	//     kullanılabilir,
	//   • çağıran taraf `cancelled` bayrağıyla yarış iptalini yönetir.
	const fetchCategoryPage = useCallback(
		async (targetPage) => {
			if (!platformName || !categoryURL) {
				return { data: [], error: null };
			}
			if (inFlight.current) {
				return { data: null, error: null };
			}

			inFlight.current = true;
			let data = null;
			let fetchError = null;
			try {
				data = await fetchPlatformMainPage(
					platformName,
					categoryURL,
					false,
					targetPage,
				);
			} catch (err) {
				fetchError = err;
			} finally {
				inFlight.current = false;
			}

			return { data, error: fetchError };
		},
		[platformName, categoryURL],
	);

	// ── 2) STATE: ağ sonucunu ekrana uygular ─────────────────────────
	const applyPage = useCallback(
		({ data, error: fetchError }, targetPage, append) => {
			setLoading(false);
			setLoadingMore(false);

			if (fetchError) {
				console.warn(
					"Kategori sayfası yüklenemedi:",
					fetchError?.message,
				);
				setError(fetchError?.message || "Bilinmeyen hata");
				return;
			}

			// `data === null` → istek `inFlight` nedeniyle başlamadı, sessiz geç.
			if (data === null) return;

			setPage(targetPage);
			setError(null);

			// Boş sonuç = bu kategoride başka içerik yok. SONSUZ KAYDIRMA BU
			// ŞEKİLDE BİTER; aksi hâlde liste hiç durmadan isterdi.
			if (data.length === 0) {
				setExhausted(true);
				if (!append) setItems([]);
				return;
			}

			setItems((prev) => {
				if (!append) return data;

				// ⚠️ YENİ İÇERİK SAYILMASI — liste bitişinin tek güvenilir yolu.
				//
				// Eskiden "sayfa 20'den az döndüyse bu son sayfaydı" kuralı
				// kullanılıyordu. Bu YANLIŞTIR: sayfa boyutu eklentiden eklentiye
				// değişiyor ve ölçüldü:
				//
				//     hdfilmcehennemi → 20    fullhdfilmizlesene → 18
				//     dizibox        → 15    (kategoriye göre 28)
				//
				// 18 < 20 olduğu için `fullhdfilmizlesene` ilk sayfadan sonra
				// "bitti" sanıyordu; oysa backend 3. sayfayı da sorunsuz
				// döndürüyor (canlıda doğrulandı).
				//
				// Doğru kural: bir sayfa **hiç yeni içerik getirmediyse** dur.
				// Bu, eklenti sayfayı ilerletmiyorsa da (bazı kategoriler hep
				// aynı sayfayı döndürüyor) sonsuz döngüyü kendiliğinden keser.
				/*
				 * ⚠️ Tekilleştirme anahtarı `contentIdentity` ile
				 * yapılıyor — React anahtarından (`contentKey`) ayrıdır.
				 * Çünkü buradaki sorun "aynı içerik iki kez geldi", React
				 * anahtarı ise "aynı içerik listede iki konumda".
				 *
				 * Önceden burada `url || id || title`, anahtar üretirken
				 * `id || url || slug || title` sırası kullanılıyordu; iki
				 * farklı öncelik, aynı içerik için iki farklı kimlik
				 * üretebiliyordu.
				 *
				 * Kimlik alanı hiç olmayan içeriklerde indeks devreye
				 * girer; liste yalnızca SONDAN büyüdüğü için indeksler
				 * kararlıdır.
				 */
				const seen = new Set(
					prev.map((i, idx) => contentIdentity(i) ?? `#${idx}`),
				);
				const extra = [];
				for (let k = 0; k < data.length; k++) {
					const item = data[k];
					const key = contentIdentity(item) ?? `#${prev.length + k}`;
					if (seen.has(key)) continue;
					seen.add(key);
					extra.push(item);
				}

				if (extra.length === 0) {
					// Bu sayfa tamamen mevcut — eklenti ilerlemiyor.
					setExhausted(true);
					return prev;
				}
				return [...prev, ...extra];
			});

			// ⚠️ "Sayfa 20'den az döndüyse son sayfaydı" kuralı KALDIRILDI —
			// sayfa boyutu eklentiden eklentiye değişiyor (18/15/20/28 ölçüldü),
			// bu tahmin erken bitiriyordu. Bkz. yukarıdaki açıklama ve
			// `newItems` sayımı.
		},
		[],
	);

	// ── İlk yükleme ──────────────────────────────────────────────────
	//
	// `cancelled` bayrağı: kullanıcı ekrandan çıkarken istek uçuyor olabilir;
	// dönen yanıt unmount olmuş bir bileşene setState uygulamamalı.
	//
	// Bu desen `AuthContext.checkSession` ile aynı (bkz. oradaki
	// `isMounted`). Derleyici `useEffect` gövdesindeki doğrudan setState'i
	// reddettiği için veri çekme iç içe async fonksiyona alınmıştır.
	useEffect(() => {
		if (!hasTarget) return;
		let cancelled = false;

		async function ilkYukle() {
			const sonuc = await fetchCategoryPage(1);
			if (cancelled) return;
			applyPage(sonuc, 1, false);
		}

		ilkYukle();

		return () => {
			cancelled = true;
		};
	}, [hasTarget, fetchCategoryPage, applyPage]);

	// ── Kaydırma (olay tetikleyicisi) ────────────────────────────────
	const loadMore = useCallback(() => {
		if (inFlight.current || exhausted) return;

		async function sonrakiSayfa() {
			setLoadingMore(true);
			const sonuc = await fetchCategoryPage(page + 1);
			applyPage(sonuc, page + 1, true);
		}

		sonrakiSayfa();
	}, [exhausted, page, fetchCategoryPage, applyPage]);

	const handleRetry = useCallback(() => {
		if (inFlight.current) return;

		async function tekrarDene() {
			setLoading(true);
			setError(null);
			const sonuc = await fetchCategoryPage(page + 1 || 1);
			applyPage(sonuc, page + 1 || 1, false);
		}

		tekrarDene();
	}, [page, fetchCategoryPage, applyPage]);

	const handleItemPress = useCallback(
		(item) => {
			if (!item) return;

			const withPlugin = { ...item, plugin: item.plugin || platformName };

			// Kategori kartının `type`ı boş olabilir; kanonik türü dolduruyoruz
			// ki detay ekranı tahmin yürütmek zorunda kalmasın.
			// (bkz. utils/mediaType.js — bu ekrandan önce ana sayfa ve
			// MovieDetails'ın tahmin yürütmesi bu yüzden kalkmıştı.)
			const type = canonicalType(withPlugin);
			withPlugin.type = type;
			if (type === "series") {
				withPlugin.content_type = "series";
				withPlugin.is_series = true;
			}

			// "Dizi 2. Sezon 3. Bölüm" gibi başlıklardan sezon/bölüm çıkar
			const epMatch = (item.title || "").match(
				/^(.+?)\s+(\d+)\.\s*Sezon\s+(\d+)\.\s*Bölüm/i,
			);
			if (epMatch) {
				withPlugin.seriesTitle = epMatch[1].trim();
				withPlugin.initialSeason = String(epMatch[2]);
				withPlugin.initialEpisode = String(epMatch[3]);
			}

			const id =
				item.id ||
				encodeURIComponent(
					item.url || item.slug || item.title || "content",
				);

			router.push({
				pathname: "/(app)/MovieDetails/[id]",
				params: {
					id: String(id),
					movieData: JSON.stringify(withPlugin),
				},
			});
		},
		[router, platformName],
	);

	// ── Uzun basma → hızlı önizleme (ana sayfayla aynı) ────────────
	const [previewItem, setPreviewItem] = useState(null);

	const handleLongPress = useCallback(
		(item) => {
			if (!item) return;
			setPreviewItem({
				...item,
				// Modal, oynatırken/yorum eklerken eklentiye ihtiyaç duyuyor.
				plugin: item.plugin || platformName,
				type: canonicalType(item),
			});
		},
		[platformName],
	);

	const renderItem = useCallback(
		({ item, index }) => (
			<CategoryCard
				item={item}
				variant="grid"
				width={cardWidth}
				onPress={() => handleItemPress(item)}
				// ⚠️ Ana sayfadaki kartla AYNI davranış: uzun basma hızlı önizleme
				// modalını açar. Kart paylaşıldığı için bu davranış burada da
				// ücretsiz geldi — önceki ikinci kopyada hiç yoktu.
				onLongPress={() => handleLongPress(item)}
				// Sorun 5: odaklanan kart ekranın ortasına taşınır.
				onFocus={() => handleCardFocus(index)}
			/>
		),
		[cardWidth, handleItemPress, handleLongPress, handleCardFocus],
	);

	/**
	 * ⚠️ SORUN 2 (devam) — anahtarlar.
	 *
	 * `contentKey` içerik `id`/`url`/`slug`/`title` alanlarından birini
	 * seçer. Bazı eklentilerde aynı başlığa sahip iki farklı içerik
	 * olabildiği için çakışma yaşanır; React aynı anahtarı iki kez
	 * gördüğünde hücreleri YENİDEN KULLANIR ve odaklı kart "içerik
	 * değiştiriyor" gibi görünür. İndeks son eki hem çakışmayı hem de
	 * iki sayfanın birleştiği noktadaki belirsizliği kaldırır.
	 *
	 * Liste YALNIZCA sona ekleme yapar (sayfa 1, 2, 3…), dolayısıyla
	 * indeksler kalıcıdır: eklenen yeni içerikler mevcut anahtarları
	 * değiştirmez.
	 */
	const keyExtractor = useCallback(
		(item, index) => contentKey(item, index),
		[],
	);

	/**
	 * Sabit adımlı ölçüm. Kart yüksekliği artık veriden bağımsız
	 * (`gridCardStride`), dolayısıyla ofset kayması yok.
	 */
	const getItemLayout = useCallback(
		(data, index) => {
			const row = Math.floor(index / layout.columns);
			return {
				length: cardStride,
				offset: LIST_PAD_TOP + cardStride * row,
				index,
			};
		},
		[layout.columns, cardStride],
	);

	/**
	 * İlk yükleme iskeleti.
	 *
	 * Spinner'sün yerine: ekranın gerçek ızgara geometrisi (GUTTER, GAP,
	 * sütun sayısı, kart genişliği) BIREBIR kullanılıyor. Kategori
	 * adı elimizde olduğu için başlık çubuğu da gerçek metin; sadece
	 * "N içerik" rozeti iskelet. Böylece veri gelince hiçbir şey
	 * zıplamıyor — kullanıcı listede ilerlediğini anında fark ediyor.
	 */
	const skeletonRows = useMemo(() => {
		if (cardWidth <= 0) return [];
		const perRow = layout.columns;
		// Üç satı: bir telefon ekranını doldurur, TV'de gereksiz uzun
		// boş alan bırakmaz.
		return Array.from({ length: perRow * 3 });
	}, [cardWidth, layout.columns]);

	const footer = useMemo(() => {
		if (loadingMore) {
			return (
				<View style={styles.footer}>
					<ActivityIndicator
						size="small"
						color={m3.primaryContainer}
					/>
					<Text
						style={[
							styles.footerText,
							{ color: m3.onSurfaceVariant },
						]}>
						Daha fazla yükleniyor…
					</Text>
				</View>
			);
		}
		if (exhausted && items.length > 0) {
			return (
				<View style={styles.footer}>
					<Text
						style={[
							styles.footerText,
							{ color: m3.onSurfaceVariant },
						]}>
						`${items.length} içerik gösteriliyor`
					</Text>
				</View>
			);
		}
		return null;
	}, [loadingMore, exhausted, items.length, m3]);

	const isEmpty = !loading && !error && items.length === 0;

	return (
		<>
			<Stack.Screen options={{ headerShown: false }} />
			<SafeAreaView
				edges={["top", "left", "right"]}
				style={[
					styles.safeArea,
					{
						backgroundColor: m3.surfaceLowest,
						paddingLeft: contentPaddingLeft,
					},
				]}
				onLayout={onLayout}>
				<StatusBar
					barStyle={
						theme === "dark" ? "light-content" : "dark-content"
					}
					backgroundColor={m3.surfaceLowest}
				/>

				{/* Üst çubuk */}
				<View
					style={[
						styles.topBar,
						{
							backgroundColor: `${m3.surfaceLowest}D9`,
							borderBottomColor: `${m3.surfaceContainerHigh}66`,
						},
					]}>
					<TVPressable
						onPress={handleBack}
						focusedStyle={styles.backFocused}
						style={[
							styles.backBtn,
							{ backgroundColor: `${m3.surfaceContainerHigh}CC` },
						]}
						accessibilityLabel="Geri">
						<Ionicons
							name="arrow-back"
							size={21}
							color={m3.onSurface}
						/>
					</TVPressable>

					<View style={styles.topBarTitleWrap}>
						<Text
							style={[
								styles.topBarTitle,
								{ color: m3.onSurface },
							]}
							numberOfLines={1}>
							{shortenTitle(categoryName)}
						</Text>
						{items.length > 0 ? (
							<View
								style={[
									styles.countChip,
									{
										backgroundColor:
											m3.surfaceContainerHigh,
										borderColor: m3.outlineVariant,
									},
								]}>
								<Text
									style={[
										styles.countText,
										{ color: m3.tertiary },
									]}>
									{items.length} içerik
								</Text>
							</View>
						) : null}
					</View>
				</View>

				{loading && items.length === 0 ? (
					/*
					 * Izgara iskeleti. Kart genişliği `cardWidth`'tan gelir,
					 * yani ilk satır gerçek kartlarla birebir aynı yerde
					 * durur — veri geldiğinde liste "yerine oturur".
					 */
					<View
						style={[
							styles.listContent,
							{ rowGap: GAP },
						]}
						pointerEvents="none">
						{Array.from({ length: Math.ceil(skeletonRows.length / layout.columns) }).map(
							(_unused, rowIndex) => (
								<View
									key={`sk-row-${rowIndex}`}
									style={[styles.row, { gap: GAP }]}>
									{skeletonRows
										.slice(
											rowIndex * layout.columns,
											(rowIndex + 1) * layout.columns,
										)
										.map((_, cardIndex) => (
											<CategoryCardSkeleton
												key={`sk-card-${rowIndex}-${cardIndex}`}
												variant="grid"
												width={cardWidth}
											/>
										))}
								</View>
							),
						)}
					</View>
				) : error && items.length === 0 ? (
					<View style={styles.center}>
						<Ionicons
							name="cloud-offline-outline"
							size={40}
							color={m3.onSurfaceVariant}
						/>
						<Text
							style={[styles.errorText, { color: m3.onSurface }]}>
							Kategori yüklenemedi
						</Text>
						<TVPressable
							onPress={handleRetry}
							focusedStyle={styles.retryFocused}
							style={[
								styles.retryBtn,
								{ borderColor: m3.primaryContainer },
							]}>
							<Text
								style={[
									styles.retryText,
									{ color: m3.primaryContainer },
								]}>
								Tekrar Dene
							</Text>
						</TVPressable>
					</View>
				) : isEmpty ? (
					<View style={styles.center}>
						<Ionicons
							name="file-tray-outline"
							size={40}
							color={m3.onSurfaceVariant}
						/>
						<Text
							style={[styles.errorText, { color: m3.onSurface }]}>
							Bu kategoride içerik bulunamadı
						</Text>
					</View>
				) : (
					<FlatList
						ref={listRef}
						contentInsetAdjustmentBehavior="automatic"
						key={layout.columns}
						data={items}
						keyExtractor={keyExtractor}
						renderItem={renderItem}
						numColumns={layout.columns}
						columnWrapperStyle={
							layout.columns > 1 ? styles.row : undefined
						}
						contentContainerStyle={[
							styles.listContent,
							{ rowGap: GAP },
						]}
						getItemLayout={getItemLayout}
						onScrollToIndexFailed={onScrollToIndexFailed}
						onScroll={rememberScroll.onScroll}
						scrollEventThrottle={rememberScroll.scrollEventThrottle}
						onContentSizeChange={() =>
							rememberScroll.restoreOffset(listRef)
						}
						onEndReached={loadMore}
						// Prefetch eşiği biraz düşürüldü: 0.6 pratikte liste
						// bittiğinden çok önce tetikleniyor ve kullanıcı
						// kaydırırken arka planda sürekli yeni sayfa
						// isteği uçuyordu. 0.4 aynı işi daha az istekle yapar.
						onEndReachedThreshold={0.4}
						ListFooterComponent={footer}
						showsVerticalScrollIndicator={false}
						initialNumToRender={12}
						maxToRenderPerBatch={8}
						/*
						 * SORUN 2 — `windowSize` büyütüldü.
						 *
						 * 5 pencerelik kısa pencere, TV'de kumandayla hızlı
						 * gezinirken ölçülmemiş satırların boş kalmasına
						 * ("içerik değişti" hissi) yol açıyordu. 9 pencerenin
						 * maliyeti ihmal edilebilir, kazanımı belirgin.
						 */
						windowSize={9}
						/*
						 * SORUN 2 — `removeClippedSubviews` KAPALI.
						 *
						 * Android'de kırpma, ekran dışına çıkan hücreyi
						 * native tarafta DETACH eder. Odaklı kart detache
						 * olursa kumanda odağı düşer ve Android listedeki
						 * başka bir öğeye odaklanır — kullanıcının gördüğü
						 * tam olarak "seçilmiş içerik kendiliğinden değişti"
						 * davranışıdır.
						 *
						 * TV'de zaten kesinlikle kapatılmalıydı; ızgara
						 * hücrelerinin bellek maliyeti makul olduğu için
						 * telefon/ tablette de kapalı bırakıldı.
						 */
						removeClippedSubviews={false}
					/>
				)}
			</SafeAreaView>

			{/* Sol gezinme rayı — ana sayfa / arama / ayarlarla aynı
			    düzen. Kategori ekranı da bir "bölüm" olduğu için TV'de
			    kumandayla doğrudan bölümler arasında geçilebilir olmalı
			    (sorun 3). */}
			<BottomNavigation activeRoute="/(app)" />

			{/* Hızlı önizleme — ana sayfadaki kartla aynı deneyim.
			    Kart paylaşıldığı için uzun basma davranışı her iki ekranda da
			    aynı; modal'ı da burada aynı şekilde bağlıyoruz. */}
			<QuickPreviewModal
				visible={Boolean(previewItem)}
				movie={previewItem}
				platformName={platformName}
				onClose={() => setPreviewItem(null)}
				onPlayPress={(item) => {
					setPreviewItem(null);
					handleItemPress(item);
				}}
				onDetailsPress={(item) => {
					setPreviewItem(null);
					handleItemPress(item);
				}}
			/>
		</>
	);
}

const styles = StyleSheet.create({
	safeArea: { flex: 1 },
	topBar: {
		height: 56,
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		paddingHorizontal: GUTTER,
		borderBottomWidth: 1,
	},
	backBtn: {
		width: 40,
		height: 40,
		borderRadius: 20,
		alignItems: "center",
		justifyContent: "center",
	},
	topBarTitleWrap: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		minWidth: 0,
	},
	topBarTitle: {
		fontSize: 18,
		lineHeight: 24,
		fontWeight: "700",
		letterSpacing: -0.2,
		flexShrink: 1,
	},
	/*
	 * ⚠️ SORUN 2 — "N içerik" rozeti SIKIŞMADAN genişlemesin.
	 *
	 * Her yeni sayfa geldiğinde sayaç 9 → 29 → 49 … diye büyüyor ve
	 * rozet sola doğru genişleyerek başlığın sıkışıp kırpılmasına yol
	 * açıyordu; kullanıcı bunu "ekran zıpladı" olarak algılıyordu.
	 * Sabit bir taban genişlik verilerek yalnızca TAM SAYI değiştiğinde
	 * (100 → 200 içerik gibi) rozet büyüyebilir.
	 */
	countChip: {
		minWidth: 74,
		alignItems: "center",
		paddingHorizontal: 8,
		paddingVertical: 2,
		borderRadius: 999,
		borderWidth: 1,
	},
	countText: {
		fontSize: 11,
		lineHeight: 16,
		fontWeight: "700",
	},

	listContent: {
		paddingHorizontal: GUTTER,
		paddingTop: LIST_PAD_TOP,
		paddingBottom: 40,
	},
	row: { gap: GAP },

	// Alt durumlar
	center: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		gap: 12,
		paddingHorizontal: 32,
	},
	errorText: {
		fontSize: 15,
		lineHeight: 20,
		fontWeight: "600",
		textAlign: "center",
	},
	retryBtn: {
		paddingHorizontal: 18,
		paddingVertical: 9,
		borderRadius: 999,
		borderWidth: 1,
		marginTop: 4,
	},
	retryText: {
		fontSize: 13,
		lineHeight: 18,
		fontWeight: "700",
	},
	footer: {
		alignItems: "center",
		justifyContent: "center",
		paddingVertical: 22,
		gap: 10,
	},
	footerText: {
		fontSize: 13,
		lineHeight: 18,
	},

	// TV odak
	backFocused: { transform: [{ scale: 1.12 }] },
	retryFocused: { transform: [{ scale: 1.05 }] },
});
