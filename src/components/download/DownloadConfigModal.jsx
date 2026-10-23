/*
 * DownloadConfigModal — İndirme öncesi kaynak/altyazı seçim modalı
 * (download_feature_plan.md §5).
 *
 * Akış:
 *  1. Açılırken `extractVideoSources(url)` ile kaynak listesi çekilir
 *     (ağ hatasında hata kartı + "Tekrar Dene").
 *  2. Video kaynağı seçilir; HLS kaynakları "indirilemez" olarak pasif
 *     görünür (Faz 1 kısıtı: yalnızca doğrudan URL'ler indirilir).
 *  3. Altyazı listesi seçilen kaynaktan gelir + "Altyazı İndirme" kapatma.
 *  4. "Bu eklenti için ayarları hatırla" işaretliyse seçim
 *     PLUGIN_DOWNLOAD_PREFS'e yazılır; sonraki indirmede "Her seferinde
 *     sor" kapalıysa modal atlanır (kararı `shouldAskBeforeDownload`
 *     verir, bkz. downloadManager.js).
 *  5. "İndirmeyi Başlat" → kuyruğa ekler ve modalı kapatır.
 *
 * TV uyumluluğu: RN `Modal` + `TVPressable` (DPAD odağı), geri tuşu
 * `onRequestClose` ile kapatır — ActionMenuModal kalıbı.
 */

import TVPressable from "@/components/common/TVPressable";
import { useDownload } from "@/context/DownloadContext";
import { useThemeContext } from "@/context/ThemeContext";
import { extractVideoSources } from "@/services/api";
import {
	getPluginDownloadPref,
	savePluginDownloadPref,
} from "@/utils/storage";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import React, { useCallback, useEffect, useState } from "react";
import {
	ActivityIndicator,
	BackHandler,
	Modal,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";

const ACCENT = "#38bdf8";

/** Kaynağın kullanıcının göreceği etiketi: extractor + kalite ipucu. */
function sourceLabel(source) {
	const extractor = source?.extractor || "Bilinmeyen kaynak";
	const quality = source?.result?.name || "";
	return quality ? `${extractor} (${quality})` : extractor;
}

export default function DownloadConfigModal({
	visible,
	onClose,
	// Detay ekranındaki içerik: { id, url, title, plugin, poster_url, ... }
	content,
	// Dizi ise indirilecek bölüm: { season, episode, episodeTitle, url }
	episode = null,
}) {
	const { colors, theme } = useThemeContext();
	const { enqueueDownload } = useDownload();

	const [loading, setLoading] = useState(false);
	const [loadError, setLoadError] = useState(null);
	const [sources, setSources] = useState([]);
	const [selectedSourceIdx, setSelectedSourceIdx] = useState(0);
	const [selectedSubtitleIdx, setSelectedSubtitleIdx] = useState(-1); // -1 = altyazısız
	const [downloadSubtitle, setDownloadSubtitle] = useState(true);
	const [remember, setRemember] = useState(false);
	const [alwaysAsk, setAlwaysAsk] = useState(false);
	const [starting, setStarting] = useState(false);

	const pluginName = content?.plugin || "";
	const targetUrl = (episode?.url || content?.url) || "";

	/** Kaynakları çeker; modal her açılışta taze listeyi ister. */
	const loadSources = useCallback(async () => {
		if (!targetUrl) {
			setLoadError("İçerik için kaynak adresi bulunamadı.");
			return;
		}
		setLoading(true);
		setLoadError(null);
		setSources([]);
		setSelectedSourceIdx(0);
		setSelectedSubtitleIdx(-1);
		try {
			const extracted = await extractVideoSources(targetUrl);
			setSources(Array.isArray(extracted) ? extracted : []);
			if (!extracted || extracted.length === 0) {
				setLoadError("Bu içerik için indirilebilir kaynak bulunamadı.");
			}
		} catch (e) {
			setLoadError("Kaynaklar yüklenemedi. Lütfen tekrar deneyin.");
			console.warn("DownloadConfigModal kaynak yüklenemedi:", e?.message);
		} finally {
			setLoading(false);
		}
	}, [targetUrl]);

	// Eklenti tercihini açılışta oku: kayıtlı "her seferinde sor" tercihini
	// checkbox'lara yansıt.
	useEffect(() => {
		if (!visible) return;
		let cancelled = false;
		(async () => {
			const pref = pluginName ? await getPluginDownloadPref(pluginName) : null;
			if (cancelled) return;
			if (pref) {
				setRemember(true);
				setAlwaysAsk(pref.alwaysAsk === true);
				setDownloadSubtitle(pref.downloadSubtitle !== false);
			} else {
				setRemember(false);
				setAlwaysAsk(false);
				setDownloadSubtitle(true);
			}
			loadSources();
		})();
		return () => {
			cancelled = true;
		};
	}, [visible, pluginName, loadSources]);

	// Geri tuşu: modal açıkken sayfayı değil modalı kapatsın.
	useEffect(() => {
		if (!visible) return;
		const sub = BackHandler.addEventListener("hardwareBackPress", () => {
			onClose?.();
			return true;
		});
		return () => sub.remove();
	}, [visible, onClose]);

	const selectedSource = sources[selectedSourceIdx] || null;
	const subtitleList = selectedSource?.result?.subtitles || [];
	/**
	 * Ses parçası bilgisi extract sonuçlarında genellikle taşınmaz
	 * (oynatıcıda sunucu tarafı yerine `react-native-video` ses parçaları
	 * kullanılır). Kaynak taşıyorsa listelenir, taşımıyorsa bölüm gizlenir
	 * ve "orijinal" varsayılır — kullanıcıya sahte seçenek gösterilmez.
	 */
	const audioTracks = selectedSource?.result?.audioTracks || null;

	const startDownload = async () => {
		if (!selectedSource?.result?.url || starting) return;
		setStarting(true);
		try {
			if (remember && pluginName) {
				await savePluginDownloadPref(pluginName, {
					preferredSource: selectedSource.extractor,
					preferredSubtitle:
						selectedSubtitleIdx >= 0
							? subtitleList[selectedSubtitleIdx]?.name || null
							: null,
					downloadSubtitle,
					alwaysAsk,
				});
			}
			const isSeries = Boolean(episode && episode.season && episode.episode);
			await enqueueDownload({
				contentId: content?.id || content?.url,
				contentTitle: content?.title || "İçerik",
				pluginName,
				type: isSeries ? "series" : "movie",
				seriesTitle: isSeries ? content?.title : null,
				seasonNumber: isSeries ? Number(episode.season) : null,
				episodeNumber: isSeries ? Number(episode.episode) : null,
				episodeTitle: isSeries ? episode.episodeTitle || null : null,
				sourceUrl: selectedSource.result.url,
				sourceName: selectedSource.extractor,
				sourceHeaders: selectedSource.result.headers || {},
				audioTrack: audioTracks ? selectedSource.result.audioTrack || null : null,
				subtitleUrl:
					selectedSubtitleIdx >= 0 && downloadSubtitle
						? subtitleList[selectedSubtitleIdx]?.url || null
						: null,
				subtitleLang:
					selectedSubtitleIdx >= 0
						? subtitleList[selectedSubtitleIdx]?.name || null
						: null,
				downloadSubtitle,
				posterUrl: content?.poster_url || content?.backdrop_url || null,
			});
			onClose?.();
		} finally {
			setStarting(false);
		}
	};

	const surfaceBg = theme === "dark" ? "#161B24" : "#ffffff";
	const surfaceBorder = theme === "dark" ? "#232A36" : "#E2E8F0";
	const textColor = colors.text || "#ffffff";
	const mutedColor = colors.textSecondary || "#9ca3af";

	/** Radyo satırı: seçim + etiket. Pasif satırlar seçilemez. */
	const renderOptionRow = ({ key, label, note, selected, disabled, onPress }) => (
		<TVPressable
			key={key}
			disabled={disabled}
			onPress={onPress}
			style={({ focused }) => [
				styles.optionRow,
				{
					backgroundColor: selected ? "rgba(56, 189, 248, 0.12)" : "transparent",
					borderColor: selected ? ACCENT : surfaceBorder,
					opacity: disabled ? 0.45 : 1,
				},
				focused && !disabled && { borderColor: ACCENT, borderWidth: 2 },
			]}>
			<Ionicons
				name={selected ? "radio-button-on" : "radio-button-off"}
				size={18}
				color={selected ? ACCENT : mutedColor}
			/>
			<View style={{ flex: 1 }}>
				<Text style={[styles.optionLabel, { color: textColor }]} numberOfLines={1}>
					{label}
				</Text>
				{note ? (
					<Text style={[styles.optionNote, { color: mutedColor }]}>{note}</Text>
				) : null}
			</View>
		</TVPressable>
	);

	const renderSectionTitle = (icon, text) => (
		<View style={styles.sectionTitleRow}>
			<Ionicons name={icon} size={16} color={ACCENT} />
			<Text style={[styles.sectionTitle, { color: mutedColor }]}>{text}</Text>
		</View>
	);

	const hasDirectSource = sources.some(
		(s) => s?.result?.url && s?.result?.is_hls !== true,
	);

	return (
		<Modal
			visible={visible}
			transparent
			animationType="slide"
			onRequestClose={() => onClose?.()}>
			<View style={[styles.backdrop, { backgroundColor: "rgba(0,0,0,0.6)" }]}>
				<View style={[styles.sheet, { backgroundColor: surfaceBg }]}>
					{/* Başlık */}
					<View style={styles.header}>
						<TVPressable onPress={() => onClose?.()} style={styles.closeBtn}>
							<Ionicons name="close" size={22} color={textColor} />
						</TVPressable>
						<Text style={[styles.headerTitle, { color: textColor }]}>
							İndirme Ayarları
						</Text>
						<View style={{ width: 40 }} />
					</View>

					<ScrollView
						style={{ flex: 1 }}
						contentContainerStyle={styles.body}
						showsVerticalScrollIndicator={false}>
						{/* İçerik özeti */}
						<Text style={[styles.contentTitle, { color: textColor }]} numberOfLines={2}>
							{episode
								? `${content?.title} — S${String(episode.season).padStart(2, "0")}xE${String(episode.episode).padStart(2, "0")}${episode.episodeTitle ? ` · ${episode.episodeTitle}` : ""}`
								: content?.title}
						</Text>

						{loading ? (
							<View style={styles.centerBox}>
								<ActivityIndicator color={ACCENT} />
								<Text style={[styles.hint, { color: mutedColor }]}>
									Kaynaklar yükleniyor…
								</Text>
							</View>
						) : loadError ? (
							<View style={styles.centerBox}>
								<Ionicons name="alert-circle-outline" size={34} color="#f43f5e" />
								<Text style={[styles.hint, { color: mutedColor }]}>{loadError}</Text>
								<TVPressable style={styles.retryBtn} onPress={loadSources}>
									<Text style={styles.retryText}>Tekrar Dene</Text>
								</TVPressable>
							</View>
						) : (
							<>
								{/* 1. Video kaynağı */}
								{renderSectionTitle("videocam-outline", "Video Kaynağı")}
								{sources.map((s, idx) => {
									const isHls = s?.result?.is_hls === true;
									return renderOptionRow({
										key: `src-${idx}`,
										label: sourceLabel(s),
										note: isHls ? "HLS akışı — doğrudan indirme desteklenmiyor" : null,
										selected: idx === selectedSourceIdx,
										disabled: isHls || !s?.result?.url,
										onPress: () => {
											setSelectedSourceIdx(idx);
											setSelectedSubtitleIdx(-1);
										},
									});
								})}

								{/* 2. Ses parçası (yalnızca kaynak taşıyorsa) */}
								{audioTracks?.length ? (
									<>
										{renderSectionTitle("volume-medium-outline", "Ses Parçası")}
										{audioTracks.map((t, idx) =>
											renderOptionRow({
												key: `aud-${idx}`,
												label: t.title || t.language || `Parça ${idx + 1}`,
												selected: false,
												onPress: () => {},
											}),
										)}
									</>
								) : null}

								{/* 3. Altyazı */}
								{renderSectionTitle("document-text-outline", "Altyazı")}
								{renderOptionRow({
									key: "sub-none",
									label: "Altyazı İndirme",
									note: "Video altyazısız kaydedilir",
									selected: selectedSubtitleIdx === -1,
									onPress: () => setSelectedSubtitleIdx(-1),
								})}
								{subtitleList.map((sub, idx) =>
									renderOptionRow({
										key: `sub-${idx}`,
										label: sub.name || `Altyazı ${idx + 1}`,
										selected: selectedSubtitleIdx === idx,
										onPress: () => setSelectedSubtitleIdx(idx),
									}),
								)}

								{/* Tercih checkbox'ları */}
								{renderOptionRow({
									key: "remember",
									label: "Bu eklenti için ayarları hatırla",
									selected: remember,
									onPress: () => {
										setRemember(!remember);
										if (remember) setAlwaysAsk(false);
									},
								})}
								{remember &&
									renderOptionRow({
										key: "always-ask",
										label: "Her seferinde sor",
										note: "Kapalıysa sonraki indirmeler modal olmadan başlar",
										selected: alwaysAsk,
										onPress: () => setAlwaysAsk(!alwaysAsk),
									})}
							</>
						)}
					</ScrollView>

					{/* Başlat butonu */}
					<View style={styles.footer}>
						<TVPressable
							disabled={!hasDirectSource || loading || starting}
							onPress={startDownload}
							style={({ focused }) => [
								styles.startBtn,
								{
									backgroundColor:
										!hasDirectSource || loading || starting ? "#1e293b" : "#E50914",
									borderColor: focused ? "#ffffff" : "transparent",
								},
							]}>
							{starting ? (
								<ActivityIndicator size="small" color="#ffffff" />
							) : (
								<>
									<Ionicons name="download" size={18} color="#ffffff" />
									<Text style={styles.startText}>İndirmeyi Başlat</Text>
								</>
							)}
						</TVPressable>
					</View>
				</View>
			</View>
		</Modal>
	);
}

const styles = StyleSheet.create({
	backdrop: { flex: 1, justifyContent: "flex-end" },
	sheet: {
		maxHeight: "88%",
		borderTopLeftRadius: 20,
		borderTopRightRadius: 20,
		borderWidth: 1,
		borderColor: "rgba(255,255,255,0.08)",
	},
	header: {
		height: 52,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: 12,
		borderBottomWidth: 1,
		borderBottomColor: "rgba(255,255,255,0.06)",
	},
	closeBtn: {
		width: 40,
		height: 40,
		borderRadius: 20,
		alignItems: "center",
		justifyContent: "center",
	},
	headerTitle: { fontSize: 16, fontWeight: "700" },
	body: { padding: 16, gap: 6 },
	contentTitle: { fontSize: 15, fontWeight: "600", marginBottom: 12 },
	sectionTitleRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		marginTop: 10,
		marginBottom: 4,
	},
	sectionTitle: { fontSize: 12, fontWeight: "700", letterSpacing: 0.5 },
	optionRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		paddingVertical: 10,
		paddingHorizontal: 12,
		borderWidth: 1,
		borderRadius: 10,
		marginBottom: 6,
	},
	optionLabel: { fontSize: 14, fontWeight: "600" },
	optionNote: { fontSize: 11.5, marginTop: 1 },
	centerBox: { alignItems: "center", paddingVertical: 28, gap: 10 },
	hint: { fontSize: 13, textAlign: "center" },
	retryBtn: {
		backgroundColor: "#E50914",
		paddingHorizontal: 18,
		paddingVertical: 9,
		borderRadius: 10,
	},
	retryText: { color: "#ffffff", fontWeight: "700", fontSize: 13 },
	footer: { padding: 14 },
	startBtn: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		paddingVertical: 13,
		borderRadius: 12,
		borderWidth: 1,
	},
	startText: { color: "#ffffff", fontWeight: "700", fontSize: 15 },
});
