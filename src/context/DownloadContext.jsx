/*
 * DownloadContext — Uygulama genelinde indirme durumunu paylaşır
 * (download_feature_plan.md §9) ve indirme AKIŞINI tek noktadan yönetir.
 *
 * ⚠️ NEDEN MODAL BURADA? Detay sayfasındaki "İndir" butonu, bölüm
 * satırlarındaki indirme ikonları, sezon indirme butonu ve uzun basış
 * menüsündeki "İndir" aynı akışı tetikler. Modal'ı her bileşene ayrı
 * koymak (eski durum: yalnızca ActionButtons içinde) diğer çağrı
 * noktalarının modal açamamasına yol açıyordu. Bu yüzden:
 *   requestDownload({content, episode}) → gerekirse modalı provider açar.
 */

import React, {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { DownloadManager } from "@/services/downloadManager";
import DownloadConfigModal from "@/components/download/DownloadConfigModal";
import {
	getDownloadSettings,
	saveDownloadSettings as persistDownloadSettings,
	resetDownloadSettings as persistResetDownloadSettings,
} from "@/utils/storage";

const DownloadContext = createContext(null);

/** İndirme kimliği: film → içerik, dizi → seriesId + S/E (kaynak URL değil). */
export function buildDownloadKey({ contentId, seriesId, season, episode }) {
	if (season && episode) {
		return `${seriesId || contentId || "series"}|s${Number(season)}|e${Number(episode)}`;
	}
	return String(contentId || "");
}

export function DownloadProvider({ children }) {
	const [queue, setQueue] = useState([]);
	const [settings, setSettings] = useState(null);
	const [modal, setModal] = useState(null); // { content, episode } | null
	const readyRef = useRef(false);

	// Kuyruk state'ini manager'ın düz dizisinden tazeleyen yardımcı
	const syncQueue = () => setQueue(DownloadManager.getQueue());

	useEffect(() => {
		let disposed = false;

		(async () => {
			await DownloadManager.initialize();
			if (disposed) return;
			readyRef.current = true;
			setSettings(await getDownloadSettings());
			syncQueue();
		})();

		const unsubProgress = DownloadManager.onProgress(() => syncQueue());
		const unsubStatus = DownloadManager.onStatusChange(() => syncQueue());

		return () => {
			disposed = true;
			unsubProgress();
			unsubStatus();
		};
	}, []);

	const enqueueDownload = useMemo(
		() => async (spec) => {
			const id = await DownloadManager.enqueue(spec);
			syncQueue();
			return id;
		},
		[],
	);

	/**
	 * Tüm indirme tetikleyicilerinin ortak girişi.
	 *
	 * Plan §5 akışı: eklenti tercihi kayıtlıysa VE "her seferinde sor"
	 * kapalıysa modal açılmaz, kayıtlı ayarlar + tercih edilen kaynakla
	 * doğrudan kuyruğa eklenir. Aksi halde modal açılır.
	 *
	 * @param {{content: object, episode?: object|null}} params
	 * @returns {Promise<{enqueued: boolean, id?: string}>}
	 */
	const requestDownload = useCallback(
		async ({ content, episode = null }) => {
			const pluginName = content?.plugin || "";
			const targetUrl = episode?.url || content?.url;
			if (!targetUrl) {
				const { Alert } = await import("react-native");
				Alert.alert("Bilgi", "İndirme için video bağlantısı bulunamadı.");
				return { enqueued: false };
			}

			try {
				const ask = await DownloadManager.shouldAskBeforeDownload(pluginName);
				if (!ask) {
					const { getPluginDownloadPref } = await import("@/utils/storage");
					const pref = await getPluginDownloadPref(pluginName);
					const id = await quickEnqueueWithPref({
						content,
						episode,
						pluginName,
						pref,
					});
					if (id) {
						const { Alert } = await import("react-native");
						Alert.alert(
							"İndirme",
							`"${content?.title}" kuyruğa eklendi.`,
						);
						syncQueue();
						return { enqueued: true, id };
					}
					// Kaynak bulunamadı → modal'a düş
				}
			} catch (e) {
				console.warn("Hızlı indirme yolu hatası:", e?.message);
			}

			setModal({ content, episode });
			return { enqueued: false };
		},
		[],
	);

	const pauseDownload = useMemo(
		() => async (downloadId) => {
			await DownloadManager.pause(downloadId);
			syncQueue();
		},
		[],
	);

	const resumeDownload = useMemo(
		() => async (downloadId) => {
			await DownloadManager.resume(downloadId);
			syncQueue();
		},
		[],
	);

	const cancelDownload = useMemo(
		() => async (downloadId) => {
			await DownloadManager.cancel(downloadId);
			syncQueue();
		},
		[],
	);

	const pauseAllDownloads = useMemo(
		() => async () => {
			await DownloadManager.pauseAll();
			syncQueue();
		},
		[],
	);

	const resumeAllDownloads = useMemo(
		() => async () => {
			await DownloadManager.resumeAll();
			syncQueue();
		},
		[],
	);

	const removeDownload = useMemo(
		() => async (downloadId) => {
			await DownloadManager.remove(downloadId);
			syncQueue();
		},
		[],
	);

	const updateSettings = useMemo(
		() => async (updates) => {
			const next = await persistDownloadSettings(updates);
			setSettings(next);
			return next;
		},
		[],
	);

	const resetSettings = useMemo(
		() => async () => {
			const next = await persistResetDownloadSettings();
			setSettings(next);
			return next;
		},
		[],
	);

	/**
	 * İndirilmiş içerik kümesi: "contentId" ve "seriesId|sN|eM" anahtarları.
	 * Detay ekranındaki indirme ikonları (#9) ve bölüm satırları bunu izler.
	 */
	const downloadedKeys = useMemo(() => {
		const keys = new Set();
		(queue || []).forEach((item) => {
			if (item.status !== "completed") return;
			keys.add(
				buildDownloadKey({
					contentId: item.contentId,
					seriesId: item.seriesId,
					season: item.seasonNumber,
					episode: item.episodeNumber,
				}),
			);
		});
		return keys;
	}, [queue]);

	const isDownloaded = useCallback(
		({ contentId, seriesId, season, episode }) =>
			downloadedKeys.has(
				buildDownloadKey({ contentId, seriesId, season, episode }),
			),
		[downloadedKeys],
	);

	const activeDownloads = useMemo(
		() => queue.filter((i) => i.status === "downloading"),
		[queue],
	);

	const value = useMemo(
		() => ({
			queue,
			activeDownloads,
			settings,
			enqueueDownload,
			requestDownload,
			pauseDownload,
			resumeDownload,
			cancelDownload,
			pauseAll: pauseAllDownloads,
			resumeAll: resumeAllDownloads,
			removeDownload,
			updateSettings,
			resetSettings,
			isDownloaded,
			downloadedKeys,
			exportDownload: DownloadManager.exportDownload,
			openDownloadModal: (payload) => setModal(payload),
			shouldAskBeforeDownload: DownloadManager.shouldAskBeforeDownload,
		}),
		[
			queue,
			activeDownloads,
			settings,
			enqueueDownload,
			requestDownload,
			pauseDownload,
			resumeDownload,
			cancelDownload,
			pauseAllDownloads,
			resumeAllDownloads,
			removeDownload,
			updateSettings,
			resetSettings,
			isDownloaded,
			downloadedKeys,
		],
	);

	return (
		<DownloadContext.Provider value={value}>
			{children}
			{/* Tek modal örneği: tüm tetikleyiciler bunu kullanır */}
			<DownloadConfigModal
				visible={Boolean(modal)}
				onClose={() => setModal(null)}
				content={modal?.content || null}
				episode={modal?.episode || null}
				enqueueDownload={enqueueDownload}
			/>
		</DownloadContext.Provider>
	);
}

/**
 * Kayıtlı eklenti tercihiyle modalı atlayan hızlı yol.
 * Not: `extractVideoSources` çağrısı burada yapılır (modal açılmaz).
 * @returns {Promise<string|null>} enqueue edilen indirme id'si ya da null
 */
async function quickEnqueueWithPref({ content, episode, pluginName, pref }) {
	const { extractVideoSources } = await import("@/services/api");
	const targetUrl = episode?.url || content?.url;
	const sources = await extractVideoSources(targetUrl);
	const usable = (Array.isArray(sources) ? sources : []).filter((s) =>
		Boolean(s?.result?.url),
	);
	const chosen =
		(pref?.preferredSource &&
			usable.find((s) => s.extractor === pref.preferredSource)) ||
		usable[0];
	if (!chosen) return null;

	const isSeries = Boolean(episode);
	const subList = chosen?.result?.subtitles || [];
	const wantSub = pref?.downloadSubtitle !== false && pref?.preferredSubtitle;
	const chosenSub = wantSub
		? subList.find((s) =>
				String(s?.name || "")
					.toLowerCase()
					.includes(String(pref.preferredSubtitle).toLowerCase()),
			)
		: null;

	return DownloadManager.enqueue({
		contentId: content?.id || content?.url,
		seriesId: isSeries ? content?.id || content?.url : null,
		contentTitle: content?.title || "İçerik",
		pluginName,
		type: isSeries ? "series" : "movie",
		seriesTitle: isSeries ? content?.title : null,
		seasonNumber: isSeries ? Number(episode.season) : null,
		episodeNumber: isSeries ? Number(episode.episode) : null,
		episodeTitle: isSeries ? episode.episodeTitle || null : null,
		sourceUrl: chosen.result.url,
		sourceName: chosen.extractor,
		sourceHeaders: chosen.result.headers || {},
		audioLanguage: pref?.preferredAudioTrack || null,
		subtitleUrl: chosenSub?.url || null,
		subtitleLang: chosenSub?.name || null,
		downloadSubtitle: Boolean(chosenSub),
		posterUrl: content?.poster_url || content?.backdrop_url || null,
	});
}

export function useDownload() {
	const ctx = useContext(DownloadContext);
	if (!ctx) {
		throw new Error("useDownload, DownloadProvider içinde kullanılmalıdır");
	}
	return ctx;
}

export default DownloadContext;
