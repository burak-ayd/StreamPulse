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
import { Directory, File as ExpoFile } from "expo-file-system";
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

/** İndirme öğesinin varış yolunu (dosya adı + uzantıyla) döndürür. */
export function buildDownloadTargetPath(item, settings, ext = "mp4") {
	const dir = resolveBaseDirectory(settings.downloadPath);
	const fileName = `${buildDownloadFileName(item)}.${ext}`;
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
 * URL'nin HLS/M3U8 oynat listesi mi (plan §11)?
 */
function isHlsUrl(url) {
	return (
		(url || "").includes(".m3u8") ||
		(url || "").includes("/hls/") ||
		(url || "").includes("/hls2/") ||
		(url || "").includes(".urlset") ||
		(url || "").includes("master.txt")
	);
}

// ── HLS indirme — YEREL HLS KLASÖRÜ ─────────────────────────────────
//
// Neden tek dosya değil?
//   Bu ekosistemde (rapidrame vb.) master playlist'te ses AYRI rendition
//   olarak durur:
//     #EXT-X-MEDIA:TYPE=AUDIO,NAME="Türkçe",LANGUAGE="tr",URI="…audio.m3u8"
//     #EXT-X-STREAM-INF:…AUDIO="audio0" / video.m3u8
//   Video segmentleri yalnızca görüntü + (varsa) orijinal sesi taşır;
//   Türkçe dublaj ayrı segmentlerdedir. Bunları tek dosyada birleştirmek
//   muxing ister (CloudStream bunu FFmpeg ile yapar). RN'de muxer yok.
//
// Bu yüzden indirme, HLS'i olduğu gibi diske alır: master.m3u8 + video.m3u8
// + audio.m3u8 + segment dosyaları. Playlist'ler YERELLEŞTİRİLİR (URI'ler
// yerel dosya adlarına çevrilir) ve oynatıcı yerel master.m3u8'i açar —
// ExoPlayer yerel HLS'te de tüm ses parçalarını görür/seçtirir, yani
// "izlerken ne görüyorsam indirirken de aynısı" doğal olarak sağlanır.
//
// Yan faydalar:
//   • İlerleme SEGMENT SAYISINA göre → dalgalanmayan, kesin tamamlanan yüzde.
//   • Segmentler ayrı dosya → Append/Truncate gerekmez (SAF dostu),
//     duraklat/devam = var olan dosyaları atla.
//   • Bitişte toplam boyut segment dosyalarının gerçek toplamıdır.

/** Metin isteği + zaman sınırı. */
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

/** Base URL'e göre göreli oynat listesi adresini çözer. */
function resolveUrl(base, rel) {
	const relative = String(rel || "").trim();
	if (!relative) return base;
	if (/^https?:/i.test(relative)) return relative;
	if (relative.startsWith("/")) {
		const m = base.match(/^https?:\/\/[^/]+/);
		return m ? `${m[0]}${relative}` : relative;
	}
	return `${base.replace(/[^/]*$/, "")}${relative}`;
}

/**
 * Master playlist'i çözer: video varyantları + ses rendition'ları.
 * @returns {{variants: Array, audioTracks: Array}}
 */
function parseMasterPlaylist(text, baseUrl) {
	const lines = text.split(/\r?\n/);
	const variants = [];
	const audioTracks = [];
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i].trim();
		if (line.startsWith("#EXT-X-MEDIA")) {
			const type = (line.match(/TYPE=([A-Z-]+)/) || [])[1];
			if (type !== "AUDIO") continue;
			const uriM = line.match(/URI="([^"]+)"/);
			if (!uriM) continue;
			audioTracks.push({
				name: (line.match(/NAME="([^"]*)"/) || [])[1] || "Ses",
				language:
					(line.match(/LANGUAGE="([^"]*)"/) || [])[1]?.toLowerCase() || null,
				group: (line.match(/GROUP-ID="([^"]*)"/) || [])[1] || null,
				isDefault: /DEFAULT=YES/i.test(line),
				url: resolveUrl(baseUrl, uriM[1]),
			});
			continue;
		}
		if (!line.startsWith("#EXT-X-STREAM-INF")) continue;
		const bandwidth = Number((line.match(/BANDWIDTH=(\d+)/) || [])[1] || 0);
		const resolution = (line.match(/RESOLUTION=(\d+x\d+)/) || [])[1] || null;
		let j = i + 1;
		while (
			j < lines.length &&
			(!lines[j].trim() || lines[j].trim().startsWith("#"))
		) {
			j++;
		}
		if (j < lines.length) {
			variants.push({
				url: resolveUrl(baseUrl, lines[j]),
				bandwidth,
				resolution,
				audioGroup: (line.match(/AUDIO="([^"]*)"/) || [])[1] || null,
				codecs: (line.match(/CODECS="([^"]*)"/) || [])[1] || null,
				frameRate: (line.match(/FRAME-RATE=([\d.]+)/) || [])[1] || null,
			});
		}
	}
	return { variants, audioTracks };
}

/** Media playlist'ten segmentleri + şifre/format bilgilerini çıkarır. */
function parseMediaPlaylist(text, baseUrl) {
	const segments = [];
	let encrypted = false;
	let isFmp4 = false;
	let totalDuration = 0;
	let pendingByterange = null;
	let currentDur = 0;
	for (const raw of text.split(/\r?\n/)) {
		const line = raw.trim();
		if (!line) continue;
		if (line.startsWith("#EXT-X-KEY")) {
			const method = (line.match(/METHOD=([A-Za-z0-9-]+)/) || [])[1] || "NONE";
			if (method !== "NONE") encrypted = true;
		} else if (line.startsWith("#EXT-X-MAP")) {
			isFmp4 = true;
			const uriM = line.match(/URI="([^"]+)"/);
			if (uriM) {
				segments.push({ url: resolveUrl(baseUrl, uriM[1]), init: true, duration: 0 });
			}
		} else if (line.startsWith("#EXTINF")) {
			currentDur = parseFloat(
				(line.match(/#EXTINF:([\d.]+)/) || [])[1] || "0",
			);
		} else if (line.startsWith("#EXT-X-BYTERANGE")) {
			const m = line.match(/#EXT-X-BYTERANGE:(\d+)(?:@(\d+))?/);
			if (m) {
				pendingByterange = {
					length: Number(m[1]),
					start: m[2] !== undefined ? Number(m[2]) : null,
				};
			}
		} else if (!line.startsWith("#")) {
			const seg = { url: resolveUrl(baseUrl, line), duration: currentDur };
			currentDur = 0;
			totalDuration += seg.duration;
			if (pendingByterange) {
				seg.byterange = pendingByterange;
				pendingByterange = null;
			}
			segments.push(seg);
		}
	}
	return { segments, encrypted, isFmp4, totalDuration };
}

/**
 * Tek segmenti doğrudan hedef dosyaya indirir (native akış, JS belleğine
 * içerik girmez — eski arrayBuffer yolu OOM üretiyordu).
 */
async function fetchSegmentToDisk(segment, headers, destUri) {
	const dest = new ExpoFile(destUri);
	return await ExpoFile.downloadFileAsync(segment.url, dest, {
		idempotent: true,
		headers,
	});
}

/** Geçici ağ hatalarına dayanıklı segment indirme (dest'e yazar). */
async function fetchSegmentWithRetry(segment, headers, destUri, attempts = 3) {
	let sonHata = null;
	for (let deneme = 1; deneme <= attempts; deneme++) {
		try {
			return await fetchSegmentToDisk(segment, headers, destUri);
		} catch (e) {
			sonHata = e;
			console.warn(
				`Segment fetch deneme ${deneme}/${attempts} başarısız:`,
				e?.message,
			);
			await new Promise((r) => setTimeout(r, 1000 * deneme));
		}
	}
	throw sonHata;
}

/** Dosyaya metin yazar (varsa üzerine, yoksa oluşturur). SAF uyumlu. */
function writeTextFile(uri, text) {
	const f = new ExpoFile(uri);
	try {
		if (!f.exists) f.create({ intermediates: true });
	} catch (e) {
		void e;
	}
	f.write(text);
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

/** Media playlist metnini, segment URI'lerini yerel dosya adlarına çevirerek üretir. */
function buildLocalMediaPlaylist({ segments, localNames, headerTags }) {
	const out = ["#EXTM3U", ...headerTags];
	segments.forEach((seg, idx) => {
		if (seg.init) return; // init segment ayrıca ele alınır
		out.push(`#EXTINF:${seg.duration.toFixed(3)},`);
		out.push(localNames[idx]);
	});
	out.push("#EXT-X-ENDLIST");
	return out.join("\n");
}

/**
 * Playlist'in başlık etiketlerini (VERSION/TARGETDURATION/…) korur.
 */
function playlistHeaderTags(text) {
	return text
		.split(/\r?\n/)
		.map((l) => l.trim())
		.filter(
			(l) =>
				l.startsWith("#EXT-X-VERSION") ||
				l.startsWith("#EXT-X-TARGETDURATION") ||
				l.startsWith("#EXT-X-MEDIA-SEQUENCE") ||
				l.startsWith("#EXT-X-DISCONTINUITY-SEQUENCE") ||
				l.startsWith("#EXT-X-PLAYLIST-TYPE"),
		);
}

/**
 * HLS akışını yerel klasöre indirir.
 * @returns {Promise<{dirUri: string, masterUri: string, totalBytes: number}>}
 */
async function runHlsDownload(item) {
	const headers = normalizeHeaders(item.sourceHeaders);

	// 1) Master → en yüksek kaliteli varyant + ses rendition'ları
	const masterText = await fetchText(item.sourceUrl, headers);
	const { variants, audioTracks } = masterText.includes("#EXT-X-STREAM-INF")
		? parseMasterPlaylist(masterText, item.sourceUrl)
		: { variants: [], audioTracks: [] };

	const bestVariant = variants.length
		? variants.reduce((a, b) => (b.bandwidth > a.bandwidth ? b : a))
		: null;
	const videoPlaylistUrl = bestVariant?.url || item.sourceUrl;

	// Seçilen ses dili: kullanıcı tercihi → yoksa DEFAULT rendition
	const wantedLang = (item.audioLanguage || "").toLowerCase();
	let audioTrack = null;
	if (audioTracks.length) {
		audioTrack =
			(wantedLang && audioTracks.find((t) => t.language === wantedLang)) ||
			audioTracks.find((t) => t.isDefault) ||
			audioTracks[0];
	}

	// 2) Oynat listeleri
	const videoText = await fetchText(videoPlaylistUrl, headers);
	const videoPlaylist = parseMediaPlaylist(videoText, videoPlaylistUrl);
	if (!videoPlaylist.segments.length) {
		throw new Error("HLS oynat listesinde segment bulunamadı");
	}
	if (videoPlaylist.encrypted) {
		const err = new Error(
			"Bu akış şifreli (AES-128); şifreli HLS indirme desteklenmiyor.",
		);
		err.errorCode = "HLS_ENCRYPTED";
		throw err;
	}
	let audioPlaylist = null;
	let audioPlaylistText = "";
	if (audioTrack) {
		audioPlaylistText = await fetchText(audioTrack.url, headers);
		audioPlaylist = parseMediaPlaylist(audioPlaylistText, audioTrack.url);
		if (audioPlaylist.encrypted) {
			const err = new Error(
				"Bu akışın ses parçası şifreli (AES-128); indirme desteklenmiyor.",
			);
			err.errorCode = "HLS_ENCRYPTED";
			throw err;
		}
	}

	// 3) Hedef klasör — içerik başına tek klasör
	const settings = await getDownloadSettings();
	const base = resolveBaseDirectory(settings.downloadPath);
	const folderName = sanitizeFileName(item.seriesTitle || item.contentTitle);
	const dirUri = `${base.full}${folderName}/`;
	const dir = new Directory(dirUri);
	try {
		dir.create({ intermediates: true, idempotent: true });
	} catch (e) {
		// zaten varsa sorun değil
		void e;
	}

	// 4) İndirilecek işler: video segmentleri + ses segmentleri
	const videoJobs = videoPlaylist.segments
		.filter((s) => !s.init)
		.map((seg, idx) => ({ seg, name: `v${String(idx + 1).padStart(5, "0")}.ts` }));
	const audioJobs = audioPlaylist
		? audioPlaylist.segments
				.filter((s) => !s.init)
				.map((seg, idx) => ({ seg, name: `a${String(idx + 1).padStart(5, "0")}.ts` }))
		: [];
	const allJobs = [...videoJobs, ...audioJobs];

	// Duraklat/devam: var olan segment dosyaları atlanır (kendini onaran resume)
	let done = 0;
	let written = 0;
	for (const job of allJobs) {
		const f = new ExpoFile(`${dirUri}${job.name}`);
		if (f.exists) {
			done += 1;
			written += f.size || 0;
		}
	}
	item.totalBytes = 0;
	item.downloadedBytes = written;
	item.progress = allJobs.length ? done / allJobs.length : 0;
	if (done > 0) {
		emitProgress(item);
		await persist(item, { force: true });
	}

	const tempoDir = `${FileSystem.documentDirectory || FileSystem.cacheDirectory}${TEMP_DIR_NAME}/`;
	await FileSystem.makeDirectoryAsync(tempoDir, { intermediates: true }).catch(() => {});

	for (const job of allJobs) {
		if (item.status !== DOWNLOAD_STATUS.DOWNLOADING) {
			await persist(item, { force: true });
			return;
		}
		const destUri = `${dirUri}${job.name}`;
		const target = new ExpoFile(destUri);
		if (target.exists) continue; // bu turda zaten indirildi
		// Önce geçici dosyaya indir, sonra hedefe taşı: yarım kalan segment
		// "var" sayılıp bozuk içerikle oynatılmasın.
		const tempUri = `${tempoDir}${item.id}-${job.name}`;
		const indirilen = await fetchSegmentWithRetry(job.seg, headers, tempUri, 3);
		try {
			const hedef = new ExpoFile(destUri);
			if (hedef.exists) hedef.delete();
			await indirilen.move(hedef);
		} catch (moveErr) {
			console.warn("Segment taşınamadı, yerinde kullanılacak:", moveErr?.message);
			// taşınamazsa geçici dosya zaten indirildi; hedef adıyla kopyala
			try {
				await FileSystem.moveAsync({ from: tempUri, to: destUri });
			} catch (_e) {
				/* bir sonraki turda yeniden denenecek */
			}
		}
		done += 1;
		try {
			written += new ExpoFile(destUri).size || 0;
		} catch (_e) {
			/* boyut okunamazsa sayaç değişmez */
		}
		item.downloadedBytes = written;
		item.progress = Math.min(0.99, done / allJobs.length);
		item.resumable = true;
		item.lastResumeOffset = done;
		emitProgress(item);
		await persist(item);
		await new Promise((r) => setTimeout(r, 15));
	}

	// 5) Yerelleştirilmiş playlist'ler
	const videNames = videoPlaylist.segments.map((s, idx) =>
		s.init ? "init.mp4" : videoJobs.find((j) => j.seg === s)?.name || `v${idx + 1}.ts`,
	);
	const videoLocal = buildLocalMediaPlaylist({
		segments: videoPlaylist.segments,
		localNames: videNames,
		headerTags: playlistHeaderTags(videoText),
	});
	writeTextFile(`${dirUri}video.m3u8`, videoLocal);

	let masterLines = ["#EXTM3U", "#EXT-X-VERSION:3"];
	if (audioPlaylist) {
		const audioNames = audioPlaylist.segments.map(
			(s, idx) => audioJobs.find((j) => j.seg === s)?.name || `a${idx + 1}.ts`,
		);
		const audioLocal = buildLocalMediaPlaylist({
			segments: audioPlaylist.segments,
			localNames: audioNames,
			headerTags: playlistHeaderTags(audioPlaylistText),
		});
		writeTextFile(`${dirUri}audio.m3u8`, audioLocal);
		masterLines.push(
			`#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio0",NAME="${audioTrack.name}",LANGUAGE="${audioTrack.language || "und"}",DEFAULT=YES,AUTOSELECT=YES,CHANNELS="2",URI="audio.m3u8"`,
		);
	}
	const bandwidth = bestVariant?.bandwidth || 2000000;
	const resolutionAttr = bestVariant?.resolution
		? `,RESOLUTION=${bestVariant.resolution}`
		: "";
	const codecsAttr = bestVariant?.codecs ? `,CODECS="${bestVariant.codecs}"` : "";
	const audioAttr = audioPlaylist ? ',AUDIO="audio0"' : "";
	masterLines.push(
		`#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth}${resolutionAttr}${codecsAttr}${audioAttr}`,
		"video.m3u8",
	);
	const masterUri = `${dirUri}master.m3u8`;
	writeTextFile(masterUri, masterLines.join("\n"));

	// 6) Gerçek toplam boyut: segment dosyalarının toplamı
	let toplam = 0;
	for (const job of allJobs) {
		try {
			toplam += new ExpoFile(`${dirUri}${job.name}`).size || 0;
		} catch (_e) {
			/* okunamayan dosya yok sayılır */
		}
	}
	return {
		dirUri,
		masterUri,
		totalBytes: toplam,
		ext: "m3u8",
	};
}

/**
 * modal için: HLS kaynağının ses parçalarını listeler.
 * @returns {Promise<Array<{name, language, isDefault}>>}
 */
async function listHlsAudioTracks(sourceUrl, headers) {
	try {
		const text = await fetchText(sourceUrl, normalizeHeaders(headers), 20000);
		if (!text.includes("#EXT-X-MEDIA")) return [];
		const { audioTracks } = parseMasterPlaylist(text, sourceUrl);
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
 *
 * Dallanma: HLS/M3U8 → segment indirme döngüsü (`runHlsDownload`);
 * düz URL → DownloadResumable (HTTP Range ile duraklat/devam).
 */
async function runDownload(item) {
	if (!initialized) {
		item.status = DOWNLOAD_STATUS.FAILED;
		item.error = "DownloadManager henüz başlatılmadı";
		item.errorCode = "HTTP_ERROR";
		emitStatus(item, DOWNLOAD_STATUS.QUEUED);
		return;
	}

	const isHls = isHlsUrl(item.sourceUrl);

	setStatus(item, DOWNLOAD_STATUS.DOWNLOADING);
	await persist(item, { force: true });

	try {
		// Kısmi dosyalar için temp klasör
		const base = FileSystem.documentDirectory || FileSystem.cacheDirectory;
		const tempDir = `${base}${TEMP_DIR_NAME}/`;
		await FileSystem.makeDirectoryAsync(tempDir, { intermediates: true }).catch(() => {});
		const tempUri = `${tempDir}${item.id}.part`;

		const settings = await getDownloadSettings();

		let ext = "mp4";
		let hlsResult = null;
		if (isHls) {
			hlsResult = await runHlsDownload(item);
			// Segment sınırında duraklatıldı/iptal edildi: döngü temiz döndü.
			if (item.status !== DOWNLOAD_STATUS.DOWNLOADING) {
				pump();
				return;
			}
		} else {
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
		}

		let targetPath;
		if (isHls) {
			// HLS: çıktı bir KLASÖR (master.m3u8 + video/audio playlist + segmentler).
			// Klasör zaten yerinde; taşıma yok. Altyazı klasör içine yazılır.
			targetPath = hlsResult.masterUri;
			item.isHlsFolder = true;
			item.hlsDir = hlsResult.dirUri;
			item.totalBytes = hlsResult.totalBytes || 0;
			if (item.subtitleUrl && item.downloadSubtitle !== false) {
				const subPath = `${hlsResult.dirUri}subtitle.vtt`;
				try {
					const subResult = await FileSystem.downloadAsync(
						item.subtitleUrl,
						subPath,
					);
					item.subtitlePath = subResult?.uri || subPath;
				} catch (subErr) {
					console.warn("Altyazı indirilemedi:", subErr?.message);
				}
			}
		} else {
			// Varış yolunu (gerçek uzantıyla) hazırla ve dosyayı taşı
			targetPath = buildDownloadTargetPath(item, settings, ext);
			const targetDir = targetPath.substring(0, targetPath.lastIndexOf("/") + 1);
			await FileSystem.makeDirectoryAsync(targetDir, { intermediates: true }).catch(() => {});
			try {
				await FileSystem.moveAsync({ from: tempUri, to: targetPath });
			} catch (moveErr) {
				// Aynı isimde tamamlanmış dosya varsa üzerine yaz (yeniden indirme)
				void moveErr;
				await FileSystem.deleteAsync(targetPath, { idempotent: true }).catch(() => {});
				await FileSystem.moveAsync({ from: tempUri, to: targetPath });
			}

			// Altyazı (varsa ve istendiyse): aynı adla .srt
			if (item.subtitleUrl && item.downloadSubtitle !== false) {
				const subtitlePath = targetPath.replace(/\.[a-z0-9]+$/i, ".srt");
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
		}

		setStatus(item, DOWNLOAD_STATUS.COMPLETED, {
			progress: 1,
			filePath: targetPath,
			resumable: true,
			lastResumeOffset: 0,
			_resumableState: null,
			_hlsState: null,
		});
		await persist(item, { force: true });
		// Otomatik dışa aktarma (#1): kullanıcı bir klasör seçtiyse tamamlanan
		// indirme oraya kopyalanır (oynatma kopyası uygulama deposunda kalır).
		try {
			const ayarlar = await getDownloadSettings();
			if (ayarlar.downloadDirUri && ayarlar.autoExport !== false) {
				await exportDownload(item.id);
			}
		} catch (e) {
			console.warn("Otomatik dışa aktarma atlandı:", e?.message);
		}
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
				errorCode: err?.errorCode || classifyError(err),
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
		// Eski sürümün "pending" yer tutucuları (gerçek indirme motoru yokken
		// yazılan kayıtlar) kuyruğa alınmaz — aksi halde "Hata" kartı olarak
		// görünürlerdi.
		if (raw.status === "pending") continue;
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
		audioTrack: spec.audioLanguage
			? String(spec.audioLanguage)
			: spec.audioTrack || null,
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
 * Tamamlanmış indirmeyi kullanıcının seçtiği klasöre (SAF) kopyalar (#1).
 *
 * ⚠️ Neden "taşı" değil "kopyala"? HLS indirmesi çok sayıda segment
 * dosyasından oluşur ve oynatıcı bunları `content://` altında güvenilir
 * biçimde çözemez. Bu yüzden oynatılabilir kopya uygulama deposunda
 * kalır, dışa aktarılan kopya kullanıcının "İndirilenler" klasöründe
 * görünür (bilgisayardan/başka uygulamadan erişilebilir).
 *
 * @returns {Promise<boolean>} kopyalama başarılı mı
 */
async function exportDownload(downloadId) {
	const item = items.get(downloadId);
	if (!item || item.status !== DOWNLOAD_STATUS.COMPLETED) return false;
	const settings = await getDownloadSettings();
	if (!settings.downloadDirUri) return false;
	try {
		const hedefKok = new Directory(settings.downloadDirUri);
		if (item.isHlsFolder && item.hlsDir) {
			const kaynak = new Directory(item.hlsDir);
			const hedefAd = sanitizeFileName(
				`${item.seriesTitle || item.contentTitle}-S${pad2(item.seasonNumber)}xE${pad2(item.episodeNumber)}`,
			).replace(/-S00xE00$/, "");
			const hedefDir = new Directory(hedefKok, hedefAd || item.id);
			if (!hedefDir.exists) {
				hedefDir.create({ intermediates: true, idempotent: true });
			}
			for (const entry of kaynak.list()) {
				const dst = new ExpoFile(hedefDir, entry.name);
				if (dst.exists) continue;
				await entry.copy(dst);
			}
			return true;
		}
		if (item.filePath) {
			const src = new ExpoFile(item.filePath);
			const dst = new ExpoFile(hedefKok, src.name);
			if (!dst.exists) await src.copy(dst);
			return true;
		}
	} catch (e) {
		console.warn("Dışa aktarma hatası:", e?.message);
	}
	return false;
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
	// HLS indirmeleri bir KLASÖR oluşturur (master.m3u8 + segmentler):
	// kayıt silinince klasör de silinmeli, aksi halde disk şişer.
	if (item.hlsDir) {
		try {
			await FileSystem.deleteAsync(item.hlsDir, { idempotent: true });
		} catch (_e) {
			/* klasör yoksa sorun değil */
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
	listHlsAudioTracks,
	exportDownload,
	// yardımcılar (UI/test için)
	buildDownloadFileName,
	buildDownloadTargetPath,
	sanitizeFileName,
};

export default DownloadManager;
