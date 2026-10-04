import TVPressable from "@/components/common/TVPressable";
import {
	applyDisabledPlugins,
	fetchPluginStatus,
	fetchPlatforms,
} from "@/services/api";
import {
	NONE_PLATFORM,
	getPluginVisibilitySettings,
	getSelectedPlatform,
	saveSelectedPlatform,
} from "@/utils/storage";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	ActivityIndicator,
	AppState,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";

/**
 * Devre durumu yoklama aralığı (ms).
 *
 * Backend'in devre bekleme süresiyle (varsayılan `PLUGIN_DISABLE_COOLDOWN`
 * = 60 sn) aynı değerde: daha kısa yoklama boşuna trafik, daha uzun yoklama
 * kullanıcıya bayat liste gösterir.
 */
const DURUM_YOKLAMA_ARALIGI = 60_000;

/**
 * Bir eklenti devrede mi?
 *
 * Backend hem `devrede` hem `kullanilabilir` gönderiyor; `kullanilabilir`
 * okunur çünkü UI açısından doğrudan kullanılabilir.
 *
 * `fetchPlatforms` her platformu `...p` ile yaydığı için bu alanlar API
 * katmanından otomatik gelir — ayrı bir uç gerekmez.
 */
function devredeMi(platform) {
	if (!platform) return false;
	if (typeof platform.kullanilabilir === "boolean") {
		return !platform.kullanilabilir;
	}
	return Boolean(platform.devrede);
}

export default function PlatformList({ onSelectPlatform }) {
	const [selectedPlatformId, setSelectedPlatformId] = useState("none");
	const [platformList, setPlatformList] = useState([]);
	const [loading, setLoading] = useState(true);
	const [searchQuery, setSearchQuery] = useState("");
	const [activeFilter, setActiveFilter] = useState("all"); // 'all' | 'movie' | 'series' | 'anime'

	// Yoklama zamanlayıcısı ve uygulama ön plan dinleyicisi için referans.
	const yoklamaRef = useRef(null);

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

			if (saved &&
				visibleList.some(
					(p) =>
						(p.id && p.id === saved.id) ||
						(p.name && p.name === saved.name),
				)) {
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

	/**
	 * 60 sn'de bir devre durumunu kontrol et.
	 *
	 * `/api/plugins/status` YALNIZCA devrede olanları döner ve önbelleklenmez;
	 * devrede kaynak yokken cevap ~65 bayt (ölçüldü). Statik liste 300 sn
	 * önbellekli olduğu için burada tam liste yeniden çekilmez.
	 */
	const durumuKontrolEt = useCallback(async () => {
		const veri = await fetchPluginStatus();
		if (!veri) return; // ağ/yoklama hatası — sessizce geç

		setPlatformList((oncekiler) => {
			const uygulanmis = applyDisabledPlugins(
				oncekiler,
				veri.kullanim_disi,
			);
			// Boş cevapta aynı referans döner; React gereksiz render üretmez.
			return uygulanmis;
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

	/*
	 * Uygulama arka plana alınınca yoklamayı DURDUR (pil), öne dönünce hemen
	 * bir tur at (bayat liste görmeme).
	 */
	useEffect(() => {
		const abonelik = AppState.addEventListener("change", (sonraki) => {
			if (sonraki === "active") {
				durumuKontrolEt();
			}
		});
		return () => abonelik?.remove?.();
	}, [durumuKontrolEt]);

	const handlePlatformSelect = async (platform) => {
		// Devrede kaynak SEÇİLEMEZ. TVPressable `disabled` zaten dokunmayı
		// engelliyor; bu kapı, `disabled`'ı yok sayan platformlar (Web/TV)
		// için güvenlik ağıdır.
		if (devredeMi(platform)) {
			return;
		}

		const id = platform?.id || platform?.name;
		setSelectedPlatformId(id);
		await saveSelectedPlatform(platform);

		if (onSelectPlatform) {
			onSelectPlatform(platform);
		}
	};

	const handleSelectRandom = async () => {
		// Devrede kaynaklar rastgele seçime DAHİL EDİLMEZ — aksi halde
		// kullanıcı kalıcı olarak bozuk bir kaynağa düşer.
		const kullanilabilirler = platformList.filter((p) => !devredeMi(p));

		if (kullanilabilirler.length === 0) {
			handlePlatformSelect(NONE_PLATFORM);
			return;
		}
		const randomIndex = Math.floor(Math.random() * kullanilabilirler.length);
		const chosen = kullanilabilirler[randomIndex];
		handlePlatformSelect(chosen);
	};

	// Filtered platforms
	const filteredPlatforms = useMemo(() => {
		let result = platformList;

		if (activeFilter === "movie") {
			result = result.filter(
				(p) =>
					p.name.toLowerCase().includes("film") ||
					p.name.toLowerCase().includes("sinema") ||
					(p.categories &&
						p.categories.some((c) =>
							(typeof c === "string" ? c : c.name || "")
								.toLowerCase()
								.includes("film"),
						)),
			);
		} else if (activeFilter === "series") {
			result = result.filter(
				(p) =>
					p.name.toLowerCase().includes("dizi") ||
					(p.categories &&
						p.categories.some((c) =>
							(typeof c === "string" ? c : c.name || "")
								.toLowerCase()
								.includes("dizi"),
						)),
			);
		} else if (activeFilter === "anime") {
			result = result.filter(
				(p) =>
					p.name.toLowerCase().includes("anime") ||
					(p.categories &&
						p.categories.some((c) =>
							(typeof c === "string" ? c : c.name || "")
								.toLowerCase()
								.includes("anime"),
						)),
			);
		}

		if (searchQuery.trim().length > 0) {
			const q = searchQuery.toLowerCase().trim();
			result = result.filter((p) => p.name.toLowerCase().includes(q));
		}

		return result;
	}, [platformList, activeFilter, searchQuery]);

	const isNoneSelected =
		selectedPlatformId === "none" || selectedPlatformId === "None";

	/*
	 * Kullanıcıya gösterilecek devre özeti.
	 *
	 * Kayan mesaj (toast) kullanmıyoruz: bu liste bir BottomSheet içinde ve
	 * modal içinde toast çakışabilir. Ayrıca mesaj kartların ÜZERİNDE
	 * zaten rozet olarak görünüyor; bant yalnız "kaç kaynak kapalı" bilgisini
	 * özetliyor.
	 */
	const devredeOlanlar = useMemo(
		() => filteredPlatforms.filter((p) => devredeMi(p)),
		[filteredPlatforms],
	);

	const seciliDevredeMi = useMemo(() => {
		if (isNoneSelected) return false;
		const secili = platformList.find(
			(p) =>
				(p?.id && p.id === selectedPlatformId) ||
				(p?.name && p.name === selectedPlatformId),
		);
		return devredeMi(secili);
	}, [platformList, selectedPlatformId, isNoneSelected]);

	return (
		<View style={styles.container}>
			{/* Modal Header */}
			<View style={styles.header}>
				<Text style={styles.headerTitle}>Platform / Eklenti Seçimi</Text>
				<Text style={styles.headerSubtitle}>
					İçeriklerin getirileceği kaynağı belirleyin
				</Text>
			</View>

			{/* Seçili kaynak devreye girdiyse uyarı — içerik yüklenemez */}
			{seciliDevredeMi ? (
				<View style={styles.alertBox}>
					<Ionicons
						name="warning"
						size={16}
						color="#f59e0b"
						style={styles.alertIcon}
					/>
					<Text style={styles.alertText}>
						Seçili kaynak geçici olarak kullanım dışı. İçerik
						güncellenemeyebilir; başka bir kaynak seçin.
					</Text>
				</View>
			) : null}

			{/* Devre özeti */}
			{devredeOlanlar.length > 0 ? (
				<View style={styles.infoBox}>
					<Ionicons
						name="information-circle"
						size={16}
						color="#60a5fa"
						style={styles.alertIcon}
					/>
					<Text style={styles.infoText}>
						{devredeOlanlar.length} kaynak geçici olarak kullanım dışı
						(devam ediyor). Kendiliğinden geri gelirler.
					</Text>
				</View>
			) : null}

			{/* Search Input */}
			<View style={styles.searchBox}>
				<Ionicons name="search" size={17} color="#9ca3af" />
				<TextInput
					style={styles.searchInput}
					placeholder="Eklenti ara..."
					placeholderTextColor="#6b7280"
					value={searchQuery}
					onChangeText={setSearchQuery}
					autoCapitalize="none"
					autoCorrect={false}
				/>
				{searchQuery.length > 0 && (
					<TVPressable
						onPress={() => setSearchQuery("")}
						focusedStyle={styles.searchClearFocused}>
						<Ionicons
							name="close-circle"
							size={16}
							color="#9ca3af"
						/>
					</TVPressable>
				)}
			</View>

			{/* Filter Pills */}
			<View style={styles.filterRow}>
				{[
					{ id: "all", label: "Tümü" },
					{ id: "movie", label: "Filmler" },
					{ id: "series", label: "Diziler" },
					{ id: "anime", label: "Animeler" },
				].map((f) => (
					<TVPressable
						key={f.id}
						style={[
							styles.filterPill,
							activeFilter === f.id && styles.filterPillActive,
						]}
						focusedStyle={styles.filterPillFocused}
						onPress={() => setActiveFilter(f.id)}
						activeOpacity={0.7}>
						<Text
							style={[
								styles.filterPillText,
								activeFilter === f.id &&
									styles.filterPillTextActive,
							]}>
							{f.label}
						</Text>
					</TVPressable>
				))}
			</View>

			{/* List */}
			{loading ? (
				<View style={styles.loadingContainer}>
					<ActivityIndicator size="small" color="#2563EB" />
				</View>
			) : (
				<ScrollView
					style={styles.scrollView}
					contentContainerStyle={styles.scrollContent}
					showsVerticalScrollIndicator={false}>
					{/* 1. None Option */}
					<TVPressable
						style={[
							styles.platformCard,
							isNoneSelected && styles.platformCardActive,
						]}
						focusedStyle={styles.platformCardFocused}
						onPress={() => handlePlatformSelect(NONE_PLATFORM)}
						activeOpacity={0.7}>
						<View
							style={[
								styles.iconContainer,
								{ backgroundColor: "rgba(107, 114, 128, 0.2)" },
							]}>
							<Ionicons
								name="cloud-offline"
								size={20}
								color="#9ca3af"
							/>
						</View>
						<View style={styles.platformDetails}>
							<Text style={styles.platformName}>
								None (Hiçbiri)
							</Text>
							<Text style={styles.platformDesc}>
								Sadece indirilen ögeleri göster (Çevrimdışı)
							</Text>
						</View>
						<View style={styles.radioWrapper}>
							{isNoneSelected ? (
								<Ionicons
									name="checkmark-circle"
									size={22}
									color="#2563EB"
								/>
							) : (
								<View style={styles.radioCircle} />
							)}
						</View>
					</TVPressable>

					{/* 2. Random Option */}
					<TVPressable
						style={styles.platformCard}
						focusedStyle={styles.platformCardFocused}
						onPress={handleSelectRandom}
						activeOpacity={0.7}>
						<View
							style={[
								styles.iconContainer,
								{ backgroundColor: "rgba(37, 99, 235, 0.15)" },
							]}>
							<Ionicons
								name="shuffle"
								size={20}
								color="#38bdf8"
							/>
						</View>
						<View style={styles.platformDetails}>
							<Text style={styles.platformName}>
								Random (Rastgele)
							</Text>
							<Text style={styles.platformDesc}>
								Aktif eklentiler arasından rastgele birini seç
							</Text>
						</View>
						<Ionicons
							name="chevron-forward"
							size={18}
							color="#6b7280"
						/>
					</TVPressable>

					{/* Section Divider */}
					<View style={styles.divider}>
						<Text style={styles.dividerText}>
							Mevcut Eklentiler ({filteredPlatforms.length})
						</Text>
					</View>

					{/* 3. Platform List */}
					{filteredPlatforms.map((platform, index) => {
						const key = platform.id || platform.name || index;
						const isSelected =
							!isNoneSelected &&
							(selectedPlatformId === platform.id ||
								selectedPlatformId === platform.name);
						const kapali = devredeMi(platform);

						return (
							<TVPressable
								key={key}
								// Devrede kaynak: dokunulamaz + TV kumandasında ODAK
								// ALINAMAZ (TVPressable `focusable={!disabled}`).
								disabled={kapali}
								style={[
									styles.platformCard,
									isSelected && !kapali && styles.platformCardActive,
									kapali && styles.platformCardDisabled,
								]}
								focusedStyle={
									kapali ? undefined : styles.platformCardFocused
								}
								onPress={() => handlePlatformSelect(platform)}
								activeOpacity={0.7}>
								{platform.favicon ? (
									<Image
										source={{ uri: platform.favicon }}
										style={[
											styles.platformImage,
											kapali && styles.platformImageDisabled,
										]}
										contentFit="contain"
										transition={0}
										recyclingKey={platform.favicon}
										cachePolicy="memory-disk"
									/>
								) : (
									<View style={styles.iconContainer}>
										<Text style={styles.flagEmoji}>🇹🇷</Text>
									</View>
								)}

								<View style={styles.platformDetails}>
									<View style={styles.titleRow}>
										<Text
											style={[
												styles.platformName,
												kapali && styles.platformNameDisabled,
											]}
											numberOfLines={1}>
											{platform.name}
										</Text>
										{platform.language && (
											<View style={styles.langBadge}>
												<Text style={styles.langText}>
													{platform.language.toUpperCase()}
												</Text>
											</View>
										)}
										{/* Rozet — yalnız devrede olanlarda */}
										{kapali ? (
											<View style={styles.disabledBadge}>
												<Text style={styles.disabledBadgeText}>
													Kullanım dışı
												</Text>
											</View>
										) : null}
									</View>
									<Text
										style={styles.platformDesc}
										numberOfLines={1}>
										{platform.description ||
											(platform.categories
												? `${platform.categories.length} Kategori`
												: "Aktif Eklenti")}
									</Text>
									{/* Sebep — rozeti tek başına yetersiz */}
									{kapali ? (
										<Text
											style={styles.disabledReason}
											numberOfLines={2}>
											{platform.son_hata ||
												platform.durum_mesaji ||
												"Siteye ulaşılamıyor."}
										</Text>
									) : null}
								</View>

								<View style={styles.radioWrapper}>
									{kapali ? (
										/* Seçilemeyeceği için onay işareti YANLIŞ
										   yönlendirme yapmamalı; durumu temsil eden
										   bir ikon gösteriyoruz. */
										<Ionicons
											name="ban"
											size={20}
											color="#6b7280"
										/>
									) : isSelected ? (
										<Ionicons
											name="checkmark-circle"
											size={22}
											color="#2563EB"
										/>
									) : (
										<View style={styles.radioCircle} />
									)}
								</View>
							</TVPressable>
						);
					})}

					{filteredPlatforms.length === 0 && (
						<View style={styles.emptyContainer}>
							<Text style={styles.emptyText}>
								Eşleşen eklenti bulunamadı.
							</Text>
						</View>
					)}
				</ScrollView>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		paddingHorizontal: 16,
		paddingTop: 8,
		paddingBottom: 24,
	},
	header: {
		marginBottom: 14,
	},
	headerTitle: {
		color: "#ffffff",
		fontSize: 18,
		fontWeight: "700",
		letterSpacing: -0.3,
	},
	headerSubtitle: {
		color: "#9ca3af",
		fontSize: 12,
		marginTop: 3,
	},
	searchBox: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: "#161b22",
		borderRadius: 12,
		paddingHorizontal: 12,
		height: 40,
		borderWidth: 1,
		borderColor: "rgba(255, 255, 255, 0.08)",
		marginBottom: 12,
		gap: 8,
	},
	searchInput: {
		flex: 1,
		color: "#ffffff",
		fontSize: 13,
	},
	filterRow: {
		flexDirection: "row",
		gap: 8,
		marginBottom: 14,
	},
	filterPill: {
		paddingHorizontal: 14,
		paddingVertical: 5,
		borderRadius: 14,
		backgroundColor: "#161b22",
		borderWidth: 1,
		borderColor: "rgba(255, 255, 255, 0.06)",
	},
	filterPillActive: {
		backgroundColor: "#2563EB",
		borderColor: "#2563EB",
	},
	filterPillText: {
		color: "#9ca3af",
		fontSize: 12,
		fontWeight: "500",
	},
	filterPillTextActive: {
		color: "#ffffff",
		fontWeight: "700",
	},
	scrollView: {
		flex: 1,
	},
	scrollContent: {
		paddingBottom: 20,
		gap: 8,
	},
	platformCard: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: "#161b22",
		borderRadius: 12,
		padding: 12,
		borderWidth: 1,
		borderColor: "rgba(255, 255, 255, 0.06)",
		gap: 12,
	},
	platformCardActive: {
		borderColor: "#2563EB",
		backgroundColor: "rgba(37, 99, 235, 0.12)",
	},
	iconContainer: {
		width: 38,
		height: 38,
		borderRadius: 10,
		backgroundColor: "#21262d",
		justifyContent: "center",
		alignItems: "center",
	},
	flagEmoji: {
		fontSize: 18,
	},
	platformImage: {
		width: 38,
		height: 38,
		borderRadius: 10,
		overflow: "hidden",
		backgroundColor: "#21262d",
	},
	platformDetails: {
		flex: 1,
	},
	titleRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
	},
	platformName: {
		color: "#ffffff",
		fontSize: 14,
		fontWeight: "600",
	},
	langBadge: {
		backgroundColor: "rgba(255, 255, 255, 0.1)",
		paddingHorizontal: 5,
		paddingVertical: 1,
		borderRadius: 4,
	},
	langText: {
		color: "#9ca3af",
		fontSize: 9,
		fontWeight: "700",
	},
	platformDesc: {
		color: "#9ca3af",
		fontSize: 11,
		marginTop: 2,
	},
	radioWrapper: {
		paddingLeft: 6,
	},
	radioCircle: {
		width: 20,
		height: 20,
		borderRadius: 10,
		borderWidth: 2,
		borderColor: "#4b5563",
	},
	divider: {
		marginTop: 8,
		marginBottom: 4,
	},
	dividerText: {
		color: "#6b7280",
		fontSize: 11,
		fontWeight: "600",
		textTransform: "uppercase",
		letterSpacing: 0.5,
	},
	loadingContainer: {
		padding: 40,
		alignItems: "center",
		justifyContent: "center",
	},
	emptyContainer: {
		padding: 30,
		alignItems: "center",
	},
	emptyText: {
		color: "#6b7280",
		fontSize: 13,
	},
	filterPillFocused: {
		borderWidth: 1.5,
		borderColor: "#E50914",
		backgroundColor: "rgba(229, 9, 20, 0.2)",
		transform: [{ scale: 1.05 }],
	},
	platformCardFocused: {
		borderWidth: 1.5,
		borderColor: "#E50914",
		backgroundColor: "rgba(229, 9, 20, 0.15)",
		transform: [{ scale: 1.02 }],
	},
	searchClearFocused: {
		backgroundColor: "rgba(229, 9, 20, 0.2)",
		borderRadius: 10,
	},

	/*
	 * ── Devre dışı (kullanım dışı) stilleri ──
	 *
	 * Palet mevcut koyu tema ile aynı: kart #161b22, kenarlık
	 * rgba(255,255,255,0.06), ikincil metin #9ca3af.
	 *
	 * `opacity` kartın TAMAMINA uygulanmaz — rozet ve sebep metni de soluk
	 * görünürdü. Bunun yerine metin/renk ayrı ayrı soluklaştırılır, böylece
	 * rozet okunabilir kalır.
	 */
	platformCardDisabled: {
		backgroundColor: "#12161c",
		borderColor: "rgba(255, 255, 255, 0.03)",
	},
	platformImageDisabled: {
		opacity: 0.4,
	},
	platformNameDisabled: {
		color: "#6b7280",
	},
	disabledBadge: {
		backgroundColor: "rgba(239, 68, 68, 0.15)",
		borderWidth: 1,
		borderColor: "rgba(239, 68, 68, 0.4)",
		paddingHorizontal: 6,
		paddingVertical: 2,
		borderRadius: 4,
	},
	disabledBadgeText: {
		color: "#f87171",
		fontSize: 9,
		fontWeight: "700",
	},
	disabledReason: {
		color: "#6b7280",
		fontSize: 10,
		marginTop: 3,
		lineHeight: 13,
	},
	alertBox: {
		flexDirection: "row",
		alignItems: "flex-start",
		backgroundColor: "rgba(245, 158, 11, 0.12)",
		borderWidth: 1,
		borderColor: "rgba(245, 158, 11, 0.35)",
		borderRadius: 10,
		padding: 10,
		marginBottom: 12,
		gap: 8,
	},
	alertIcon: {
		marginTop: 1,
	},
	alertText: {
		flex: 1,
		color: "#fbbf24",
		fontSize: 11,
		lineHeight: 15,
	},
	infoBox: {
		flexDirection: "row",
		alignItems: "flex-start",
		backgroundColor: "rgba(37, 99, 235, 0.10)",
		borderWidth: 1,
		borderColor: "rgba(96, 165, 250, 0.25)",
		borderRadius: 10,
		padding: 10,
		marginBottom: 12,
		gap: 8,
	},
	infoText: {
		flex: 1,
		color: "#93c5fd",
		fontSize: 11,
		lineHeight: 15,
	},
});
