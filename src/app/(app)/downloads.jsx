/*
 * İndirilenler ekranı (download_feature_plan.md Faz 4 + geri bildirim #3/#4/#10).
 *
 * • Diziler ACCORDION: başlık "Dizi Adı — 3/8" (indirilen/toplam bölüm),
 *   açılınca o dizinin indirme kuyruğu listelenir.
 * • Filmler tek kart.
 * • Tamamlanmış öğeye dokunmak oynatıcıyı açar (yerel dosya oynatılır).
 * • İlerleme: HLS'te segment sayısına göre yüzde (dalgalanmaz) + indirilen MB;
 *   düz dosyada yüzde + indirilen/toplam (Content-Length'ten bilinir).
 */

import BottomNavigation from "@/components/BottomNavigation";
import TVPressable from "@/components/common/TVPressable";
import { useDownload } from "@/context/DownloadContext";
import { useThemeContext } from "@/context/ThemeContext";
import { useNavLayout } from "@/hooks/useNavLayout";
import { useTvMetrics } from "@/utils/tvMetrics";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
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

/** Dizi bölümü etiketi: "S01xE04 · Bölüm adı" */
function episodeLabel(item) {
	const s = String(item.seasonNumber || 1).padStart(2, "0");
	const e = String(item.episodeNumber || 1).padStart(2, "0");
	return `S${s}xE${e}${item.episodeTitle ? ` · ${item.episodeTitle}` : ""}`;
}

export default function DownloadsScreen() {
	const router = useRouter();
	const { colors } = useThemeContext();
	const { contentPaddingLeft } = useNavLayout();
	const { contentMaxWidth } = useTvMetrics();
	const {
		queue,
		pauseDownload,
		resumeDownload,
		cancelDownload,
		removeDownload,
		resumeAll,
		exportDownload,
		settings,
	} = useDownload();

	// Accordion açık grupları. Varsayılan: tümü açık (kullanıcı isterse kapatır).
	const [collapsed, setCollapsed] = useState({});

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

	/**
	 * Gruplama: dizi bölümleri `seriesId` (yoksa seriesTitle) altında toplanır;
	 * filmler tek öğelik grup olarak döner.
	 */
	const groups = useMemo(() => {
		const map = new Map();
		(queue || []).forEach((item) => {
			const isSeries =
				item.type === "series" || Boolean(item.seasonNumber && item.episodeNumber);
			const key = isSeries
				? `series:${item.seriesId || item.seriesTitle || item.contentTitle}`
				: `movie:${item.id}`;
			if (!map.has(key)) {
				map.set(key, {
					key,
					isSeries,
					title: isSeries
						? item.seriesTitle || item.contentTitle
						: item.contentTitle,
					poster: item.posterUrl,
					items: [],
				});
			}
			map.get(key).items.push(item);
		});
		// Bölümleri sezon/bölüm sırasına diz
		return [...map.values()].map((g) => ({
			...g,
			items: g.items.sort(
				(a, b) =>
					Number(a.seasonNumber || 0) - Number(b.seasonNumber || 0) ||
					Number(a.episodeNumber || 0) - Number(b.episodeNumber || 0),
			),
			completedCount: g.items.filter((i) => i.status === "completed").length,
		}));
	}, [queue]);

	const openPlayer = (item) => {
		if (item.status !== "completed") return;
		const isSeries = item.type === "series";
		router.push({
			pathname: "/player",
			params: {
				url: item.sourceUrl,
				title: item.contentTitle,
				subtitle: isSeries ? episodeLabel(item) : "",
				poster: item.posterUrl || undefined,
				id: item.contentId,
				type: isSeries ? "episode" : "movie",
				plugin: item.pluginName,
				seriesId: isSeries ? item.seriesId || item.contentId : undefined,
				seriesTitle: isSeries ? item.seriesTitle || item.contentTitle : undefined,
				season: isSeries ? item.seasonNumber : undefined,
				episode: isSeries ? item.episodeNumber : undefined,
				episodeTitle: isSeries ? item.episodeTitle || undefined : undefined,
			},
		});
	};

	const confirmCancel = (item) => {
		Alert.alert(
			"İndirmeyi İptal Et",
			`"${item.type === "series" ? episodeLabel(item) : item.contentTitle}" iptal edilsin mi?`,
			[
				{ text: "Vazgeç", style: "cancel" },
				{
					text: "İptal Et",
					style: "destructive",
					onPress: () => cancelDownload(item.id),
				},
			],
		);
	};

	const confirmDelete = (item) => {
		Alert.alert(
			"İndirmeyi Sil",
			"Kayıt ve indirilen dosyalar silinsin mi?",
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

	/** Durum → satır eylemleri */
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
			if (settings?.downloadDirUri) {
				buttons.push({
					key: "export",
					icon: "share-outline",
					color: "#38bdf8",
					onPress: async () => {
						const ok = await exportDownload(item.id);
						Alert.alert(
							"Dışa Aktar",
							ok ? "Seçili klasöre kopyalandı." : "Kopyalama başarısız.",
						);
					},
					label: "Dışa Aktar",
				});
			}
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

	const canResumeAll = (queue || []).some(
		(i) => i.status === "paused" || i.status === "failed",
	);

	/** Tek öğe satırı (bölüm veya film kartı). */
	const renderItem = (item, { compact = false } = {}) => {
		const meta = STATUS_META[item.status] || STATUS_META.failed;
		const showProgress =
			item.status === "downloading" ||
			item.status === "paused" ||
			item.status === "queued";
		const pct = Math.round((item.progress || 0) * 100);
		const completed = item.status === "completed";
		return (
			<TVPressable
				key={item.id}
				onPress={() => openPlayer(item)}
				disabled={!completed}
				style={({ focused }) => [
					styles.itemCard,
					{
						backgroundColor: colors.cardBg,
						borderColor: focused ? colors.primary : colors.border,
					},
				]}>
				<View style={styles.itemTopRow}>
					<Ionicons name={meta.icon} size={comKey(compact)} color={meta.color} />
					<View style={{ flex: 1 }}>
						<Text style={[styles.itemTitle, { color: colors.text }]} numberOfLines={2}>
							{compact ? episodeLabel(item) : item.contentTitle}
						</Text>
						{!compact && item.type === "series" ? (
							<Text style={[styles.itemSub, { color: colors.textSecondary }]}>
								{episodeLabel(item)}
							</Text>
						) : null}
					</View>
					<Text style={[styles.statusText, { color: meta.color }]}>
						{completed ? "Oynat" : meta.label}
					</Text>
					{completed ? (
						<Ionicons name="play-circle" size={20} color={meta.color} />
					) : null}
				</View>

				{showProgress && (
					<>
						<View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
							<View
								style={[
									styles.progressFill,
									{ backgroundColor: meta.color, width: `${Math.max(2, pct)}%` },
								]}
							/>
						</View>
						<Text style={[styles.progressText, { color: colors.textSecondary }]}>
							{pct === 0
								? "Başlatılıyor…"
								: item.totalBytes > 0
									? `%${pct} · ${formatBytes(item.downloadedBytes)} / ${formatBytes(item.totalBytes)}`
									: `%${pct} · ${formatBytes(item.downloadedBytes) || "0 MB"}`}
						</Text>
					</>
				)}

				{item.status === "failed" && item.error ? (
					<Text style={[styles.errorText, { color: "#f43f5e" }]} numberOfLines={2}>
						{item.error}
					</Text>
				) : null}

				<View style={styles.actionRow}>
					{actionButtonsFor(item).map((btn) => (
						<TVPressable
							key={btn.key}
							onPress={btn.onPress}
							style={[styles.actionBtn, { borderColor: colors.border }]}
							focusedStyle={styles.actionBtnFocused}>
							<Ionicons name={btn.icon} size={15} color={btn.color} />
							<Text style={[styles.actionLabel, { color: btn.color }]}>
								{btn.label}
							</Text>
						</TVPressable>
					))}
				</View>
			</TVPressable>
		);
	};

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
					{groups.length === 0 ? (
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
								{" \"İndir\""} butonundan başlayabilirsiniz.
							</Text>
						</View>
					) : (
						groups.map((group) => {
							if (!group.isSeries) {
								// Film: tek kart
								return <View key={group.key} style={{ width: "100%" }}>
									{renderItem(group.items[0])}
								</View>;
							}
							const isCollapsed = Boolean(collapsed[group.key]);
							return (
								<View key={group.key} style={{ width: "100%" }}>
									<TVPressable
										onPress={() =>
											setCollapsed((prev) => ({
												...prev,
												[group.key]: !prev[group.key],
											}))
										}
										style={({ focused }) => [
											styles.groupHeader,
											{
												backgroundColor: colors.cardBg,
												borderColor: focused ? colors.primary : colors.border,
											},
										]}>
										<Ionicons
											name={isCollapsed ? "chevron-forward" : "chevron-down"}
											size={18}
											color={colors.textSecondary}
										/>
										<View style={{ flex: 1 }}>
											<Text
												style={[styles.groupTitle, { color: colors.text }]}
												numberOfLines={1}>
												{group.title}
											</Text>
											<Text
												style={[styles.groupSub, { color: colors.textSecondary }]}>
												{`${group.completedCount}/${group.items.length} bölüm indirildi`}
											</Text>
										</View>
									</TVPressable>
									{!isCollapsed && (
										<View style={styles.groupBody}>
											{group.items.map((item) => renderItem(item, { compact: true }))}
										</View>
									)}
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

/** Satır ikon boyutu (dizi satırları biraz daha küçük). */
function comKey(compact) {
	return compact ? 18 : 22;
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
	scrollContent: { padding: 16, alignItems: "center", gap: 10 },

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

	// Accordion
	groupHeader: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		padding: 14,
		borderRadius: 14,
		borderWidth: 1,
	},
	groupTitle: { fontSize: 15, fontWeight: "700" },
	groupSub: { fontSize: 11.5, marginTop: 2 },
	groupBody: { marginTop: 8, gap: 8, paddingLeft: 8 },

	// Öğe kartı
	itemCard: {
		width: "100%",
		borderRadius: 14,
		borderWidth: 1,
		padding: 14,
	},
	itemTopRow: { flexDirection: "row", alignItems: "center", gap: 10 },
	itemTitle: { fontSize: 14, fontWeight: "700" },
	itemSub: { fontSize: 11.5, marginTop: 2 },
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
