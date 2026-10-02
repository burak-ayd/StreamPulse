import { useThemeContext } from "@/context/ThemeContext";
import {
	clearPluginCache,
	fetchPlatformCategories,
	fetchPlatforms,
} from "@/services/api";
import {
	getCategoryVisibilitySettings,
	getPluginVisibilitySettings,
	saveCategoryVisibility,
	savePluginVisibility,
	setAllPluginsVisibility,
	setPluginCategoriesVisibility,
} from "@/utils/storage";
import TVPressable from "@/components/common/TVPressable";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
	ActivityIndicator,
	Alert,
	BackHandler,
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
	const [categoryVisibilityMap, setCategoryVisibilityMap] = useState({});
	const [expandedPlugins, setExpandedPlugins] = useState({});
	const [pluginCategories, setPluginCategories] = useState({});
	const [loadingCategories, setLoadingCategories] = useState({});
	const [searchQuery, setSearchQuery] = useState("");

	useFocusEffect(
		useCallback(() => {
			const onBackPress = () => {
				router.back();
				return true;
			};
			const subscription = BackHandler.addEventListener(
				"hardwareBackPress",
				onBackPress,
			);
			return () => subscription.remove();
		}, [router]),
	);

	// Load plugins, plugin visibility and category visibility settings
	const loadData = useCallback(async (forceRefresh = false) => {
		try {
			if (forceRefresh) {
				clearPluginCache();
			}
			const [platformsData, savedVisibility, savedCatVisibility] =
				await Promise.all([
					fetchPlatforms(forceRefresh),
					getPluginVisibilitySettings(),
					getCategoryVisibilitySettings(),
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
			setCategoryVisibilityMap(savedCatVisibility || {});
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
			clearPluginCache(plugin.name); // Invalidate cache so changes reflect globally
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

	// Toggle category accordion expansion and lazy load categories
	const togglePluginExpanded = useCallback(
		async (plugin) => {
			const pluginKey = plugin.name || plugin.id;
			if (!pluginKey) return;

			const isCurrentlyExpanded = Boolean(expandedPlugins[pluginKey]);
			const nextExpanded = !isCurrentlyExpanded;

			setExpandedPlugins((prev) => ({
				...prev,
				[pluginKey]: nextExpanded,
			}));

			if (nextExpanded && !pluginCategories[pluginKey]) {
				try {
					setLoadingCategories((prev) => ({
						...prev,
						[pluginKey]: true,
					}));
					const catRes = await fetchPlatformCategories(
						plugin.name,
						false,
						true,
					);
					const catList =
						catRes?.categories || (Array.isArray(catRes) ? catRes : []);
					setPluginCategories((prev) => ({
						...prev,
						[pluginKey]: catList,
					}));
				} catch (catErr) {
					console.error(
						`[${plugin.name}] kategorileri yüklenirken hata:`,
						catErr,
					);
				} finally {
					setLoadingCategories((prev) => ({
						...prev,
						[pluginKey]: false,
					}));
				}
			}
		},
		[expandedPlugins, pluginCategories],
	);

	// Toggle single category visibility for a plugin
	const handleToggleCategory = async (plugin, category) => {
		const pluginKey = plugin.name || plugin.id;
		const catKey =
			category.name || category.title || category.url || category.id;
		if (!pluginKey || !catKey) return;

		const currentPluginCats = categoryVisibilityMap[pluginKey] || {};
		const currentVal = currentPluginCats[catKey] !== false;
		const nextVal = !currentVal;

		const updatedPluginCats = {
			...currentPluginCats,
			[catKey]: nextVal,
		};

		const updatedMap = {
			...categoryVisibilityMap,
			[pluginKey]: updatedPluginCats,
		};

		setCategoryVisibilityMap(updatedMap);

		try {
			await saveCategoryVisibility(pluginKey, catKey, nextVal);
			clearPluginCache(plugin.name);
		} catch (error) {
			console.error("Kategori görünürlüğü kaydedilemedi:", error);
			setCategoryVisibilityMap(categoryVisibilityMap);
			Alert.alert("Hata", "Kategori ayarı kaydedilemedi.");
		}
	};

	// Bulk toggle categories of a plugin
	const handleToggleAllCategories = async (plugin, makeVisible) => {
		const pluginKey = plugin.name || plugin.id;
		if (!pluginKey) return;

		const catList = pluginCategories[pluginKey] || [];
		if (catList.length === 0) return;

		const newPluginCatMap = {};
		catList.forEach((c) => {
			const key = c.name || c.title || c.url || c.id;
			if (key) newPluginCatMap[key] = makeVisible;
		});

		const updatedMap = {
			...categoryVisibilityMap,
			[pluginKey]: newPluginCatMap,
		};

		setCategoryVisibilityMap(updatedMap);

		try {
			await setPluginCategoriesVisibility(pluginKey, newPluginCatMap);
			clearPluginCache(plugin.name);
		} catch (error) {
			console.error("Toplu kategori görünürlüğü kaydedilemedi:", error);
			Alert.alert("Hata", "Kategori ayarları kaydedilemedi.");
		}
	};

	// Reload categories of a plugin
	const handleReloadCategories = async (plugin) => {
		const pluginKey = plugin.name || plugin.id;
		if (!pluginKey) return;

		try {
			setLoadingCategories((prev) => ({ ...prev, [pluginKey]: true }));
			clearPluginCache(plugin.name);
			const catRes = await fetchPlatformCategories(
				plugin.name,
				true,
				true,
			);
			const catList =
				catRes?.categories || (Array.isArray(catRes) ? catRes : []);
			setPluginCategories((prev) => ({
				...prev,
				[pluginKey]: catList,
			}));
		} catch (catErr) {
			console.error(
				`[${plugin.name}] kategorileri yenilenirken hata:`,
				catErr,
			);
			Alert.alert("Hata", "Kategoriler yüklenemedi.");
		} finally {
			setLoadingCategories((prev) => ({ ...prev, [pluginKey]: false }));
		}
	};

	// Filtered plugins based on search query
	const filteredPlugins = useMemo(() => {
		if (!searchQuery.trim()) return plugins;
		const q = searchQuery.toLowerCase().trim();
		return plugins.filter((p) => {
			const key = p.name || p.id;
			const nameMatch = p.name?.toLowerCase().includes(q);
			const descMatch = p.description?.toLowerCase().includes(q);
			const urlMatch = p.main_url?.toLowerCase().includes(q);
			const cats = pluginCategories[key];
			const catMatch =
				Array.isArray(cats) &&
				cats.some(
					(c) =>
						c.name?.toLowerCase().includes(q) ||
						c.title?.toLowerCase().includes(q),
				);
			return nameMatch || descMatch || urlMatch || catMatch;
		});
	}, [plugins, searchQuery, pluginCategories]);

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
					<TVPressable
						onPress={() => router.back()}
						style={styles.backButton}
						focusedStyle={styles.headerButtonFocused}
						hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
						<Ionicons name="arrow-back" size={24} color={colors.text} />
					</TVPressable>
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
					<TVPressable
						onPress={() => handleRefresh()}
						style={styles.iconButton}
						focusedStyle={styles.headerButtonFocused}
						disabled={refreshing}>
						<Ionicons
							name="refresh"
							size={20}
							color={refreshing ? colors.textSecondary : colors.primary}
						/>
					</TVPressable>
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
							Kapattığınız eklentiler veya gizlediğiniz kategoriler ana
							sayfa akışında ve sağlayıcı ekranında gösterilmez.
							Eklenti kartlarındaki "Kategoriler" bölümünü genişleterek
							kategorileri tek tek yönetebilirsiniz.
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
								<TVPressable
									onPress={() => setSearchQuery("")}
									focusedStyle={styles.headerButtonFocused}
									hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
									<Ionicons
										name="close-circle"
										size={18}
										color={colors.textSecondary}
									/>
								</TVPressable>
							)}
						</View>

						<View style={styles.bulkActionsRow}>
							<TVPressable
								style={[
									styles.bulkActionButton,
									{
										backgroundColor:
											theme === "dark" ? "#1e293b" : "#e2e8f0",
									},
								]}
								focusedStyle={styles.bulkButtonFocused}
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
							</TVPressable>

							<TVPressable
								style={[
									styles.bulkActionButton,
									{
										backgroundColor:
											theme === "dark" ? "#1e293b" : "#e2e8f0",
									},
								]}
								focusedStyle={styles.bulkButtonFocused}
								onPress={() => handleToggleAll(false)}
								activeOpacity={0.7}>
								<Ionicons name="eye-off-outline" size={15} color="#ef4444" />
								<Text
									style={[styles.bulkActionText, { color: colors.text }]}>
									Tümünü Gizle
								</Text>
							</TVPressable>
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
								const isExpanded = Boolean(expandedPlugins[key]);
								const isLoadingCats = Boolean(loadingCategories[key]);
								const catsList = pluginCategories[key];
								const visibleCatsCount = catsList
									? catsList.filter(
											(c) =>
												categoryVisibilityMap[key]?.[
													c.name ||
														c.title ||
														c.url ||
														c.id
												] !== false,
										).length
									: 0;

								return (
									<View key={key || index}>
										<TVPressable
											style={[
												styles.pluginCard,
												!isVisible && styles.pluginCardDisabled,
											]}
											focusedStyle={styles.pluginCardFocused}
											onPress={() => handleToggleVisibility(plugin)}>
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
										</TVPressable>

										{/* Category Accordion Header Button */}
										<TVPressable
											style={[
												styles.categoryAccordionTrigger,
												{
													backgroundColor:
														theme === "dark"
															? isExpanded
																? "rgba(37, 99, 235, 0.14)"
																: "rgba(255, 255, 255, 0.03)"
															: isExpanded
																? "rgba(37, 99, 235, 0.08)"
																: "rgba(0, 0, 0, 0.02)",
													borderColor: isExpanded
														? "rgba(37, 99, 235, 0.3)"
														: colors.border,
												},
											]}
											focusedStyle={styles.accordionFocused}
											onPress={() => togglePluginExpanded(plugin)}
											activeOpacity={0.7}>
											<View style={styles.categoryAccordionLeft}>
												<Ionicons
													name="layers-outline"
													size={15}
													color={
														isExpanded
															? colors.primary
															: colors.textSecondary
													}
												/>
												<Text
													style={[
														styles.categoryAccordionTitle,
														{
															color: isExpanded
																? colors.primary
																: colors.text,
														},
													]}>
													Kategoriler
												</Text>
												{catsList && catsList.length > 0 && (
													<View
														style={[
															styles.categoryCountBadge,
															{
																backgroundColor:
																	theme === "dark"
																		? "#1e293b"
																		: "#e2e8f0",
															},
														]}>
														<Text
															style={[
																styles.categoryCountBadgeText,
																{
																	color:
																		visibleCatsCount ===
																		0
																			? "#ef4444"
																			: visibleCatsCount <
																					catsList.length
																				? "#f59e0b"
																				: "#10b981",
																},
															]}>
															{visibleCatsCount}/
															{catsList.length} Görünür
														</Text>
													</View>
												)}
											</View>
											<View style={styles.categoryAccordionRight}>
												{isLoadingCats ? (
													<ActivityIndicator
														size="small"
														color={colors.primary}
													/>
												) : (
													<Ionicons
														name={
															isExpanded
																? "chevron-up"
																: "chevron-down"
														}
														size={16}
														color={colors.textSecondary}
													/>
												)}
											</View>
										</TVPressable>

										{/* Expanded Categories Section */}
										{isExpanded && (
											<View
												style={[
													styles.categoriesContainer,
													{
														backgroundColor:
															theme === "dark"
																? "rgba(15, 23, 42, 0.55)"
																: "rgba(248, 250, 252, 0.95)",
														borderColor: colors.border,
													},
												]}>
												{!isVisible && (
													<View
														style={[
															styles.pluginDisabledWarning,
															{
																backgroundColor:
																	theme === "dark"
																		? "rgba(239, 68, 68, 0.12)"
																		: "rgba(239, 68, 68, 0.08)",
																borderColor:
																	theme === "dark"
																		? "rgba(239, 68, 68, 0.3)"
																		: "rgba(239, 68, 68, 0.2)",
															},
														]}>
														<Ionicons
															name="information-circle-outline"
															size={15}
															color="#ef4444"
														/>
														<Text
															style={
																styles.pluginDisabledWarningText
															}>
															Eklenti kapalı olduğu için
															kategorileri de ana sayfada
															gizlidir.
														</Text>
													</View>
												)}

												{isLoadingCats ? (
													<View
														style={
															styles.categoriesLoadingBox
														}>
														<ActivityIndicator
															size="small"
															color={colors.primary}
														/>
														<Text
															style={[
																styles.categoriesLoadingText,
																{
																	color:
																		colors.textSecondary,
																},
															]}>
															Kategoriler yükleniyor...
														</Text>
													</View>
												) : !catsList ||
												  catsList.length === 0 ? (
													<View
														style={styles.categoriesEmptyBox}>
														<Ionicons
															name="folder-open-outline"
															size={26}
															color={colors.textSecondary}
														/>
														<Text
															style={[
																styles.categoriesEmptyText,
																{
																	color:
																		colors.textSecondary,
																},
															]}>
															Bu eklentiye ait kategori
															bulunamadı.
														</Text>
														<TVPressable
															style={[
																styles.reloadCatsButton,
																{
																	borderColor:
																		colors.border,
																},
															]}
															focusedStyle={styles.bulkButtonFocused}
															onPress={() =>
																handleReloadCategories(
																	plugin,
																)
															}>
															<Ionicons
																name="refresh"
																size={13}
																color={colors.primary}
															/>
															<Text
																style={[
																	styles.reloadCatsText,
																	{
																		color:
																			colors.primary,
																	},
																]}>
																Yeniden Dene
															</Text>
														</TVPressable>
													</View>
												) : (
													<>
														{/* Categories Header & Actions */}
														<View
															style={
																styles.categoriesHeaderRow
															}>
															<Text
																style={[
																	styles.categoriesSubTitle,
																	{
																		color:
																			colors.textSecondary,
																	},
																]}>
																KATEGORİLER (
																{catsList.length})
															</Text>
															<View
																style={
																	styles.categoriesBulkActions
																}>
																<TVPressable
																	style={[
																		styles.catBulkButton,
																		{
																			backgroundColor:
																				theme === "dark"
																					? "#1e293b"
																					: "#e2e8f0",
																		},
																	]}
																	focusedStyle={styles.catBulkButtonFocused}
																	onPress={() =>
																		handleToggleAllCategories(
																			plugin,
																			true,
																		)
																	}
																	activeOpacity={0.7}>
																	<Ionicons
																		name="checkmark-done"
																		size={12}
																		color="#10b981"
																	/>
																	<Text
																		style={[
																			styles.catBulkButtonText,
																			{
																				color: "#10b981",
																			},
																		]}>
																		Tümünü Aç
																	</Text>
																</TVPressable>
																<TVPressable
																	style={[
																		styles.catBulkButton,
																		{
																			backgroundColor:
																				theme === "dark"
																					? "#1e293b"
																					: "#e2e8f0",
																		},
																	]}
																	focusedStyle={styles.catBulkButtonFocused}
																	onPress={() =>
																		handleToggleAllCategories(
																			plugin,
																			false,
																		)
																	}
																	activeOpacity={0.7}>
																	<Ionicons
																		name="eye-off-outline"
																		size={12}
																		color="#ef4444"
																	/>
																	<Text
																		style={[
																			styles.catBulkButtonText,
																			{
																				color: "#ef4444",
																			},
																		]}>
																		Tümünü Gizle
																	</Text>
																</TVPressable>
															</View>
														</View>

														{/* Category Items */}
														<View
															style={
																styles.categoryItemsList
															}>
															{catsList.map(
																(category, catIdx) => {
																	const catKey =
																		category.name ||
																		category.title ||
																		category.url ||
																		category.id;
																	const isCatVisible =
																		categoryVisibilityMap[
																			key
																		]?.[catKey] !==
																		false;
																	const isCatLast =
																		catIdx ===
																		catsList.length - 1;

																	return (
																		<View
																			key={
																				catKey ||
																				catIdx
																			}>
																			<TVPressable
																				style={[
																					styles.categoryItemRow,
																					!isCatVisible &&
																						styles.categoryItemRowDisabled,
																				]}
																				focusedStyle={styles.categoryItemRowFocused}
																				onPress={() =>
																					handleToggleCategory(
																						plugin,
																						category,
																					)
																				}>
																				<View
																					style={
																						styles.categoryItemInfo
																					}>
																					<Ionicons
																						name={
																							isCatVisible
																								? "film-outline"
																								: "eye-off-outline"
																						}
																						size={
																							16
																						}
																						color={
																							isCatVisible
																								? colors.primary
																								: colors.textSecondary
																						}
																					/>
																					<View
																						style={
																							styles.categoryTextWrapper
																						}>
																						<Text
																							style={[
																								styles.categoryItemName,
																								{
																									color: isCatVisible
																										? colors.text
																										: colors.textSecondary,
																								},
																							]}
																							numberOfLines={
																								1
																							}>
																							{category.name ||
																								category.title ||
																								"Kategori"}
																						</Text>
																						{category.url ? (
																							<Text
																								style={
																									styles.categoryItemSub
																								}
																								numberOfLines={
																									1
																								}>
																								{
																									category.url
																								}
																							</Text>
																						) : null}
																					</View>
																				</View>

																				<View
																					style={
																						styles.categoryItemSwitchWrapper
																					}>
																					<Switch
																						value={
																							isCatVisible
																						}
																						onValueChange={() =>
																							handleToggleCategory(
																								plugin,
																								category,
																							)
																						}
																						trackColor={{
																							false: "#374151",
																							true: colors.primary,
																						}}
																						thumbColor="#ffffff"
																						ios_backgroundColor="#374151"
																						style={{
																							transform:
																								[
																									{
																										scaleX: 0.8,
																									},
																									{
																										scaleY: 0.8,
																									},
																								],
																						}}
																					/>
																					<Text
																						style={[
																							styles.categoryItemSwitchLabel,
																							{
																								color: isCatVisible
																									? colors.primary
																									: "#ef4444",
																							},
																						]}>
																						{isCatVisible
																							? "Görünür"
																							: "Gizli"}
																					</Text>
																				</View>
																			</TVPressable>
																			{!isCatLast && (
																				<View
																					style={[
																						styles.categoryDivider,
																						{
																							backgroundColor:
																								colors.border,
																						},
																					]}
																				/>
																			)}
																		</View>
																	);
																},
															)}
														</View>
													</>
												)}
											</View>
										)}

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
	categoryAccordionTrigger: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginHorizontal: 12,
		marginBottom: 10,
		paddingHorizontal: 12,
		paddingVertical: 8,
		borderRadius: 9,
		borderWidth: 1,
	},
	categoryAccordionLeft: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
	},
	categoryAccordionTitle: {
		fontSize: 12,
		fontWeight: "600",
	},
	categoryCountBadge: {
		paddingHorizontal: 7,
		paddingVertical: 2,
		borderRadius: 5,
	},
	categoryCountBadgeText: {
		fontSize: 10,
		fontWeight: "700",
	},
	categoryAccordionRight: {
		justifyContent: "center",
		alignItems: "center",
		width: 20,
	},
	categoriesContainer: {
		marginHorizontal: 12,
		marginBottom: 12,
		padding: 12,
		borderRadius: 10,
		borderWidth: 1,
	},
	pluginDisabledWarning: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		paddingHorizontal: 10,
		paddingVertical: 6,
		borderRadius: 6,
		borderWidth: 1,
		marginBottom: 10,
	},
	pluginDisabledWarningText: {
		fontSize: 11,
		color: "#ef4444",
		flex: 1,
		fontWeight: "500",
	},
	categoriesLoadingBox: {
		paddingVertical: 16,
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
	},
	categoriesLoadingText: {
		fontSize: 12,
	},
	categoriesEmptyBox: {
		paddingVertical: 14,
		alignItems: "center",
		justifyContent: "center",
		gap: 6,
	},
	categoriesEmptyText: {
		fontSize: 12,
		textAlign: "center",
	},
	reloadCatsButton: {
		flexDirection: "row",
		alignItems: "center",
		gap: 5,
		paddingHorizontal: 10,
		paddingVertical: 5,
		borderRadius: 6,
		borderWidth: 1,
		marginTop: 4,
	},
	reloadCatsText: {
		fontSize: 11,
		fontWeight: "600",
	},
	categoriesHeaderRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginBottom: 10,
		paddingBottom: 6,
		borderBottomWidth: StyleSheet.hairlineWidth,
		borderBottomColor: "rgba(100, 116, 139, 0.2)",
	},
	categoriesSubTitle: {
		fontSize: 10,
		fontWeight: "700",
		letterSpacing: 0.8,
	},
	categoriesBulkActions: {
		flexDirection: "row",
		gap: 6,
	},
	catBulkButton: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		paddingHorizontal: 8,
		paddingVertical: 4,
		borderRadius: 6,
	},
	catBulkButtonText: {
		fontSize: 10,
		fontWeight: "700",
	},
	categoryItemsList: {
		gap: 2,
	},
	categoryItemRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingVertical: 6,
	},
	categoryItemRowDisabled: {
		opacity: 0.6,
	},
	categoryItemInfo: {
		flexDirection: "row",
		alignItems: "center",
		flex: 1,
		gap: 8,
		paddingRight: 8,
	},
	categoryTextWrapper: {
		flex: 1,
	},
	categoryItemName: {
		fontSize: 13,
		fontWeight: "600",
	},
	categoryItemSub: {
		fontSize: 10,
		color: "#64748b",
		marginTop: 1,
	},
	categoryItemSwitchWrapper: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
	},
	categoryItemSwitchLabel: {
		fontSize: 10,
		fontWeight: "600",
		minWidth: 38,
		textAlign: "right",
	},
	categoryDivider: {
		height: StyleSheet.hairlineWidth,
		marginLeft: 24,
		marginVertical: 2,
	},
	headerButtonFocused: {
		backgroundColor: "rgba(229, 9, 20, 0.2)",
		borderRadius: 8,
		transform: [{ scale: 1.08 }],
	},
	bulkButtonFocused: {
		borderWidth: 1.5,
		borderColor: "#E50914",
		transform: [{ scale: 1.05 }],
	},
	pluginCardFocused: {
		borderWidth: 1.5,
		borderColor: "#E50914",
		backgroundColor: "rgba(229, 9, 20, 0.12)",
		transform: [{ scale: 1.02 }],
	},
	accordionFocused: {
		borderWidth: 1.5,
		borderColor: "#E50914",
		backgroundColor: "rgba(229, 9, 20, 0.15)",
		transform: [{ scale: 1.02 }],
	},
	catBulkButtonFocused: {
		borderWidth: 1,
		borderColor: "#E50914",
		transform: [{ scale: 1.05 }],
	},
	categoryItemRowFocused: {
		borderWidth: 1,
		borderColor: "#E50914",
		backgroundColor: "rgba(229, 9, 20, 0.12)",
		borderRadius: 6,
		paddingHorizontal: 4,
		transform: [{ scale: 1.02 }],
	},
});
