import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	ActivityIndicator,
	AppState,
	FlatList,
	Platform,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useRouter } from "expo-router";
import TVPressable from "@/components/common/TVPressable";
import { FontFamily, Palette } from "@/constants/theme";
import { getFlagFromIso } from "@/utils/formatters";
import { useFocusCentering } from "@/hooks/useFocusCentering";
import {
	applyDisabledPlugins,
	fetchPlatforms,
	fetchPluginStatus,
} from "@/services/api";
import {
	LIVE_TV_PLATFORM,
	NONE_PLATFORM,
	getPluginVisibilitySettings,
	getSelectedPlatform,
	saveSelectedPlatform,
} from "@/utils/storage";

const DURUM_YOKLAMA_ARALIGI = 60_000;

// Eski halindeki 3 temel filtre
const FILTER_CHIPS = [
	{ id: "movie", label: "Filmler" },
	{ id: "series", label: "Diziler" },
	{ id: "anime", label: "Animeler" },
];

function devredeMi(platform) {
	if (!platform) return false;
	if (typeof platform.kullanilabilir === "boolean") {
		return !platform.kullanilabilir;
	}
	return Boolean(platform.devrede);
}

function rastgeleKullanilabilir(platformList) {
	const kullanilabilirler = platformList.filter((p) => !devredeMi(p));
	if (kullanilabilirler.length === 0) return null;
	return kullanilabilirler[
		Math.floor(Math.random() * kullanilabilirler.length)
	];
}

export default function PlatformList({ onSelectPlatform, onOpenLiveTv, onClose }) {
	const router = useRouter();
	const [selectedPlatformId, setSelectedPlatformId] = useState("none");
	const [platformList, setPlatformList] = useState([]);
	const [loading, setLoading] = useState(true);
	// Birden fazla seçim yapılabilen filtre dizisi (örn: ['movie', 'series'])
	const [selectedFilters, setSelectedFilters] = useState([]);

	const yoklamaRef = useRef(null);

	// TV odak ortalama: D-pad ile dikeyde gezerken liste düzgün kaysın
	const {
		listRef,
		handleItemFocus,
		onScrollToIndexFailed,
		onViewableItemsChanged,
		viewabilityConfig,
		clearRetry,
	} = useFocusCentering({ columns: 1 });

	useEffect(() => clearRetry, [clearRetry]);

	const loadPlatforms = useCallback(async () => {
		try {
			const [data, saved, visibility] = await Promise.all([
				fetchPlatforms(),
				getSelectedPlatform(),
				getPluginVisibilitySettings(),
			]);

			const list = Array.isArray(data) ? data : [];
			const visibleList = list.filter(
				(p) => visibility?.[p.name || p.id] !== false,
			);

			if (
				saved &&
				visibleList.some(
					(p) =>
						(p.id && p.id === saved.id) ||
						(p.name && p.name === saved.name),
				)
			) {
				setSelectedPlatformId(saved.id || saved.name);
			} else if (visibleList.length > 0) {
				setSelectedPlatformId(visibleList[0].id || visibleList[0].name);
			} else {
				setSelectedPlatformId("none");
			}

			return visibleList;
		} catch (error) {
			console.error("Platformlar yüklenirken hata:", error);
			setSelectedPlatformId("none");
			return [];
		}
	}, []);

	useEffect(() => {
		let isMounted = true;

		async function initialLoad() {
			setLoading(true);
			const list = await loadPlatforms();
			if (!isMounted) return;
			setPlatformList(list);
			setLoading(false);
		}

		initialLoad();
		return () => {
			isMounted = false;
		};
	}, [loadPlatforms]);

	const durumuKontrolEt = useCallback(async () => {
		const veri = await fetchPluginStatus();
		if (!veri) return;

		setPlatformList((oncekiler) => {
			return applyDisabledPlugins(oncekiler, veri.kullanim_disi);
		});
	}, []);

	useEffect(() => {
		yoklamaRef.current = setInterval(
			durumuKontrolEt,
			DURUM_YOKLAMA_ARALIGI,
		);
		return () => {
			if (yoklamaRef.current) {
				clearInterval(yoklamaRef.current);
				yoklamaRef.current = null;
			}
		};
	}, [durumuKontrolEt]);

	useEffect(() => {
		const abonelik = AppState.addEventListener("change", (sonraki) => {
			if (sonraki === "active") {
				durumuKontrolEt();
			}
		});
		return () => abonelik?.remove?.();
	}, [durumuKontrolEt]);

	// Çoklu seçim toggle fonksiyonu
	const toggleFilter = (filterId) => {
		setSelectedFilters((prev) => {
			if (prev.includes(filterId)) {
				return prev.filter((id) => id !== filterId);
			} else {
				return [...prev, filterId];
			}
		});
	};

	const handlePlatformSelect = async (platform) => {
		if (devredeMi(platform)) {
			return;
		}

		const id = platform?.id || platform?.name;
		setSelectedPlatformId(id);
		await saveSelectedPlatform(platform);

		if (onSelectPlatform) {
			onSelectPlatform(platform);
		}
		if (onClose) {
			onClose();
		}
	};

	const handleSelectRandom = async () => {
		const chosen = rastgeleKullanilabilir(platformList);
		if (!chosen) {
			handlePlatformSelect(NONE_PLATFORM);
			return;
		}
		handlePlatformSelect(chosen);
	};

	const handleOpenLiveTv = () => {
		if (onClose) {
			onClose();
		}
		if (onOpenLiveTv) {
			onOpenLiveTv();
			return;
		}
		router.push("/(app)/live");
	};

	// Çoklu filtreleme: seçilen filtrelerden herhangi birini (OR) karşılayanları gösterir
	// Hiçbir filtre seçili değilse tüm listeyi gösterir
	const filteredPlatforms = useMemo(() => {
		if (selectedFilters.length === 0) {
			return platformList;
		}

		return platformList.filter((p) => {
			const name = (p.name || "").toLowerCase();
			const categories = (p.categories || []).map((c) =>
				(typeof c === "string" ? c : c.name || "").toLowerCase(),
			);

			const matchMovie =
				selectedFilters.includes("movie") &&
				(name.includes("film") ||
					name.includes("sinema") ||
					categories.some((c) => c.includes("film")));

			const matchSeries =
				selectedFilters.includes("series") &&
				(name.includes("dizi") || categories.some((c) => c.includes("dizi")));

			const matchAnime =
				selectedFilters.includes("anime") &&
				(name.includes("anime") || categories.some((c) => c.includes("anime")));

			return matchMovie || matchSeries || matchAnime;
		});
	}, [platformList, selectedFilters]);

	const isNoneSelected =
		selectedPlatformId === "none" || selectedPlatformId === "None";

	// Tüm liste öğeleri (Hiçbiri, Rastgele, Canlı TV ve Eklentiler)
	const listData = useMemo(() => {
		const items = [
			{
				type: "special",
				key: "none",
				label: "Hiçbiri",
				icon: "cloud-offline-outline",
				selected: isNoneSelected,
				onPress: () => handlePlatformSelect(NONE_PLATFORM),
			},
			{
				type: "special",
				key: "random",
				label: "Rastgele",
				icon: "shuffle-outline",
				selected: false,
				onPress: handleSelectRandom,
			},
			{
				type: "special",
				key: "live-tv",
				label: LIVE_TV_PLATFORM.displayName || "Canlı TV",
				icon: "tv-outline",
				selected: false,
				onPress: handleOpenLiveTv,
			},
		];

		filteredPlatforms.forEach((p) => {
			const isSelected =
				!isNoneSelected &&
				(selectedPlatformId === p.id || selectedPlatformId === p.name);
			items.push({
				type: "platform",
				key: p.id || p.name,
				label: p.name,
				platform: p,
				bayrak: getFlagFromIso(p.language) || "🇹🇷",
				selected: isSelected,
				kapali: devredeMi(p),
				onPress: () => handlePlatformSelect(p),
			});
		});

		return items;
	}, [filteredPlatforms, isNoneSelected, selectedPlatformId]);

	const renderListItem = ({ item, index }) => {
		const isSpecial = item.type === "special";

		return (
			<TVPressable
				autoFocus={index === 0}
				style={styles.rowItem}
				focusedStyle={styles.rowItemFocused}
				onPress={item.onPress}
				onFocus={() => handleItemFocus(index)}
				disabled={item.kapali}
				activeOpacity={0.8}>
				{/* Sol Checkbox / Onay İkonu */}
				<View style={styles.checkContainer}>
					{item.selected ? (
						<Ionicons name="checkmark" size={18} color="#ffffff" />
					) : null}
				</View>

				{/* Bayrak veya Özel İkon */}
				{!isSpecial ? (
					<Text style={styles.flagText}>{item.bayrak}</Text>
				) : (
					<View style={styles.specialIconContainer}>
						<Ionicons name={item.icon} size={16} color="rgba(255, 255, 255, 0.7)" />
					</View>
				)}

				{/* Başlık / İsim */}
				<Text
					style={[
						styles.itemTitle,
						isSpecial && styles.specialTitle,
						item.kapali && styles.disabledTitle,
					]}
					numberOfLines={1}>
					{item.label}
				</Text>

				{item.kapali && (
					<Text style={styles.disabledBadge}>Kullanım Dışı</Text>
				)}
			</TVPressable>
		);
	};

	return (
		<View style={styles.container}>
			{loading ? (
				<View style={styles.loadingContainer}>
					<ActivityIndicator size="large" color={Palette.primary} />
				</View>
			) : (
				<FlatList
					ref={listRef}
					data={listData}
					keyExtractor={(item) => item.key}
					renderItem={renderListItem}
					showsVerticalScrollIndicator={false}
					contentContainerStyle={styles.listContent}
					removeClippedSubviews={false}
					initialNumToRender={Platform.isTV ? 35 : 20}
					windowSize={11}
					onScrollToIndexFailed={onScrollToIndexFailed}
					onViewableItemsChanged={onViewableItemsChanged}
					viewabilityConfig={viewabilityConfig}
				/>
			)}

			{/* Alt Filtre Butonları (Film, Dizi, Anime - Çoklu Seçim Destekli) */}
			<View style={styles.filterBarContainer}>
				<ScrollView
					horizontal
					showsHorizontalScrollIndicator={false}
					contentContainerStyle={styles.filterScrollView}>
					{FILTER_CHIPS.map((chip) => {
						const isSelected = selectedFilters.includes(chip.id);
						return (
							<TVPressable
								key={chip.id}
								style={[
									styles.filterChip,
									isSelected
										? styles.filterChipActive
										: styles.filterChipInactive,
								]}
								focusedStyle={styles.filterChipFocused}
								onPress={() => toggleFilter(chip.id)}
								activeOpacity={0.85}>
								<Text
									style={[
										styles.filterChipText,
										isSelected
											? styles.filterChipTextActive
											: styles.filterChipTextInactive,
									]}>
									{chip.label}
								</Text>
							</TVPressable>
						);
					})}
				</ScrollView>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: "#0d0e15", // Kaynak resimdeki koyu arka plan
		paddingHorizontal: 24,
		paddingTop: 10,
		paddingBottom: 8,
	},
	loadingContainer: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
	},
	listContent: {
		paddingVertical: 4,
		gap: 2,
	},

	// Satır Öğesi: Kompakt 38dp satır
	rowItem: {
		flexDirection: "row",
		alignItems: "center",
		height: 38,
		paddingHorizontal: 10,
		borderRadius: 10,
		borderWidth: 1.5,
		borderColor: "transparent",
	},
	// Kaynak resimdeki ince beyaz çerçeveli odak
	rowItemFocused: {
		borderColor: "#ffffff",
		backgroundColor: "rgba(255, 255, 255, 0.05)",
	},

	checkContainer: {
		width: 26,
		alignItems: "flex-start",
		justifyContent: "center",
	},
	flagText: {
		fontSize: 15,
		marginRight: 8,
	},
	specialIconContainer: {
		width: 20,
		marginRight: 8,
		alignItems: "center",
		justifyContent: "center",
	},
	itemTitle: {
		fontSize: 14,
		fontFamily: FontFamily.semiBold,
		color: "#ffffff",
		flexShrink: 1,
	},
	specialTitle: {
		fontFamily: FontFamily.semiBold,
		color: "#ffffff",
	},
	disabledTitle: {
		color: "rgba(255, 255, 255, 0.35)",
	},
	disabledBadge: {
		fontSize: 10,
		color: Palette.error,
		marginLeft: 8,
		fontFamily: FontFamily.medium,
	},

	// Alt Filtre Barı
	filterBarContainer: {
		paddingTop: 8,
		paddingBottom: 4,
	},
	filterScrollView: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
	},
	filterChip: {
		paddingHorizontal: 16,
		paddingVertical: 6,
		borderRadius: 10,
		borderWidth: 1.5,
		borderColor: "transparent",
	},
	filterChipActive: {
		backgroundColor: "#007aff", // Canlı mavi (seçili)
	},
	filterChipInactive: {
		backgroundColor: "rgba(255, 255, 255, 0.16)", // Grimsi transparan
	},
	filterChipFocused: {
		borderColor: "#ffffff",
	},
	filterChipText: {
		fontSize: 12,
		fontFamily: FontFamily.medium,
	},
	filterChipTextActive: {
		color: "#ffffff",
		fontFamily: FontFamily.bold,
	},
	filterChipTextInactive: {
		color: "rgba(255, 255, 255, 0.9)",
	},
});
