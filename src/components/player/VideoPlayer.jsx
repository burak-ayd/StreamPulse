import { usePlayerSettings } from "@/context/PlayerSettingsContext";
import {
	addToWatchHistory,
	markEpisodeComplete,
	removeContinueWatching,
	saveContinueWatching,
} from "@/utils/storage";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import * as ScreenOrientation from "expo-screen-orientation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	ActivityIndicator,
	BackHandler,
	Dimensions,
	PanResponder,
	Platform,
	Pressable,
	StatusBar,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Video, { TextTrackType } from "react-native-video";
import TVPressable from "../common/TVPressable";
import { useTVRemote } from "@/hooks/useTVRemote";
import TrackSelectionModal from "./TrackSelectionModal";

// Altyazı CDN'leri (örn. Dizilla -> pichive) User-Agent + Referer olmadan 403 döner.
// Kaynak bu header'ları döndürmüyorsa yedek olarak tarayıcı UA'sı kullanılır.
const DEFAULT_SUBTITLE_UA =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

function formatTime(seconds) {
	if (!seconds || isNaN(seconds) || seconds < 0) return "00:00";
	const totalSecs = Math.floor(seconds);
	const hrs = Math.floor(totalSecs / 3600);
	const mins = Math.floor((totalSecs % 3600) / 60);
	const secs = totalSecs % 60;

	if (hrs > 0) {
		return `${hrs}:${mins < 10 ? "0" : ""}${mins}:${secs < 10 ? "0" : ""}${secs}`;
	}
	return `${mins < 10 ? "0" : ""}${mins}:${secs < 10 ? "0" : ""}${secs}`;
}

// WebVTT / SRT zaman ayrıştırıcı (hh:mm:ss.mmm veya mm:ss.mmm)
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

// WebVTT ve SRT altyazı metnini cue dizisine dönüştürür
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
				cues.push({
					start: startTime,
					end: endTime,
					text: textLines.join("\n"),
				});
			}
		} else {
			i++;
		}
	}
	return cues;
}

export default function VideoPlayer({
	sources = [],
	title = "",
	subtitle = "",
	poster = null,
	onClose,
	onProgressUpdate,
	initialTime = 0,
	contentId = null,
	contentType = "movie",
	seriesInfo = null,
	targetUrl = "",
	plugin = null,
}) {
	const insets = useSafeAreaInsets();
	const videoRef = useRef(null);
	const { settings } = usePlayerSettings();

	const lastSavedTimeRef = useRef(0);
	const currentTimeRef = useRef(0);
	const hasMarkedCompleteRef = useRef(false);

	useEffect(() => {
		hasMarkedCompleteRef.current = false;
		lastSavedTimeRef.current = 0;
	}, [targetUrl, seriesInfo?.episode, seriesInfo?.season]);

	const seekDuration = settings?.seekDuration || 10;
	const hideTimeoutMs = (settings?.controlsTimeout || 4) * 1000;

	// Player state
	const [activeSourceIndex, setActiveSourceIndex] = useState(0);
	const [paused, setPaused] = useState(false);
	const [currentTime, setCurrentTime] = useState(0);
	const [duration, setDuration] = useState(0);
	const [playableDuration, setPlayableDuration] = useState(0);
	const [isLoading, setIsLoading] = useState(true);
	const [isBuffering, setIsBuffering] = useState(false);
	const [hasError, setHasError] = useState(false);
	const [errorMessage, setErrorMessage] = useState("");
	const [resizeMode, setResizeMode] = useState(
		settings?.defaultResizeMode || "contain",
	); // 'contain' | 'cover'
	const [isLocked, setIsLocked] = useState(false);
	const [showControls, setShowControls] = useState(true);
	const [isLandscape, setIsLandscape] = useState(true); // Her zaman yatay başlat

	// Double tap feedback
	const [doubleTapInfo, setDoubleTapInfo] = useState(null); // { type: 'rewind' | 'forward' }
	const lastTapRef = useRef({ time: 0, x: 0 });

	// Saved seek time when switching source
	const pendingSeekTimeRef = useRef(initialTime || 0);

	// Tracks & Subtitles state
	const [modalType, setModalType] = useState(null); // 'sources' | 'subtitles' | 'audio' | null
	const [availableAudioTracks, setAvailableAudioTracks] = useState([]);
	const [selectedAudioTrackIndex, setSelectedAudioTrackIndex] =
		useState(null);
	const [userSubtitleChoice, setUserSubtitleChoice] = useState(undefined);
	const [streamTextTracks, setStreamTextTracks] = useState([]);
	const [overrideType, setOverrideType] = useState(null);
	const formatRetryRef = useRef(false);

	// Altyazı Cueleri & Senkronizasyon (Gecikme) Ayarı
	const [parsedCues, setParsedCues] = useState([]);
	const [subtitleOffset, setSubtitleOffset] = useState(0); // saniye cinsinden (+/-)

	// 1. Sayaç Yönetimi (Tek ve Güvenli Fonksiyon)
	const hideTimerRef = useRef(null);

	const startHideTimer = useCallback(() => {
		if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
		hideTimerRef.current = setTimeout(() => {
			setShowControls(false);
		}, hideTimeoutMs);
	}, [hideTimeoutMs]);

	// showControls veya paused değiştikçe sayacı senkronize et
	useEffect(() => {
		if (showControls && !paused && !isLocked) {
			startHideTimer();
		} else {
			if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
		}
		return () => {
			if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
		};
	}, [showControls, paused, isLocked, startHideTimer]);

	// Current active source object
	const currentSourceData = useMemo(() => {
		return sources[activeSourceIndex] || null;
	}, [sources, activeSourceIndex]);

	// Temiz kaynak adı (Örn: "HDFilmCehennemi | Close" -> "Close")
	const sourceDisplayName = useMemo(() => {
		const raw =
			currentSourceData?.result?.name ||
			currentSourceData?.extractor ||
			"Kaynak";
		if (raw.includes("|")) {
			const parts = raw.split("|");
			return parts[parts.length - 1].trim();
		}
		return raw;
	}, [currentSourceData]);

	// Format Subtitles list: Combine external API subtitles + HLS stream text tracks
	const externalSubtitles = useMemo(() => {
		const rawSubs = currentSourceData?.result?.subtitles || [];
		return rawSubs.map((sub, idx) => ({
			title: sub.name,
			language: sub.name?.toLowerCase()?.includes("turk")
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
			// Avoid duplicates if title matches
			if (!combined.some((c) => c.title === st.title)) {
				combined.push({
					...st,
					isExternal: false,
				});
			}
		});
		return combined;
	}, [externalSubtitles, streamTextTracks]);

	// Varsayılan Altyazı Dili Otomatik Seçimi (veya kullanıcının manuel tercihi)
	const selectedSubtitle = useMemo(() => {
		if (userSubtitleChoice !== undefined) {
			return userSubtitleChoice;
		}
		const defLang = settings?.defaultSubtitleLanguage;
		if (!defLang || defLang === "off") return null;

		return (
			allSubtitles.find(
				(sub) =>
					sub.language?.toLowerCase() === defLang.toLowerCase() ||
					(defLang === "tr" &&
						(sub.title?.toLowerCase().includes("türk") ||
							sub.title?.toLowerCase().includes("turk"))) ||
					(defLang === "en" &&
						(sub.title?.toLowerCase().includes("ing") ||
							sub.title?.toLowerCase().includes("eng"))),
			) || null
		);
	}, [userSubtitleChoice, settings?.defaultSubtitleLanguage, allSubtitles]);

	// Altyazı istekleri için header'lar: video ile AYNI olmalı.
	// Dizilla (pichive) gibi kaynaklarda User-Agent + Referer eksikse CDN 403 döner.
	const subtitleHeaders = useMemo(() => {
		const result = currentSourceData?.result || {};
		const headers = { ...(result.headers || {}) };

		if (result.referer && !headers.Referer) {
			headers.Referer = result.referer;
		}

		// Cookie nesnesi fetch'te string bekler
		if (headers.Cookie && typeof headers.Cookie === "object") {
			headers.Cookie = Object.entries(headers.Cookie)
				.map(([k, v]) => `${k}=${v}`)
				.join("; ");
		}

		if (!headers["User-Agent"]) {
			headers["User-Agent"] = DEFAULT_SUBTITLE_UA;
		}

		return headers;
	}, [currentSourceData]);

	// Altyazı dosyası değiştiğinde VTT/SRT içeriğini indirip ayrıştır
	useEffect(() => {
		if (!selectedSubtitle?.uri) return;

		let isMounted = true;
		fetch(selectedSubtitle.uri, { headers: subtitleHeaders })
			.then((res) => {
				if (!res.ok) throw new Error("HTTP " + res.status);
				return res.text();
			})
			.then((text) => {
				if (!isMounted) return;
				const cues = parseSubtitleContent(text);
				setParsedCues(cues);
			})
			.catch((err) => {
				if (!isMounted) return;
				console.warn(
					"Altyazı dosyası okunamadı:",
					err,
					selectedSubtitle.uri,
				);
				setParsedCues([]);
			});

		return () => {
			isMounted = false;
		};
	}, [selectedSubtitle?.uri, subtitleHeaders]);

	// Anlık altyazı metni (subtitleOffset ile gecikme/ilerleme eklenmiş)
	const currentSubtitleText = useMemo(() => {
		if (parsedCues.length === 0) return null;
		const adjustedTime = currentTime + subtitleOffset;
		if (adjustedTime < 0) return null;

		const matched = parsedCues.find(
			(c) => adjustedTime >= c.start && adjustedTime <= c.end,
		);
		return matched ? matched.text : null;
	}, [parsedCues, currentTime, subtitleOffset]);

	const handleUpdateSubtitleOffset = useCallback(
		(delta, isReset = false) => {
			startHideTimer();
			if (isReset) {
				setSubtitleOffset(0);
			} else {
				setSubtitleOffset(
					(prev) => Math.round((prev + delta) * 10) / 10,
				);
			}
		},
		[startHideTimer],
	);

	// Dinamik Altyazı Stilleri (Ayarlardan Alınır)
	const subtitleBgStyle = useMemo(() => {
		switch (settings?.subtitleBgColor) {
			case "solid-black":
				return { backgroundColor: "#000000" };
			case "blur":
				return { backgroundColor: "rgba(25, 27, 34, 0.92)" };
			case "transparent":
				return { backgroundColor: "transparent" };
			case "semi-black":
			default:
				return { backgroundColor: "rgba(0, 0, 0, 0.78)" };
		}
	}, [settings?.subtitleBgColor]);

	const subtitleTextStyle = useMemo(() => {
		const fontSize = settings?.subtitleFontSize || 16;
		const color = settings?.subtitleTextColor || "#FFFFFF";
		const hasShadow = settings?.subtitleTextShadow !== false;
		return {
			fontSize,
			lineHeight: Math.round(fontSize * 1.35),
			color,
			textShadowColor: hasShadow ? "rgba(0, 0, 0, 0.95)" : "transparent",
			textShadowOffset: { width: 0, height: 1 },
			textShadowRadius: hasShadow ? 3 : 0,
		};
	}, [
		settings?.subtitleFontSize,
		settings?.subtitleTextColor,
		settings?.subtitleTextShadow,
	]);

	// Build video source object for react-native-video
	const videoSource = useMemo(() => {
		if (!currentSourceData?.result?.url) return null;

		const streamUrl = currentSourceData.result.url;
		const rawHeaders = currentSourceData.result.headers || {};
		const headers = { ...rawHeaders };

		if (currentSourceData.result.referer && !headers.Referer) {
			headers.Referer = currentSourceData.result.referer;
		}

		// Altyazı veya video CDN'leri User-Agent olmadan 403 / engelleme dönebilir
		if (!headers["User-Agent"]) {
			headers["User-Agent"] = DEFAULT_SUBTITLE_UA;
		}

		// Convert Cookie object to string (react-native-video only accepts string)
		if (headers.Cookie && typeof headers.Cookie === "object") {
			headers.Cookie = Object.entries(headers.Cookie)
				.map(([k, v]) => `${k}=${v}`)
				.join("; ");
		}

		// Detect type from URL or force m3u8 for known HLS endpoints / extractors
		let type = undefined;
		if (overrideType !== null) {
			type = overrideType;
		} else {
			const isExplicitProgressive =
				/\.(mp4|mkv|webm|avi|flv|mov)(\?.*)?$/i.test(streamUrl) ||
				streamUrl.includes("googlevideo.com") ||
				streamUrl.includes("videoplayback") ||
				/[?&]mime=video%2f(mp4|webm)/i.test(streamUrl) ||
				/[?&]mime=video\/(mp4|webm)/i.test(streamUrl) ||
				currentSourceData?.result?.type === "mp4" ||
				currentSourceData?.result?.is_hls === false ||
				currentSourceData?.extractor
					?.toLowerCase()
					?.includes("peacemaker") ||
				currentSourceData?.result?.name
					?.toLowerCase()
					?.includes("peacemaker");

			const isExplicitHls =
				streamUrl.includes(".m3u8") ||
				streamUrl.includes("/q/") ||
				streamUrl.includes("molystream") ||
				streamUrl.includes("/hls/") ||
				streamUrl.includes("/hls2/") ||
				streamUrl.includes(".urlset") ||
				streamUrl.includes("master.txt") ||
				streamUrl.includes("sublist") ||
				streamUrl.includes(".txt") ||
				streamUrl.includes("cdnimage") ||
				streamUrl.includes("/m2/") ||
				streamUrl.includes("/mm/") ||
				streamUrl.includes("/ms/") ||
				streamUrl.includes("/mo/") ||
				currentSourceData?.extractor
					?.toLowerCase()
					?.includes("close") ||
				currentSourceData?.result?.name
					?.toLowerCase()
					?.includes("close") ||
				currentSourceData?.extractor
					?.toLowerCase()
					?.includes("rapidvid") ||
				currentSourceData?.result?.name
					?.toLowerCase()
					?.includes("rapidvid") ||
				currentSourceData?.extractor
					?.toLowerCase()
					?.includes("rapidrame") ||
				currentSourceData?.result?.name
					?.toLowerCase()
					?.includes("rapidrame") ||
				currentSourceData?.result?.is_hls === true ||
				currentSourceData?.result?.type === "m3u8" ||
				currentSourceData?.result?.type === "hls";

			if (isExplicitHls) {
				type = "m3u8";
			} else if (isExplicitProgressive) {
				type = "mp4";
			}
		}

		return {
			uri: streamUrl,
			headers,
			type,
			// NOT: Harici altyazılar buraya verilmiyor.
			// react-native-video v6'nın TextTrack tipi header alanı desteklemiyor
			// ({ title, language, type, uri }), bu yüzden header gerektiren CDN'lerde
			// (Dizilla/pichive gibi) native istek 403 alır. Altyazılar zaten
			// subtitleHeaders ile fetch edilip kendi overlay'imizde çiziliyor.
		};
	}, [currentSourceData, overrideType]);

	// Orientation handling - varsayılan olarak her zaman yatay
	const toggleOrientation = async () => {
		try {
			if (isLandscape) {
				await ScreenOrientation.lockAsync(
					ScreenOrientation.OrientationLock.PORTRAIT_UP,
				);
				setIsLandscape(false);
			} else {
				await ScreenOrientation.lockAsync(
					ScreenOrientation.OrientationLock.LANDSCAPE,
				);
				setIsLandscape(true);
			}
		} catch (e) {
			console.warn("Orientation change error:", e);
		}
	};

	useEffect(() => {
		if (settings?.defaultOrientation === "sensor") {
			ScreenOrientation.unlockAsync().catch(() => {});
		} else {
			ScreenOrientation.lockAsync(
				ScreenOrientation.OrientationLock.LANDSCAPE,
			).catch(() => {});
		}

		return () => {
			ScreenOrientation.lockAsync(
				ScreenOrientation.OrientationLock.PORTRAIT_UP,
			).catch(() => {});
		};
	}, [settings?.defaultOrientation]);

	// Handle switching video source
	const handleSelectSource = (index) => {
		if (index === activeSourceIndex) return;

		// Save current time so new source resumes seamlessly (if autoResume is enabled)
		if (settings?.autoResume !== false) {
			pendingSeekTimeRef.current = currentTime;
		} else {
			pendingSeekTimeRef.current = 0;
		}
		formatRetryRef.current = false;
		setOverrideType(null);
		setIsLoading(true);
		setHasError(false);
		setActiveSourceIndex(index);
		// Reset stream specific audio & subtitle states for new stream
		setAvailableAudioTracks([]);
		setSelectedAudioTrackIndex(null);
		setStreamTextTracks([]);
		setParsedCues([]);
		setUserSubtitleChoice(undefined);
		setSubtitleOffset(0);
	};

	// Handle subtitle selection
	const handleSelectSubtitle = (sub) => {
		setUserSubtitleChoice(sub);
		setSubtitleOffset(0);
		if (!sub?.uri) {
			setParsedCues([]);
		}
	};

	// Compute selectedTextTrack prop for Video component
	const videoTextTrackProp = useMemo(() => {
		if (!selectedSubtitle) {
			return { type: "disabled" };
		}
		if (selectedSubtitle.title) {
			return { type: "title", value: selectedSubtitle.title };
		}
		if (typeof selectedSubtitle.index === "number") {
			return { type: "index", value: selectedSubtitle.index };
		}
		return { type: "disabled" };
	}, [selectedSubtitle]);

	// Compute selectedAudioTrack prop for Video component
	const videoAudioTrackProp = useMemo(() => {
		if (selectedAudioTrackIndex === null) {
			return { type: "system" };
		}
		return { type: "index", value: selectedAudioTrackIndex };
	}, [selectedAudioTrackIndex]);

	// Video events
	const handleLoad = (data) => {
		setIsLoading(false);
		setHasError(false);
		formatRetryRef.current = false;
		const dur = data.duration || 0;
		setDuration(dur);
		durationRef.current = dur;

		// If audio tracks detected in stream
		if (Array.isArray(data.audioTracks) && data.audioTracks.length > 0) {
			setAvailableAudioTracks(data.audioTracks);
		}

		// If text tracks detected in stream
		if (Array.isArray(data.textTracks) && data.textTracks.length > 0) {
			setStreamTextTracks(data.textTracks);
		}

		// Resume seek position if pending
		if (pendingSeekTimeRef.current > 0 && videoRef.current) {
			const seekTarget = pendingSeekTimeRef.current;
			pendingSeekTimeRef.current = 0;
			setTimeout(() => {
				videoRef.current?.seek(seekTarget);
			}, 300);
		}
	};

	const handleProgress = (data) => {
		const curTime = data.currentTime || 0;
		setCurrentTime(curTime);
		currentTimeRef.current = curTime;
		setPlayableDuration(data.playableDuration || 0);
		if (onProgressUpdate) {
			onProgressUpdate(curTime, duration);
		}

		// Kaldığın Yerden Devam Et - Progress Tracking
		const totalDuration = durationRef.current || duration || 0;
		const id = contentId || targetUrl || currentSourceData?.result?.url;

		if (id && totalDuration > 0) {
			const shouldSave =
				(curTime >= 10 && lastSavedTimeRef.current === 0) ||
				(curTime - lastSavedTimeRef.current >= 5 && curTime >= 10);

			if (shouldSave) {
				lastSavedTimeRef.current = curTime;
				const progress = curTime / totalDuration;

				if (progress >= 0.9) {
					if (!hasMarkedCompleteRef.current) {
						hasMarkedCompleteRef.current = true;
						if (contentType === "episode") {
							markEpisodeComplete(
								seriesInfo?.seriesId,
								seriesInfo?.season,
								seriesInfo?.episode,
								seriesInfo?.nextEpisode,
								{
									id,
									title,
									poster,
									url:
										targetUrl ||
										currentSourceData?.result?.url,
									seriesTitle: seriesInfo?.seriesTitle,
									episodeTitle: seriesInfo?.episodeTitle,
									totalEpisodes: seriesInfo?.totalEpisodes,
									seriesUrl: seriesInfo?.seriesUrl,
									plugin: plugin || seriesInfo?.plugin,
								},
							);
						} else {
							removeContinueWatching(id);
							addToWatchHistory({
								id: contentId || targetUrl,
								title,
								poster,
								type: "movie",
								url:
									targetUrl || currentSourceData?.result?.url,
								plugin: plugin || seriesInfo?.plugin,
								isCompleted: true,
								progress: 1.0,
								watchedAt: new Date().toISOString(),
							});
						}
					}
				} else {
					saveContinueWatching({
						id,
						title,
						poster,
						type: contentType,
						currentTime: curTime,
						duration: totalDuration,
						progress,
						url: targetUrl || currentSourceData?.result?.url,
						seriesId: seriesInfo?.seriesId,
						seriesTitle: seriesInfo?.seriesTitle,
						seriesUrl: seriesInfo?.seriesUrl,
						plugin: plugin || seriesInfo?.plugin,
						season: seriesInfo?.season,
						episode: seriesInfo?.episode,
						episodeTitle: seriesInfo?.episodeTitle,
						nextEpisode: seriesInfo?.nextEpisode,
						totalEpisodes: seriesInfo?.totalEpisodes,
					});
				}
			}
		}
	};

	const handleBuffer = (meta) => {
		setIsBuffering(Boolean(meta.isBuffering));
	};

	const handleEnd = () => {
		const id = contentId || targetUrl || currentSourceData?.result?.url;
		if (id && !hasMarkedCompleteRef.current) {
			hasMarkedCompleteRef.current = true;
			if (contentType === "episode") {
				markEpisodeComplete(
					seriesInfo?.seriesId,
					seriesInfo?.season,
					seriesInfo?.episode,
					seriesInfo?.nextEpisode,
					{
						id,
						title,
						poster,
						url: targetUrl || currentSourceData?.result?.url,
						seriesTitle: seriesInfo?.seriesTitle,
						episodeTitle: seriesInfo?.episodeTitle,
						totalEpisodes: seriesInfo?.totalEpisodes,
						seriesUrl: seriesInfo?.seriesUrl,
						plugin: plugin || seriesInfo?.plugin,
					},
				);
			} else {
				removeContinueWatching(id);
				addToWatchHistory({
					id: contentId || targetUrl,
					title,
					poster,
					type: "movie",
					url: targetUrl || currentSourceData?.result?.url,
					plugin: plugin || seriesInfo?.plugin,
					isCompleted: true,
					progress: 1.0,
					watchedAt: new Date().toISOString(),
				});
			}
		}
	};

	const handleError = (error) => {
		console.warn("Video playback error:", error);
		setIsLoading(false);
		setIsBuffering(false);

		const errorCode = error?.error?.errorCode;
		const isFormatError =
			errorCode === "23002" ||
			errorCode === "23003" ||
			error?.error?.errorString?.includes("PARSING_CONTAINER") ||
			error?.error?.errorString?.includes("PARSING_MANIFEST") ||
			error?.error?.errorException?.includes(
				"UnrecognizedInputFormatException",
			) ||
			error?.error?.errorStackTrace?.includes("HlsPlaylistParser") ||
			error?.error?.errorStackTrace?.includes("#EXTM3U");

		// Eğer konteyner veya manifest ayrıştırma hatası aldıysak (örn. HLS sanılan MP4 veya MP4 sanılan HLS), alternatif tiple tekrar dene
		if (isFormatError && !formatRetryRef.current) {
			formatRetryRef.current = true;
			const nextType = videoSource?.type === "m3u8" ? "mp4" : "m3u8";
			console.log(
				`Format/Manifest hatası tespit edildi, kaynak ${activeSourceIndex} için type=${nextType} ile tekrar deneniyor...`,
			);
			setOverrideType(nextType);
			setHasError(false);
			setIsLoading(true);
			return;
		}

		// Auto-try next source on format/network errors
		const hasMoreSources = activeSourceIndex < sources.length - 1;

		if ((isFormatError || errorCode?.startsWith("2")) && hasMoreSources) {
			console.log(`Source ${activeSourceIndex} failed, trying next...`);
			formatRetryRef.current = false;
			setOverrideType(null);
			setActiveSourceIndex((prev) => prev + 1);
			setHasError(false);
			setIsLoading(true);
			return;
		}

		setHasError(true);
		setErrorMessage(
			error?.error?.errorString ||
				"Video oynatılamadı. Lütfen farklı bir kaynak seçin.",
		);
	};

	const handleAudioTracks = (data) => {
		if (Array.isArray(data.audioTracks)) {
			setAvailableAudioTracks(data.audioTracks);
		}
	};

	const handleTextTracks = (data) => {
		if (Array.isArray(data.textTracks)) {
			setStreamTextTracks(data.textTracks);
		}
	};

	// Seek helpers
	const handleSeekBy = (deltaSeconds) => {
		if (!videoRef.current || duration <= 0) return;
		const nextTime = Math.max(
			0,
			Math.min(duration, currentTime + deltaSeconds),
		);
		videoRef.current.seek(nextTime);
		setCurrentTime(nextTime);
		startHideTimer();
	};

	// 2. Basitleştirilmiş ve Güvenilir Dokunma Yöneticisi
	const handleScreenTouch = (evt) => {
		const now = Date.now();
		const locationX =
			evt?.nativeEvent?.locationX ?? Dimensions.get("window").width / 2;
		const screenW = Dimensions.get("window").width;
		const DOUBLE_TAP_DELAY = 280;

		// Eğer kontroller gizliyse: Tek dokunuşla hemen aç ve başka hiçbir şey yapma!
		if (!showControls) {
			setShowControls(true);
			lastTapRef.current = { time: 0, x: 0 };
			return;
		}

		// Çift dokunma (Double Tap) kontrolü
		if (now - lastTapRef.current.time < DOUBLE_TAP_DELAY) {
			lastTapRef.current = { time: 0, x: 0 }; // Sıfırla

			if (locationX < screenW * 0.35) {
				handleSeekBy(-seekDuration);
				setDoubleTapInfo({ type: "rewind", delta: seekDuration });
				setTimeout(() => setDoubleTapInfo(null), 700);
			} else if (locationX > screenW * 0.65) {
				handleSeekBy(seekDuration);
				setDoubleTapInfo({ type: "forward", delta: seekDuration });
				setTimeout(() => setDoubleTapInfo(null), 700);
			} else {
				setPaused((prev) => !prev);
			}
			startHideTimer();
		} else {
			// İlk dokunuş: Kontroller zaten açık olduğu için sayacı sıfırla veya kontrolleri kapat
			lastTapRef.current = { time: now, x: locationX };
			startHideTimer();
		}
	};

	// Android TV Kumanda Tuş Dinleyicisi
	useTVRemote(
		(eventType) => {
			if (!showControls) {
				// Kontroller kapalıyken:
				if (
					eventType === "playPause" ||
					eventType === "play" ||
					eventType === "pause"
				) {
					setPaused((prev) => !prev);
					return;
				}
				if (eventType === "left" || eventType === "rewind") {
					handleSeekBy(-seekDuration);
					setDoubleTapInfo({ type: "rewind", delta: seekDuration });
					setTimeout(() => setDoubleTapInfo(null), 800);
					return;
				}
				if (eventType === "right" || eventType === "fastForward") {
					handleSeekBy(seekDuration);
					setDoubleTapInfo({ type: "forward", delta: seekDuration });
					setTimeout(() => setDoubleTapInfo(null), 800);
					return;
				}
				// select, up, down, menu kontrolleri uyandırır
				setShowControls(true);
				startHideTimer();
			} else {
				// Kontroller açıkken her tuşta gizleme sayacını sıfırla
				startHideTimer();

				if (eventType === "playPause") {
					setPaused((prev) => !prev);
				} else if (eventType === "rewind") {
					handleSeekBy(-seekDuration);
				} else if (eventType === "fastForward") {
					handleSeekBy(seekDuration);
				}
			}
		},
		true,
	);

	// Kumanda Donanım Geri (Back) Tuşu Hiyerarşisi
	useEffect(() => {
		const onBackPress = () => {
			// 1. Öncelik: Açık bir modal varsa kapat
			if (modalType !== null) {
				setModalType(null);
				startHideTimer();
				return true;
			}
			// 2. Öncelik: Kontroller açıksa gizle
			if (showControls) {
				setShowControls(false);
				return true;
			}
			// 3. Öncelik: Oynatıcıdan çık
			if (onClose) {
				onClose();
				return true;
			}
			return false;
		};

		const subscription = BackHandler.addEventListener(
			"hardwareBackPress",
			onBackPress,
		);
		return () => subscription.remove();
	}, [modalType, showControls, onClose, startHideTimer]);

	// Scrub Bar touch handling
	const [scrubPosition, setScrubPosition] = useState(null); // fraction [0, 1]
	const progressBarLayoutRef = useRef({ width: 1, x: 0 });

	const durationRef = useRef(duration);
	useEffect(() => {
		durationRef.current = duration;
	}, [duration]);

	const scrubPositionRef = useRef(scrubPosition);
	useEffect(() => {
		scrubPositionRef.current = scrubPosition;
	}, [scrubPosition]);

	const startHideTimerRef = useRef(startHideTimer);
	useEffect(() => {
		startHideTimerRef.current = startHideTimer;
	}, [startHideTimer]);

	const panResponder = useMemo(
		() =>
			// eslint-disable-next-line react-hooks/refs
			PanResponder.create({
				onStartShouldSetPanResponder: () => true,
				onMoveShouldSetPanResponder: () => true,
				onPanResponderGrant: (evt) => {
					startHideTimerRef.current?.();
					const touchX = evt.nativeEvent.locationX;
					const ratio = Math.max(
						0,
						Math.min(
							1,
							touchX / (progressBarLayoutRef.current.width || 1),
						),
					);
					setScrubPosition(ratio);
				},
				onPanResponderMove: (evt) => {
					startHideTimerRef.current?.();
					const touchX = evt.nativeEvent.locationX;
					const ratio = Math.max(
						0,
						Math.min(
							1,
							touchX / (progressBarLayoutRef.current.width || 1),
						),
					);
					setScrubPosition(ratio);
				},
				onPanResponderRelease: () => {
					const currentScrub = scrubPositionRef.current;
					const currentDur = durationRef.current;
					if (
						currentScrub !== null &&
						currentDur > 0 &&
						videoRef.current
					) {
						const seekTime = currentScrub * currentDur;
						videoRef.current.seek(seekTime);
						setCurrentTime(seekTime);
					}
					setScrubPosition(null);
					startHideTimerRef.current?.();
				},
			}),
		[],
	);

	// Çıkışta (unmount) son izleme pozisyonunu kaydet
	useEffect(() => {
		return () => {
			const curTime = currentTimeRef.current;
			const totalDuration = durationRef.current;
			const id = contentId || targetUrl || currentSourceData?.result?.url;

			if (
				id &&
				curTime >= 10 &&
				totalDuration > 0 &&
				curTime / totalDuration < 0.9
			) {
				saveContinueWatching({
					id,
					title,
					poster,
					type: contentType,
					currentTime: curTime,
					duration: totalDuration,
					progress: curTime / totalDuration,
					url: targetUrl || currentSourceData?.result?.url,
					seriesId: seriesInfo?.seriesId,
					seriesTitle: seriesInfo?.seriesTitle,
					season: seriesInfo?.season,
					episode: seriesInfo?.episode,
					episodeTitle: seriesInfo?.episodeTitle,
					nextEpisode: seriesInfo?.nextEpisode,
				});
			}
		};
	}, [
		contentId,
		targetUrl,
		title,
		poster,
		contentType,
		seriesInfo,
		currentSourceData,
	]);

	const progressRatio =
		scrubPosition !== null
			? scrubPosition
			: duration > 0
				? Math.min(1, Math.max(0, currentTime / duration))
				: 0;

	const bufferRatio =
		duration > 0
			? Math.min(1, Math.max(0, playableDuration / duration))
			: 0;

	return (
		<View style={styles.container}>
			<StatusBar hidden={isLandscape || !showControls} />

			{/* 1. KATMAN: Video (Tamamen dokunmaya kapalı) */}
			{videoSource ? (
				<View style={StyleSheet.absoluteFill} pointerEvents="none">
					<Video
						key={`${videoSource.uri}_${videoSource.type || "auto"}_${overrideType || "none"}`}
						ref={videoRef}
						source={videoSource}
						style={StyleSheet.absoluteFill}
						resizeMode={resizeMode}
						paused={paused}
						onLoad={handleLoad}
						onProgress={handleProgress}
						onBuffer={handleBuffer}
						onEnd={handleEnd}
						onError={handleError}
						onAudioTracks={handleAudioTracks}
						onTextTracks={handleTextTracks}
						selectedTextTrack={videoTextTrackProp}
						selectedAudioTrack={videoAudioTrackProp}
						progressUpdateInterval={500}
						ignoreSilentSwitch="ignore"
						poster={poster}
						controls={false} // Native kontroller kapalı kalmalı
						posterResizeMode="cover"
						useTextureView={true}
					/>
				</View>
			) : (
				<View style={styles.noSourceContainer}>
					<Text style={styles.noSourceText}>
						Video kaynağı yükleniyor veya bulunamadı...
					</Text>
				</View>
			)}

			{/* 2. KATMAN: Tüm Ekranı Kaplayan Dokunma/Kumanda Odak Yakalayıcı */}
			<Pressable
				focusable={!showControls}
				hasTVPreferredFocus={!showControls && Platform.isTV}
				style={[
					StyleSheet.absoluteFill,
					{
						zIndex: 5,
						backgroundColor: showControls
							? "rgba(0, 0, 0, 0.45)"
							: "transparent",
					},
				]}
				onPress={handleScreenTouch}>
				{/* 3. KATMAN: Arayüz Elemanları (Yalnızca showControls true iken çizilir) */}
				{showControls && (
					<View
						style={[
							styles.controlsLayer,
							{
								paddingTop: Math.max(insets.top, 16),
								paddingBottom: Math.max(insets.bottom, 16),
								paddingLeft: Math.max(insets.left, 16),
								paddingRight: Math.max(insets.right, 16),
							},
						]}
						pointerEvents="box-none">
						{/* TOP BAR */}
						<View style={styles.topBar} pointerEvents="box-none">
							<TVPressable
								style={styles.iconButton}
								focusedStyle={styles.iconButtonFocused}
								onPress={() => {
									startHideTimer();
									onClose?.();
								}}>
								<Ionicons
									name="chevron-back"
									size={26}
									color="#FFFFFF"
								/>
							</TVPressable>

							<View
								style={styles.titleContainer}
								pointerEvents="none">
								<Text
									style={styles.movieTitle}
									numberOfLines={1}>
									{title || "Video Oynatıcı"}
								</Text>
								{subtitle ? (
									<Text
										style={styles.movieSubtitle}
										numberOfLines={1}>
										{subtitle}
									</Text>
								) : null}
							</View>

							<View
								style={styles.topActions}
								pointerEvents="box-none">
								{sources.length > 0 && (
									<TVPressable
										style={styles.pillButton}
										focusedStyle={styles.pillButtonFocused}
										onPress={() => {
											startHideTimer();
											setModalType("sources");
										}}>
										<Ionicons
											name="server"
											size={13}
											color="#FF3B30"
										/>
										<Text
											style={styles.pillText}
											numberOfLines={1}>
											{sourceDisplayName}
										</Text>
									</TVPressable>
								)}

								<TVPressable
									style={[
										styles.iconButton,
										selectedAudioTrackIndex !== null &&
											styles.iconButtonActive,
									]}
									focusedStyle={styles.iconButtonFocused}
									onPress={() => {
										startHideTimer();
										setModalType("audio");
									}}>
									<Ionicons
										name="volume-high-outline"
										size={20}
										color={
											selectedAudioTrackIndex !== null
												? "#FF3B30"
												: "#FFFFFF"
										}
									/>
								</TVPressable>

								<TVPressable
									style={[
										styles.iconButton,
										selectedSubtitle &&
											styles.iconButtonActive,
									]}
									focusedStyle={styles.iconButtonFocused}
									onPress={() => {
										startHideTimer();
										setModalType("subtitles");
									}}>
									<Ionicons
										name="chatbubble-ellipses-outline"
										size={20}
										color={
											selectedSubtitle
												? "#FF3B30"
												: "#FFFFFF"
										}
									/>
								</TVPressable>

								<TVPressable
									style={styles.iconButton}
									focusedStyle={styles.iconButtonFocused}
									onPress={() => {
										startHideTimer();
										setIsLocked((prev) => !prev);
									}}>
									<Ionicons
										name={
											isLocked
												? "lock-closed"
												: "lock-open-outline"
										}
										size={20}
										color={isLocked ? "#FF3B30" : "#FFFFFF"}
									/>
								</TVPressable>

								<TVPressable
									style={styles.iconButton}
									focusedStyle={styles.iconButtonFocused}
									onPress={() => {
										startHideTimer();
										toggleOrientation();
									}}>
									<Ionicons
										name={
											isLandscape
												? "phone-portrait-outline"
												: "scan-outline"
										}
										size={20}
										color="#FFFFFF"
									/>
								</TVPressable>
							</View>
						</View>

						{/* ORTA OYNATMA BUTONLARI */}
						{!isLocked && (
							<View
								style={styles.centerControls}
								pointerEvents="box-none">
								<TVPressable
									style={styles.seekButton}
									focusedStyle={styles.seekButtonFocused}
									onPress={() => {
										handleSeekBy(-seekDuration);
										startHideTimer();
									}}>
									<Ionicons
										name="play-back-outline"
										size={24}
										color="#FFFFFF"
									/>
									<Text style={styles.seekButtonText}>
										-{seekDuration}s
									</Text>
								</TVPressable>

								<TVPressable
									autoFocus={showControls}
									style={styles.playPauseButton}
									focusedStyle={styles.playPauseButtonFocused}
									onPress={() => {
										setPaused((prev) => !prev);
										startHideTimer();
									}}>
									<Ionicons
										name={paused ? "play" : "pause"}
										size={38}
										color="#FFFFFF"
									/>
								</TVPressable>

								<TVPressable
									style={styles.seekButton}
									focusedStyle={styles.seekButtonFocused}
									onPress={() => {
										handleSeekBy(seekDuration);
										startHideTimer();
									}}>
									<Ionicons
										name="play-forward-outline"
										size={24}
										color="#FFFFFF"
									/>
									<Text style={styles.seekButtonText}>
										+{seekDuration}s
									</Text>
								</TVPressable>
							</View>
						)}

						{/* ALT ÇUBUK (PROGRESS BAR) */}
						{!isLocked && (
							<View
								style={styles.bottomBar}
								pointerEvents="box-none">
								<View
									style={styles.bottomBarHeader}
									pointerEvents="box-none">
									<Text style={styles.timeText}>
										{formatTime(currentTime)}
										<Text style={styles.durationText}>
											{" "}
											/ {formatTime(duration)}
										</Text>
									</Text>

									<TVPressable
										style={styles.resizeButton}
										focusedStyle={styles.resizeButtonFocused}
										onPress={() => {
											startHideTimer();
											setResizeMode((prev) =>
												prev === "contain"
													? "cover"
													: "contain",
											);
										}}>
										<Ionicons
											name={
												resizeMode === "cover"
													? "contract-outline"
													: "expand-outline"
											}
											size={16}
											color="#E5E5EA"
										/>
										<Text style={styles.resizeButtonText}>
											{resizeMode === "cover"
												? "Sığdır"
												: "Doldur"}
										</Text>
									</TVPressable>
								</View>

								<View
									style={styles.progressContainer}
									onLayout={(e) => {
										progressBarLayoutRef.current =
											e.nativeEvent.layout;
									}}
									{...panResponder.panHandlers}>
									<View style={styles.progressTrack}>
										<View
											style={[
												styles.progressBuffer,
												{
													width: `${bufferRatio * 100}%`,
												},
											]}
										/>
										<View
											style={[
												styles.progressPlayed,
												{
													width: `${progressRatio * 100}%`,
												},
											]}
										/>
									</View>
									<View
										style={[
											styles.progressThumb,
											{ left: `${progressRatio * 100}%` },
										]}
									/>
								</View>
							</View>
						)}
					</View>
				)}
			</Pressable>

			{/* ALTYAZI GÖSTERİM KATMANI */}
			{currentSubtitleText ? (
				<View
					style={[
						styles.subtitleContainer,
						{ bottom: showControls ? 100 : 36 },
					]}
					pointerEvents="none">
					<View style={[styles.subtitlePill, subtitleBgStyle]}>
						<Text style={[styles.subtitleText, subtitleTextStyle]}>
							{currentSubtitleText}
						</Text>
					</View>
				</View>
			) : null}

			{/* 4. KATMAN: Double Tap Animasyon Bildirimi */}
			{doubleTapInfo && (
				<View
					style={[
						styles.doubleTapOverlay,
						doubleTapInfo.type === "rewind"
							? styles.doubleTapLeft
							: styles.doubleTapRight,
					]}
					pointerEvents="none">
					<Ionicons
						name={
							doubleTapInfo.type === "rewind"
								? "play-back-circle-outline"
								: "play-forward-circle-outline"
						}
						size={56}
						color="#FFFFFF"
					/>
					<Text style={styles.doubleTapText}>
						{doubleTapInfo.type === "rewind"
							? `-${doubleTapInfo.delta || seekDuration} sn`
							: `+${doubleTapInfo.delta || seekDuration} sn`}
					</Text>
				</View>
			)}

			{/* 5. KATMAN: Yükleniyor / Hata Göstergeleri */}
			{(isLoading || isBuffering) && !hasError && (
				<View style={styles.centerLoading} pointerEvents="none">
					<ActivityIndicator size="large" color="#FF3B30" />
					<Text style={styles.loadingText}>
						{isLoading
							? "Kaynak yükleniyor..."
							: "Ara belleğe alınıyor..."}
					</Text>
				</View>
			)}

			{/* Error State */}
			{hasError && (
				<View style={styles.errorContainer}>
					<Ionicons
						name="alert-circle-outline"
						size={54}
						color="#FF453A"
					/>
					<Text style={styles.errorTitle}>Oynatma Hatası</Text>
					<Text style={styles.errorDescription}>{errorMessage}</Text>
					<View style={styles.errorButtonsRow}>
						{sources.length > 1 && (
							<TouchableOpacity
								style={styles.switchSourceButton}
								onPress={() => setModalType("sources")}>
								<Ionicons
									name="server-outline"
									size={18}
									color="#FFFFFF"
								/>
								<Text style={styles.switchSourceButtonText}>
									Farklı Kaynak Seç ({sources.length} Kaynak)
								</Text>
							</TouchableOpacity>
						)}
						<TouchableOpacity
							style={styles.retryButton}
							onPress={() => {
								setHasError(false);
								setIsLoading(true);
								setActiveSourceIndex((prev) => prev);
							}}>
							<Ionicons
								name="refresh"
								size={18}
								color="#FFFFFF"
							/>
							<Text style={styles.retryButtonText}>
								Yeniden Dene
							</Text>
						</TouchableOpacity>
					</View>
				</View>
			)}

			{/* Track Selection Modal */}
			<TrackSelectionModal
				visible={Boolean(modalType)}
				type={modalType || "sources"}
				onClose={() => {
					setModalType(null);
					startHideTimer();
				}}
				sources={sources}
				selectedSourceIndex={activeSourceIndex}
				onSelectSource={handleSelectSource}
				subtitles={allSubtitles}
				selectedSubtitle={selectedSubtitle}
				onSelectSubtitle={handleSelectSubtitle}
				subtitleOffset={subtitleOffset}
				onUpdateSubtitleOffset={handleUpdateSubtitleOffset}
				audioTracks={availableAudioTracks}
				selectedAudioTrack={selectedAudioTrackIndex}
				onSelectAudioTrack={(index) =>
					setSelectedAudioTrackIndex(index)
				}
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: "#000000",
		justifyContent: "center",
		alignItems: "center",
	},
	noSourceContainer: {
		...StyleSheet.absoluteFill,
		backgroundColor: "#0B0E14",
		justifyContent: "center",
		alignItems: "center",
		padding: 24,
	},
	noSourceText: {
		color: "#8E8E93",
		fontSize: 16,
		textAlign: "center",
	},
	mainOverlay: {
		...StyleSheet.absoluteFill,
		zIndex: 10,
	},
	controlsLayer: {
		flex: 1,
		justifyContent: "space-between",
	},
	controlsContainer: {
		flex: 1,
		justifyContent: "space-between",
	},
	topBar: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
	titleContainer: {
		flex: 1,
		marginHorizontal: 12,
	},
	movieTitle: {
		color: "#FFFFFF",
		fontSize: 16,
		fontWeight: "700",
		textShadowColor: "rgba(0, 0, 0, 0.75)",
		textShadowOffset: { width: 0, height: 1 },
		textShadowRadius: 3,
	},
	movieSubtitle: {
		color: "#D1D1D6",
		fontSize: 13,
		marginTop: 2,
	},
	topActions: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
	},
	iconButton: {
		width: 40,
		height: 40,
		borderRadius: 20,
		backgroundColor: "rgba(0, 0, 0, 0.4)",
		alignItems: "center",
		justifyContent: "center",
	},
	iconButtonActive: {
		backgroundColor: "rgba(255, 59, 48, 0.25)",
		borderColor: "rgba(255, 59, 48, 0.6)",
		borderWidth: 1,
	},
	iconButtonFocused: {
		backgroundColor: "rgba(255, 59, 48, 0.35)",
		borderColor: "#FF3B30",
		borderWidth: 1.5,
		transform: [{ scale: 1.15 }],
	},
	pillButton: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: "rgba(0, 0, 0, 0.6)",
		paddingHorizontal: 8,
		paddingVertical: 5,
		borderRadius: 16,
		gap: 4,
		maxWidth: 110,
		flexShrink: 1,
		borderWidth: 1,
		borderColor: "rgba(255, 59, 48, 0.35)",
	},
	pillButtonFocused: {
		backgroundColor: "rgba(255, 59, 48, 0.4)",
		borderColor: "#FF3B30",
		borderWidth: 1.5,
		transform: [{ scale: 1.1 }],
	},
	pillText: {
		color: "#FFFFFF",
		fontSize: 11,
		fontWeight: "600",
		flexShrink: 1,
	},
	centerControls: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 40,
	},
	playPauseButton: {
		width: 72,
		height: 72,
		borderRadius: 36,
		backgroundColor: "rgba(255, 59, 48, 0.85)",
		alignItems: "center",
		justifyContent: "center",
		shadowColor: "#FF3B30",
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.4,
		shadowRadius: 8,
		elevation: 6,
	},
	playPauseButtonFocused: {
		borderColor: "#FF3B30",
		borderWidth: 3,
		backgroundColor: "rgba(255, 59, 48, 0.95)",
		transform: [{ scale: 1.18 }],
		elevation: 10,
	},
	seekButton: {
		width: 56,
		height: 56,
		borderRadius: 28,
		backgroundColor: "rgba(0, 0, 0, 0.5)",
		alignItems: "center",
		justifyContent: "center",
		borderWidth: 1,
		borderColor: "rgba(255, 255, 255, 0.15)",
	},
	seekButtonFocused: {
		backgroundColor: "rgba(255, 59, 48, 0.35)",
		borderColor: "#FF3B30",
		borderWidth: 1.5,
		transform: [{ scale: 1.15 }],
	},
	seekButtonText: {
		color: "#FFFFFF",
		fontSize: 10,
		fontWeight: "700",
		textAlign: "center",
		includeFontPadding: false,
		marginTop: 1,
	},
	bottomBar: {
		width: "100%",
	},
	bottomBarHeader: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginBottom: 8,
		paddingHorizontal: 4,
	},
	timeText: {
		color: "#FFFFFF",
		fontSize: 14,
		fontWeight: "600",
	},
	durationText: {
		color: "#8E8E93",
		fontSize: 13,
		fontWeight: "400",
	},
	bottomActions: {
		flexDirection: "row",
		alignItems: "center",
	},
	resizeButton: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		paddingHorizontal: 10,
		paddingVertical: 4,
		borderRadius: 12,
		backgroundColor: "rgba(255, 255, 255, 0.12)",
	},
	resizeButtonFocused: {
		backgroundColor: "rgba(255, 59, 48, 0.35)",
		borderColor: "#FF3B30",
		borderWidth: 1.5,
		transform: [{ scale: 1.08 }],
	},
	resizeButtonText: {
		color: "#E5E5EA",
		fontSize: 12,
		fontWeight: "600",
	},
	progressContainer: {
		height: 32,
		justifyContent: "center",
	},
	progressTrack: {
		height: 5,
		backgroundColor: "rgba(255, 255, 255, 0.25)",
		borderRadius: 2.5,
		overflow: "hidden",
		position: "relative",
	},
	progressBuffer: {
		height: "100%",
		backgroundColor: "rgba(255, 255, 255, 0.45)",
		position: "absolute",
		left: 0,
		top: 0,
	},
	progressPlayed: {
		height: "100%",
		backgroundColor: "#FF3B30",
		position: "absolute",
		left: 0,
		top: 0,
	},
	progressThumb: {
		position: "absolute",
		width: 14,
		height: 14,
		borderRadius: 7,
		backgroundColor: "#FFFFFF",
		marginLeft: -7,
		shadowColor: "#000000",
		shadowOffset: { width: 0, height: 1 },
		shadowOpacity: 0.5,
		shadowRadius: 2,
		elevation: 3,
	},
	centerLoading: {
		...StyleSheet.absoluteFill,
		justifyContent: "center",
		alignItems: "center",
		backgroundColor: "rgba(0, 0, 0, 0.5)",
		zIndex: 3,
	},
	loadingText: {
		color: "#FFFFFF",
		fontSize: 14,
		fontWeight: "600",
		marginTop: 12,
	},
	errorContainer: {
		...StyleSheet.absoluteFill,
		justifyContent: "center",
		alignItems: "center",
		backgroundColor: "rgba(11, 14, 20, 0.95)",
		padding: 24,
		zIndex: 20,
	},
	errorTitle: {
		color: "#FFFFFF",
		fontSize: 18,
		fontWeight: "700",
		marginTop: 12,
	},
	errorDescription: {
		color: "#8E8E93",
		fontSize: 14,
		textAlign: "center",
		marginTop: 8,
		marginBottom: 24,
		lineHeight: 20,
	},
	errorButtonsRow: {
		flexDirection: "row",
		gap: 12,
		flexWrap: "wrap",
		justifyContent: "center",
	},
	switchSourceButton: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		backgroundColor: "#FF3B30",
		paddingHorizontal: 16,
		paddingVertical: 12,
		borderRadius: 10,
	},
	switchSourceButtonText: {
		color: "#FFFFFF",
		fontSize: 14,
		fontWeight: "600",
	},
	retryButton: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		backgroundColor: "rgba(255, 255, 255, 0.15)",
		paddingHorizontal: 16,
		paddingVertical: 12,
		borderRadius: 10,
	},
	retryButtonText: {
		color: "#FFFFFF",
		fontSize: 14,
		fontWeight: "600",
	},
	doubleTapOverlay: {
		position: "absolute",
		top: "35%",
		alignItems: "center",
		justifyContent: "center",
		zIndex: 5,
		backgroundColor: "rgba(0, 0, 0, 0.4)",
		padding: 16,
		borderRadius: 40,
	},
	doubleTapLeft: {
		left: 40,
	},
	doubleTapRight: {
		right: 40,
	},
	doubleTapText: {
		color: "#FFFFFF",
		fontSize: 12,
		fontWeight: "700",
		marginTop: 4,
	},
	subtitleContainer: {
		position: "absolute",
		left: 24,
		right: 24,
		alignItems: "center",
		justifyContent: "center",
		zIndex: 8,
	},
	subtitlePill: {
		backgroundColor: "rgba(0, 0, 0, 0.78)",
		paddingHorizontal: 14,
		paddingVertical: 6,
		borderRadius: 6,
		maxWidth: "85%",
	},
	subtitleText: {
		color: "#FFFFFF",
		fontSize: 16,
		fontWeight: "600",
		textAlign: "center",
		textShadowColor: "rgba(0, 0, 0, 0.95)",
		textShadowOffset: { width: 0, height: 1 },
		textShadowRadius: 3,
		lineHeight: 22,
	},
});
