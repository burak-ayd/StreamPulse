import { FontFamily, Palette } from "@/constants/theme";
import TVPressable from "@/components/common/TVPressable";
import { usePlayerSettings } from "@/context/PlayerSettingsContext";
import { useTVRemote } from "@/hooks/useTVRemote";
import {
	ensureBrightnessPermission,
	resetBrightness,
	setBrightness,
	setSystemVolume,
} from "@/utils/deviceControls";
import {
	lockPlayerOrientation,
	restoreAppOrientation,
} from "@/utils/orientation";
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
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Video from "react-native-video";
import {
	classifyPlaybackError,
	describePlaybackError,
} from "../../utils/playbackError";
import BrightnessVolumeHud from "./BrightnessVolumeHud";
import AppPeekMenu from "@/components/peek/AppPeekMenu";
import { useAppMenu } from "@/components/peek/AppMenuProvider";
import {
	MAX_PLAYBACK_RATE,
	MIN_BRIGHTNESS,
	MIN_PLAYBACK_RATE,
	PLAYBACK_RATES,
	RESIZE_MODE_ICONS,
	RESIZE_MODES,
	SEEK_SETTLE_MS,
} from "./constants";
import { DoubleTapFeedback, SpeedUpIndicator } from "./GestureFeedback";
import PlayerActionBar from "./PlayerActionBar";
import PlayerControls from "./PlayerControls";
import PlayerTopBar from "./PlayerTopBar";
import SwipeSeekPreview from "./SwipeSeekPreview";
import usePlayerGestures from "./usePlayerGestures";
import useSubtitles from "./useSubtitles";
import useVideoSource from "./useVideoSource";
import useWatchProgress from "./useWatchProgress";
import { applySubtitleStyle } from "../../../modules/subtitle-style/src";

/**
 * Geçici ağ hatasından sonra AYNI kaynağı tekrar denemeden önce beklenecek
 * süre (ms).
 *
 * ⚠️ Neden 1.6 sn? Canlı TV yayın sunucuları (CDN kenar önbelleği, mobil
 * şebeke geçişi) sık sık birkaç saniyelik kısa kopukluk yaşar. 1.6 sn: bir
 * TCP/TLS el sıkışması + ilk segmentin gelmesi için yeterli, ama kullanıcı
 * "donuyor" izlenimi vermeyecek kadar kısa. Aynı kaynak YALNIZCA bir kez
 * tekrar denenir (`retryCountRef`) — yoksa sonsuz döngü oluşur.
 */
const TEMEL_GEÇICI_BEKLEME_MS = 1600;

/**
 * İlk kare zaman aşımı (ms).
 *
 * ⚠️ CDN hata döndürmezse `onError` HİÇ gelmez: playlist 200 döner ama
 * segment/ilk kare asla gelmez. O durumda oynatıcı sonsuza kadar
 * "Kaynak yükleniyor..." gösteriyordu (kullanıcı raporu). 13 sn: canlı
 * HLS'te bir TCP/TLS el sıkışması + manifest + ilk segment için rahat
 * sınır; daha uzunu kullanıcıyı boş ekranda bekletir.
 */
const ILK_KARE_ZAMAN_ASIMI_MS = 13_000;

/**
 * Yükleme geri sayımı (ms).
 *
 * ⚠️ Kullanıcı isteği: kaynak geç yüklendiğinde ekran "Kaynak yükleniyor..."ta
 * kalıyordu ve hata ekranı HİÇ gelmiyordu. Bu sayaç oynatma gerçekten
 * başlayana kadar (ilk kare) ekranda geri sayar; süre dolunca hata ekranı
 * gösterilir → kullanıcı "Yeniden Dene" / "Farklı Kaynak" ile çıkabilir.
 * Her yeni yükleme denemesinde (videoKey değişimi) sıfırdan başlar.
 */
const YUKLEME_GERI_SAYIM_MS = 60_000;

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
	// İçeriğin SAYFA adresi; izleme kayıtlarına yazılan adres (bkz. `player.jsx`).
	pageUrl = null,
	plugin = null,
	isLive = false,
	initialSourceIndex = 0,
	// Canlı TV: "Yeniden Dene" sunucudan TAZE akış listesi ister (önbelleği
	// atlar). Verilmezse düğme yalnızca mevcut listeyi baştan dener.
	onRetry = null,
	// `embed: true` kaynak seçildi: `(url) => void` — tarayıcıda açılır.
	onOpenEmbed = null,
	// Sonraki bölüme geç: `(nextEpisode) => void` (bkz. `player.jsx`).
	onNextEpisode = null,
}) {
	const insets = useSafeAreaInsets();
	const videoRef = useRef(null);
	const { settings, updateSettings } = usePlayerSettings();

	const seekDuration = settings?.seekDuration || 10;
	const hideTimeoutMs = (settings?.controlsTimeout || 4) * 1000;

	/*
	 * Gömülü (container içi) altyazılar ExoPlayer'ın kendi SubtitleView'ında
	 * çizilir; renk/arka plan `subtitleStyle` prop'uyla verilemez. Native
	 * `SubtitleStyle` modülü o görünümü bulup `CaptionStyleCompat` uygular
	 * (bkz. modules/subtitle-style).
	 */
	const nativeSubtitleStyle = useMemo(
		() => ({
			fontSize: settings?.subtitleFontSize || 16,
			color: settings?.subtitleTextColor || "#FFFFFF",
			backgroundColor: subtitleBgColorArgb(settings?.subtitleBgColor),
			edgeColor: "#FF000000",
			textShadow: settings?.subtitleTextShadow !== false,
			opacity: 1,
		}),
		[
			settings?.subtitleFontSize,
			settings?.subtitleTextColor,
			settings?.subtitleBgColor,
			settings?.subtitleTextShadow,
		],
	);

	// Stili oynatıcı kurulunca ve ayarlar değişince yeniden uygula.
	useEffect(() => {
		applySubtitleStyle(nativeSubtitleStyle);
	}, [nativeSubtitleStyle]);

	// ── Oynatıcı durumu ───────────────────────────────────────
	const [activeSourceIndex, setActiveSourceIndex] =
		useState(initialSourceIndex);
	const [paused, setPaused] = useState(false);
	const [currentTime, setCurrentTime] = useState(0);
	const [duration, setDuration] = useState(0);
	const [playableDuration, setPlayableDuration] = useState(0);
	const [isLoading, setIsLoading] = useState(true);
	const [isBuffering, setIsBuffering] = useState(false);
	// Yükleme geri sayımının kalan saniyesi (null = sayaç çalışmıyor).
	const [kalanSaniye, setKalanSaniye] = useState(
		YUKLEME_GERI_SAYIM_MS / 1000,
	);
	const playbackStartedRef = useRef(false);
	const loadCountdownRef = useRef(null);
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
	const [availableAudioTracks, setAvailableAudioTracks] = useState([]);
	const { open: openAppMenu } = useAppMenu();
	const [selectedAudioTrackIndex, setSelectedAudioTrackIndex] =
		useState(null);
	const [isPipActive, setPipActive] = useState(false);
	const [naturalSize, setNaturalSize] = useState(null);

	const lastSavedTimeRef = useRef(0);
	const currentTimeRef = useRef(0);
	const hasMarkedCompleteRef = useRef(false);
	const isLoadedRef = useRef(false);
	const hasAppliedResumeRef = useRef(false);
	const pendingSeekTimeRef = useRef(initialTime || 0);

	// ── Hata kurtarma sayaçları ─────────────────────────────────
	//
	// ⚠️ Neden `ref`? Bunlar hata ANINDA okunur ve "bu kaynak zaten
	// denendi mi" bilgisi render döngüsüne girmez. `useState` olsaydı
	// hata anında bayat değer okunabilirdi.
	//
	// `seenSourceErrorsRef`: bu oturumda **hangi kaynaklar** hata verdi.
	//   Boş set → "hiç denemedi" anlamına gelir (0 değeri de bir indekstir,
	//   bu yüzden `0` eklenmemeli — Set kullandığımız için doğal).
	// `retryCountRef`: kaynak başına geçici hata tekrar sayısı.
	// `retryTimerRef`: bekleyen tekrar zamanlayıcısı (kaynak değişince/çıkışta
	//   iptal edilir; yoksa kullanıcı B ekranına döndüğünde eski kaynak açılır).
	const seenSourceErrorsRef = useRef(new Set());
	const retryCountRef = useRef(new Map());
	const retryTimerRef = useRef(null);
	// Bu oturumda ÖLÜ olduğu kanıtlanmış adresler (URL bazında). Otomatik
	// yedekleme bunlara geri dönmez; "Yeniden Dene" bilinçli bir emirdir.
	const deadUrlsRef = useRef(new Set());
	// İlk kare zaman aşımı (bkz. `ILK_KARE_ZAMAN_ASIMI_MS`).
	const firstFrameTimerRef = useRef(null);
	/*
	 * Zaman aşımına düşen kaynağın ikinci denemesi yapıldı mı? İlk kare
	 * gecikmesi kaynağın ölü olduğunu KANITLAMAZ (soğuk CDN): aynı kaynak
	 * bir kez yeniden başlatılır, ikinci zaman aşımında sıradakine geçilir.
	 */
	const timeoutRetriedRef = useRef(new Set());
	/*
	 * Aynı kaynağı yeniden başlatma sayacı. `<Video>` anahtarına girer;
	 * URI değişmese de (geçici hata tekrarı, zaman aşımı tekrarı) yeni
	 * oynatıcı örneği kurulur.
	 */
	const [restartNonce, setRestartNonce] = useState(0);

	const clearFirstFrameTimer = () => {
		if (firstFrameTimerRef.current) {
			clearTimeout(firstFrameTimerRef.current);
			firstFrameTimerRef.current = null;
		}
	};

	/** Yükleme geri sayımını durdurur (hata gösterildi / oynatma başladı). */
	const clearLoadCountdown = () => {
		if (loadCountdownRef.current) {
			clearInterval(loadCountdownRef.current);
			loadCountdownRef.current = null;
		}
		setKalanSaniye(null);
	};
	// Oynatma başladı: sayaç bir daha çalışmaz (yeni kaynak seçilirse yeniden).
	const markPlaybackStarted = () => {
		playbackStartedRef.current = true;
		clearLoadCountdown();
	};
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
		const pick = (v) =>
			typeof v === "string" && v.trim() ? v.trim() : null;
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
	/*
	 * ── Sonraki bölüm ──
	 *
	 * `seriesInfo.nextEpisode` `player.jsx`'te hesaplanır (parametreden ya da
	 * dizi detayından). Yoksa düğme hiç görünmez. `nextTriggeredRef` çift
	 * tetiklemeyi önler (bitiş olayı + düğme aynı anda).
	 */
	const nextEpisode = !isLive ? seriesInfo?.nextEpisode || null : null;
	const nextTriggeredRef = useRef(false);
	const goNextEpisode = useCallback(() => {
		if (!nextEpisode || !onNextEpisode || nextTriggeredRef.current) return;
		nextTriggeredRef.current = true;
		onNextEpisode(nextEpisode);
	}, [nextEpisode, onNextEpisode]);

	const currentSourceData = useMemo(
		() => sources[activeSourceIndex] || null,
		[sources, activeSourceIndex],
	);

	// ── Kalite (video varyantı) seçimi ────────────────────────
	/*
	 * react-native-video v6'da HLS video kalitesi seçim API'si yok → ExoPlayer
	 * otomatik (ABR) seçiyor: önce düşük, sonra yüksek. Kullanıcı sabit kalite
	 * seçebilsin diye: seçilen varyant + ses rendition'ı içeren YEREL master
	 * yazılır ve o oynatılır (tek varyant → kalite sabit, ses korunur).
	 */
	const [videoVariants, setVideoVariants] = useState([]);
	const [selectedVariantId, setSelectedVariantId] = useState(null);
	// Kalite kararı KAYNAĞA BAĞLI tutulur. Ayrı bir "uri" state'i tutulsaydı
	// kaynak değiştiği ilk render'da eski içeriğin yerel master'ı yeni kaynağa
	// uygulanır ve YANLIŞ içerik oynatılırdı (ses/video başka filmden).
	const [kaliteKarari, setKaliteKarari] = useState({ url: null, uri: null });

	// Kaynak değişince kalite listesi yenilenir, seçim sıfırlanır.
	useEffect(() => {
		let cancelled = false;
		const url = currentSourceData?.result?.url;
		(async () => {
			if (!url || !url.includes(".m3u8")) {
				if (cancelled) return;
				setVideoVariants([]);
				setSelectedVariantId(null);
				setKaliteKarari({ url: url || null, uri: null });
				return;
			}
			try {
				const { DownloadManager } = await import("@/services/downloadManager");
				const { writeLocalMaster } = await import("@/utils/localHlsMaster");
				const list = await DownloadManager.listHlsVariants(
					url,
					currentSourceData?.result?.headers || {},
				);
				if (cancelled) return;
				const kaliteler = Array.isArray(list) ? list : [];
				setVideoVariants(kaliteler);
				setSelectedVariantId(null);
				/*
				 * ⚠️ CANLIDA SABİTLEME YOK ("Otomatik" = GERÇEK ABR).
				 *
				 * Tek varyantlı yerel master, en yüksek bitrate'e kilitler.
				 * Canlıda bu, zayıf bağlantıda kanalın hiç açılmaması demekti
				 * (kullanıcı elle kalite seçince açılıyordu). Liste yine
				 * doldurulur: elle kalite seçimi oynatıcıdan yapılabilir.
				 */
				if (isLive) return;
				/*
				 * "Otomatik" = EN YÜKSEK kalite (indirme modalıyla aynı mantık).
				 * ExoPlayer'ın ABR'ı ağ yavaşken düşük kalitede takılı kalıyordu
				 * ("kalite düşük kalıyor, yükseğe geçmiyor") → tek varyantlı yerel
				 * master ile kalite baştan sabitlenir.
				 */
				const enYuksek = [...kaliteler].sort(
					(a, b) => (b.bandwidth || 0) - (a.bandwidth || 0),
				)[0];
				if (!enYuksek) {
					setKaliteKarari({ url, uri: null });
					return;
				}
				const sesler = enYuksek.audioTracks || [];
				const varsayilanSes =
					sesler.find((t) => t.isDefault) || sesler[0] || null;
				const uri = await writeLocalMaster(
					enYuksek,
					sesler,
					varsayilanSes,
					// Benzersiz dosya adı: içerik etiketi + yazım sayacı.
					// Aynı yol ikinci kez kullanılmaz → önceki içeriğin
					// kalıntısı yeni içeriğe karışamaz.
					url,
				);
				if (cancelled) return;
				// Kalite-master rewrite AYNI İÇERİĞİ yeniden montaj eder:
				// pendingSeekTimeRef EZİLEMEZ — erken rewrite tamamlanırsa
				// (onLoad sonrası 300ms'lik seek timer'ından önce) max'siz
				// yazım ilk yüklemede resume hedefini 0'a indirirdi.
				pendingSeekTimeRef.current = Math.max(
					currentTimeRef.current || 0,
					pendingSeekTimeRef.current,
				);
				setKaliteKarari({ url, uri });
			} catch (e) {
				console.warn("Kalite listesi alınamadı:", e?.message);
				// Karar kesinleşmeli: aksi halde `kaliteBekleniyor` true kalır ve
				// oynatıcı hiç mount edilmez (ekranda sonsuz "yükleniyor").
				if (!cancelled) {
					setVideoVariants([]);
					setKaliteKarari({ url, uri: null });
				}
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [currentSourceData, isLive]);

	// Seçilen varyant için yerel master yaz → oynatıcı kaynağı değişir.
	const selectVariant = useCallback(
		(variantId) => {
			// Konum koruma: kalite değişiminde video baştan başlamasın.
			// max() (RC 2026-10-28): sürvari rewrite'lar arasında bekleyen
			// bir resume hedefi varsa ezmek yerine koru.
			pendingSeekTimeRef.current = Math.max(
				currentTimeRef.current || 0,
				pendingSeekTimeRef.current,
			);
			// Canlıda "Otomatik" = ExoPlayer ABR: yerel master bırakılır,
			// kanalın kendi master'ı oynatılır (kalite bağlantıya uyar).
			if (isLive && variantId === null) {
				setSelectedVariantId(null);
				setKaliteKarari({ url: currentSourceData?.result?.url || null, uri: null });
				return;
			}
			const hedefVaryant =
				variantId === null
					? // "Otomatik" = en yüksek kalite
						[...videoVariants].sort(
							(a, b) => (b.bandwidth || 0) - (a.bandwidth || 0),
						)[0]
					: videoVariants.find((v) => v.id === variantId);
			if (!hedefVaryant) {
				// Varyant yok → kaynağın kendi master'ına dön.
				setSelectedVariantId(null);
				setKaliteKarari({ url: currentSourceData?.result?.url || null, uri: null });
				return;
			}
			const sesListesi = hedefVaryant.audioTracks || [];
			const seciliSes =
				sesListesi.find((t) => t.index === selectedAudioTrackIndex) ||
				sesListesi.find((t) => t.isDefault) ||
				sesListesi[0] ||
				null;
			(async () => {
				try {
					const { writeLocalMaster } = await import("@/utils/localHlsMaster");
					const uri = await writeLocalMaster(
						hedefVaryant,
						sesListesi,
						seciliSes,
						// Benzersiz ad: her kalite seçimi yeni dosya yazar.
						currentSourceData?.result?.url || "",
					);
					setSelectedVariantId(variantId);
					setKaliteKarari({
						url: currentSourceData?.result?.url || null,
						uri,
					});
				} catch (e) {
					console.warn("Kalite değiştirilemedi:", e?.message);
				}
			})();
		},
		[videoVariants, selectedAudioTrackIndex, isLive, currentSourceData],
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
			currentSourceData?.result?.name ||
			currentSourceData?.extractor ||
			"";
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

	// ⚠️ Kalite kararı beklenirken oynatıcı BAŞLATILMAZ.
	// Önceki davranış: oynatıcı master ile başlıyor, ~600 ms sonra yerel
	// kalite-master yazılınca aynı video için İKİNCİ kez kuruluyordu
	// (Init → Release → Init; manifest iki kez çekiliyordu).
	// Karar KAYNAĞA bağlı tutulur: kaynak değişince eski karar geçersizdir,
	// dolayısıyla önceki içeriğin yerel master'ı yeni kaynağa uygulanamaz.
	const kaynakUrl = String(currentSourceData?.result?.url || "");
	const kaliteBekleniyor =
		!isLive && kaynakUrl.includes(".m3u8") && kaliteKarari.url !== kaynakUrl;
	const variantMasterUri =
		kaliteKarari.url === kaynakUrl ? kaliteKarari.uri : null;

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
		urlOverride: variantMasterUri,
		qualityPending: kaliteBekleniyor,
		restartNonce,
		onFormatOverride: () => {
			setHasError(false);
			setIsLoading(true);
		},
	});

	// ── Altyazılar ───────────────────────────────────────────
	/*
	 * Aktif ses parçası. `selectedAudioTrackIndex` parçanın KENDİ `index`
	 * alanıdır (bkz. `TrackSelectionModal` → `trackId`), dizi konumu değil.
	 * Seçim yoksa sistemin seçtiği (`selected`) parça. Altyazının otomatik
	 * seçimi (Türkçe ses → Forced) bunu kullanır.
	 */
	const activeAudioTrack = useMemo(() => {
		if (!availableAudioTracks?.length) return null;
		if (selectedAudioTrackIndex !== null) {
			return (
				availableAudioTracks.find(
					(t) => t.index === selectedAudioTrackIndex,
				) ||
				availableAudioTracks[selectedAudioTrackIndex] ||
				null
			);
		}
		return (
			availableAudioTracks.find((t) => t.selected) ||
			availableAudioTracks[0]
		);
	}, [availableAudioTracks, selectedAudioTrackIndex]);

	const subtitles = useSubtitles({
		currentSourceData,
		settings,
		currentTime,
		onResetOffset: () => startHideTimerRef.current?.(),
		audioTrack: activeAudioTrack,
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
		pageUrl,
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
	/*
	 * ⚠️ SEEK TABANI VE "ESKİ İLERLEME" KORUMASI (kullanıcı: "istemediğim
	 * atlamalar", TV + mobil).
	 *
	 * Seek verildikten sonra player bir süre ESKİ konumu bildirmeye devam
	 * eder (`progressUpdateInterval` 500 ms + seek gecikmesi). Eski kod:
	 *   · bu bayat konumu `currentTime`'a yazıyor → çubuk geri zıplıyordu,
	 *   · bir sonraki sarmayı BAYAT `currentTime` üzerinden hesaplıyordu →
	 *     art arda sarmalarda (kumanda tuşu basılı tutma, çift dokunma) +10
	 *     yerine +0/+10 gibi tutarsız atlamalar oluyordu.
	 *
	 * Artık: (1) her seek `seekSettleRef`'e HEDEFİ yazar, sonraki sarma
	 * bu hedeften hesaplanır; (2) `handleProgress`, hedefe yaklaşana ya da
	 * `SEEK_SETTLE_MS` dolana kadar bayat olayları yok sayar.
	 */
	const seekSettleRef = useRef({ target: null, until: 0 });

	const getSeekBase = useCallback(() => {
		const settle = seekSettleRef.current;
		if (settle.target !== null && Date.now() < settle.until) {
			return settle.target;
		}
		return currentTimeRef.current;
	}, []);

	const applySeek = useCallback(
		(seconds) => {
			const clamped = Math.max(0, Math.min(duration, seconds));
			// Gerçek kullanıcı seek'i (sorun 3/4 — bkz. `noteUserSeek`).
			noteUserSeek();
			seekSettleRef.current = {
				target: clamped,
				until: Date.now() + SEEK_SETTLE_MS,
			};
			videoRef.current?.seek(clamped);
			setCurrentTime(clamped);
			currentTimeRef.current = clamped;
			return clamped;
		},
		[duration, noteUserSeek],
	);

	const seekTo = useCallback(
		(seconds) => {
			if (!videoRef.current || !canSeek) return;
			applySeek(seconds);
		},
		[canSeek, applySeek],
	);

	/** Göreli sarma. GERÇEKTE uygulanan farkı (kırpma sonrası) döndürür. */
	const seekBy = useCallback(
		(deltaSeconds) => {
			if (!videoRef.current || !canSeek) return 0;
			const base = getSeekBase();
			const next = applySeek(base + deltaSeconds);
			startHideTimerRef.current?.();
			return next - base;
		},
		[canSeek, applySeek, getSeekBase],
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

	/*
	 * Hata kurtarma defterini kaynak listesi değiştiğinde sıfırla.
	 *
	 * ⚠️ Neden liste değişince? Aynı indeks artık FARKLI bir adresi
	 * gösteriyor olabilir (canlı TV'de keşif döngüsü yeni bir alternatif
	 * akış eklediğinde sıra kayabilir). Eski "bu kaynak öldü" kaydı yeni
	 * adresi haksız yere karalamaz.
	 */
	useEffect(() => {
		seenSourceErrorsRef.current = new Set();
		retryCountRef.current = new Map();
		deadUrlsRef.current = new Set();
		timeoutRetriedRef.current = new Set();
		if (retryTimerRef.current) {
			clearTimeout(retryTimerRef.current);
			retryTimerRef.current = null;
		}
		clearFirstFrameTimer();
	}, [sources]);

	// Bekleyen geçici-hata tekrarını ekrandan çıkarken iptal et: aksi hâlde
	// timer, oynatıcı yokken `setState` çağırır.
	useEffect(() => {
		return () => {
			if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
			if (firstFrameTimerRef.current)
				clearTimeout(firstFrameTimerRef.current);
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
			// TV'de "serbest" mod yok: kumandalı cihazda ekranı döndürmek
			// yerleşimi bozar (sol ray / 4 sütun ızgara yatay varsayılır).
			if (!Platform.isTV) {
				ScreenOrientation.unlockAsync().catch(() => {});
			} else {
				lockPlayerOrientation().catch(() => {});
			}
		} else {
			lockPlayerOrientation().catch(() => {});
		}
		return () => {
			// ⚠️ SORUN 7: TV'de `PORTRAIT_UP` ekranı DİKEYE çeviriyordu.
			// Dönüş hedefi artık cihazın temel yönü (TV → yatay).
			restoreAppOrientation();
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
		nextTriggeredRef.current = false;
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
		clearFirstFrameTimer();
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
		 * Gömülü altyazı görünümü ancak oynatıcı kurulduktan sonra oluşur;
		 * stili burada (ve ayar değişiminde) uygula.
		 */
		applySubtitleStyle(nativeSubtitleStyle);

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

		// Seek sonrası BAYAT konum olaylarını yok say (bkz. `seekSettleRef`).
		const settle = seekSettleRef.current;
		if (settle.target !== null) {
			const reached = Math.abs(curTime - settle.target) < 2.5;
			if (!reached && Date.now() < settle.until) {
				setPlayableDuration(data.playableDuration || 0);
				return;
			}
			seekSettleRef.current = { target: null, until: 0 };
		}

		setCurrentTime(curTime);
		currentTimeRef.current = curTime;
		// İlk ilerleme = oynatma gerçekten başladı → geri sayım durur.
		if (curTime > 0 && !playbackStartedRef.current) markPlaybackStarted();
		// `onLoad` gecikirse (yerel büyük dosya) ses çoktan başlamış olur;
		// gösterge gerçek oynatma ilerlediğinde kalksın.
		if (isLoading && curTime > 0) setIsLoading(false);
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
	const switchSourceTo = (index, secenekler = {}) => {
		// Eski kaynağın ilk-kare zamanlayıcısı yeni kaynağa taşınmaz.
		clearFirstFrameTimer();

		// Canlıda "doğru konum" diye bir şey yok; eski konuma atlamak
		// yayını kaçırır → konum taşınmaz.
		//
		// ⚠️ RC 2026-10-28: `canSeek` BU KOŞULDA OLMAMALI — erken kaynak
		// ölümünde (kaynak hiç yüklemeden hata verdi) duration=0 →
		// canSeek=false → konum taşınmıyor → resume hedefi sıfırlanıp
		// SIRADAKİ KAYNAK BAŞTAN BAŞLIYORDU. Aranılan güvenlik handleLoad'da
		// zaten var: seek hedefi gerçek `dur` ile kırpılır (bkz. onLoad).
		const keepPosition = !isLive && settings?.autoResume !== false;

		// Bekleyen geçici-hata tekrarını iptal et: kullanıcı başka kaynağa
		// geçtiyse, eski kaynağın kuyruğa alınmış tekrarı çalışmamalı.
		if (retryTimerRef.current) {
			clearTimeout(retryTimerRef.current);
			retryTimerRef.current = null;
		}

		// ⚠️ `resetErrors` YALNIZCA kullanıcı eyleminde (yeniden yükle
		// düğmesi) kullanılır: kullanıcı "dene" dediğinde o kaynak yeniden
		// masadan çıkar. Otomatik ilerlemede geçmiş KORUNUR — yoksa
		// ölü kaynağa tekrar tekrar dönüp sonsuz döngüye girerdik.
		if (secenekler.resetErrors) {
			seenSourceErrorsRef.current.delete(index);
			retryCountRef.current.delete(index);
		}

		// ⚠️ NULL-KAYNAK DÜŞÜŞÜNDE RESUME KORUR (RC 2026-10-28):
		// kaynak oynatma BAŞLAMADAN öldüyse (örn. backend result:null sızmış
		// öge) currentTimeRef 0'dır; onu yazmak pendingSeekTimeRef'teki
		// resume hedefini SİLİYORDU ve ikinci kaynak baştan açılıyordu.
		// max(): oynatma başladıysa anlık konum kazanır, hiç başlamadıysa
		// bekleyen resume hedefi korunur.
		pendingSeekTimeRef.current = keepPosition
			? Math.max(currentTimeRef.current || 0, pendingSeekTimeRef.current)
			: 0;
		resetOverride();
		/*
		 * Kalite sabitlemesi KAYNAĞA özeldir: eski kaynağın yerel master'ı
		 * bırakılmazsa yeni kaynakta YANLIŞ yayın açılır.
		 *
		 * ⚠️ KÖK NEDEN (kullanıcı: "kaynak geç yüklenince Kaynak
		 * yükleniyor...'da takılıyor, çıkıp girince oynuyor"):
		 * AYNI kaynağın yeniden denemesinde de karar sıfırlanıyordu.
		 * `kaliteBekleniyor` true olunca `videoSource` null oluyor,
		 * `<Video>` sökülüyor — ve kaliteyi çözen effect `[currentSourceData,
		 * isLive]`e bağlı olduğu için (ikisi de değişmedi) BİR DAHA
		 * ÇALIŞMIYOR: oynatıcı sonsuza kadar kurulmuyordu. Karar yalnızca
		 * kaynak GERÇEKTEN değişince geçersizleşmeli; sıra değişince
		 * `currentSourceData` değişir, effect kendisi yeniden çalışır.
		 */
		if (index !== activeSourceIndex) {
			setVideoVariants([]);
			setSelectedVariantId(null);
			setKaliteKarari({ url: null, uri: null });
		}
		setIsLoading(true);
		setHasError(false);
		// Aynı indekse dönüş (geçici hata tekrarı, yavaş kaynağın ikinci
		// şansı) yeni oynatıcı örneği gerektirir: aksi hâlde URI ve dolayısıyla
		// `<Video>` anahtarı değişmez ve oynatıcı hiç yeniden başlamaz.
		if (index === activeSourceIndex) setRestartNonce((n) => n + 1);
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
		// Sonraki bölüm varsa otomatik geç (ayar: `autoPlayNext`, varsayılan açık).
		if (settings?.autoPlayNext !== false) goNextEpisode();
	};

	/** `from`dan SONRAKİ, sağlam VİDEO kaynağı (-1: yok). */
	const sonrakiOynatilabilir = (from) => {
		for (let i = from + 1; i < sources.length; i += 1) {
			const url = sources[i]?.result?.url;
			// `embed` bir web sayfasıdır: oynatıcıya verilmez, otomatik
			// yedekleme onu atlar (kullanıcı kaynak menüsünden açabilir).
			if (sources[i]?.result?.embed) continue;
			if (!url || deadUrlsRef.current.has(url)) continue;
			// Bu oturumda zaten denenmiş kaynağa otomatik dönülmez.
			if (seenSourceErrorsRef.current.has(i)) continue;
			return i;
		}
		return -1;
	};

	/*
	 * Tüm kaynaklar tükenince gösterilecek metin.
	 *
	 * Canlıda teknik ayrıntı ("HTTP hatası", "kodeks") kullanıcıya bir şey
	 * söylemez: yapabileceği tek şey "Yeniden Dene". Film/dizide ise
	 * `describePlaybackError` hangi kaynağın neden düştüğünü anlatır.
	 */
	const sonHataMesaji = (kaynakEtiketi, error = null) =>
		isLive
			? "Yayın şu anda açılamıyor."
			: describePlaybackError(error, { sourceLabel: kaynakEtiketi });

	/*
	 * ── Yükleme geri sayımı ───────────────────────────────────
	 *
	 * Kullanıcı raporu: kaynak geç yüklenince ekran "Kaynak yükleniyor..."ta
	 * takılı kalıyor, ancak oynatıcıdan çıkıp girince video oynuyordu.
	 * `ILK_KARE_ZAMAN_ASIMI_MS` yalnızca `<Video>` mount olduktan SONRA
	 * başlar; oynatıcı hiç kurulmazsa (kalite kararı, kaynak hazırlığı)
	 * hiçbir zamanlayıcı çalışmıyordu. Bu sayaç `videoKey` ile başlar:
	 * oynatıcı ne durumda olursa olsun 60 sn sonra hata ekranı çıkar.
	 */
	useEffect(() => {
		playbackStartedRef.current = false;
		const bitis = Date.now() + YUKLEME_GERI_SAYIM_MS;
		loadCountdownRef.current = setInterval(() => {
			const kalan = Math.max(0, Math.ceil((bitis - Date.now()) / 1000));
			setKalanSaniye(kalan);
			if (kalan > 0 || playbackStartedRef.current) return;
			clearLoadCountdown();
			console.warn(
				`[oynatma] hata url=${currentSourceData?.result?.url || "-"} kod=loading-timeout (${YUKLEME_GERI_SAYIM_MS} ms içinde oynatma başlamadı)`,
			);
			setIsLoading(false);
			setIsBuffering(false);
			setHasError(true);
			setErrorMessage(
				isLive
					? "Yayın şu anda açılamıyor."
					: `Video ${YUKLEME_GERI_SAYIM_MS / 1000} saniye içinde başlamadı. Kaynak yanıt vermiyor olabilir; tekrar deneyin veya başka bir kaynak seçin.`,
			);
		}, 1000);
		return () => clearInterval(loadCountdownRef.current);
	}, [videoKey, currentSourceData, isLive]);

	/*
	 * ── İlk kare zaman aşımı ──────────────────────────────────
	 *
	 * `onError` gelmeyen sessiz takılma: playlist 200 döner, segment hiç
	 * gelmez. Kaynak ÖLÜ SAYILMAZ: ilk denemede kare gelmemesi, soğuk
	 * bağlantı/CDN yavaşlığı demektir. Aynı kaynak BİR kez yeniden
	 * başlatılır (kullanıcının "kapat-aç" davranışının otomatiği); ikinci
	 * zaman aşımından sonra sıradaki kaynağa geçilir.
	 */
	const handleFirstFrameTimeout = (index) => {
		firstFrameTimerRef.current = null;
		clearLoadCountdown();
		const url = sources[index]?.result?.url || "-";
		console.warn(
			`[oynatma] hata url=${url} kod=timeout (${ILK_KARE_ZAMAN_ASIMI_MS} ms içinde ilk kare gelmedi)`,
		);

		if (!timeoutRetriedRef.current.has(index)) {
			timeoutRetriedRef.current.add(index);
			console.log(
				`[oynatma] ${index + 1}. kaynakta ilk kare gecikti — aynı kaynak yeniden başlatılıyor`,
			);
			switchSourceTo(index);
			return;
		}

		seenSourceErrorsRef.current.add(index);
		const sonraki = sonrakiOynatilabilir(index);
		if (sonraki !== -1) {
			console.log(
				`[oynatma] ${index + 1}. kaynakta kare gelmedi — sıradaki kaynak deneniyor`,
			);
			switchSourceTo(sonraki);
			return;
		}
		setIsLoading(false);
		setIsBuffering(false);
		setHasError(true);
		setErrorMessage(
			sonHataMesaji(sources[index]?.result?.name || `kaynak ${index + 1}`),
		);
	};

	/** Yeni kaynağın ilk karesi için zamanlayıcıyı kurar. */
	const armFirstFrameTimer = (index) => {
		clearFirstFrameTimer();
		firstFrameTimerRef.current = setTimeout(
			() => handleFirstFrameTimeout(index),
			ILK_KARE_ZAMAN_ASIMI_MS,
		);
	};

	const handleError = (error) => {
		clearFirstFrameTimer();
		clearLoadCountdown();
		const bilgi = classifyPlaybackError(error);
		const kaynakNo = activeSourceIndex;
		const kaynak = sources[kaynakNo] || {};
		const kaynakEtiketi =
			kaynak?.result?.name ||
			kaynak?.extractor ||
			`kaynak ${kaynakNo + 1}`;
		// ⚠️ Hangi ADRESİN düştüğü log'da görünmeli: etiket ("TRT 1
		// [Canlı HD]") kanalı söyler, M3U'da düzeltilecek satırı söylemez.
		const url = kaynak?.result?.url || "-";

		console.warn(
			`[oynatma] hata url=${url} kod=${bilgi.code ?? "?"} | ` +
				`kaynak: ${kaynakEtiketi} | tür: ${bilgi.kind} | ` +
				`ölü: ${bilgi.sourceDead} | geçici: ${bilgi.transient} | ` +
				`ham: ${error?.error?.errorString ?? "-"}`,
		);
		setIsLoading(false);
		setIsBuffering(false);

		// Ölü adres bu oturumda bir daha otomatik denenmez (döngü koruması
		// + boşa ağ turu). "Yeniden Dene" bu kaydı temizler.
		if (bilgi.sourceDead && !bilgi.transient) {
			deadUrlsRef.current.add(url);
		}

		// ── 1) Aynı kaynağın KENDİSİ bu oturumda zaten öldü mü? ──
		//
		// Döngü koruması: kaynak 0 → 1 → 0 gibi bir sıralamada aynı ölü
		// adres defalarca denenir ve kullanıcı sonsuz "deneniyor" görür.
		if (seenSourceErrorsRef.current.has(kaynakNo)) {
			// Bu kaynak zaten bir kez denendi ve tutmadı → doğrudan sıradakine.
			const sonraki = sonrakiOynatilabilir(kaynakNo);
			if (sonraki !== -1) {
				console.log(
					`[oynatma] ${kaynakEtiketi} ikinci kez başarısız — sıradaki kaynağa geçiliyor`,
				);
				switchSourceTo(sonraki);
				return;
			}
			setHasError(true);
			setErrorMessage(sonHataMesaji(kaynakEtiketi, error));
			return;
		}
		seenSourceErrorsRef.current.add(kaynakNo);

		// ── 2) GEÇİCİ hata → aynı kaynağı kısa süre sonra bir kez daha dene ──
		//
		// Canlı TV'de yayın sunucuları sık sık birkaç saniyelik kısa kopukluk
		// yaşar (CDN kenar önbelleği, mobil şebeke geçişi). Böyle bir hatada
		// kaynağı terk etmek yayını gereksiz yere bitirir.
		if (bilgi.transient) {
			const deneme = retryCountRef.current.get(kaynakNo) || 0;
			if (deneme < 1) {
				retryCountRef.current.set(kaynakNo, deneme + 1);
				console.log(
					`[oynatma] ${kaynakEtiketi} geçici hata — ${TEMEL_GEÇICI_BEKLEME_MS} ms sonra aynı kaynak yeniden denenecek`,
				);
				retryTimerRef.current = setTimeout(() => {
					switchSourceTo(kaynakNo);
				}, TEMEL_GEÇICI_BEKLEME_MS);
				return;
			}
		}

		// ── 3) BİÇİM hatası → ters türle bir kez dene (eski davranış) ──
		if (bilgi.retryableWithTypeFlip && !formatRetryRef.current) {
			if (toggleOverrideType()) return;
		}

		// ── 4) Kaynak öldü → sıradakine geç ──
		const sonraki = sonrakiOynatilabilir(kaynakNo);
		if (sonraki !== -1) {
			console.log(
				`[oynatma] ${kaynakEtiketi} oynatılamadı (${bilgi.kind}) — sıradaki kaynak deneniyor`,
			);
			// ⚠️ Konum korunur: bu yol daha önce `pendingSeekTimeRef`'i
			// yazmıyordu ve video baştan başlıyordu.
			switchSourceTo(sonraki);
			return;
		}

		// ── 5) Kaynak kalmadı → anlaşılır mesaj (ham ExoPlayer metni değil) ──
		setHasError(true);
		setErrorMessage(sonHataMesaji(kaynakEtiketi, error));
	};

	const handleSelectSource = (index) => {
		if (index === activeSourceIndex) return;
		// `embed` akış = web oynatıcı sayfası: ExoPlayer'a verilmez,
		// tarayıcıda açılır (çağıran `player.jsx` açar).
		if (sources[index]?.result?.embed) {
			onOpenEmbed?.(sources[index].result.url);
			return;
		}
		// Konum koruma dahil TÜM kaynak değiştirme mantığı tek yolda.
		//
		// ⚠️ `resetErrors` ŞART: kullanıcı listeden kaynak seçtiyse bu bir
		// "dene" emridir. O kaynağın eski hata kaydı silinmezse, kaynak
		// açılmaya çalışırken hata verdiği anda oynatıcı "bu kaynak zaten
		// öldü" deyip listedeki sonrakine atlar ve kullanıcının seçimi
		// hiç denenmez.
		switchSourceTo(index, { resetErrors: true });
	};

	const sourceMenuItems = () => {
		const half = Math.ceil(sources.length / 2);
		const rows = sources.map((s, i) => ({
			key: `src-${i}`,
			title: s.result?.name || s.extractor || `Kaynak ${i + 1}`,
			icon: "server-outline",
			selected: activeSourceIndex === i,
			value: activeSourceIndex === i ? "Aktif" : undefined,
			// eslint-disable-next-line react-hooks/refs -- işleyici yalnızca basınca çalışır
			onPress: () => handleSelectSource(i),
		}));
		return [
			{
				key: "src-cols",
				type: "columns",
				groups: [
					{ key: "src-a", title: "KAYNAKLAR", items: rows.slice(0, half) },
					{ key: "src-b", title: "", items: rows.slice(half) },
				],
			},
		];
	};

	/** Oynatma hızları: iki kolon (ekran taşmasın). */
	const playbackRateGroups = () => {
		const rows = PLAYBACK_RATES.map((rate) => ({
			key: `rate-${rate}`,
			title: rate === 1 ? "Normal" : `${rate}×`,
			icon: "speedometer-outline",
			selected: Math.abs(playbackRate - rate) < 0.01,
			value:
				Math.abs(playbackRate - rate) < 0.01 ? "Aktif" : undefined,
			onPress: () => selectRate(rate),
		}));
		const half = Math.ceil(rows.length / 2);
		return [
			{ key: "rate-a", title: "HIZ", items: rows.slice(0, half) },
			{ key: "rate-b", title: "", items: rows.slice(half) },
		];
	};

	// ── Altyazı / ses izi prop'ları ─────────────────────────
	const videoTextTrackProp = useMemo(() => {
		const sub = subtitles.selectedSubtitle;
		if (!sub) return { type: "disabled" };
		/*
		 * Yan dosya altyazı (indirme .srt) kendi overlay'imizde çizilir;
		 * native oynatıcıya verilmez.
		 */
		if (sub.isExternal) return { type: "disabled" };
		/*
		 * Gömülü (container içi) iz: RNV başlıkla eşleştirmeyi
		 * `format.label` üzerinden yapar. Etiketsiz izlerde başlık yalnızca
		 * GÖRÜNTÜ için üretilir ("Track 1") ve eşleşmez — seçim menüde
		 * görünür ama ekranda hiçbir şey çizilmez. Bu durumda indeks kullan.
		 */
		const uretilmisBaslik = /^Track \d+$/.test(String(sub.title || ""));
		if (sub.title && !uretilmisBaslik) return { type: "title", value: sub.title };
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

	/*
	 * ⚠️ SORUN 6 — kumanda ile sarma ve odak bölgeleri.
	 *
	 * KÖK NEDEN (ilk rapor): HUD açıkken yalnızca `rewind`/`fastForward`
	 * (KEYCODE_MEDIA_REWIND / MEDIA_FAST_FORWARD) dinleniyordu. Çoğu Android
	 * TV kumandasında bu tuşlar **ayrı basılır** ve pek çok kumandada
	 * `KEYCODE_DPAD_LEFT/RIGHT` olarak gönderilir — kullanıcının bastığı
	 * sol/sağ tuşu hiçbir şeye denk gelmediği için sarma çalışmıyor, odak
	 * bunun yerine komşu düğmelere kayıyordu.
	 *
	 * ÇÖZÜM: `left`/`right` üç duruma göre farklı anlam taşır. Hangisi
	 * geçerli olduğunu odak BÖLGESİ söyler; bölgeyi bildiren bileşenler
	 * odak alıp bırakırken `onFocusZone` çağırır:
	 *
	 *   · "top" / "bottom" → o barda bir DÜĞME gezdiriliyor;
	 *                         sol/sağ düğmeler arasında GİDER.
	 *   · "progress"      → ilerleme çubuğu odaklı (sorun 6'nın asıl
	 *                         isteği); sol/sağ SARAR.
	 *   · `null`           → odak bir barda değil (ör. ortadaki
	 *                         oynat/duraklat); sol/sağ SARAR.
	 *
	 * Medya tuşları (`rewind`/`fastForward`) odak nerede olursa olsun
	 * daima sarar — kumanda hangi barda olursa olsun, CloudStream'de de
	 * böyledir.
	 *
	 * HUD GİZLİYKEN: sol/sağ sarmayla birlikte kontrolleri de AÇAR.
	 * Kullanıcı isteği: "HUD kapalı iken ileri geri sararken progressbar
	 * gözükmeli ki hangi dakikaya sarıldığı görülebilmeli." Kontroller
	 * ilerleme çubuğunu içerdiği için tek `setShowControls(true)` yeter.
	 */
	const focusZoneRef = useRef(null);
	const setFocusZone = useCallback((zone) => {
		focusZoneRef.current = zone;
	}, []);

	// HUD gizlenince odak bilgisi sıfırlanır: görünürlük geri geldiğinde
	// "sol/sağ = sarma" kuralı sıfırdan geçerli olsun.
	useEffect(() => {
		if (!showControls) focusZoneRef.current = null;
	}, [showControls]);

	// ── Kumanda (TV) ────────────────────────────────────────
	useTVRemote((eventType) => {
		/*
		 * ⚠️ Hata ekranı açıkken kumanda oynatıcıyı YÖNETMEZ.
		 *
		 * Neden: aşağıdaki `!showControls` dalı "diğer tuşlar → kontrolleri
		 * göster" der; hata ekranında kontroller render EDİLMEDİĞİ için bu
		 * dal her tuşta boşa çalışır ve odak yöneticisi odağı yine
		 * oynatıcının (kaldırılan) katmanına taşımaya çalışırdı. Ayrıca
		 * hata anında sol/sağ sarma ve play/pause anlamsızdır.
		 */
		if (hasError) return;
		if (!showControls) {
			// HUD GİZLİ: Play/Pause, Rewind/FastForward, Left/Right → seek + HUD göster
			if (
				eventType === "playPause" ||
				eventType === "play" ||
				eventType === "pause"
			) {
				togglePlayPause();
				setShowControls(true);
				startHideTimerRef.current?.();
				return;
			}
			if (canSeek && (eventType === "left" || eventType === "rewind")) {
				seekBy(-seekDuration);
				// HUD gizliyken seek yapıldığında geçici olarak kontrolleri göster
				setShowControls(true);
				startHideTimerRef.current?.();
				return;
			}
			if (
				canSeek &&
				(eventType === "right" || eventType === "fastForward")
			) {
				seekBy(seekDuration);
				setShowControls(true);
				startHideTimerRef.current?.();
				return;
			}
			// Diğer tuşlar (yukarı/aşağı/ok) → sadece HUD göster
			setShowControls(true);
			startHideTimerRef.current?.();
		} else {
			// HUD GÖRÜNÜR
			startHideTimerRef.current?.();

			// Medya tuşları: odak nerede olursa olsun sarar.
			if (eventType === "rewind") {
				seekBy(-seekDuration);
				return;
			}
			if (eventType === "fastForward") {
				seekBy(seekDuration);
				return;
			}
			if (eventType === "playPause") {
				togglePlayPause();
				return;
			}

			// D-Pad yatay: focusZone'ye göre karar ver
			const zone = focusZoneRef.current;
			const onProgressBar = zone === "progress";
			const onButtonBar = zone === "top" || zone === "bottom";

			// Progress bar odaklıyken: Sol/Sağ = seek, Yukarı/Aşağı = bar'dan çık
			if (onProgressBar) {
				if (canSeek && eventType === "left") {
					seekBy(-seekDuration);
					return;
				}
				if (canSeek && eventType === "right") {
					seekBy(seekDuration);
					return;
				}
				// Yukarı/Aşağı → focusZone sıfırla (odak yöneticisi bar'a taşır)
				if (eventType === "up" || eventType === "down") {
					setFocusZone(null);
					return;
				}
				// Ok/Select → play/pause toggle
				if (eventType === "select") {
					togglePlayPause();
					return;
				}
				// Diğer tuşlar için bar'da kal
				return;
			}

			// Üst/Alt bar odaklıyken: Sol/Sağ = gezinme (varsayılan), Yukarı/Aşağı = bar değiştir
			if (onButtonBar) return;

			// Hiçbir bar odaklı değil (ör. ortadaki play/pause butonu): Sol/Sağ = seek
			if (canSeek && eventType === "left") {
				seekBy(-seekDuration);
				return;
			}
			if (canSeek && eventType === "right") {
				seekBy(seekDuration);
				return;
			}

			// Yukarı/aşağı: HUD'u gizlemek yerine üst/alt bardaki
			// düğmelere odak taşır (odak yöneticisi bunu kendisi yapar;
			// burada yalnızca otomatik gizleme sayacı yenilenir).
		}
	}, true);

	// ── Donanım geri tuşu hiyerarşisi ───────────────────────
	useEffect(() => {
		const onBackPress = () => {
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
		const sub = BackHandler.addEventListener(
			"hardwareBackPress",
			onBackPress,
		);
		return () => sub.remove();
	}, [showControls, onClose]);

	// ── Çubuk sürükleme ─────────────────────────────────────
	/*
	 * Sürükleme: çubuk önizlemeyi kendisi gösterir (`PlayerControls`);
	 * seek YALNIZCA bırakınca, TEK SEFER yapılır. `ratio === null` iptal
	 * demektir (responder çalındı) → seek YOK (eskiden 0'a atlıyordu).
	 */
	const handleScrubStart = useCallback(() => {
		// Sürükleme sürerken kontroller gizlenmesin.
		if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
	}, []);

	const handleScrubEnd = useCallback(
		(ratio) => {
			if (
				typeof ratio === "number" &&
				Number.isFinite(ratio) &&
				duration > 0
			) {
				seekTo(ratio * duration);
			}
			startHideTimerRef.current?.();
		},
		[seekTo, duration],
	);

	const bufferRatio =
		duration > 0
			? Math.min(1, Math.max(0, playableDuration / duration))
			: 0;

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
					pointerEvents="none">
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
						onLoadStart={() => {
							/*
							 * Her yeni kaynak burada görünür: "yedek akışa
							 * gerçekten geçildi mi" sorusunun tek kanıtı.
							 */
							console.log(
								`[oynatma] kaynak yükleniyor ${activeSourceIndex + 1}/${sources.length} url=${sources[activeSourceIndex]?.result?.url || "-"}`,
							);
							armFirstFrameTimer(activeSourceIndex);
						}}
						onLoad={handleLoad}
						onReadyForDisplay={markPlaybackStarted}
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
						enterPictureInPictureOnLeave={
							settings?.pictureInPicture !== false
						}
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
			{/*
			 * Hata ekranı varken kontrol katmanı RENDER EDİLMEZ: bu katmanın
			 * oynat/duraklat düğmesi `hasTVPreferredFocus` taşıdığı için
			 * odak orada kalıyor ve hata ekranındaki düğmeler kumandayla
			 * seçilemiyordu ("hata çıkınca fokus player butonlarında kalıyor").
			 */}
			{showControls && !hasError && (
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
					pointerEvents="box-none">
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
						onFocusZone={setFocusZone}
						onClose={() => {
							startHideTimerRef.current?.();
							onClose?.();
						}}
						onAction={
							settings?.pictureInPicture !== false &&
							!Platform.isTV ? (
								<TVPressable
									style={styles.iconButton}
									focusedStyle={styles.iconButtonFocused}
									cancelable={false}
									onPress={() => {
										startHideTimerRef.current?.();
										enterPip();
									}}>
									{/*
									 * ⚠️ `picture-in-picture-outline` Ionicons'ta YOKTUR ve
									 * "soru işareti" kutusu üretir. `tablet-landscape-outline`
									 * glyphmap'te DOĞRULANMIŞTIR.
									 */}
									<Ionicons
										name="tablet-landscape-outline"
										size={20}
										color={
											isPipActive ? Palette.primary : "#FFFFFF"
										}
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
						<View
							style={styles.centerControls}
							pointerEvents="box-none">
							{canSeek ? (
								<TVPressable
									style={styles.roundButton}
									focusedStyle={styles.roundButtonFocused}
									cancelable={false}
									onPress={() => seekBy(-seekDuration)}>
									<View style={styles.roundInner}>
										<Ionicons
											name="play-back-circle-outline"
											size={26}
											color={Palette.onSurface}
										/>
										<Text style={styles.roundLabel}>
											{seekDuration}
										</Text>
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
								onPress={togglePlayPause}>
								<Ionicons
									name={paused ? "play" : "pause"}
									size={30}
									color={Palette.onPrimaryContainer}
								/>
							</TVPressable>

							{canSeek ? (
								<TVPressable
									style={styles.roundButton}
									focusedStyle={styles.roundButtonFocused}
									cancelable={false}
									onPress={() => seekBy(seekDuration)}>
									<View style={styles.roundInner}>
										<Ionicons
											name="play-forward-circle-outline"
											size={26}
											color={Palette.onSurface}
										/>
										<Text style={styles.roundLabel}>
											{seekDuration}
										</Text>
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
								showRemainingTime={Boolean(
									settings?.showRemainingTime,
								)}
								onScrubStart={handleScrubStart}
								onScrubEnd={handleScrubEnd}
								onFocusZone={setFocusZone}
							/>

							<PlayerActionBar
								onFocusZone={setFocusZone}
								actions={[
									{
										key: "lock",
										icon: isLocked
											? "lock-closed"
											: "lock-open-outline",
										label: "Kilitle",
										active: isLocked,
										onPress: () => {
											startHideTimerRef.current?.();
											setIsLocked((prev) => !prev);
										},
									},
									{
										key: "resize",
										icon:
											RESIZE_MODE_ICONS[resizeMode] ||
											"expand-outline",
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
										menuItems: [
											{
												key: "subsync-cols",
												type: "columns",
												groups: [
													{
														key: "subs",
														title: "ALTYAZI",
														items: [
															{
																key: "sub-off",
																title: "Kapalı",
																icon: "close-circle-outline",
																selected:
																	!subtitles.selectedSubtitle,
																value: !subtitles.selectedSubtitle
																	? "Seçili"
																	: undefined,
																onPress: () =>
																	subtitles.selectSubtitle(
																		null,
																	),
															},
															...subtitles.allSubtitles.map(
																(s, i) => ({
																	key: `sub-${i}`,
																	title:
																		s.title ||
																		s.language ||
																		`Altyazı ${i + 1}`,
																	icon: "chatbubble-ellipses-outline",
																	selected:
																		subtitles.selectedSubtitle ===
																		s,
																	value:
																		subtitles.selectedSubtitle ===
																		s
																			? "Seçili"
																			: undefined,
																	onPress: () =>
																		subtitles.selectSubtitle(
																			s,
																		),
																}),
															),
														],
													},
													...(subtitles.selectedSubtitle
														? [
																{
																	key: "delay",
																	title: "GECİKME",
																	items: [
																		{
																			key: "sync-info",
																			type: "info",
																			title: "Şu an",
																			value: `${
																				subtitles.subtitleOffset >
																				0
																					? "+"
																					: ""
																			}${subtitles.subtitleOffset.toFixed(1)} sn`,
																		},
																		...[
																			-0.5,
																			-0.1,
																			0,
																			0.1,
																			0.5,
																		].map(
																			(v) => ({
																				key: `sync-${v}`,
																				title:
																					v === 0
																						? "Sıfırla"
																						: `${v > 0 ? "+" : ""}${v}s`,
																				icon: "time-outline",
																				selected:
																					v === 0 &&
																					subtitles.subtitleOffset ===
																						0,
																				onPress: () =>
																					subtitles.updateOffset(
																						v,
																						v === 0,
																					),
																			}),
																		),
																	],
																},
															]
														: []),
												],
											},
										],
									},
									{
										key: "source",
										icon: "server-outline",
										label: "Kaynak",
										menuItems: sourceMenuItems(),
									},
									{
										key: "tracks",
										icon: "options-outline",
										label: "Parçalar",
										active:
											selectedAudioTrackIndex !== null,
										menuItems: [
											{
												key: "tracks-cols",
												type: "columns",
												groups: [
													{
														key: "video",
														title: "VİDEO KALİTESİ",
														items: [
															{
																key: "v-auto",
																title: "Otomatik",
																icon: "sparkles-outline",
																selected:
																	selectedVariantId === null,
																value:
																	selectedVariantId === null
																		? "Aktif"
																		: undefined,
																onPress: () =>
																	selectVariant?.(
																		null,
																	),
															},
															...videoVariants.map(
																(v) => ({
																	key: `variant-${v.id}`,
																	title:
																		v.resolution ||
																		"Kalite",
																	icon: "videocam-outline",
																	selected:
																		selectedVariantId ===
																		v.id,
																	value:
																		selectedVariantId ===
																		v.id
																			? "Aktif"
																			: undefined,
																	onPress: () =>
																		selectVariant?.(
																			v.id,
																		),
																}),
															),
														],
													},
													{
														key: "audio",
														title: "SES PARÇALARI",
														items: availableAudioTracks.map(
															(track, index) => {
																const trackId =
																	typeof track.index ===
																	"number"
																		? track.index
																		: index;
																const isSelected =
																	selectedAudioTrackIndex ===
																		trackId ||
																	(selectedAudioTrackIndex ===
																		null &&
																		track.selected);
																return {
																	key: `audio-${index}`,
																	title:
																		track.title ||
																		(track.language
																			? `Ses (${track.language.toUpperCase()})`
																			: `Ses ${index + 1}`),
																	icon: "volume-high-outline",
																	selected:
																		isSelected,
																	value: isSelected
																		? "Aktif"
																		: undefined,
																	onPress: () => {
																		setSelectedAudioTrackIndex(
																			trackId,
																		);
																		subtitles.resetUserChoice();
																	},
																};
															},
														),
													},
												],
											},
										],
									},
									{
										key: "speed",
										icon: "speedometer-outline",
										label:
											playbackRate === 1
												? "Hız"
												: `${playbackRate}×`,
										active: playbackRate !== 1,
										disabled: isLive,
										menuItems: [
											{
												key: "rate-cols",
												type: "columns",
												groups: playbackRateGroups(),
											},
										],
									},
									// Sonraki bölüm (yalnızca dizi + sonraki bölüm biliniyorsa)
									nextEpisode && onNextEpisode
										? {
												key: "next",
												icon: "play-skip-forward-outline",
												label: "Sonraki bölüm",
												onPress: () => {
													startHideTimerRef.current?.();
													goNextEpisode();
												},
											}
										: null,
								]}
							/>
						</View>
					)}
				</View>
			)}

			{/* 4. KATMAN: Altyazı */}
			{subtitles.currentSubtitleText ? (
				<View
					style={[
						styles.subtitleContainer,
						{ bottom: subtitleBottom },
					]}
					pointerEvents="none">
					<View
						style={[
							styles.subtitlePill,
							{
								backgroundColor: subtitleBgColor(
									settings?.subtitleBgColor,
								),
							},
						]}>
						<Text
							style={[
								styles.subtitleText,
								{
									fontSize: settings?.subtitleFontSize || 16,
									color:
										settings?.subtitleTextColor ||
										"#FFFFFF",
									textShadowColor:
										settings?.subtitleTextShadow !== false
											? "rgba(0, 0, 0, 0.95)"
											: "transparent",
								},
							]}>
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
					<ActivityIndicator size="large" color={Palette.primary} />
					<Text style={styles.loadingText}>
						{isLoading
							? kalanSaniye != null
								? `Kaynak yükleniyor... ${kalanSaniye} sn`
								: "Kaynak yükleniyor..."
							: "Ara belleğe alınıyor..."}
					</Text>
				</View>
			)}

			{hasError && (
				<View style={styles.errorContainer}>
					<Ionicons
						name="alert-circle-outline"
						size={54}
						color="#FF453A"
					/>
					<Text style={styles.errorTitle}>
						{isLive ? "Yayın Açılamıyor" : "Oynatma Hatası"}
					</Text>
					<Text style={styles.errorDescription}>{errorMessage}</Text>
					{/*
					 * ⚠️ `TVPressable` + `autoFocus` ŞART: hata ekranı
					 * açıldığında kumanda odağı buraya TAŞINMALI. Düz
					 * `TouchableOpacity` odak TALEP ETMEZ; odak oynatıcı
					 * düğmelerinde kalır ve bu düğmeler OK ile seçilemez.
					 * Aynı anda tek `hasTVPreferredFocus` olmalı → kaynak
					 * listesi varsa ona, yoksa "Yeniden Dene"ye verilir.
					 */}
					<View style={styles.errorButtonsRow}>
						{sources.length > 1 && (
							<AppPeekMenu
								items={sourceMenuItems()}
								activateOn="tap">
								<TVPressable
									autoFocus
									style={styles.switchSourceButton}
									focusedStyle={
										styles.switchSourceButtonFocused
									}
									onPress={
										Platform.isTV
											? () =>
													openAppMenu({
														items: sourceMenuItems(),
													})
											: undefined
									}>
									<Ionicons
										name="server-outline"
										size={18}
										color="#FFFFFF"
									/>
									<Text
										style={
											styles.switchSourceButtonText
										}>
										{`Farklı Kaynak Seç (${sources.length} Kaynak)`}
									</Text>
								</TVPressable>
							</AppPeekMenu>
						)}
						<TVPressable
							autoFocus={sources.length <= 1}
							style={styles.retryButton}
							focusedStyle={styles.retryButtonFocused}
							onPress={() => {
								/*
								 * "Yeniden Dene" = listeyi ve indeksi SIFIRLA.
								 *
								 * Canlıda `onRetry` sunucudan taze akış listesi
								 * ister (istemci önbelleğini atlar): sunucudaki
								 * bir düzeltme cihaza hemen yansımalı. Film/
								 * dizide liste zaten tek seferliktir; hatırlanan
								 * hata kayıtları temizlenip ilk kaynaktan
								 * başlanır.
								 */
								clearFirstFrameTimer();
								if (retryTimerRef.current) {
									clearTimeout(retryTimerRef.current);
									retryTimerRef.current = null;
								}
								if (onRetry) {
									onRetry();
									return;
								}
								seenSourceErrorsRef.current.clear();
								retryCountRef.current.clear();
								deadUrlsRef.current.clear();
								timeoutRetriedRef.current.clear();
								switchSourceTo(0, { resetErrors: true });
							}}>
							<Ionicons
								name="refresh"
								size={18}
								color="#FFFFFF"
							/>
							<Text style={styles.retryButtonText}>
								Yeniden Dene
							</Text>
						</TVPressable>
					</View>
				</View>
			)}
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

/**
 * Aynı arka planın gömülü altyazılar için ARGB karşılığı (#AARRGGBB).
 * Native `Color.parseColor` CSS `rgba()` kabul etmez.
 */
function subtitleBgColorArgb(mode) {
	switch (mode) {
		case "solid-black":
			return "#FF000000";
		case "blur":
			return "#EB191B22"; // rgba(25, 27, 34, 0.92)
		case "transparent":
			return "#00000000";
		case "semi-black":
		default:
			return "#C7000000"; // rgba(0, 0, 0, 0.78)
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
		fontFamily: FontFamily.bold,
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
		backgroundColor: "rgba(192, 193, 255, 0.25)",
		borderColor: "rgba(255, 59, 48, 0.6)",
		borderWidth: 1,
	},
	iconButtonFocused: {
		backgroundColor: "rgba(192, 193, 255, 0.35)",
		borderColor: Palette.primary,
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
		borderColor: Palette.primary,
		borderWidth: 1.5,
		transform: [{ scale: 1.1 }],
	},
	pillText: {
		color: "#FFFFFF",
		fontSize: 11,
		fontFamily: FontFamily.semiBold,
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
		backgroundColor: Palette.primaryContainer,
		borderWidth: 2,
		borderColor: "transparent",
	},
	playButtonFocused: {
		borderColor: Palette.onSurface,
	},
	roundButton: {
		width: 52,
		height: 52,
		borderRadius: 26,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "rgba(0, 0, 0, 0.45)",
		borderWidth: 2,
		borderColor: "transparent",
	},
	roundButtonFocused: {
		borderColor: Palette.primary,
	},
	roundInner: {
		alignItems: "center",
		justifyContent: "center",
	},
	roundLabel: {
		color: Palette.onSurface,
		fontSize: 10,
		lineHeight: 12,
		fontFamily: FontFamily.bold,
		textAlign: "center",
		includeFontPadding: false,
		marginTop: -2,
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
		fontFamily: FontFamily.semiBold,
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
		fontFamily: FontFamily.bold,
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
		backgroundColor: Palette.primary,
		paddingHorizontal: 16,
		paddingVertical: 12,
		borderRadius: 10,
		// Odak halkası yerleşimi kaydırmasın diye saydam çerçeve rezerve edilir.
		borderWidth: 2,
		borderColor: "transparent",
	},
	switchSourceButtonFocused: {
		borderColor: "#FFFFFF",
		transform: [{ scale: 1.05 }],
	},
	switchSourceButtonText: {
		color: "#FFFFFF",
		fontSize: 14,
		fontFamily: FontFamily.semiBold,
	},
	retryButton: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		backgroundColor: "rgba(255, 255, 255, 0.15)",
		paddingHorizontal: 16,
		paddingVertical: 12,
		borderRadius: 10,
		borderWidth: 2,
		borderColor: "transparent",
	},
	retryButtonFocused: {
		borderColor: Palette.primary,
		backgroundColor: "rgba(192, 193, 255, 0.3)",
		transform: [{ scale: 1.05 }],
	},
	retryButtonText: {
		color: "#FFFFFF",
		fontSize: 14,
		fontFamily: FontFamily.semiBold,
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
		fontFamily: FontFamily.semiBold,
		textAlign: "center",
		textShadowOffset: { width: 0, height: 1 },
		textShadowRadius: 3,
		lineHeight: 22,
	},
});
