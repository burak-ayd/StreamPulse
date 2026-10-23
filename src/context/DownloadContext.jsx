/*
 * DownloadContext — Uygulama genelinde indirme durumunu paylaşır
 * (download_feature_plan.md §9).
 *
 * DownloadManager servis sınıfı (state'siz modül), bu provider
 * onun REACT AYNASI'dır: kuyruk/ilerleme state'i, manager event
 * abonelikleri ve enqueue/pause/resume/cancel eylemleri burada
 * kullanıma açılır. Ekranlar yalnızca `useDownload()` ile konuşur.
 *
 * Manager initialize edilmemişse (ilk açılış) etkinleştirilir; diskte
 * yarım kalan indirmeler "paused" olarak kuyruğa geri döner.
 */

import React, {
	createContext,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { DownloadManager } from "@/services/downloadManager";
import {
	getDownloadSettings,
	saveDownloadSettings as persistDownloadSettings,
	resetDownloadSettings as persistResetDownloadSettings,
} from "@/utils/storage";

const DownloadContext = createContext(null);

export function DownloadProvider({ children }) {
	const [queue, setQueue] = useState([]);
	const [settings, setSettings] = useState(null);
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
			pauseDownload,
			resumeDownload,
			cancelDownload,
			pauseAll: pauseAllDownloads,
			resumeAll: resumeAllDownloads,
			removeDownload,
			updateSettings,
			resetSettings,
			// yardımcılar (modal akışı için plan §5 karar fonksiyonu)
			shouldAskBeforeDownload: DownloadManager.shouldAskBeforeDownload,
		}),
		[
			queue,
			activeDownloads,
			settings,
			enqueueDownload,
			pauseDownload,
			resumeDownload,
			cancelDownload,
			pauseAllDownloads,
			resumeAllDownloads,
			removeDownload,
			updateSettings,
			resetSettings,
		],
	);

	return (
		<DownloadContext.Provider value={value}>
			{children}
		</DownloadContext.Provider>
	);
}

export function useDownload() {
	const ctx = useContext(DownloadContext);
	if (!ctx) {
		throw new Error("useDownload, DownloadProvider içinde kullanılmalıdır");
	}
	return ctx;
}

export default DownloadContext;
