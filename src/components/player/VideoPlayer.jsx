import TVPressable from "@/components/common/TVPressable";
import { usePlayerSettings } from "@/context/PlayerSettingsContext";
import { useTVRemote } from "@/hooks/useTVRemote";
import {
	ensureBrightnessPermission,
	resetBrightness,
	setBrightness,
	setSystemVolume,
} from "@/utils/deviceControls";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import * as ScreenOrientation from "expo-screen-orientation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	ActivityIndicator,
	BackHandler,
	Platform,
	StatusBar,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Video from "react-native-video";
import BrightnessVolumeHud from "./BrightnessVolumeHud";
import {
	MAX_PLAYBACK_RATE,
	MIN_BRIGHTNESS,
	MIN_PLAYBACK_RATE,
	RESIZE_MODE_ICONS,
	RESIZE_MODES,
} from "./constants";
import { DoubleTapFeedback, SpeedUpIndicator } from "./GestureFeedback";
import PlayerActionBar from "./PlayerActionBar";
import PlayerControls from "./PlayerControls";
import PlayerTopBar from "./PlayerTopBar";
import SpeedSheet from "./SpeedSheet";
import SwipeSeekPreview from "./SwipeSeekPreview";
import TrackSelectionModal from "./TrackSelectionModal";
import usePlayerGestures from "./usePlayerGestures";
import useSubtitles from "./useSubtitles";
import useVideoSource from "./useVideoSource";
import useWatchProgress from "./useWatchProgress";

/**
 * ── `VideoPlayer` ─────────────────────────────────────────────
 *
 * Modern streaming player. Bu dosya YALNIZCA orkestrasyon yapar:
 * durumu tutar, hook'lara bağlar ve katmanları birleştirir.
 *
 * ⭐ PARÇALAMA HARİTASI (1900 → ~600 satır)
 *
 *   `useVideoSource`    kaynak seçimi, HLS/MP4 algılama, biçim kurtarma
 *   `useSubtitles`      altyazı seçimi/indirme/ayrıştırma/zaman kaydırma
 *   `useWatchProgress`  "kaldığın yerden devam et" + izleme geçmişi
 *   `usePlayerGestures` TÜM dokunma jestleri (tek state makinesi)
 *   `PlayerControls`    alt çubuk (süre, çubuk, resize, hız)
 *   `SpeedSheet`        oynatma hızı seçici
 *   `SwipeSeekPreview`  sürükleme seek önizlemesi
 *   `BrightnessVolumeHud` parlaklık/ses HUD'u
 *   `GestureFeedback`   çift dokunma + uzun basış göstergesi
 *   `constants.js`      tüm eşik değerleri (tek doğruluk kaynağı)
 *
 * ⚠️ `canSeek` KONUMU: `duration` state'inden SONRA olmalı. Metro `const`→`var`
 * dönüşümü yaptığı için tanım öncesi okumak TDZ hatası VERMEZ; `duration`
 * sessizce `undefined` olur ve `canSeek` kalıcı `false` kalır — yani seek ve
 * "kaldığın yerden devam et" sessizce devre dışı olur.
 */
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
	isLive = false,
	initialSourceIndex = 0,
}) {
	const insets = useSafeAreaInsets();
	const videoRef = useRef(null);
	const { settings, updateSettings } = usePlayerSettings();

	const seekDuration = settings?.seekDuration || 10;
	const hideTimeoutMs = (settings?.controlsTimeout || 4) * 1000;

	// ── Oynatıcı durumu ───────────────────────────────────────
	const [activeSourceIndex, setActiveSourceIndex] =
		useState(initialSourceIndex);
	const [paused, setPaused] = useState(false);
	const [currentTime, setCurrentTime] = useState(0);
	const [duration, setDuration] = useState(0);
	const [playableDuration, setPlayableDuration] = useState(0);
	const [isLoading, setIsLoading] = useState(true);
	const [isBuffering, setIsBuffering] = useState(false);
	const [hasError, setHasError] = useState(false);
	const [errorMessage, setErrorMessage] = useState("");
	const [isLocked, setIsLocked] = useState(false);
	const [showControls, setShowControls] = useState(true);
	// Yön düğmesi kaldırıldığı için (sade arayüz hedefi) durum sabittir;
	// yalnızca `StatusBar` gizlemesi okur.
	const [isLandscape] = useState(true);

	// ── Yeni oynatma durumu ───────────────────────────────────
	const [playbackRate, setPlaybackRate] = useState(
		settings?.playbackSpeed || 1,
	);
	const [effectiveRate, setEffectiveRate] = useState(
		settings?.playbackSpeed || 1,
	);
	const [volume, setVolume] = useState(1);
	const [brightnessDim, setBrightnessDim] = useState(0);
	const [isSpeedSheetOpen, setSpeedSheetOpen] = useState(false);
	const [modalType, setModalType] = useState(null);
	const [availableAudioTracks, setAvailableAudioTracks] = useState([]);
	const [selectedAudioTrackIndex, setSelectedAudioTrackIndex] = useState(null);
	const [isPipActive, setPipActive] = useState(false);
	const [naturalSize, setNaturalSize] = useState(null);

	const lastSavedTimeRef = useRef(0);
	const currentTimeRef = useRef(0);
	const hasMarkedCompleteRef = useRef(false);
	const isLoadedRef = useRef(false);
	const hasAppliedResumeRef = useRef(false);
	const pendingSeekTimeRef = useRef(initialTime || 0);
	// ⚠️ `originalBrightnessRef` KALDIRILDI. Parlaklık geri yüklemesi
	// artık native modülde (`resetBrightness`) yapılıyor; JS tarafında
	// eski değeri tutmak hem gereksiz hem de (izin kontrolü hatası
	// yüzünden) hiç dolmadığı için ölü koddu.

	/*
	 * Üst bar 2. satırı: ses parçasından "AVC · Türkçe · Stereo · AAC"
	 * benzeri bir özet.
	 *
	 * ⚠️ `react-native-video` v6 `AudioTrack` alanları: `title`, `language`,
	 * `codec`, `bitrate`, `trackGroup`, `selected`. `codec` her cihazda
	 * gelmeyebilir; yoksa satın KISMI boş bırakılır (uydurma bilgi
	 * gösterilmez).
	 */
	const audioInfo = useMemo(() => {
		const track = availableAudioTracks?.[selectedAudioTrackIndex ?? 0];
		const raw = track || availableAudioTracks?.[0];
		if (!raw) return {};
		const pick = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);
		return {
			language: pick(raw.language),
			audioCodec: pick(raw.codec)?.toUpperCase(),
			// Kanal sayısı `title` içinde "Türkçe • Stereo • AAC" gibi gelirse
			// oradan ayrıştırılır; yoksa gösterilmez.
			channels: pick(raw.title)?.includes("Stereo")
				? "Stereo"
				: pick(raw.title)?.includes("5.1")
					? "5.1"
					: null,
		};
	}, [availableAudioTracks, selectedAudioTrackIndex]);

	// Üst bar 3. satırı: dizi/bölüm bilgisi.
	const seriesLine = useMemo(() => {
		if (!seriesInfo) return "";
		const parts = [];
		if (seriesInfo.seriesTitle) parts.push(seriesInfo.seriesTitle);
		if (seriesInfo.season != null && seriesInfo.episode != null) {
			parts.push(`S${seriesInfo.season}:B${seriesInfo.episode}`);
		} else if (seriesInfo.episodeTitle) {
			parts.push(seriesInfo.episodeTitle);
		}
		return parts.join(" - ");
	}, [seriesInfo]);

	// ── Aktif kaynak ──────────────────────────────────────────
	const currentSourceData = useMemo(
		() => sources[activeSourceIndex] || null,
		[sources, activeSourceIndex],
	);
	const resolvedUrl = currentSourceData?.result?.url || null;

	/*
	 * Üst bar 1. satırındaki kaynak adı.
	 *
	 * CloudStream'de bu, çıplak kaynak adıdır ("FourPichive"). Önceki
	 * tasarımda uzantı ayrıştırılıyordu ("HDFilmCehennemi | Close" → "Close");
	 * artık ham ad gösteriliyor ve uzantı yalnızca AYRI bir alanda (yoksa
	 * hiç) görünür — ekran görüntüsüyle birebir aynı.
	 */
	const sourceLabel = useMemo(() => {
		const raw =
			currentSourceData?.result?.name || currentSourceData?.extractor || "";
		if (!raw) return "";
		if (raw.includes("|")) return raw.split("|")[0].trim();
		return raw.trim();
	}, [currentSourceData]);

	/*
	 * ⚠️ KONUM: `duration` state'inden SONRA.
	 * HLS canlıda seek edilebilir aralık yoktur (pencere yayınla kayar),
	 * bu yüzden canlı modda seek yüzeyi ve resume mantığı TEK bayrakla kapanır.
	 */
	const canSeek = !isLive && duration > 0;

	// ── Kaynak çözümlemesi ────────────────────────────────────
	const {
		videoSource,
		videoKey,
		formatRetryRef,
		toggleOverrideType,
		resetOverride,
	} = useVideoSource({
		sources,
		activeSourceIndex,
		currentSourceData,
		onFormatOverride: () => {
			setHasError(false);
			setIsLoading(true);
		},
	});

	// ── Altyazılar ───────────────────────────────────────────
	const subtitles = useSubtitles({
		currentSourceData,
		settings,
		currentTime,
		onResetOffset: () => startHideTimerRef.current?.(),
	});

	// ── İzleme ilerlemesi ────────────────────────────────────
	const {
		handleProgress: trackProgress,
		markComplete,
		setResumeTarget,
		noteUserSeek,
	} = useWatchProgress({
		contentId,
		contentType,
		title,
		poster,
		targetUrl,
		seriesInfo,
		plugin,
		subtitle,
		isLive,
		canSeek,
		resolvedUrl,
		resumeTarget: initialTime,
		onProgress: onProgressUpdate,
	});

	// ── Kontrollerin otomatik gizlenmesi ─────────────────────
	const hideTimerRef = useRef(null);

	const startHideTimer = useCallback(() => {
		if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
		hideTimerRef.current = setTimeout(() => {
			setShowControls(false);
		}, hideTimeoutMs);
	}, [hideTimeoutMs]);

	const startHideTimerRef = useRef(startHideTimer);
	useEffect(() => {
		startHideTimerRef.current = startHideTimer;
	}, [startHideTimer]);

	// `handleScreenTouch` bir olay işleyicisinde "tek dokunuş kontrolleri
	// KAPATTI mı, AÇTI mı" ayrımı yapar; `setShowControls` asenkron
	// olduğu için aynı işleyicide okunan `showControls` HÂLÂ eski değerdir.
	const showControlsRef = useRef(showControls);
	useEffect(() => {
		showControlsRef.current = showControls;
	}, [showControls]);

	useEffect(() => {
		if (showControls && !paused && !isLocked) {
			startHideTimer();
		} else if (hideTimerRef.current) {
			clearTimeout(hideTimerRef.current);
		}
		return () => {
			if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
		};
	}, [showControls, paused, isLocked, startHideTimer]);

	// ── Seek yardımcıları ────────────────────────────────────
	const seekTo = useCallback(
		(seconds) => {
			if (!videoRef.current || !canSeek) return;
			const clamped = Math.max(0, Math.min(duration, seconds));
			// Gerçek kullanıcı seek'i (sorun 3/4 — bkz. `noteUserSeek`).
			noteUserSeek();
			videoRef.current.seek(clamped);
			setCurrentTime(clamped);
			currentTimeRef.current = clamped;
		},
		[canSeek, duration, noteUserSeek],
	);

	const seekBy = useCallback(
		(deltaSeconds) => {
			if (!videoRef.current || !canSeek) return;
			const next = Math.max(0, Math.min(duration, currentTime + deltaSeconds));
			// ⚠️ SORUN 3/4: bu gerçek bir kullanıcı seek'idir. İlerleme
			// motoruna bildirilir ki arabellek çıkışıyla karıştırılmasın.
			noteUserSeek();
			videoRef.current.seek(next);
			setCurrentTime(next);
			currentTimeRef.current = next;
			startHideTimerRef.current?.();
		},
		[canSeek, currentTime, duration, noteUserSeek],
	);

	const togglePlayPause = useCallback(() => {
		setPaused((prev) => !prev);
		startHideTimerRef.current?.();
	}, []);

	// ── Parlaklık / ses jestleri ─────────────────────────────
	/*
	 * ⚠️ KULLANICI ŞİKÂYETİ (sorun 2): "gösterge değişiyor ama telefonun
	 * seviyesi değişmiyor".
	 *
	 * İki ayrı yol var ve BİRLİKTE çalışmalı:
	 *
	 *   · SİSTEM seviyesi — `expo-brightness` (WRITE_SETTINGS izniyle)
	 *     ve `react-native-volume-manager`. Kullanıcının telefonunda
	 *     gerçekten değişen budur; HUD'un gösterdiği de budur.
	 *
	 *   · OYNATICI `volume` prop'u — sistem erişimi yoksa (izin
	 *     verilmemiş / web / modül yüklenememiş) yedek yol. Sistem
	 *     yazılamıyorsa `false` döner ve oynatıcıya düşeriz.
	 *
	 * ⚠️ `ensureBrightnessPermission` OYNATICI AÇILINCA bir kez çağrılır;
	 * ilk açılışta sistem ayarları ekranı açılır.
	 */
	useEffect(() => {
		let cancelled = false;
		ensureBrightnessPermission().then((granted) => {
			if (cancelled) return;
			// `granted` bilgisi artık JS tarafında kullanılmıyor: parlaklık
			// yazımı ve GERİ YÜKLEME tamamen native modülde karar veriliyor.
			// JS tarafındaki eski geri yükleme yolu kaldırıldı — çünkü
			// (a) `originalBrightnessRef` yalnızca izin granted ise
			//     doluyordu ve `checkSelfPermission(WRITE_SETTINGS)` her
			//     zaman false döndüğü için ASLA dolmuyordu,
			// (b) pencere override'ını (`window.attributes`) hiçbir yol
			//     temizlemiyordu: oynatıcıdan çıkınca ekran kısık kalıyordu.
		});
		return () => {
			cancelled = true;
		};
	}, []);

	const applyBrightness = useCallback(async (ratio) => {
		const target = Math.max(MIN_BRIGHTNESS, Math.min(1, ratio));
		// Sistem parlaklığına yaz: kullanıcı bunu istedi.
		const written = await setBrightness(target);
		// Sistem yazılamadıysa oynatıcı içi karartma uygula ki jest
		// yine de görünür bir etki üretsin.
		setBrightnessDim(written || target >= 1 ? 0 : (1 - target) * 0.6);
	}, []);

	const applyVolume = useCallback(async (ratio) => {
		/*
		 * ⚠️ ASIL "FULLEMIYOR" HATASI (video kanıtı + aritmetik).
		 *
		 * Önceki hâli:
		 *     const systemTarget = clamp(ratio / 2, 0, 1);
		 *
		 * `ratio`, `extraVolume` kapalıyken (VARSAYILAN) 0..1 aralığındadır.
		 * Yani kullanıcı HUD'da %100'e kadar göstergiyi sonuna kadar
		 * getirse bile sistem sesi `%50`'ye yazılıyordu. Kullanıcının
		 * "ekran sesi fullemeye yetmiyor" şikâyeti TAM olarak budur —
		 * `/ 2` yalnızca `extraVolume` AÇIKKEN anlamlıdır, ama o zaman
		 * bile sistem 1'in üstüne çıkamaz.
		 *
		 * DÜZELTME: sistem hedefi doğrudan `ratio`'nun kendisi (0..1).
		 * Sistem stream'inin tavanı 1.0 olduğu için `extraVolume`
		 * açıkken de 1'in üstü SES olarak ifade edilemez; HUD %200'ü
		 * gösterir ama gerçek ses %100'de kalır (tek gösterge ilkesi).
		 */
		const systemTarget = Math.max(0, Math.min(1, ratio));

		/*
		 * ⚠️ İKİ SES KATMANI YOK.
		 *
		 * `Video volume={volume}` prop'u ikinci bir kazanç çarpanıdır.
		 * Sistem seviyesi zaten `STREAM_MUSIC` üzerinden uygulandığı için
		 * buraya da aynı değeri yazmak sesi İKİ KEZ düşürürdü
		 * (0.5 × 0.5 = 0.25 tipik sonuç). Bu, "player ve telefon farklı
		 * çalışıyor" gözleminin diğer yarısıydı.
		 *
		 * Karar: sistem yazılabiliyorsa oynatıcı DAİMA 1.0'da kalır —
		 * tek doğruluk kaynağı sistemdir. Yalnızca sistem erişimi yoksa
		 * (web / modül yok) oynatıcı içi yedeğe düşülür.
		 */
		const written = await setSystemVolume(systemTarget);
		if (written) {
			setVolume(1);
		} else {
			setVolume(systemTarget);
		}
	}, []);

	/*
	 * Parlaklığı çıkışta oynatıcı öncesine döndür.
	 *
	 * ⚠️ `window.attributes.screenBrightness` yalnızca Activity YOK OLUNCA
	 * sıfırlanır. Oynatıcıdan çıkarken Activity yaşamaya devam ettiği için
	 * değer pencerede kalıyor ve kullanıcı oynatıcıdan çıktığında ekranı
	 * hâlâ kısık görüyordu.
	 *
	 * Artık JS tarafında eski değeri saklayıp geri yüklemek yerine tek bir
	 * native çağrı yapılıyor: `resetBrightness()` hem pencere override'ını
	 * kaldırır hem de sistem seviyesine yazıldıysa eski değeri geri yükler.
	 *
	 * ⚠️ Bu, eski `originalBrightnessRef` yolunun YERİNİ alır. O yol
	 * çift kaynaktı ve (izin kontrolü hatası yüzünden) hiç çalışmıyordu.
	 */
	useEffect(() => {
		return () => {
			resetBrightness();
		};
	}, []);

	// ── Jest bayrakları (ayarlardan) ─────────────────────────
	const gestureFlags = useMemo(
		() => ({
			doubleTapSeek: settings?.doubleTapSeek !== false,
			doubleTapPause: settings?.doubleTapPause !== false,
			swipeSeek: settings?.swipeSeek !== false,
			verticalSwipe: settings?.verticalSwipe !== false,
			extraBrightness: Boolean(settings?.extraBrightness),
			extraVolume: Boolean(settings?.extraVolume),
			longPressSpeedUp: settings?.longPressSpeedUp !== false,
			longPressSpeedUpDelay: settings?.longPressSpeedUpDelay || 500,
			pinchZoom: settings?.pinchZoom !== false,
		}),
		[settings],
	);

	// ── Tüm dokunma jestleri ────────────────────────────────
	const {
		panHandlers,
		doubleTapInfo,
		scrubInfo,
		hud,
		speedUpActive,
		zoomScale: zoomScale,
	} = usePlayerGestures({
		canSeek,
		isLive,
		isLocked,
		duration,
		currentTime,
		seekDuration,
		flags: gestureFlags,
		onSeek: seekTo,
		onSeekBy: seekBy,
		onTogglePlayPause: togglePlayPause,
		onSingleTap: () => {
			setShowControls((prev) => !prev);
		},
		onHoldSpeedUp: (active) => {
			setEffectiveRate(
				active ? settings?.longPressSpeedRate || 2 : playbackRate,
			);
		},
		onBrightness: applyBrightness,
		onVolume: applyVolume,
		onInteractionStart: () => {
			setShowControls(false);
		},
		onInteractionEnd: () => {
			startHideTimerRef.current?.();
		},
	});

	// ── Boyut / yön ──────────────────────────────────────────
	const [resizeMode, setResizeMode] = useState(
		settings?.defaultResizeMode || "contain",
	);

	const cycleResize = useCallback(() => {
		setResizeMode((prev) => {
			const i = RESIZE_MODES.indexOf(prev);
			return RESIZE_MODES[(i + 1) % RESIZE_MODES.length];
		});
		// Resize değişince zoom SIFIRLANIR (CloudStream `clearZoomState`):
		// eski ölçek yeni resize modunda bozulmuş bir kadraj bırakır.
		startHideTimerRef.current?.();
	}, []);

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

	// ── Hız ─────────────────────────────────────────────────
	const selectRate = useCallback(
		(rate) => {
			const clamped = Math.max(
				MIN_PLAYBACK_RATE,
				Math.min(MAX_PLAYBACK_RATE, rate),
			);
			setPlaybackRate(clamped);
			setEffectiveRate(clamped);
			// Kalıcı: kullanıcı bir kez seçince sonraki açılışlarda da geçerli.
			updateSettings?.({ playbackSpeed: clamped });
			startHideTimerRef.current?.();
		},
		[updateSettings],
	);

	// ── Resume ──────────────────────────────────────────────
	/*
	 * ⚠️ Bu effect yalnızca REF sıfırlar; `setState` ÇAĞRILMAZ.
	 * Effect gövdesinde senkron `setState` ardışık render tetikler
	 * (React `set-state-in-effect` kuralı). Zoom'u ayrı bir `key` ile
	 * sıfırlamak yerine türetilmiş tutuyoruz.
	 */
	useEffect(() => {
		hasMarkedCompleteRef.current = false;
		lastSavedTimeRef.current = 0;
		isLoadedRef.current = false;
		hasAppliedResumeRef.current = false;
		pendingSeekTimeRef.current = 0;
	}, [targetUrl, seriesInfo?.episode, seriesInfo?.season]);

	useEffect(() => {
		const t = Number(initialTime) || 0;
		if (t <= 0 || hasAppliedResumeRef.current) return;
		hasAppliedResumeRef.current = true;
		if (!isLoadedRef.current) {
			pendingSeekTimeRef.current = t;
			return;
		}
		if (!isLive && videoRef.current) {
			videoRef.current.seek(t);
			setCurrentTime(t);
			currentTimeRef.current = t;
		}
	}, [initialTime, isLive]);

	// ── Oynatıcı olayları ───────────────────────────────────
	const handleLoad = (data) => {
		setIsLoading(false);
		setHasError(false);
		const dur = data.duration || 0;
		setDuration(dur);
		isLoadedRef.current = true;

		/*
		 * Çözünürlük bilgisi CloudStream üst barında "1920×1080" olarak
		 * görünür. `react-native-video` `naturalSize`'ı `onLoad` ile verir;
		 * dikey videolarda width/height takas edilmiş gelebilir, bu yüzden
		 * uzun kenar önce yazılır.
		 */
		if (data.naturalSize?.width && data.naturalSize?.height) {
			const { width: w, height: h } = data.naturalSize;
			const portrait = h > w;
			setNaturalSize({
				width: portrait ? h : w,
				height: portrait ? w : h,
			});
		}

		if (Array.isArray(data.audioTracks) && data.audioTracks.length > 0) {
			setAvailableAudioTracks(data.audioTracks);
		}
		if (Array.isArray(data.textTracks) && data.textTracks.length > 0) {
			subtitles.setStreamTextTracks(data.textTracks);
		}

		/*
		 * ⚠️ Burada `canSeek` KULLANILMAZ: bu callback `setDuration(dur)`
		 * çağrısından ÖNCEki render'da kapanmıştır, yani `duration` hâlâ 0'dır
		 * ve `canSeek` `false` döner. Resume tam da `onLoad`da uygulanması
		 * gerektiği için bu kapı kalıcı kapalı kalırdı. `onLoad`ın eline geçen
		 * `dur` doğrudan kullanılır.
		 */
		if (
			!isLive &&
			dur > 0 &&
			pendingSeekTimeRef.current > 0 &&
			videoRef.current
		) {
			/*
			 * ⚠️ YENİ KAYNAK daha kısa olabilir (ör. aynı bölümün farklı
			 * kalitesi/CDN'i). Hedef süre sürenin ötesindeyse seek başarısız
			 * olur ve video sessizce baştan başlar. Bu yüzden hedef
			 * `dur` ile kırpılır.
			 */
			const raw = pendingSeekTimeRef.current;
			const target = Math.max(0, Math.min(raw, Math.max(0, dur - 0.5)));

			/*
			 * ⚠️ Referans seek ÇALIŞTIKtan SONRA sıfırlanır, önce değil.
			 * Önceden sıfırlanırsa `onLoad` ikinci kez geldiğinde (yeni
			 * kaynak hazır olduğunda sık olur) bekleyen hedef kaybolur ve
			 * video baştan başlar — aynı hatanın ikinci bir yolu.
			 */
			setTimeout(() => {
				if (pendingSeekTimeRef.current !== raw) return;
				// Resume da gerçek bir seek'tir; ilerleme motoruna bildir.
				noteUserSeek();
				videoRef.current?.seek(target);
				/*
				 * ⚠️ SORUN 7: Kayıt motoruna resume hedefini bildir.
				 *
				 * Yavaş bağlantıda seek uygulanana kadar `onProgress` düşük
				 * konumlar bildirir. Hedef bildirilmezse ilk 10 saniye
				 * kaydedilir ve kayıtlı ilerleme (ör. 30:00) SİLİNİR —
				 * kullanıcı "kaldığın yerden devam et video tarafından
				 * eziliyor" diye bildiriyor.
				 *
				 * `trackProgress`, bu hedefe ulaşılmadan kayıt YAPMAZ.
				 */
				setResumeTarget(target);
				pendingSeekTimeRef.current = 0;
				setCurrentTime(target);
				currentTimeRef.current = target;
			}, 300);
		}
	};

	// `handleProgress` içinde süre state'i bayat olabilir; ref tutar.
	const durationRef = useRef(0);
	useEffect(() => {
		durationRef.current = duration;
	}, [duration]);

	/*
	 * ⚠️ KRİTİK DÜZELTME — "seek yapınca kaldığın yerden devam et bozuluyor,
	 * toplam süre yanlış iletiliyor, kendi kendine tamamlandı yapıyor".
	 *
	 * Önceden buraya `data.playableDuration` geçiriliyordu. O YANLIŞTIR:
	 *
	 *   duration         → videonun TOPLAM süresi (onLoad'dan gelir, sabit)
	 *   playableDuration → şu ana kadar ARABELLEKLENMİŞ miktar (sürekli değişir)
	 *
	 * Seek yapıldığında `playableDuration` anlık olarak küçülür (yeni konum
	 * henüz arabelleğe alınmamıştır). Böylece oran:
	 *   · çoğu zaman %98-99'a çıkıp içeriği "tamamlandı" sayıyordu,
	 *   · bazen %15000 gibi değerlere çıkıyordu,
	 *   · kaydedilen `duration` alanı GERÇEK SÜRE DEĞİLDİĞİ için "Kaldığın
	 *     Yerden Devam Et" kartı yanlış toplam süre gösteriyordu (kullanıcı
	 *     ekran görüntüsündeki "00:02 / -56:49" gibi).
	 *
	 * İlerleme hesabı ve kayıt YALNIZCA `duration` kullanır. `playableDuration`
	 * sadece ilerleme çubuğunun "buffer" çubuğunu besler.
	 */
	const handleProgress = (data) => {
		const curTime = data.currentTime || 0;
		setCurrentTime(curTime);
		currentTimeRef.current = curTime;
		setPlayableDuration(data.playableDuration || 0);
		trackProgress(curTime, durationRef.current);
	};

	const handleBuffer = (meta) => setIsBuffering(Boolean(meta.isBuffering));

	/*
	 * ── Kaynak değiştirme (TEK YOL) ────────────────────────────
	 *
	 * ⚠️ KÖK NEDEN (kullanıcı: "kaynak değişimi yapıldığında video
	 * baştan başlayabiliyor").
	 *
	 * Kaynak değiştirmenin ÜÇ ayrı yolu vardı ve konumu koruyan yalnızca
	 * biriydi:
	 *
	 *   1. Elle kaynak seçimi  → `pendingSeekTimeRef` yazılıyordu ✓
	 *   2. Otomatik yedekleme  → YAZILMIYORDU ✗  ← asıl hata
	 *   3. "Tekrar dene" butonu → YAZILMIYORDU ✗
	 *
	 * `videoKey` değiştiği için `<Video>` tamamen yeniden mount olur ve
	 * `onLoad` 0 konumdan başlar. Yedekleme yolunda konum taşınmadığı
	 * için video baştan başlıyordu. "Bulabiliyor" ifadesi de bunun
	 * yanıltıcı görünmesinin nedeni: yedekleme yalnızca kaynak
	 * bozulduğunda tetiklendiği için ara sıra oluyor.
	 *
	 * Artık ÜÇ yol da buradan geçiyor.
	 *
	 * ⚠️ `currentTimeRef.current` kullanılıyor, `currentTime` state'i
	 * değil: hata anında state bayat olabilir (`setState` henüz işlenmemiş
	 * olabilir) ve 0 konuma düşülebilirdi.
	 *
	 * ⚠️ `handleError`'dan ÖNCE tanımlanmalı: Metro `const`→`var`
	 * yaptığı için use-before-define THROW ETMEZ, sessizce `undefined`
	 * okur. Bu dosyada bu tuzak daha önce yaşandı.
	 */
	const switchSourceTo = (index) => {
		// Canlıda "doğru konum" diye bir şey yok; eski konuma atlamak
		// yayını kaçırır → 0 yazılır.
		const keepPosition = !isLive && settings?.autoResume !== false && canSeek;

		pendingSeekTimeRef.current = keepPosition ? currentTimeRef.current : 0;
		resetOverride();
		setIsLoading(true);
		setHasError(false);
		setActiveSourceIndex(index);
		setAvailableAudioTracks([]);
		setSelectedAudioTrackIndex(null);
		subtitles.resetForNewSource();
	};

	const handleEnd = () => {
		/*
		 * ⚠️ Video GERÇEKTEN sonuna ulaştı → koşulsuz tamamlandı.
		 *
		 * Kullanıcı isteği: "sardırma yaparak bitirsem bile bu özellik
		 * çalışmalı, önceden çalışıyordu."
		 *
		 * `force = true` ile "izlenen süre" eşiği atlanır: kullanıcı
		 * sonuna kadar sarmış olsa bile içerik bitmiştir ve tamamlanmış
		 * sayılmalıdır. Bu, Netflix / YouTube / Prime davranışıdır.
		 *
		 * %95'e kadar sarıp ÇIKAN kullanıcı için eşik korunur (bkz.
		 * `markComplete` içindeki açıklama).
		 *
		 * Canlıda "bitti" anı yoktur (`onEnd` = yayın koptu).
		 */
		if (!isLive) markComplete(true);
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

		// Biçim hatası → ters türle bir kez dene.
		if (isFormatError && !formatRetryRef.current) {
			if (toggleOverrideType()) return;
		}

		// Sonraki kaynağa otomatik geç.
		const hasMoreSources = activeSourceIndex < sources.length - 1;
		if ((isFormatError || errorCode?.startsWith("2")) && hasMoreSources) {
			console.log(`Source ${activeSourceIndex} failed, trying next...`);
			// ⚠️ Konum korunur: bu yol daha önce `pendingSeekTimeRef`'i
			// yazmıyordu ve video baştan başlıyordu.
			switchSourceTo(activeSourceIndex + 1);
			return;
		}

		setHasError(true);
		setErrorMessage(
			error?.error?.errorString ||
				"Video oynatılamadı. Lütfen farklı bir kaynak seçin.",
		);
	};

	const handleSelectSource = (index) => {
		if (index === activeSourceIndex) return;
		// Konum koruma dahil TÜM kaynak değiştirme mantığı tek yolda.
		switchSourceTo(index);
	};

	// ── Altyazı / ses izi prop'ları ─────────────────────────
	const videoTextTrackProp = useMemo(() => {
		const sub = subtitles.selectedSubtitle;
		if (!sub) return { type: "disabled" };
		if (sub.title) return { type: "title", value: sub.title };
		if (typeof sub.index === "number")
			return { type: "index", value: sub.index };
		return { type: "disabled" };
	}, [subtitles.selectedSubtitle]);

	const videoAudioTrackProp = useMemo(
		() =>
			selectedAudioTrackIndex === null
				? { type: "system" }
				: { type: "index", value: selectedAudioTrackIndex },
		[selectedAudioTrackIndex],
	);

	// ── Picture-in-Picture ──────────────────────────────────
	const enterPip = useCallback(() => {
		// react-native-video v6: `enterPictureInPictureOnLeave` prop'u
		// otomatik geçişi sağlar; elle tetikleme v6'da doğrudan bir ref
		// metodu değil, native bildirim üzerinden çalışır.
		setPipActive(true);
	}, []);

	/*
	 * PiP'ten çıkınca kontrolleri yeniden göster.
	 *
	 * ⚠️ `setShowControls` effect GÖVDESİNDE çağrılmaz; PiP olayı
	 * (`onPictureInPictureStatusChanged`) içinde yapılır. Effect gövdesinde
	 * senkron setState, ardışık render tetikler.
	 */

	// ── Kumanda (TV) ────────────────────────────────────────
	useTVRemote((eventType) => {
		if (!showControls) {
			if (
				eventType === "playPause" ||
				eventType === "play" ||
				eventType === "pause"
			) {
				togglePlayPause();
				return;
			}
			if (canSeek && (eventType === "left" || eventType === "rewind")) {
				seekBy(-seekDuration);
				return;
			}
			if (canSeek && (eventType === "right" || eventType === "fastForward")) {
				seekBy(seekDuration);
				return;
			}
			setShowControls(true);
			startHideTimerRef.current?.();
		} else {
			startHideTimerRef.current?.();
			if (eventType === "playPause") {
				togglePlayPause();
			} else if (eventType === "rewind") {
				seekBy(-seekDuration);
			} else if (eventType === "fastForward") {
				seekBy(seekDuration);
			}
		}
	}, true);

	// ── Donanım geri tuşu hiyerarşisi ───────────────────────
	useEffect(() => {
		const onBackPress = () => {
			if (isSpeedSheetOpen) {
				setSpeedSheetOpen(false);
				return true;
			}
			if (modalType !== null) {
				setModalType(null);
				startHideTimerRef.current?.();
				return true;
			}
			if (showControls) {
				setShowControls(false);
				return true;
			}
			if (onClose) {
				onClose();
				return true;
			}
			return false;
		};
		const sub = BackHandler.addEventListener("hardwareBackPress", onBackPress);
		return () => sub.remove();
	}, [isSpeedSheetOpen, modalType, showControls, onClose]);

	// ── Çubuk sürükleme ─────────────────────────────────────
	const handleScrubMove = useCallback(
		(ratio) => {
			seekTo(ratio * duration);
		},
		[seekTo, duration],
	);

	const bufferRatio =
		duration > 0 ? Math.min(1, Math.max(0, playableDuration / duration)) : 0;

	const subtitleBottom = showControls ? 100 : 36;

	return (
		<View style={styles.container}>
			<StatusBar hidden={isLandscape || !showControls} />

			{/*
			 * Karartma katmanı — sistem parlaklığı YAZILAMADIĞINDA devreye
			 * girer (`WRITE_SETTINGS` verilmemişse). Bu olmadan jest
			 * "gösterge değişiyor ama ekran değişmiyor" olarak hissedilir;
			 * bu katman en azından GÖRSEL geri bildirim verir.
			 *
			 * ⚠️ Sistem yazılabiliyorsa `brightnessDim` 0'dır ve bu katman
			 * render edilmez — çift karartma olmaz.
			 */}
			{brightnessDim > 0 ? (
				<View
					style={[styles.dimLayer, { opacity: brightnessDim }]}
					pointerEvents="none"
				/>
			) : null}

			{/* 1. KATMAN: Video */}
			{videoSource ? (
				<View
					style={[
						StyleSheet.absoluteFill,
						zoomScale !== 1 && {
							transform: [{ scale: zoomScale }],
						},
					]}
					pointerEvents="none"
				>
					<Video
						key={videoKey}
						ref={videoRef}
						source={videoSource}
						style={StyleSheet.absoluteFill}
						resizeMode={resizeMode}
						paused={paused}
						rate={effectiveRate}
						volume={1}
						muted={volume === 0}
						onLoad={handleLoad}
						onProgress={handleProgress}
						onBuffer={handleBuffer}
						onEnd={handleEnd}
						onError={handleError}
						onAudioTracks={(d) =>
							Array.isArray(d.audioTracks) &&
							setAvailableAudioTracks(d.audioTracks)
						}
						onPictureInPictureStatusChanged={(d) => {
							const active = Boolean(d?.isActive);
							setPipActive(active);
							// PiP'ten çıkınca kontrolleri geri getir.
							if (!active) setShowControls(true);
						}}
						selectedTextTrack={videoTextTrackProp}
						selectedAudioTrack={videoAudioTrackProp}
						progressUpdateInterval={500}
						ignoreSilentSwitch="ignore"
						poster={poster}
						controls={false}
						posterResizeMode="cover"
						useTextureView={true}
						playInBackground={settings?.playInBackground !== false}
						enterPictureInPictureOnLeave={settings?.pictureInPicture !== false}
					/>
				</View>
			) : (
				<View style={styles.noSourceContainer}>
					<Text style={styles.noSourceText}>
						Video kaynağı yükleniyor veya bulunamadı...
					</Text>
				</View>
			)}

			{/*
			 * 2. KATMAN: Dokunma yüzeyi (tüm jestler).
			 *
			 * ⚠️ BU YÜZEY BUTONLARIN ATASI OLMAZ — KARDEŞİDİR.
			 * (Kullanıcı: "player düğmeleri basıldığında tepki veriyor ama
			 * işlevlerini gerçekleştirmiyor".)
			 *
			 * React Native dokunuş responder'ını şöyle dağıtır: MOVE
			 * olaylarında mevcut responder ile yeni hedefin EN DÜŞÜK ORTAK
			 * ATASI bulunur ve `moveShouldSetResponder` yalnızca o ortak
			 * atasın alt ağacına dağıtılır.
			 *
			 * Kontroller bu yüzeyin İÇİNDE olsaydı ortak atas yüzeyin
			 * kendisi olurdu; `onMoveShouldSetPanResponder` koşulsuz `true`
			 * döndüğü için butonun responder'ı her harekette alınır ve
			 * `onPress` iptal edilir.
			 *
			 * KARDEŞ yapıldığında ortak atas ortak EBEVEYN olur ve bu
			 * yüzey, butonlardan başlayan hareketleri HİÇ görmez. Yapısal
			 * çözüm: `cancelable` gibi kenar ayarlarına gerek kalmaz ve
			 * `Pressable` uygulamasına bağımlı kalmaz.
			 *
			 * ⚠️ Bu yüzey ÇOCUKSIZ bırakıldı; içine hiçbir düğme konmaz.
			 */}
			<View
				style={[
					StyleSheet.absoluteFill,
					{
						zIndex: 5,
						backgroundColor: showControls
							? "rgba(0, 0, 0, 0.45)"
							: "transparent",
					},
				]}
				{...panHandlers}
			/>

			{/*
			 * 3. KATMAN: Kontroller — jest yüzeyinin ÜSTÜNDE ve KARDEŞİ.
			 *
			 * `pointerEvents: "box-none"` → boş alanlardan dokunuş
			 * doğrudan jest yüzeyine geçer (tek dokunma, çift dokunma ve
			 * sürükleme çalışmaya devam eder), düğmelere ise dokunulur.
			 */}
			{showControls && (
				<View
					style={[
						// ⚠️ `StyleSheet.absoluteFill` ZORUNLU (kullanıcı:
						// "kontroller ekrana yayılmamış, ekranın orta
						// kısmında bir alana toplanmış").
						//
						// `styles.container` içinde `alignItems: "center"` var.
						// Kontroller bu yüzeyin İÇİNDE olduğu sürece sorun
						// yoktu: `absoluteFill` `left/right/top/bottom: 0`
						// zorladığı için `alignItems` onu etkilemiyordu.
						//
						// Jest yüzeyinin kardeşi yapılınca bu zorlama ortadan
						// kalktı ve `alignItems: "center"` kontrol katmanını
						// İÇERİK GENİŞLİĞİNE daraltıp ortalamaya başladı:
						// üst bar, orta düğmeler ve alt bar ekranın ortasında
						// bir kümeye toplandı.
						//
						// `absoluteFill` geri getirilerek katman yine tüm
						// ekranı kaplıyor; `justifyContent: "space-between"`
						// (controlsLayer) üst/alt barı tekrar uçlara dağıtıyor.
						StyleSheet.absoluteFill,
						styles.controlsLayer,
						{
							zIndex: 6,
							paddingTop: Math.max(insets.top, 16),
							paddingBottom: Math.max(insets.bottom, 16),
							paddingLeft: Math.max(insets.left, 16),
							paddingRight: Math.max(insets.right, 16),
						},
					]}
					pointerEvents="box-none"
				>
					{/*
					 * ⭐ ÜST BAR (CloudStream düzeni): solda geri düğmesi,
					 * ortada 3 satırlık bilgi bloğu — kaynak-çözünürlük,
					 * codec/dil/kanal, dizi-bölüm. Sağda PiP düğmesi.
					 */}
					<PlayerTopBar
						title={title}
						subtitle={subtitle}
						sourceName={sourceLabel}
						naturalSize={naturalSize}
						audioInfo={audioInfo}
						seriesLine={seriesLine}
						onClose={() => {
							startHideTimerRef.current?.();
							onClose?.();
						}}
						onAction={
							settings?.pictureInPicture !== false && !Platform.isTV ? (
								<TVPressable
									style={styles.iconButton}
									focusedStyle={styles.iconButtonFocused}
									cancelable={false}
									onPress={() => {
										startHideTimerRef.current?.();
										enterPip();
									}}
								>
									{/*
									 * ⚠️ `picture-in-picture-outline` Ionicons'ta YOKTUR ve
									 * "soru işareti" kutusu üretir. `tablet-landscape-outline`
									 * glyphmap'te DOĞRULANMIŞTIR.
									 */}
									<Ionicons
										name="tablet-landscape-outline"
										size={20}
										color={isPipActive ? "#FF3B30" : "#FFFFFF"}
									/>
								</TVPressable>
							) : null
						}
					/>

					{/*
					 * ⭐ ORTA KATMAN: CloudStream'de tek bir büyük play/pause
					 * düğmesi yok; üçlü (geri / oynat / ileri) ince ve
					 * zeminSİZ durur. Öncedki büyük kırmızı daire kaldırıldı.
					 */}
					{!isLocked && (
						<View style={styles.centerControls} pointerEvents="box-none">
							{canSeek ? (
								<TVPressable
									style={styles.roundButton}
									focusedStyle={styles.roundButtonFocused}
									cancelable={false}
									onPress={() => seekBy(-seekDuration)}
								>
									<View style={styles.roundInner}>
										<Ionicons
											name="play-back-circle-outline"
											size={30}
											color="#FFFFFF"
										/>
										<Text style={styles.roundLabel}>{seekDuration}</Text>
									</View>
								</TVPressable>
							) : (
								<View style={styles.roundSpacer} />
							)}

							<TVPressable
								autoFocus={showControls}
								style={styles.playButton}
								focusedStyle={styles.playButtonFocused}
								cancelable={false}
								onPress={togglePlayPause}
							>
								<Ionicons
									name={paused ? "play" : "pause"}
									size={34}
									color="#FFFFFF"
								/>
							</TVPressable>

							{canSeek ? (
								<TVPressable
									style={styles.roundButton}
									focusedStyle={styles.roundButtonFocused}
									cancelable={false}
									onPress={() => seekBy(seekDuration)}
								>
									<View style={styles.roundInner}>
										<Ionicons
											name="play-forward-circle-outline"
											size={30}
											color="#FFFFFF"
										/>
										<Text style={styles.roundLabel}>{seekDuration}</Text>
									</View>
								</TVPressable>
							) : (
								<View style={styles.roundSpacer} />
							)}
						</View>
					)}

					{/* ⭐ ALT KATMAN: ilerleme çubuğu + aksiyon çubuğu */}
					{!isLocked && (
						<View pointerEvents="box-none">
							<PlayerControls
								currentTime={currentTime}
								duration={duration}
								bufferRatio={bufferRatio}
								isLive={isLive}
								showRemainingTime={Boolean(settings?.showRemainingTime)}
								onScrubMove={handleScrubMove}
								onScrubEnd={handleScrubMove}
							/>

							<PlayerActionBar
								actions={[
									{
										key: "lock",
										icon: isLocked ? "lock-closed" : "lock-open-outline",
										label: "Kilitle",
										active: isLocked,
										onPress: () => {
											startHideTimerRef.current?.();
											setIsLocked((prev) => !prev);
										},
									},
									{
										key: "resize",
										icon: RESIZE_MODE_ICONS[resizeMode] || "expand-outline",
										label: "Yeniden boyutlandır",
										disabled: isLive,
										onPress: () => {
											startHideTimerRef.current?.();
											cycleResize();
										},
									},
									{
										key: "subsync",
										icon: "chatbubble-ellipses-outline",
										label: "Altyazı senkronu",
										active: subtitles.subtitleOffset !== 0,
										onPress: () => {
											startHideTimerRef.current?.();
											setModalType("subtitles");
										},
									},
									{
										key: "source",
										icon: "server-outline",
										label: "Kaynak",
										onPress: () => {
											startHideTimerRef.current?.();
											setModalType("sources");
										},
									},
									{
										key: "tracks",
										icon: "options-outline",
										label: "Parçalar",
										active: selectedAudioTrackIndex !== null,
										onPress: () => {
											startHideTimerRef.current?.();
											setModalType("tracks");
										},
									},
									{
										key: "speed",
										icon: "speedometer-outline",
										label: playbackRate === 1 ? "Hız" : `${playbackRate}×`,
										active: playbackRate !== 1,
										disabled: isLive,
										onPress: () => {
											setSpeedSheetOpen(true);
											if (hideTimerRef.current)
												clearTimeout(hideTimerRef.current);
										},
									},
								]}
							/>
						</View>
					)}
				</View>
			)}

			{/* 4. KATMAN: Altyazı */}
			{subtitles.currentSubtitleText ? (
				<View
					style={[styles.subtitleContainer, { bottom: subtitleBottom }]}
					pointerEvents="none"
				>
					<View
						style={[
							styles.subtitlePill,
							{
								backgroundColor: subtitleBgColor(settings?.subtitleBgColor),
							},
						]}
					>
						<Text
							style={[
								styles.subtitleText,
								{
									fontSize: settings?.subtitleFontSize || 16,
									color: settings?.subtitleTextColor || "#FFFFFF",
									textShadowColor:
										settings?.subtitleTextShadow !== false
											? "rgba(0, 0, 0, 0.95)"
											: "transparent",
								},
							]}
						>
							{subtitles.currentSubtitleText}
						</Text>
					</View>
				</View>
			) : null}

			{/* 5. KATMAN: Jest geri bildirimleri */}
			<SwipeSeekPreview
				info={scrubInfo}
				currentTime={currentTime}
				duration={duration}
			/>
			<DoubleTapFeedback info={doubleTapInfo} />
			<SpeedUpIndicator active={speedUpActive} rate={effectiveRate} />
			<BrightnessVolumeHud hud={hud} />

			{/* 6. KATMAN: Yükleme / hata */}
			{(isLoading || isBuffering) && !hasError && (
				<View style={styles.centerLoading} pointerEvents="none">
					<ActivityIndicator size="large" color="#FF3B30" />
					<Text style={styles.loadingText}>
						{isLoading ? "Kaynak yükleniyor..." : "Ara belleğe alınıyor..."}
					</Text>
				</View>
			)}

			{hasError && (
				<View style={styles.errorContainer}>
					<Ionicons name="alert-circle-outline" size={54} color="#FF453A" />
					<Text style={styles.errorTitle}>Oynatma Hatası</Text>
					<Text style={styles.errorDescription}>{errorMessage}</Text>
					<View style={styles.errorButtonsRow}>
						{sources.length > 1 && (
							<TouchableOpacity
								style={styles.switchSourceButton}
								onPress={() => setModalType("sources")}
							>
								<Ionicons name="server-outline" size={18} color="#FFFFFF" />
								<Text style={styles.switchSourceButtonText}>
									{`Farklı Kaynak Seç (${sources.length} Kaynak)`}
								</Text>
							</TouchableOpacity>
						)}
						<TouchableOpacity
							style={styles.retryButton}
							onPress={() => {
								// Aynı kaynağı yeniden yükle: `switchSourceTo`
								// konumu da korur (daha önce sıfırlanıyordu).
								switchSourceTo(activeSourceIndex);
							}}
						>
							<Ionicons name="refresh" size={18} color="#FFFFFF" />
							<Text style={styles.retryButtonText}>Yeniden Dene</Text>
						</TouchableOpacity>
					</View>
				</View>
			)}

			{/* 7. KATMAN: Paneller */}
			<SpeedSheet
				visible={isSpeedSheetOpen}
				currentRate={playbackRate}
				onSelect={(r) => {
					selectRate(r);
					setSpeedSheetOpen(false);
				}}
				onClose={() => setSpeedSheetOpen(false)}
			/>

			<TrackSelectionModal
				visible={Boolean(modalType)}
				type={modalType || "sources"}
				onClose={() => {
					setModalType(null);
					startHideTimerRef.current?.();
				}}
				sources={sources}
				selectedSourceIndex={activeSourceIndex}
				onSelectSource={handleSelectSource}
				subtitles={subtitles.allSubtitles}
				selectedSubtitle={subtitles.selectedSubtitle}
				onSelectSubtitle={subtitles.selectSubtitle}
				subtitleOffset={subtitles.subtitleOffset}
				onUpdateSubtitleOffset={subtitles.updateOffset}
				audioTracks={availableAudioTracks}
				selectedAudioTrack={selectedAudioTrackIndex}
				onSelectAudioTrack={(index) => setSelectedAudioTrackIndex(index)}
			/>
		</View>
	);
}

/** Altyazı arka plan rengi (CloudStream `subtitleBgColor` karşılığı). */
function subtitleBgColor(mode) {
	switch (mode) {
		case "solid-black":
			return "#000000";
		case "blur":
			return "rgba(25, 27, 34, 0.92)";
		case "transparent":
			return "transparent";
		case "semi-black":
		default:
			return "rgba(0, 0, 0, 0.78)";
	}
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: "#000000",
		justifyContent: "center",
		alignItems: "center",
	},
	/*
	 * Sistem parlaklığı yazılamadığında devreye giren karartma katmanı
	 * (bkz. `applyBrightness`). `zIndex: 1` video üstünde ama kontroller
	 * altında kalır; `pointerEvents: none` dokunuşu engellemez.
	 */
	dimLayer: {
		...StyleSheet.absoluteFill,
		backgroundColor: "#000000",
		zIndex: 1,
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
	controlsLayer: {
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
		backgroundColor: "rgba(0, 0, 0, 0.4)",
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
	/*
	 * ⭐ ORTA KATMAN (CloudStream düzeni).
	 *
	 * Ekran görüntüsünde üçlü ince ve zeminSİZ: büyük kırmızı daire yok.
	 * `gap: 56` ile üçlü geniş ekrana yayılır; tek eylem (canlıda seek
	 * yokken) ortada kalır.
	 */
	centerControls: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 56,
	},
	playButton: {
		width: 56,
		height: 56,
		borderRadius: 28,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "rgba(0, 0, 0, 0.25)",
	},
	playButtonFocused: {
		backgroundColor: "rgba(255, 59, 48, 0.40)",
		transform: [{ scale: 1.12 }],
	},
	roundButton: {
		width: 52,
		height: 52,
		alignItems: "center",
		justifyContent: "center",
	},
	roundButtonFocused: {
		transform: [{ scale: 1.12 }],
	},
	roundInner: {
		alignItems: "center",
		justifyContent: "center",
	},
	roundLabel: {
		position: "absolute",
		color: "#FFFFFF",
		fontSize: 12,
		fontWeight: "800",
		textAlign: "center",
	},
	/*
	 * Seek yokken (canlı TV) ortadaki oynat düğmesi kaymasın diye üç eşit
	 * yer tutucu. `visibility: "hidden"` yerine boş `View` kullanılıyor ki
	 * dokunma hedefi oluşmasın.
	 */
	roundSpacer: {
		width: 52,
		height: 52,
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
	subtitleContainer: {
		position: "absolute",
		left: 24,
		right: 24,
		alignItems: "center",
		justifyContent: "center",
		zIndex: 8,
	},
	subtitlePill: {
		paddingHorizontal: 14,
		paddingVertical: 6,
		borderRadius: 6,
		maxWidth: "85%",
	},
	subtitleText: {
		fontSize: 16,
		fontWeight: "600",
		textAlign: "center",
		textShadowOffset: { width: 0, height: 1 },
		textShadowRadius: 3,
		lineHeight: 22,
	},
});
