import CategoryCard, {
	ROW_CARD_GAP,
	ROW_CARD_WIDTH,
	ROW_LIST_PAD_H,
} from "@/components/content/CategoryCard";
import CategoryCardSkeleton from "@/components/content/CategoryCardSkeleton";
import TVPressable from "@/components/common/TVPressable";
import { SkeletonBlock, SkeletonLine } from "@/components/common/Skeleton";
import { fetchPlatformMainPage, getCachedCategoryMovies } from "@/services/api";
import { contentKey } from "@/utils/contentMeta";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { memo, useEffect, useMemo, useState } from "react";
import {
	FlatList,
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
 * "tümünü göster" oku var. Kartın görünümüne/oynaklanmasına burada dokunma;
 * değişiklik her ekranda otomatik uygulanır.
 *
 * Kart geometrisi tek kaynaktan yönetilir (`CategoryCard`); hem stiller hem
 * `getItemLayout` aynı sabitleri kullanır, böylece ölçüm kaymaz.
 */
const CARD_STRIDE = ROW_CARD_WIDTH + ROW_CARD_GAP;

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
		<View style={styles.sectionContainer}>
			{/* Section Header */}
			<View style={styles.sectionHeader}>
				<Text style={styles.sectionTitle}>{category.name}</Text>
				<TVPressable
					onPress={() => onSeeAll?.(category)}
					style={styles.arrowButton}
					focusedStyle={styles.arrowButtonFocused}>
					<Ionicons name="arrow-forward" size={18} color="#ffffff" />
				</TVPressable>
			</View>

			{/* Horizontal List of Cards */}
			<FlatList
				data={movies}
				keyExtractor={(item, index) =>
					`${contentKey(item, index)}-${category?.name || "movie"}`
				}
				horizontal
				showsHorizontalScrollIndicator={false}
				contentContainerStyle={styles.horizontalList}
				initialNumToRender={5}
				maxToRenderPerBatch={4}
				windowSize={3}
				// Yatay listede odaklı kart daima ekrandadır, bu yüzden kırpma
				// güvenli ve bellek için belirli fayda sağlıyor (120+ kartın
				// olduğu yer burası).
				removeClippedSubviews={true}
				getItemLayout={getItemLayout}
				renderItem={({ item }) => (
					<CategoryCard
						item={item}
						variant="row"
						onPress={() => onMoviePress(item)}
						onLongPress={() => onMovieLongPress?.(item)}
					/>
				)}
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
	},
	sectionTitle: {
		color: "#ffffff",
		fontSize: 16,
		fontWeight: "700",
		letterSpacing: -0.2,
	},
	arrowButton: {
		padding: 4,
	},
	arrowButtonFocused: {
		backgroundColor: "rgba(255, 59, 48, 0.35)",
		borderRadius: 12,
		transform: [{ scale: 1.15 }],
	},
	horizontalList: {
		paddingHorizontal: ROW_LIST_PAD_H,
		gap: ROW_CARD_GAP,
		paddingVertical: 6,
	},
});
