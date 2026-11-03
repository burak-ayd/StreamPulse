/*
 * İndirme Ayarları sayfası (download_feature_plan.md §7).
 *
 * İki bölüm:
 *  - GENEL: eş zamanlı indirme/bağlantı sayısı, konum, "her defasında sor".
 *  - EKLENTİ İNDİRME TERCİHLERİ: kayıtlı eklenti tercihleri; satıra dokununca
 *    eklenti detay modalı açılır (kaynak, ses/altyazı dili, her seferinde
 *    sor, sıfırla). Altta "Tüm Tercihleri Sıfırla".
 *
 * Kalıbı settings/player.jsx izler: TVPressable + theme colors, geri tuşu
 * BackHandler, TV'de ortalanmış maksimum içerik genişliği.
 */

import Slider from "@/components/common/Slider";
import TVPressable from "@/components/common/TVPressable";
import { useThemeContext } from "@/context/ThemeContext";
import { FontFamily, Palette } from "@/constants/theme";
import { useTvMetrics } from "@/utils/tvMetrics";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
	Alert,
	BackHandler,
	Modal,
	ScrollView,
	StatusBar,
	StyleSheet,
	Switch,
	TextInput,
	Text,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
	deletePluginDownloadPref,
	getPluginDownloadPrefs,
	getDownloadSettings,
	resetPluginDownloadPrefs,
	saveDownloadSettings,
	savePluginDownloadPref,
} from "@/utils/storage";

const CONCURRENT_DOWNLOAD_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const AUDIO_OPTIONS = [
	{ label: "Orijinal", value: null },
	{ label: "Türkçe (tr)", value: "tr" },
	{ label: "İngilizce (en)", value: "en" },
];
const SUBTITLE_OPTIONS = [
	{ label: "Türkçe (tr)", value: "tr" },
	{ label: "İngilizce (en)", value: "en" },
];

/** Seçenek sayfası ortak satırı: başlık (+alt not) + rozet + açma davranışı. */
function ValueRow({ colors, icon, iconBg, title, subtitle, valueText, onPress }) {
	return (
		<TVPressable
			style={styles.valueRow}
			focusedStyle={styles.rowFocused}
			onPress={onPress}>
			<View style={[styles.valueIcon, { backgroundColor: iconBg }]}>
				<Ionicons name={icon} size={16} color="#ffffff" />
			</View>
			<View style={styles.valueRowText}>
				<Text style={[styles.valueRowTitle, { color: Palette.onSurface }]}>{title}</Text>
				{subtitle ? (
					<Text style={[styles.valueRowSub, { color: Palette.onSurfaceVariant }]}>
						{subtitle}
					</Text>
				) : null}
			</View>
			<Text style={[styles.valueRowValue, { color: Palette.primary }]}>
				{valueText}
			</Text>
			<Ionicons name="chevron-forward" size={16} color={Palette.onSurfaceVariant} />
		</TVPressable>
	);
}

export default function DownloadSettingsScreen() {
	const { colors } = useThemeContext();
	const router = useRouter();
	const { contentMaxWidth } = useTvMetrics();

	const [settings, setSettings] = useState(null);
	const [prefs, setPrefs] = useState({});
	const [optionModal, setOptionModal] = useState(null); // "concurrent" | "connections"
	const [editPlugin, setEditPlugin] = useState(null); // eklenti adı (detay modalı)
	const [editDraft, setEditDraft] = useState(null);

	const loadAll = useCallback(async () => {
		setSettings(await getDownloadSettings());
		setPrefs(await getPluginDownloadPrefs());
	}, []);

	useFocusEffect(
		useCallback(() => {
			loadAll();
			const onBackPress = () => {
				if (router.canGoBack()) router.back();
				else router.replace("/(app)/settings");
				return true;
			};
			const sub = BackHandler.addEventListener("hardwareBackPress", onBackPress);
			return () => sub.remove();
		}, [router, loadAll]),
	);

	if (!settings) {
		return (
			<SafeAreaView style={[styles.safeArea, { backgroundColor: Palette.background }]}>
				<StatusBar barStyle="light-content" backgroundColor={Palette.background} />
				<Stack.Screen options={{ headerShown: false }} />
			</SafeAreaView>
		);
	}

	const openOption = async (which) => {
		setOptionModal(which);
	};

	const pickOption = async (which, value) => {
		setOptionModal(null);
		if (which === "concurrent") {
			setSettings(await saveDownloadSettings({ maxConcurrentDownloads: value }));
		}
	};

	/** Ayar değişimi: kaydet + native motora es zamanlı indirme limitini bildir. */
	const setAyar = async (which, value) => {
		if (which === "connections") {
			setSettings(await saveDownloadSettings({ maxConnectionsPerDownload: value }));
		} else if (which === "concurrent") {
			setSettings(await saveDownloadSettings({ maxConcurrentDownloads: value }));
			try {
				const { DownloadManager } = await import("@/services/downloadManager");
				await DownloadManager.setMaxConcurrent(value);
			} catch (e) {
				console.warn("Es zamanli indirme limiti gonderilemedi:", e?.message);
			}
		}
	};

	const openPluginEditor = (pluginName) => {
		setEditPlugin(pluginName);
		setEditDraft({ ...(prefs[pluginName] || { downloadSubtitle: true, alwaysAsk: false }) });
	};

	const savePluginDraft = async () => {
		if (!editPlugin || !editDraft) return;
		await savePluginDownloadPref(editPlugin, editDraft);
		setPrefs(await getPluginDownloadPrefs());
		setEditPlugin(null);
		setEditDraft(null);
	};

	const resetPlugin = () => {
		Alert.alert(
			"Eklenti Tercihi Sıfırla",
			`"${editPlugin}" için kayıtlı indirme tercihleri silinsin mi?`,
			[
				{ text: "Vazgeç", style: "cancel" },
				{
					text: "Sıfırla",
					style: "destructive",
					onPress: async () => {
						await deletePluginDownloadPref(editPlugin);
						setPrefs(await getPluginDownloadPrefs());
						setEditPlugin(null);
						setEditDraft(null);
					},
				},
			],
		);
	};

	const resetAllPrefs = () => {
		Alert.alert(
			"Tüm Tercihleri Sıfırla",
			"Tüm eklenti indirme tercihleri silinsin mi?",
			[
				{ text: "Vazgeç", style: "cancel" },
				{
					text: "Sıfırla",
					style: "destructive",
					onPress: async () => {
						await resetPluginDownloadPrefs();
						setPrefs({});
					},
				},
			],
		);
	};

	const optionModalOptions =
		optionModal === "concurrent"
			? CONCURRENT_DOWNLOAD_OPTIONS.map((v) => ({ label: `${v} indirme`, value: v }))
			: [];

	return (
		<>
			<Stack.Screen options={{ headerShown: false }} />
			<SafeAreaView
				edges={["top", "left", "right", "bottom"]}
				style={[styles.safeArea, { backgroundColor: Palette.background }]}>
				<StatusBar barStyle="light-content" backgroundColor={Palette.background} />

				{/* Header */}
				<View
					style={[
						styles.header,
						{ borderBottomColor: "rgba(229, 225, 228, 0.08)", backgroundColor: Palette.surfaceLow },
					]}>
					<TVPressable
						onPress={() => router.back()}
						style={styles.backButton}
						focusedStyle={styles.headerButtonFocused}>
						<Ionicons name="arrow-back" size={24} color={Palette.onSurface} />
					</TVPressable>
					<Text style={[styles.headerTitle, { color: Palette.onSurface }]}>
						İndirme Ayarları
					</Text>
					<View style={{ width: 40 }} />
				</View>

				<ScrollView
					contentInsetAdjustmentBehavior="automatic"
					showsVerticalScrollIndicator={false}
					contentContainerStyle={[
						styles.scrollContainer,
						contentMaxWidth
							? { alignSelf: "center", width: "100%", maxWidth: contentMaxWidth }
							: null,
					]}>
					{/* GENEL */}
					<Text style={[styles.sectionHeader, { color: Palette.onSurfaceVariant }]}>
						GENEL
					</Text>
					<View style={[styles.card, { backgroundColor: Palette.surfaceLow, borderColor: "rgba(229, 225, 228, 0.08)" }]}>
						<ValueRow
							colors={colors}
							icon="arrow-down-outline"
							iconBg="#06B6D4"
							title="Eş Zamanlı İndirme"
							valueText={`${settings.maxConcurrentDownloads} indirme`}
							onPress={() => openOption("concurrent")}
						/>
						{/* Eş bağlantı: dropdown yerine SLIDER (1-16) */}
						<View style={styles.sliderRow}>
							<View style={styles.sliderHeader}>
								<View style={[styles.valueIcon, { backgroundColor: "#8B5CF6" }]}>
									<Ionicons name="link-outline" size={16} color="#ffffff" />
								</View>
								<View style={styles.valueRowText}>
									<Text style={[styles.valueRowTitle, { color: Palette.onSurface }]}>
										Eş Zamanlı Bağlantı
									</Text>
									<Text style={[styles.valueRowSub, { color: Palette.onSurfaceVariant }]}>
										Dosya başına paralel parça indirme
									</Text>
								</View>
							</View>
							<Slider
								value={settings.maxConnectionsPerDownload || 6}
								min={1}
								max={16}
								step={1}
								onChange={(v) => setAyar("connections", v)}
								valueText={`${settings.maxConnectionsPerDownload || 6} bağlantı`}
								colors={colors}
							/>
						</View>
						{/* Her defasında sor */}
						<TVPressable
							style={styles.toggleRow}
							focusedStyle={styles.rowFocused}
							onPress={() =>
								(async () =>
									setSettings(
										await saveDownloadSettings({
											alwaysAskBeforeDownload: !settings.alwaysAskBeforeDownload,
										}),
									))()
							}
							accessibilityRole="switch"
							accessibilityState={{ checked: settings.alwaysAskBeforeDownload }}>
							<View style={[styles.valueIcon, { backgroundColor: "#F59E0B" }]}>
								<Ionicons name="help-circle-outline" size={16} color="#ffffff" />
							</View>
							<View style={styles.valueRowText}>
								<Text style={[styles.valueRowTitle, { color: Palette.onSurface }]}>
									Her Defasında Sor
								</Text>
								<Text style={[styles.valueRowSub, { color: Palette.onSurfaceVariant }]}>
									Kapalıysa kayıtlı eklenti tercihiyle modal olmadan başlar
								</Text>
							</View>
							<Switch
								value={settings.alwaysAskBeforeDownload}
								trackColor={{ false: "rgba(229, 225, 228, 0.08)", true: Palette.primary }}
								thumbColor="#ffffff"
							/>
						</TVPressable>
					</View>

					{/* EKLENTİ İNDİRME TERCİHLERİ */}
					<Text style={[styles.sectionHeader, { color: Palette.onSurfaceVariant }]}>
						EKLENTİ İNDİRME TERCİHLERİ
					</Text>
					<View style={[styles.card, { backgroundColor: Palette.surfaceLow, borderColor: "rgba(229, 225, 228, 0.08)" }]}>
						{Object.keys(prefs).length === 0 ? (
							<Text style={[styles.emptyText, { color: Palette.onSurfaceVariant }]}>
								Henüz eklenti tercihi kaydedilmedi. İndirme modalında
								{"\"Bu eklenti için ayarları hatırla\""} işaretleyerek kaydedebilirsin.
							</Text>
						) : (
							Object.entries(prefs).map(([name, pref]) => (
								<ValueRow
									key={name}
									colors={colors}
									icon="extension-outline"
									iconBg="#06B6D4"
									title={name}
									valueText={pref?.preferredSource || "Ayar yapılmadı"}
									onPress={() => openPluginEditor(name)}
								/>
							))
						)}
					</View>

					{Object.keys(prefs).length > 0 && (
						<TVPressable
							style={[styles.resetAllBtn, { borderColor: "rgba(229, 225, 228, 0.08)" }]}
							focusedStyle={styles.rowFocused}
							onPress={resetAllPrefs}>
							<Ionicons name="trash-outline" size={18} color="#f43f5e" />
							<Text style={[styles.resetAllText, { color: "#f43f5e" }]}>
								Tüm Tercihleri Sıfırla
							</Text>
						</TVPressable>
					)}
				</ScrollView>
			</SafeAreaView>

			{/* Seçenek sayfası (eş zamanlılık) */}
			<Modal
				visible={Boolean(optionModal)}
				transparent
				animationType="fade"
				onRequestClose={() => setOptionModal(null)}>
				<TVPressable style={styles.modalBackdrop} onPress={() => setOptionModal(null)}>
					<View />
				</TVPressable>
				<View style={[styles.optionSheet, { backgroundColor: Palette.surfaceLow, borderColor: "rgba(229, 225, 228, 0.08)" }]}>
					{optionModalOptions.map((opt) => (
						<TVPressable
							key={opt.value}
							style={styles.optionItem}
							focusedStyle={styles.rowFocused}
							onPress={() => pickOption(optionModal, opt.value)}>
							<Text style={{ color: Palette.onSurface, fontSize: 14 }}>{opt.label}</Text>
						</TVPressable>
					))}
				</View>
			</Modal>

			{/* Eklenti detay modalı */}
			<Modal
				visible={Boolean(editPlugin)}
				transparent
				animationType="slide"
				onRequestClose={() => {
					setEditPlugin(null);
					setEditDraft(null);
				}}>
				<View style={styles.modalBackdrop}>
					{editDraft && (
						<View
							style={[
								styles.pluginSheet,
								{ backgroundColor: Palette.surfaceLow, borderColor: "rgba(229, 225, 228, 0.08)" },
							]}>
							<Text style={[styles.pluginTitle, { color: Palette.onSurface }]}>
								{editPlugin}
							</Text>

							{/* Tercih edilen kaynak: kaynaklar içeriğe göre değiştiği
							    için serbest metin; boş = "Otomatik" */}
							<Text style={[styles.fieldLabel, { color: Palette.onSurfaceVariant }]}>
								Tercih Edilen Kaynak (boş = Otomatik)
							</Text>
							<TextInput
								value={editDraft.preferredSource || ""}
								onChangeText={(t) =>
									setEditDraft({ ...editDraft, preferredSource: t.trim() || null })
								}
								placeholder="Örn. RapidVid"
								placeholderTextColor={Palette.onSurfaceVariant}
								style={[
									styles.textInput,
									{ color: Palette.onSurface, borderColor: "rgba(229, 225, 228, 0.08)" },
								]}
							/>

							{/* Tercih edilen ses/altyazı dili */}
							{[
								["preferredAudioTrack", "Tercih Edilen Ses", AUDIO_OPTIONS],
								["preferredSubtitle", "Tercih Edilen Altyazı", SUBTITLE_OPTIONS],
							].map(([field, label, opts]) => (
								<View key={field}>
									<Text style={[styles.fieldLabel, { color: Palette.onSurfaceVariant }]}>
										{label}
									</Text>
									<View style={styles.chipRow}>
										{opts.map((opt) => (
											<TVPressable
												key={opt.label}
												style={[
													styles.chip,
													{
														borderColor: "rgba(229, 225, 228, 0.08)",
														backgroundColor:
															editDraft[field] === opt.value
																? "rgba(56,189,248,0.15)"
																: "transparent",
													},
												]}
												focusedStyle={styles.rowFocused}
												onPress={() =>
													setEditDraft({ ...editDraft, [field]: opt.value })
												}>
												<Text
													style={{
														color:
															editDraft[field] === opt.value
																? Palette.primary
																: Palette.onSurface,
														fontSize: 12.5,
													}}>
													{opt.label}
												</Text>
											</TVPressable>
										))}
									</View>
								</View>
							))}

							{/* downloadSubtitle */}
							<TVPressable
								style={styles.toggleRow}
								focusedStyle={styles.rowFocused}
								onPress={() =>
									setEditDraft({
										...editDraft,
										downloadSubtitle: editDraft.downloadSubtitle !== false ? false : true,
									})
								}
								accessibilityRole="switch"
								accessibilityState={{ checked: editDraft.downloadSubtitle !== false }}>
								<Text style={{ color: Palette.onSurface, fontSize: 14 }}>
									Altyazıyı indir
								</Text>
								<Switch
									value={editDraft.downloadSubtitle !== false}
									trackColor={{ false: "rgba(229, 225, 228, 0.08)", true: Palette.primary }}
									thumbColor="#ffffff"
								/>
							</TVPressable>

							{/* alwaysAsk */}
							<TVPressable
								style={styles.toggleRow}
								focusedStyle={styles.rowFocused}
								onPress={() =>
									setEditDraft({ ...editDraft, alwaysAsk: editDraft.alwaysAsk !== true })
								}
								accessibilityRole="switch"
								accessibilityState={{ checked: editDraft.alwaysAsk === true }}>
								<View style={{ flex: 1 }}>
									<Text style={{ color: Palette.onSurface, fontSize: 14 }}>
										Her seferinde sor
									</Text>
									<Text style={[styles.valueRowSub, { color: Palette.onSurfaceVariant }]}>
										Kapalıysa bu eklentide modal olmadan indirilir
									</Text>
								</View>
								<Switch
									value={editDraft.alwaysAsk === true}
									trackColor={{ false: "rgba(229, 225, 228, 0.08)", true: Palette.primary }}
									thumbColor="#ffffff"
								/>
							</TVPressable>

							{/* Butonlar */}
							<View style={styles.pluginActions}>
								<TVPressable
									style={[styles.pluginActionBtn, { borderColor: "rgba(229, 225, 228, 0.08)" }]}
									focusedStyle={styles.rowFocused}
									onPress={resetPlugin}>
									<Text style={{ color: "#f43f5e", fontSize: 13 }}>Sıfırla</Text>
								</TVPressable>
								<TVPressable
									style={[styles.pluginActionBtn, styles.pluginSaveBtn, { borderColor: "rgba(229, 225, 228, 0.08)" }]}
									focusedStyle={styles.rowFocused}
									onPress={savePluginDraft}>
									<Text style={{ color: "#ffffff", fontSize: 13, fontFamily: FontFamily.bold }}>
										Kaydet
									</Text>
								</TVPressable>
							</View>
						</View>
					)}
				</View>
			</Modal>
		</>
	);
}

const styles = StyleSheet.create({
	safeArea: { flex: 1 },
	header: {
		height: 56,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: 12,
		borderBottomWidth: 1,
	},
	backButton: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
	headerButtonFocused: { backgroundColor: "rgba(229, 9, 20, 0.25)" },
	headerTitle: { fontSize: 17, fontFamily: FontFamily.bold },
	scrollContainer: { padding: 16, gap: 8 },
	sectionHeader: {
		fontSize: 12,
		fontFamily: FontFamily.bold,
		letterSpacing: 1,
		marginTop: 14,
		marginBottom: 6,
	},
	card: {
		borderRadius: 14,
		borderWidth: 1,
		overflow: "hidden",
	},
	sliderRow: {
		paddingVertical: 14,
		paddingHorizontal: 16,
		gap: 12,
	},
	sliderHeader: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
	},	valueRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		paddingHorizontal: 12,
		paddingVertical: 12,
		borderBottomWidth: StyleSheet.hairlineWidth,
		borderBottomColor: "rgba(255,255,255,0.06)",
	},
	rowFocused: { backgroundColor: "rgba(229, 9, 20, 0.15)" },
	valueIcon: {
		width: 28,
		height: 28,
		borderRadius: 8,
		alignItems: "center",
		justifyContent: "center",
	},
	valueRowText: { flex: 1 },
	valueRowTitle: { fontSize: 14, fontFamily: FontFamily.semiBold },
	valueRowSub: { fontSize: 11.5, marginTop: 1 },
	valueRowValue: { fontSize: 13, fontFamily: FontFamily.semiBold },
	toggleRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		paddingHorizontal: 12,
		paddingVertical: 12,
	},
	emptyText: { fontSize: 12.5, lineHeight: 18, padding: 12 },
	resetAllBtn: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		borderWidth: 1,
		borderRadius: 12,
		paddingVertical: 12,
		marginTop: 12,
	},
	resetAllText: { fontSize: 13.5, fontFamily: FontFamily.bold },
	modalBackdrop: {
		flex: 1,
		backgroundColor: "rgba(0,0,0,0.6)",
		justifyContent: "flex-end",
	},
	optionSheet: {
		borderTopLeftRadius: 18,
		borderTopRightRadius: 18,
		borderWidth: 1,
		paddingVertical: 8,
	},
	optionItem: { paddingVertical: 13, paddingHorizontal: 18 },
	pluginSheet: {
		margin: 16,
		borderRadius: 16,
		borderWidth: 1,
		padding: 16,
		gap: 6,
	},
	pluginTitle: { fontSize: 16, fontFamily: FontFamily.bold, marginBottom: 6 },
	fieldLabel: { fontSize: 11.5, fontFamily: FontFamily.bold, letterSpacing: 0.4, marginTop: 6 },
	textInput: {
		borderWidth: 1,
		borderRadius: 10,
		paddingHorizontal: 12,
		paddingVertical: 9,
		fontSize: 14,
	},
	chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6, marginBottom: 4 },
	chip: {
		borderWidth: 1,
		borderRadius: 999,
		paddingHorizontal: 12,
		paddingVertical: 7,
	},
	pluginActions: {
		flexDirection: "row",
		justifyContent: "flex-end",
		gap: 10,
		marginTop: 14,
	},
	pluginActionBtn: {
		borderWidth: 1,
		borderRadius: 10,
		paddingHorizontal: 18,
		paddingVertical: 10,
	},
	pluginSaveBtn: { backgroundColor: "#E50914" },
});
