import TVPressable from "@components/common/TVPressable";
import { useThemeContext } from "@/context/ThemeContext";
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
	View,
} from "react-native";
import { getDownloads, saveDownloadItem } from "@/utils/storage";
import { formatTime } from "@/utils/formatters";

/**
 * Format episode duration to Turkish string (e.g., "2 saat 21 dakika" or "45 dakika")
 */
function getEpisodeDurationTurkish(ep, epProgress, fallbackMinutes) {
	if (ep?.duration && typeof ep.duration === "string") {
		if (
			ep.duration.includes("saat") ||
			ep.duration.includes("dakika") ||
			ep.duration.includes("dk")
		) {
			return ep.duration;
		}
	}

	const raw =
		ep?.duration ||
		ep?.runtime ||
		ep?.time ||
		epProgress?.duration ||
		(fallbackMinutes ? fallbackMinutes * 60 : null);

	if (!raw) return null;

	if (typeof raw === "number") {
		const totalSecs = raw > 300 ? raw : raw * 60;
		const hours = Math.floor(totalSecs / 3600);
		const mins = Math.floor((totalSecs % 3600) / 60);
		if (hours > 0) {
			return `${hours} saat ${mins < 10 ? "0" : ""}${mins} dakika`;
		}
		return `${mins} dakika`;
	}

	if (typeof raw === "string") {
		if (raw.includes(":")) {
			const parts = raw.split(":").map(Number);
			if (parts.length === 3) {
				const hours = parts[0];
				const mins = parts[1];
				if (hours > 0) {
					return `${hours} saat ${mins < 10 ? "0" : ""}${mins} dakika`;
				}
				return `${mins} dakika`;
			} else if (parts.length === 2) {
				return `${parts[0]} dakika`;
			}
		}
	}

	return null;
}

export default function SeasonsSection({
	seasons,
	episodes,
	onEpisodePress,
	loading = false,
	initialSeason,
	selectedSeason: controlledSelectedSeason,
	onSeasonChange,
	seriesTitle = "",
	posterUrl = null,
	content = null,
	episodesProgress = {},
	totalEpisodes = 0,
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

	const isControlled =
		controlledSelectedSeason !== undefined &&
		controlledSelectedSeason !== null;

	const [internalSelectedSeason, setInternalSelectedSeason] = useState(
		initialSeason ? String(initialSeason) : "1",
	);

	const selectedSeason = useMemo(() => {
		if (isControlled) return String(controlledSelectedSeason);
		if (seasonKeys.includes(internalSelectedSeason)) return internalSelectedSeason;
		if (initialSeason && seasonKeys.includes(String(initialSeason))) return String(initialSeason);
		return seasonKeys[0] || "1";
	}, [isControlled, controlledSelectedSeason, seasonKeys, internalSelectedSeason, initialSeason]);

	const handleSeasonSelect = useCallback(
		(sKey) => {
			const sKeyStr = String(sKey);
			setInternalSelectedSeason(sKeyStr);
			if (onSeasonChange) {
				onSeasonChange(sKeyStr);
			}
		},
		[onSeasonChange],
	);

	// Mevcut indirmeleri kontrol et
	useEffect(() => {
		let isMounted = true;
		getDownloads()
			.then((downloads) => {
				if (!isMounted) return;
				const map = {};
				(downloads || []).forEach((item) => {
					if (item.id) map[item.id] = true;
					if (item.url) map[item.url] = true;
				});
				setDownloadQueueMap(map);
			})
			.catch((e) => {
				console.warn("İndirmeler kontrol edilemedi:", e);
			});
		return () => {
			isMounted = false;
		};
	}, []);

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
			const epKey = `s${selectedSeason}_e${epNumber}`;
			const epProgress =
				episodesProgress?.[ep.url] ||
				episodesProgress?.[epKey] ||
				(ep.id && episodesProgress?.[ep.id]);

			// Sonraki bölümü tespit et (eğer varsa)
			const nextEp = sortedEpisodes[index + 1] || null;

			router.push({
				pathname: "/player",
				params: {
					url: ep.url,
					title: seriesTitle || content?.title || ep.title || "Dizi",
					subtitle: `${selectedSeason}. Sezon ${epNumber}. Bölüm${ep.title ? ` - ${ep.title}` : ""}`,
					poster: ep.poster || posterUrl || null,
					type: "episode",
					id:
						ep.id ||
						ep.url ||
						`${content?.id || content?.url || "series"}_s${selectedSeason}_e${epNumber}`,
					plugin: content?.plugin,
					seriesId: content?.id || content?.url,
					seriesTitle: seriesTitle || content?.title || "Dizi",
					season: selectedSeason,
					episode: epNumber,
					episodeTitle: ep.title || `Bölüm ${epNumber}`,
					totalEpisodes: totalEpisodes || undefined,
					currentTime:
						epProgress?.status === "in_progress"
							? epProgress.currentTime
							: 0,
					nextEpisode: nextEp
						? JSON.stringify({
								id: nextEp.id || nextEp.url,
								url: nextEp.url,
								title: nextEp.title,
								season: selectedSeason,
								episode:
									nextEp.episode ||
									nextEp.episode_number ||
									epNumber + 1,
								poster: nextEp.poster || posterUrl,
							})
						: undefined,
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
				<TVPressable
					style={({ focused }) => [
						styles.seasonDropdownButton,
						{
							backgroundColor:
								theme === "dark" ? "#161B24" : "#ffffff",
							borderColor:
								theme === "dark" ? "#232A36" : "#E2E8F0",
						},
						focused && styles.controlsButtonFocused,
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
				</TVPressable>

				{/* 2. Bölüm Sıralama Butonu (Bölüm ↑ / Bölüm ↓) */}
				<TVPressable
					style={({ focused }) => [
						styles.sortButton,
						{
							backgroundColor:
								theme === "dark" ? "#161B24" : "#ffffff",
							borderColor:
								theme === "dark" ? "#232A36" : "#E2E8F0",
						},
						focused && styles.controlsButtonFocused,
					]}
					onPress={() =>
						setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"))
					}
					activeOpacity={0.75}>
					<Text style={[styles.sortButtonText, { color: colors.text }]}>
						Bölüm {sortOrder === "asc" ? "↑" : "↓"}
					</Text>
				</TVPressable>

				{/* 3. Sezon Bölüm Sayısı & Toplu İndir Butonu */}
				<TVPressable
					style={({ focused }) => [
						styles.seasonDownloadButton,
						focused && styles.controlsButtonFocused,
					]}
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
				</TVPressable>
			</View>

			{/* Bölüm Listesi */}
			<View style={styles.episodesList}>
{sortedEpisodes.map((ep, index) => {
					const epNumber = ep.episode || ep.episode_number || index + 1;
					const rawTitle = ep.title ? ep.title.trim() : "";
				/*
				 * Başlık biçimi: '<sezon>. <bölüm>. Bölüm' veya
				 * '<bölüm>. <bölüm adı>'.
				 *
				 * ⚠️ İlk sayı SEZON numarasıdır, bölüm numarası DEĞİL.
				 * Eskiden `${epNumber}. ${epNumber}. Bölüm` yazıyordu ve
				 * sezon 1'de iki sayı aynı olduğu için ("1. 1. Bölüm")
				 * hata fark edilmiyordu; sezon 1 bölüm 2 ekranda
				 * "2. 2. Bölüm" olarak görünüyordu — yani "2. sezon,
				 * 2. bölüm" yanlış izlenimi veriyordu. `selectedSeason`
				 * zaten bu satırda indirme kimliği için kullanılıyordu.
				 */
				const epDisplayTitle = rawTitle
					? `${epNumber}. ${rawTitle}`
					: `${selectedSeason}. ${epNumber}. Bölüm`;

					const downloadId =
						ep.url ||
						`${seriesTitle || "dizi"}-S${selectedSeason}E${epNumber}`;
					const isQueued = Boolean(
						downloadQueueMap[downloadId] ||
							(ep.url && downloadQueueMap[ep.url]),
					);

					const epKey = `s${selectedSeason}_e${epNumber}`;
					const epProgress =
						episodesProgress?.[ep.url] ||
						episodesProgress?.[epKey] ||
						(ep.id && episodesProgress?.[ep.id]);

					const isCompleted = epProgress?.status === "completed";
					const isInProgress = epProgress?.status === "in_progress";

					const isDark = theme === "dark";
					const epDurationFormatted = getEpisodeDurationTurkish(
						ep,
						epProgress,
						content?.runtime_minutes,
					);

					return (
						<TVPressable
							key={ep.url || `${selectedSeason}-${epNumber}-${index}`}
							style={({ focused }) => [
								styles.episodeCard,
								{
									backgroundColor: isDark
										? isInProgress
											? "#131823"
											: "#10141D"
										: isInProgress
											? "#fff5f5"
											: "#ffffff",
									borderColor: isInProgress
										? "rgba(229, 9, 20, 0.55)"
										: isDark
											? "rgba(255, 255, 255, 0.08)"
											: "rgba(0, 0, 0, 0.08)",
									borderWidth: isInProgress ? 1.5 : 1,
								},
								isInProgress && styles.episodeCardActive,
								focused && styles.episodeCardFocused,
							]}
							onPress={() => handleEpisodeClick(ep, index)}
							activeOpacity={0.75}>
							{/* Sol: Play / Tik İkonu (w-7 h-7 rounded-full) */}
							<View
								style={[
									styles.playIconContainer,
									{
										backgroundColor: isInProgress
											? "#E50914"
											: isDark
												? "#1e293b"
												: "#f1f5f9",
									},
									isInProgress && styles.playIconActiveGlow,
								]}>
								<Ionicons
									name={
										isCompleted
											? "checkmark-circle"
											: "play"
									}
									size={isCompleted ? 17 : 13}
									color={
										isInProgress
											? "#ffffff"
											: "#E50914"
									}
									style={!isCompleted ? styles.playIconOffset : null}
								/>
							</View>

							{/* Orta: Bölüm Başlığı & Devam Durumu */}
							<View style={styles.episodeTitleContainer}>
								<View style={styles.episodeTitleRow}>
									<Text
										style={[
											styles.episodeTitleText,
											{
												color: isDark ? "#ffffff" : "#0f172a",
												fontWeight: isInProgress ? "700" : "600",
											},
										]}
										numberOfLines={1}>
										{epDisplayTitle}
									</Text>
									{isCompleted && (
										<View
											style={[
												styles.completedBadge,
												{
													backgroundColor: isDark
														? "rgba(56, 189, 248, 0.16)"
														: "rgba(56, 189, 248, 0.12)",
													borderColor: isDark
														? "rgba(56, 189, 248, 0.3)"
														: "rgba(56, 189, 248, 0.25)",
													borderWidth: 0.5,
												},
											]}>
											<Text
												style={[
													styles.completedBadgeText,
													{
														color: isDark
															? "#38bdf8"
															: "#0284c7",
													},
												]}>
												TAMAMLANDI
											</Text>
										</View>
									)}
									{isInProgress && (
										<View style={styles.inProgressBadge}>
											<Text style={styles.inProgressBadgeText}>
												İZLENİYOR
											</Text>
										</View>
									)}
								</View>

								{/* Süre / İlerleme Satırı */}
								{isInProgress ? (
									<View style={styles.episodeProgressRow}>
										<View
											style={[
												styles.miniProgressBarTrack,
												{
													backgroundColor: isDark
														? "#334155"
														: "#e2e8f0",
												},
											]}>
											<View
												style={[
													styles.miniProgressBarFill,
													{
														width: `${Math.min(100, Math.max(8, Math.round((epProgress.progress || (epProgress.duration > 0 ? epProgress.currentTime / epProgress.duration : 0.18)) * 100)))}%`,
													},
												]}
											/>
										</View>
										<Text style={styles.episodeProgressText}>
											{formatTime(epProgress.currentTime)}
											{epProgress.duration > 0
												? ` / ${formatTime(epProgress.duration)}`
												: ""}
										</Text>
									</View>
								) : (
									<Text
										style={[
											styles.episodeDurationText,
											{ color: isDark ? "#94a3b8" : "#64748b" },
										]}
										numberOfLines={1}>
										{epDurationFormatted || `${selectedSeason}. Sezon ${epNumber}. Bölüm`}
									</Text>
								)}
							</View>

							{/* Sağ: İndir Butonu (w-8 h-8 rounded-full) */}
							<TVPressable
								style={({ focused }) => [
									styles.downloadButton,
									{
										backgroundColor: isDark
											? "#1e293b"
											: "#f1f5f9",
									},
									focused && styles.controlsButtonFocused,
								]}
								onPress={() =>
									handleDownloadEpisode(ep, epNumber, epDisplayTitle)
								}
								activeOpacity={0.65}
								hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
								<Ionicons
									name={
										isQueued
											? "checkmark"
											: "download-outline"
									}
									size={15}
									color={
										isQueued
											? "#10b981"
											: isInProgress
												? colors.text
												: isDark
													? "#94a3b8"
													: "#64748b"
									}
								/>
							</TVPressable>
						</TVPressable>
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
							<TVPressable
								onPress={() => setIsSeasonModalOpen(false)}
								style={({ focused }) => [
									focused && styles.controlsButtonFocused,
								]}
								hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
								<Ionicons
									name="close"
									size={22}
									color={colors.textSecondary}
								/>
							</TVPressable>
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
									<TVPressable
										key={sKey}
										autoFocus={isSelected}
										style={({ focused }) => [
											styles.modalSeasonItem,
											isSelected && {
												backgroundColor: `${colors.primary}22`,
											},
											focused && styles.modalSeasonItemFocused,
										]}
										onPress={() => {
											handleSeasonSelect(sKey);
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
									</TVPressable>
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
	/* Bölüm Listesi (Card tabanlı, stitch_unified_cinema_ui_redesigna stili) */
	episodesList: {
		gap: 8,
	},
	episodeCard: {
		flexDirection: "row",
		alignItems: "center",
		paddingVertical: 12,
		paddingHorizontal: 12,
		borderRadius: 14,
		justifyContent: "space-between",
		gap: 12,
	},
	episodeCardActive: {
borderWidth: 1.5,
borderColor: "rgba(229, 9, 20, 0.55)",
	},
	playIconContainer: {
		width: 28,
		height: 28,
		borderRadius: 14,
		alignItems: "center",
		justifyContent: "center",
		flexShrink: 0,
	},
	playIconActiveGlow: {
borderWidth: 1.5,
borderColor: "rgba(229, 9, 20, 0.65)",
backgroundColor: "rgba(229, 9, 20, 0.18)",
	},
	playIconOffset: {
		marginLeft: 1.5,
	},
	episodeTitleContainer: {
		flex: 1,
		minWidth: 0,
		justifyContent: "center",
	},
	episodeTitleRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
	},
	episodeTitleText: {
		fontSize: 12.5,
		letterSpacing: -0.2,
		flexShrink: 1,
	},
	completedBadge: {
		paddingHorizontal: 6,
		paddingVertical: 1.5,
		borderRadius: 4,
	},
	completedBadgeText: {
		fontSize: 9,
		fontWeight: "800",
		letterSpacing: 0.4,
		textTransform: "uppercase",
	},
	inProgressBadge: {
		backgroundColor: "#E50914",
		paddingHorizontal: 6,
		paddingVertical: 1.5,
		borderRadius: 4,
	},
	inProgressBadgeText: {
		color: "#ffffff",
		fontSize: 9,
		fontWeight: "800",
		letterSpacing: 0.4,
		textTransform: "uppercase",
	},
	episodeProgressRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		marginTop: 4,
	},
	miniProgressBarTrack: {
		width: 75,
		height: 4,
		borderRadius: 2,
		overflow: "hidden",
	},
	miniProgressBarFill: {
		height: "100%",
		borderRadius: 2,
		backgroundColor: "#E50914",
	},
	episodeProgressText: {
		fontSize: 10,
		fontWeight: "700",
		color: "#E50914",
	},
	episodeDurationText: {
		fontSize: 10.5,
		fontWeight: "500",
		marginTop: 2,
	},
	downloadButton: {
		width: 32,
		height: 32,
		borderRadius: 16,
		justifyContent: "center",
		alignItems: "center",
		flexShrink: 0,
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
	controlsButtonFocused: {
		borderWidth: 2,
		borderColor: "#E50914",
		transform: [{ scale: 1.05 }],
	},
	episodeCardFocused: {
		borderWidth: 2,
		borderColor: "#E50914",
		transform: [{ scale: 1.02 }],
	},
	modalSeasonItemFocused: {
		borderWidth: 2,
		borderColor: "#E50914",
		transform: [{ scale: 1.02 }],
	},
});
