import CategoryCard, {
	CARD_POSTER_RATIO,
	CARD_SUBTITLE_HEIGHT,
	CARD_SUBTITLE_MARGIN_TOP,
	CARD_TITLE_HEIGHT,
	CARD_TITLE_MARGIN_TOP,
	ROW_CARD_GAP,
	ROW_CARD_WIDTH,
	ROW_LIST_PAD_H,
} from "@/components/content/CategoryCard";
import CategoryCardSkeleton from "@/components/content/CategoryCardSkeleton";
import TVPressable from "@/components/common/TVPressable";
import { SkeletonBlock, SkeletonLine } from "@/components/common/Skeleton";
import { fetchPlatformMainPage, getCachedCategoryMovies } from "@/services/api";
import { contentKey } from "@/utils/contentMeta";
import { useFocusCentering } from "@/hooks/useFocusCentering";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
	FlatList,
	Platform,
	StyleSheet,
	Text,
	View,
	useWindowDimensions,
} from "react-native";

/**
 * Ana sayfadaki tek kategori satırı (yatay kart dizisi).
 *
 * ⚠️ Kartın kendisi `components/content/CategoryCard.jsx` — kategori sayfası
 * da aynı bileşeni kullanıyor. Burada yalnızca satır kabuğu, veri çekme ve
 * "tümünü göster" girişi var. Kartın görünümüne/oynaklanmasına burada dokunma;
 * değişiklik her ekranda otomatik uygulanır.
 *
 * Kart geometrisi tek kaynaktan yönetilir (`CategoryCard`); hem stiller hem
 * `getItemLayout` aynı sabitleri kullanır, böylece ölçüm kaymaz.
 */
const CARD_STRIDE = ROW_CARD_WIDTH + ROW_CARD_GAP;

/**
 * Bir "row" kartının gerçek yüksekliği: 2:3 poster + başlık satırı +
 * alt satır (sezon/bölüm ya da yıl).
 *
 * Satır sonu kutusu bu yüksekliğe BİREBİR eşit olmalı; aksi hâlde
 * `getItemLayout` (sabit adım) son öğeye doğru kayar.
 */
const ROW_CARD_HEIGHT =
	ROW_CARD_WIDTH / CARD_POSTER_RATIO +
	CARD_TITLE_MARGIN_TOP +
	CARD_TITLE_HEIGHT +
	CARD_SUBTITLE_MARGIN_TOP +
	CARD_SUBTITLE_HEIGHT;

/**
 * SORUN 1 — "Tümünü göster" düğmesine ulaşmak zor.
 *
 * ⚠️ KÖK NEDEN: Düğme satır başlığının SAĞ ucundaydı. Android TV odak
 * yöneticisi düğmeyi "yukarı" ararken yalnızca odaklı kartın üstündeki
 * ışınla KESİŞEN öğeleri aday sayar. Başlıktaki ok ekranın sağ
 * ucunda olduğu için, kullanıcı satırın sol tarafındaki bir kartın
 * üstündeyken ışın oka hiç ulaşmıyor — önce satırı sağa kaydırıp
 * sonra yukarı basmak gerekiyordu.
 *
 * ÇÖZÜM: TV'de (ve sol rayı olan yatay tabletlerde) satırın SONUNA
 * odaklanabilir bir "Tümünü Gör" kutusu ekleniyor. Sağa doğru ilerlemek
 * zaten kullanıcının yaptığı hareket; kutu satırın sonuna gelindiğinde
 * odaklanabilir olduğu için ışın sorunu yaşanmıyor.
 *
 * Başlıktaki ok korunuyor: dokunmatik cihazlarda (ve TV'de satırın
 * sonuna kadar gidildiğinde) aynı işlevi görüyor.
 */
/**
 * Satır sonu kutusunu işaretleyen özel değer.
 *
 * ⚠️ Neden `Symbol` ve neden bir dize DEĞİL: satırdaki gerçek
 * içerikler `contentKey` ile anahtarlanıyor ve bazı eklentiler başlığı
 * boş/işaretli gelebiliyor. `Symbol` hiçbir içerikle eşleşemez.
 */
const SEE_ALL_SENTINEL = Symbol("see-all");

function SeeAllTile({ onPress }) {
	return (
		<TVPressable
			onPress={onPress}
			style={styles.seeAllTile}
			focusedStyle={styles.seeAllTileFocused}
			accessibilityLabel="Kategorinin tümünü göster">
			<View style={styles.seeAllIconWrap}>
				<Ionicons name="grid-outline" size={26} color="#E5E7EB" />
			</View>
			<Text style={styles.seeAllText} numberOfLines={2}>
				Tümünü Gör
			</Text>
		</TVPressable>
	);
}

/**
 * memo: üst bileşen (ana sayfa) yeniden render olduğunda, prop'ları değişmeyen
 * kategori satırları yeniden render olmaz. index.jsx'deki callback'ler
 * useCallback ile sabitlendiği için bu gerçekten tutarlı çalışır.
 */
function MovieCategorySection({
	platformName,
	category,
	onMoviePress,
	onMovieLongPress,
	onSeeAll,
	/**
	 * Odak bir karta geldiğinde çağrılır. Ana sayfa bunu kullanarak
	 * kendi dikey listesinde satırı ekranın ORTASINA taşır (sorun 5).
	 */
	onRowFocused,
	/** Sol ray bulunan düzenlerde (TV / yatay tablet) satır sonu kutusu. */
	showSeeAllTile = false,
}) {
	const initialCached = getCachedCategoryMovies(platformName, category?.url, 1);
	const [movies, setMovies] = useState(initialCached || []);
	const [loading, setLoading] = useState(
		!initialCached || initialCached.length === 0,
	);

	useEffect(() => {
		let isMounted = true;

		async function loadCategoryMovies() {
			const currentCached = getCachedCategoryMovies(
				platformName,
				category?.url,
				1,
			);
			if (currentCached && currentCached.length > 0) {
				if (isMounted) {
					setMovies(currentCached);
					setLoading(false);
				}
				return;
			}

			try {
				setLoading(true);
				const data = await fetchPlatformMainPage(
					platformName,
					category.url,
				);
				const items = Array.isArray(data)
					? data
					: data?.results || data?.data || [];

				if (isMounted) {
					setMovies(items);
				}
			} catch (error) {
				console.error(
					`[${category.name}] içerikleri yüklenirken hata:`,
					error,
				);
			} finally {
				if (isMounted) {
					setLoading(false);
				}
			}
		}

		if (platformName && category?.url) {
			loadCategoryMovies();
		}

		return () => {
			isMounted = false;
		};
	}, [platformName, category?.url, category?.name]);

	/*
	 * Satır yüklenirken spinner DEĞİL, iskelet.
	 *
	 * Spinner 140px'lik ince bir şeritti; satırın gerçek yüksekliği
	 * başlık + 124×182 kart + başlık satırı ≈ 230px. İçerik gelince
	 * ekran zıplıyordu. `MovieCategoryRowSkeleton` aynı başlığı, aynı
	 * kenar boşluğunu ve aynı kart boyutunu kullanıyor.
	 */
	if (loading) {
		return <MovieCategoryRowSkeleton categoryName={category?.name} />;
	}

	if (!movies || movies.length === 0) {
		return null;
	}

	return (
		<CategoryRowBody
			category={category}
			movies={movies}
			onMoviePress={onMoviePress}
			onMovieLongPress={onMovieLongPress}
			onSeeAll={onSeeAll}
			onRowFocused={onRowFocused}
			showSeeAllTile={showSeeAllTile}
		/>
	);
}

/**
 * Satır gövdesi — veri geldiğinde ayrı bileşen olarak render edilir ki
 * `useRef`/`useCallback` kancaları koşullu dönüşten sonra da
 * (yeniden render edilen) aynı sırada kalsın. Aksi hâlde "Hooks
 * sırası değişti" hatası oluşurdu.
 */
function CategoryRowBody({
	category,
	movies,
	onMoviePress,
	onMovieLongPress,
	onSeeAll,
	onRowFocused,
	showSeeAllTile,
}) {
	// React Compiler, `category?.name` okumasını `category.name` olarak
	// çıkarıyor; elle yazılan bağımlılık listesiyle birebir örtüşmesi için
	// isim bir kez burada çözülüyor.
	const categoryName = category?.name;

	const handleSeeAll = useCallback(() => {
		onSeeAll?.(category);
	}, [onSeeAll, category]);

	/*
	 * SORUN 5 — kart odaklandığında ekrana ORTALANIR.
	 *
	 * Android TV odaklanan öğeyi yalnızca EKRANA GETİRİR (en az kaydırma);
	 * kart satırın kenarına yapışır ve kullanıcı "önce kaydı, sonra
	 * seçti" diye tarif ettiği gibi yarım görünür.
	 *
	 * Ortak kanca (`useFocusCentering`) bu davranışı TEK yerden verir;
	 * `horizontal: true` ile kart yatayda satırın ortasına sabitlenir.
	 * Satırın kendisini dikeyde ortalamak `onRowFocused` ile ana sayfa
	 * listesine bırakılır (o listenin `scrollToIndex`'i kendi ref'indedir).
	 */
	const {
		listRef,
		handleItemFocus: centerOnScreen,
		onScrollToIndexFailed,
		clearRetry,
	} = useFocusCentering({ horizontal: true });

	useEffect(() => clearRetry, [clearRetry]);

	const handleCardFocus = useCallback(
		(index) => {
			centerOnScreen(index);
			// Satırın kendisini dikeyde de ortala (ana sayfa listesi).
			onRowFocused?.();
		},
		[centerOnScreen, onRowFocused],
	);

	const rowData = useMemo(
		() => (showSeeAllTile ? [...movies, SEE_ALL_SENTINEL] : movies),
		[movies, showSeeAllTile],
	);

	const keyExtractor = useCallback(
		(item, index) =>
			item === SEE_ALL_SENTINEL
				? `see-all-${categoryName || "cat"}`
				: `${contentKey(item, index)}-${categoryName || "movie"}`,
		[categoryName],
	);

	const renderItem = useCallback(
		({ item, index }) => {
			if (item === SEE_ALL_SENTINEL) {
				return <SeeAllTile onPress={handleSeeAll} />;
			}
			return (
				<CategoryCard
					item={item}
					variant="row"
					onPress={() => onMoviePress(item)}
					onLongPress={() => onMovieLongPress?.(item)}
					onFocus={() => handleCardFocus(index)}
				/>
			);
		},
		[handleCardFocus, handleSeeAll, onMovieLongPress, onMoviePress],
	);

	return (
		<View style={styles.sectionContainer}>
			{/* Section Header */}
			<View style={styles.sectionHeader}>
				<Text style={styles.sectionTitle} numberOfLines={1}>
					{category.name}
				</Text>
				<TVPressable
					onPress={handleSeeAll}
					style={styles.arrowButton}
					focusedStyle={styles.arrowButtonFocused}
					accessibilityLabel="Kategorinin tümünü göster">
					<Ionicons name="arrow-forward" size={18} color="#ffffff" />
				</TVPressable>
			</View>

			{/* Horizontal List of Cards */}
			<FlatList
				ref={listRef}
				data={rowData}
				keyExtractor={keyExtractor}
				horizontal
				showsHorizontalScrollIndicator={false}
				contentContainerStyle={styles.horizontalList}
				initialNumToRender={6}
				maxToRenderPerBatch={6}
				windowSize={7}
				/*
				 * SORUN 2 — TV'de kırpma KAPALI.
				 *
				 * Android'de `removeClippedSubviews`, ekran dışındaki
				 * hücreyi native tarafta detach eder. Odaklı kart
				 * detach olursa kumanda odağı düşer ve Android listedeki
				 * BAŞKA bir öğeye odaklanır — kullanıcının "seçili içerik
				 * değişti" dediği davranışın bir parçası. Dokunmatik
				 * cihazlarda kırpma bellek için değerli, TV'de değil.
				 */
				removeClippedSubviews={!Platform.isTV}
				getItemLayout={getItemLayout}
				onScrollToIndexFailed={onScrollToIndexFailed}
				renderItem={renderItem}
			/>
		</View>
	);
}

export default memo(MovieCategorySection);

/**
 * Yüklenen kategori satırının iskeleti.
 *
 * Satırın gerçek geometrisinin TAMAMINI taklit eder:
 *   • başlık + ok yerleşimi → `styles.sectionHeader`
 *   • kart genişliği / aralığı / kenar payı → `CategoryCard` sabitleri
 *   • kart içi → `CategoryCardSkeleton`
 *
 * Görünen kart adedi EKRANA GÖRE hesaplanır (sabit sayı değil): 360dp
 * telefonda ~3, 1080p TV'de ~9 kart sığar. Sabit bir sayı TV'de satırın
 * yarısını boş bırakır, telefonda ise taşıp kırpılırdı.
 *
 * ⚠️ Başlık iskelet DEĞİL, gerçek metindir: kategori adı satır render
 * edildiği anda elimizdedir. Başlığı da iskelet yapmak ekranı daha da
 * boş gösterirdi, üstelik içerik gelince metin zıplardı.
 */
export function MovieCategoryRowSkeleton({ categoryName }) {
	const { width } = useWindowDimensions();

	const visibleCount = useMemo(() => {
		const usable = width - ROW_LIST_PAD_H * 2;
		const fit = Math.floor(
			(usable + ROW_CARD_GAP) / (ROW_CARD_WIDTH + ROW_CARD_GAP),
		);
		// En az 3: çok dar ekranda bile satır "yükleniyor" gibi görünmeli.
		return Math.max(3, fit);
	}, [width]);

	return (
		<View style={styles.sectionContainer} pointerEvents="none">
			<View style={styles.sectionHeader}>
				{categoryName ? (
					<Text style={styles.sectionTitle} numberOfLines={1}>
						{categoryName}
					</Text>
				) : (
					<SkeletonLine width={140} height={16} />
				)}
				{/* Ok yerine iskelet daire — başlıkla hizalı kalsın. */}
				<SkeletonBlock width={18} height={18} radius={9} />
			</View>

			<View style={styles.horizontalList}>
				<CategoryCardSkeleton
					variant="row"
					count={visibleCount}
					gap={ROW_CARD_GAP}
				/>
			</View>
		</View>
	);
}

/**
 * Kart yüksekliği sabit olduğu için ölçüm hesabı tamamen atlanabilir.
 * `gap` içerik konteynerinde olduğu için adım uzunluğuna eklenmeli.
 */
function getItemLayout(_data, index) {
	return {
		length: CARD_STRIDE,
		offset: ROW_LIST_PAD_H + CARD_STRIDE * index,
		index,
	};
}

const styles = StyleSheet.create({
	sectionContainer: {
		marginBottom: 22,
	},
	sectionHeader: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		paddingHorizontal: 18,
		marginBottom: 10,
		gap: 12,
	},
	sectionTitle: {
		color: "#ffffff",
		fontSize: 16,
		fontWeight: "700",
		letterSpacing: -0.2,
		flexShrink: 1,
	},
	arrowButton: {
		padding: 4,
	},
	arrowButtonFocused: {
		backgroundColor: "rgba(255, 59, 48, 0.35)",
		borderRadius: 12,
		transform: [{ scale: Platform.isTV ? 1.02 : 1.15 }],
	},
	horizontalList: {
		paddingHorizontal: ROW_LIST_PAD_H,
		gap: ROW_CARD_GAP,
		paddingVertical: 6,
	},

	// ── Satır sonu "Tümünü Gör" kutusu (sorun 1) ──────────────────
	// Kartla AYNI yükseklikte ve aynı adımda; bu yüzden `getItemLayout`
	// dokunulmadan doğru kalır.
	seeAllTile: {
		width: ROW_CARD_WIDTH,
		height: ROW_CARD_HEIGHT,
		borderRadius: 12,
		borderWidth: 2,
		borderStyle: "dashed",
		borderColor: "rgba(255, 255, 255, 0.22)",
		backgroundColor: "rgba(255, 255, 255, 0.04)",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		paddingHorizontal: 6,
	},
	seeAllTileFocused: {
		borderStyle: "solid",
		borderColor: "#E50914",
		backgroundColor: "rgba(229, 9, 20, 0.18)",
		transform: [{ scale: 1.06 }],
	},
	seeAllIconWrap: {
		width: 46,
		height: 46,
		borderRadius: 23,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "rgba(255, 255, 255, 0.08)",
	},
	seeAllText: {
		color: "#E5E7EB",
		fontSize: 12,
		lineHeight: 15,
		fontWeight: "700",
		textAlign: "center",
	},
});