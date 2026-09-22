import { useThemeContext } from "@context/ThemeContext";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import React, { useEffect, useMemo, useState } from "react";
import {
	ActivityIndicator,
	Alert,
	Linking,
	ScrollView,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from "react-native";

export default function SeasonsSection({
	seasons,
	episodes,
	onEpisodePress,
	loading = false,
	initialSeason,
}) {
	const { colors } = useThemeContext();

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
	}, [initialSeason, seasonKeys]);

	// Seçili sezonun bölümleri
	const currentEpisodes = normalizedSeasons
		? normalizedSeasons[selectedSeason] || normalizedSeasons[seasonKeys[0]] || []
		: [];

	if (loading && (!normalizedSeasons || seasonKeys.length === 0)) {
		return (
			<View style={styles.container}>
				<View style={styles.headerRow}>
					<Text style={[styles.sectionTitle, { color: colors.text }]}>
						Sezonlar & Bölümler
					</Text>
				</View>
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

	const handleEpisodeClick = (ep, index) => {
		if (onEpisodePress) {
			onEpisodePress(ep);
			return;
		}

		if (ep.url) {
			Alert.alert(
				`${selectedSeason}. Sezon ${ep.episode || index + 1}. Bölüm`,
				ep.title ? `"${ep.title}"\n\nBölümü izlemek istiyor musunuz?` : "Bölümü izlemek istiyor musunuz?",
				[
					{ text: "Vazgeç", style: "cancel" },
					{
						text: "İzle",
						onPress: () => {
							Linking.openURL(ep.url).catch((err) =>
								console.error("Link açma hatası:", err),
							);
						},
					},
				],
			);
		}
	};

	return (
		<View style={styles.container}>
			<View style={styles.headerRow}>
				<Text style={[styles.sectionTitle, { color: colors.text }]}>
					Sezonlar & Bölümler
				</Text>
				<Text
					style={[
						styles.episodeCountText,
						{ color: colors.textSecondary },
					]}>
					{currentEpisodes.length} Bölüm
				</Text>
			</View>

			{/* Sezon Seçici Sekmeler (Eğer 1'den fazla sezon varsa) */}
			{seasonKeys.length > 1 && (
				<ScrollView
					horizontal
					showsHorizontalScrollIndicator={false}
					contentContainerStyle={styles.seasonsScroll}>
					{seasonKeys.map((sKey) => {
						const isSelected = selectedSeason === sKey;
						return (
							<TouchableOpacity
								key={sKey}
								style={[
									styles.seasonTab,
									{
										backgroundColor: isSelected
											? colors.primary
											: colors.cardBg,
										borderColor: isSelected
											? colors.primary
											: colors.border,
									},
								]}
								onPress={() => setSelectedSeason(sKey)}
								activeOpacity={0.8}>
								<Text
									style={[
										styles.seasonTabText,
										{
											color: isSelected
												? "#ffffff"
												: colors.text,
											fontWeight: isSelected
												? "700"
												: "500",
										},
									]}>
									{sKey}. Sezon
								</Text>
							</TouchableOpacity>
						);
					})}
				</ScrollView>
			)}

			{/* Bölüm Listesi */}
			<View style={styles.episodesList}>
				{currentEpisodes.map((ep, index) => {
					const epNumber = ep.episode || ep.episode_number || index + 1;
					const epTitle =
						ep.title && ep.title.trim() !== ""
							? ep.title.trim()
							: `${selectedSeason}. Sezon ${epNumber}. Bölüm`;

					return (
						<TouchableOpacity
							key={ep.url || `${selectedSeason}-${epNumber}-${index}`}
							style={[
								styles.episodeCard,
								{
									backgroundColor: colors.cardBg,
									borderColor: colors.border,
								},
							]}
							onPress={() => handleEpisodeClick(ep, index)}
							activeOpacity={0.7}>
							{/* Bölüm Numarası / Play İkonu */}
							<View
								style={[
									styles.episodeNumberBadge,
									{
										backgroundColor:
											colors.primary + "18",
									},
								]}>
								<Ionicons
									name="play"
									size={16}
									color={colors.primary}
								/>
							</View>

							{/* Bölüm Bilgisi */}
							<View style={styles.episodeInfo}>
								<Text
									style={[
										styles.episodeTitle,
										{ color: colors.text },
									]}
									numberOfLines={1}>
									{epTitle}
								</Text>
								<Text
									style={[
										styles.episodeSubtitle,
										{ color: colors.textSecondary },
									]}>
									{epNumber}. Bölüm
								</Text>
							</View>

							{/* Sağ Aksiyon */}
							<View style={styles.playButton}>
								<Ionicons
									name="chevron-forward"
									size={20}
									color={colors.textSecondary}
								/>
							</View>
						</TouchableOpacity>
					);
				})}
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		marginBottom: 28,
	},
	headerRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginBottom: 14,
	},
	sectionTitle: {
		fontSize: 18,
		fontWeight: "700",
	},
	episodeCountText: {
		fontSize: 13,
		fontWeight: "500",
	},
	seasonsScroll: {
		gap: 10,
		paddingBottom: 14,
	},
	seasonTab: {
		paddingHorizontal: 16,
		paddingVertical: 8,
		borderRadius: 20,
		borderWidth: 1,
	},
	seasonTabText: {
		fontSize: 13,
	},
	episodesList: {
		gap: 10,
	},
	episodeCard: {
		flexDirection: "row",
		alignItems: "center",
		padding: 12,
		borderRadius: 12,
		borderWidth: 1,
	},
	episodeNumberBadge: {
		width: 36,
		height: 36,
		borderRadius: 18,
		alignItems: "center",
		justifyContent: "center",
		marginRight: 12,
	},
	episodeInfo: {
		flex: 1,
	},
	episodeTitle: {
		fontSize: 14,
		fontWeight: "600",
		marginBottom: 2,
	},
	episodeSubtitle: {
		fontSize: 12,
	},
	playButton: {
		paddingLeft: 8,
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
