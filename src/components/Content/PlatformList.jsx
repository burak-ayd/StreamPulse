import { fetchPlatforms } from "@/services/api";
import {
	NONE_PLATFORM,
	getPluginVisibilitySettings,
	getSelectedPlatform,
	saveSelectedPlatform,
} from "@/utils/storage";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import React, { useEffect, useMemo, useState } from "react";
import {
	ActivityIndicator,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
	TouchableOpacity,
	View,
} from "react-native";

export default function PlatformList({ onSelectPlatform }) {
	const [selectedPlatformId, setSelectedPlatformId] = useState("none");
	const [platformList, setPlatformList] = useState([]);
	const [loading, setLoading] = useState(true);
	const [searchQuery, setSearchQuery] = useState("");
	const [activeFilter, setActiveFilter] = useState("all"); // 'all' | 'movie' | 'series' | 'anime'

	useEffect(() => {
		let isMounted = true;
		async function loadPlatforms() {
			try {
				setLoading(true);
				const [data, saved, visibility] = await Promise.all([
					fetchPlatforms(),
					getSelectedPlatform(),
					getPluginVisibilitySettings(),
				]);

				if (!isMounted) return;

				const list = Array.isArray(data) ? data : [];
				const visibleList = list.filter(
					(p) => visibility?.[p.name || p.id] !== false,
				);
				setPlatformList(visibleList);

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
					setSelectedPlatformId(
						visibleList[0].id || visibleList[0].name,
					);
				} else {
					setSelectedPlatformId("none");
				}
			} catch (error) {
				console.error("Platformlar yüklenirken hata:", error);
				if (isMounted) {
					setSelectedPlatformId("none");
				}
			} finally {
				if (isMounted) setLoading(false);
			}
		}

		loadPlatforms();
		return () => {
			isMounted = false;
		};
	}, []);

	const handlePlatformSelect = async (platform) => {
		const id = platform?.id || platform?.name;
		setSelectedPlatformId(id);
		await saveSelectedPlatform(platform);

		if (onSelectPlatform) {
			onSelectPlatform(platform);
		}
	};

	const handleSelectRandom = async () => {
		if (platformList.length === 0) {
			handlePlatformSelect(NONE_PLATFORM);
			return;
		}
		const randomIndex = Math.floor(Math.random() * platformList.length);
		const chosen = platformList[randomIndex];
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

	return (
		<View style={styles.container}>
			{/* Modal Header */}
			<View style={styles.header}>
				<Text style={styles.headerTitle}>Platform / Eklenti Seçimi</Text>
				<Text style={styles.headerSubtitle}>
					İçeriklerin getirileceği kaynağı belirleyin
				</Text>
			</View>

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
					<TouchableOpacity onPress={() => setSearchQuery("")}>
						<Ionicons
							name="close-circle"
							size={16}
							color="#9ca3af"
						/>
					</TouchableOpacity>
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
					<TouchableOpacity
						key={f.id}
						style={[
							styles.filterPill,
							activeFilter === f.id && styles.filterPillActive,
						]}
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
					</TouchableOpacity>
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
					<TouchableOpacity
						style={[
							styles.platformCard,
							isNoneSelected && styles.platformCardActive,
						]}
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
					</TouchableOpacity>

					{/* 2. Random Option */}
					<TouchableOpacity
						style={styles.platformCard}
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
					</TouchableOpacity>

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

						return (
							<TouchableOpacity
								key={key}
								style={[
									styles.platformCard,
									isSelected && styles.platformCardActive,
								]}
								onPress={() => handlePlatformSelect(platform)}
								activeOpacity={0.7}>
								{platform.favicon ? (
									<Image
										source={{ uri: platform.favicon }}
										style={styles.platformImage}
										contentFit="contain"
										transition={150}
										cachePolicy="memory-disk"
									/>
								) : (
									<View style={styles.iconContainer}>
										<Text style={styles.flagEmoji}>🇹🇷</Text>
									</View>
								)}

								<View style={styles.platformDetails}>
									<View style={styles.titleRow}>
										<Text style={styles.platformName}>
											{platform.name}
										</Text>
										{platform.language && (
											<View style={styles.langBadge}>
												<Text style={styles.langText}>
													{platform.language.toUpperCase()}
												</Text>
											</View>
										)}
									</View>
									<Text
										style={styles.platformDesc}
										numberOfLines={1}>
										{platform.description ||
											(platform.categories
												? `${platform.categories.length} Kategori`
												: "Aktif Eklenti")}
									</Text>
								</View>

								<View style={styles.radioWrapper}>
									{isSelected ? (
										<Ionicons
											name="checkmark-circle"
											size={22}
											color="#2563EB"
										/>
									) : (
										<View style={styles.radioCircle} />
									)}
								</View>
							</TouchableOpacity>
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
});
