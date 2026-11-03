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
import { FontFamily, Palette } from "@/constants/theme";
import { useNavLayout } from "@/hooks/useNavLayout";
import { fetchPlatforms } from "@/services/api";
import { bildirimTercihListesi } from "@/services/bildirimApi";
import { getNotifyOnUpdate, setNotifyOnUpdate } from "@/services/otaUpdate";
import {
	pushTercihOku,
	pushTercihYaz,
	saatEtiketi,
	VARSAYILAN_SECENEKLER,
} from "@/services/pushApi";
import { hasSession } from "@/services/token";
import { openLogin } from "@/utils/authRoutes";
import { buildPermissionRows, getPermissionStatuses } from "@/utils/permissions";
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
	Linking,
	Modal,
	Platform,
	ScrollView,
	StatusBar,
	StyleSheet,
	Switch,
	Text,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/** Geniş ekranda (TV / tablet yatay) soldaki kategori menüsü. */
const MENU_SECTIONS = [
	{
		key: "content",
		icon: "extension-puzzle-outline",
		label: "İçerik & Kaynaklar",
		subtitle: "Eklentiler, sağlayıcılar",
	},
	{
		key: "player",
		icon: "play-circle-outline",
		label: "Oynatıcı & Görünüm",
		subtitle: "Kalite, altyazı, düzen",
	},
	{
		key: "app",
		icon: "options-outline",
		label: "Uygulama & Tercihler",
		subtitle: "Genel, güncelleme",
	},
	{
		key: "notify",
		icon: "notifications-outline",
		label: "Bildirimler",
		subtitle: "Özet push, saat",
	},
	{
		key: "system",
		icon: "server-outline",
		label: "Sistem & Veri",
		subtitle: "Senkron, sıfırlama",
	},
];

/** Bölüm kabı: geniş ekranda yalnız seçili kategoriyi gösterir. */
function Pane({ index, activeIndex, children }) {
	if (activeIndex != null && activeIndex !== index) return null;
	return children;
}

// Modern categorized menu item component
function SettingRow({
	icon,
	label,
	subtitle,
	badgeText,
	badgeColor,
	rightComponent,
	onPress,
	showChevron = true,
	isDestructive = false,
}) {
	return (
		<TVPressable
			style={({ focused }) => [
				styles.settingRow,
				focused && styles.settingRowFocused,
			]}
			focusedStyle={null}
			onPress={onPress}
			disabled={!onPress && !rightComponent}
			activeOpacity={onPress ? 0.65 : 1}>
			<View style={styles.settingRowLeft}>
				<View style={styles.iconBox}>
					<Ionicons
						name={icon}
						size={17}
						color={
							isDestructive ? Palette.error : Palette.onSurfaceVariant
						}
					/>
				</View>
				<View style={styles.textContainer}>
					<Text
						numberOfLines={1}
						style={[
							styles.settingLabel,
							isDestructive && styles.settingLabelDanger,
						]}>
						{label}
					</Text>
					{subtitle ? (
						<Text
							style={styles.settingSubtitle}
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
							badgeColor ? { backgroundColor: badgeColor } : null,
						]}>
						<Text
							numberOfLines={1}
							style={[
								styles.badgeText,
								badgeColor ? styles.badgeTextOnColor : null,
							]}>
							{badgeText}
						</Text>
					</View>
				) : null}

				{rightComponent}

				{showChevron && !rightComponent && (
					<Ionicons
						name="chevron-forward"
						size={15}
						color={Palette.onSurfaceVariant}
						style={{ opacity: 0.6 }}
					/>
				)}
			</View>
		</TVPressable>
	);
}

// Category Section Card with Title
function SettingsSection({ title, children }) {
	return (
		<View style={styles.sectionContainer}>
			{title ? (
				<Text style={styles.sectionHeaderTitle} numberOfLines={1}>
					{title}
				</Text>
			) : null}
			<View style={styles.sectionCard}>
				{React.Children.map(children, (child, index) => {
					if (!child) return null;
					const isLast = index === React.Children.count(children) - 1;
					return (
						<React.Fragment key={index}>
							{child}
							{!isLast && <View style={styles.rowDivider} />}
						</React.Fragment>
					);
				})}
			</View>
		</View>
	);
}

export default function SettingsScreen() {
	const { theme, toggleTheme, colors } = useThemeContext();
	const { isLoggedIn, user } = useAuth();
	const router = useRouter();
	// Sol ray (TV / tablet yatay) varken icerik sola kayar.
	const { contentPaddingLeft } = useNavLayout();
	// TV: ayar satırları 1920px boyunca uzanıyordu; ikon solda, değer
	// tamamen sağda kalıyor ve aradaki boşluk okunmuyordu. `contentMaxWidth`
	// hepsini ortalanmış bir sütuna toplar.
	const { contentMaxWidth, isTV, isWide } = useTvMetrics();
	// Geniş ekranda sol menüden seçilen kategori.
	const [activeSection, setActiveSection] = useState(0);
	const paneIndex = isWide ? activeSection : null;

	const [selectedPlatform, setSelectedPlatform] = useState(null);
	const [activePluginsCount, setActivePluginsCount] = useState(0);
	const [totalPluginsCount, setTotalPluginsCount] = useState(0);
	// İzinler rozeti (madde 3): eksik zorunlu izin sayısı.
	const [permissionBadge, setPermissionBadge] = useState(null);
	const [permissionSummary, setPermissionSummary] = useState(null);

	useEffect(() => {
		if (Platform.OS !== "android") return;
		let isMounted = true;
		(async () => {
			try {
				const { sdk, statuses } = await getPermissionStatuses();
				if (!isMounted) return;
				const missing = buildPermissionRows(statuses, sdk).filter(
					(r) => r.required && r.status !== "granted" && r.status !== "not_required",
				);
				if (missing.length) {
					setPermissionBadge(missing.length);
					setPermissionSummary(`${missing.map((m) => m.label).join(", ")} eksik`);
				}
			} catch (e) {
				console.warn("İzin rozeti okunamadı:", e?.message);
			}
		})();
		return () => {
			isMounted = false;
		};
	}, []);


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

	/*
	 * Günlük özet push tercihi (sunucu Faz 5 sözleşmesi):
	 *
	 * - `pushTercihOku` giriş yoksa `null` döner → bilinen varsayılanla
	 *   gösterir ama Switch kilidini `pushOturumVar` taşır (hesap şart).
	 * - Yazımlar güvenlidir: başarıda sunucunun döndürdüğü tercih yazılır;
	 *   hatada yerel değer GERİ alınır ve kullanıcı bilgilendirilir.
	 */
	const [pushTercihi, setPushTercihi] = useState(VARSAYILAN_SECENEKLER);
	const [pushOturumVar, setPushOturumVar] = useState(false);
	const [pushYaziyor, setPushYaziyor] = useState(false);
	const [pushSaatModal, setPushSaatModal] = useState(false);

	useFocusEffect(
		useCallback(() => {
			let isMounted = true;
			async function pushYukle() {
				const [oturum, tercih] = await Promise.all([
					hasSession(),
					pushTercihOku(),
				]);
				if (!isMounted) return;
				setPushOturumVar(Boolean(oturum));
				if (tercih) setPushTercihi(tercih);
				else if (!oturum) setPushTercihi(VARSAYILAN_SECENEKLER);
			}
			pushYukle();
			return () => {
				isMounted = false;
			};
		}, []),
	);

	const pushToggle = useCallback(async () => {
		if (!pushOturumVar || pushYaziyor) return;
		const sonraki = !pushTercihi.enabled;
		setPushTercihi((eski) => ({ ...eski, enabled: sonraki }));
		const sonuc = await pushTercihYaz({ enabled: sonraki });
		if (!sonuc.ok) {
			setPushTercihi((eski) => ({ ...eski, enabled: !sonraki }));
			Alert.alert(
				"Ayar yazılamadı",
				sonuc.mesaj || "Sunucuya ulaşılamadı.",
			);
		} else if (sonuc.data) {
			setPushTercihi(sonuc.data);
		}
	}, [pushOturumVar, pushYaziyor, pushTercihi.enabled]);

	const pushSaatSec = useCallback(
		async (saat) => {
			setPushSaatModal(false);
			if (!pushOturumVar || pushYaziyor) return;
			if (saat === pushTercihi.saat) return;
			const onceki = pushTercihi.saat;
			setPushTercihi((eski) => ({ ...eski, saat }));
			setPushYaziyor(true);
			const sonuc = await pushTercihYaz({
				enabled: pushTercihi.enabled,
				saat,
			});
			setPushYaziyor(false);
			if (!sonuc.ok) {
				setPushTercihi((eski) => ({ ...eski, saat: onceki }));
				Alert.alert(
					"Saat yazılamadı",
					sonuc.mesaj || "Sunucuya ulaşılamadı.",
				);
			}
		},
		[pushOturumVar, pushYaziyor, pushTercihi],
	);

	// ─── Takip edilen diziler (özet girdi) ─────────────────────────
	// Listenin TAMAMI `/(app)/settings/takipEdilen` sayfasında yönetilir
	// (eklenti filtresi + sıralama); burada yalnız ÖZET girdi var:
	// `GET /settings-list` adedi tazeler, odağa her girişte yenilenir.
	// Oturumsuz ekranda girdi gizli.
	const [takipListesi, setTakipListesi] = useState([]);
	const [takipYuklendi, setTakipYuklendi] = useState(false);

	useFocusEffect(
		useCallback(() => {
			let isMounted = true;
			async function takipYukle() {
				const oturumVar = Boolean(await hasSession());
				let satirlar = [];
				if (oturumVar) {
					satirlar = await bildirimTercihListesi();
				}
				if (!isMounted) return;
				setTakipListesi(Array.isArray(satirlar) ? satirlar : []);
				setTakipYuklendi(true);
			}
			takipYukle();
			return () => {
				isMounted = false;
			};
		}, []),
	);


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

	const displayName = user?.display_name || user?.username || "Misafir";
	const avatarLetter = String(displayName).trim().charAt(0).toUpperCase();

	const renderHeader = () => (
		<View style={{ marginBottom: 16 }}>
			<View style={styles.titleRow}>
				<Text numberOfLines={1} style={styles.screenTitle}>
					Ayarlar
				</Text>
			</View>
			<Text numberOfLines={1} style={styles.headerSubtitle}>
				StreamPulse cihaz tercihleri ve kişisel oynatma profili
			</Text>

			<View style={styles.profileCard}>
				<View style={styles.avatar}>
					<Text style={styles.avatarText}>{avatarLetter}</Text>
				</View>
				<View style={styles.flex}>
					<Text numberOfLines={1} style={styles.profileName}>
						{displayName}
					</Text>
					<Text numberOfLines={1} style={styles.profileMail}>
						{user?.email || "Giriş yapılmadı"}
					</Text>
				</View>
				<TVPressable
					onPress={() =>
						isLoggedIn
							? router.push("/(app)/profile")
							: openLogin(router)
					}
					focusedStyle={null}
					style={({ focused }) => [
						styles.profileBtn,
						focused && styles.profileBtnFocused,
					]}>
					<Ionicons
						name="person-outline"
						size={14}
						color={Palette.onPrimaryContainer}
					/>
					<Text numberOfLines={1} style={styles.profileBtnText}>
						{isLoggedIn ? "Profil Düzenle" : "Giriş Yap"}
					</Text>
				</TVPressable>
			</View>
		</View>
	);

	return (
		<>
			<Stack.Screen options={{ headerShown: false }} />
			<SafeAreaView
				edges={["top", "left", "right"]}
				style={[
					styles.safeArea,
					{
						backgroundColor: Palette.background,
						paddingLeft: contentPaddingLeft,
					},
				]}>
				<StatusBar barStyle="light-content" backgroundColor={Palette.background} />

				<View
					style={[
						styles.twoPane,
						contentMaxWidth
							? {
									alignSelf: "center",
									width: "100%",
									maxWidth: contentMaxWidth,
								}
							: null,
					]}>
					{isWide ? (
						<View style={styles.menuColumn}>
							<Text style={styles.menuTitle}>YAPILANDIRMA MENÜSÜ</Text>
							{MENU_SECTIONS.map((item, index) => {
								const active = activeSection === index;
								return (
									<TVPressable
										key={item.key}
										onPress={() => setActiveSection(index)}
										focusedStyle={null}
										style={({ focused }) => [
											styles.menuItem,
											active && styles.menuItemActive,
											focused && styles.menuItemFocused,
										]}>
										<Ionicons
											name={item.icon}
											size={17}
											color={
												active
													? Palette.primary
													: Palette.onSurfaceVariant
											}
										/>
										<View style={styles.flex}>
											<Text
												numberOfLines={1}
												style={[
													styles.menuLabel,
													active && styles.menuLabelActive,
												]}>
												{item.label}
											</Text>
											<Text
												numberOfLines={1}
												style={styles.menuSub}>
												{item.subtitle}
											</Text>
										</View>
										{active ? (
											<View style={styles.menuDot} />
										) : null}
									</TVPressable>
								);
							})}
						</View>
					) : null}

					<ScrollView
						contentInsetAdjustmentBehavior="automatic"
						showsVerticalScrollIndicator={false}
						style={styles.flex}
						contentContainerStyle={styles.scrollContent}>
						{renderHeader()}
					{/* KATEGORİ 1: İÇERİK VE KAYNAKLAR */}
					<Pane index={0} activeIndex={paneIndex}>
						<SettingsSection title="İÇERİK VE KAYNAKLAR">
						{/* Eklentiler */}
						<SettingRow
							icon="extension-puzzle-outline"
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
					</Pane>

					{/* KATEGORİ 2: OYNATMA VE GÖRÜNÜM */}
					<Pane index={1} activeIndex={paneIndex}>
						<SettingsSection title="OYNATMA VE GÖRÜNÜM">
						{/* Oynatıcı */}
						<SettingRow
							icon="play-circle-outline"
							label="Oynatıcı"
							subtitle="Altyazı boyutu, renk, ileri/geri sarma, jestler"
							onPress={() =>
								router.push({
									pathname: "/(app)/settings/player",
								})
							}
						/>

						{/* İndirme (download_feature_plan.md Faz 3) */}
						<SettingRow
							icon="download-outline"
							label="İndirme"
							subtitle="Eş zamanlı indirme, konum ve eklenti tercihleri"
							onPress={() =>
								router.push({
									pathname: "/(app)/settings/download",
								})
							}
						/>

						{/* İzinler (madde 3) — eksik zorunlu izin varsa rozet kırmızı */}
						<SettingRow
							icon="shield-outline"
							label="İzinler"
							isDestructive={Boolean(permissionBadge)}
							subtitle={
								permissionSummary || "İndirme, bildirim ve yükleme izinleri"
							}
							onPress={() =>
								router.push({
									pathname: "/(app)/settings/permissions",
								})
							}
						/>

						{/* Düzen */}
						<SettingRow
							icon="grid-outline"
							label="Düzen"
							subtitle="Ana sayfa yerleşimi ve kart boyutları"
							onPress={() => setLayoutModalVisible(true)}
						/>

						{/* Dil Gösterimi */}
						<SettingRow
							icon="language-outline"
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
					</Pane>

					{/* KATEGORİ 3: UYGULAMA VE TERCİHLER */}
					<Pane index={2} activeIndex={paneIndex}>
						<SettingsSection title="UYGULAMA VE TERCİHLER">
						{/* Genel Ayarlar */}
						<SettingRow
							icon="options-outline"
							label="Genel"
							subtitle="Koyu mod, arayüz dili ve bildirimler"
							onPress={() => setGeneralModalVisible(true)}
						/>

						{/* Hesaplar ve Güvenlik */}
						<SettingRow
							icon="shield-checkmark-outline"
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
						 * KAPALI (varsayılan): güncelleme sessizce iner ve
						 * çoğu zaman uygulama AÇILIRKEN (splash altında)
						 * kendiliğinden uygulanır; hiçbir mesaj görünmez.
						 * AÇIK: indirilen her sürümde "Şimdi yenile?" sorusu.
						 * Kontrol akışı RootLayout'tan yürür; burada sadece tercih.
						 */}
						<SettingRow
							icon="sparkles-outline"
							label="Güncelleme Bildirimi"
							subtitle={
								otaNotifyEnabled
									? "İndirilen her sürümde onay sorulur"
									: "Sessizce iner · açılışta otomatik uygulanır"
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
					</Pane>

					{/* KATEGORİ 3.5: BİLDİRİM AYARLARI (push + takip + sistem) */}
					<Pane index={3} activeIndex={paneIndex}>
						<SettingsSection title="BİLDİRİM AYARLARI">
						<SettingRow
							icon="notifications-outline"
							label="Günlük Özet Push"
							subtitle={
								!pushOturumVar
									? "Hesap gerekli — girişte cihaz otomatik kaydedilir"
									: pushTercihi.enabled
										? `Her akşam ${saatEtiketi(pushTercihi.saat)} civarı — okunmayanlardan TEK özet`
										: "Kapalı — uygulama içi gelen kutusundan izler"
							}
							showChevron={false}
							rightComponent={
								<Switch
									value={Boolean(pushTercihi.enabled)}
									trackColor={{
										false: colors.border,
										true: "#FF3D5E",
									}}
									thumbColor="#ffffff"
									disabled={!pushOturumVar || pushYaziyor}
								/>
							}
							onPress={pushToggle}
						/>
						<SettingRow
							icon="time-outline"
							label="Özet Saati"
							subtitle={
								!pushOturumVar
									? "Hesap gerekli"
									: `${saatEtiketi(pushTercihi.saat)} · ${pushTercihi.tz}`
							}
							onPress={
								pushOturumVar ? () => setPushSaatModal(true) : undefined
							}
						/>
						<SettingRow
							icon="settings-outline"
							label="Telefon Bildirim Ayarları"
							subtitle="Android'in kanal ayarları — ses, titreşim, öncelik"
							showChevron={false}
							onPress={() => {
								Linking.openSettings().catch(() => {
									Alert.alert(
										"Telefon Bildirim Ayarları",
										"Telefonun ayar sayfası açılamadı.",
									);
								});
							}}
						/>
						{pushOturumVar && takipYuklendi ? (
							<SettingRow
								icon="tv-outline"
								label="Takip Edilen Diziler"
								subtitle={
									takipListesi.length > 0
										? `${takipListesi.length} dizi — listeyi kendi sayfasında yönet`
										: "Henüz takip yok — dizinin sayfasında zile dokun"
								}
								onPress={() =>
									router.push("/(app)/settings/takipEdilen")
								}
							/>
						) : null}
						</SettingsSection>
					</Pane>

					{/* KATEGORİ 4: SİSTEM VE YEDEKLEME */}
					<Pane index={4} activeIndex={paneIndex}>
						<SettingsSection title="SİSTEM VE VERİ">
						{/* Cihazlar ve Senkronizasyon */}
						<SettingRow
							icon="phone-portrait-outline"
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
							label="Oturum Teşhisi"
							subtitle="Çıkış olaylarının kaydı (hata ayıklama)"
							onPress={() =>
								router.push("/(app)/settings/authDiag")
							}
						/>

						{/* Yerel Verileri Sıfırla */}
						<SettingRow
							icon="trash-outline"
							label="Verileri Sıfırla"
							subtitle="Tüm yerel verileri ve geçmişi temizle"
							isDestructive
							showChevron={false}
							onPress={handleClearCache}
						/>
						</SettingsSection>
					</Pane>

					<View style={{ height: 60 }} />
					</ScrollView>
				</View>

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

							{/* Telefon Bildirim Ayarları */}
							<TVPressable
								style={styles.modalRow}
								focusedStyle={styles.settingRowFocused}
								onPress={() => {
									Linking.openSettings().catch(() => {
										Alert.alert(
											"Telefon Bildirim Ayarları",
											"Telefonun ayar sayfası açılamadı.",
										);
									});
								}}>
								<View style={styles.modalRowInfo}>
									<Text
										style={[
											styles.modalRowTitle,
											{ color: colors.text },
										]}>
										Telefon Bildirim Ayarları
									</Text>
									<Text
										style={[
											styles.modalRowSubtitle,
											{ color: colors.textSecondary },
										]}>
										Bildirim kanalları telefonun ayarlarında yönetilir
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

				{/* ÖZET SAATİ MODAL — 0..23 ızgara */}
				<Modal
					visible={pushSaatModal}
					animationType="fade"
					transparent={true}
					onRequestClose={() => setPushSaatModal(false)}>
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
									Özet Saati
								</Text>
								<TVPressable
									focusedStyle={
										styles.modalCloseButtonFocused
									}
									onPress={() => setPushSaatModal(false)}
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
							<View style={styles.pushSaatIzgarasi}>
								{Array.from({ length: 24 }, (_, i) => i).map(
									(saat) => (
										<TVPressable
											key={saat}
											style={styles.pushSaatHane}
											focusedStyle={
												styles.pushSaatHaneOdakli
											}
											onPress={() => pushSaatSec(saat)}>
											<Text
												style={[
													styles.pushSaatYazi,
													{
														color:
															saat ===
															pushTercihi.saat
																? "#ffffff"
																: colors.text,
													},
												]}>
												{saatEtiketi(saat)}
											</Text>
										</TVPressable>
									),
								)}
							</View>
							<Text
								style={[
									styles.pushSaatNot,
									{ color: colors.textSecondary },
								]}>
								Özet, seçtiğin saatte cihazın KENDİ saat
								diliminde gelir ({pushTercihi.tz}).
							</Text>
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
		backgroundColor: Palette.background,
	},
	flex: {
		flex: 1,
	},
	twoPane: {
		flex: 1,
		flexDirection: "row",
	},
	menuColumn: {
		width: 250,
		paddingTop: 20,
		paddingHorizontal: 16,
		gap: 4,
	},
	menuTitle: {
		color: Palette.onSurfaceVariant,
		fontFamily: FontFamily.bold,
		fontSize: 10,
		letterSpacing: 1.1,
		marginBottom: 8,
		paddingHorizontal: 8,
	},
	menuItem: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		paddingHorizontal: 10,
		paddingVertical: 10,
		borderRadius: 12,
		borderWidth: 2,
		borderColor: "transparent",
	},
	menuItemActive: {
		backgroundColor: Palette.surfaceLow,
	},
	menuItemFocused: {
		borderColor: Palette.primary,
	},
	menuLabel: {
		color: Palette.onSurface,
		fontFamily: FontFamily.semiBold,
		fontSize: 13,
	},
	menuLabelActive: {
		color: Palette.primary,
	},
	menuSub: {
		color: Palette.onSurfaceVariant,
		fontFamily: FontFamily.regular,
		fontSize: 10,
		marginTop: 1,
	},
	menuDot: {
		width: 6,
		height: 6,
		borderRadius: 3,
		backgroundColor: Palette.secondary,
	},

	/* Başlık + profil */
	titleRow: {
		flexDirection: "row",
		alignItems: "center",
	},
	screenTitle: {
		color: Palette.onSurface,
		fontFamily: FontFamily.bold,
		fontSize: 30,
		letterSpacing: -0.4,
	},
	headerSubtitle: {
		color: Palette.onSurfaceVariant,
		fontFamily: FontFamily.medium,
		fontSize: 12,
		marginTop: 2,
	},
	profileCard: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		marginTop: 12,
		padding: 12,
		borderRadius: 14,
		backgroundColor: Palette.surfaceLow,
	},
	avatar: {
		width: 38,
		height: 38,
		borderRadius: 19,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: Palette.surfaceHigh,
	},
	avatarText: {
		color: Palette.primary,
		fontFamily: FontFamily.bold,
		fontSize: 15,
	},
	profileName: {
		color: Palette.onSurface,
		fontFamily: FontFamily.semiBold,
		fontSize: 14,
	},
	profileMail: {
		color: Palette.onSurfaceVariant,
		fontFamily: FontFamily.regular,
		fontSize: 11,
		marginTop: 1,
	},
	profileBtn: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		paddingHorizontal: 12,
		paddingVertical: 8,
		borderRadius: 18,
		backgroundColor: Palette.primaryContainer,
		borderWidth: 2,
		borderColor: "transparent",
	},
	profileBtnFocused: {
		borderColor: Palette.onSurface,
	},
	profileBtnText: {
		color: Palette.onPrimaryContainer,
		fontFamily: FontFamily.bold,
		fontSize: 12,
	},

	scrollContent: {
		paddingHorizontal: 16,
		paddingTop: 20,
		paddingBottom: 20,
	},
	sectionContainer: {
		marginBottom: 16,
	},
	sectionHeaderTitle: {
		fontSize: 10,
		fontFamily: FontFamily.bold,
		letterSpacing: 1.1,
		textTransform: "uppercase",
		color: Palette.onSurfaceVariant,
		paddingHorizontal: 6,
		marginBottom: 8,
	},
	sectionCard: {
		borderRadius: 14,
		backgroundColor: Palette.surfaceLow,
		overflow: "hidden",
	},
	settingRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: 12,
		paddingVertical: 11,
		minHeight: 52,
		borderWidth: 2,
		borderColor: "transparent",
	},
	settingRowFocused: {
		backgroundColor: "rgba(192, 193, 255, 0.06)",
		borderColor: Palette.primary,
	},
	settingRowLeft: {
		flexDirection: "row",
		alignItems: "center",
		flex: 1,
		gap: 12,
	},
	iconBox: {
		width: 32,
		height: 32,
		borderRadius: 16,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: Palette.surfaceHigh,
	},
	textContainer: {
		flex: 1,
	},
	settingLabel: {
		fontSize: 13,
		fontFamily: FontFamily.semiBold,
		color: Palette.onSurface,
		letterSpacing: -0.1,
	},
	settingLabelDanger: {
		color: Palette.error,
	},
	settingSubtitle: {
		fontSize: 11,
		fontFamily: FontFamily.regular,
		color: Palette.onSurfaceVariant,
		marginTop: 1,
	},
	settingRowRight: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		flexShrink: 1,
	},
	badge: {
		paddingHorizontal: 8,
		paddingVertical: 2,
		borderRadius: 8,
		backgroundColor: "rgba(192, 193, 255, 0.14)",
	},
	badgeText: {
		fontSize: 10,
		fontFamily: FontFamily.bold,
		color: Palette.primary,
	},
	badgeTextOnColor: {
		color: Palette.onPrimaryContainer,
	},
	rowDivider: {
		height: 1,
		marginLeft: 56,
		backgroundColor: "rgba(229, 225, 228, 0.07)",
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
	modalOptionCardFocused: {
		borderWidth: 2,
		borderColor: Palette.primary,
	},
	modalCloseButtonFocused: {
		borderWidth: 2,
		borderColor: "#ffffff",
		transform: [{ scale: 1.04 }],
	},
	pushSaatIzgarasi: {
		flexDirection: "row",
		flexWrap: "wrap",
		justifyContent: "center",
		gap: 8,
		paddingVertical: 8,
	},
	pushSaatHane: {
		alignItems: "center",
		justifyContent: "center",
		width: 64,
		height: 40,
		borderRadius: 10,
		borderColor: "rgba(255,255,255,0.12)",
		borderWidth: 1,
	},
	pushSaatHaneOdakli: {
		borderWidth: 2,
		borderColor: "#ffffff",
		transform: [{ scale: 1.05 }],
	},
	pushSaatYazi: {
		fontSize: 14,
		fontWeight: "600",
	},
	pushSaatNot: {
		fontSize: 12,
		textAlign: "center",
		marginTop: 8,
	},
});
