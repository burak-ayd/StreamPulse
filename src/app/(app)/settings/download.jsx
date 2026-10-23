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

import TVPressable from "@/components/common/TVPressable";
import { useThemeContext } from "@/context/ThemeContext";
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

const CONCURRENT_DOWNLOAD_OPTIONS = [1, 2, 3, 4, 5];
const CONNECTION_OPTIONS = [1, 2, 3, 4, 6, 8];
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
				<Text style={[styles.valueRowTitle, { color: colors.text }]}>{title}</Text>
				{subtitle ? (
					<Text style={[styles.valueRowSub, { color: colors.textSecondary }]}>
						{subtitle}
					</Text>
				) : null}
			</View>
			<Text style={[styles.valueRowValue, { color: colors.primary }]}>
				{valueText}
			</Text>
			<Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
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
			<SafeAreaView style={[styles.safeArea, { backgroundColor: colors.bg }]}>
				<StatusBar barStyle="light-content" backgroundColor={colors.bg} />
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
		} else if (which === "connections") {
			setSettings(await saveDownloadSettings({ maxConnectionsPerDownload: value }));
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
			: optionModal === "connections"
				? CONNECTION_OPTIONS.map((v) => ({ label: `${v} bağlantı`, value: v }))
				: [];

	return (
		<>
			<Stack.Screen options={{ headerShown: false }} />
			<SafeAreaView
				edges={["top", "left", "right", "bottom"]}
				style={[styles.safeArea, { backgroundColor: colors.bg }]}>
				<StatusBar barStyle="light-content" backgroundColor={colors.bg} />

				{/* Header */}
				<View
					style={[
						styles.header,
						{ borderBottomColor: colors.border, backgroundColor: colors.cardBg },
					]}>
					<TVPressable
						onPress={() => router.back()}
						style={styles.backButton}
						focusedStyle={styles.headerButtonFocused}>
						<Ionicons name="arrow-back" size={24} color={colors.text} />
					</TVPressable>
					<Text style={[styles.headerTitle, { color: colors.text }]}>
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
					<Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>
						GENEL
					</Text>
					<View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
						<ValueRow
							colors={colors}
							icon="arrow-down-outline"
							iconBg="#06B6D4"
							title="Eş Zamanlı İndirme"
							valueText={`${settings.maxConcurrentDownloads} indirme`}
							onPress={() => openOption("concurrent")}
						/>
						<ValueRow
							colors={colors}
							icon="link-outline"
							iconBg="#8B5CF6"
							title="Eş Zamanlı Bağlantı"
							subtitle="Dosya başına paralel parça indirme — ileriki fazda etkinleşecek"
							valueText={`${settings.maxConnectionsPerDownload} bağlantı`}
							onPress={() => openOption("connections")}
						/>
						{/* Konum: bilgi satırı. iOS sandbox ve Android Scoped Storage
						    nedeniyle yol kullanıcı tarafından değiştirilemez;
						    gösterim amaçlıdır (plan §12 kısıtları). */}
						<View style={styles.valueRow}>
							<View style={[styles.valueIcon, { backgroundColor: "#64748B" }]}>
								<Ionicons name="folder-open-outline" size={16} color="#ffffff" />
							</View>
							<View style={styles.valueRowText}>
								<Text style={[styles.valueRowTitle, { color: colors.text }]}>
									İndirme Konumu
								</Text>
								<Text style={[styles.valueRowSub, { color: colors.textSecondary }]}>
									{settings.downloadPath}
								</Text>
							</View>
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
								<Text style={[styles.valueRowTitle, { color: colors.text }]}>
									Her Defasında Sor
								</Text>
								<Text style={[styles.valueRowSub, { color: colors.textSecondary }]}>
									Kapalıysa kayıtlı eklenti tercihiyle modal olmadan başlar
								</Text>
							</View>
							<Switch
								value={settings.alwaysAskBeforeDownload}
								trackColor={{ false: colors.border, true: colors.primary }}
								thumbColor="#ffffff"
							/>
						</TVPressable>
					</View>

					{/* EKLENTİ İNDİRME TERCİHLERİ */}
					<Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>
						EKLENTİ İNDİRME TERCİHLERİ
					</Text>
					<View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
						{Object.keys(prefs).length === 0 ? (
							<Text style={[styles.emptyText, { color: colors.textSecondary }]}>
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
							style={[styles.resetAllBtn, { borderColor: colors.border }]}
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
				<View style={[styles.optionSheet, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
					{optionModalOptions.map((opt) => (
						<TVPressable
							key={opt.value}
							style={styles.optionItem}
							focusedStyle={styles.rowFocused}
							onPress={() => pickOption(optionModal, opt.value)}>
							<Text style={{ color: colors.text, fontSize: 14 }}>{opt.label}</Text>
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
								{ backgroundColor: colors.cardBg, borderColor: colors.border },
							]}>
							<Text style={[styles.pluginTitle, { color: colors.text }]}>
								{editPlugin}
							</Text>

							{/* Tercih edilen kaynak: kaynaklar içeriğe göre değiştiği
							    için serbest metin; boş = "Otomatik" */}
							<Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
								Tercih Edilen Kaynak (boş = Otomatik)
							</Text>
							<TextInput
								value={editDraft.preferredSource || ""}
								onChangeText={(t) =>
									setEditDraft({ ...editDraft, preferredSource: t.trim() || null })
								}
								placeholder="Örn. RapidVid"
								placeholderTextColor={colors.textSecondary}
								style={[
									styles.textInput,
									{ color: colors.text, borderColor: colors.border },
								]}
							/>

							{/* Tercih edilen ses/altyazı dili */}
							{[
								["preferredAudioTrack", "Tercih Edilen Ses", AUDIO_OPTIONS],
								["preferredSubtitle", "Tercih Edilen Altyazı", SUBTITLE_OPTIONS],
							].map(([field, label, opts]) => (
								<View key={field}>
									<Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
										{label}
									</Text>
									<View style={styles.chipRow}>
										{opts.map((opt) => (
											<TVPressable
												key={opt.label}
												style={[
													styles.chip,
													{
														borderColor: colors.border,
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
																? colors.primary
																: colors.text,
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
								<Text style={{ color: colors.text, fontSize: 14 }}>
									Altyazıyı indir
								</Text>
								<Switch
									value={editDraft.downloadSubtitle !== false}
									trackColor={{ false: colors.border, true: colors.primary }}
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
									<Text style={{ color: colors.text, fontSize: 14 }}>
										Her seferinde sor
									</Text>
									<Text style={[styles.valueRowSub, { color: colors.textSecondary }]}>
										Kapalıysa bu eklentide modal olmadan indirilir
									</Text>
								</View>
								<Switch
									value={editDraft.alwaysAsk === true}
									trackColor={{ false: colors.border, true: colors.primary }}
									thumbColor="#ffffff"
								/>
							</TVPressable>

							{/* Butonlar */}
							<View style={styles.pluginActions}>
								<TVPressable
									style={[styles.pluginActionBtn, { borderColor: colors.border }]}
									focusedStyle={styles.rowFocused}
									onPress={resetPlugin}>
									<Text style={{ color: "#f43f5e", fontSize: 13 }}>Sıfırla</Text>
								</TVPressable>
								<TVPressable
									style={[styles.pluginActionBtn, styles.pluginSaveBtn, { borderColor: colors.border }]}
									focusedStyle={styles.rowFocused}
									onPress={savePluginDraft}>
									<Text style={{ color: "#ffffff", fontSize: 13, fontWeight: "700" }}>
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
	headerTitle: { fontSize: 17, fontWeight: "700" },
	scrollContainer: { padding: 16, gap: 8 },
	sectionHeader: {
		fontSize: 12,
		fontWeight: "800",
		letterSpacing: 1,
		marginTop: 14,
		marginBottom: 6,
	},
	card: {
		borderRadius: 14,
		borderWidth: 1,
		overflow: "hidden",
	},
	valueRow: {
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
	valueRowTitle: { fontSize: 14, fontWeight: "600" },
	valueRowSub: { fontSize: 11.5, marginTop: 1 },
	valueRowValue: { fontSize: 13, fontWeight: "600" },
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
	resetAllText: { fontSize: 13.5, fontWeight: "700" },
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
	pluginTitle: { fontSize: 16, fontWeight: "700", marginBottom: 6 },
	fieldLabel: { fontSize: 11.5, fontWeight: "700", letterSpacing: 0.4, marginTop: 6 },
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
