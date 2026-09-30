import { useThemeContext } from "@/context/ThemeContext";
import { clearPluginCache, fetchPlatforms } from "@/services/api";
import {
	getPluginVisibilitySettings,
	savePluginVisibility,
	setAllPluginsVisibility,
} from "@/utils/storage";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import { Stack, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
	ActivityIndicator,
	Alert,
	RefreshControl,
	ScrollView,
	StatusBar,
	StyleSheet,
	Switch,
	Text,
	TextInput,
	TouchableOpacity,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function PluginSettingsScreen() {
	const { theme, colors } = useThemeContext();
	const router = useRouter();

	const [loading, setLoading] = useState(true);
	const [refreshing, setRefreshing] = useState(false);
	const [plugins, setPlugins] = useState([]);
	const [visibilityMap, setVisibilityMap] = useState({});
	const [searchQuery, setSearchQuery] = useState("");

	// Load plugins and visibility settings
	const loadData = useCallback(async (forceRefresh = false) => {
		try {
			if (forceRefresh) {
				clearPluginCache();
			}
			const [platformsData, savedVisibility] = await Promise.all([
				fetchPlatforms(forceRefresh),
				getPluginVisibilitySettings(),
			]);

			const list = Array.isArray(platformsData) ? platformsData : [];
			setPlugins(list);

			// If a plugin doesn't have an explicit setting yet, default to true (visible)
			const initialMap = { ...(savedVisibility || {}) };
			list.forEach((p) => {
				const key = p.name || p.id;
				if (key && initialMap[key] === undefined) {
					initialMap[key] = true;
				}
			});
			setVisibilityMap(initialMap);
		} catch (error) {
			console.error("Eklentiler yüklenirken hata:", error);
			Alert.alert("Hata", "Eklentiler yüklenemedi.");
		} finally {
			setLoading(false);
			setRefreshing(false);
		}
	}, []);

	useEffect(() => {
		loadData();
	}, [loadData]);

	const handleRefresh = () => {
		setRefreshing(true);
		loadData(true);
	};

	// Toggle single plugin visibility
	const handleToggleVisibility = async (plugin) => {
		const key = plugin.name || plugin.id;
		if (!key) return;

		const currentVal = visibilityMap[key] !== false;
		const nextVal = !currentVal;

		const updated = {
			...visibilityMap,
			[key]: nextVal,
		};
		setVisibilityMap(updated);

		try {
			await savePluginVisibility(key, nextVal);
			clearPluginCache(); // Invalidate cache so changes reflect globally
		} catch (error) {
			console.error("Görünürlük kaydedilemedi:", error);
			// Rollback state on error
			setVisibilityMap(visibilityMap);
			Alert.alert("Hata", "Ayar kaydedilemedi.");
		}
	};

	// Enable or disable all plugins
	const handleToggleAll = async (makeVisible) => {
		const newMap = {};
		plugins.forEach((p) => {
			const key = p.name || p.id;
			if (key) newMap[key] = makeVisible;
		});

		setVisibilityMap(newMap);
		try {
			await setAllPluginsVisibility(newMap);
			clearPluginCache();
		} catch (error) {
			console.error("Toplu görünürlük kaydedilemedi:", error);
			Alert.alert("Hata", "Ayarlar kaydedilemedi.");
		}
	};

	// Filtered plugins based on search query
	const filteredPlugins = useMemo(() => {
		if (!searchQuery.trim()) return plugins;
		const q = searchQuery.toLowerCase().trim();
		return plugins.filter(
			(p) =>
				p.name?.toLowerCase().includes(q) ||
				p.description?.toLowerCase().includes(q) ||
				p.main_url?.toLowerCase().includes(q),
		);
	}, [plugins, searchQuery]);

	// Counts
	const totalCount = plugins.length;
	const activeCount = plugins.filter(
		(p) => visibilityMap[p.name || p.id] !== false,
	).length;
	const inactiveCount = totalCount - activeCount;

	return (
		<>
			<Stack.Screen options={{ headerShown: false }} />
			<SafeAreaView
				edges={["top", "left", "right"]}
				style={[styles.container, { backgroundColor: colors.bg }]}>
				<StatusBar
					barStyle={theme === "dark" ? "light-content" : "dark-content"}
					backgroundColor={colors.bg}
				/>

				{/* Header */}
				<View
					style={[
						styles.header,
						{
							borderBottomColor: colors.border,
							backgroundColor: colors.cardBg,
						},
					]}>
					<TouchableOpacity
						onPress={() => router.back()}
						style={styles.backButton}
						hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
						<Ionicons name="arrow-back" size={24} color={colors.text} />
					</TouchableOpacity>
					<View style={styles.headerTitleContainer}>
						<Text style={[styles.headerTitle, { color: colors.text }]}>
							Eklenti Ayarları
						</Text>
						<Text
							style={[
								styles.headerSubtitle,
								{ color: colors.textSecondary },
							]}>
							{activeCount}/{totalCount} Aktif
						</Text>
					</View>
					<TouchableOpacity
						onPress={() => handleRefresh()}
						style={styles.iconButton}
						disabled={refreshing}>
						<Ionicons
							name="refresh"
							size={20}
							color={refreshing ? colors.textSecondary : colors.primary}
						/>
					</TouchableOpacity>
				</View>

				<ScrollView
					contentContainerStyle={styles.scrollContent}
					showsVerticalScrollIndicator={false}
					refreshControl={
						<RefreshControl
							refreshing={refreshing}
							onRefresh={handleRefresh}
							tintColor={colors.primary}
							colors={[colors.primary]}
						/>
					}>
					{/* Information Card */}
					<View
						style={[
							styles.infoBanner,
							{
								backgroundColor:
									theme === "dark"
										? "rgba(37, 99, 235, 0.12)"
										: "rgba(37, 99, 235, 0.08)",
								borderColor:
									theme === "dark"
										? "rgba(37, 99, 235, 0.28)"
										: "rgba(37, 99, 235, 0.2)",
							},
						]}>
						<View style={styles.infoBannerHeader}>
							<Ionicons
								name="extension-puzzle-outline"
								size={22}
								color={colors.primary}
							/>
							<Text
								style={[styles.infoBannerTitle, { color: colors.text }]}>
								Eklenti Görünürlüğü ve Tercihler
							</Text>
						</View>
						<Text
							style={[
								styles.infoBannerText,
								{ color: colors.textSecondary },
							]}>
							Kapattığınız eklentiler ana sayfa sekmelerinde, kategori
							listelerinde ve sağlayıcı seçimlerinde gizlenir.
						</Text>

						{/* Stats Chips */}
						<View style={styles.statsRow}>
							<View
								style={[
									styles.statChip,
									{
										backgroundColor:
											theme === "dark" ? "#1e293b" : "#f1f5f9",
									},
								]}>
								<View
									style={[
										styles.statDot,
										{ backgroundColor: "#10b981" },
									]}
								/>
								<Text
									style={[styles.statText, { color: colors.text }]}>
									{activeCount} Görünür
								</Text>
							</View>
							<View
								style={[
									styles.statChip,
									{
										backgroundColor:
											theme === "dark" ? "#1e293b" : "#f1f5f9",
									},
								]}>
								<View
									style={[
										styles.statDot,
										{ backgroundColor: "#ef4444" },
									]}
								/>
								<Text
									style={[styles.statText, { color: colors.text }]}>
									{inactiveCount} Gizli
								</Text>
							</View>
							<View
								style={[
									styles.statChip,
									{
										backgroundColor:
											theme === "dark" ? "#1e293b" : "#f1f5f9",
									},
								]}>
								<Text
									style={[
										styles.statText,
										{ color: colors.textSecondary },
									]}>
									Toplam: {totalCount}
								</Text>
							</View>
						</View>
					</View>

					{/* Search & Bulk Action Bar */}
					<View style={styles.toolbarContainer}>
						<View
							style={[
								styles.searchBox,
								{
									backgroundColor: colors.cardBg,
									borderColor: colors.border,
								},
							]}>
							<Ionicons
								name="search"
								size={18}
								color={colors.textSecondary}
							/>
							<TextInput
								value={searchQuery}
								onChangeText={setSearchQuery}
								placeholder="Eklenti ara..."
								placeholderTextColor={colors.textSecondary}
								style={[styles.searchInput, { color: colors.text }]}
							/>
							{searchQuery.length > 0 && (
								<TouchableOpacity
									onPress={() => setSearchQuery("")}
									hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
									<Ionicons
										name="close-circle"
										size={18}
										color={colors.textSecondary}
									/>
								</TouchableOpacity>
							)}
						</View>

						<View style={styles.bulkActionsRow}>
							<TouchableOpacity
								style={[
									styles.bulkActionButton,
									{
										backgroundColor:
											theme === "dark" ? "#1e293b" : "#e2e8f0",
									},
								]}
								onPress={() => handleToggleAll(true)}
								activeOpacity={0.7}>
								<Ionicons
									name="checkmark-done"
									size={15}
									color="#10b981"
								/>
								<Text
									style={[styles.bulkActionText, { color: colors.text }]}>
									Tümünü Aç
								</Text>
							</TouchableOpacity>

							<TouchableOpacity
								style={[
									styles.bulkActionButton,
									{
										backgroundColor:
											theme === "dark" ? "#1e293b" : "#e2e8f0",
									},
								]}
								onPress={() => handleToggleAll(false)}
								activeOpacity={0.7}>
								<Ionicons name="eye-off-outline" size={15} color="#ef4444" />
								<Text
									style={[styles.bulkActionText, { color: colors.text }]}>
									Tümünü Gizle
								</Text>
							</TouchableOpacity>
						</View>
					</View>

					{/* Section Header */}
					<View style={styles.sectionHeaderRow}>
						<Text
							style={[
								styles.sectionTitle,
								{ color: colors.textSecondary },
							]}>
							YÜKLÜ EKLENTİLER ({filteredPlugins.length})
						</Text>
					</View>

					{/* Loading State */}
					{loading && (
						<View style={styles.centerBox}>
							<ActivityIndicator size="large" color={colors.primary} />
							<Text
								style={[
									styles.loadingText,
									{ color: colors.textSecondary },
								]}>
								Eklentiler yükleniyor...
							</Text>
						</View>
					)}

					{/* Empty State */}
					{!loading && filteredPlugins.length === 0 && (
						<View
							style={[
								styles.emptyBox,
								{
									backgroundColor: colors.cardBg,
									borderColor: colors.border,
								},
							]}>
							<Ionicons
								name="extension-puzzle-outline"
								size={48}
								color={colors.textSecondary}
							/>
							<Text style={[styles.emptyTitle, { color: colors.text }]}>
								Eklenti Bulunamadı
							</Text>
							<Text
								style={[
									styles.emptySubtitle,
									{ color: colors.textSecondary },
								]}>
								{searchQuery
									? `"${searchQuery}" ile eşleşen eklenti yok.`
									: "Henüz yüklü veya aktif eklenti tespit edilemedi."}
							</Text>
						</View>
					)}

					{/* Plugins List */}
					{!loading && filteredPlugins.length > 0 && (
						<View
							style={[
								styles.pluginListContainer,
								{
									backgroundColor: colors.cardBg,
									borderColor: colors.border,
								},
							]}>
							{filteredPlugins.map((plugin, index) => {
								const key = plugin.name || plugin.id;
								const isVisible = visibilityMap[key] !== false;
								const isLast = index === filteredPlugins.length - 1;

								return (
									<View key={key || index}>
										<View
											style={[
												styles.pluginCard,
												!isVisible && styles.pluginCardDisabled,
											]}>
											{/* Plugin Icon / Favicon */}
											<View style={styles.pluginIconWrapper}>
												{plugin.favicon ? (
													<Image
														source={{ uri: plugin.favicon }}
														style={styles.pluginFavicon}
														contentFit="contain"
														transition={150}
													/>
												) : (
													<View
														style={[
															styles.pluginIconFallback,
															{
																backgroundColor: isVisible
																	? `${colors.primary}22`
																	: "rgba(100, 116, 139, 0.16)",
															},
														]}>
														<Text
															style={[
																styles.pluginInitial,
																{
																	color: isVisible
																		? colors.primary
																		: colors.textSecondary,
																},
															]}>
															{plugin.name?.[0]?.toUpperCase() ||
																"P"}
														</Text>
													</View>
												)}
												{isVisible && (
													<View style={styles.activeBadgeIndicator} />
												)}
											</View>

											{/* Plugin Info */}
											<View style={styles.pluginContent}>
												<View style={styles.pluginNameRow}>
													<Text
														style={[
															styles.pluginName,
															{
																color: isVisible
																	? colors.text
																	: colors.textSecondary,
															},
														]}>
														{plugin.name}
													</Text>

													{/* Language / Type Badge */}
													{plugin.language && (
														<View
															style={[
																styles.langBadge,
																{
																	backgroundColor:
																		theme === "dark"
																			? "#334155"
																			: "#e2e8f0",
																},
															]}>
															<Text
																style={[
																	styles.langBadgeText,
																	{
																		color: isVisible
																			? colors.text
																			: colors.textSecondary,
																	},
																]}>
																{plugin.language.toUpperCase()}
															</Text>
														</View>
													)}
												</View>

												{/* Description */}
												{plugin.description ? (
													<Text
														style={[
															styles.pluginDescription,
															{ color: colors.textSecondary },
														]}
														numberOfLines={2}>
														{plugin.description}
													</Text>
												) : null}

												{/* URL or Category hint */}
												{plugin.main_url ? (
													<Text
														style={styles.pluginUrl}
														numberOfLines={1}>
														{plugin.main_url
															.replace(/^https?:\/\//, "")
															.replace(/\/$/, "")}
													</Text>
												) : null}
											</View>

											{/* Switch Toggle */}
											<View style={styles.switchWrapper}>
												<Switch
													value={isVisible}
													onValueChange={() =>
														handleToggleVisibility(plugin)
													}
													trackColor={{
														false: "#374151",
														true: colors.primary,
													}}
													thumbColor="#ffffff"
													ios_backgroundColor="#374151"
												/>
												<Text
													style={[
														styles.switchLabel,
														{
															color: isVisible
																? colors.primary
																: "#ef4444",
														},
													]}>
													{isVisible ? "Görünür" : "Gizli"}
												</Text>
											</View>
										</View>

										{/* Divider */}
										{!isLast && (
											<View
												style={[
													styles.cardDivider,
													{ backgroundColor: colors.border },
												]}
											/>
										)}
									</View>
								);
							})}
						</View>
					)}

					<View style={{ height: 40 }} />
				</ScrollView>
			</SafeAreaView>
		</>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
	},
	header: {
		height: 58,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: 16,
		borderBottomWidth: 1,
	},
	backButton: {
		width: 40,
		height: 40,
		justifyContent: "center",
		alignItems: "flex-start",
	},
	headerTitleContainer: {
		flex: 1,
		alignItems: "center",
	},
	headerTitle: {
		fontSize: 17,
		fontWeight: "700",
		letterSpacing: -0.3,
	},
	headerSubtitle: {
		fontSize: 11,
		fontWeight: "500",
		marginTop: 1,
	},
	iconButton: {
		width: 40,
		height: 40,
		justifyContent: "center",
		alignItems: "flex-end",
	},
	scrollContent: {
		paddingHorizontal: 16,
		paddingTop: 16,
		paddingBottom: 32,
	},
	infoBanner: {
		borderRadius: 14,
		padding: 16,
		borderWidth: 1,
		marginBottom: 16,
	},
	infoBannerHeader: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		marginBottom: 6,
	},
	infoBannerTitle: {
		fontSize: 15,
		fontWeight: "700",
	},
	infoBannerText: {
		fontSize: 13,
		lineHeight: 18,
		marginBottom: 12,
	},
	statsRow: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: 8,
	},
	statChip: {
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: 10,
		paddingVertical: 5,
		borderRadius: 8,
		gap: 6,
	},
	statDot: {
		width: 7,
		height: 7,
		borderRadius: 4,
	},
	statText: {
		fontSize: 12,
		fontWeight: "600",
	},
	toolbarContainer: {
		marginBottom: 16,
		gap: 10,
	},
	searchBox: {
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: 12,
		height: 42,
		borderRadius: 10,
		borderWidth: 1,
		gap: 8,
	},
	searchInput: {
		flex: 1,
		fontSize: 14,
		paddingVertical: 0,
	},
	bulkActionsRow: {
		flexDirection: "row",
		gap: 10,
	},
	bulkActionButton: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		paddingVertical: 8,
		paddingHorizontal: 12,
		borderRadius: 8,
		gap: 6,
	},
	bulkActionText: {
		fontSize: 12,
		fontWeight: "600",
	},
	sectionHeaderRow: {
		marginBottom: 8,
		paddingHorizontal: 4,
	},
	sectionTitle: {
		fontSize: 12,
		fontWeight: "600",
		letterSpacing: 1.1,
		textTransform: "uppercase",
	},
	centerBox: {
		paddingVertical: 40,
		alignItems: "center",
		justifyContent: "center",
		gap: 12,
	},
	loadingText: {
		fontSize: 14,
	},
	emptyBox: {
		padding: 32,
		borderRadius: 14,
		borderWidth: 1,
		alignItems: "center",
		justifyContent: "center",
		gap: 10,
		marginTop: 10,
	},
	emptyTitle: {
		fontSize: 16,
		fontWeight: "700",
	},
	emptySubtitle: {
		fontSize: 13,
		textAlign: "center",
		lineHeight: 18,
	},
	pluginListContainer: {
		borderRadius: 14,
		borderWidth: 1,
		overflow: "hidden",
	},
	pluginCard: {
		flexDirection: "row",
		alignItems: "center",
		padding: 14,
		gap: 14,
	},
	pluginCardDisabled: {
		opacity: 0.65,
	},
	pluginIconWrapper: {
		position: "relative",
		width: 44,
		height: 44,
		justifyContent: "center",
		alignItems: "center",
	},
	pluginFavicon: {
		width: 40,
		height: 40,
		borderRadius: 10,
	},
	pluginIconFallback: {
		width: 42,
		height: 42,
		borderRadius: 10,
		justifyContent: "center",
		alignItems: "center",
	},
	pluginInitial: {
		fontSize: 18,
		fontWeight: "700",
	},
	activeBadgeIndicator: {
		position: "absolute",
		top: -1,
		right: -1,
		width: 10,
		height: 10,
		borderRadius: 5,
		backgroundColor: "#10b981",
		borderWidth: 2,
		borderColor: "#12141a",
	},
	pluginContent: {
		flex: 1,
		justifyContent: "center",
	},
	pluginNameRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		marginBottom: 3,
	},
	pluginName: {
		fontSize: 15,
		fontWeight: "700",
		letterSpacing: -0.2,
	},
	langBadge: {
		paddingHorizontal: 6,
		paddingVertical: 1,
		borderRadius: 5,
	},
	langBadgeText: {
		fontSize: 10,
		fontWeight: "700",
	},
	pluginDescription: {
		fontSize: 12,
		lineHeight: 16,
		marginBottom: 3,
	},
	pluginUrl: {
		fontSize: 11,
		color: "#3b82f6",
	},
	switchWrapper: {
		alignItems: "center",
		justifyContent: "center",
		minWidth: 54,
	},
	switchLabel: {
		fontSize: 10,
		fontWeight: "600",
		marginTop: 2,
	},
	cardDivider: {
		height: 1,
		marginLeft: 72,
	},
});
