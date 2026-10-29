/*
 * HLS oynat listesi çözümleme — saf modül (I/O yok).
 * `downloadManager.js`'ten taşındı; native engine ile aynı kurallar
 * (genişletilmiş HlsPlanner'ın JS ikizi).
 */

/** Base URL'e göre göreli oynat listesi adresini çözer. */
export function resolveUrl(base, rel) {
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
export function parseMasterPlaylist(text, baseUrl) {
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
export function parseMediaPlaylist(text, baseUrl) {
	const segments = [];
	let encrypted = false;
	let isFmp4 = false;
	let totalDuration = 0;
	let pendingByterange = null;
	let currentDur = 0;
	let nextIsDiscontinuity = false;
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
				segments.push({
					url: resolveUrl(baseUrl, uriM[1]),
					init: true,
					duration: 0,
				});
			}
		} else if (
			line.startsWith("#EXT-X-DISCONTINUITY") &&
			!line.startsWith("#EXT-X-DISCONTINUITY-SEQUENCE")
		) {
			// sonraki segmentte işaretlenir
			nextIsDiscontinuity = true;
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
			const seg = {
				url: resolveUrl(baseUrl, line),
				duration: currentDur,
				discontinuity: nextIsDiscontinuity,
			};
			currentDur = 0;
			nextIsDiscontinuity = false;
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
