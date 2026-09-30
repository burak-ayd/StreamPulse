import { useThemeContext } from "@context/ThemeContext";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
	ActivityIndicator,
	Alert,
	Modal,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from "react-native";
import { getDownloads, saveDownloadItem } from "@/utils/storage";

export default function SeasonsSection({
	seasons,
	episodes,
	onEpisodePress,
	loading = false,
	initialSeason,
	seriesTitle = "",
	posterUrl = null,
	content = null,
}) {
	const { colors, theme } = useThemeContext();
	const router = useRouter();

	const [isSeasonModalOpen, setIsSeasonModalOpen] = useState(false);
	const [sortOrder, setSortOrder] = useState("asc"); // 'asc' (1->N) | 'desc' (N->1)
	const [downloadQueueMap, setDownloadQueueMap] = useState({});

	// Sezon ve bölüm verilerini normalize et
	const normalizedSeasons = useMemo(() => {
		if (!seasons && !episodes) return null;

		const result = {};

		// 1. seasons nesne ise: {"1": [...], "2": [...]}
		if (seasons && typeof seasons === "object" && !Array.isArray(seasons)) {
			Object.entries(seasons).forEach(([seasonKey, epList]) => {
				if (Array.isArray(epList) && epList.length > 0) {
					result[seasonKey] = epList;
				}
			});
		}
		// 2. episodes düz bir dizi ise
		else if (Array.isArray(episodes) && episodes.length > 0) {
			episodes.forEach((ep) => {
				const sNum = String(ep.season || ep.season_number || "1");
				if (!result[sNum]) result[sNum] = [];
				result[sNum].push(ep);
			});
		}
		// 3. seasons bir dizi ise
		else if (Array.isArray(seasons) && seasons.length > 0) {
			seasons.forEach((item, idx) => {
				if (Array.isArray(item.episodes)) {
					result[String(item.season || idx + 1)] = item.episodes;
				} else if (item.season || item.episode) {
					const sNum = String(item.season || "1");
					if (!result[sNum]) result[sNum] = [];
					result[sNum].push(item);
				}
			});
		}

		return Object.keys(result).length > 0 ? result : null;
	}, [seasons, episodes]);

	// Mevcut sezon numaraları (sıralı)
	const seasonKeys = useMemo(() => {
		if (!normalizedSeasons) return [];
		return Object.keys(normalizedSeasons).sort((a, b) => {
			const numA = parseInt(a, 10);
			const numB = parseInt(b, 10);
			if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
			return a.localeCompare(b);
		});
	}, [normalizedSeasons]);

	const [selectedSeason, setSelectedSeason] = useState(
		initialSeason ? String(initialSeason) : seasonKeys[0] || "1",
	);

	useEffect(() => {
		if (initialSeason && seasonKeys.includes(String(initialSeason))) {
			setSelectedSeason(String(initialSeason));
		} else if (seasonKeys.length > 0 && !seasonKeys.includes(selectedSeason)) {
			setSelectedSeason(seasonKeys[0]);
		}
	}, [initialSeason, seasonKeys, selectedSeason]);

	// Mevcut indirmeleri kontrol et
	const syncDownloads = useCallback(async () => {
		try {
			const downloads = await getDownloads();
			const map = {};
			(downloads || []).forEach((item) => {
				if (item.id) map[item.id] = true;
				if (item.url) map[item.url] = true;
			});
			setDownloadQueueMap(map);
		} catch (e) {
			console.warn("İndirmeler kontrol edilemedi:", e);
		}
	}, []);

	useEffect(() => {
		syncDownloads();
	}, [syncDownloads]);

	// Seçili sezonun bölümleri (sıralama filtresi uygulanmış)
	const sortedEpisodes = useMemo(() => {
		if (!normalizedSeasons) return [];
		const rawList =
			normalizedSeasons[selectedSeason] ||
			normalizedSeasons[seasonKeys[0]] ||
			[];

		const listCopy = [...rawList];
		listCopy.sort((a, b) => {
			const numA = parseInt(a.episode || a.episode_number || 0, 10);
			const numB = parseInt(b.episode || b.episode_number || 0, 10);
			return sortOrder === "asc" ? numA - numB : numB - numA;
		});

		return listCopy;
	}, [normalizedSeasons, selectedSeason, seasonKeys, sortOrder]);

	// Tekil bölüm indirme hazırlığı
	const handleDownloadEpisode = async (ep, epNumber, epTitle) => {
		const downloadId =
			ep.url || `${seriesTitle || "dizi"}-S${selectedSeason}E${epNumber}`;
		const isAlreadyQueued = Boolean(
			downloadQueueMap[downloadId] ||
				(ep.url && downloadQueueMap[ep.url]),
		);

		if (isAlreadyQueued) {
			Alert.alert("İndirme", `"${epTitle}" zaten indirme listesinde.`);
			return;
		}

		try {
			const downloadItem = {
				id: downloadId,
				title: `${seriesTitle} - ${selectedSeason}. Sezon ${epNumber}. Bölüm`,
				url: ep.url,
				poster: ep.poster || posterUrl,
				type: "series",
				seriesTitle: seriesTitle || content?.title || "Dizi",
				season: selectedSeason,
				episode: epNumber,
				episodeTitle: epTitle,
				createdAt: new Date().toISOString(),
				status: "pending", // İleride eklenecek indirme motoru için hazır durum
			};

			await saveDownloadItem(downloadItem);
			setDownloadQueueMap((prev) => ({
				...prev,
				[downloadId]: true,
				...(ep.url ? { [ep.url]: true } : {}),
			}));

			Alert.alert(
				"İndirme Hazırlığı",
				`"${epTitle}" indirme sırasına alındı.\n(İndirme özelliği hazırlandığında otomatik olarak indirilecektir)`,
			);
		} catch (error) {
			console.error("İndirme kaydı hatası:", error);
			Alert.alert("Hata", "İndirme sırasına eklenemedi.");
		}
	};

	// Tüm sezonu indirme hazırlığı
	const handleDownloadSeason = async () => {
		if (sortedEpisodes.length === 0) return;

		Alert.alert(
			"Sezonu İndir",
			`${selectedSeason}. Sezondaki toplam ${sortedEpisodes.length} bölüm indirme kuyruğuna eklensin mi?`,
			[
				{ text: "Vazgeç", style: "cancel" },
				{
					text: "Tümünü Ekle",
					onPress: async () => {
						try {
							const newMap = { ...downloadQueueMap };
							for (let i = 0; i < sortedEpisodes.length; i++) {
								const ep = sortedEpisodes[i];
								const epNumber =
									ep.episode || ep.episode_number || i + 1;
								const epTitle =
									ep.title && ep.title.trim() !== ""
										? ep.title.trim()
										: `${selectedSeason}. Sezon ${epNumber}. Bölüm`;
								const downloadId =
									ep.url ||
									`${seriesTitle || "dizi"}-S${selectedSeason}E${epNumber}`;

								const downloadItem = {
									id: downloadId,
									title: `${seriesTitle} - ${selectedSeason}. Sezon ${epNumber}. Bölüm`,
									url: ep.url,
									poster: ep.poster || posterUrl,
									type: "series",
									seriesTitle:
										seriesTitle || content?.title || "Dizi",
									season: selectedSeason,
									episode: epNumber,
									episodeTitle: epTitle,
									createdAt: new Date().toISOString(),
									status: "pending",
								};

								await saveDownloadItem(downloadItem);
								newMap[downloadId] = true;
								if (ep.url) newMap[ep.url] = true;
							}

							setDownloadQueueMap(newMap);
							Alert.alert(
								"İndirme Hazırlığı Tamamlandı",
								`${selectedSeason}. Sezondaki ${sortedEpisodes.length} bölüm indirme listesine eklendi.`,
							);
						} catch (error) {
							console.error("Toplu indirme hatası:", error);
							Alert.alert("Hata", "Sezon bölümleri eklenirken hata oluştu.");
						}
					},
				},
			],
		);
	};

	// Bölüme tıklanınca oynat
	const handleEpisodeClick = (ep, index) => {
		if (onEpisodePress) {
			onEpisodePress(ep);
			return;
		}

		if (ep.url) {
			const epNumber = ep.episode || ep.episode_number || index + 1;
			router.push({
				pathname: "/player",
				params: {
					url: ep.url,
					title: seriesTitle || ep.title || "Dizi",
					subtitle: `${selectedSeason}. Sezon ${epNumber}. Bölüm${ep.title ? ` - ${ep.title}` : ""}`,
					poster: ep.poster || posterUrl || null,
					contentType: "series",
					season: selectedSeason,
					episode: epNumber,
				},
			});
		}
	};

	if (loading && (!normalizedSeasons || seasonKeys.length === 0)) {
		return (
			<View style={styles.container}>
				<View
					style={[
						styles.loadingBox,
						{
							backgroundColor: colors.cardBg,
							borderColor: colors.border,
						},
					]}>
					<ActivityIndicator size="small" color={colors.primary} />
					<Text
						style={[
							styles.loadingText,
							{ color: colors.textSecondary },
						]}>
						Bölümler yükleniyor...
					</Text>
				</View>
			</View>
		);
	}

	if (!normalizedSeasons || seasonKeys.length === 0) {
		return null;
	}

	return (
		<View style={styles.container}>
			{/* Kontrol Çubuğu (Sezon Dropdown, Bölüm Sıralama, Sezon İndir) */}
			<View style={styles.controlsBar}>
				{/* 1. Sezon Seçim Dropdown Butonu */}
				<TouchableOpacity
					style={[
						styles.seasonDropdownButton,
						{
							backgroundColor:
								theme === "dark" ? "#161B24" : "#ffffff",
							borderColor:
								theme === "dark" ? "#232A36" : "#E2E8F0",
						},
					]}
					onPress={() => setIsSeasonModalOpen(true)}
					activeOpacity={0.75}>
					<Text
						style={[
							styles.seasonDropdownText,
							{ color: colors.text },
						]}>
						Sezon {selectedSeason}
					</Text>
					<Ionicons
						name="chevron-down"
						size={15}
						color={colors.text}
						style={styles.dropdownChevron}
					/>
				</TouchableOpacity>

				{/* 2. Bölüm Sıralama Butonu (Bölüm ↑ / Bölüm ↓) */}
				<TouchableOpacity
					style={[
						styles.sortButton,
						{
							backgroundColor:
								theme === "dark" ? "#161B24" : "#ffffff",
							borderColor:
								theme === "dark" ? "#232A36" : "#E2E8F0",
						},
					]}
					onPress={() =>
						setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"))
					}
					activeOpacity={0.75}>
					<Text style={[styles.sortButtonText, { color: colors.text }]}>
						Bölüm {sortOrder === "asc" ? "↑" : "↓"}
					</Text>
				</TouchableOpacity>

				{/* 3. Sezon Bölüm Sayısı & Toplu İndir Butonu */}
				<TouchableOpacity
					style={styles.seasonDownloadButton}
					onPress={handleDownloadSeason}
					activeOpacity={0.7}
					hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
					<Ionicons
						name="download-outline"
						size={19}
						color={colors.primary}
					/>
					<Text
						style={[
							styles.seasonDownloadText,
							{ color: colors.text },
						]}>
						{sortedEpisodes.length} Bölüm
					</Text>
				</TouchableOpacity>
			</View>

			{/* Bölüm Listesi */}
			<View style={styles.episodesList}>
				{sortedEpisodes.map((ep, index) => {
					const epNumber = ep.episode || ep.episode_number || index + 1;
					const rawTitle = ep.title ? ep.title.trim() : "";
					// Ekran görüntüsündeki gibi: '1. 1. Bölüm' veya '1. Bölüm Adı'
					const epDisplayTitle = rawTitle
						? `${epNumber}. ${rawTitle}`
						: `${epNumber}. ${epNumber}. Bölüm`;

					const downloadId =
						ep.url ||
						`${seriesTitle || "dizi"}-S${selectedSeason}E${epNumber}`;
					const isQueued = Boolean(
						downloadQueueMap[downloadId] ||
							(ep.url && downloadQueueMap[ep.url]),
					);

					return (
						<TouchableOpacity
							key={ep.url || `${selectedSeason}-${epNumber}-${index}`}
							style={styles.episodeRow}
							onPress={() => handleEpisodeClick(ep, index)}
							activeOpacity={0.7}>
							{/* Sol: Play İkonu (Kırmızı Canlı Vurgu) */}
							<View style={styles.playIconContainer}>
								<Ionicons
									name="play"
									size={12}
									color={colors.primary}
								/>
							</View>

							{/* Orta: Bölüm Başlığı */}
							<View style={styles.episodeTitleContainer}>
								<Text
									style={[
										styles.episodeTitleText,
										{ color: colors.text },
									]}
									numberOfLines={1}>
									{epDisplayTitle}
								</Text>
							</View>

							{/* Sağ: İndir Butonu (Gelecek özellik için hazırlık) */}
							<TouchableOpacity
								style={styles.downloadButton}
								onPress={() =>
									handleDownloadEpisode(ep, epNumber, epDisplayTitle)
								}
								activeOpacity={0.6}
								hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
								<Ionicons
									name={
										isQueued
											? "checkmark-circle"
											: "download-outline"
									}
									size={21}
									color={isQueued ? "#10b981" : colors.textSecondary}
								/>
							</TouchableOpacity>
						</TouchableOpacity>
					);
				})}
			</View>

			{/* Sezon Seçici Modal (Açılır Menü / Bottom Sheet) */}
			<Modal
				visible={isSeasonModalOpen}
				transparent
				animationType="fade"
				onRequestClose={() => setIsSeasonModalOpen(false)}>
				<Pressable
					style={styles.modalOverlay}
					onPress={() => setIsSeasonModalOpen(false)}>
					<Pressable
						style={[
							styles.modalContent,
							{
								backgroundColor:
									theme === "dark" ? "#141414" : "#ffffff",
								borderColor: colors.border,
							},
						]}>
						{/* Modal Başlık */}
						<View style={styles.modalHeader}>
							<Text
								style={[
									styles.modalTitle,
									{ color: colors.text },
								]}>
								Sezon Seçin
							</Text>
							<TouchableOpacity
								onPress={() => setIsSeasonModalOpen(false)}
								hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
								<Ionicons
									name="close"
									size={22}
									color={colors.textSecondary}
								/>
							</TouchableOpacity>
						</View>

						{/* Sezonlar Listesi */}
						<ScrollView
							style={styles.modalList}
							showsVerticalScrollIndicator={false}>
							{seasonKeys.map((sKey) => {
								const isSelected = selectedSeason === sKey;
								const count =
									normalizedSeasons[sKey]?.length || 0;

								return (
									<TouchableOpacity
										key={sKey}
										style={[
											styles.modalSeasonItem,
											isSelected && {
												backgroundColor: `${colors.primary}22`,
											},
										]}
										onPress={() => {
											setSelectedSeason(sKey);
											setIsSeasonModalOpen(false);
										}}
										activeOpacity={0.7}>
										<View style={styles.modalSeasonLeft}>
											<Ionicons
												name="albums-outline"
												size={18}
												color={
													isSelected
														? colors.primary
														: colors.textSecondary
												}
											/>
											<Text
												style={[
													styles.modalSeasonName,
													{
														color: isSelected
															? colors.primary
															: colors.text,
														fontWeight: isSelected
															? "700"
															: "500",
													},
												]}>
												Sezon {sKey}
											</Text>
											<Text
												style={[
													styles.modalSeasonCount,
													{
														color: colors.textSecondary,
													},
												]}>
												({count} Bölüm)
											</Text>
										</View>

										{isSelected && (
											<Ionicons
												name="checkmark"
												size={20}
												color={colors.primary}
											/>
										)}
									</TouchableOpacity>
								);
							})}
						</ScrollView>
					</Pressable>
				</Pressable>
			</Modal>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		marginBottom: 24,
	},
	/* Kontrol Çubuğu (Ekran görüntüsündeki gibi: Sezon 1 v | Bölüm ^ | 10 Bölüm) */
	controlsBar: {
		flexDirection: "row",
		alignItems: "center",
		marginBottom: 16,
		gap: 10,
	},
	seasonDropdownButton: {
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: 14,
		paddingVertical: 9,
		borderRadius: 10,
		borderWidth: 1,
		gap: 6,
	},
	seasonDropdownText: {
		fontSize: 13,
		fontWeight: "700",
		letterSpacing: -0.2,
	},
	dropdownChevron: {
		marginTop: 1,
	},
	sortButton: {
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: 12,
		paddingVertical: 9,
		borderRadius: 10,
		borderWidth: 1,
	},
	sortButtonText: {
		fontSize: 13,
		fontWeight: "700",
		letterSpacing: -0.2,
	},
	seasonDownloadButton: {
		flexDirection: "row",
		alignItems: "center",
		marginLeft: "auto",
		gap: 6,
		paddingVertical: 6,
		paddingHorizontal: 6,
	},
	seasonDownloadText: {
		fontSize: 13,
		fontWeight: "600",
	},
	/* Bölüm Listesi (Minimalist, tam ekran görüntüsü stili) */
	episodesList: {
		gap: 4,
	},
	episodeRow: {
		flexDirection: "row",
		alignItems: "center",
		paddingVertical: 14,
		paddingHorizontal: 4,
	},
	playIconContainer: {
		width: 20,
		alignItems: "flex-start",
		justifyContent: "center",
		marginRight: 10,
	},
	episodeTitleContainer: {
		flex: 1,
		justifyContent: "center",
	},
	episodeTitleText: {
		fontSize: 14,
		fontWeight: "500",
		letterSpacing: -0.2,
	},
	downloadButton: {
		paddingLeft: 12,
		paddingRight: 4,
		justifyContent: "center",
		alignItems: "center",
	},
	/* Modal (Dropdown Açılır Menü) */
	modalOverlay: {
		flex: 1,
		backgroundColor: "rgba(0, 0, 0, 0.65)",
		justifyContent: "center",
		alignItems: "center",
		padding: 24,
	},
	modalContent: {
		width: "100%",
		maxHeight: 380,
		borderRadius: 16,
		borderWidth: 1,
		padding: 16,
	},
	modalHeader: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingBottom: 12,
		borderBottomWidth: StyleSheet.hairlineWidth,
		borderBottomColor: "rgba(100, 116, 139, 0.2)",
		marginBottom: 8,
	},
	modalTitle: {
		fontSize: 16,
		fontWeight: "700",
	},
	modalList: {
		maxHeight: 280,
	},
	modalSeasonItem: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingVertical: 12,
		paddingHorizontal: 12,
		borderRadius: 10,
		marginVertical: 2,
	},
	modalSeasonLeft: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
	},
	modalSeasonName: {
		fontSize: 15,
	},
	modalSeasonCount: {
		fontSize: 13,
	},
	loadingBox: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		paddingVertical: 18,
		borderRadius: 12,
		borderWidth: 1,
		gap: 10,
	},
	loadingText: {
		fontSize: 14,
		fontWeight: "500",
	},
});
