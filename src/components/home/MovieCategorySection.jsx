import CategoryCard, {
	ROW_CARD_GAP,
	ROW_CARD_WIDTH,
	ROW_LIST_PAD_H,
} from "@/components/content/CategoryCard";
import TVPressable from "@/components/common/TVPressable";
import { fetchPlatformMainPage, getCachedCategoryMovies } from "@/services/api";
import { contentKey } from "@/utils/contentMeta";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { memo, useEffect, useState } from "react";
import {
	ActivityIndicator,
	FlatList,
	StyleSheet,
	Text,
	View,
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

	if (loading) {
		return (
			<View style={styles.loadingContainer}>
				<ActivityIndicator size="small" color="#2563EB" />
			</View>
		);
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
	loadingContainer: {
		height: 140,
		justifyContent: "center",
		alignItems: "center",
	},
});
