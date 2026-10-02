import { useThemeContext } from "@/context/ThemeContext";
import { usePlayerSettings } from "@/context/PlayerSettingsContext";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import TVPressable from "@/components/common/TVPressable";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import React, { useCallback } from "react";
import {
	Alert,
	BackHandler,
	ScrollView,
	StatusBar,
	StyleSheet,
	Switch,
	Text,
	TouchableOpacity,
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
	{ label: "Beyaz", value: "#FFFFFF", color: "#FFFFFF", textColor: "#000000" },
	{ label: "Sarı", value: "#FFD600", color: "#FFD600", textColor: "#000000" },
	{ label: "Yeşil", value: "#00E676", color: "#00E676", textColor: "#000000" },
	{ label: "Camgöbeği", value: "#00E5FF", color: "#00E5FF", textColor: "#000000" },
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

export default function PlayerSettingsScreen() {
	const { colors } = useThemeContext();
	const router = useRouter();
	const { settings, updateSettings, resetSettings } = usePlayerSettings();

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
						<Text style={[styles.resetButtonText, { color: colors.primary }]}>
							Sıfırla
						</Text>
					</TVPressable>
				</View>

				<ScrollView
					showsVerticalScrollIndicator={false}
					contentContainerStyle={styles.scrollContainer}>
					{/* Canlı Altyazı Önizleme Kartı */}
					<View style={styles.previewSection}>
						<View style={styles.previewHeaderRow}>
							<Text
								style={[
									styles.sectionHeader,
									{ color: colors.textSecondary, paddingHorizontal: 0 },
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
												fontSize: settings.subtitleFontSize || 16,
												lineHeight: Math.round(
													(settings.subtitleFontSize || 16) * 1.35,
												),
												color:
													settings.subtitleTextColor ||
													"#FFFFFF",
												textShadowColor:
													settings.subtitleTextShadow
														? "rgba(0, 0, 0, 0.95)"
														: "transparent",
												textShadowRadius:
													settings.subtitleTextShadow ? 3 : 0,
											},
										]}>
										— Gerçek mutluluk sadece paylaşıldığında gerçektir.
									</Text>
								</View>
							</View>
						</View>
					</View>

					{/* 1. BÖLÜM: ALTYAZI GÖRÜNÜMÜ */}
					<View style={styles.section}>
						<Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>
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
										Yazı Boyutu ({settings.subtitleFontSize}px)
									</Text>
								</View>
								<View style={styles.chipsRow}>
									{FONT_SIZE_OPTIONS.map((item) => {
										const isSelected =
											settings.subtitleFontSize === item.value;
										return (
											<TVPressable
												key={item.value}
												style={[
													styles.chip,
													{
														backgroundColor: isSelected
															? colors.primary
															: `${colors.border}40`,
														borderColor: isSelected
															? colors.primary
															: colors.border,
													},
												]}
												focusedStyle={styles.chipFocused}
												onPress={() =>
													updateSettings({
														subtitleFontSize: item.value,
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
															fontWeight: isSelected
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
								style={[styles.divider, { backgroundColor: colors.border }]}
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
											settings.subtitleTextColor === item.value;
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
														borderWidth: isSelected ? 2 : 1,
													},
												]}
												focusedStyle={styles.colorCardFocused}
												onPress={() =>
													updateSettings({
														subtitleTextColor: item.value,
													})
												}
												activeOpacity={0.7}>
												<View
													style={[
														styles.colorCircle,
														{ backgroundColor: item.color },
													]}>
													{isSelected && (
														<Ionicons
															name="checkmark"
															size={16}
															color={item.textColor}
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
															fontWeight: isSelected
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
								style={[styles.divider, { backgroundColor: colors.border }]}
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
											settings.subtitleBgColor === item.value;
										return (
											<TVPressable
												key={item.value}
												style={[
													styles.chip,
													{
														backgroundColor: isSelected
															? colors.primary
															: `${colors.border}40`,
														borderColor: isSelected
															? colors.primary
															: colors.border,
													},
												]}
												focusedStyle={styles.chipFocused}
												onPress={() =>
													updateSettings({
														subtitleBgColor: item.value,
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
															fontWeight: isSelected
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
								style={[styles.divider, { backgroundColor: colors.border }]}
							/>

							{/* Metin Gölgesi */}
							<TVPressable
								style={styles.toggleRow}
								focusedStyle={styles.toggleRowFocused}
								onPress={() =>
									updateSettings({
										subtitleTextShadow: !settings.subtitleTextShadow,
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
											Açık renkli sahnelerde okunabilirliği artırır
										</Text>
									</View>
								</View>
								<Switch
									value={Boolean(settings.subtitleTextShadow)}
									onValueChange={(val) =>
										updateSettings({ subtitleTextShadow: val })
									}
									trackColor={{
										false: colors.border,
										true: colors.primary,
									}}
									thumbColor="#ffffff"
								/>
							</TVPressable>

							<View
								style={[styles.divider, { backgroundColor: colors.border }]}
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
														backgroundColor: isSelected
															? colors.primary
															: `${colors.border}40`,
														borderColor: isSelected
															? colors.primary
															: colors.border,
													},
												]}
												focusedStyle={styles.chipFocused}
												onPress={() =>
													updateSettings({
														defaultSubtitleLanguage: item.value,
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
															fontWeight: isSelected
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
						<Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>
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
											settings.seekDuration === item.value;
										return (
											<TVPressable
												key={item.value}
												style={[
													styles.chip,
													{
														backgroundColor: isSelected
															? colors.primary
															: `${colors.border}40`,
														borderColor: isSelected
															? colors.primary
															: colors.border,
													},
												]}
												focusedStyle={styles.chipFocused}
												onPress={() =>
													updateSettings({
														seekDuration: item.value,
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
															fontWeight: isSelected
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
								style={[styles.divider, { backgroundColor: colors.border }]}
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
									{[
										{ label: "Sığdır (Orjinal Oran)", value: "contain" },
										{ label: "Doldur (Ekrana Yay)", value: "cover" },
									].map((item) => {
										const isSelected =
											settings.defaultResizeMode === item.value;
										return (
											<TVPressable
												key={item.value}
												style={[
													styles.chip,
													{
														flex: 1,
														backgroundColor: isSelected
															? colors.primary
															: `${colors.border}40`,
														borderColor: isSelected
															? colors.primary
															: colors.border,
													},
												]}
												focusedStyle={styles.chipFocused}
												onPress={() =>
													updateSettings({
														defaultResizeMode: item.value,
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
															fontWeight: isSelected
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
								style={[styles.divider, { backgroundColor: colors.border }]}
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
											settings.controlsTimeout === item.value;
										return (
											<TVPressable
												key={item.value}
												style={[
													styles.chip,
													{
														backgroundColor: isSelected
															? colors.primary
															: `${colors.border}40`,
														borderColor: isSelected
															? colors.primary
															: colors.border,
													},
												]}
												focusedStyle={styles.chipFocused}
												onPress={() =>
													updateSettings({
														controlsTimeout: item.value,
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
															fontWeight: isSelected
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
								style={[styles.divider, { backgroundColor: colors.border }]}
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
											Kaynak değişiminde ve tekrar açılışta süreyi korur
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
		...StyleSheet.absoluteFillObject,
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
