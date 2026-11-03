/*
 * İndirilenler ekranı — yeni tasarım (Faz 5).
 *
 * • Başlık satırı: "İndirilenler" + "N öğe" hapı + sağda `Düzenle` ve ayarlar.
 * • Depolama kartı: kullanılan/toplam, ince bar, StreamPulse / Diğer / Boş.
 * • Filtre sekmeleri: Tümü / İndiriliyor / Tamamlananlar (sayılı).
 * • Diziler ACCORDION (başlık + bölüm satırları aynı kartta), filmler tek kart.
 * • `Düzenle` → seçim modu; kartlarda onay kutusu, altta "Seçilenleri Sil".
 * • Veri katmanı değişmedi: `useDownload()` kuyruğu ve eylemleri aynen kullanılır.
 */

import BottomNavigation from "@/components/BottomNavigation";
import SmartImage from "@/components/common/SmartImage";
import TVPressable from "@/components/common/TVPressable";
import { FontFamily, Palette } from "@/constants/theme";
import { useDownload } from "@/context/DownloadContext";
import { useFeedback } from "@/components/feedback/AppFeedbackProvider";
import { useNavLayout } from "@/hooks/useNavLayout";
import { etaLabel } from "@/utils/downloadEta";
import { useTvMetrics } from "@/utils/tvMetrics";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { Paths } from "expo-file-system";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
	ActivityIndicator,
	BackHandler,
	ScrollView,
	StatusBar,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const PADDING_HORIZONTAL = 16;

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

/** İndirme hızı: "4.2 MB/sn". */
function formatSpeed(bps) {
	const size = formatBytes(bps);
	return size ? `${size}/sn` : "";
}

/** "Film • 2.1 GB" — boş parçalar atlanır. */
function metaLine(...parts) {
	return parts.filter(Boolean).join(" • ");
}

/** Dizi bölümü etiketi (oynatıcıya giden): "S01xE04 · Bölüm adı" */
function episodeLabel(item) {
	const s = String(item.seasonNumber || 1).padStart(2, "0");
	const e = String(item.episodeNumber || 1).padStart(2, "0");
	return `S${s}xE${e}${item.episodeTitle ? ` · ${item.episodeTitle}` : ""}`;
}

/** Kart satırındaki kısa etiket: "S2 B1" */
function episodeTag(item) {
	return `S${item.seasonNumber || 1} B${item.episodeNumber || 1}`;
}

/** Kayıtlı varyant çözünürlüğünden kalite rozeti ("4K", "1080p", …). */
function qualityLabel(item) {
	const m = String(item.variantResolution || "").match(
		/(\d{3,4})\s*[x×]\s*(\d{3,4})/,
	);
	if (!m) return null;
	const h = Number(m[2]);
	if (h >= 2160) return "4K";
	return `${h}p`;
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
	const { contentPaddingLeft } = useNavLayout();
	const { sp, contentMaxWidth, isWide } = useTvMetrics();
	const { alert } = useFeedback();
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

	// Filtre sekmesi + seçim modu.
	const [filter, setFilter] = useState("all");
	const [isSelectionMode, setIsSelectionMode] = useState(false);
	const [selectedIds, setSelectedIds] = useState(() => new Set());

	// Cihaz depolaması — kart yalnızca değer okunabiliyorsa gösterilir.
	const [disk, setDisk] = useState(readDisk);

	useFocusEffect(
		useCallback(() => {
			// Ekrana her dönüşte boş alan tazelenir (indirme bitti/silindi).
			setDisk(readDisk());

			const onBackPress = () => {
				if (isSelectionMode) {
					setIsSelectionMode(false);
					setSelectedIds(new Set());
					return true;
				}
				if (router.canGoBack()) router.back();
				else router.replace("/(app)");
				return true;
			};
			const sub = BackHandler.addEventListener("hardwareBackPress", onBackPress);
			return () => sub.remove();
		}, [router, isSelectionMode]),
	);

	/**
	 * Gruplama: dizi bölümleri `seriesId` (yoksa seriesTitle) altında toplanır;
	 * filmler tek öğelik grup olarak döner.
	 */
	const groups = useMemo(() => {
		const map = new Map();
		(queue || []).forEach((item) => {
			const isSeries =
				item.type === "series" ||
				Boolean(item.seasonNumber && item.episodeNumber);
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
					Number(b.episodeNumber || 0) - Number(a.episodeNumber || 0),
			);
			return {
				...g,
				items,
				completedCount: items.filter((i) => i.status === "completed").length,
				activeCount: items.filter((i) => i.status !== "completed").length,
				bytes: items.reduce((sum, i) => sum + bytesOf(i), 0),
			};
		});
	}, [queue]);

	/** Sekmeye göre görünür gruplar (bölümler de filtrelenir). */
	const visibleGroups = useMemo(() => {
		const keep = (item) => {
			if (filter === "active") return item.status !== "completed";
			if (filter === "completed") return item.status === "completed";
			return true;
		};
		return groups
			.map((g) => {
				const items = g.items.filter(keep);
				return {
					...g,
					items,
					completedCount: items.filter((i) => i.status === "completed").length,
					activeCount: items.filter((i) => i.status !== "completed").length,
					bytes: items.reduce((sum, i) => sum + bytesOf(i), 0),
				};
			})
			.filter((g) => g.items.length > 0);
	}, [groups, filter]);

	const visibleItems = useMemo(
		() => visibleGroups.flatMap((g) => g.items),
		[visibleGroups],
	);

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
		if (item.status !== "completed" || !item.filePath) return;
		const isSeries = item.type === "series";
		router.push({
			pathname: "/player",
			params: {
				// Yerel kayıt: çıktı URI'sini doğrudan kaynaktır.
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
		alert({
			title: "İndirmeyi İptal Et",
			message: `"${item.type === "series" ? episodeLabel(item) : item.contentTitle}" iptal edilsin mi?`,
			confirmText: "İptal Et",
			cancelText: "Vazgeç",
			destructive: true,
			onConfirm: () => cancelDownload(item.id),
		});
	};

	const confirmDelete = (item) => {
		alert({
			title: "İndirmeyi Sil",
			message: "Kayıt ve indirilen dosyalar silinsin mi?",
			confirmText: "Sil",
			cancelText: "Vazgeç",
			destructive: true,
			onConfirm: () => removeDownload(item.id),
		});
	};

	/* ── Seçim modu ─────────────────────────────────────────────── */

	const exitSelection = () => {
		setIsSelectionMode(false);
		setSelectedIds(new Set());
	};

	const toggleSelected = (id) => {
		setSelectedIds((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	};

	/** Dizi başlığına dokunmak, o dizinin görünür bölümlerini seçer/bırakır. */
	const toggleGroupSelected = (group) => {
		const ids = group.items.map((i) => i.id);
		const allSelected = ids.every((id) => selectedIds.has(id));
		setSelectedIds((prev) => {
			const next = new Set(prev);
			ids.forEach((id) => (allSelected ? next.delete(id) : next.add(id)));
			return next;
		});
	};

	const allVisibleSelected =
		visibleItems.length > 0 &&
		visibleItems.every((i) => selectedIds.has(i.id));

	const toggleSelectAll = () => {
		if (allVisibleSelected) {
			setSelectedIds(new Set());
			return;
		}
		setSelectedIds(new Set(visibleItems.map((i) => i.id)));
	};

	const selectedBytes = useMemo(
		() =>
			(queue || [])
				.filter((i) => selectedIds.has(i.id))
				.reduce((sum, i) => sum + bytesOf(i), 0),
		[queue, selectedIds],
	);

	const handleBulkDelete = () => {
		const ids = [...selectedIds];
		if (ids.length === 0) return;
		alert({
			title: "İndirmeleri Sil",
			message: `${ids.length} indirme ve dosyaları silinsin mi?`,
			confirmText: "Sil",
			cancelText: "Vazgeç",
			destructive: true,
			onConfirm: async () => {
				for (const id of ids) await removeDownload(id);
				exitSelection();
			},
		});
	};

	/* ── Parçalar ───────────────────────────────────────────────── */

	/** Poster yoksa düz zemin + ikon (indirme kaydında poster zorunlu değil). */
	const renderPoster = (uri, badge, width = 56) => (
		<View
			style={[
				styles.posterWrap,
				{ width: sp(width), borderRadius: sp(8) },
			]}>
			{uri ? (
				<SmartImage
					source={{ uri }}
					style={styles.fillImg}
					contentFit="cover"
					transition={0}
				/>
			) : (
				<View style={styles.posterFallback}>
					<Ionicons
						name="film-outline"
						size={sp(18)}
						color={Palette.onSurfaceVariant}
					/>
				</View>
			)}
			{badge ? (
				<View
					style={[
						styles.posterBadge,
						{ borderRadius: sp(4), paddingHorizontal: sp(4) },
					]}>
					<Text
						numberOfLines={1}
						style={[styles.posterBadgeText, { fontSize: sp(8) }]}>
						{badge}
					</Text>
				</View>
			) : null}
		</View>
	);

	/** İlerleme çubuğu (yalnız aktif indirmelerde). */
	const renderProgress = (item) => {
		const pct = Math.max(0, Math.min(100, Math.round((item.progress || 0) * 100)));
		return (
			<View
				style={[
					styles.progressTrack,
					{ height: Math.max(3, sp(3)), borderRadius: sp(2) },
				]}>
				{pct > 0 ? (
					<View
						style={[
							styles.progressFill,
							{ width: `${pct}%`, borderRadius: sp(2) },
						]}
					/>
				) : null}
			</View>
		);
	};

	/** Durum satırı: "4.2 MB/sn · 3 dk kaldı (%68)" / "2.4 GB · İndirildi". */
	const statusLine = (item) => {
		const pct = Math.round((item.progress || 0) * 100);
		const size = formatBytes(item.status === "completed" ? bytesOf(item) : 0);
		if (item.status === "completed") {
			return { text: metaLine(size, "İndirildi"), tone: "muted" };
		}
		if (item.status === "downloading" || item.status === "queued") {
			const speed = formatSpeed(item.speedBps);
			const eta = etaLabel(item);
			return {
				text: metaLine(speed, eta, `%${pct}`),
				tone: "accent",
			};
		}
		if (item.status === "failed") {
			return {
				text: metaLine(formatBytes(bytesOf(item)), `%${pct}`, "Hata"),
				tone: "error",
			};
		}
		return {
			text: metaLine(
				formatBytes(bytesOf(item)),
				`${STATUS_LABEL[item.status] || ""} (%${pct})`,
			),
			tone: "muted",
		};
	};

	/** Yuvarlak eylem butonu. */
	const actionButton = ({ key, icon, color, onPress, label, busy }) => (
		<TVPressable
			key={key}
			onPress={onPress}
			accessibilityLabel={label}
			focusedStyle={styles.roundFocus}
			style={({ focused }) => [
				styles.roundBtn,
				{ borderRadius: sp(16) },
				focused && styles.roundFocused,
			]}>
			{busy ? (
				<ActivityIndicator size="small" color={color} />
			) : (
				<Ionicons name={icon} size={sp(17)} color={color} />
			)}
		</TVPressable>
	);

	/** Onay kutusu (seçim modu). */
	const renderCheck = (checked) => (
		<View
			style={[
				styles.check,
				{ borderRadius: sp(11) },
				checked && styles.checkOn,
			]}>
			{checked ? (
				<Ionicons
					name="checkmark"
					size={sp(14)}
					color={Palette.onPrimaryContainer}
				/>
			) : null}
		</View>
	);

	/** Bir öğenin eylem düğmeleri (film kartı ve bölüm satırı ortak). */
	const renderActions = (item) => {
		if (item.status === "merged" || item.status === "merging") {
			return (
				<View style={styles.actions}>
					<ActivityIndicator size="small" color={Palette.tertiary} />
				</View>
			);
		}
		if (item.status === "downloading" || item.status === "queued") {
			return (
				<View style={styles.actions}>
					{actionButton({
						key: "pause",
						icon: "pause",
						color: Palette.onSurface,
						onPress: () => pauseDownload(item.id),
						label: "Duraklat",
					})}
					{actionButton({
						key: "cancel",
						icon: "close",
						color: Palette.error,
						onPress: () => confirmCancel(item),
						label: "İptal Et",
					})}
				</View>
			);
		}
		if (
			item.status === "paused" ||
			item.status === "failed" ||
			item.status === "cancelled"
		) {
			return (
				<View style={styles.actions}>
					{actionButton({
						key: "resume",
						icon: "refresh",
						color: Palette.tertiary,
						onPress: () => resumeDownload(item.id),
						label: "Devam Et",
					})}
					{actionButton({
						key: "delete",
						icon: "trash-outline",
						color: Palette.onSurfaceVariant,
						onPress: () => confirmDelete(item),
						label: "Sil",
					})}
				</View>
			);
		}
		// Tamamlandı
		return (
			<View style={styles.actions}>
				{!item.exported
					? actionButton({
							key: "export",
							icon: "share-outline",
							color: Palette.onSurfaceVariant,
							onPress: () => exportDownload(item),
							label: "Dışa aktar",
							busy: Boolean(exportingIds[item.id]),
						})
					: null}
				{actionButton({
					key: "delete",
					icon: "trash-outline",
					color: Palette.onSurfaceVariant,
					onPress: () => confirmDelete(item),
					label: "Sil",
				})}
				<TVPressable
					onPress={() => openPlayer(item)}
					accessibilityLabel="Oynat"
					focusedStyle={styles.playFocus}
					style={({ focused }) => [
						styles.playBtn,
						{ borderRadius: sp(20) },
						focused && styles.playFocused,
					]}>
					<Ionicons
						name="play"
						size={sp(16)}
						color={Palette.onPrimaryContainer}
					/>
				</TVPressable>
			</View>
		);
	};

	/** Dizi bölümü satırı (accordion içi). */
	const renderEpisodeRow = (item) => {
		const active = isActiveStatus(item.status);
		const status = statusLine(item);
		const quality = qualityLabel(item);
		const selected = selectedIds.has(item.id);
		return (
			<TVPressable
				key={item.id}
				onPress={() =>
					isSelectionMode ? toggleSelected(item.id) : openPlayer(item)
				}
				focusedStyle={null}
				style={({ focused }) => [
					styles.epRow,
					{ paddingVertical: sp(9), gap: sp(10) },
					focused && styles.rowFocused,
				]}>
				{isSelectionMode ? renderCheck(selected) : null}
				<View
					style={[
						styles.epBar,
						{
							backgroundColor: active
								? Palette.tertiary
								: item.status === "completed"
									? Palette.primary
									: Palette.outlineVariant,
						},
					]}
				/>
				<View style={styles.flex}>
					<View style={[styles.epTitleRow, { gap: sp(6) }]}>
						<Text
							numberOfLines={1}
							style={[styles.epTitle, { fontSize: sp(13) }]}>
							{`${episodeTag(item)}${item.episodeTitle ? `: ${item.episodeTitle}` : ""}`}
						</Text>
						{quality ? (
							<View
								style={[
									styles.qualityBadge,
									{ borderRadius: sp(4), paddingHorizontal: sp(5) },
								]}>
								<Text
									style={[
										styles.qualityText,
										{ fontSize: sp(9) },
									]}>
									{quality}
								</Text>
							</View>
						) : null}
					</View>
					<Text
						numberOfLines={1}
						style={[
							styles.meta,
							{ fontSize: sp(11) },
							status.tone === "accent" && styles.metaAccent,
							status.tone === "error" && styles.metaError,
						]}>
						{status.text}
					</Text>
					{active ? (
						<View style={{ marginTop: sp(6) }}>{renderProgress(item)}</View>
					) : null}
				</View>
				{renderActions(item)}
			</TVPressable>
		);
	};

	/** Film kartı. */
	const renderMovieCard = (item) => {
		const status = statusLine(item);
		const quality = qualityLabel(item);
		const selected = selectedIds.has(item.id);
		return (
			<TVPressable
				key={item.id}
				onPress={() =>
					isSelectionMode ? toggleSelected(item.id) : openPlayer(item)
				}
				focusedStyle={null}
				style={({ focused }) => [
					styles.movieCard,
					{ borderRadius: sp(14), padding: sp(10), gap: sp(10) },
					item.status === "failed" && styles.movieCardFailed,
					focused && styles.focusRing,
				]}>
				{isSelectionMode ? renderCheck(selected) : null}
				{renderPoster(item.posterUrl, quality || "Film", 52)}
				<View style={styles.flex}>
					<View style={[styles.epTitleRow, { gap: sp(6) }]}>
						<Text
							numberOfLines={1}
							style={[styles.movieTitle, { fontSize: sp(14) }]}>
							{item.contentTitle}
						</Text>
						{isSelectionMode ? null : (
							<View
								style={[
									styles.pluginChip,
									{ borderRadius: sp(4), paddingHorizontal: sp(5) },
								]}>
								<Text
									numberOfLines={1}
									style={[
										styles.pluginText,
										{ fontSize: sp(8) },
									]}>
									{String(item.pluginName || "Film").toUpperCase()}
								</Text>
							</View>
						)}
					</View>
					<Text
						numberOfLines={1}
						style={[
							styles.meta,
							{ fontSize: sp(11), marginTop: sp(2) },
							status.tone === "accent" && styles.metaAccent,
							status.tone === "error" && styles.metaError,
						]}>
						{status.text}
					</Text>
					{item.status === "failed" && item.error ? (
						<Text
							numberOfLines={1}
							style={[
								styles.errorText,
								{ fontSize: sp(10), marginTop: sp(2) },
							]}>
							{item.error}
						</Text>
					) : null}
					{isActiveStatus(item.status) ? (
						<View style={{ marginTop: sp(6) }}>{renderProgress(item)}</View>
					) : null}
				</View>
				{renderActions(item)}
			</TVPressable>
		);
	};

	/** Dizi grubu: başlık (accordion) + bölüm satırları, tek kart içinde. */
	const renderSeriesGroup = (group) => {
		const isCollapsed = Boolean(collapsed[group.key]);
		const groupSelected = group.items.every((i) => selectedIds.has(i.id));
		const subtitle = [
			`${group.items.length} Bölüm`,
			formatBytes(group.bytes) ? `${formatBytes(group.bytes)} Toplam` : null,
		]
			.filter(Boolean)
			.join(" · ");
		const statusParts = [
			group.activeCount > 0
				? `${group.activeCount} İndiriliyor`
				: null,
			group.completedCount > 0
				? `${group.completedCount} Tamamlandı`
				: null,
		].filter(Boolean);

		return (
			<View
				key={group.key}
				style={[styles.groupCard, { borderRadius: sp(14) }]}>
				<TVPressable
					onPress={() =>
						isSelectionMode
							? toggleGroupSelected(group)
							: setCollapsed((prev) => ({
									...prev,
									[group.key]: !prev[group.key],
								}))
					}
					focusedStyle={null}
					style={({ focused }) => [
						styles.groupHeader,
						{ padding: sp(10), gap: sp(10) },
						focused && styles.focusRing,
					]}>
					{isSelectionMode ? renderCheck(groupSelected) : null}
					{renderPoster(
						group.poster,
						qualityLabel(group.items[0]) || "Dizi",
						48,
					)}
					<View style={styles.flex}>
						<Text
							numberOfLines={1}
							style={[styles.groupTitle, { fontSize: sp(14) }]}>
							{group.title}
						</Text>
						<Text
							numberOfLines={1}
							style={[styles.meta, { fontSize: sp(11) }]}>
							{subtitle}
						</Text>
						{statusParts.length > 0 ? (
							<Text
								numberOfLines={1}
								style={[
									styles.meta,
									styles.metaAccent,
									{ fontSize: sp(11), marginTop: sp(2) },
								]}>
								{statusParts.join(" · ")}
							</Text>
						) : null}
					</View>
					{isSelectionMode ? null : (
						<Ionicons
							name={isCollapsed ? "chevron-down" : "chevron-up"}
							size={sp(18)}
							color={Palette.onSurfaceVariant}
						/>
					)}
				</TVPressable>

				{!isCollapsed
					? group.items.map((item) => (
							<View
								key={item.id}
								style={{
									paddingHorizontal: sp(10),
									borderTopWidth: 1,
									borderTopColor: "rgba(229, 225, 228, 0.08)",
								}}>
								{renderEpisodeRow(item)}
							</View>
						))
					: null}
			</View>
		);
	};

	/** Alt seçim çubuğu. */
	const renderSelectionBar = () => (
		<View
			style={[
				styles.selectionBar,
				{
					paddingHorizontal: PADDING_HORIZONTAL,
					paddingTop: sp(10),
					paddingBottom: sp(10),
					gap: sp(10),
				},
			]}>
			<View style={[styles.selectionInfo, { gap: sp(8) }]}>
				<Text style={[styles.selectionCount, { fontSize: sp(12) }]}>
					{`${selectedIds.size} Seçili`}
				</Text>
				<Text style={[styles.selectionBytes, { fontSize: sp(11) }]}>
					{formatBytes(selectedBytes) || "0 MB"}
				</Text>
			</View>
			<TVPressable
				onPress={handleBulkDelete}
				disabled={selectedIds.size === 0}
				style={({ focused }) => [
					styles.dangerBtn,
					{ borderRadius: sp(18), paddingHorizontal: sp(14) },
					selectedIds.size === 0 && styles.btnDisabled,
					focused && styles.roundFocused,
				]}>
				<Ionicons name="trash-outline" size={sp(15)} color={Palette.error} />
				<Text style={[styles.dangerText, { fontSize: sp(12) }]}>
					Seçilenleri Sil
				</Text>
			</TVPressable>
		</View>
	);

	const canResumeAll = (queue || []).some(
		(i) => i.status === "paused" || i.status === "failed",
	);
	const hasActive = (queue || []).some(
		(i) => i.status === "downloading" || i.status === "queued",
	);

	const usedPct = disk
		? Math.min(100, Math.max(0, (usedBytes / disk.total) * 100))
		: 0;
	const otherBytes = disk ? Math.max(0, disk.total - disk.free - usedBytes) : 0;

	const tabs = [
		{ key: "all", label: "Tümü", count: (queue || []).length },
		{
			key: "active",
			label: "İndiriliyor",
			count: (queue || []).filter((i) => i.status !== "completed").length,
		},
		{
			key: "completed",
			label: "Tamamlananlar",
			count: (queue || []).filter((i) => i.status === "completed").length,
		},
	];

	return (
		<>
			<Stack.Screen options={{ headerShown: false }} />
			<SafeAreaView
				style={[styles.safeArea, { paddingLeft: contentPaddingLeft }]}
				edges={["top", "left", "right"]}>
				<StatusBar
					barStyle="light-content"
					backgroundColor={Palette.background}
				/>

				<ScrollView
					contentInsetAdjustmentBehavior="automatic"
					showsVerticalScrollIndicator={false}
					contentContainerStyle={[
						styles.scrollContent,
						{ paddingHorizontal: PADDING_HORIZONTAL },
						contentMaxWidth
							? {
									alignSelf: "center",
									width: "100%",
									maxWidth: contentMaxWidth,
								}
							: null,
					]}>
					{/* 1. BAŞLIK */}
					<View style={[styles.titleRow, { gap: sp(8) }]}>
						<Text
							numberOfLines={1}
							style={[styles.screenTitle, { fontSize: sp(30) }]}>
							İndirilenler
						</Text>
						{isWide ? (
							<View
								style={[
									styles.countPill,
									{
										borderRadius: sp(12),
										paddingHorizontal: sp(8),
										paddingVertical: sp(2),
									},
								]}>
								<Text
									numberOfLines={1}
									style={[styles.countPillText, { fontSize: sp(11) }]}>
									{`${(queue || []).length} öğe`}
								</Text>
							</View>
						) : null}
						<View style={styles.flex} />
						<TVPressable
							onPress={() =>
								isSelectionMode
									? exitSelection()
									: setIsSelectionMode(true)
							}
							focusedStyle={null}
							style={({ focused }) => [
								styles.editPill,
								{
									borderRadius: sp(18),
									paddingHorizontal: sp(12),
									paddingVertical: sp(7),
									gap: sp(6),
								},
								focused && styles.focusRing,
							]}>
							<Ionicons
								name={
									isSelectionMode
										? "close"
										: "checkmark-circle-outline"
								}
								size={sp(15)}
								color={Palette.onSurface}
							/>
							<Text style={[styles.editText, { fontSize: sp(12) }]}>
								{isSelectionMode ? "Bitti" : "Düzenle"}
							</Text>
						</TVPressable>
						<TVPressable
							onPress={() => router.push("/(app)/settings/download")}
							accessibilityLabel="İndirme Ayarları"
							focusedStyle={null}
							style={({ focused }) => [
								styles.iconButton,
								{ borderRadius: sp(18) },
								focused && styles.focusRing,
							]}>
							<Ionicons
								name="options-outline"
								size={sp(17)}
								color={Palette.onSurface}
							/>
						</TVPressable>
					</View>
					<Text
						numberOfLines={1}
						style={[styles.subtitle, { fontSize: sp(12), marginTop: sp(2) }]}>
						Çevrimdışı izleme kataloğu
					</Text>

					{/* 2. DEPOLAMA */}
					{disk ? (
						<View
							style={[
								styles.storageCard,
								{
									borderRadius: sp(14),
									padding: sp(12),
									gap: sp(8),
									marginTop: sp(12),
								},
							]}>
							<View style={styles.storageTop}>
								<View style={[styles.storageLabelRow, { gap: sp(8) }]}>
									<Ionicons
										name="save-outline"
										size={sp(15)}
										color={Palette.onSurfaceVariant}
									/>
									<Text
										numberOfLines={1}
										style={[
											styles.storageLabel,
											{ fontSize: sp(12) },
										]}>
										Cihaz Depolama Durumu
									</Text>
								</View>
								<Text
									numberOfLines={1}
									style={[styles.storageValue, { fontSize: sp(12) }]}>
									{`${formatBytes(usedBytes) || "0 MB"} / ${formatBytes(disk.total)}`}
								</Text>
							</View>
							<View
								style={[
									styles.storageTrack,
									{ height: Math.max(4, sp(4)), borderRadius: sp(2) },
								]}>
								<View
									style={[
										styles.storageFill,
										{
											width: `${usedPct}%`,
											borderRadius: sp(2),
										},
									]}
								/>
							</View>
							<View style={[styles.legendRow, { gap: sp(14) }]}>
								<View style={[styles.legendItem, { gap: sp(6) }]}>
									<View
										style={[styles.dot, { backgroundColor: Palette.primary }]}
									/>
									<Text
										numberOfLines={1}
										style={[styles.legendText, { fontSize: sp(10) }]}>
										{`StreamPulse (${formatBytes(usedBytes) || "0 MB"})`}
									</Text>
								</View>
								<View style={[styles.legendItem, { gap: sp(6) }]}>
									<View
										style={[
											styles.dot,
											{ backgroundColor: Palette.surfaceHighest },
										]}
									/>
									<Text
										numberOfLines={1}
										style={[styles.legendText, { fontSize: sp(10) }]}>
										{`Diğer (${formatBytes(otherBytes)})`}
									</Text>
								</View>
								<View style={[styles.legendItem, { gap: sp(6) }]}>
									<View
										style={[styles.dot, { backgroundColor: Palette.surface }]}
									/>
									<Text
										numberOfLines={1}
										style={[styles.legendText, { fontSize: sp(10) }]}>
										{`Boş (${formatBytes(disk.free)})`}
									</Text>
								</View>
							</View>
						</View>
					) : null}

					{/* 3. FİLTRELER */}
					<ScrollView
						horizontal
						showsHorizontalScrollIndicator={false}
						contentContainerStyle={[
							styles.tabRow,
							{ gap: sp(8), paddingVertical: sp(12) },
						]}>
						{tabs.map((tab) => {
							const active = filter === tab.key;
							return (
								<TVPressable
									key={tab.key}
									onPress={() => setFilter(tab.key)}
									focusedStyle={null}
									style={({ focused }) => [
										styles.tabPill,
										{
											borderRadius: sp(18),
											paddingHorizontal: sp(14),
											paddingVertical: sp(8),
											gap: sp(8),
										},
										active
											? styles.tabPillActive
											: styles.tabPillIdle,
										focused && styles.focusRing,
									]}>
									<Text
										numberOfLines={1}
										style={[
											styles.tabText,
											{ fontSize: sp(12) },
											{
												color: active
													? Palette.onPrimary
													: Palette.onSurfaceVariant,
											},
										]}>
										{tab.label}
									</Text>
									{tab.count > 0 ? (
										<View
											style={[
												styles.tabCountPill,
												{
													borderRadius: sp(8),
													paddingHorizontal: sp(6),
													paddingVertical: sp(1),
												},
												active
													? styles.tabCountPillActive
													: null,
											]}>
											<Text
												style={[
													styles.tabCountText,
													{ fontSize: sp(10) },
													{
														color: active
															? Palette.onPrimary
															: Palette.onSurfaceVariant,
													},
												]}>
												{tab.count}
											</Text>
										</View>
									) : null}
								</TVPressable>
							);
						})}
					</ScrollView>

					{/* 4. BÖLÜM BAŞLIĞI */}
					<View style={[styles.sectionRow, { gap: sp(8) }]}>
						<Text
							numberOfLines={1}
							style={[styles.sectionTitle, { fontSize: sp(11) }]}>
							{`${
								tabs.find((t) => t.key === filter)?.label || "Tümü"
							} (${
								isSelectionMode
									? `${selectedIds.size} Seçili`
									: visibleItems.length
							})`}
						</Text>
						<View style={styles.flex} />
						{isSelectionMode && visibleItems.length > 0 ? (
							<TVPressable
								onPress={toggleSelectAll}
								focusedStyle={null}
								style={({ focused }) => [
									{
										paddingHorizontal: sp(8),
										paddingVertical: sp(2),
										borderRadius: sp(8),
									},
									focused && styles.focusRing,
								]}>
								<Text
									style={[styles.selectAllText, { fontSize: sp(12) }]}>
									{allVisibleSelected ? "Seçimi Kaldır" : "Tümünü Seç"}
								</Text>
							</TVPressable>
						) : canResumeAll || hasActive ? (
							<TVPressable
								onPress={() => (canResumeAll ? resumeAll() : pauseAll())}
								focusedStyle={null}
								style={({ focused }) => [
									{
										paddingHorizontal: sp(8),
										paddingVertical: sp(2),
										borderRadius: sp(8),
									},
									focused && styles.focusRing,
								]}>
								<Text
									style={[styles.selectAllText, { fontSize: sp(12) }]}>
									{canResumeAll ? "Tümünü Devam Ettir" : "Tümünü Duraklat"}
								</Text>
							</TVPressable>
						) : null}
					</View>

					{/* 5. LİSTE */}
					{visibleGroups.length === 0 ? (
						<View style={[styles.emptyCard, { borderRadius: sp(14) }]}>
							<View style={[styles.emptyIcon, { borderRadius: sp(26) }]}>
								<Ionicons
									name="cloud-download-outline"
									size={sp(34)}
									color={Palette.primary}
								/>
							</View>
							<Text style={[styles.emptyTitle, { fontSize: sp(15) }]}>
								{(queue || []).length === 0
									? "İndirme Yok"
									: "Bu Filtrede İndirme Yok"}
							</Text>
							<Text
								style={[
									styles.emptyText,
									{ fontSize: sp(12), maxWidth: sp(320) },
								]}>
								{(queue || []).length === 0
									? 'İnternet bağlantınız olmadığında kesintisiz izlemek için içerikleri indirin. Detay ekranındaki "İndir" butonundan başlayabilirsiniz.'
									: "Başka bir sekmeyi deneyin."}
							</Text>
						</View>
					) : (
						<View style={{ gap: sp(10) }}>
							{visibleGroups.map((group) =>
								group.isSeries
									? renderSeriesGroup(group)
									: renderMovieCard(group.items[0]),
							)}
						</View>
					)}
				</ScrollView>

				{isSelectionMode ? renderSelectionBar() : null}

				<BottomNavigation activeRoute="/(app)/downloads" />
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
	scrollContent: {
		paddingTop: 8,
		paddingBottom: 24,
	},

	/* 1. Başlık */
	titleRow: {
		flexDirection: "row",
		alignItems: "center",
	},
	screenTitle: {
		color: Palette.onSurface,
		fontFamily: FontFamily.bold,
		letterSpacing: -0.4,
		flexShrink: 1,
	},
	countPill: {
		backgroundColor: Palette.surfaceHigh,
	},
	countPillText: {
		color: Palette.onSurfaceVariant,
		fontFamily: FontFamily.semiBold,
	},
	subtitle: {
		color: Palette.onSurfaceVariant,
		fontFamily: FontFamily.medium,
	},
	editPill: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: Palette.surfaceLow,
		borderWidth: 2,
		borderColor: "transparent",
	},
	editText: {
		color: Palette.onSurface,
		fontFamily: FontFamily.semiBold,
	},
	iconButton: {
		width: 36,
		height: 36,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: Palette.surfaceLow,
		borderWidth: 2,
		borderColor: "transparent",
	},

	/* 2. Depolama */
	storageCard: {
		backgroundColor: Palette.surfaceLow,
	},
	storageTop: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
	storageLabelRow: {
		flexDirection: "row",
		alignItems: "center",
		flexShrink: 1,
	},
	storageLabel: {
		color: Palette.onSurface,
		fontFamily: FontFamily.semiBold,
		flexShrink: 1,
	},
	storageValue: {
		color: Palette.onSurfaceVariant,
		fontFamily: FontFamily.medium,
	},
	storageTrack: {
		backgroundColor: Palette.surfaceHighest,
		overflow: "hidden",
		flexDirection: "row",
	},
	storageFill: {
		height: "100%",
		backgroundColor: Palette.primary,
	},
	legendRow: {
		flexDirection: "row",
		alignItems: "center",
		flexWrap: "wrap",
	},
	legendItem: {
		flexDirection: "row",
		alignItems: "center",
		flexShrink: 1,
	},
	dot: {
		width: 7,
		height: 7,
		borderRadius: 4,
	},
	legendText: {
		color: Palette.onSurfaceVariant,
		fontFamily: FontFamily.medium,
		flexShrink: 1,
	},

	/* 3. Filtreler */
	tabRow: {
		flexDirection: "row",
		alignItems: "center",
	},
	tabPill: {
		flexDirection: "row",
		alignItems: "center",
		borderWidth: 2,
		borderColor: "transparent",
	},
	tabPillActive: {
		backgroundColor: Palette.primary,
	},
	tabPillIdle: {
		backgroundColor: Palette.surfaceLow,
	},
	tabText: {
		fontFamily: FontFamily.semiBold,
	},
	tabCountPill: {
		backgroundColor: "rgba(14, 14, 16, 0.28)",
	},
	tabCountPillActive: {
		backgroundColor: "rgba(14, 14, 16, 0.18)",
	},
	tabCountText: {
		fontFamily: FontFamily.bold,
	},

	/* 4. Bölüm başlığı */
	sectionRow: {
		flexDirection: "row",
		alignItems: "center",
		marginTop: 2,
		marginBottom: 8,
	},
	sectionTitle: {
		flexShrink: 1,
		color: Palette.onSurfaceVariant,
		fontFamily: FontFamily.bold,
		letterSpacing: 1.1,
		textTransform: "uppercase",
	},
	selectAllText: {
		color: Palette.primary,
		fontFamily: FontFamily.semiBold,
	},

	/* Kartlar */
	groupCard: {
		backgroundColor: Palette.surfaceLow,
		overflow: "hidden",
	},
	groupHeader: {
		flexDirection: "row",
		alignItems: "center",
		borderWidth: 2,
		borderColor: "transparent",
	},
	groupTitle: {
		color: Palette.onSurface,
		fontFamily: FontFamily.semiBold,
		flexShrink: 1,
	},
	movieCard: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: Palette.surfaceLow,
		borderWidth: 2,
		borderColor: "transparent",
	},
	movieCardFailed: {
		backgroundColor: "rgba(255, 180, 171, 0.06)",
	},
	movieTitle: {
		color: Palette.onSurface,
		fontFamily: FontFamily.semiBold,
		flexShrink: 1,
	},

	/* Poster */
	posterWrap: {
		aspectRatio: 2 / 3,
		backgroundColor: Palette.surfaceLowest,
		overflow: "hidden",
	},
	fillImg: {
		width: "100%",
		height: "100%",
	},
	posterFallback: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
	},
	posterBadge: {
		position: "absolute",
		top: 3,
		left: 3,
		backgroundColor: "rgba(14, 14, 16, 0.82)",
	},
	posterBadgeText: {
		color: Palette.onSurface,
		fontFamily: FontFamily.bold,
		letterSpacing: 0.3,
	},

	/* Bölüm satırı */
	epRow: {
		flexDirection: "row",
		alignItems: "center",
		borderWidth: 2,
		borderColor: "transparent",
	},
	epBar: {
		width: 3,
		alignSelf: "stretch",
		borderRadius: 2,
		minHeight: 24,
	},
	epTitleRow: {
		flexDirection: "row",
		alignItems: "center",
	},
	epTitle: {
		color: Palette.onSurface,
		fontFamily: FontFamily.semiBold,
		flexShrink: 1,
	},
	qualityBadge: {
		backgroundColor: Palette.surfaceHigh,
	},
	qualityText: {
		color: Palette.onSurfaceVariant,
		fontFamily: FontFamily.bold,
	},
	pluginChip: {
		backgroundColor: "rgba(192, 193, 255, 0.14)",
	},
	pluginText: {
		color: Palette.primary,
		fontFamily: FontFamily.bold,
		letterSpacing: 0.4,
	},
	meta: {
		color: Palette.onSurfaceVariant,
		fontFamily: FontFamily.medium,
	},
	metaAccent: {
		color: Palette.secondary,
	},
	metaError: {
		color: Palette.error,
	},
	errorText: {
		color: Palette.error,
		fontFamily: FontFamily.medium,
	},

	/* İlerleme */
	progressTrack: {
		backgroundColor: "rgba(229, 225, 228, 0.16)",
		overflow: "hidden",
		flexDirection: "row",
	},
	progressFill: {
		height: "100%",
		backgroundColor: Palette.primary,
	},

	/* Eylemler */
	actions: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
	},
	roundBtn: {
		width: 32,
		height: 32,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: Palette.surfaceHigh,
		borderWidth: 2,
		borderColor: "transparent",
	},
	roundFocused: {
		borderColor: Palette.primary,
	},
	playBtn: {
		width: 40,
		height: 40,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: Palette.primary,
		borderWidth: 2,
		borderColor: "transparent",
	},
	playFocused: {
		borderColor: Palette.onSurface,
	},
	playFocus: {
		borderColor: Palette.onSurface,
		borderWidth: 2,
	},

	/* Seçim */
	check: {
		width: 22,
		height: 22,
		alignItems: "center",
		justifyContent: "center",
		borderWidth: 2,
		borderColor: Palette.outline,
	},
	checkOn: {
		backgroundColor: Palette.primary,
		borderColor: Palette.primary,
	},
	selectionBar: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		backgroundColor: Palette.surfaceLow,
	},
	selectionInfo: {
		flexDirection: "row",
		alignItems: "center",
	},
	selectionCount: {
		color: Palette.onSurface,
		fontFamily: FontFamily.bold,
	},
	selectionBytes: {
		color: Palette.onSurfaceVariant,
		fontFamily: FontFamily.medium,
	},
	dangerBtn: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		paddingVertical: 8,
		backgroundColor: "rgba(255, 180, 171, 0.16)",
		borderWidth: 2,
		borderColor: "transparent",
	},
	dangerText: {
		color: Palette.error,
		fontFamily: FontFamily.bold,
	},
	btnDisabled: {
		opacity: 0.4,
	},

	/* Boş durum */
	emptyCard: {
		alignItems: "center",
		backgroundColor: Palette.surfaceLow,
		padding: 24,
		gap: 10,
	},
	emptyIcon: {
		width: 52,
		height: 52,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "rgba(192, 193, 255, 0.12)",
	},
	emptyTitle: {
		color: Palette.onSurface,
		fontFamily: FontFamily.bold,
	},
	emptyText: {
		color: Palette.onSurfaceVariant,
		fontFamily: FontFamily.medium,
		textAlign: "center",
	},

	/* Odak */
	focusRing: {
		borderColor: Palette.primary,
		borderWidth: 2,
	},
	rowFocused: {
		borderColor: Palette.primary,
	},
});
