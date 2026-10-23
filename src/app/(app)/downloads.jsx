/*
 * İndirilenler ekranı (download_feature_plan.md Faz 4).
 *
 * Eski "Yapım Aşamasında" placeholder'ının yerine gerçek kuyruk/ilerleme
 * arayüzü: DownloadContext'ten gelen kuyruk listesi (aktif indirmeler,
 * duraklatılmışlar, tamamlananlar), ilerleme çubuğu, duraklat/devam/iptal
 * ve silme eylemleri. Boş listede sade bir boş durum kartı gösterilir.
 *
 * TV/tablet: BottomNavigation + ortalanmış içerik genişliği korunur.
 */

import BottomNavigation from "@/components/BottomNavigation";
import TVPressable from "@/components/common/TVPressable";
import { useDownload } from "@/context/DownloadContext";
import { useThemeContext } from "@/context/ThemeContext";
import { useNavLayout } from "@/hooks/useNavLayout";
import { useTvMetrics } from "@/utils/tvMetrics";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import React, { useCallback } from "react";
import {
	Alert,
	BackHandler,
	ScrollView,
	StatusBar,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const STATUS_META = {
	queued: { icon: "time-outline", color: "#38bdf8", label: "Sırada" },
	downloading: { icon: "arrow-down-circle", color: "#38bdf8", label: "İndiriliyor" },
	paused: { icon: "pause-circle-outline", color: "#f59e0b", label: "Duraklatıldı" },
	completed: { icon: "checkmark-circle", color: "#10b981", label: "Tamamlandı" },
	failed: { icon: "alert-circle", color: "#f43f5e", label: "Hata" },
	cancelled: { icon: "close-circle-outline", color: "#6b7280", label: "İptal edildi" },
};

function formatBytes(bytes) {
	const n = Number(bytes);
	if (!Number.isFinite(n) || n <= 0) return "";
	const mb = n / (1024 * 1024);
	if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
	if (mb >= 1) return `${mb.toFixed(1)} MB`;
	return `${(n / 1024).toFixed(0)} KB`;
}

/** Başlık: dizi bölümü için "Dizi — S01xE04 · Bölüm", film için içerik adı. */
function itemTitle(item) {
	if (item.type === "series" && item.seasonNumber && item.episodeNumber) {
		const s = String(item.seasonNumber).padStart(2, "0");
		const e = String(item.episodeNumber).padStart(2, "0");
		return `${item.seriesTitle || item.contentTitle} — S${s}xE${e}${item.episodeTitle ? ` · ${item.episodeTitle}` : ""}`;
	}
	return item.contentTitle || "İçerik";
}

export default function DownloadsScreen() {
	const router = useRouter();
	const { colors } = useThemeContext();
	// Sol ray (TV / tablet yatay) varken içerik sola kayar.
	const { contentPaddingLeft } = useNavLayout();
	// TV: ortalanmış maksimum içerik genişliği.
	const { contentMaxWidth } = useTvMetrics();
	const {
		queue,
		pauseDownload,
		resumeDownload,
		cancelDownload,
		removeDownload,
		resumeAll,
	} = useDownload();

	useFocusEffect(
		useCallback(() => {
			const onBackPress = () => {
				if (router.canGoBack()) router.back();
				else router.replace("/(app)");
				return true;
			};
			const sub = BackHandler.addEventListener("hardwareBackPress", onBackPress);
			return () => sub.remove();
		}, [router]),
	);

	const confirmCancel = (item) => {
		Alert.alert("İndirmeyi İptal Et", `"${itemTitle(item)}" iptal edilsin mi?`, [
			{ text: "Vazgeç", style: "cancel" },
			{
				text: "İptal Et",
				style: "destructive",
				onPress: () => cancelDownload(item.id),
			},
		]);
	};

	const confirmDelete = (item) => {
		Alert.alert(
			"İndirmeyi Sil",
			`"${itemTitle(item)}" kaydı listeden kaldırılsın mi? (İndirilen dosya silinmez)`,
			[
				{ text: "Vazgeç", style: "cancel" },
				{
					text: "Sil",
					style: "destructive",
					onPress: () => removeDownload(item.id),
				},
			],
		);
	};

	/** Satır eylemleri: durum → görünür buton seti. */
	function actionButtonsFor(item) {
		const buttons = [];
		if (item.status === "downloading" || item.status === "queued") {
			buttons.push({
				key: "pause",
				icon: "pause",
				color: "#f59e0b",
				onPress: () => pauseDownload(item.id),
				label: "Duraklat",
			});
			buttons.push({
				key: "cancel",
				icon: "close",
				color: "#f43f5e",
				onPress: () => confirmCancel(item),
				label: "İptal",
			});
		} else if (item.status === "paused" || item.status === "failed") {
			buttons.push({
				key: "resume",
				icon: "play",
				color: "#10b981",
				onPress: () => resumeDownload(item.id),
				label: "Devam Et",
			});
			buttons.push({
				key: "cancel",
				icon: "close",
				color: "#f43f5e",
				onPress: () => confirmCancel(item),
				label: "İptal",
			});
		} else {
			// completed / cancelled
			buttons.push({
				key: "delete",
				icon: "trash-outline",
				color: "#6b7280",
				onPress: () => confirmDelete(item),
				label: "Sil",
			});
		}
		return buttons;
	}

	const canResumeAll = queue.some(
		(i) => i.status === "paused" || i.status === "failed",
	);

	return (
		<>
			<Stack.Screen options={{ headerShown: false }} />
			<SafeAreaView
				style={[
					styles.safeArea,
					{ paddingLeft: contentPaddingLeft, backgroundColor: colors.bg },
				]}
				edges={["top", "left", "right"]}>
				<StatusBar barStyle="light-content" backgroundColor={colors.bg} />

				{/* Header */}
				<View
					style={[
						styles.header,
						{ borderBottomColor: colors.border, backgroundColor: colors.cardBg },
						contentMaxWidth
							? { width: "100%", maxWidth: contentMaxWidth, alignSelf: "center" }
							: null,
					]}>
					<TVPressable
						onPress={() => router.back()}
						style={styles.backButton}
						focusedStyle={styles.iconFocused}>
						<Ionicons name="arrow-back" size={24} color={colors.text} />
					</TVPressable>
					<Text style={[styles.headerTitle, { color: colors.text }]}>
						İndirilenler
					</Text>
					{/* Tümünü devam ettir */}
					{canResumeAll ? (
						<TVPressable
							onPress={() => resumeAll()}
							style={styles.backButton}
							focusedStyle={styles.iconFocused}>
							<Ionicons name="play-outline" size={24} color={colors.primary} />
						</TVPressable>
					) : (
						<View style={{ width: 40 }} />
					)}
				</View>

				<ScrollView
					contentInsetAdjustmentBehavior="automatic"
					showsVerticalScrollIndicator={false}
					contentContainerStyle={[
						styles.scrollContent,
						contentMaxWidth
							? { alignSelf: "center", width: "100%", maxWidth: contentMaxWidth }
							: null,
					]}>
					{!hasAnyItem(queue) ? (
						/* Boş durum */
						<View
							style={[
								styles.emptyCard,
								{ backgroundColor: colors.cardBg, borderColor: colors.border },
							]}>
							<View style={[styles.emptyIconCircle, { backgroundColor: "rgba(37, 99, 235, 0.15)" }]}>
								<Ionicons name="cloud-download-outline" size={44} color="#2563EB" />
							</View>
							<Text style={[styles.emptyTitle, { color: colors.text }]}>
								İndirme Yok
							</Text>
							<Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
								İnternet bağlantınız olmadığında kesintisiz film ve dizi
								izleyebilmeniz için içerikleri indirin. Detay ekranındaki
								{"\"İndir\""} butonundan başlayabilirsiniz.
							</Text>
						</View>
					) : (
						queue.map((item) => {
							const meta = STATUS_META[item.status] || STATUS_META.failed;
							const showProgress =
								item.status === "downloading" ||
								item.status === "paused" ||
								item.status === "queued";
							const pct = Math.round((item.progress || 0) * 100);
							return (
								<View
									key={item.id}
									style={[
										styles.itemCard,
										{ backgroundColor: colors.cardBg, borderColor: colors.border },
									]}>
									{/* Üst satır: durum ikonu + başlık + durum etiketi */}
									<View style={styles.itemTopRow}>
										<Ionicons name={meta.icon} size={22} color={meta.color} />
										<Text style={[styles.itemTitle, { color: colors.text }]} numberOfLines={2}>
											{itemTitle(item)}
										</Text>
										<Text style={[styles.statusText, { color: meta.color }]}>
											{meta.label}
										</Text>
									</View>

									{/* İlerleme çubuğu (aktif/duraklatılmış/sırada) */}
									{showProgress && (
										<>
											<View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
												<View
													style={[
														styles.progressFill,
														{
															backgroundColor: meta.color,
															width: `${Math.max(2, pct)}%`,
														},
													]}
												/>
											</View>
											<Text style={[styles.progressText, { color: colors.textSecondary }]}>
												{pct === 0
													? "Başlatılıyor…"
													: `%${pct}${item.totalBytes ? ` · ${formatBytes(item.downloadedBytes)} / ${formatBytes(item.totalBytes)}` : ""}`}
											</Text>
										</>
									)}

									{/* Hata satırı */}
									{item.status === "failed" && item.error ? (
										<Text style={[styles.errorText, { color: "#f43f5e" }]} numberOfLines={2}>
											{item.error}
										</Text>
									) : null}

									{/* Tamamlananlar: dosya yolu */}
									{item.status === "completed" && item.filePath ? (
										<Text style={[styles.pathText, { color: colors.textSecondary }]} numberOfLines={1}>
											{item.filePath}
										</Text>
									) : null}

									{/* Eylem butonları */}
									<View style={styles.actionRow}>
										{actionButtonsFor(item).map((btn) => (
											<TVPressable
												key={btn.key}
												onPress={btn.onPress}
												style={[
													styles.actionBtn,
													{ borderColor: colors.border },
												]}
												focusedStyle={styles.actionBtnFocused}>
												<Ionicons name={btn.icon} size={15} color={btn.color} />
												<Text style={[styles.actionLabel, { color: btn.color }]}>
													{btn.label}
												</Text>
											</TVPressable>
										))}
									</View>
								</View>
							);
						})
					)}
				</ScrollView>

				<BottomNavigation activeRoute="/(app)/downloads" />
			</SafeAreaView>
		</>
	);
}

/** Kuyrukta gösterilecek öğe var mı? (tamamen boş kayıtlar hariç) */
function hasAnyItem(queue) {
	return Array.isArray(queue) && queue.some(Boolean);
}

const styles = StyleSheet.create({
	safeArea: { flex: 1 },
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
		borderRadius: 20,
		justifyContent: "center",
		alignItems: "center",
	},
	iconFocused: { backgroundColor: "rgba(229, 9, 20, 0.25)" },
	headerTitle: { fontSize: 18, fontWeight: "700" },
	scrollContent: { padding: 20, alignItems: "center" },

	// Boş durum
	emptyCard: {
		width: "100%",
		borderRadius: 16,
		padding: 28,
		alignItems: "center",
		borderWidth: 1,
		marginTop: 20,
	},
	emptyIconCircle: {
		width: 80,
		height: 80,
		borderRadius: 40,
		justifyContent: "center",
		alignItems: "center",
		marginBottom: 16,
	},
	emptyTitle: { fontSize: 19, fontWeight: "700", textAlign: "center", marginBottom: 8 },
	emptySubtitle: { fontSize: 13.5, lineHeight: 20, textAlign: "center" },

	// Kuyruk satırı
	itemCard: {
		width: "100%",
		borderRadius: 14,
		borderWidth: 1,
		padding: 14,
		marginBottom: 12,
	},
	itemTopRow: { flexDirection: "row", alignItems: "center", gap: 10 },
	itemTitle: { flex: 1, fontSize: 14, fontWeight: "700" },
	statusText: { fontSize: 11.5, fontWeight: "700" },
	progressTrack: {
		height: 5,
		borderRadius: 3,
		marginTop: 10,
		overflow: "hidden",
	},
	progressFill: { height: 5, borderRadius: 3 },
	progressText: { fontSize: 11.5, marginTop: 5 },
	errorText: { fontSize: 12, marginTop: 8 },
	pathText: { fontSize: 11, marginTop: 8 },
	actionRow: { flexDirection: "row", gap: 8, marginTop: 12 },
	actionBtn: {
		flexDirection: "row",
		alignItems: "center",
		gap: 5,
		borderWidth: 1,
		borderRadius: 9,
		paddingHorizontal: 12,
		paddingVertical: 7,
	},
	actionBtnFocused: { backgroundColor: "rgba(229, 9, 20, 0.15)", borderColor: "#E50914" },
	actionLabel: { fontSize: 12, fontWeight: "700" },
});
