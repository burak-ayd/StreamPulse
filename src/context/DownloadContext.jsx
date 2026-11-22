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

import { useFeedback } from "@/components/feedback/AppFeedbackProvider";
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
	pruneLocalPlaybackRecords,
} from "@/utils/storage";

const DownloadContext = createContext(null);

/** Kuyruk öğesinin kullanıcıya gösterilen kısa adı: dizi → "The Strain", film → ad. */
function downloadItemLabel(item) {
	if (!item) return "İçerik";
	if (item.type === "series" && item.seasonNumber && item.episodeNumber) {
		const s = String(item.seasonNumber).padStart(2, "0");
		const e = String(item.episodeNumber).padStart(2, "0");
		return `${item.seriesTitle || item.contentTitle} S${s} B${e}`;
	}
	return item.contentTitle || "İçerik";
}

/** İndirme başladı bildirimi: dizide sezon/bölüm de yazılır. */
function downloadStartMessage(spec) {
	if (!spec) return "İndirme başladı.";
	const isSeries = spec.type === "series";
	if (isSeries) {
		const s = String(Number(spec.seasonNumber) || 1).padStart(2, "0");
		const e = String(Number(spec.episodeNumber) || 1).padStart(2, "0");
		const ep = spec.episodeTitle ? ` · ${spec.episodeTitle}` : "";
		return `"${spec.contentTitle || "Dizi"}" S${s} B${e}${ep} indiriliyor…`;
	}
	return `"${spec.contentTitle || "İçerik"}" indiriliyor…`;
}

/** İndirme kimliği: film → içerik, dizi → seriesId + S/E (kaynak URL değil). */
export function buildDownloadKey({ contentId, seriesId, season, episode }) {
	if (season && episode) {
		return `${seriesId || contentId || "series"}|s${Number(season)}|e${Number(episode)}`;
	}
	return String(contentId || "");
}

export function DownloadProvider({ children }) {
	const { toast } = useFeedback();
	const [queue, setQueue] = useState([]);
	const [settings, setSettings] = useState(null);
	const [modal, setModal] = useState(null); // { content, episode } | null
	// Kaynakları aranan / kuyruğa yazılan indirme anahtarları: butonlar bu
	// sırada spinner gösterir (buildDownloadKey ile aynı anahtar).
	const [pendingKeys, setPendingKeys] = useState(() => new Set());
	const readyRef = useRef(false);

	const markPending = useCallback((key, on) => {
		setPendingKeys((prev) => {
			const next = new Set(prev);
			if (on) next.add(key);
			else next.delete(key);
			return next;
		});
	}, []);

	// Kuyruk state'ini manager'ın düz dizisinden tazeleyen yardımcı
	const syncQueue = () => setQueue(DownloadManager.getQueue());

	useEffect(() => {
		let disposed = false;

		(async () => {
			await DownloadManager.initialize();
			if (disposed) return;
			readyRef.current = true;
			const ayarlar = await getDownloadSettings();
			setSettings(ayarlar);
			// Es zamanlı indirme limiti native motora bildirilir (ayar aktif olsun).
			try {
				await DownloadManager.setMaxConcurrent(ayarlar?.maxConcurrentDownloads || 2);
			} catch (e) {
				console.warn("Es zamanli indirme limiti gonderilemedi:", e?.message);
			}
			syncQueue();
		})();

		const unsubProgress = DownloadManager.onProgress(() => syncQueue());
		const unsubStatus = DownloadManager.onStatusChange(
			(_id, status, item) => {
				syncQueue();
				// İndirme hatası sessiz kalmasın: toast ile bildir.
				if (
					status === "failed" &&
					item &&
					!item.legacy &&
					readyRef.current
				) {
					toast.error(
						`İndirme başarısız: "${downloadItemLabel(item)}"${
							item.error ? ` — ${item.error}` : ""
						}`,
					);
				}
			},
		);

		return () => {
			disposed = true;
			unsubProgress();
			unsubStatus();
		};
	}, [toast]);

	const enqueueDownload = useMemo(
		() => async (spec) => {
			try {
				const id = await DownloadManager.enqueue(spec);
				syncQueue();
				toast.info(downloadStartMessage(spec));
				return id;
			} catch (e) {
				toast.error(
					`İndirme başlatılamadı${e?.message ? `: ${e.message}` : "."}`,
				);
				throw e;
			}
		},
		[toast],
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
				toast.info("İndirme için video bağlantısı bulunamadı.");
				return { enqueued: false };
			}

			// Kaynak aranırken tetikleyici buton spinner gösterir.
			const key = buildDownloadKey({
				contentId: content?.id || content?.url || content?.title,
				seriesId: episode
					? content?.id || content?.url || content?.title
					: null,
				season: episode?.season,
				episode: episode?.episode,
			});
			markPending(key, true);
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
						syncQueue();
						toast.info(
							downloadStartMessage({
								contentTitle: content?.title,
								type:
									episode?.season && episode?.episode
										? "series"
										: "movie",
								seasonNumber: episode?.season,
								episodeNumber: episode?.episode,
								episodeTitle: episode?.episodeTitle,
							}),
						);
						return { enqueued: true, id };
					}
					// Kaynak bulunamadı → modal'a düş
				}
			} catch (e) {
				console.warn("Hızlı indirme yolu hatası:", e?.message);
				toast.error(
					`İndirme başlatılamadı${e?.message ? `: ${e.message}` : "."}`,
				);
			} finally {
				markPending(key, false);
			}

			setModal({ content, episode });
			return { enqueued: false };
		},
		[toast, markPending],
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
			/*
			 * Kayıt silinmeden ÖNCE dosya yolunu al: o yolu işaret eden
			 * devam/geçmiş kayıtları da temizlenir, aksi halde kart ölü bir
			 * dosyayı açmayı dener (silinen indirme hatası).
			 */
			const item = DownloadManager.getItem(downloadId);
			await DownloadManager.remove(downloadId);
			await pruneLocalPlaybackRecords(item?.filePath).catch(() => {});
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

	/**
	 * Anahtar → son indirme durumu. Detay ekranındaki indirme butonları
	 * (film hapı, bölüm dairesi) bu haritadan canlı durum/ilerleme okur.
	 */
	const downloadStates = useMemo(() => {
		const map = new Map();
		(queue || []).forEach((item) => {
			if (!item?.contentId) return;
			map.set(
				buildDownloadKey({
					contentId: item.contentId,
					seriesId: item.seriesId,
					season: item.seasonNumber,
					episode: item.episodeNumber,
				}),
				{
					status: item.status,
					progress: Number(item.progress || 0),
					error: item.error || null,
				},
			);
		});
		return map;
	}, [queue]);

	const getDownloadState = useCallback(
		({ contentId, seriesId, season, episode }) =>
			downloadStates.get(
				buildDownloadKey({ contentId, seriesId, season, episode }),
			) || null,
		[downloadStates],
	);

	const isDownloadPending = useCallback(
		({ contentId, seriesId, season, episode }) =>
			pendingKeys.has(
				buildDownloadKey({ contentId, seriesId, season, episode }),
			),
		[pendingKeys],
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
			isDownloadPending,
			getDownloadState,
			downloadedKeys,
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
			isDownloadPending,
			getDownloadState,
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
	/*
	 * Kaynak seçimi — modal ile AYNI mantık:
	 *  1) Kayıtlı tercih İSİMLE (çünkü "Rapidrame" iki kaynak üretir:
	 *     HLS master + CehennemPass progressive MP4 → extractor adı AYNI).
	 *  2) Tercih isimle yoksa doğrudan dosya (progressive MP4) önce gelir:
	 *     tek dosya indirme çok daha hızlı (HLS: 0.7 MB/s vs MP4: 40+ MB/s).
	 *  3) Eski kayıt (extractor adı) — son çare.
	 */
	const { preferDirectSources } = await import("@/utils/directMedia");
	const sirali = preferDirectSources(usable);
	const chosen =
		(pref?.preferredSourceName &&
			sirali.find((s) => s?.result?.name === pref.preferredSourceName)) ||
		sirali[0] ||
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

	// Kayıtlı kalite (madde 4): son modal seçimi; yoksa native "Otomatik".
	let savedQuality = null;
	try {
		const dlSettings = await getDownloadSettings();
		if (dlSettings?.lastDownloadQuality && chosen?.result?.url?.includes(".m3u8")) {
			const { listHlsVariants } = await import("@/services/downloadManager").then(
				(m) => m.default ?? m.DownloadManager,
			);
			const { pickVariant, variantId: vid } = await import("@/utils/variants");
			const kaliteler = await listHlsVariants(
				chosen.result.url,
				chosen.result.headers || {},
			).catch(() => []);
			const secilen = pickVariant(kaliteler, dlSettings.lastDownloadQuality);
			if (secilen) {
				savedQuality = {
					variantId: vid(secilen),
					variantBandwidth: secilen.bandwidth,
					variantResolution: secilen.resolution,
				};
			}
		}
	} catch (e) {
		console.warn("Kayıtlı kalite uygulanamadı:", e?.message);
	}

	return DownloadManager.enqueue({
		contentId: content?.id || content?.url,
		seriesId: isSeries ? content?.id || content?.url : null,
		// Yerel dosya cihaza özeldir; devam kaydı bu sayfa adresini taşır.
		pageUrl: episode?.url || content?.url || null,
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
		...(savedQuality || {}),
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
