import BottomNavigation from "@/components/BottomNavigation";
import { useAuth } from "@/context/AuthContext";
import LanguageBadge from "@/components/common/LanguageBadge";
import {
	LANGUAGE_DISPLAY_MODES,
	useLanguageDisplay,
} from "@/context/LanguageDisplayContext";
import { useThemeContext } from "@/context/ThemeContext";
import { fetchPlatforms } from "@/services/api";
import { syncNow } from "@/services/sync";
import {
	clearAllUserData,
	getPluginVisibilitySettings,
	getSelectedPlatform,
	getUserProfile,
} from "@/utils/storage";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import TVPressable from "@/components/common/TVPressable";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
	Alert,
	BackHandler,
	Modal,
	Platform,
	ScrollView,
	StatusBar,
	StyleSheet,
	Switch,
	Text,
	TouchableOpacity,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// Modern categorized menu item component
function SettingRow({
	icon,
	iconBg = "#2563EB",
	label,
	subtitle,
	badgeText,
	badgeColor,
	rightComponent,
	onPress,
	showChevron = true,
	isDestructive = false,
}) {
	const { colors } = useThemeContext();

	return (
		<TVPressable
			style={styles.settingRow}
			focusedStyle={styles.settingRowFocused}
			onPress={onPress}
			disabled={!onPress && !rightComponent}
			activeOpacity={onPress ? 0.65 : 1}>
			<View style={styles.settingRowLeft}>
				<View style={[styles.iconBox, { backgroundColor: iconBg }]}>
					<Ionicons name={icon} size={20} color="#ffffff" />
				</View>
				<View style={styles.textContainer}>
					<Text
						style={[
							styles.settingLabel,
							{
								color: isDestructive ? "#ef4444" : colors.text,
							},
						]}>
						{label}
					</Text>
					{subtitle ? (
						<Text
							style={[
								styles.settingSubtitle,
								{ color: colors.textSecondary },
							]}
							numberOfLines={1}>
							{subtitle}
						</Text>
					) : null}
				</View>
			</View>

			<View style={styles.settingRowRight}>
				{badgeText ? (
					<View
						style={[
							styles.badge,
							{
								backgroundColor:
									badgeColor || "rgba(37, 99, 235, 0.16)",
							},
						]}>
						<Text
							style={[
								styles.badgeText,
								{
									color: badgeColor
										? "#ffffff"
										: colors.primary,
								},
							]}>
							{badgeText}
						</Text>
					</View>
				) : null}

				{rightComponent}

				{showChevron && !rightComponent && (
					<Ionicons
						name="chevron-forward"
						size={18}
						color={colors.textSecondary}
						style={{ opacity: 0.6 }}
					/>
				)}
			</View>
		</TVPressable>
	);
}

// Category Section Card with Title
function SettingsSection({ title, children }) {
	const { colors } = useThemeContext();
	return (
		<View style={styles.sectionContainer}>
			{title ? (
				<Text
					style={[
						styles.sectionHeaderTitle,
						{ color: colors.textSecondary },
					]}>
					{title}
				</Text>
			) : null}
			<View
				style={[
					styles.sectionCard,
					{
						backgroundColor: colors.cardBg,
						borderColor: colors.border,
					},
				]}>
				{React.Children.map(children, (child, index) => {
					if (!child) return null;
					const isLast = index === React.Children.count(children) - 1;
					return (
						<React.Fragment key={index}>
							{child}
							{!isLast && (
								<View
									style={[
										styles.rowDivider,
										{ backgroundColor: colors.border },
									]}
								/>
							)}
						</React.Fragment>
					);
				})}
			</View>
		</View>
	);
}

export default function SettingsScreen() {
	const { theme, toggleTheme, colors } = useThemeContext();
	const { isLoggedIn } = useAuth();
	const router = useRouter();

	const [userProfile, setUserProfile] = useState(null);
	const [selectedPlatform, setSelectedPlatform] = useState(null);
	const [activePluginsCount, setActivePluginsCount] = useState(0);
	const [totalPluginsCount, setTotalPluginsCount] = useState(0);

	const { languageDisplayMode, setLanguageDisplayMode } = useLanguageDisplay();
	const [languageModalVisible, setLanguageModalVisible] = useState(false);

	// Modals for sub-settings
	const [generalModalVisible, setGeneralModalVisible] = useState(false);
	const [backupModalVisible, setBackupModalVisible] = useState(false);
	const [layoutModalVisible, setLayoutModalVisible] = useState(false);
	const [compactLayout, setCompactLayout] = useState(false);

	// Fetch dynamic data when screen is focused
	useFocusEffect(
		useCallback(() => {
			let isMounted = true;
			async function loadData() {
				try {
					const [profile, platform, platformsData, visibility] =
						await Promise.all([
							getUserProfile(),
							getSelectedPlatform(),
							fetchPlatforms(),
							getPluginVisibilitySettings(),
						]);

					if (!isMounted) return;
					setUserProfile(profile);
					setSelectedPlatform(platform);

					const all = Array.isArray(platformsData)
						? platformsData
						: [];
					setTotalPluginsCount(all.length);

					const activeCount = all.filter((p) => {
						const key = p.name || p.id;
						return visibility[key] !== false;
					}).length;
					setActivePluginsCount(activeCount);
				} catch (err) {
					console.warn("Ayarlar verileri yüklenirken hata:", err);
				}
			}
			loadData();
			return () => {
				isMounted = false;
			};
		}, []),
	);

	useFocusEffect(
		useCallback(() => {
			const onBackPress = () => {
				if (languageModalVisible) {
					setLanguageModalVisible(false);
					return true;
				}
				if (backupModalVisible) {
					setBackupModalVisible(false);
					return true;
				}
				if (layoutModalVisible) {
					setLayoutModalVisible(false);
					return true;
				}
				if (generalModalVisible) {
					setGeneralModalVisible(false);
					return true;
				}
				router.replace("/(app)");
				return true;
			};

			const subscription = BackHandler.addEventListener(
				"hardwareBackPress",
				onBackPress,
			);
			return () => subscription.remove();
		}, [
			languageModalVisible,
			backupModalVisible,
			layoutModalVisible,
			generalModalVisible,
			router,
		]),
	);

	const handleClearCache = () => {
		Alert.alert(
			"Verileri Temizle",
			"Tüm izleme geçmişi, yerel önbellek ve tercihler sıfırlanacaktır. Emin misiniz?",
			[
				{ text: "Vazgeç", style: "cancel" },
				{
					text: "Sıfırla",
					style: "destructive",
					onPress: async () => {
						try {
							await clearAllUserData();
							Alert.alert(
								"Başarılı",
								"Tüm yerel veriler temizlendi.",
							);
							// Reload profile
							const p = await getUserProfile();
							setUserProfile(p);
						} catch {
							Alert.alert(
								"Hata",
								"Veriler temizlenirken bir sorun oluştu.",
							);
						}
					},
				},
			],
		);
	};

	/**
	 * Ayarlar ve listeler ZATEN otomatik senkronize edilir: bir tercih
	 * değiştiği anda hesaba yazılır (bkz. SyncContext). Elle yedekleme
	 * penceresinin tek işlevi "senkronizasyonu şimdi tetiklemek" olur.
	 */
	const handleSyncNow = async () => {
		setBackupModalVisible(false);
		const res = await syncNow();
		Alert.alert(
			res.success ? "Senkronizasyon tamamlandı" : "Senkronizasyon başarısız",
			res.success
				? "Değişiklikleriniz hesabınıza kaydedildi."
				: `Sunucuya ulaşılamadı (${res.error}). Bağlantınızı kontrol edin.`,
		);
	};

	return (
		<>
			<Stack.Screen options={{ headerShown: false }} />
			<SafeAreaView
				edges={["top", "left", "right"]}
				style={[styles.safeArea, { backgroundColor: colors.bg }]}>
				<StatusBar
					barStyle={
						theme === "dark" ? "light-content" : "dark-content"
					}
					backgroundColor={colors.bg}
				/>

				<ScrollView
					showsVerticalScrollIndicator={false}
					contentContainerStyle={styles.scrollContent}>
					{/* Profile Header Card */}
					<TVPressable
						style={[
							styles.profileCard,
							{
								backgroundColor: colors.cardBg,
								borderColor: colors.border,
							},
						]}
						focusedStyle={styles.profileCardFocused}
						onPress={() =>
							router.push({ pathname: "profile/EditProfile" })
						}
						activeOpacity={0.75}>
						<View style={styles.profileAvatarWrapper}>
							{userProfile?.avatarUrl ? (
								<Image
									source={{ uri: userProfile.avatarUrl }}
									style={styles.profileAvatar}
									contentFit="cover"
								/>
							) : (
								<View
									style={[
										styles.profileAvatarPlaceholder,
										{
											backgroundColor:
												theme === "dark"
													? "#1e293b"
													: "#e2e8f0",
										},
									]}>
									<Ionicons
										name="person"
										size={28}
										color={colors.primary}
									/>
								</View>
							)}
							<View style={styles.onlineBadge} />
						</View>

						<View style={styles.profileInfo}>
							<Text
								style={[
									styles.profileName,
									{ color: colors.text },
								]}>
								{userProfile?.displayName ||
									userProfile?.username ||
									"Varsayılan"}
							</Text>
							<Text
								style={[
									styles.profileBio,
									{ color: colors.textSecondary },
								]}>
								{userProfile?.email || "Profili Düzenle"}
							</Text>
						</View>

						<Ionicons
							name="chevron-forward"
							size={20}
							color={colors.textSecondary}
						/>
					</TVPressable>

					{/* KATEGORİ 1: İÇERİK VE KAYNAKLAR */}
					<SettingsSection title="İÇERİK VE KAYNAKLAR">
						{/* Eklentiler */}
						<SettingRow
							icon="extension-puzzle-outline"
							iconBg="#2563EB"
							label="Eklentiler"
							subtitle="Eklenti görünürlüğü ve kaynak yönetimi"
							badgeText={
								totalPluginsCount > 0
									? `${activePluginsCount}/${totalPluginsCount} Aktif`
									: "Yönet"
							}
							onPress={() =>
								router.push({
									pathname: "/(app)/settings/plugins",
								})
							}
						/>

						{/* Sağlayıcılar */}
						<SettingRow
							icon="server-outline"
							iconBg="#8B5CF6"
							label="Sağlayıcılar"
							subtitle="Varsayılan video ve içerik sağlayıcısı"
							badgeText={selectedPlatform?.name || "Varsayılan"}
							onPress={() => {
								router.push({
									pathname: "/(app)",
									params: { openPlatforms: "true" },
								});
							}}
						/>
					</SettingsSection>

					{/* KATEGORİ 2: OYNATMA VE GÖRÜNÜM */}
					<SettingsSection title="OYNATMA VE GÖRÜNÜM">
						{/* Oynatıcı */}
						<SettingRow
							icon="play-circle-outline"
							iconBg="#EF4444"
							label="Oynatıcı"
							subtitle="Altyazı boyutu, renk, ileri/geri sarma, jestler"
							onPress={() =>
								router.push({
									pathname: "/(app)/settings/player",
								})
							}
						/>

						{/* Düzen */}
						<SettingRow
							icon="grid-outline"
							iconBg="#EC4899"
							label="Düzen"
							subtitle="Ana sayfa yerleşimi ve kart boyutları"
							onPress={() => setLayoutModalVisible(true)}
						/>

						{/* Dil Gösterimi */}
						<SettingRow
							icon="language-outline"
							iconBg="#3B82F6"
							label="Dil Bilgisi Gösterimi"
							subtitle="İçeriklerde dil ve altyazı rozeti stili"
							badgeText={
								languageDisplayMode === LANGUAGE_DISPLAY_MODES.ICON
									? "Simge"
									: languageDisplayMode ===
											LANGUAGE_DISPLAY_MODES.ICON_TEXT
										? "Simge + Yazı"
										: "Yazı"
							}
							onPress={() => setLanguageModalVisible(true)}
						/>
					</SettingsSection>

					{/* KATEGORİ 3: UYGULAMA VE TERCİHLER */}
					<SettingsSection title="UYGULAMA VE TERCİHLER">
						{/* Genel Ayarlar */}
						<SettingRow
							icon="options-outline"
							iconBg="#10B981"
							label="Genel"
							subtitle="Koyu mod, arayüz dili ve bildirimler"
							onPress={() => setGeneralModalVisible(true)}
						/>

						{/* Hesaplar ve Güvenlik */}
						<SettingRow
							icon="shield-checkmark-outline"
							iconBg="#F59E0B"
							label="Hesaplar ve Güvenlik"
							subtitle="Hesap tercihleri ve profil gizliliği"
							onPress={() =>
								router.push({
									pathname: "profile/EditProfile",
								})
							}
						/>
					</SettingsSection>

					{/* KATEGORİ 4: SİSTEM VE YEDEKLEME */}
					<SettingsSection title="SİSTEM VE VERİ">
						{/* Cihazlar ve Senkronizasyon */}
						<SettingRow
							icon="phone-portrait-outline"
							iconBg="#7C3AED"
							label="Cihazlar ve Senkronizasyon"
							subtitle={
								isLoggedIn
									? "Favoriler ve listeler diğer cihazlarınızla paylaşılıyor"
									: "Giriş yapın, verileriniz cihazlar arasında eşitlensin"
							}
							onPress={() =>
								isLoggedIn
									? router.push("/(app)/settings/sync")
									: router.push("/(auth)/login")
							}
						/>

						{/* Güncellemeler ve Yedekleme */}
						<SettingRow
							icon="cloud-upload-outline"
							iconBg="#06B6D4"
							label="Güncellemeler ve Yedekleme"
							subtitle="Veritabanı yedekleme ve güncelleme denetimi"
							onPress={() => setBackupModalVisible(true)}
						/>

						{/* Yerel Verileri Sıfırla */}
						<SettingRow
							icon="trash-outline"
							iconBg="#DC2626"
							label="Verileri Sıfırla"
							subtitle="Tüm yerel verileri ve geçmişi temizle"
							isDestructive
							showChevron={false}
							onPress={handleClearCache}
						/>
					</SettingsSection>

					{/* Footer App Info - Görseldeki format: 4.8.0 • 8bdc599 • 9 Temmuz 2026 */}
					<View style={styles.footerContainer}>
						<Text
							style={[
								styles.footerVersionText,
								{ color: colors.textSecondary },
							]}>
							StreamPulse • 4.8.0 • 8bdc599 • 9 Temmuz 2026
							23:49:58
						</Text>
						<Text
							style={[
								styles.footerBuildText,
								{ color: colors.textSecondary },
							]}>
							Açık Kaynak Film & Dizi İstemcisi
						</Text>
					</View>

					<View style={{ height: 60 }} />
				</ScrollView>

				{/* GENEL AYARLAR MODAL */}
				<Modal
					visible={generalModalVisible}
					animationType="slide"
					transparent={true}
					onRequestClose={() => setGeneralModalVisible(false)}>
					<View style={styles.modalOverlay}>
						<View
							style={[
								styles.modalContent,
								{
									backgroundColor: colors.cardBg,
									borderColor: colors.border,
								},
							]}>
							<View style={styles.modalHeader}>
								<Text
									style={[
										styles.modalTitle,
										{ color: colors.text },
									]}>
									Genel Ayarlar
								</Text>
								<TVPressable
									focusedStyle={styles.modalCloseButtonFocused}
									onPress={() =>
										setGeneralModalVisible(false)
									}
									hitSlop={{
										top: 8,
										bottom: 8,
										left: 8,
										right: 8,
									}}>
									<Ionicons
										name="close"
										size={24}
										color={colors.text}
									/>
								</TVPressable>
							</View>

							{/* Dark Mode Switch */}
							<View style={styles.modalRow}>
								<View style={styles.modalRowInfo}>
									<Text
										style={[
											styles.modalRowTitle,
											{ color: colors.text },
										]}>
										Koyu Mod
									</Text>
									<Text
										style={[
											styles.modalRowSubtitle,
											{ color: colors.textSecondary },
										]}>
										Gece kullanımı için koyu arayüz teması
									</Text>
								</View>
								<Switch
									value={theme === "dark"}
									onValueChange={toggleTheme}
									trackColor={{
										false: "#374151",
										true: colors.primary,
									}}
									thumbColor="#ffffff"
								/>
							</View>

							<View
								style={[
									styles.modalDivider,
									{ backgroundColor: colors.border },
								]}
							/>

							{/* Dil */}
							<View style={styles.modalRow}>
								<View style={styles.modalRowInfo}>
									<Text
										style={[
											styles.modalRowTitle,
											{ color: colors.text },
										]}>
										Uygulama Dili
									</Text>
									<Text
										style={[
											styles.modalRowSubtitle,
											{ color: colors.textSecondary },
										]}>
										Varsayılan dil
									</Text>
								</View>
								<Text
									style={[
										styles.modalRowValue,
										{ color: colors.primary },
									]}>
									Türkçe
								</Text>
							</View>

							<View
								style={[
									styles.modalDivider,
									{ backgroundColor: colors.border },
								]}
							/>

							{/* Bildirimler */}
							<TVPressable
								style={styles.modalRow}
								focusedStyle={styles.settingRowFocused}
								onPress={() => {
									Alert.alert(
										"Bildirimler",
										"Tüm uygulama içi bildirimler aktiftir.",
									);
								}}>
								<View style={styles.modalRowInfo}>
									<Text
										style={[
											styles.modalRowTitle,
											{ color: colors.text },
										]}>
										Bildirimler
									</Text>
									<Text
										style={[
											styles.modalRowSubtitle,
											{ color: colors.textSecondary },
										]}>
										Yeni bölüm ve içerik uyarıları
									</Text>
								</View>
								<Ionicons
									name="chevron-forward"
									size={18}
									color={colors.textSecondary}
								/>
							</TVPressable>

							<TVPressable
								style={[
									styles.modalCloseButton,
									{ backgroundColor: colors.primary },
								]}
								focusedStyle={styles.modalCloseButtonFocused}
								onPress={() => setGeneralModalVisible(false)}>
								<Text style={styles.modalCloseButtonText}>
									Kapat
								</Text>
							</TVPressable>
						</View>
					</View>
				</Modal>

				{/* DÜZEN AYARLARI MODAL */}
				<Modal
					visible={layoutModalVisible}
					animationType="slide"
					transparent={true}
					onRequestClose={() => setLayoutModalVisible(false)}>
					<View style={styles.modalOverlay}>
						<View
							style={[
								styles.modalContent,
								{
									backgroundColor: colors.cardBg,
									borderColor: colors.border,
								},
							]}>
							<View style={styles.modalHeader}>
								<Text
									style={[
										styles.modalTitle,
										{ color: colors.text },
									]}>
									Düzen Tercihleri
								</Text>
								<TVPressable
									focusedStyle={styles.modalCloseButtonFocused}
									onPress={() =>
										setLayoutModalVisible(false)
									}>
									<Ionicons
										name="close"
										size={24}
										color={colors.text}
									/>
								</TVPressable>
							</View>

							<View style={styles.modalRow}>
								<View style={styles.modalRowInfo}>
									<Text
										style={[
											styles.modalRowTitle,
											{ color: colors.text },
										]}>
										Kompakt Kart Düzeni
									</Text>
									<Text
										style={[
											styles.modalRowSubtitle,
											{ color: colors.textSecondary },
										]}>
										Daha fazla içeriği ekranda göster
									</Text>
								</View>
								<Switch
									value={compactLayout}
									onValueChange={setCompactLayout}
									trackColor={{
										false: "#374151",
										true: colors.primary,
									}}
									thumbColor="#ffffff"
								/>
							</View>

							<TVPressable
								style={[
									styles.modalCloseButton,
									{ backgroundColor: colors.primary },
								]}
								focusedStyle={styles.modalCloseButtonFocused}
								onPress={() => setLayoutModalVisible(false)}>
								<Text style={styles.modalCloseButtonText}>
									Kaydet
								</Text>
							</TVPressable>
						</View>
					</View>
				</Modal>

				{/* YEDEKLEME VE GÜNCELLEME MODAL */}
				<Modal
					visible={backupModalVisible}
					animationType="slide"
					transparent={true}
					onRequestClose={() => setBackupModalVisible(false)}>
					<View style={styles.modalOverlay}>
						<View
							style={[
								styles.modalContent,
								{
									backgroundColor: colors.cardBg,
									borderColor: colors.border,
								},
							]}>
							<View style={styles.modalHeader}>
								<Text
									style={[
										styles.modalTitle,
										{ color: colors.text },
									]}>
									Güncellemeler ve Yedekleme
								</Text>
								<TVPressable
									focusedStyle={styles.modalCloseButtonFocused}
									onPress={() =>
										setBackupModalVisible(false)
									}>
									<Ionicons
										name="close"
										size={24}
										color={colors.text}
									/>
								</TVPressable>
							</View>

							<TVPressable
								style={styles.modalActionItem}
								focusedStyle={styles.settingRowFocused}
								onPress={handleSyncNow}>
								<Ionicons
									name="sync-outline"
									size={22}
									color={colors.primary}
								/>
								<View style={{ flex: 1 }}>
									<Text
										style={[
											styles.modalRowTitle,
											{ color: colors.text },
										]}>
										Senkronizasyonu Şimdi Çalıştır
									</Text>
									<Text
										style={[
											styles.modalRowSubtitle,
											{ color: colors.textSecondary },
										]}>
										Ayarlar ve listeler zaten otomatik kaydedilir
									</Text>
								</View>
							</TVPressable>

							<View
								style={[
									styles.modalDivider,
									{ backgroundColor: colors.border },
								]}
							/>

							<TVPressable
								style={styles.modalActionItem}
								focusedStyle={styles.settingRowFocused}
								onPress={() => {
									Alert.alert(
										"Güncelleme",
										"Uygulamanız en güncel sürümdedir (v4.8.0).",
									);
								}}>
								<Ionicons
									name="sparkles-outline"
									size={22}
									color={colors.primary}
								/>
								<View style={{ flex: 1 }}>
									<Text
										style={[
											styles.modalRowTitle,
											{ color: colors.text },
										]}>
										Güncellemeleri Denetle
									</Text>
									<Text
										style={[
											styles.modalRowSubtitle,
											{ color: colors.textSecondary },
										]}>
										Sürüm 4.8.0 • 8bdc599
									</Text>
								</View>
							</TVPressable>

							<TVPressable
								style={[
									styles.modalCloseButton,
									{ backgroundColor: colors.primary },
								]}
								focusedStyle={styles.modalCloseButtonFocused}
								onPress={() => setBackupModalVisible(false)}>
								<Text style={styles.modalCloseButtonText}>
									Kapat
								</Text>
							</TVPressable>
						</View>
					</View>
				</Modal>

				{/* DİL BİLGİSİ GÖSTERİMİ MODAL */}
				<Modal
					visible={languageModalVisible}
					animationType="slide"
					transparent={true}
					onRequestClose={() => setLanguageModalVisible(false)}>
					<View style={styles.modalOverlay}>
						<View
							style={[
								styles.modalContent,
								{
									backgroundColor: colors.cardBg,
									borderColor: colors.border,
								},
							]}>
							<View style={styles.modalHeader}>
								<Text
									style={[
										styles.modalTitle,
										{ color: colors.text },
									]}>
									Dil Bilgisi Gösterimi
								</Text>
								<TVPressable
									focusedStyle={styles.modalCloseButtonFocused}
									onPress={() =>
										setLanguageModalVisible(false)
									}>
									<Ionicons
										name="close"
										size={24}
										color={colors.text}
									/>
								</TVPressable>
							</View>

							{/* Options */}
							{[
								{
									key: LANGUAGE_DISPLAY_MODES.ICON,
									title: "Sadece Simge",
									desc: "İçeriklerde bayrak ve altyazı simgeleri gösterilir",
									sample: "Dublaj & Altyazılı",
								},
								{
									key: LANGUAGE_DISPLAY_MODES.ICON_TEXT,
									title: "Simge + Yazı",
									desc: "Simgeler ve dil metni birlikte gösterilir",
									sample: "Dublaj & Altyazılı",
								},
								{
									key: LANGUAGE_DISPLAY_MODES.TEXT,
									title: "Sadece Yazı",
									desc: "Yalnızca dil metni etiketi gösterilir",
									sample: "Dublaj & Altyazılı",
								},
							].map((opt) => {
								const isSelected =
									languageDisplayMode === opt.key;
								return (
									<TVPressable
										key={opt.key}
										style={[
											styles.modalOptionCard,
											{
												backgroundColor:
													theme === "dark"
														? "#161b22"
														: "#f1f5f9",
												borderColor: isSelected
													? colors.primary
													: colors.border,
											},
										]}
										focusedStyle={styles.modalOptionCardFocused}
										activeOpacity={0.7}
										onPress={() => {
											setLanguageDisplayMode(opt.key);
										}}>
										<View style={styles.modalOptionInfo}>
											<View
												style={
													styles.modalOptionHeader
												}>
												<Text
													style={[
														styles.modalOptionTitle,
														{
															color: isSelected
																? colors.primary
																: colors.text,
														},
													]}>
													{opt.title}
												</Text>
												<LanguageBadge
													language={opt.sample}
													mode={opt.key}
													size="small"
												/>
											</View>
											<Text
												style={[
													styles.modalOptionDesc,
													{
														color: colors.textSecondary,
													},
												]}>
												{opt.desc}
											</Text>
										</View>
										<View
											style={[
												styles.radioOuter,
												isSelected && {
													borderColor:
														colors.primary,
												},
											]}>
											{isSelected && (
												<View
													style={[
														styles.radioInner,
														{
															backgroundColor:
																colors.primary,
														},
													]}
												/>
											)}
										</View>
									</TVPressable>
								);
							})}

							<TVPressable
								style={[
									styles.modalCloseButton,
									{ backgroundColor: colors.primary },
								]}
								focusedStyle={styles.modalCloseButtonFocused}
								onPress={() => setLanguageModalVisible(false)}>
								<Text style={styles.modalCloseButtonText}>
									Tamam
								</Text>
							</TVPressable>
						</View>
					</View>
				</Modal>

				{/* Bottom Navigation */}
				<BottomNavigation activeRoute="/(app)/settings" />
			</SafeAreaView>
		</>
	);
}

const styles = StyleSheet.create({
	safeArea: {
		flex: 1,
		paddingLeft: Platform.isTV ? 56 : 0,
	},
	scrollContent: {
		paddingHorizontal: 16,
		paddingTop: 16,
		paddingBottom: 20,
	},
	profileCard: {
		flexDirection: "row",
		alignItems: "center",
		padding: 16,
		borderRadius: 16,
		borderWidth: 1,
		marginBottom: 20,
		gap: 14,
	},
	profileAvatarWrapper: {
		position: "relative",
	},
	profileAvatar: {
		width: 52,
		height: 52,
		borderRadius: 26,
	},
	profileAvatarPlaceholder: {
		width: 52,
		height: 52,
		borderRadius: 26,
		alignItems: "center",
		justifyContent: "center",
	},
	onlineBadge: {
		position: "absolute",
		bottom: 1,
		right: 1,
		width: 13,
		height: 13,
		borderRadius: 7,
		backgroundColor: "#10b981",
		borderWidth: 2,
		borderColor: "#12141a",
	},
	profileInfo: {
		flex: 1,
	},
	profileName: {
		fontSize: 18,
		fontWeight: "700",
		letterSpacing: -0.3,
		marginBottom: 2,
	},
	profileBio: {
		fontSize: 13,
	},
	sectionContainer: {
		marginBottom: 20,
	},
	sectionHeaderTitle: {
		fontSize: 11,
		fontWeight: "700",
		letterSpacing: 1.1,
		textTransform: "uppercase",
		paddingHorizontal: 6,
		marginBottom: 8,
	},
	sectionCard: {
		borderRadius: 16,
		borderWidth: 1,
		overflow: "hidden",
	},
	settingRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: 16,
		paddingVertical: 13,
		minHeight: 56,
	},
	settingRowLeft: {
		flexDirection: "row",
		alignItems: "center",
		flex: 1,
		gap: 14,
	},
	iconBox: {
		width: 36,
		height: 36,
		borderRadius: 10,
		alignItems: "center",
		justifyContent: "center",
	},
	textContainer: {
		flex: 1,
	},
	settingLabel: {
		fontSize: 15,
		fontWeight: "600",
		letterSpacing: -0.2,
	},
	settingSubtitle: {
		fontSize: 12,
		marginTop: 2,
	},
	settingRowRight: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
	},
	badge: {
		paddingHorizontal: 8,
		paddingVertical: 3,
		borderRadius: 8,
	},
	badgeText: {
		fontSize: 11,
		fontWeight: "700",
	},
	rowDivider: {
		height: 1,
		marginLeft: 66,
	},
	footerContainer: {
		alignItems: "center",
		justifyContent: "center",
		paddingVertical: 20,
		gap: 4,
	},
	footerVersionText: {
		fontSize: 12,
		fontWeight: "500",
		opacity: 0.7,
		textAlign: "center",
	},
	footerBuildText: {
		fontSize: 11,
		opacity: 0.5,
		textAlign: "center",
	},
	modalOverlay: {
		flex: 1,
		backgroundColor: "rgba(0, 0, 0, 0.65)",
		justifyContent: "flex-end",
	},
	modalContent: {
		borderTopLeftRadius: 24,
		borderTopRightRadius: 24,
		borderWidth: 1,
		padding: 20,
		paddingBottom: 36,
	},
	groupPickerSheet: {
		borderTopLeftRadius: 24,
		borderTopRightRadius: 24,
		borderWidth: 1,
		padding: 20,
		paddingBottom: 36,
		maxHeight: "85%",
	},
	groupPickerHint: {
		fontSize: 13,
		lineHeight: 19,
		marginBottom: 14,
	},
	groupPickerRow: {
		flexDirection: "row",
		alignItems: "center",
		paddingVertical: 12,
		borderBottomWidth: StyleSheet.hairlineWidth,
	},
	modalHeader: {		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginBottom: 20,
	},
	modalTitle: {
		fontSize: 18,
		fontWeight: "700",
	},
	modalRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingVertical: 12,
	},
	modalRowInfo: {
		flex: 1,
		paddingRight: 16,
	},
	modalRowTitle: {
		fontSize: 15,
		fontWeight: "600",
	},
	modalRowSubtitle: {
		fontSize: 12,
		marginTop: 2,
	},
	modalRowValue: {
		fontSize: 14,
		fontWeight: "600",
	},
	modalDivider: {
		height: 1,
		marginVertical: 4,
	},
	modalActionItem: {
		flexDirection: "row",
		alignItems: "center",
		paddingVertical: 14,
		gap: 14,
	},
	modalCloseButton: {
		height: 46,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
		marginTop: 20,
	},
	modalCloseButtonText: {
		color: "#ffffff",
		fontSize: 15,
		fontWeight: "700",
	},
	modalOptionCard: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		padding: 14,
		borderRadius: 12,
		borderWidth: 1.5,
		marginBottom: 10,
	},
	modalOptionInfo: {
		flex: 1,
		paddingRight: 12,
	},
	modalOptionHeader: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		marginBottom: 3,
	},
	modalOptionTitle: {
		fontSize: 15,
		fontWeight: "600",
	},
	modalOptionDesc: {
		fontSize: 12,
		lineHeight: 16,
	},
	radioOuter: {
		width: 20,
		height: 20,
		borderRadius: 10,
		borderWidth: 2,
		borderColor: "#6b7280",
		justifyContent: "center",
		alignItems: "center",
	},
	radioInner: {
		width: 10,
		height: 10,
		borderRadius: 5,
	},
	settingRowFocused: {
		backgroundColor: "rgba(229, 9, 20, 0.12)",
		borderWidth: 1.5,
		borderColor: "#E50914",
		transform: [{ scale: 1.02 }],
	},
	profileCardFocused: {
		borderWidth: 2,
		borderColor: "#E50914",
		transform: [{ scale: 1.02 }],
	},
	modalOptionCardFocused: {
		borderWidth: 2,
		borderColor: "#E50914",
		transform: [{ scale: 1.02 }],
	},
	modalCloseButtonFocused: {
		borderWidth: 2,
		borderColor: "#ffffff",
		transform: [{ scale: 1.04 }],
	},
});
