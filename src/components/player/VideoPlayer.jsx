import { Ionicons } from "@react-native-vector-icons/ionicons";
import * as ScreenOrientation from "expo-screen-orientation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	ActivityIndicator,
	Dimensions,
	PanResponder,
	Pressable,
	StatusBar,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Video, { TextTrackType } from "react-native-video";
import TrackSelectionModal from "./TrackSelectionModal";



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
}) {
	const insets = useSafeAreaInsets();
	const videoRef = useRef(null);

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
	const [resizeMode, setResizeMode] = useState("contain"); // 'contain' | 'cover'
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
	const [selectedSubtitle, setSelectedSubtitle] = useState(null);
	const [streamTextTracks, setStreamTextTracks] = useState([]);

	// Altyazı Cueleri & Senkronizasyon (Gecikme) Ayarı
	const [parsedCues, setParsedCues] = useState([]);
	const [subtitleOffset, setSubtitleOffset] = useState(0); // saniye cinsinden (+/-)

	// 1. Sayaç Yönetimi (Tek ve Güvenli Fonksiyon)
	const hideTimerRef = useRef(null);

	const startHideTimer = useCallback(() => {
		if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
		hideTimerRef.current = setTimeout(() => {
			setShowControls(false);
		}, 4000);
	}, []);

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

	// Altyazı dosyası değiştiğinde VTT/SRT içeriğini indirip ayrıştır
	useEffect(() => {
		if (!selectedSubtitle?.uri) return;

		let isMounted = true;
		fetch(selectedSubtitle.uri)
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
				console.warn("Altyazı dosyası okunamadı:", err);
				setParsedCues([]);
			});

		return () => {
			isMounted = false;
		};
	}, [selectedSubtitle?.uri]);

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

	// Build video source object for react-native-video
	const videoSource = useMemo(() => {
		if (!currentSourceData?.result?.url) return null;

		const streamUrl = currentSourceData.result.url;
		const rawHeaders = currentSourceData.result.headers || {};
		const headers = { ...rawHeaders };

		if (currentSourceData.result.referer && !headers.Referer) {
			headers.Referer = currentSourceData.result.referer;
		}

		// Detect stream type
		let type = undefined;
		if (
			streamUrl.includes(".m3u8") ||
			streamUrl.includes("master.txt") ||
			streamUrl.includes("/hls/")
		) {
			type = "m3u8";
		} else if (streamUrl.includes(".mp4")) {
			type = "mp4";
		}

		return {
			uri: streamUrl,
			headers,
			type,
			textTracks: externalSubtitles,
		};
	}, [currentSourceData, externalSubtitles]);

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
		// Player açıldığında her zaman doğrudan yatay moda kilitlen
		ScreenOrientation.lockAsync(
			ScreenOrientation.OrientationLock.LANDSCAPE,
		).catch(() => {});

		return () => {
			ScreenOrientation.lockAsync(
				ScreenOrientation.OrientationLock.PORTRAIT_UP,
			).catch(() => {});
		};
	}, []);

	// Handle switching video source
	const handleSelectSource = (index) => {
		if (index === activeSourceIndex) return;

		// Save current time so new source resumes seamlessly
		pendingSeekTimeRef.current = currentTime;
		setIsLoading(true);
		setHasError(false);
		setActiveSourceIndex(index);
		// Reset stream specific audio & subtitle states for new stream
		setAvailableAudioTracks([]);
		setSelectedAudioTrackIndex(null);
		setStreamTextTracks([]);
		setParsedCues([]);
		setSelectedSubtitle(null);
		setSubtitleOffset(0);
	};

	// Handle subtitle selection
	const handleSelectSubtitle = (sub) => {
		setSelectedSubtitle(sub);
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
		setDuration(data.duration || 0);

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
		setCurrentTime(data.currentTime || 0);
		setPlayableDuration(data.playableDuration || 0);
		if (onProgressUpdate) {
			onProgressUpdate(data.currentTime, duration);
		}
	};

	const handleBuffer = (meta) => {
		setIsBuffering(Boolean(meta.isBuffering));
	};

	const handleError = (error) => {
		console.warn("Video playback error:", error);
		setIsLoading(false);
		setIsBuffering(false);
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
				handleSeekBy(-10);
				setDoubleTapInfo({ type: "rewind" });
				setTimeout(() => setDoubleTapInfo(null), 700);
			} else if (locationX > screenW * 0.65) {
				handleSeekBy(10);
				setDoubleTapInfo({ type: "forward" });
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
						ref={videoRef}
						source={videoSource}
						style={StyleSheet.absoluteFill}
						resizeMode={resizeMode}
						paused={paused}
						onLoad={handleLoad}
						onProgress={handleProgress}
						onBuffer={handleBuffer}
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

			{/* 2. KATMAN: Tüm Ekranı Kaplayan Dokunma Yakalayıcı (Her zaman en üstte ve aktif) */}
			<Pressable
				style={[
					StyleSheet.absoluteFill,
					{
						zIndex: 5,
						backgroundColor: showControls
							? "rgba(0, 0, 0, 0.45)"
							: "transparent",
					},
				]}
				onPress={handleScreenTouch}
			>
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
						pointerEvents="box-none"
					>
						{/* TOP BAR */}
						<View style={styles.topBar} pointerEvents="box-none">
							<TouchableOpacity
								style={styles.iconButton}
								onPress={() => {
									startHideTimer();
									onClose?.();
								}}
								activeOpacity={0.7}
							>
								<Ionicons name="chevron-back" size={26} color="#FFFFFF" />
							</TouchableOpacity>

							<View style={styles.titleContainer} pointerEvents="none">
								<Text style={styles.movieTitle} numberOfLines={1}>
									{title || "Video Oynatıcı"}
								</Text>
								{subtitle ? (
									<Text style={styles.movieSubtitle} numberOfLines={1}>
										{subtitle}
									</Text>
								) : null}
							</View>

							<View style={styles.topActions} pointerEvents="box-none">
								{sources.length > 0 && (
									<TouchableOpacity
										style={styles.pillButton}
										onPress={() => {
											startHideTimer();
											setModalType("sources");
										}}
										activeOpacity={0.7}
									>
										<Ionicons name="server" size={13} color="#FF3B30" />
										<Text style={styles.pillText} numberOfLines={1}>
											{sourceDisplayName}
										</Text>
									</TouchableOpacity>
								)}

								<TouchableOpacity
									style={[
										styles.iconButton,
										selectedAudioTrackIndex !== null && styles.iconButtonActive,
									]}
									onPress={() => {
										startHideTimer();
										setModalType("audio");
									}}
									activeOpacity={0.7}
								>
									<Ionicons
										name="volume-high-outline"
										size={20}
										color={selectedAudioTrackIndex !== null ? "#FF3B30" : "#FFFFFF"}
									/>
								</TouchableOpacity>

								<TouchableOpacity
									style={[
										styles.iconButton,
										selectedSubtitle && styles.iconButtonActive,
									]}
									onPress={() => {
										startHideTimer();
										setModalType("subtitles");
									}}
									activeOpacity={0.7}
								>
									<Ionicons
										name="chatbubble-ellipses-outline"
										size={20}
										color={selectedSubtitle ? "#FF3B30" : "#FFFFFF"}
									/>
								</TouchableOpacity>

								<TouchableOpacity
									style={styles.iconButton}
									onPress={() => {
										startHideTimer();
										setIsLocked((prev) => !prev);
									}}
									activeOpacity={0.7}
								>
									<Ionicons
										name={isLocked ? "lock-closed" : "lock-open-outline"}
										size={20}
										color={isLocked ? "#FF3B30" : "#FFFFFF"}
									/>
								</TouchableOpacity>

								<TouchableOpacity
									style={styles.iconButton}
									onPress={() => {
										startHideTimer();
										toggleOrientation();
									}}
									activeOpacity={0.7}
								>
									<Ionicons
										name={isLandscape ? "phone-portrait-outline" : "scan-outline"}
										size={20}
										color="#FFFFFF"
									/>
								</TouchableOpacity>
							</View>
						</View>

						{/* ORTA OYNATMA BUTONLARI */}
						{!isLocked && (
							<View style={styles.centerControls} pointerEvents="box-none">
								<TouchableOpacity
									style={styles.seekButton}
									onPress={() => {
										handleSeekBy(-10);
										startHideTimer();
									}}
									activeOpacity={0.7}
								>
									<Ionicons name="play-back-outline" size={24} color="#FFFFFF" />
									<Text style={styles.seekButtonText}>-10s</Text>
								</TouchableOpacity>

								<TouchableOpacity
									style={styles.playPauseButton}
									onPress={() => {
										setPaused((prev) => !prev);
										startHideTimer();
									}}
									activeOpacity={0.8}
								>
									<Ionicons
										name={paused ? "play" : "pause"}
										size={38}
										color="#FFFFFF"
									/>
								</TouchableOpacity>

								<TouchableOpacity
									style={styles.seekButton}
									onPress={() => {
										handleSeekBy(10);
										startHideTimer();
									}}
									activeOpacity={0.7}
								>
									<Ionicons name="play-forward-outline" size={24} color="#FFFFFF" />
									<Text style={styles.seekButtonText}>+10s</Text>
								</TouchableOpacity>
							</View>
						)}

						{/* ALT ÇUBUK (PROGRESS BAR) */}
						{!isLocked && (
							<View style={styles.bottomBar} pointerEvents="box-none">
								<View style={styles.bottomBarHeader} pointerEvents="box-none">
									<Text style={styles.timeText}>
										{formatTime(currentTime)}
										<Text style={styles.durationText}>
											{" "} / {formatTime(duration)}
										</Text>
									</Text>

									<TouchableOpacity
										style={styles.resizeButton}
										onPress={() => {
											startHideTimer();
											setResizeMode((prev) =>
												prev === "contain" ? "cover" : "contain"
											);
										}}
									>
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
											{resizeMode === "cover" ? "Sığdır" : "Doldur"}
										</Text>
									</TouchableOpacity>
								</View>

								<View
									style={styles.progressContainer}
									onLayout={(e) => {
										progressBarLayoutRef.current = e.nativeEvent.layout;
									}}
									{...panResponder.panHandlers}
								>
									<View style={styles.progressTrack}>
										<View
											style={[
												styles.progressBuffer,
												{ width: `${bufferRatio * 100}%` },
											]}
										/>
										<View
											style={[
												styles.progressPlayed,
												{ width: `${progressRatio * 100}%` },
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
					<View style={styles.subtitlePill}>
						<Text style={styles.subtitleText}>
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
					pointerEvents="none"
				>
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
						{doubleTapInfo.type === "rewind" ? "-10 sn" : "+10 sn"}
					</Text>
				</View>
			)}

			{/* 5. KATMAN: Yükleniyor / Hata Göstergeleri */}
			{(isLoading || isBuffering) && !hasError && (
				<View style={styles.centerLoading} pointerEvents="none">
					<ActivityIndicator size="large" color="#FF3B30" />
					<Text style={styles.loadingText}>
						{isLoading ? "Kaynak yükleniyor..." : "Ara belleğe alınıyor..."}
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
				onSelectAudioTrack={(index) => setSelectedAudioTrackIndex(index)}
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
		gap: 4,
		backgroundColor: "rgba(255, 255, 255, 0.12)",
		paddingHorizontal: 8,
		paddingVertical: 4,
		borderRadius: 8,
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
