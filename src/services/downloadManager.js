/*
 * DownloadManager — İndirme kuyruğu yöneticisi (download_feature_plan.md §6).
 *
 * Sorumluluklar:
 *  - FIFO kuyruk + `maxConcurrentDownloads` sınırına göre eş zamanlılık
 *  - İlerleme takibi (progress, downloadedBytes, totalBytes)
 *  - Dosya sistemi işlemleri (expo-file-system/legacy)
 *  - Duraklatma/devam (HTTP Range desteği: DownloadResumable)
 *  - İptal + kısmi dosya temizliği
 *  - Hata sınıflandırma (NETWORK_LOST, HTTP_ERROR, DISK_FULL, HLS_UNSUPPORTED)
 *
 * NOT (Faz 1): Yalnızca doğrudan (MP4/webm) URL'ler indirilir. HLS/M3U8
 * akışları `HLS_UNSUPPORTED` ile işaretlenir — bkz. plan §11 önemli notu.
 *
 * Kalıcılık: her durum/ilerleme değişimi `saveDownloadItem()` ile
 * AsyncStorage'a yazılır (STORAGE_KEYS.DOWNLOADS). Uygulama yeniden
 * açıldığında `initialize()` kuyruğu diskten geri yükler ve "downloading"
 * durumundakileri "paused"e çeker (indirme süreçleri canlı kalmaz).
 */

import * as FileSystem from "expo-file-system/legacy";
import {
	deleteDownloadItem,
	getDownloadSettings,
	getDownloads,
	getPluginDownloadPref,
	saveDownloadItem,
} from "@/utils/storage";

// ── Durumlar ────────────────────────────────────────────────────────
export const DOWNLOAD_STATUS = {
	QUEUED: "queued",
	DOWNLOADING: "downloading",
	PAUSED: "paused",
	COMPLETED: "completed",
	FAILED: "failed",
	CANCELLED: "cancelled",
};

// Kuyrukta bir sonraki indirmeye geçmeyi engelleyen "bitmiş" durumlar
const TERMINAL_STATUSES = new Set([
	DOWNLOAD_STATUS.COMPLETED,
	DOWNLOAD_STATUS.FAILED,
	DOWNLOAD_STATUS.CANCELLED,
]);

// İlerleme yazmalarını kısıtla: her callback AsyncStorage'a yazarsa
// kuyruk %1 ilerlemede onlarca kez disk'e dokunur.
const PROGRESS_SAVE_INTERVAL_MS = 1000;
const PROGRESS_SAVE_MIN_DELTA = 0.01;

const TEMP_DIR_NAME = ".downloads_temp";

// ── İç durum ────────────────────────────────────────────────────────
/** id → DownloadItem (bellekteki canlı kopya) */
const items = new Map();
/** id → DownloadResumable (yalnızca aktif/duraklatılmış indirmelerde) */
const resumables = new Map();
/** id → her ikili durum için { savable, lastSavedAt, lastSavedProgress } */
const runtime = new Map();

let maxConcurrentDownloads = 2;
let initialized = false;

/** ilerleme aboneleri: Set<fn(id, item)> */
const progressListeners = new Set();
/** durum değişikliği aboneleri: Set<fn(id, status, item)> */
const statusListeners = new Set();

// ── Yardımcılar ─────────────────────────────────────────────────────

/** Rastgele ve yeterince benzersiz indirme kimliği (uuid bağımlılığı olmadan). */
function generateDownloadId() {
	return `dl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Dosya adı sanitizasyonu (plan §3.3): dosya sisteminde geçersiz
 * karakterleri ayıklar, çoklu boşlukları tek boşluğa indirir.
 */
export function sanitizeFileName(name) {
	return String(name || "")
		.replace(/[<>:"/\\|?*]/g, "")
		.replace(/\s+/g, " ")
		.trim();
}

/** Sayıyı iki haneli metne çevirir: 1 → "01" */
function pad2(n) {
	const num = Number(n);
	return Number.isFinite(num) ? String(Math.floor(num)).padStart(2, "0") : "00";
}

/**
 * Yol sonuna ek: "İndirilenler/StreamPulse" gibi bir ayar yolunu,
 * documentDirectory tabanına göre güvenli bir form'a getirir.
 * Ayar yolu "." ya da "" ise yalnızca documentDirectory döner.
 */
function resolveBaseDirectory(settingsPath) {
	const base = FileSystem.documentDirectory || FileSystem.cacheDirectory;
	// sanitizeFileName "/" karakterini siler → ayar yolu klasör hiyerarşisi
	// kaybolur; bu yüzden burada yalnızca boşluk/aşırı karakter temizliği yap
	// ve klasörleri ayrı bölümlere ayır.
	const safeSegments = (settingsPath || "Downloads/StreamPulse")
		.split("/")
		.map((s) => sanitizeFileName(s))
		.filter(Boolean)
		.slice(0, 3); // en fazla 3 derinlik — kötü niyetli/bozuk ayar yolu koruması
	return {
		base,
		relative: safeSegments.join("/"),
		full: safeSegments.length ? `${base}${safeSegments.join("/")}/` : base,
	};
}

/**
 * İndirme öğesi için klasör + dosya adını üretir (plan §3.1/3.2):
 *   film:      {FilmAdı}.mp4
 *   dizi:      {DiziAdı}-S01xE04-{BölümAdı}.mp4
 */
export function buildDownloadFileName(item) {
	const safeTitle = sanitizeFileName(item.seriesTitle || item.contentTitle);
	if (item.type === "series" && item.seasonNumber && item.episodeNumber) {
		const base = `${safeTitle}-S${pad2(item.seasonNumber)}xE${pad2(item.episodeNumber)}`;
		const epTitle = sanitizeFileName(item.episodeTitle || "");
		return epTitle ? `${base}-${epTitle}` : base;
	}
	return safeTitle || generateDownloadId();
}

/** İndirme öğesinin varış yolunu (dosya adıyla) döndürür. */
export function buildDownloadTargetPath(item, settings) {
	const dir = resolveBaseDirectory(settings.downloadPath);
	const fileName = `${buildDownloadFileName(item)}.mp4`;
	return `${dir.full}${fileName}`;
}

function emitProgress(item) {
	progressListeners.forEach((fn) => {
		try {
			fn(item.id, item);
		} catch (e) {
			console.warn("DownloadManager progress listener hatası:", e);
		}
	});
}

function emitStatus(item, prevStatus) {
	if (prevStatus === item.status) return;
	statusListeners.forEach((fn) => {
		try {
			fn(item.id, item.status, item);
		} catch (e) {
			console.warn("DownloadManager status listener hatası:", e);
		}
	});
}

/** Bellek kopyasını disk'e yazar (boğulmamak için ilerlemede kısıtlı). */
async function persist(item, { force = false } = {}) {
	const rt = runtime.get(item.id);
	if (rt && !force) {
		const now = Date.now();
		if (
			item.status === DOWNLOAD_STATUS.DOWNLOADING &&
			now - rt.lastSavedAt < PROGRESS_SAVE_INTERVAL_MS &&
			item.progress - rt.lastSavedProgress < PROGRESS_SAVE_MIN_DELTA
		) {
			return;
		}
		rt.lastSavedAt = now;
		rt.lastSavedProgress = item.progress;
	}
	try {
		await saveDownloadItem({ ...item });
	} catch (e) {
		console.warn("DownloadManager persist hatası:", e);
	}
}

function setStatus(item, status, patch = {}) {
	const prev = item.status;
	item.status = status;
	if (status === DOWNLOAD_STATUS.PAUSED && !item.pausedAt) {
		item.pausedAt = new Date().toISOString();
	}
	if (status === DOWNLOAD_STATUS.COMPLETED) {
		item.completedAt = new Date().toISOString();
	}
	Object.assign(item, patch);
	if (status !== DOWNLOAD_STATUS.DOWNLOADING) {
		// canlı indirmeler kuyruğun dışında kalır; diğerleri yeniden yüklenebilir
		resumables.delete(item.id);
	}
	emitStatus(item, prev);
}

/**
 * Hatayı sınıflandırır: plan §2.3 `errorCode` değerleri.
 */
function classifyError(err) {
	const msg = String(err?.message || err || "");
	if (err?.code === "E_DOWNLOAD_FAILED") return "HTTP_ERROR";
	if (err?.code === "E_FILESYSTEM_ERROR") return "DISK_FULL";
	if (/network|timeout|aborted|failed to connect/i.test(msg)) return "NETWORK_LOST";
	if (/space|disk|nospace/i.test(msg)) return "DISK_FULL";
	return "HTTP_ERROR";
}

/**
 * URL'nin desteklenen doğrudan indirme olduğunu (HLS değil) kontrol eder.
 */
function isDirectMediaUrl(url) {
	return !(
		(url || "").includes(".m3u8") ||
		(url || "").includes("/hls/") ||
		(url || "").includes("/hls2/") ||
		(url || "").includes(".urlset") ||
		(url || "").includes("master.txt")
	);
}

// ── Kuyruk çalıştırma ───────────────────────────────────────────────

function activeCount() {
	let n = 0;
	items.forEach((it) => {
		if (it.status === DOWNLOAD_STATUS.DOWNLOADING) n += 1;
	});
	return n;
}

/** Kuyrukta bekleyen (queued) öğeleri başlatır. */
function pump() {
	if (activeCount() >= maxConcurrentDownloads) return;
	const queued = [...items.values()]
		.filter((it) => it.status === DOWNLOAD_STATUS.QUEUED)
		.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
	for (const item of queued) {
		if (activeCount() >= maxConcurrentDownloads) break;
		runDownload(item).catch((e) => {
			console.warn("DownloadManager runDownload beklenmeyen hata:", e);
		});
	}
}

/**
 * Tek bir indirmeyi başlatır/durdurur (mevcut durumdan itibaren).
 * Ayrı async akış; hataları öğeye yazar, dışarı fırlatmaz.
 */
async function runDownload(item) {
	if (!initialized) {
		item.status = DOWNLOAD_STATUS.FAILED;
		item.error = "DownloadManager henüz başlatılmadı";
		item.errorCode = "HTTP_ERROR";
		emitStatus(item, DOWNLOAD_STATUS.QUEUED);
		return;
	}

	// HLS desteklenmiyor (plan §11): kullanıcıya anlamlı bir hata göster.
	if (!isDirectMediaUrl(item.sourceUrl)) {
		setStatus(item, DOWNLOAD_STATUS.FAILED, {
			error: "Bu kaynak HLS/M3U8 akışı; doğrudan indirme henüz desteklenmiyor.",
			errorCode: "HLS_UNSUPPORTED",
		});
		await persist(item, { force: true });
		pump();
		return;
	}

	setStatus(item, DOWNLOAD_STATUS.DOWNLOADING);
	await persist(item, { force: true });

	try {
		// Kısmi dosyalar için temp klasör
		const base = FileSystem.documentDirectory || FileSystem.cacheDirectory;
		const tempDir = `${base}${TEMP_DIR_NAME}/`;
		await FileSystem.makeDirectoryAsync(tempDir, { intermediates: true }).catch(() => {});
		const tempUri = `${tempDir}${item.id}.part`;

		const settings = await getDownloadSettings();
		const targetPath = buildDownloadTargetPath(item, settings);

		let resumable = resumables.get(item.id);
		if (!resumable) {
			// Uygulama yeniden açılıp "paused"ten gelen kayıt resumeData taşır.
			const savedState = item._resumableState || null;
			resumable = FileSystem.createDownloadResumable(
				item.sourceUrl,
				tempUri,
				{ headers: item.sourceHeaders || {} },
				(progress) => handleProgress(item, progress),
				savedState?.resumeData || null,
			);
		}
		resumables.set(item.id, resumable);

		// ⚠️ Yarış koruması: resumable haritaya girilecek ile downloadAsync
		// başlayacak arasında pause/cancel tetiklendi ise indirmeyi HİÇ
		// başlatma — "hayalet indirme" bırakırdı (UI duraklatılmış gösterirken
		// dosya arka planda büyürdü).
		if (item.status !== DOWNLOAD_STATUS.DOWNLOADING) {
			resumables.delete(item.id);
			return;
		}

		const result = await resumable.downloadAsync();
		if (!result?.uri) {
			throw new Error("İndirme sonucu alınamadı (boş uri)");
		}

		// Varış klasörünü hazırla ve dosyayı taşı
		const targetDir = targetPath.substring(0, targetPath.lastIndexOf("/") + 1);
		await FileSystem.makeDirectoryAsync(targetDir, { intermediates: true }).catch(() => {});
		try {
			await FileSystem.moveAsync({ from: result.uri, to: targetPath });
		} catch (moveErr) {
			// Aynı isimde tamamlanmış dosya varsa üzerine yaz (yeniden indirme)
			void moveErr;
			await FileSystem.deleteAsync(targetPath, { idempotent: true }).catch(() => {});
			await FileSystem.moveAsync({ from: result.uri, to: targetPath });
		}

		// Altyazı (varsa ve istendiyse): aynı adla .srt
		if (item.subtitleUrl && item.downloadSubtitle !== false) {
			const subtitlePath = targetPath.replace(/\.mp4$/, ".srt");
			try {
				const subResult = await FileSystem.downloadAsync(
					item.subtitleUrl,
					subtitlePath,
				);
				item.subtitlePath = subResult?.uri || subtitlePath;
			} catch (subErr) {
				// Altyazı indirilemedi → video indirmeyi BOZMAZ, yalnızca not edilir.
				console.warn("Altyazı indirilemedi:", subErr?.message);
			}
		}

		setStatus(item, DOWNLOAD_STATUS.COMPLETED, {
			progress: 1,
			filePath: targetPath,
			resumable: true,
			lastResumeOffset: 0,
			_resumableState: null,
		});
		await persist(item, { force: true });
		pump();
	} catch (err) {
		// pauseAsync çağrısı kontrolsüz bir şekilde hata fırlatmadan akışı
		// durdurur; "paused" durumu pause() içinde işlenir.
		if (item.status === DOWNLOAD_STATUS.PAUSED) return;

		// "cancelled" olarak işaretlenmişse temizlik cancel() içinde yapılır.
		if (item.status === DOWNLOAD_STATUS.CANCELLED) return;

		console.warn("İndirme hatası:", err?.message);
		item.retryCount = (item.retryCount || 0) + 1;
		const maxRetries = item.maxRetries ?? 3;
		if (item.retryCount <= maxRetries) {
			// Otomatik yeniden deneme: küçük bir gecikme ile kuyruğa geri al.
			setStatus(item, DOWNLOAD_STATUS.QUEUED, {
				error: null,
				errorCode: null,
			});
			await persist(item, { force: true });
			setTimeout(() => pump(), 1500 * item.retryCount);
		} else {
			setStatus(item, DOWNLOAD_STATUS.FAILED, {
				error: err?.message || "İndirme başarısız",
				errorCode: classifyError(err),
			});
			await persist(item, { force: true });
			pump();
		}
	}
}

function handleProgress(item, progress) {
	const total = progress?.totalBytesExpectedToWrite || 0;
	const written = progress?.totalBytesWritten || 0;
	item.totalBytes = total || item.totalBytes;
	item.downloadedBytes = written;
	item.progress = total > 0 ? Math.min(1, written / total) : item.progress;
	item.resumable = true;
	item.lastResumeOffset = written;
	emitProgress(item);
	persist(item);
}

// ── Genel API ───────────────────────────────────────────────────────

/**
 * Uygulama açılışında çağrılır (DownloadContext useEffect):
 *  - ayarlardan eş zamanlılık sınırını okur
 *  - diskteki indirme listesini kuyruğa geri yükler
 *  - "downloading" kalanları "paused"e çeker (süreç canlı değildir)
 */
async function initialize() {
	if (initialized) return;
	const settings = await getDownloadSettings();
	maxConcurrentDownloads = Math.min(5, Math.max(1, Number(settings.maxConcurrentDownloads) || 2));

	const stored = await getDownloads();
	const list = Array.isArray(stored) ? stored : [];
	for (const raw of list) {
		if (!raw || !raw.id) continue;
		const item = { ...raw };
		if (item.status === DOWNLOAD_STATUS.DOWNLOADING) {
			item.status = DOWNLOAD_STATUS.PAUSED;
			item.pausedAt = new Date().toISOString();
		}
		if (item.status === DOWNLOAD_STATUS.QUEUED) {
			item.status = DOWNLOAD_STATUS.PAUSED;
			item.pausedAt = new Date().toISOString();
		}
		items.set(item.id, item);
		runtime.set(item.id, {
			lastSavedAt: 0,
			lastSavedProgress: 0,
		});
	}
	initialized = true;
	// Kullanıcıyı zorlamayız: otomatik devam isteyen "resumeAll" çağırır.
}

/**
 * İndirmeyi kuyruğa ekler ve çalıştırır.
 * @param {object} spec — DownloadItem alanları (plan §2.3); id durumsa üretilir
 * @returns {Promise<string>} downloadId
 */
async function enqueue(spec) {
	if (!initialized) await initialize();

	const existing = [...items.values()].find(
		(it) =>
			it.contentId === spec.contentId &&
			it.pluginName === spec.pluginName &&
			(!spec.sourceUrl || it.sourceUrl === spec.sourceUrl) &&
			!TERMINAL_STATUSES.has(it.status),
	);
	if (existing) return existing.id;

	const settings = await getDownloadSettings();
	const id = spec.id || generateDownloadId();
	const item = {
		id,
		contentId: spec.contentId || null,
		contentTitle: spec.contentTitle || "İçerik",
		pluginName: spec.pluginName || "",
		type: spec.type === "series" ? "series" : "movie",
		seriesTitle: spec.seriesTitle || null,
		seriesId: spec.seriesId || null,
		seasonNumber: spec.seasonNumber || null,
		episodeNumber: spec.episodeNumber || null,
		episodeTitle: spec.episodeTitle || null,
		sourceUrl: spec.sourceUrl,
		sourceName: spec.sourceName || "",
		sourceHeaders: spec.sourceHeaders || {},
		audioTrack: spec.audioTrack || null,
		subtitleUrl: spec.subtitleUrl || null,
		subtitleLang: spec.subtitleLang || null,
		downloadSubtitle: spec.downloadSubtitle !== false,
		status: DOWNLOAD_STATUS.QUEUED,
		progress: 0,
		downloadedBytes: 0,
		totalBytes: 0,
		filePath: buildDownloadTargetPath(spec, settings),
		subtitlePath: null,
		tempFilePath: null,
		resumable: true,
		lastResumeOffset: 0,
		retryCount: 0,
		maxRetries: 3,
		createdAt: new Date().toISOString(),
		pausedAt: null,
		completedAt: null,
		error: null,
		errorCode: null,
		posterUrl: spec.posterUrl || null,
	};

	items.set(id, item);
	runtime.set(id, { lastSavedAt: 0, lastSavedProgress: 0 });
	emitStatus(item, null);
	await persist(item, { force: true });
	pump();
	return id;
}

/** Kuyruk düz dizi döndürür (ekleme sırası). */
function getQueue() {
	return [...items.values()].sort(
		(a, b) => new Date(a.createdAt) - new Date(b.createdAt),
	);
}

/** Tek bir indirme öğesini döndürür. */
function getItem(downloadId) {
	return items.get(downloadId) || null;
}

/**
 * Belirli bir indirmeyi duraklatır.
 *
 * ⚠️ SIRA ÖNEMLİDİR (expo-file-system sözleşmesi): `resumeData` yalnızca
 * `pauseAsync()` resolve OLDUĞUNDA `savable()` içine yazılır. Önce
 * `savable()` çağırmak daima boş resumeData üretir → devam sıfırdan
 * indirme olurdu. Bu yüzden: 1) pauseAsync bekle → 2) dönen savable
 * durumunu öğeye yaz → 3) o zaman PAUSED'a geç.
 *
 * "Sırada" (queued) öğede de duraklatma anlamlıdır: indirme hiç başlamadı,
 * o yüzden yalnızca durum değişir; kuyrukta yer tutan öğe ileri başlasın
 * diye kullanıcı sırada bekleyeni askıya alabilir.
 */
async function pause(downloadId) {
	const item = items.get(downloadId);
	if (!item) return;

	// Queued: henüz dosya indirmesi başlamadı — resumable yok, sadece durum.
	if (item.status === DOWNLOAD_STATUS.QUEUED) {
		setStatus(item, DOWNLOAD_STATUS.PAUSED);
		await persist(item, { force: true });
		pump();
		return;
	}

	if (item.status !== DOWNLOAD_STATUS.DOWNLOADING) return;

	const resumable = resumables.get(downloadId);
	let savableState = null;
	try {
		if (resumable) {
			// pauseAsync, savable() biçimli nesneyi döndürür (resumeData dahil).
			savableState = (await resumable.pauseAsync()) || null;
		}
	} catch (e) {
		// pauseAsync bazı platformlarda sessizce hata verebilir; "paused"
		// durumu korunur ama resumeData eksik olabilir → resume baştan başlar.
		console.warn("pauseAsync hatası:", e?.message);
	}
	// pauseAsync beklerken indirme kendiliğinden bitti/iptal edildiyse
	// öğeyi "paused"e döndürme (yarış koruması).
	if (item.status !== DOWNLOAD_STATUS.DOWNLOADING) return;
	setStatus(item, DOWNLOAD_STATUS.PAUSED, {
		_resumableState: savableState || item._resumableState || null,
	});
	await persist(item, { force: true });
	pump();
}

/** Duraklatılmış indirmeyi devam ettirir (kuyruk kapasitesine sayılır). */
async function resume(downloadId) {
	const item = items.get(downloadId);
	if (!item) return;
	if (item.status !== DOWNLOAD_STATUS.PAUSED && item.status !== DOWNLOAD_STATUS.FAILED) return;
	if (activeCount() >= maxConcurrentDownloads) return;
	item.retryCount = 0;
	await runDownload(item);
}

/**
 * İndirmeyi iptal eder: aktif indirmeyi keser ve kısmi dosyayı siler.
 */
async function cancel(downloadId) {
	const item = items.get(downloadId);
	if (!item) return;
	const wasDownloading = item.status === DOWNLOAD_STATUS.DOWNLOADING;
	const prev = item.status;
	setStatus(item, DOWNLOAD_STATUS.CANCELLED);

	if (wasDownloading) {
		const resumable = resumables.get(downloadId);
		try {
			if (resumable) await resumable.pauseAsync();
		} catch (_e) {
			/* iptal sırasında hata yoksayılır */
		}
	}
	try {
		const base = FileSystem.documentDirectory || FileSystem.cacheDirectory;
		await FileSystem.deleteAsync(`${base}${TEMP_DIR_NAME}/${item.id}.part`, {
			idempotent: true,
		});
	} catch (_e) {
		/* dosya yoksa sorun değil */
	}
	emitStatus(item, prev);
	await persist(item, { force: true });
	pump();
}

/** Tüm aktif indirmeleri duraklatır. */
async function pauseAll() {
	const actives = [...items.values()].filter(
		(it) => it.status === DOWNLOAD_STATUS.DOWNLOADING,
	);
	for (const it of actives) {
		await pause(it.id);
	}
}

/** Tüm duraklatılmışları (ve başarısızları) kapasite dolana dek devam ettirir. */
async function resumeAll() {
	const candidates = [...items.values()].filter(
		(it) => it.status === DOWNLOAD_STATUS.PAUSED || it.status === DOWNLOAD_STATUS.FAILED,
	);
	for (const it of candidates) {
		if (activeCount() >= maxConcurrentDownloads) break;
		await resume(it.id);
	}
}

/** İndirme durumunu dinler: onProgress(fn) → unsubscribe fn döndürür. */
function onProgress(callback) {
	progressListeners.add(callback);
	return () => progressListeners.delete(callback);
}

/** Durum değişikliklerini dinler: onStatusChange(fn) → unsubscribe fn döndürür. */
function onStatusChange(callback) {
	statusListeners.add(callback);
	return () => statusListeners.delete(callback);
}

/**
 * Öğeyi kuyruktan tamamen kaldırır: aktif indirmeyi keser, kısmi dosyayı
 * siler ve AsyncStorage'daki (DOWNLOADS) kaydı da düşürür — yoksa "silinen"
 * indirme uygulama yeniden açıldığında geri dönerdi.
 */
async function remove(downloadId) {
	const item = items.get(downloadId);
	if (!item) return;
	if (item.status === DOWNLOAD_STATUS.DOWNLOADING) {
		await cancel(downloadId);
	}
	items.delete(downloadId);
	runtime.delete(downloadId);
	try {
		const base = FileSystem.documentDirectory || FileSystem.cacheDirectory;
		await FileSystem.deleteAsync(`${base}${TEMP_DIR_NAME}/${item.id}.part`, {
			idempotent: true,
		});
	} catch (_e) {
		/* dosya yoksa sorun değil */
	}
	await deleteDownloadItem(downloadId).catch(() => {});
}

/**
 * Eklenti tercihine göre indirme kararını verir (plan §5 akışı):
 * kayıtlı tercih varsa ve "her seferinde sor" KAPALI ise modal atlanır.
 * UI katmanı kullanır: `{ ask: boolean, pref: object|null }`
 */
async function shouldAskBeforeDownload(pluginName) {
	const settings = await getDownloadSettings();
	if (settings.alwaysAskBeforeDownload) return true;
	const pref = await getPluginDownloadPref(pluginName);
	if (!pref) return true;
	return pref.alwaysAsk !== false;
}

/**
 * Tamamlanmış bir indirmeyi içeriğe göre bulur (çevrimdışı oynatma, Faz 5).
 *
 * Eşleşme kuralları:
 *  - film: `contentId` veya kaynak URL birebir eşleşir
 *  - dizi: `seriesId` + sezon/bölüm numaraları eşleşir (seriesId bilinmiyorsa
 *    başlık eşleşmesine düşer)
 *
 * @param {{ contentId?: string, url?: string, seriesId?: string,
 *          seriesTitle?: string, season?: number, episode?: number }} key
 * @returns {Promise<object|null>} Tamamlanmış indirme öğesi
 *          ({ filePath, subtitlePath, ... }); yoksa null
 */
async function findCompletedDownload(key = {}) {
	if (!initialized) await initialize();
	const { contentId, url, seriesId, seriesTitle, season, episode } = key;
	const wantSeason = Number(season);
	const wantEpisode = Number(episode);
	for (const item of items.values()) {
		if (item.status !== DOWNLOAD_STATUS.COMPLETED || !item.filePath) continue;
		if (item.type === "series") {
			if (!Number.isFinite(wantSeason) || !Number.isFinite(wantEpisode)) continue;
			if (Number(item.seasonNumber) !== wantSeason) continue;
			if (Number(item.episodeNumber) !== wantEpisode) continue;
			if (seriesId && item.seriesId && item.seriesId === seriesId) return item;
			if (
				seriesTitle &&
				String(item.seriesTitle || "").toLowerCase().trim() ===
					String(seriesTitle).toLowerCase().trim()
			) {
				return item;
			}
			continue;
		}
		if (contentId && item.contentId === contentId) return item;
		if (url && item.contentId === url) return item;
	}
	return null;
}

export const DownloadManager = {
	// durum sabitleri
	DOWNLOAD_STATUS,
	// yaşam döngüsü
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
	onProgress,
	onStatusChange,
	shouldAskBeforeDownload,
	findCompletedDownload,
	// yardımcılar (UI/test için)
	buildDownloadFileName,
	buildDownloadTargetPath,
	sanitizeFileName,
};

export default DownloadManager;
