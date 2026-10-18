import BottomNavigation from "@/components/BottomNavigation";
import LanguageBadge from "@/components/common/LanguageBadge";
import TVPressable from "@/components/common/TVPressable";
import { useAppUpdate } from "@/context/AppUpdateContext";
import { useAuth } from "@/context/AuthContext";
import {
	LANGUAGE_DISPLAY_MODES,
	useLanguageDisplay,
} from "@/context/LanguageDisplayContext";
import { useThemeContext } from "@/context/ThemeContext";
import { useNavLayout } from "@/hooks/useNavLayout";
import { fetchPlatforms } from "@/services/api";
import { getNotifyOnUpdate, setNotifyOnUpdate } from "@/services/otaUpdate";
import { openLogin } from "@/utils/authRoutes";
import {
	clearAllUserData,
	getPluginVisibilitySettings,
	getSelectedPlatform,
} from "@/utils/storage";
import { useTvMetrics } from "@/utils/tvMetrics";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
	Alert,
	BackHandler,
	Modal,
	ScrollView,
	StatusBar,
	StyleSheet,
	Switch,
	Text,
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
	// Sol ray (TV / tablet yatay) varken icerik sola kayar.
	const { contentPaddingLeft } = useNavLayout();
	// TV: ayar satırları 1920px boyunca uzanıyordu; ikon solda, değer
	// tamamen sağda kalıyor ve aradaki boşluk okunmuyordu. `contentMaxWidth`
	// hepsini ortalanmış bir sütuna toplar.
	const { contentMaxWidth, isTV } = useTvMetrics();

	const [selectedPlatform, setSelectedPlatform] = useState(null);
	const [activePluginsCount, setActivePluginsCount] = useState(0);
	const [totalPluginsCount, setTotalPluginsCount] = useState(0);

	// APK güncelleme: satır kontrolü tetiklemez, modalı açar. Kontrol
	// uygulama açılışında zaten otomatik çalışıyor (AppUpdateProvider);
	// buradaki giriş yalnızca "şimdi bakayım" ve güncelleme rozetidir.
	const {
		release: pendingRelease,
		currentVersion: installedVersion,
		disabledReason: updateDisabledReason,
		isChecking: isCheckingUpdate,
		openSheet: openUpdateSheet,
	} = useAppUpdate();

	/*
	 * OTA bildirim tercihi (expo-updates · custom server): KAPALI
	 * (varsayılan) güncelleme sessizce iner ve uygulamayı yeniden
	 * açtığında kendiliğinden uygulanır; AÇIK ise "Şimdi yenile?"
	 * sorusu gelir. Kontrol tetiklediği YOK — akış RootLayout'taki
	 * useOtaUpdate ile zaten arka planda dönüyor.
	 */
	const [otaNotifyEnabled, setOtaNotifyEnabled] = useState(false);

	useEffect(() => {
		let isMounted = true;
		getNotifyOnUpdate().then((value) => {
			if (isMounted) setOtaNotifyEnabled(value);
		});
		return () => {
			isMounted = false;
		};
	}, []);

	const { languageDisplayMode, setLanguageDisplayMode } =
		useLanguageDisplay();
	const [languageModalVisible, setLanguageModalVisible] = useState(false);

	// Modals for sub-settings
	const [generalModalVisible, setGeneralModalVisible] = useState(false);
	const [layoutModalVisible, setLayoutModalVisible] = useState(false);
	const [compactLayout, setCompactLayout] = useState(false);

	// Fetch dynamic data when screen is focused
	useFocusEffect(
		useCallback(() => {
			let isMounted = true;
			async function loadData() {
				try {
					const [platform, platformsData, visibility] =
						await Promise.all([
							getSelectedPlatform(),
							fetchPlatforms(),
							getPluginVisibilitySettings(),
						]);

					if (!isMounted) return;
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
				if (layoutModalVisible) {
					setLayoutModalVisible(false);
					return true;
				}
				if (generalModalVisible) {
					setGeneralModalVisible(false);
					return true;
				}
				if (router.canGoBack()) router.back();
				else router.replace("/(app)");
				return true;
			};

			const subscription = BackHandler.addEventListener(
				"hardwareBackPress",
				onBackPress,
			);
			return () => subscription.remove();
		}, [
			languageModalVisible,
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

	return (
		<>
			<Stack.Screen options={{ headerShown: false }} />
			<SafeAreaView
				edges={["top", "left", "right"]}
				style={[
					styles.safeArea,
					{
						backgroundColor: colors.bg,
						paddingLeft: contentPaddingLeft,
					},
				]}>
				<StatusBar
					barStyle={
						theme === "dark" ? "light-content" : "dark-content"
					}
					backgroundColor={colors.bg}
				/>

				<ScrollView
					contentInsetAdjustmentBehavior="automatic"
					showsVerticalScrollIndicator={false}
					contentContainerStyle={[
						styles.scrollContent,
						contentMaxWidth
							? {
									alignSelf: "center",
									width: "100%",
									maxWidth: contentMaxWidth,
								}
							: null,
					]}>
					{/* KATEGORİ 1: İÇERİK VE KAYNAKLAR */}
					<SettingsSection title="İÇERİK 12312VE KAYNAKLAR">
						{/* Eklentiler */}
						<SettingRow
							icon="extension-puzzle-outline"
							iconBg="#2563EB"
							label="Eklentiler"
							subtitle="Eklenti görünürlüğü ve yönetimi"
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
								languageDisplayMode ===
								LANGUAGE_DISPLAY_MODES.ICON
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

						{/*
						 * APK güncelleme. Satır kontrolü başlatmaz; modalı
						 * açar. Kontrol, uygulama açılışında zaten otomatik
						 * çalışıyor (AppUpdateProvider) — bu satır yalnızca
						 * "şimdi bakayım" girişi ve güncelleme rozetidir.
						 */}
						<SettingRow
							icon="cloud-download-outline"
							iconBg="#0EA5E9"
							label="Uygulama Güncellemeleri"
							subtitle={
								updateDisabledReason
									? updateDisabledReason
									: pendingRelease
										? `v${pendingRelease.version} yayında • ${pendingRelease.sizeMB} MB`
										: isCheckingUpdate
											? "Güncellemeler kontrol ediliyor…"
											: `v${installedVersion} yüklü • güncellemeleri kontrol et`
							}
							badgeText={pendingRelease ? "Güncelle" : undefined}
							badgeColor={
								pendingRelease ? colors.primary : undefined
							}
							showChevron={false}
							onPress={openUpdateSheet}
						/>

						{/*
						 * OTA bildirim tercihi (expo-updates · custom server).
						 * KAPALI (varsayılan): JS güncellemesi sessizce iner,
						 * arka plana geçtiğinizde uygulanır — uygulamaya
						 * dönüşte yeni sürüm zaten aktiftir, fark etmez.
						 * AÇIK: indirilen her sürümde "Şimdi yenile?" sorusu.
						 * Kontrol akışı RootLayout'tan yürür; burada sadece tercih.
						 */}
						<SettingRow
							icon="sparkles-outline"
							iconBg="#F59E0B"
							label="Güncelleme Bildirimi"
							subtitle={
								otaNotifyEnabled
									? "İndirilen her sürümde onay sorulur"
									: "Sessizce uygulanır · arka planda otomatik"
							}
							showChevron={false}
							rightComponent={
								<Switch
									value={otaNotifyEnabled}
									trackColor={{
										false: colors.border,
										true: colors.primary,
									}}
									thumbColor="#ffffff"
								/>
							}
							onPress={() => {
								const next = !otaNotifyEnabled;
								setOtaNotifyEnabled(next);
								setNotifyOnUpdate(next);
							}}
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
									: openLogin(router)
							}
						/>

						{/* TV'de Oturum Aç — kodu ONAYLAYAN taraf telefon olmalıdır.
						    Bu yüzden satır TV'de gizlenir: TV kendi kodunu onaylayamaz
						    (bkz. plan §4.1-4.2). TV'de giriş gerektiğinde yukarıdaki
						    satır doğrudan kod + QR ekranını açar. */}
						{!isTV ? (
							<SettingRow
								icon="tv-outline"
								iconBg="#0EA5E9"
								label="TV'de Oturum Aç"
								subtitle="Kod ya da QR okutarak TV'nizi bağlayın"
								onPress={() =>
									isLoggedIn
										? router.push(
												"/(app)/settings/tv-connect",
											)
										: openLogin(router)
								}
							/>
						) : null}

						{/* Oturum Teşhisi */}
						{/*
						 * Geçici teşhis aracı: "uygulama kendiliğinden çıkış
						 * yapıyor" belirtisinin nedenini cihazda gösterir.
						 * Sorun kapanınca bu satır kaldırılabilir.
						 */}
						<SettingRow
							icon="bug-outline"
							iconBg="#EF4444"
							label="Oturum Teşhisi"
							subtitle="Çıkış olaylarının kaydı (hata ayıklama)"
							onPress={() =>
								router.push("/(app)/settings/authDiag")
							}
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
									focusedStyle={
										styles.modalCloseButtonFocused
									}
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
									focusedStyle={
										styles.modalCloseButtonFocused
									}
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
									focusedStyle={
										styles.modalCloseButtonFocused
									}
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
										focusedStyle={
											styles.modalOptionCardFocused
										}
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
													borderColor: colors.primary,
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
	},
	scrollContent: {
		paddingHorizontal: 16,
		paddingTop: 16,
		paddingBottom: 20,
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
	modalHeader: {
		flexDirection: "row",
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
