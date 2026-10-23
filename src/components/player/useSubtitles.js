import { useEffect, useMemo, useState } from "react";
import { TextTrackType } from "react-native-video";

/**
 * Altyazı CDN'leri (örn. Dizilla -> pichive) User-Agent + Referer olmadan
 * 403 döner. Kaynak bu header'ları döndürmüyorsa tarayıcı UA'sı kullanılır.
 *
 * ⚠️ Harici altyazılar `react-native-video`'nun `textTracks` prop'una
 * VERİLMEZ: v6'nın TextTrack tipi header alanı desteklemiyor
 * ({ title, language, type, uri }), bu yüzden header gerektiren CDN'lerde
 * native istek 403 alır. Altyazılar bu katmanla `fetch` edilip kendi
 * overlay'ımızda çizilir.
 */
export const DEFAULT_SUBTITLE_UA =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

/**
 * Türkçe ses/altyazı mı? `language` ("tr", "tur", "turkish") veya başlık
 * ("Türkçe", "Turkish") üzerinden anlaşılır.
 */
const TURKISH_RE = /^(tr|tur|turkish)([-_].*)?$|t[uü]rk/i;
export function isTurkishTrack(track) {
	if (!track) return false;
	const lang = String(track.language || "").trim();
	if (lang && TURKISH_RE.test(lang)) return true;
	return TURKISH_RE.test(String(track.title || ""));
}

/**
 * Forced (zorunlu / yabancı dil) altyazı mı?
 *
 * ⚠️ `react-native-video` text track'lerinde `forced` alanı YOK; tespit
 * adlandırmaya dayanır: "Forced", "Zorunlu", "Yabancı", "Foreign" ya da
 * kaynak `forced: true` veriyorsa. Kaynağın farklı adlandırması varsa
 * `FORCED_RE`'ye eklenmeli.
 */
const FORCED_RE = /forced|zorunlu|yabanc[ıi]|foreign/i;
export function isForcedSubtitle(sub) {
	if (!sub) return false;
	if (sub.forced === true || sub.isForced === true) return true;
	if (FORCED_RE.test(`${sub.title || ""} ${sub.name || ""}`)) return true;
	return /forced/i.test(String(sub.uri || ""));
}

/** WebVTT / SRT zaman ayrıştırıcı (hh:mm:ss.mmm veya mm:ss.mmm) */
function parseTimestamp(timeStr) {
	if (!timeStr) return 0;
	const clean = timeStr.trim().replace(",", ".");
	const parts = clean.split(":");
	if (parts.length === 3) {
		const h = parseFloat(parts[0]) || 0;
		const m = parseFloat(parts[1]) || 0;
		const s = parseFloat(parts[2]) || 0;
		return h * 3600 + m * 60 + s;
	} else if (parts.length === 2) {
		const m = parseFloat(parts[0]) || 0;
		const s = parseFloat(parts[1]) || 0;
		return m * 60 + s;
	}
	return 0;
}

/**
 * WebVTT ve SRT altyazı metnini cue dizisine dönüştürür.
 *
 * ⚠️ `parseSubtitleContent` içinde iki ayrı format vardır (WebVTT ve SRT).
 * SRT'de satırlar arası boşluk YOKTUR; bu ayrım bozulursa çok satırlı
 * WebVTT cue'ları tek satıra çöker. `i++` ilerleyişi bilinçlidir.
 */
function parseSubtitleContent(content) {
	if (!content) return [];
	const cues = [];
	const lines = content
		.replace(/\r\n/g, "\n")
		.replace(/\r/g, "\n")
		.split("\n");
	let i = 0;

	while (i < lines.length) {
		const line = lines[i].trim();
		if (
			!line ||
			line.startsWith("WEBVTT") ||
			line.startsWith("NOTE") ||
			/^\d+$/.test(line)
		) {
			i++;
			continue;
		}

		if (line.includes("-->")) {
			const [startStr, endStr] = line.split("-->");
			const startTime = parseTimestamp(startStr);
			const endTime = parseTimestamp(endStr.trim().split(" ")[0]);

			i++;
			const textLines = [];
			while (i < lines.length && lines[i].trim() !== "") {
				const cleanText = lines[i].replace(/<[^>]*>/g, "").trim();
				if (cleanText) textLines.push(cleanText);
				i++;
			}

			if (textLines.length > 0 && endTime > startTime) {
				cues.push({ start: startTime, end: endTime, text: textLines.join("\n") });
			}
		} else {
			i++;
		}
	}
	return cues;
}

/**
 * ── `useSubtitles` ────────────────────────────────────────────
 *
 * Altyazı seçimi, indirme, ayrıştırma, zaman kaydırma ve stiller.
 *
 * Zaman kaydırma CloudStream'deki `subtitle_delay` karşılığıdır
 * (`±100ms` / `±1000ms` adımları). Altyazı oynatıcıdan AYRI çizildiği
 * için kaydırma `currentTime + subtitleOffset` ile hesaplanır — native
 * `TextRenderer.resetPosition` çağrısına gerek yoktur.
 */
/** `useMemo` bağımlılığı için kararlı boş dizi (her render'da yeni
 * referans üretmek `useMemo`'yu gereksizce geçersiz kılardı). */
const EMPTY_CUES = [];

export default function useSubtitles({
	currentSourceData,
	settings,
	currentTime,
	onResetOffset,
	// Aktif ses parçası (`{ language, title }`) — Türkçe sesde Forced mantığı için.
	audioTrack = null,
}) {
	const [userSubtitleChoice, setUserSubtitleChoice] = useState(undefined);
	const [streamTextTracks, setStreamTextTracks] = useState([]);
	const [parsedCues, setParsedCues] = useState([]);
	const [subtitleOffset, setSubtitleOffset] = useState(0);

	const externalSubtitles = useMemo(() => {
		const rawSubs = currentSourceData?.result?.subtitles || [];
		return rawSubs.map((sub, idx) => ({
			title: sub.name,
			language: /t[uü]rk/i.test(sub.name || "")
				? "tr"
				: sub.name?.toLowerCase()?.includes("eng")
					? "en"
					: "und",
			type:
				sub.url?.endsWith(".srt") || sub.url?.includes(".srt")
					? TextTrackType.SUBRIP
					: TextTrackType.VTT,
			uri: sub.url,
			index: idx,
			isExternal: true,
		}));
	}, [currentSourceData]);

	const allSubtitles = useMemo(() => {
		const combined = [...externalSubtitles];
		streamTextTracks.forEach((st) => {
			if (!combined.some((c) => c.title === st.title)) {
				combined.push({ ...st, isExternal: false });
			}
		});
		return combined;
	}, [externalSubtitles, streamTextTracks]);

	// Varsayılan altyazı otomatik seçimi (veya kullanıcı tercihi).
	const selectedSubtitle = useMemo(() => {
		if (userSubtitleChoice !== undefined) return userSubtitleChoice;

		/*
		 * ⭐ TÜRKÇE SES → yalnızca FORCED altyazı; yoksa altyazı KAPALI.
		 *
		 * Türkçe sesi izleyen kişiye tam Türkçe altyazı göstermek yerine
		 * yalnızca yabancı dil konuşmalarının çevirisi (forced) gösterilir.
		 * Forced yoksa `null` döner → altyazı kapalı. Bu TÜRETİLİR (effect
		 * yok): ses parçası `onLoad`dan sonra geldiğinde seçim kendiliğinden
		 * güncellenir. Kullanıcı elle seçtiyse üstteki satır onu korur.
		 *
		 * Not: Forced bir İngilizce parça Türkçe sesle seçilmez
		 * (yalnızca Türkçe veya dili belirsiz olanlar).
		 */
		if (isTurkishTrack(audioTrack)) {
			const forced = allSubtitles.filter(isForcedSubtitle);
			return (
				forced.find(isTurkishTrack) ||
				forced.find((sub) => !sub.language || sub.language === "und") ||
				null
			);
		}

		const defLang = settings?.defaultSubtitleLanguage;
		if (!defLang || defLang === "off") return null;

		const matches = allSubtitles.filter(
			(sub) =>
				sub.language?.toLowerCase() === defLang.toLowerCase() ||
				(defLang === "tr" &&
					(sub.title?.toLowerCase().includes("türk") ||
						sub.title?.toLowerCase().includes("turk"))) ||
				(defLang === "en" &&
					(sub.title?.toLowerCase().includes("ing") ||
						sub.title?.toLowerCase().includes("eng"))),
		);
		// Tam altyazı varsa onu, yalnızca forced varsa onu seç.
		return matches.find((sub) => !isForcedSubtitle(sub)) || matches[0] || null;
	}, [
		userSubtitleChoice,
		settings?.defaultSubtitleLanguage,
		allSubtitles,
		audioTrack,
	]);

	// Altyazı istekleri için header'lar: video ile AYNI olmalı.
	const subtitleHeaders = useMemo(() => {
		const result = currentSourceData?.result || {};
		const headers = { ...(result.headers || {}) };
		if (result.referer && !headers.Referer) {
			headers.Referer = result.referer;
		}
		if (headers.Cookie && typeof headers.Cookie === "object") {
			headers.Cookie = Object.entries(headers.Cookie)
				.map(([k, v]) => `${k}=${v}`)
				.join("; ");
		}
		if (!headers["User-Agent"]) headers["User-Agent"] = DEFAULT_SUBTITLE_UA;
		return headers;
	}, [currentSourceData]);

	/*
	 * Altyazı dosyası indir ve ayrıştır.
	 *
	 * ⚠️ `!uri` durumunda `setParsedCues([])` ÇAĞRILMAZ. Effect gövdesinde
	 * senkron `setState`, ardışık render tetikler (React'in
	 * `set-state-in-effect` kuralı). Bunun yerine `activeCues` aşağıda
	 * TÜRETİLİR: altyazı seçilmediyse sonuç zaten boştur.
	 */
	useEffect(() => {
		if (!selectedSubtitle?.uri) return;
		let isMounted = true;

		/*
		 * Yerel altyazı (çevrimdışı oynatma, Faz 5): uri `file://` ise RN
		 * fetch'in ağ katmanı Android'de bu scheme'i desteklemez → altyazı
		 * sessizce yüklenmezdi. Dosyayı `expo-file-system` okur ve metni
		 * aynı ayrıştırıcıya besler.
		 */
		const readFileText = async () => {
			if (selectedSubtitle.uri.startsWith("file://")) {
				const { readAsStringAsync } =
					await import("expo-file-system/legacy");
				return readAsStringAsync(selectedSubtitle.uri);
			}
			const res = await fetch(selectedSubtitle.uri, {
				headers: subtitleHeaders,
			});
			if (!res.ok) throw new Error("HTTP " + res.status);
			return res.text();
		};

		readFileText()
			.then((text) => {
				if (!isMounted) return;
				setParsedCues(parseSubtitleContent(text));
			})
			.catch((err) => {
				if (!isMounted) return;
				console.warn("Altyazı dosyası okunamadı:", err, selectedSubtitle.uri);
				setParsedCues([]);
			});
		return () => {
			isMounted = false;
		};
	}, [selectedSubtitle?.uri, subtitleHeaders]);

	/*
	 * Etkin cue listesi: altyazı seçilmemişse boş. Bu TÜRETİLİR, effect'te
	 * `setParsedCues([])` çağırmak yerine — bkz. yukarıdaki gerekçe.
	 */
	const activeCues = selectedSubtitle?.uri ? parsedCues : EMPTY_CUES;

	// Anlık altyazı metni (zaman kaydırma uygulanmış).
	const currentSubtitleText = useMemo(() => {
		if (activeCues.length === 0) return null;
		const adjustedTime = currentTime + subtitleOffset;
		if (adjustedTime < 0) return null;
		const matched = activeCues.find(
			(c) => adjustedTime >= c.start && adjustedTime <= c.end,
		);
		return matched ? matched.text : null;
	}, [activeCues, currentTime, subtitleOffset]);

	const selectSubtitle = (sub) => {
		setUserSubtitleChoice(sub);
		setSubtitleOffset(0);
		// Altyazı kapatılırsa cue'lar da temizlenir; `activeCues` zaten
		// boş döneceği için yalnızca depolama alanını boşaltıyoruz.
		if (!sub?.uri) setParsedCues([]);
	};

	const updateOffset = (delta, isReset = false) => {
		onResetOffset?.();
		if (isReset) {
			setSubtitleOffset(0);
		} else {
			setSubtitleOffset((prev) => Math.round((prev + delta) * 10) / 10);
		}
	};

	/** Elle seçimi sil → otomatik seçim (ses diline göre) yeniden devreye girer. */
	const resetUserChoice = () => {
		setUserSubtitleChoice(undefined);
		setSubtitleOffset(0);
	};

	const resetForNewSource = () => {
		setStreamTextTracks([]);
		setParsedCues([]);
		setUserSubtitleChoice(undefined);
		setSubtitleOffset(0);
	};

	return {
		allSubtitles,
		selectedSubtitle,
		currentSubtitleText,
		subtitleOffset,
		selectSubtitle,
		resetUserChoice,
		updateOffset,
		setStreamTextTracks,
		resetForNewSource,
	};
}