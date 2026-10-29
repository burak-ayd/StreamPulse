/*
 * DownloadManager — API yüzeysel olarak eski şemayla aynı kalır; çalışması
 * native motora (StreamPulseStreamDownloader) devredilir.
 *
 * Sorumluluklar:
 *  - Native durum anlık görüntüsünü UI biçimine çevirip tutar ("kuyruk")
 *  - onStateChanged olayını onProgress/onStatusChange dinleyicilerine serer
 *  - Eski AsyncStorage kayıtlarından `completed` olanları legacy olarak
 *    kuyrukta gösterir; diğer durumlar atılır
 *  - HLS listeleme yardımcıları (ses parçaları, kalite varyantları)
 */

import { getDownloadSettings, getDownloads, getPluginDownloadPref } from "@/utils/storage";
import { parseMasterPlaylist } from "@/utils/hlsPlaylist";
import * as streamDownloader from "./streamDownloader";

// ── Durumlar (native wire adlarıyla aynı) ───────────────────────────
export const DOWNLOAD_STATUS = {
	QUEUED: "queued",
	DOWNLOADING: "downloading",
	MERGING: "merging",
	PAUSED: "paused",
	COMPLETED: "completed",
	FAILED: "failed",
};

/** Getirme başarısızlığı için küçük yardımcı. */
async function fetchText(url, headers, timeoutMs = 30000) {
	const kontrol = new AbortController();
	const zaman = setTimeout(() => kontrol.abort(), timeoutMs);
	try {
		const res = await fetch(url, { headers, signal: kontrol.signal });
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		return await res.text();
	} finally {
		clearTimeout(zaman);
	}
}

/** Header'ları native katmanın beklediği düz biçime getirir. */
function normalizeHeaders(headers) {
	const h = { ...(headers || {}) };
	if (h.Cookie && typeof h.Cookie === "object") {
		h.Cookie = Object.entries(h.Cookie)
			.map(([k, v]) => `${k}=${v}`)
			.join("; ");
	}
	return h;
}

// ── İç durum ────────────────────────────────────────────────────────
let initialized = false;
/** id → UI biçimli öğe (native + legacy) */
const items = new Map();

const progressListeners = new Set();
const statusListeners = new Set();
let prevStatus = new Map();

function emitProgress(item) {
	progressListeners.forEach((fn) => {
		try {
			fn(item.id, item);
		} catch (e) {
			console.warn("DownloadManager progress listener hatası:", e);
		}
	});
}

function emitStatus(item) {
	const prev = prevStatus.get(item.id);
	if (prev === item.status) return;
	prevStatus.set(item.id, item.status);
	statusListeners.forEach((fn) => {
		try {
			fn(item.id, item.status, item);
		} catch (e) {
			console.warn("DownloadManager status listener hatası:", e);
		}
	});
}

// ── Biçim dönüşümü ──────────────────────────────────────────────────

/** Native wire öğesini UI'un beklediği şemaya çevirir. */
function mapNativeItem(w) {
	return {
		id: w.id,
		status: w.status,
		progress: Number(w.progress || 0),
		speedBps: Number(w.speedBps || 0),
		downloadedBytes: Number(w.downloadedBytes || 0),
		totalBytes: Number(w.totalBytes || 0),
		error: w.error || null,
		errorCode: w.errorCode || null,
		contentTitle: w.episodeTitle || w.title || "İçerik",
		type: w.kind === "episode" ? "series" : "movie",
		seriesTitle: w.seriesTitle || (w.kind === "episode" ? w.title : null),
		seriesId: null,
		seasonNumber: w.season ?? null,
		episodeNumber: w.episode ?? null,
		episodeTitle: w.episodeTitle || null,
		pluginName: w.pluginName || "",
		contentId: w.contentId || null,
		posterUrl: w.posterUrl || null,
		sourceUrl: w.sourceUrl || "",
		sourceHeaders: {},
		filePath: w.outputUri || null,
		exported: w.exported === true,
		subtitlePath: w.subtitleUri || null,
		createdAt: w.createdAt || 0,
		completedAt: w.completedAt ?? null,
	};
}

/** UI queue güzel sıralı dizi döner. */
function sortedQueue() {
	return [...items.values()].sort((a, b) =>
		String(a.createdAt).localeCompare(String(b.createdAt)),
	);
}

// ── Yaşam döngüsü ───────────────────────────────────────────────────

async function initialize() {
	if (initialized) return;
	initialized = true;

	// Eski AsyncStorage kayıtları: tamamlandı olanlar gösterilir (legacy),
	// diğerleri atılır — native motor geçmiş kuyruğu bilmiyor.
	try {
		const stored = await getDownloads();
		const list = Array.isArray(stored) ? stored : [];
		for (const raw of list) {
			if (!raw || raw.id == null) continue;
			if (raw.status !== "completed") continue;
			items.set(raw.id, { ...raw, legacy: true });
		}
	} catch (e) {
		console.warn("Legacy indirme yükleme atlandı:", e);
	}

	// Native anlık görüntü + olay aboneliği
	if (streamDownloader.isAvailable()) {
		try {
			const snapshot = await streamDownloader.getState();
			for (const w of snapshot || []) items.set(w.id, mapNativeItem(w));
		} catch (e) {
			console.warn("Native kuyruk ilk yüklemesi başarısız:", e);
		}
		streamDownloader.onStateChanged((wires) => {
			// Native'den DÜŞEN kayıtlar (iptal/silme) cache'ten de düşmeli —
			// yoksa iptal edilen indirme listede "Hata" olarak kalır (madde 10).
			const nativeIds = new Set(wires.map((w) => w.id));
			for (const [id, cached] of items) {
				if (!cached.legacy && !nativeIds.has(id)) items.delete(id);
			}
			for (const w of wires) {
				const mapped = mapNativeItem(w);
				items.set(w.id, mapped);
				emitProgress(mapped);
				emitStatus(mapped);
			}
			// Silme sonrası UI'ı da tazele (status değişimi yoksa da).
			statusListeners.forEach((fn) => {
				try {
					fn(null, null, null);
				} catch {}
			});
		});
	}
}

// ── Native köprüye devredilen işlemler ──────────────────────────────

/** İndirmeyi native kuyruğa ekler; id döner. */
async function enqueue(spec) {
	if (!initialized) await initialize();
	if (!streamDownloader.isAvailable()) {
		throw new Error(streamDownloader.UNAVAILABLE_ERROR);
	}
	const isSeries = spec.type === "series";
	return streamDownloader.enqueue({
		kind: isSeries ? "episode" : "movie",
		title: spec.contentTitle || "İçerik",
		seriesTitle: spec.seriesTitle || (isSeries ? spec.contentTitle : null),
		season: isSeries ? Number(spec.seasonNumber) || null : null,
		episode: isSeries ? Number(spec.episodeNumber) || null : null,
		episodeTitle: spec.episodeTitle || null,
		sourceUrl: spec.sourceUrl,
		headers: normalizeHeaders(spec.sourceHeaders),
		audioLanguage: spec.audioLanguage || null,
		variantId: spec.variantId || null,
		variantBandwidth: spec.variantBandwidth || null,
		variantResolution: spec.variantResolution || null,
		subtitleUrl: spec.downloadSubtitle === false ? null : spec.subtitleUrl,
		posterUrl: spec.posterUrl || null,
		pluginName: spec.pluginName || "",
		contentId: spec.contentId || null,
		workers: spec.workers || null,
	});
}

async function pause(downloadId) {
	await streamDownloader.pause(downloadId);
}

async function resume(downloadId) {
	await streamDownloader.resume(downloadId);
}

/** İptal: kayıt tamamen silinir, geçici dosyalar native'de silinir (madde 10). */
async function cancel(downloadId) {
	items.delete(downloadId);
	await streamDownloader.cancel(downloadId);
}

/** Es zamanlı indirme limitini native motora bildirir (ayar: maxConcurrentDownloads). */
async function setMaxConcurrent(n) {
	if (!initialized) await initialize();
	try {
		await streamDownloader.setMaxConcurrent(Number(n) || 2);
	} catch (e) {
		console.warn("Es zamanli indirme limiti gonderilemedi:", e?.message);
	}
}

/** Indirilen dosyayi Download/StreamPulse'a disa aktarir. */
async function exportDownload(downloadId) {
	if (!initialized) await initialize();
	try {
		return await streamDownloader.exportDownload(downloadId);
	} catch (e) {
		console.warn("Disa aktarilamadi:", e?.message);
		return null;
	}
}

async function remove(downloadId) {
	items.delete(downloadId);
	await streamDownloader.remove(downloadId);
}

async function pauseAll() {
	for (const it of [...items.values()]) {
		if (it.status === "downloading" || it.status === "merging") {
			await pause(it.id);
		}
	}
}

async function resumeAll() {
	for (const it of [...items.values()]) {
		if (it.status === "paused" && !it.legacy) await resume(it.id);
	}
}

// ── Okuma API'si ────────────────────────────────────────────────────

function getQueue() {
	return sortedQueue();
}

function getItem(downloadId) {
	return items.get(downloadId) || null;
}

function onProgress(callback) {
	progressListeners.add(callback);
	return () => progressListeners.delete(callback);
}

function onStatusChange(callback) {
	statusListeners.add(callback);
	return () => statusListeners.delete(callback);
}

/**
 * Eklenti tercihine göre indirme kararını verir (plan §5 akışı).
 */
async function shouldAskBeforeDownload(pluginName) {
	const settings = await getDownloadSettings();
	if (settings.alwaysAskBeforeDownload) return true;
	const pref = await getPluginDownloadPref(pluginName);
	if (!pref) return true;
	return pref.alwaysAsk !== false;
}

/**
 * Tamamlanmış bir indirmeyi içeriğe göre bulur (çevrimdışı oynatma).
 * @returns {Promise<object|null>} ({ filePath, subtitlePath, ... }) ya da null
 */
async function findCompletedDownload(key = {}) {
	if (!initialized) await initialize();
	const { url, seriesTitle, season, episode } = key;
	const wantSeason = Number(season);
	const wantEpisode = Number(episode);
	for (const item of items.values()) {
		if (item.status !== DOWNLOAD_STATUS.COMPLETED || !item.filePath) continue;
		// "downloading" anlık görüntüsündekiler hariç: sadece gerçek dosya
		if (typeof key === "object" && key.includeLegacy === false && item.legacy) continue;
		if (item.type === "series") {
			if (!Number.isFinite(wantSeason) || !Number.isFinite(wantEpisode)) continue;
			if (Number(item.seasonNumber) !== wantSeason) continue;
			if (Number(item.episodeNumber) !== wantEpisode) continue;
			if (
				seriesTitle &&
				String(item.seriesTitle || "").toLowerCase().trim() ===
					String(seriesTitle).toLowerCase().trim()
			) {
				return item;
			}
			continue;
		}
		if (url && item.sourceUrl === url) return item;
	}
	return null;
}

/**
 * Master playlist'i değerlendirir: kalite varyantları + ses parçaları (Task 12).
 * @returns {Promise<Array>} teknede kalite yoksa [] — film direct'tir
 */
async function listHlsVariants(sourceUrl, headers) {
	const text = await fetchText(sourceUrl, normalizeHeaders(headers), 20000);
	const { variants, audioTracks } = parseMasterPlaylist(text, sourceUrl);
	return variants.map((v) => ({
		...v,
		id: `${v.resolution || "?"}@${v.bandwidth}`,
		audioTracks: audioTracks && audioTracks.length ? audioTracks : null,
	}));
}

/**
 * Modal için: HLS kaynağının ses parçalarını listeler.
 */
async function listHlsAudioTracks(sourceUrl, headers) {
	try {
		const { audioTracks } = await fetchText(
			sourceUrl,
			normalizeHeaders(headers),
			20000,
		).then((text) => parseMasterPlaylist(text, sourceUrl));
		return audioTracks.map((t) => ({
			name: t.name,
			language: t.language,
			isDefault: t.isDefault,
		}));
	} catch (e) {
		console.warn("Ses parçaları listelenemedi:", e?.message);
		return [];
	}
}

export {
	enqueue, pause, resume, cancel, remove, setMaxConcurrent, exportDownload,
	pauseAll, resumeAll, initialize,
	getQueue, getItem,
	onProgress, onStatusChange,
	shouldAskBeforeDownload, findCompletedDownload,
	listHlsVariants, listHlsAudioTracks,
};

const DownloadManager = {
	exportDownload,
	DOWNLOAD_STATUS,
	initialize,
	enqueue,
	getQueue,
	getItem,
	pause,
	resume,
	cancel,
	pauseAll,
	resumeAll,
	remove,
	setMaxConcurrent,
	onProgress,
	onStatusChange,
	shouldAskBeforeDownload,
	findCompletedDownload,
	listHlsVariants,
	listHlsAudioTracks,
};
export default DownloadManager;
export { DownloadManager };
