import TVPressable from "@/components/common/TVPressable";
import { usePlayerSettings } from "@/context/PlayerSettingsContext";
import { useThemeContext } from "@/context/ThemeContext";
import { useTvMetrics } from "@/utils/tvMetrics";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { useCallback } from "react";
import {
	Alert,
	BackHandler,
	ScrollView,
	StatusBar,
	StyleSheet,
	Switch,
	Text,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const FONT_SIZE_OPTIONS = [
	{ label: "Küçük", value: 14 },
	{ label: "Normal", value: 16 },
	{ label: "Büyük", value: 20 },
	{ label: "Ekstra", value: 24 },
];

const COLOR_OPTIONS = [
	{
		label: "Beyaz",
		value: "#FFFFFF",
		color: "#FFFFFF",
		textColor: "#000000",
	},
	{ label: "Sarı", value: "#FFD600", color: "#FFD600", textColor: "#000000" },
	{
		label: "Yeşil",
		value: "#00E676",
		color: "#00E676",
		textColor: "#000000",
	},
	{
		label: "Camgöbeği",
		value: "#00E5FF",
		color: "#00E5FF",
		textColor: "#000000",
	},
];

const BG_STYLE_OPTIONS = [
	{ label: "Yarı Saydam", value: "semi-black" },
	{ label: "Tam Siyah", value: "solid-black" },
	{ label: "Mat Koyu", value: "blur" },
	{ label: "Saydam", value: "transparent" },
];

const SEEK_DURATION_OPTIONS = [
	{ label: "5 sn", value: 5 },
	{ label: "10 sn", value: 10 },
	{ label: "15 sn", value: 15 },
	{ label: "30 sn", value: 30 },
	{ label: "60 sn", value: 60 },
];

const TIMEOUT_OPTIONS = [
	{ label: "3 sn", value: 3 },
	{ label: "4 sn", value: 4 },
	{ label: "5 sn", value: 5 },
	{ label: "8 sn", value: 8 },
];

const DEFAULT_LANG_OPTIONS = [
	{ label: "Türkçe", value: "tr" },
	{ label: "İngilizce", value: "en" },
	{ label: "Kapalı", value: "off" },
];

const RESIZE_OPTIONS = [
	{ label: "Sığdır", value: "contain" },
	{ label: "Doldur", value: "cover" },
	{ label: "Ger", value: "stretch" },
];

const SPEED_OPTIONS = [
	{ label: "0.25×", value: 0.25 },
	{ label: "0.5×", value: 0.5 },
	{ label: "0.75×", value: 0.75 },
	{ label: "Normal", value: 1 },
	{ label: "1.25×", value: 1.25 },
	{ label: "1.5×", value: 1.5 },
	{ label: "1.75×", value: 1.75 },
	{ label: "2×", value: 2 },
];

const SPEEDUP_DELAY_OPTIONS = [
	{ label: "300 ms", value: 300 },
	{ label: "500 ms", value: 500 },
	{ label: "800 ms", value: 800 },
	{ label: "1200 ms", value: 1200 },
];

/**
 * Ayar anahtarı satırı — yeni bölümlerde tekrarı önler.
 *
 * ⚠️ `TVPressable` + `Switch` ikilisi kasıtlıdır: TV kumandasıyla
 * gezinirken `Switch`'e odaklanmak zordur, bu yüzden satırın TAMAMI
 * basılabilir ve `Switch` yalnızca görsel gösterge.
 */
function ToggleRow({ colors, icon, title, subtitle, value, onChange }) {
	return (
		<TVPressable
			style={styles.toggleRow}
			focusedStyle={styles.toggleRowFocused}
			onPress={() => onChange(!value)}
			accessibilityRole="switch"
			accessibilityState={{ checked: Boolean(value) }}>
			<View style={styles.toggleRowLeft}>
				<Ionicons name={icon} size={20} color={colors.primary} />
				<View style={styles.toggleTextContainer}>
					<Text style={[styles.toggleTitle, { color: colors.text }]}>
						{title}
					</Text>
					<Text
						style={[
							styles.toggleSubtitle,
							{ color: colors.textSecondary },
						]}>
						{subtitle}
					</Text>
				</View>
			</View>
			<Switch
				value={Boolean(value)}
				onValueChange={(val) => onChange(val)}
				trackColor={{ false: colors.border, true: colors.primary }}
				thumbColor="#ffffff"
			/>
		</TVPressable>
	);
}

export default function PlayerSettingsScreen() {
	const { colors } = useThemeContext();
	const router = useRouter();
	// TV: oynatıcı ayarları ortalanmış sütuna alınır (bkz. utils/tvMetrics.js).
	const { contentMaxWidth } = useTvMetrics();
	const { settings, updateSettings, resetSettings } = usePlayerSettings();

	useFocusEffect(
		useCallback(() => {
			const onBackPress = () => {
				if (router.canGoBack()) router.back();
				else router.replace("/(app)/settings");
				return true;
			};
			const subscription = BackHandler.addEventListener(
				"hardwareBackPress",
				onBackPress,
			);
			return () => subscription.remove();
		}, [router]),
	);

	const handleReset = () => {
		Alert.alert(
			"Ayarları Sıfırla",
			"Tüm oynatıcı ve altyazı ayarları varsayılan değerlere döndürülsün mü?",
			[
				{ text: "Vazgeç", style: "cancel" },
				{
					text: "Sıfırla",
					style: "destructive",
					onPress: async () => {
						await resetSettings();
					},
				},
			],
		);
	};

	// Altyazı arkaplan rengi hesabı
	const getSubtitleBgColorStyle = () => {
		switch (settings.subtitleBgColor) {
			case "solid-black":
				return { backgroundColor: "#000000" };
			case "blur":
				return { backgroundColor: "rgba(25, 27, 34, 0.92)" };
			case "transparent":
				return { backgroundColor: "transparent" };
			case "semi-black":
			default:
				return { backgroundColor: "rgba(0, 0, 0, 0.78)" };
		}
	};

	return (
		<>
			<Stack.Screen options={{ headerShown: false }} />
			<SafeAreaView
				edges={["top", "left", "right", "bottom"]}
				style={[styles.safeArea, { backgroundColor: colors.bg }]}>
				<StatusBar
					barStyle="light-content"
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
						focusedStyle={styles.headerButtonFocused}>
						<Ionicons
							name="arrow-back"
							size={24}
							color={colors.text}
						/>
					</TVPressable>
					<Text style={[styles.headerTitle, { color: colors.text }]}>
						Oynatıcı ve Altyazı
					</Text>
					<TVPressable
						onPress={handleReset}
						style={styles.resetButton}
						focusedStyle={styles.headerButtonFocused}>
						<Text
							style={[
								styles.resetButtonText,
								{ color: colors.primary },
							]}>
							Sıfırla
						</Text>
					</TVPressable>
				</View>

				<ScrollView
					contentInsetAdjustmentBehavior="automatic"
					showsVerticalScrollIndicator={false}
					contentContainerStyle={[
						styles.scrollContainer,
						contentMaxWidth
							? {
									alignSelf: "center",
									width: "100%",
									maxWidth: contentMaxWidth,
								}
							: null,
					]}>
					{/* Canlı Altyazı Önizleme Kartı */}
					<View style={styles.previewSection}>
						<View style={styles.previewHeaderRow}>
							<Text
								style={[
									styles.sectionHeader,
									{
										color: colors.textSecondary,
										paddingHorizontal: 0,
									},
								]}>
								CANLI ALTYAZI ÖNİZLEME
							</Text>
							<View style={styles.liveBadge}>
								<View style={styles.liveDot} />
								<Text style={styles.liveBadgeText}>Canlı</Text>
							</View>
						</View>

						{/* Mock Video Ekranı */}
						<View style={styles.mockVideoScreen}>
							{/* Arka plan sinematik silüeti */}
							<View style={styles.mockVideoBackdrop}>
								<Ionicons
									name="film-outline"
									size={52}
									color="rgba(255, 255, 255, 0.12)"
								/>
								<Text style={styles.mockVideoInfoText}>
									Cineverse Sinema Oynatıcısı
								</Text>
							</View>

							{/* Canlı Altyazı Kutusu */}
							<View style={styles.mockSubtitleContainer}>
								<View
									style={[
										styles.mockSubtitlePill,
										getSubtitleBgColorStyle(),
									]}>
									<Text
										style={[
											styles.mockSubtitleText,
											{
												fontSize:
													settings.subtitleFontSize ||
													16,
												lineHeight: Math.round(
													(settings.subtitleFontSize ||
														16) * 1.35,
												),
												color:
													settings.subtitleTextColor ||
													"#FFFFFF",
												textShadowColor:
													settings.subtitleTextShadow
														? "rgba(0, 0, 0, 0.95)"
														: "transparent",
												textShadowRadius:
													settings.subtitleTextShadow
														? 3
														: 0,
											},
										]}>
										— Gerçek mutluluk sadece paylaşıldığında
										gerçektir.
									</Text>
								</View>
							</View>
						</View>
					</View>

					{/* 1. BÖLÜM: ALTYAZI GÖRÜNÜMÜ */}
					<View style={styles.section}>
						<Text
							style={[
								styles.sectionHeader,
								{ color: colors.textSecondary },
							]}>
							ALTYAZI GÖRÜNÜMÜ
						</Text>

						<View
							style={[
								styles.settingsGroup,
								{
									backgroundColor: colors.cardBg,
									borderColor: colors.border,
								},
							]}>
							{/* Yazı Boyutu */}
							<View style={styles.settingBlock}>
								<View style={styles.settingBlockHeader}>
									<Ionicons
										name="text-outline"
										size={20}
										color={colors.primary}
									/>
									<Text
										style={[
											styles.settingBlockTitle,
											{ color: colors.text },
										]}>
										Yazı Boyutu ({settings.subtitleFontSize}
										px)
									</Text>
								</View>
								<View style={styles.chipsRow}>
									{FONT_SIZE_OPTIONS.map((item) => {
										const isSelected =
											settings.subtitleFontSize ===
											item.value;
										return (
											<TVPressable
												key={item.value}
												style={[
													styles.chip,
													{
														backgroundColor:
															isSelected
																? colors.primary
																: `${colors.border}40`,
														borderColor: isSelected
															? colors.primary
															: colors.border,
													},
												]}
												focusedStyle={
													styles.chipFocused
												}
												onPress={() =>
													updateSettings({
														subtitleFontSize:
															item.value,
													})
												}
												activeOpacity={0.7}>
												<Text
													style={[
														styles.chipText,
														{
															color: isSelected
																? "#FFFFFF"
																: colors.text,
															fontWeight:
																isSelected
																	? "700"
																	: "500",
														},
													]}>
													{item.label}
												</Text>
											</TVPressable>
										);
									})}
								</View>
							</View>

							<View
								style={[
									styles.divider,
									{ backgroundColor: colors.border },
								]}
							/>

							{/* Metin Rengi */}
							<View style={styles.settingBlock}>
								<View style={styles.settingBlockHeader}>
									<Ionicons
										name="color-palette-outline"
										size={20}
										color={colors.primary}
									/>
									<Text
										style={[
											styles.settingBlockTitle,
											{ color: colors.text },
										]}>
										Metin Rengi
									</Text>
								</View>
								<View style={styles.colorRow}>
									{COLOR_OPTIONS.map((item) => {
										const isSelected =
											settings.subtitleTextColor ===
											item.value;
										return (
											<TVPressable
												key={item.value}
												style={[
													styles.colorCard,
													{
														backgroundColor: `${colors.border}40`,
														borderColor: isSelected
															? colors.primary
															: colors.border,
														borderWidth: isSelected
															? 2
															: 1,
													},
												]}
												focusedStyle={
													styles.colorCardFocused
												}
												onPress={() =>
													updateSettings({
														subtitleTextColor:
															item.value,
													})
												}
												activeOpacity={0.7}>
												<View
													style={[
														styles.colorCircle,
														{
															backgroundColor:
																item.color,
														},
													]}>
													{isSelected && (
														<Ionicons
															name="checkmark"
															size={16}
															color={
																item.textColor
															}
														/>
													)}
												</View>
												<Text
													style={[
														styles.colorLabel,
														{
															color: isSelected
																? colors.primary
																: colors.textSecondary,
															fontWeight:
																isSelected
																	? "700"
																	: "500",
														},
													]}>
													{item.label}
												</Text>
											</TVPressable>
										);
									})}
								</View>
							</View>

							<View
								style={[
									styles.divider,
									{ backgroundColor: colors.border },
								]}
							/>

							{/* Arka Plan Stili */}
							<View style={styles.settingBlock}>
								<View style={styles.settingBlockHeader}>
									<Ionicons
										name="layers-outline"
										size={20}
										color={colors.primary}
									/>
									<Text
										style={[
											styles.settingBlockTitle,
											{ color: colors.text },
										]}>
										Arka Plan Stili
									</Text>
								</View>
								<View style={styles.chipsRow}>
									{BG_STYLE_OPTIONS.map((item) => {
										const isSelected =
											settings.subtitleBgColor ===
											item.value;
										return (
											<TVPressable
												key={item.value}
												style={[
													styles.chip,
													{
														backgroundColor:
															isSelected
																? colors.primary
																: `${colors.border}40`,
														borderColor: isSelected
															? colors.primary
															: colors.border,
													},
												]}
												focusedStyle={
													styles.chipFocused
												}
												onPress={() =>
													updateSettings({
														subtitleBgColor:
															item.value,
													})
												}
												activeOpacity={0.7}>
												<Text
													style={[
														styles.chipText,
														{
															color: isSelected
																? "#FFFFFF"
																: colors.text,
															fontWeight:
																isSelected
																	? "700"
																	: "500",
														},
													]}>
													{item.label}
												</Text>
											</TVPressable>
										);
									})}
								</View>
							</View>

							<View
								style={[
									styles.divider,
									{ backgroundColor: colors.border },
								]}
							/>

							{/* Metin Gölgesi */}
							<TVPressable
								style={styles.toggleRow}
								focusedStyle={styles.toggleRowFocused}
								onPress={() =>
									updateSettings({
										subtitleTextShadow:
											!settings.subtitleTextShadow,
									})
								}>
								<View style={styles.toggleRowLeft}>
									<Ionicons
										name="sunny-outline"
										size={20}
										color={colors.primary}
									/>
									<View style={styles.toggleTextContainer}>
										<Text
											style={[
												styles.toggleTitle,
												{ color: colors.text },
											]}>
											Metin Gölgesi
										</Text>
										<Text
											style={[
												styles.toggleSubtitle,
												{ color: colors.textSecondary },
											]}>
											Açık renkli sahnelerde
											okunabilirliği artırır
										</Text>
									</View>
								</View>
								<Switch
									value={Boolean(settings.subtitleTextShadow)}
									onValueChange={(val) =>
										updateSettings({
											subtitleTextShadow: val,
										})
									}
									trackColor={{
										false: colors.border,
										true: colors.primary,
									}}
									thumbColor="#ffffff"
								/>
							</TVPressable>

							<View
								style={[
									styles.divider,
									{ backgroundColor: colors.border },
								]}
							/>

							{/* Varsayılan Altyazı Dili */}
							<View style={styles.settingBlock}>
								<View style={styles.settingBlockHeader}>
									<Ionicons
										name="language-outline"
										size={20}
										color={colors.primary}
									/>
									<Text
										style={[
											styles.settingBlockTitle,
											{ color: colors.text },
										]}>
										Varsayılan Altyazı Dili
									</Text>
								</View>
								<View style={styles.chipsRow}>
									{DEFAULT_LANG_OPTIONS.map((item) => {
										const isSelected =
											settings.defaultSubtitleLanguage ===
											item.value;
										return (
											<TVPressable
												key={item.value}
												style={[
													styles.chip,
													{
														backgroundColor:
															isSelected
																? colors.primary
																: `${colors.border}40`,
														borderColor: isSelected
															? colors.primary
															: colors.border,
													},
												]}
												focusedStyle={
													styles.chipFocused
												}
												onPress={() =>
													updateSettings({
														defaultSubtitleLanguage:
															item.value,
													})
												}
												activeOpacity={0.7}>
												<Text
													style={[
														styles.chipText,
														{
															color: isSelected
																? "#FFFFFF"
																: colors.text,
															fontWeight:
																isSelected
																	? "700"
																	: "500",
														},
													]}>
													{item.label}
												</Text>
											</TVPressable>
										);
									})}
								</View>
							</View>
						</View>
					</View>

					{/* 2. BÖLÜM: OYNATICI DAVRANIŞLARI */}
					<View style={styles.section}>
						<Text
							style={[
								styles.sectionHeader,
								{ color: colors.textSecondary },
							]}>
							OYNATICI AYARLARI
						</Text>

						<View
							style={[
								styles.settingsGroup,
								{
									backgroundColor: colors.cardBg,
									borderColor: colors.border,
								},
							]}>
							{/* Sarma Süresi */}
							<View style={styles.settingBlock}>
								<View style={styles.settingBlockHeader}>
									<Ionicons
										name="play-forward-outline"
										size={20}
										color={colors.primary}
									/>
									<Text
										style={[
											styles.settingBlockTitle,
											{ color: colors.text },
										]}>
										İleri / Geri Sarma Süresi
									</Text>
								</View>
								<View style={styles.chipsRow}>
									{SEEK_DURATION_OPTIONS.map((item) => {
										const isSelected =
											settings.seekDuration ===
											item.value;
										return (
											<TVPressable
												key={item.value}
												style={[
													styles.chip,
													{
														backgroundColor:
															isSelected
																? colors.primary
																: `${colors.border}40`,
														borderColor: isSelected
															? colors.primary
															: colors.border,
													},
												]}
												focusedStyle={
													styles.chipFocused
												}
												onPress={() =>
													updateSettings({
														seekDuration:
															item.value,
													})
												}
												activeOpacity={0.7}>
												<Text
													style={[
														styles.chipText,
														{
															color: isSelected
																? "#FFFFFF"
																: colors.text,
															fontWeight:
																isSelected
																	? "700"
																	: "500",
														},
													]}>
													{item.label}
												</Text>
											</TVPressable>
										);
									})}
								</View>
							</View>

							<View
								style={[
									styles.divider,
									{ backgroundColor: colors.border },
								]}
							/>

							{/* Varsayılan Ekran Boyutu */}
							<View style={styles.settingBlock}>
								<View style={styles.settingBlockHeader}>
									<Ionicons
										name="scan-outline"
										size={20}
										color={colors.primary}
									/>
									<Text
										style={[
											styles.settingBlockTitle,
											{ color: colors.text },
										]}>
										Varsayılan Görüntü Boyutu
									</Text>
								</View>
								<View style={styles.chipsRow}>
									{RESIZE_OPTIONS.map((item) => {
										const isSelected =
											settings.defaultResizeMode ===
											item.value;
										return (
											<TVPressable
												key={item.value}
												style={[
													styles.chip,
													{
														flex: 1,
														backgroundColor:
															isSelected
																? colors.primary
																: `${colors.border}40`,
														borderColor: isSelected
															? colors.primary
															: colors.border,
													},
												]}
												focusedStyle={
													styles.chipFocused
												}
												onPress={() =>
													updateSettings({
														defaultResizeMode:
															item.value,
													})
												}
												activeOpacity={0.7}>
												<Text
													style={[
														styles.chipText,
														{
															color: isSelected
																? "#FFFFFF"
																: colors.text,
															fontWeight:
																isSelected
																	? "700"
																	: "500",
														},
													]}>
													{item.label}
												</Text>
											</TVPressable>
										);
									})}
								</View>
							</View>

							<View
								style={[
									styles.divider,
									{ backgroundColor: colors.border },
								]}
							/>

							{/* Kontrollerin Gizlenme Süresi */}
							<View style={styles.settingBlock}>
								<View style={styles.settingBlockHeader}>
									<Ionicons
										name="timer-outline"
										size={20}
										color={colors.primary}
									/>
									<Text
										style={[
											styles.settingBlockTitle,
											{ color: colors.text },
										]}>
										Kontrol Çubuğu Gizlenme Süresi
									</Text>
								</View>
								<View style={styles.chipsRow}>
									{TIMEOUT_OPTIONS.map((item) => {
										const isSelected =
											settings.controlsTimeout ===
											item.value;
										return (
											<TVPressable
												key={item.value}
												style={[
													styles.chip,
													{
														backgroundColor:
															isSelected
																? colors.primary
																: `${colors.border}40`,
														borderColor: isSelected
															? colors.primary
															: colors.border,
													},
												]}
												focusedStyle={
													styles.chipFocused
												}
												onPress={() =>
													updateSettings({
														controlsTimeout:
															item.value,
													})
												}
												activeOpacity={0.7}>
												<Text
													style={[
														styles.chipText,
														{
															color: isSelected
																? "#FFFFFF"
																: colors.text,
															fontWeight:
																isSelected
																	? "700"
																	: "500",
														},
													]}>
													{item.label}
												</Text>
											</TVPressable>
										);
									})}
								</View>
							</View>

							<View
								style={[
									styles.divider,
									{ backgroundColor: colors.border },
								]}
							/>

							{/* Kaldığı Yerden Devam Et */}
							<TVPressable
								style={styles.toggleRow}
								focusedStyle={styles.toggleRowFocused}
								onPress={() =>
									updateSettings({
										autoResume: !settings.autoResume,
									})
								}>
								<View style={styles.toggleRowLeft}>
									<Ionicons
										name="refresh-circle-outline"
										size={20}
										color={colors.primary}
									/>
									<View style={styles.toggleTextContainer}>
										<Text
											style={[
												styles.toggleTitle,
												{ color: colors.text },
											]}>
											Kaldığı Yerden Devam Et
										</Text>
										<Text
											style={[
												styles.toggleSubtitle,
												{ color: colors.textSecondary },
											]}>
											Kaynak değişiminde ve tekrar
											açılışta süreyi korur
										</Text>
									</View>
								</View>
								<Switch
									value={Boolean(settings.autoResume)}
									onValueChange={(val) =>
										updateSettings({ autoResume: val })
									}
									trackColor={{
										false: colors.border,
										true: colors.primary,
									}}
									thumbColor="#ffffff"
								/>
							</TVPressable>
						</View>
					</View>

					{/* 3. BÖLÜM: DOKUNMA VE HAREKET */}
					<View style={styles.section}>
						<Text
							style={[
								styles.sectionHeader,
								{ color: colors.textSecondary },
							]}>
							DOKUNMA VE HAREKET
						</Text>

						<View
							style={[
								styles.settingsGroup,
								{
									backgroundColor: colors.cardBg,
									borderColor: colors.border,
								},
							]}>
							<ToggleRow
								colors={colors}
								icon="hand-left-outline"
								title="Çift Dokunma ile Sarma"
								subtitle="Sağa/sola çift dokunarak ileri/geri gider"
								value={settings.doubleTapSeek !== false}
								onChange={(val) =>
									updateSettings({ doubleTapSeek: val })
								}
							/>

							<View
								style={[
									styles.divider,
									{ backgroundColor: colors.border },
								]}
							/>

							<ToggleRow
								colors={colors}
								icon="play-circle-outline"
								title="Çift Dokunmada Duraklat"
								subtitle="Ortadaki bölgeye çift dokunmak oynatmayı duraklatır/başlatır"
								value={settings.doubleTapPause !== false}
								onChange={(val) =>
									updateSettings({ doubleTapPause: val })
								}
							/>

							<View
								style={[
									styles.divider,
									{ backgroundColor: colors.border },
								]}
							/>

							<ToggleRow
								colors={colors}
								icon="swap-horizontal-outline"
								title="Yatay Sürükleme ile Sarma"
								subtitle="Videoyu sağa/sola sürükleyerek konuma atlama"
								value={settings.swipeSeek !== false}
								onChange={(val) =>
									updateSettings({ swipeSeek: val })
								}
							/>

							<View
								style={[
									styles.divider,
									{ backgroundColor: colors.border },
								]}
							/>

							<ToggleRow
								colors={colors}
								icon="contrast-outline"
								title="Dikey Sürükleme"
								subtitle="Sol yarıda ses seviyesi, sağ yarıda parlaklık"
								value={settings.verticalSwipe !== false}
								onChange={(val) =>
									updateSettings({ verticalSwipe: val })
								}
							/>

							<View
								style={[
									styles.divider,
									{ backgroundColor: colors.border },
								]}
							/>

							<ToggleRow
								colors={colors}
								icon="flash-outline"
								title="Uzun Basış ile Hızlandırma"
								subtitle="Basılı tutunca geçici olarak 2× oynatır"
								value={settings.longPressSpeedUp !== false}
								onChange={(val) =>
									updateSettings({ longPressSpeedUp: val })
								}
							/>

							{settings.longPressSpeedUp !== false ? (
								<>
									<View
										style={[
											styles.divider,
											{ backgroundColor: colors.border },
										]}
									/>
									<View style={styles.settingBlock}>
										<View style={styles.settingBlockHeader}>
											<Ionicons
												name="timer-outline"
												size={20}
												color={colors.primary}
											/>
											<Text
												style={[
													styles.settingBlockTitle,
													{ color: colors.text },
												]}>
												Hızlandırma Tetikleme Süresi
											</Text>
										</View>
										<View style={styles.chipsRow}>
											{SPEEDUP_DELAY_OPTIONS.map(
												(item) => {
													const isSelected =
														settings.longPressSpeedUpDelay ===
														item.value;
													return (
														<TVPressable
															key={item.value}
															style={[
																styles.chip,
																{
																	backgroundColor:
																		isSelected
																			? colors.primary
																			: `${colors.border}40`,
																	borderColor:
																		isSelected
																			? colors.primary
																			: colors.border,
																},
															]}
															focusedStyle={
																styles.chipFocused
															}
															onPress={() =>
																updateSettings({
																	longPressSpeedUpDelay:
																		item.value,
																})
															}
															activeOpacity={0.7}>
															<Text
																style={[
																	styles.chipText,
																	{
																		color: isSelected
																			? "#FFFFFF"
																			: colors.text,
																		fontWeight:
																			isSelected
																				? "700"
																				: "500",
																	},
																]}>
																{item.label}
															</Text>
														</TVPressable>
													);
												},
											)}
										</View>
									</View>
								</>
							) : null}

							<View
								style={[
									styles.divider,
									{ backgroundColor: colors.border },
								]}
							/>

							<ToggleRow
								colors={colors}
								icon="sunny-outline"
								title="%200 Parlaklık"
								subtitle="Dikey sürüklemede %100'ün üzerine çıkabilirsiniz"
								value={Boolean(settings.extraBrightness)}
								onChange={(val) =>
									updateSettings({ extraBrightness: val })
								}
							/>

							<View
								style={[
									styles.divider,
									{ backgroundColor: colors.border },
								]}
							/>

							<ToggleRow
								colors={colors}
								icon="volume-high-outline"
								title="%200 Ses"
								subtitle="Dikey sürüklemede %100'ün üzerine çıkabilirsiniz"
								value={Boolean(settings.extraVolume)}
								onChange={(val) =>
									updateSettings({ extraVolume: val })
								}
							/>
						</View>
					</View>

					{/* 4. BÖLÜM: OYNATMA */}
					<View style={styles.section}>
						<Text
							style={[
								styles.sectionHeader,
								{ color: colors.textSecondary },
							]}>
							OYNATMA
						</Text>

						<View
							style={[
								styles.settingsGroup,
								{
									backgroundColor: colors.cardBg,
									borderColor: colors.border,
								},
							]}>
							<View style={styles.settingBlock}>
								<View style={styles.settingBlockHeader}>
									<Ionicons
										name="speedometer-outline"
										size={20}
										color={colors.primary}
									/>
									<Text
										style={[
											styles.settingBlockTitle,
											{ color: colors.text },
										]}>
										Varsayılan Oynatma Hızı
									</Text>
								</View>
								<View style={styles.chipsRow}>
									{SPEED_OPTIONS.map((item) => {
										const isSelected =
											settings.playbackSpeed ===
											item.value;
										return (
											<TVPressable
												key={item.value}
												style={[
													styles.chip,
													{
														backgroundColor:
															isSelected
																? colors.primary
																: `${colors.border}40`,
														borderColor: isSelected
															? colors.primary
															: colors.border,
													},
												]}
												focusedStyle={
													styles.chipFocused
												}
												onPress={() =>
													updateSettings({
														playbackSpeed:
															item.value,
													})
												}
												activeOpacity={0.7}>
												<Text
													style={[
														styles.chipText,
														{
															color: isSelected
																? "#FFFFFF"
																: colors.text,
															fontWeight:
																isSelected
																	? "700"
																	: "500",
														},
													]}>
													{item.label}
												</Text>
											</TVPressable>
										);
									})}
								</View>
							</View>

							<View
								style={[
									styles.divider,
									{ backgroundColor: colors.border },
								]}
							/>

							<ToggleRow
								colors={colors}
								icon="checkmark-circle-outline"
								title="Kalan Süreyi Göster"
								subtitle="Geçen süre yerine videonun bitimine kalan süreyi gösterir"
								value={Boolean(settings.showRemainingTime)}
								onChange={(val) =>
									updateSettings({ showRemainingTime: val })
								}
							/>
						</View>
					</View>

					{/* 5. BÖLÜM: SİSTEM */}
					<View style={styles.section}>
						<Text
							style={[
								styles.sectionHeader,
								{ color: colors.textSecondary },
							]}>
							SİSTEM ENTEGRASYONU
						</Text>

						<View
							style={[
								styles.settingsGroup,
								{
									backgroundColor: colors.cardBg,
									borderColor: colors.border,
								},
							]}>
							<ToggleRow
								colors={colors}
								icon="picture-in-picture-outline"
								title="Picture-in-Picture"
								subtitle="Uygulamadan çıkınca küçük pencerede oynatmaya devam eder"
								value={settings.pictureInPicture !== false}
								onChange={(val) =>
									updateSettings({ pictureInPicture: val })
								}
							/>

							<View
								style={[
									styles.divider,
									{ backgroundColor: colors.border },
								]}
							/>

							<ToggleRow
								colors={colors}
								icon="musical-notes-outline"
								title="Arka Planda Oynat"
								subtitle="Oynatıcıyı kapatınca ses devam eder"
								value={settings.playInBackground !== false}
								onChange={(val) =>
									updateSettings({ playInBackground: val })
								}
							/>
						</View>
					</View>
				</ScrollView>
			</SafeAreaView>
		</>
	);
}

const styles = StyleSheet.create({
	safeArea: {
		flex: 1,
	},
	header: {
		height: 56,
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
		alignItems: "center",
	},
	headerTitle: {
		flex: 1,
		fontSize: 18,
		fontWeight: "bold",
		textAlign: "center",
	},
	resetButton: {
		paddingHorizontal: 8,
		paddingVertical: 4,
	},
	resetButtonText: {
		fontSize: 14,
		fontWeight: "600",
	},
	scrollContainer: {
		paddingTop: 16,
		paddingBottom: 40,
		paddingHorizontal: 16,
	},
	previewSection: {
		marginBottom: 24,
	},
	previewHeaderRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginBottom: 8,
		paddingHorizontal: 4,
	},
	liveBadge: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		backgroundColor: "rgba(255, 59, 48, 0.15)",
		paddingHorizontal: 8,
		paddingVertical: 3,
		borderRadius: 12,
		borderWidth: 1,
		borderColor: "rgba(255, 59, 48, 0.35)",
	},
	liveDot: {
		width: 6,
		height: 6,
		borderRadius: 3,
		backgroundColor: "#FF3B30",
	},
	liveBadgeText: {
		color: "#FF3B30",
		fontSize: 11,
		fontWeight: "700",
		textTransform: "uppercase",
	},
	mockVideoScreen: {
		height: 180,
		backgroundColor: "#080B10",
		borderRadius: 16,
		overflow: "hidden",
		borderWidth: 1,
		borderColor: "rgba(255, 255, 255, 0.1)",
		justifyContent: "space-between",
		alignItems: "center",
		position: "relative",
	},
	mockVideoBackdrop: {
		...StyleSheet.absoluteFill,
		justifyContent: "center",
		alignItems: "center",
		backgroundColor: "rgba(10, 14, 22, 0.95)",
		gap: 8,
	},
	mockVideoInfoText: {
		color: "rgba(255, 255, 255, 0.35)",
		fontSize: 12,
		fontWeight: "500",
	},
	mockSubtitleContainer: {
		position: "absolute",
		bottom: 16,
		left: 16,
		right: 16,
		alignItems: "center",
		justifyContent: "center",
	},
	mockSubtitlePill: {
		paddingHorizontal: 14,
		paddingVertical: 6,
		borderRadius: 6,
		maxWidth: "92%",
	},
	mockSubtitleText: {
		fontWeight: "600",
		textAlign: "center",
		textShadowOffset: { width: 0, height: 1 },
	},
	section: {
		marginBottom: 24,
	},
	sectionHeader: {
		fontSize: 12,
		fontWeight: "600",
		letterSpacing: 1.2,
		textTransform: "uppercase",
		paddingHorizontal: 4,
		paddingBottom: 8,
	},
	settingsGroup: {
		borderRadius: 14,
		borderWidth: 1,
		overflow: "hidden",
	},
	settingBlock: {
		padding: 16,
	},
	settingBlockHeader: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		marginBottom: 12,
	},
	settingBlockTitle: {
		fontSize: 15,
		fontWeight: "600",
	},
	chipsRow: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: 8,
	},
	chip: {
		paddingHorizontal: 14,
		paddingVertical: 8,
		borderRadius: 10,
		borderWidth: 1,
	},
	chipText: {
		fontSize: 13,
	},
	colorRow: {
		flexDirection: "row",
		gap: 10,
	},
	colorCard: {
		flex: 1,
		alignItems: "center",
		paddingVertical: 10,
		paddingHorizontal: 6,
		borderRadius: 10,
		gap: 6,
	},
	colorCircle: {
		width: 28,
		height: 28,
		borderRadius: 14,
		justifyContent: "center",
		alignItems: "center",
		borderWidth: 1,
		borderColor: "rgba(0, 0, 0, 0.2)",
	},
	colorLabel: {
		fontSize: 12,
	},
	toggleRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: 16,
		paddingVertical: 14,
	},
	toggleRowLeft: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		flex: 1,
		paddingRight: 12,
	},
	toggleTextContainer: {
		flex: 1,
	},
	toggleTitle: {
		fontSize: 15,
		fontWeight: "600",
	},
	toggleSubtitle: {
		fontSize: 12,
		marginTop: 2,
	},
	divider: {
		height: 1,
		marginHorizontal: 16,
	},
	headerButtonFocused: {
		backgroundColor: "rgba(229, 9, 20, 0.2)",
		borderRadius: 8,
		transform: [{ scale: 1.08 }],
	},
	chipFocused: {
		borderWidth: 2,
		borderColor: "#E50914",
		backgroundColor: "rgba(229, 9, 20, 0.2)",
		transform: [{ scale: 1.05 }],
	},
	colorCardFocused: {
		borderWidth: 2,
		borderColor: "#E50914",
		transform: [{ scale: 1.06 }],
	},
	toggleRowFocused: {
		borderWidth: 1.5,
		borderColor: "#E50914",
		backgroundColor: "rgba(229, 9, 20, 0.12)",
		borderRadius: 8,
		transform: [{ scale: 1.02 }],
	},
});
