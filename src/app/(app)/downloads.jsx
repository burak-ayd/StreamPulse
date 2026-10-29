/*
 * İndirilenler ekranı (download_feature_plan.md Faz 4 + geri bildirim #3/#4/#10).
 *
 * • Diziler ACCORDION: başlık "Dizi Adı — 3/8" (indirilen/toplam bölüm),
 *   açılınca o dizinin indirme kuyruğu listelenir.
 * • Filmler tek kart.
 * • Görsel dil, kullanıcının verdiği "İndirilenler" tasarımından: depolama
 *   ölçer kartı, kırmızı birincil buton, 16:9 ilerleme kartı ve 2:3 posterli
 *   tamamlanmış kartlar (Material 3 yüzey rampası).
 * • İlerleme: HLS'te segment sayısına göre yüzde (dalgalanmaz) + indirilen MB;
 *   düz dosyada yüzde + indirilen/toplam (Content-Length'ten bilinir).
 */

import BottomNavigation from "@/components/BottomNavigation";
import SmartImage from "@/components/common/SmartImage";
import TVPressable from "@/components/common/TVPressable";
import { useDownload } from "@/context/DownloadContext";
import { useThemeContext } from "@/context/ThemeContext";
import { useNavLayout } from "@/hooks/useNavLayout";
import { etaLabel } from "@/utils/downloadEta";
import { useTvMetrics } from "@/utils/tvMetrics";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { Paths } from "expo-file-system";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
	ActivityIndicator,
	Alert,
	BackHandler,
	ScrollView,
	StatusBar,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const STATUS_LABEL = {
	queued: "Sırada",
	downloading: "İndiriliyor",
	merging: "Birleştiriliyor",
	publishing: "Yayınlanıyor",
	paused: "Duraklatıldı",
	completed: "Tamamlandı",
	failed: "Hata",
	cancelled: "İptal edildi",
};

/** Tamamlanmamış ama kart üzerinde eylem gerektiren durumlar. */
function isActiveStatus(status) {
	return (
		status === "downloading" ||
		status === "queued" ||
		status === "merging" ||
		status === "publishing" ||
		status === "paused" ||
		status === "failed"
	);
}

function formatBytes(bytes) {
	const n = Number(bytes);
	if (!Number.isFinite(n) || n <= 0) return "";
	const mb = n / (1024 * 1024);
	if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
	if (mb >= 1) return `${mb.toFixed(1)} MB`;
	return `${(n / 1024).toFixed(0)} KB`;
}

/** "Film • 2.1 GB" — boş parçalar atlanır. */
function metaLine(...parts) {
	return parts.filter(Boolean).join(" • ");
}

/** Dizi bölümü etiketi: "S01xE04 · Bölüm adı" */
function episodeLabel(item) {
	const s = String(item.seasonNumber || 1).padStart(2, "0");
	const e = String(item.episodeNumber || 1).padStart(2, "0");
	return `S${s}xE${e}${item.episodeTitle ? ` · ${item.episodeTitle}` : ""}`;
}

/** Öğenin diskte kapladığı alan (tamamlanmamışsa indirilen kısım). */
function bytesOf(item) {
	return Number(
		item.status === "completed" ? item.totalBytes : item.downloadedBytes,
	) || 0;
}

/** Cihaz depolaması; web/kısıtlı ortamda API yoksa `null` (kart gizlenir). */
function readDisk() {
	try {
		const total = Number(Paths.totalDiskSpace);
		const free = Number(Paths.availableDiskSpace);
		return total > 0 ? { total, free } : null;
	} catch {
		return null;
	}
}

export default function DownloadsScreen() {
	const router = useRouter();
	const { colors, m3 } = useThemeContext();
	const { contentPaddingLeft } = useNavLayout();
	const { contentMaxWidth } = useTvMetrics();
	const {
		queue,
		pauseDownload,
		resumeDownload,
		cancelDownload,
		removeDownload,
		resumeAll,
		pauseAll,
	} = useDownload();

	// Accordion açık grupları. Varsayılan: tümü açık (kullanıcı isterse kapatır).
	const [collapsed, setCollapsed] = useState({});

	// Cihaz depolaması — kart yalnızca değer okunabiliyorsa gösterilir.
	const [disk, setDisk] = useState(readDisk);

	useFocusEffect(
		useCallback(() => {
			// Ekrana her dönüşte boş alan tazelenir (indirme bitti/silindi).
			setDisk(readDisk());

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
		return [...map.values()].map((g) => {
			const items = g.items.sort(
				(a, b) =>
					Number(a.seasonNumber || 0) - Number(b.seasonNumber || 0) ||
					Number(a.episodeNumber || 0) - Number(b.episodeNumber || 0),
			);
			return {
				...g,
				items,
				completedCount: items.filter((i) => i.status === "completed").length,
				bytes: items.reduce((sum, i) => sum + bytesOf(i), 0),
			};
		});
	}, [queue]);

	/** StreamPulse'ın kapladığı toplam alan. */
	const usedBytes = useMemo(
		() => (queue || []).reduce((sum, i) => sum + bytesOf(i), 0),
		[queue],
	);

	/**
	 * "Dışa aktar": indirilen dosya uygulama klasöründen
	 * Download/StreamPulse'a taşınır (özel klasörden silinir, çift kayıt olmaz).
	 */
	const [exportingIds, setExportingIds] = useState({});

	const exportDownload = async (item) => {
		if (exportingIds[item.id]) return;
		setExportingIds((p) => ({ ...p, [item.id]: true }));
		try {
			const { DownloadManager } = await import("@/services/downloadManager");
			const path = await DownloadManager.exportDownload(item.id);
			if (!path) console.warn("Dışa aktarılamadı:", item.id);
		} catch (e) {
			console.warn("Dışa aktarılamadı:", e?.message);
		} finally {
			setExportingIds((p) => ({ ...p, [item.id]: false }));
		}
	};

	const openPlayer = (item) => {
		if (item.status !== "completed" || !item.filePath) return;		const isSeries = item.type === "series";
		router.push({
			pathname: "/player",
			params: {
				// Yerel kayıt: çıktı URI'sini doğrudan kaynaktır (madde 11/14).
				url: item.filePath,
				localSubtitle: item.subtitlePath || undefined,
				title: item.contentTitle,
				subtitle: isSeries ? episodeLabel(item) : "",
				poster: item.posterUrl || undefined,
				id: item.contentId || undefined,
				type: isSeries ? "episode" : "movie",
				plugin: item.pluginName,
				seriesId: isSeries ? item.seriesId || undefined : undefined,
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

	/** Poster yoksa düz zemin + ikon (indirme kaydında poster zorunlu değil). */
	const renderThumb = (uri) =>
		uri ? (
			<SmartImage
				source={{ uri }}
				style={styles.fillImg}
				contentFit="cover"
				transition={0}
			/>
		) : (
			<View style={styles.thumbFallback}>
				<Ionicons name="film-outline" size={20} color={m3.onSurfaceVariant} />
			</View>
		);

	/** İlerleme çubuğu + "indirilen / toplam" + hız satırı. */
	const renderProgress = (item) => {
		const pct = Math.max(0, Math.min(100, Math.round((item.progress || 0) * 100)));
		const speed = formatBytes(item.speedBps);
		return (
			<>
				<View
					style={[
						styles.track,
						{ backgroundColor: m3.surfaceContainerHighest },
					]}>
					{pct > 0 ? (
						<LinearGradient
							colors={[m3.primaryContainer, m3.tertiary]}
							start={{ x: 0, y: 0 }}
							end={{ x: 1, y: 0 }}
							style={[styles.fill, { width: `${pct}%` }]}
						/>
					) : null}
				</View>
				<View style={styles.progressMeta}>
					<Text
						style={[styles.meta, { color: m3.onSurfaceVariant }]}
						numberOfLines={1}>
						{item.totalBytes > 0
							? `${formatBytes(item.downloadedBytes) || "0 MB"} / ${formatBytes(item.totalBytes)}`
							: `%${pct}`}
					</Text>
					{speed ? (
						<Text style={[styles.speed, { color: m3.tertiary }]}>
							{`${speed}/s`}
						</Text>
					) : null}
				</View>
			</>
		);
	};

	/** Yuvarlak eylem butonu (duraklat/devam, iptal, sil). */
	const actionButton = ({ key, icon, color, onPress, label }) => (
		<TVPressable
			key={key}
			onPress={onPress}
			accessibilityLabel={label}
			style={styles.iconBtn}>
			<Ionicons name={icon} size={20} color={color} />
		</TVPressable>
	);

	/** İndirilen (veya indirilmekte olan) tek öğe — film kartı. */
	const renderMovieCard = (item) => {
		if (isActiveStatus(item.status)) {
			const eta = etaLabel(item);
			const canResume = item.status === "paused" || item.status === "failed";
			return (
				<View style={[styles.card, { backgroundColor: m3.surfaceContainer }]}>
					<View style={styles.row}>
						<View
							style={[styles.thumbWide, { backgroundColor: m3.surfaceLowest }]}>
							{renderThumb(item.posterUrl)}
							<View
								style={[
									styles.percentBadge,
									{ backgroundColor: `${m3.surfaceLowest}E6` },
								]}>
								<Ionicons name="sync" size={11} color={m3.tertiary} />
								<Text style={[styles.percentText, { color: m3.tertiary }]}>
									{`%${Math.round((item.progress || 0) * 100)}`}
								</Text>
							</View>
						</View>
						<View style={styles.flex}>
							<Text
								style={[styles.title, { color: m3.onSurface }]}
								numberOfLines={1}>
								{item.contentTitle}
							</Text>
							<Text
								style={[styles.sub, { color: m3.onSurfaceVariant }]}
								numberOfLines={1}>
								{STATUS_LABEL[item.status]}
							</Text>
							{renderProgress(item)}
						</View>
					</View>
					<View style={[styles.footer, { backgroundColor: m3.surfaceLow }]}>
						<View style={styles.footerLeft}>
							<Ionicons name="download-outline" size={16} color={m3.tertiary} />
							<Text
								style={[styles.footerText, { color: m3.onSurfaceVariant }]}
								numberOfLines={1}>
								{eta ? `Tahmini: ${eta}` : STATUS_LABEL[item.status]}
							</Text>
						</View>
						<View style={styles.footerRight}>
							{canResume
								? actionButton({
										key: "resume",
										icon: "play",
										color: m3.tertiary,
										onPress: () => resumeDownload(item.id),
										label: "Devam Et",
									})
								: item.status === "downloading" || item.status === "queued"
									? actionButton({
											key: "pause",
											icon: "pause",
											color: m3.onSurface,
											onPress: () => pauseDownload(item.id),
											label: "Duraklat",
										})
									: null}
							{actionButton({
								key: "cancel",
								icon: "close",
								color: m3.error,
								onPress: () => confirmCancel(item),
								label: "İptal Et",
							})}
						</View>
					</View>
					{item.status === "failed" && item.error ? (
						<Text style={[styles.errorText, { color: m3.error }]} numberOfLines={2}>
							{item.error}
						</Text>
					) : null}
				</View>
			);
		}

		return (
			<View
				style={[
					styles.card,
					styles.row,
					{ backgroundColor: m3.surfaceContainer },
				]}>
				<View style={[styles.thumbPoster, { backgroundColor: m3.surfaceLowest }]}>
					{renderThumb(item.posterUrl)}
					{item.status === "completed" ? (
						<View style={[styles.checkBadge, { backgroundColor: m3.success }]}>
							<Ionicons name="checkmark" size={11} color={m3.surfaceLowest} />
						</View>
					) : null}
				</View>
				<View style={styles.flex}>
					<Text
						style={[styles.title, { color: m3.onSurface }]}
						numberOfLines={1}>
						{item.contentTitle}
					</Text>
					<Text style={[styles.sub, { color: m3.onSurfaceVariant }]}>
						{metaLine(
							"Film",
							formatBytes(bytesOf(item)),
							item.exported ? "Dışa aktarıldı" : null,
						)}
					</Text>
				</View>
				<View style={styles.rowActions}>
					{item.status === "completed" ? (
						<TVPressable
							onPress={() => openPlayer(item)}
							style={[styles.playPill, { backgroundColor: m3.primaryContainer }]}
							focusedStyle={styles.pillFocus}>
							<Ionicons name="play" size={18} color={m3.onPrimaryContainer} />
							<Text
								style={[styles.playPillText, { color: m3.onPrimaryContainer }]}>
								Oynat
							</Text>
						</TVPressable>
					) : null}
					{item.status === "completed" && !item.exported ? (
						<TVPressable
							onPress={() => exportDownload(item)}
							style={[styles.playPill, { backgroundColor: m3.surfaceContainerHigh }]}
							focusedStyle={styles.pillFocus}
							accessibilityLabel="Dışa aktar">
							{exportingIds[item.id] ? (
								<ActivityIndicator size="small" color={m3.tertiary} />
							) : (
								<Ionicons name="share-outline" size={18} color={m3.tertiary} />
							)}
							<Text style={[styles.playPillText, { color: m3.tertiary }]}>
								Dışa Aktar
							</Text>
						</TVPressable>
					) : null}
					{actionButton({
						key: "delete",
						icon: "trash-outline",
						color: m3.onSurfaceVariant,
						onPress: () => confirmDelete(item),
						label: "Sil",
					})}
				</View>
			</View>
		);
	};

	/** Dizi bölümü satırı (accordion içi). */
	const renderEpisodeRow = (item) => {
		const active = isActiveStatus(item.status);
		const canResume = item.status === "paused" || item.status === "failed";
		return (
			<View
				key={item.id}
				style={[styles.episodeRow, { backgroundColor: m3.surfaceContainer }]}>
				<View
					style={[styles.thumbSmall, { backgroundColor: m3.surfaceLowest }]}>
					{renderThumb(item.posterUrl)}
					{active ? (
						<View
							style={[
								styles.percentBadge,
								{ backgroundColor: `${m3.surfaceLowest}E6` },
							]}>
							<Text style={[styles.percentText, { color: m3.tertiary }]}>
								{`%${Math.round((item.progress || 0) * 100)}`}
							</Text>
						</View>
					) : null}
				</View>
				<View style={styles.flex}>
					<Text
						style={[styles.epTitle, { color: m3.onSurface }]}
						numberOfLines={1}>
						{episodeLabel(item)}
					</Text>
					{active ? (
						renderProgress(item)
					) : (
						<Text
							style={[styles.meta, { color: m3.onSurfaceVariant }]}
							numberOfLines={1}>
							{metaLine(
								formatBytes(bytesOf(item)),
								item.exported ? "Dışa aktarıldı" : null,
							)}
						</Text>
					)}
				</View>
				<View style={styles.rowActions}>
					{active ? (
						<>
							{canResume
								? actionButton({
										key: "resume",
										icon: "play",
										color: m3.tertiary,
										onPress: () => resumeDownload(item.id),
										label: "Devam Et",
									})
								: actionButton({
										key: "pause",
										icon: "pause",
										color: m3.onSurface,
										onPress: () => pauseDownload(item.id),
										label: "Duraklat",
									})}
							{actionButton({
								key: "cancel",
								icon: "close",
								color: m3.error,
								onPress: () => confirmCancel(item),
								label: "İptal Et",
							})}
						</>
					) : (
						<>
							{item.status === "completed" ? (
								<TVPressable
									onPress={() => openPlayer(item)}
									accessibilityLabel="Bölümü Oynat"
									style={[
										styles.playRound,
										{ backgroundColor: m3.primaryContainer },
									]}
									focusedStyle={styles.pillFocus}>
									<Ionicons
										name="play"
										size={18}
										color={m3.onPrimaryContainer}
									/>
								</TVPressable>
							) : null}
							{item.status === "completed" && !item.exported ? (
								<TVPressable
									onPress={() => exportDownload(item)}
									accessibilityLabel="Dışa aktar"
									style={[
										styles.playRound,
										{ backgroundColor: m3.surfaceContainerHigh },
									]}
									focusedStyle={styles.pillFocus}>
									{exportingIds[item.id] ? (
										<ActivityIndicator size="small" color={m3.tertiary} />
									) : (
										<Ionicons
											name="share-outline"
											size={18}
											color={m3.tertiary}
										/>
									)}
								</TVPressable>
							) : null}
							{actionButton({
								key: "delete",
								icon: "trash-outline",
								color: m3.onSurfaceVariant,
								onPress: () => confirmDelete(item),
								label: "Bölümü Sil",
							})}
						</>
					)}
				</View>
			</View>
		);
	};

	const canResumeAll = (queue || []).some(
		(i) => i.status === "paused" || i.status === "failed",
	);
	const hasActive = (queue || []).some(
		(i) => i.status === "downloading" || i.status === "queued",
	);

	const usedPct = disk
		? Math.min(100, Math.max(0, (usedBytes / disk.total) * 100))
		: 0;

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
					{disk ? (
						<View
							style={[styles.storageCard, { backgroundColor: m3.surfaceContainer }]}>
							<View style={styles.storageTop}>
								<View style={styles.storageLabelRow}>
									<Ionicons
										name="pie-chart-outline"
										size={18}
										color={m3.primaryContainer}
									/>
									<Text style={[styles.storageLabel, { color: m3.onSurface }]}>
										Depolama Alanı
									</Text>
								</View>
								<Text style={[styles.meta, { color: m3.onSurfaceVariant }]}>
									{`${formatBytes(usedBytes) || "0 MB"} / ${formatBytes(disk.total)}`}
								</Text>
							</View>
							<View
								style={[
									styles.barTrack,
									{ backgroundColor: m3.surfaceContainerHighest },
								]}>
								<View
									style={{
										width: `${usedPct}%`,
										backgroundColor: m3.primaryContainer,
									}}
								/>
							</View>
							<View style={styles.legendRow}>
								<View style={styles.legendItem}>
									<View
										style={[styles.dot, { backgroundColor: m3.primaryContainer }]}
									/>
									<Text style={[styles.legendText, { color: m3.onSurfaceVariant }]}>
										{`StreamPulse (${formatBytes(usedBytes) || "0 MB"})`}
									</Text>
								</View>
								<View style={styles.legendItem}>
									<Text style={[styles.legendText, { color: m3.tertiary }]}>
										{`${formatBytes(disk.free)} Boş`}
									</Text>
								</View>
							</View>
						</View>
					) : null}

					{groups.length > 0 ? (
						<View style={styles.strip}>
							{canResumeAll || hasActive ? (
								<TVPressable
									onPress={() => (canResumeAll ? resumeAll() : pauseAll())}
									style={[
										styles.primaryBtn,
										{ backgroundColor: m3.primaryContainer },
									]}
									focusedStyle={styles.pillFocus}>
									<Ionicons
										name={canResumeAll ? "play" : "pause"}
										size={18}
										color={m3.onPrimaryContainer}
									/>
									<Text
										style={[
											styles.primaryBtnText,
											{ color: m3.onPrimaryContainer },
										]}>
										{canResumeAll ? "Tümünü Devam Ettir" : "Tümünü Duraklat"}
									</Text>
								</TVPressable>
							) : null}
							<TVPressable
								onPress={() => router.push("/(app)/settings/download")}
								style={[
									styles.secondaryBtn,
									{ backgroundColor: m3.surfaceContainerHigh },
								]}
								focusedStyle={styles.pillFocus}>
								<Ionicons name="tune" size={18} color={m3.onSurface} />
								<Text
									style={[styles.secondaryBtnText, { color: m3.onSurface }]}>
									İndirme Ayarları
								</Text>
							</TVPressable>
						</View>
					) : null}

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
								return (
									<View key={group.key} style={styles.fullWidth}>
										{renderMovieCard(group.items[0])}
									</View>
								);
							}
							const isCollapsed = Boolean(collapsed[group.key]);
							return (
								<View key={group.key} style={styles.fullWidth}>
									<TVPressable
										onPress={() =>
											setCollapsed((prev) => ({
												...prev,
												[group.key]: !prev[group.key],
											}))
										}
										style={[
											styles.card,
											styles.row,
											{ backgroundColor: m3.surfaceContainer },
										]}>
										<View
											style={[
												styles.thumbPoster,
												{ backgroundColor: m3.surfaceLowest },
											]}>
											{renderThumb(group.poster)}
											<View
												style={[
													styles.countBadge,
													{ backgroundColor: `${m3.surfaceLowest}E6` },
												]}>
												<Text
													style={[styles.percentText, { color: m3.onSurface }]}>
													{`${group.completedCount} Blm`}
												</Text>
											</View>
										</View>
										<View style={styles.flex}>
											<Text
												style={[styles.title, { color: m3.onSurface }]}
												numberOfLines={1}>
												{group.title}
											</Text>
											<Text
												style={[styles.sub, { color: m3.onSurfaceVariant }]}
												numberOfLines={1}>
												{metaLine(
													"Dizi",
													`${group.completedCount}/${group.items.length} Bölüm Hazır`,
													formatBytes(group.bytes),
												)}
											</Text>
											{group.completedCount === group.items.length ? (
												<View style={styles.offlineRow}>
													<Ionicons
														name="cloud-offline-outline"
														size={15}
														color={m3.tertiary}
													/>
													<Text
														style={[
															styles.offlineText,
															{ color: m3.tertiary },
														]}>
														Çevrimdışı İzlemeye Hazır
													</Text>
												</View>
											) : null}
										</View>
										<View style={styles.rowActions}>
											<Ionicons
												name={isCollapsed ? "chevron-down" : "chevron-up"}
												size={22}
												color={m3.onSurfaceVariant}
											/>
										</View>
									</TVPressable>
									{!isCollapsed ? (
										<View style={styles.groupBody}>
											{group.items.map((item) => renderEpisodeRow(item))}
										</View>
									) : null}
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

	// ── Depolama kartı ─────────────────────────────────────────────
	storageCard: { width: "100%", borderRadius: 12, padding: 14, gap: 8 },
	storageTop: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
	storageLabelRow: { flexDirection: "row", alignItems: "center", gap: 6 },
	storageLabel: { fontSize: 13.5, fontWeight: "600" },
	barTrack: { height: 10, borderRadius: 5, overflow: "hidden", flexDirection: "row" },
	legendRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
	legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
	dot: { width: 8, height: 8, borderRadius: 4 },
	legendText: { fontSize: 11.5 },

	// ── Eylem şeridi ───────────────────────────────────────────────
	strip: { width: "100%", flexDirection: "row", flexWrap: "wrap", gap: 8 },
	primaryBtn: {
		height: 44,
		paddingHorizontal: 16,
		borderRadius: 22,
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
	},
	primaryBtnText: { fontSize: 13.5, fontWeight: "700" },
	secondaryBtn: {
		height: 44,
		paddingHorizontal: 16,
		borderRadius: 22,
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
	},
	secondaryBtnText: { fontSize: 13, fontWeight: "600" },
	// Odak halkası: kırmızı zemin üstünde görünür olsun diye beyaz.
	pillFocus: { borderColor: "#ffffff", borderWidth: 2 },

	// ── Kartlar ────────────────────────────────────────────────────
	card: { width: "100%", borderRadius: 12, padding: 10, gap: 10 },
	row: { flexDirection: "row", alignItems: "center", gap: 12 },
	flex: { flex: 1, minWidth: 0 },
	title: { fontSize: 16, fontWeight: "700" },
	sub: { fontSize: 12, marginTop: 1 },
	meta: { fontSize: 11.5 },
	speed: { fontSize: 11.5, fontWeight: "700" },
	errorText: { fontSize: 12 },

	thumbWide: {
		width: 112,
		aspectRatio: 16 / 9,
		borderRadius: 8,
		overflow: "hidden",
	},
	thumbSmall: {
		width: 88,
		aspectRatio: 16 / 9,
		borderRadius: 6,
		overflow: "hidden",
	},
	thumbPoster: {
		width: 64,
		aspectRatio: 2 / 3,
		borderRadius: 8,
		overflow: "hidden",
	},
	fillImg: { width: "100%", height: "100%" },
	thumbFallback: {
		width: "100%",
		height: "100%",
		alignItems: "center",
		justifyContent: "center",
	},
	percentBadge: {
		position: "absolute",
		left: 4,
		bottom: 4,
		paddingHorizontal: 5,
		paddingVertical: 1,
		borderRadius: 4,
		flexDirection: "row",
		alignItems: "center",
		gap: 2,
	},
	percentText: { fontSize: 9.5, fontWeight: "700" },
	countBadge: {
		position: "absolute",
		right: 4,
		bottom: 4,
		paddingHorizontal: 4,
		borderRadius: 4,
	},
	checkBadge: {
		position: "absolute",
		top: 4,
		left: 4,
		width: 16,
		height: 16,
		borderRadius: 8,
		alignItems: "center",
		justifyContent: "center",
	},

	track: { height: 6, borderRadius: 3, overflow: "hidden", marginTop: 8 },
	fill: { height: "100%", borderRadius: 3 },
	progressMeta: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginTop: 4,
	},

	footer: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		borderRadius: 8,
		paddingHorizontal: 10,
		paddingVertical: 4,
	},
	footerLeft: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1 },
	footerText: { fontSize: 11.5 },
	footerRight: { flexDirection: "row", alignItems: "center", gap: 4 },

	rowActions: { flexDirection: "row", alignItems: "center", gap: 6 },
	iconBtn: {
		width: 40,
		height: 40,
		borderRadius: 20,
		alignItems: "center",
		justifyContent: "center",
	},
	playPill: {
		height: 40,
		paddingHorizontal: 14,
		borderRadius: 20,
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
	},
	playPillText: { fontSize: 13, fontWeight: "700" },
	playRound: {
		width: 40,
		height: 40,
		borderRadius: 20,
		alignItems: "center",
		justifyContent: "center",
	},

	// ── Dizi accordion ─────────────────────────────────────────────
	groupBody: { marginTop: 8, gap: 8 },
	episodeRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		borderRadius: 10,
		padding: 8,
	},
	epTitle: { fontSize: 13, fontWeight: "600" },
	offlineRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 4 },
	offlineText: { fontSize: 11.5, fontWeight: "600" },

	// ── Boş durum ──────────────────────────────────────────────────
	fullWidth: { width: "100%" },
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
});
