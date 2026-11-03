import { useFeedback } from "@/components/feedback/AppFeedbackProvider";
import { FontFamily, Palette } from "@/constants/theme";
import { useDownload } from "@/context/DownloadContext";
import { useTvMetrics } from "@/utils/tvMetrics";
import Image from "@components/common/SmartImage";
import TVPressable from "@components/common/TVPressable";
import ActionMenuModal from "@components/modal/ActionMenuModal";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useRouter } from "expo-router";
import {
	forwardRef,
	useCallback,
	useEffect,
	useImperativeHandle,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	ActivityIndicator,
	BackHandler,
	findNodeHandle,
	Modal,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";

/**
 * Format episode duration to Turkish string (e.g., "2 saat 21 dakika" or "45 dakika")
 */
function getEpisodeDurationTurkish(ep, epProgress, fallbackMinutes) {
	if (ep?.duration && typeof ep.duration === "string") {
		if (
			ep.duration.includes("saat") ||
			ep.duration.includes("dakika") ||
			ep.duration.includes("dk")
		) {
			return ep.duration;
		}
	}

	const raw =
		ep?.duration ||
		ep?.runtime ||
		ep?.time ||
		epProgress?.duration ||
		(fallbackMinutes ? fallbackMinutes * 60 : null);

	if (!raw) return null;

	if (typeof raw === "number") {
		const totalSecs = raw > 300 ? raw : raw * 60;
		const hours = Math.floor(totalSecs / 3600);
		const mins = Math.floor((totalSecs % 3600) / 60);
		if (hours > 0) {
			return `${hours} saat ${mins < 10 ? "0" : ""}${mins} dakika`;
		}
		return `${mins} dakika`;
	}

	if (typeof raw === "string") {
		if (raw.includes(":")) {
			const parts = raw.split(":").map(Number);
			if (parts.length === 3) {
				const [hours, mins] = parts;
				if (hours > 0) {
					return `${hours} saat ${mins < 10 ? "0" : ""}${mins} dakika`;
				}
				return `${mins} dakika`;
			} else if (parts.length === 2) {
				return `${parts[0]} dakika`;
			}
		}
	}

	return null;
}

/**
 * Bölüm listesi + sezon seçici. Film ve dizi detayında ortak kullanılır;
 * filmde `seasons`/`episodes` boş gelir ve bileşen hiçbir şey çizmez.
 */
const SeasonsSection = forwardRef(function SeasonsSection(
	{
		seasons,
		episodes,
		onEpisodePress,
		loading = false,
		initialSeason,
		selectedSeason: controlledSelectedSeason,
		onSeasonChange,
		seriesTitle = "",
		posterUrl = null,
		content = null,
		episodesProgress = {},
		totalEpisodes = 0,
		onSetWatched,
		// Derin bağ otomatik oynatma hedefi ({sezon, bolum}) ya da null —
		// FilmDetails derin bağdan doldurur (Faz 6 karar 2).
		otomatikBolum = null,
	},
	ref,
) {
	const { sp, isWide, isTV, isLandscape, width, gutter, contentMaxWidth } =
		useTvMetrics();
	const { alert, toast } = useFeedback();
	const { requestDownload, isDownloaded } = useDownload();
	const router = useRouter();

	/*
	 * Bölüm yerleşimi ORIENTASYONA göre seçilir, ekran GENİŞLİĞİNE göre değil:
	 *   - Dikey (telefon + tablet): kartlar alt alta, tam genişlik.
	 *   - Yatay ve TV: yatay SLIDER — kartlar yan yana, 3 kart görünür
	 *     (kapak üstte, altında "S1 B1 · durum", bölüm adı, 2 satır özet).
	 *     Kumanda ile sağa/sola kart kart gezilir.
	 */
	const tvEpisodes = isTV || isLandscape;
	const sliderGap = sp(12);
	const slideW = tvEpisodes
		? Math.floor(
				((contentMaxWidth ?? width) -
					2 * (16 + gutter) -
					2 * sliderGap) /
					3,
			)
		: 0;

	/*
	 * Bölüm kapağı 16:9. Ölçüler açıkça verilir; `aspectRatio` ile
	 * boyutlanan bir kapta mutlak konumlu katmanlar (görsel, durum
	 * katmanı) çöküyor ve oynat dairesi dikeyde ortalanmıyordu.
	 * Dikeyde 128dp: referans tasarımda kapak, telefon genişliğinin ~%33'ü.
	 * Slider kartında kapak kartın içidir (iki yan boşluk düşülür).
	 */
	const tileW = tvEpisodes ? slideW - 2 * sp(8) : sp(isWide ? 160 : 128);
	const tileH = Math.round(tileW * (9 / 16));

	/*
	 * TV slider'ı (tasarım: stitch_stream_pulse…): kartlar SABİT genişlikte
	 * 16:9 karelerdir; odak değişince boyut değişmez. Üstteki başlık/özet/
	 * süre bloğu odaklanan bölümü gösterir.
	 */
	const focusCardH = Math.round(slideW * (9 / 16));
	const [tvFocusIndex, setTvFocusIndex] = useState(0);
	/*
	 * Slider'da kumanda sırası AÇIKÇA bağlanır: sabit genişlikte de olsa
	 * Android'in geometrik araması satır içinde karışabiliyordu.
	 */
	const cardRefs = useRef([]);
	const [focusTags, setFocusTags] = useState({});
	const seasonPillRef = useRef(null);
	const [headerTag, setHeaderTag] = useState(undefined);

	const [isSeasonModalOpen, setIsSeasonModalOpen] = useState(false);
	const [sortOrder, setSortOrder] = useState("asc"); // 'asc' (1->N) | 'desc' (N->1)

	// ─── "İzlendi işaretle" durumu ─────────────────────────────────────────
	// Veri yazımı çağıran ekranda yapılır (`onSetWatched`); bu bileşen
	// yalnızca seçim/bağlam menüsü arayüzünü yönetir.
	const [isSelectionMode, setIsSelectionMode] = useState(false);
	const [selectedEpisodes, setSelectedEpisodes] = useState({});
	const [menuState, setMenuState] = useState(null); // {type:'season'} | {type:'episode', ep, index}
	const [isApplyingMarks, setIsApplyingMarks] = useState(false);
	const [feedbackMessage, setFeedbackMessage] = useState("");

	// Sezon ve bölüm verilerini normalize et
	const normalizedSeasons = useMemo(() => {
		if (!seasons && !episodes) return null;

		const result = {};

		// 1. seasons nesne ise: {"1": [...], "2": [...]}
		if (seasons && typeof seasons === "object" && !Array.isArray(seasons)) {
			Object.entries(seasons).forEach(([seasonKey, epList]) => {
				if (Array.isArray(epList) && epList.length > 0) {
					result[seasonKey] = epList;
				}
			});
		}
		// 2. episodes düz bir dizi ise
		else if (Array.isArray(episodes) && episodes.length > 0) {
			episodes.forEach((ep) => {
				const sNum = String(ep.season || ep.season_number || "1");
				if (!result[sNum]) result[sNum] = [];
				result[sNum].push(ep);
			});
		}
		// 3. seasons bir dizi ise
		else if (Array.isArray(seasons) && seasons.length > 0) {
			seasons.forEach((item, idx) => {
				if (Array.isArray(item.episodes)) {
					result[String(item.season || idx + 1)] = item.episodes;
				} else if (item.season || item.episode) {
					const sNum = String(item.season || "1");
					if (!result[sNum]) result[sNum] = [];
					result[sNum].push(item);
				}
			});
		}

		return Object.keys(result).length > 0 ? result : null;
	}, [seasons, episodes]);

	// Mevcut sezon numaraları (sıralı)
	const seasonKeys = useMemo(() => {
		if (!normalizedSeasons) return [];
		return Object.keys(normalizedSeasons).sort((a, b) => {
			const numA = parseInt(a, 10);
			const numB = parseInt(b, 10);
			if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
			return a.localeCompare(b);
		});
	}, [normalizedSeasons]);

	const isControlled =
		controlledSelectedSeason !== undefined &&
		controlledSelectedSeason !== null;
	const [internalSelectedSeason, setInternalSelectedSeason] = useState(
		initialSeason ? String(initialSeason) : "1",
	);
	const selectedSeason = useMemo(() => {
		if (isControlled) return String(controlledSelectedSeason);
		if (seasonKeys.includes(internalSelectedSeason))
			return internalSelectedSeason;
		if (initialSeason && seasonKeys.includes(String(initialSeason)))
			return String(initialSeason);
		return seasonKeys[0] || "1";
	}, [
		isControlled,
		controlledSelectedSeason,
		seasonKeys,
		internalSelectedSeason,
		initialSeason,
	]);

	const handleSeasonSelect = useCallback(
		(sKey) => {
			const sKeyStr = String(sKey);
			setInternalSelectedSeason(sKeyStr);
			if (onSeasonChange) {
				onSeasonChange(sKeyStr);
			}
		},
		[onSeasonChange],
	);

	const sortedEpisodes = useMemo(() => {
		if (!normalizedSeasons) return [];
		const rawList =
			normalizedSeasons[selectedSeason] ||
			normalizedSeasons[seasonKeys[0]] ||
			[];
		const listCopy = [...rawList];

		listCopy.sort((a, b) => {
			const numA = parseInt(a.episode || a.episode_number || 0, 10);
			const numB = parseInt(b.episode || b.episode_number || 0, 10);
			return sortOrder === "asc" ? numA - numB : numB - numA;
		});

		return listCopy;
	}, [normalizedSeasons, selectedSeason, seasonKeys, sortOrder]);

	/*
	 * TV slider başlığı (tasarım): bölüm adı/özeti/süresi kartın üstünde
	 * değil, section başlığında ve odaklanan bölüme göre değişir.
	 */
	const tvFocused = tvEpisodes ? sortedEpisodes[tvFocusIndex] || null : null;
	const tvFocusedNo = tvFocused
		? tvFocused.episode || tvFocused.episode_number || tvFocusIndex + 1
		: null;
	const tvFocusedProgress = tvFocused
		? episodesProgress?.[tvFocused.url] ||
			episodesProgress?.[`s${selectedSeason}_e${tvFocusedNo}`] ||
			(tvFocused.id && episodesProgress?.[tvFocused.id])
		: null;
	const tvFocusedTitle =
		tvFocused?.title && tvFocused.title.trim() !== ""
			? tvFocused.title.trim()
			: tvFocusedNo
				? `${tvFocusedNo}. Bölüm`
				: "";
	const tvFocusedDuration = tvFocused
		? getEpisodeDurationTurkish(
				tvFocused,
				tvFocusedProgress,
				content?.runtime_minutes,
			)
		: null;
	const tvFocusedStatus =
		tvFocusedProgress?.status === "completed"
			? "İzlendi"
			: tvFocusedProgress?.status === "in_progress"
				? "Kaldığın yer"
				: "Sırada";

	// Slide'ın odağı, izlenmeye devam edilen bölüme kendiliğinden gelir.
	useEffect(() => {
		if (!tvEpisodes || sortedEpisodes.length === 0) return;
		const idx = sortedEpisodes.findIndex((ep, i) => {
			const no = ep.episode || ep.episode_number || i + 1;
			const pr =
				episodesProgress?.[ep.url] ||
				episodesProgress?.[`s${selectedSeason}_e${no}`] ||
				(ep.id && episodesProgress?.[ep.id]);
			return pr?.status === "in_progress";
		});
		setTvFocusIndex(idx >= 0 ? idx : 0);
	}, [tvEpisodes, sortedEpisodes, selectedSeason, episodesProgress]);

	// Kart komşularının native etiketleri (nextFocusLeft/Right için).
	useEffect(() => {
		if (!tvEpisodes) return;
		const map = {};
		sortedEpisodes.forEach((_, i) => {
			const tag = findNodeHandle(cardRefs.current[i]);
			if (tag) map[i] = tag;
		});
		setFocusTags(map);
		setHeaderTag(findNodeHandle(seasonPillRef.current));
	}, [tvEpisodes, sortedEpisodes, tvFocusIndex]);

	// ─── Derin bağ otomatik oynatma (Faz 6 karar 2) ────────────────────
	// Bildirim kartından gelen `otomatikBolum` ({sezon, bolum}): hedef
	// sezonun bölüm listesi HAZIR olunca BİR KEZ oynatılır. Önce seçili
	// sezon hedefe çekilir (ekranın kontrollediği durumda
	// `handleSeasonSelect` aynı onay zincirini kullanır), sonra hedef
	// bölüm geçerli listede bulunur ve elle dokunma yoluyla aynı
	// oynatıcı akışına gönderilir — "Sonraki bölüm" verisi de doğru
	// sırada kurulur.
	// `otomatikOynatildiRef` tek oynatmayı garantiler: etki her koşumunda
	// yeniden çalışsa bile (fonksiyon kimlikleri değişken) yeniden
	// basmaz; oynatıcıdan geri dönüp aynı ekran örneğine dönmek dahil.
	const otomatikOynatildiRef = useRef(false);

	useEffect(() => {
		if (!otomatikBolum || otomatikOynatildiRef.current) return;

		const sezonKey =
			otomatikBolum.sezon != null ? String(otomatikBolum.sezon) : "";

		if (!normalizedSeasons) return; // listelerin gelmesini bekle

		if (!sezonKey || !normalizedSeasons[sezonKey]) {
			// Hedef bozuk ya da plugin bu sezonu vermiyor: güvenli vazgeçiş —
			// satır okundu damgasını zaten aldı; kullanıcı elle gezinebilir.
			otomatikOynatildiRef.current = true;
			return;
		}

		if (String(selectedSeason) !== sezonKey) {
			handleSeasonSelect(sezonKey);
			return; // seçili sezon değişince etkinin yeni koşumu oynatır
		}

		const hedefNo = Number(otomatikBolum.bolum);
		if (!Number.isFinite(hedefNo) || hedefNo < 1) {
			otomatikOynatildiRef.current = true;
			return;
		}

		const hedefIndex = sortedEpisodes.findIndex(
			(ep) => Number(ep.episode || ep.episode_number) === hedefNo,
		);
		if (hedefIndex < 0) {
			// Bölüm bu koşumda listede yok: sonsuz bekleme yapmaktansa
			// tekrar denemeyi kes; kullanıcı elle bölüme basabilir.
			otomatikOynatildiRef.current = true;
			return;
		}

		const hedef = sortedEpisodes[hedefIndex];
		if (!hedef?.url) {
			otomatikOynatildiRef.current = true;
			return;
		}

		otomatikOynatildiRef.current = true;
		handleEpisodeClick(hedef, hedefIndex);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [
		otomatikBolum,
		normalizedSeasons,
		selectedSeason,
		sortedEpisodes,
		handleSeasonSelect,
	]);

	// ── İndirme (gerçek akış) ──────────────────────────────────────────
	// Ortak tetikleyici: kaynak/altyazı/ses seçimi DownloadContext'te.
	// Dizi bilgisi (`content`) burada yoksa içerik kimliği seriesTitle'dan
	// türetilir; bölüm nesnesi modal'a taşınır.
	const seriesContent = useMemo(
		() => ({
			id: content?.id || content?.url || seriesTitle,
			url: content?.url,
			title: seriesTitle || content?.title || "Dizi",
			plugin: content?.plugin || content?.pluginName || null,
			poster_url: posterUrl,
			seasons,
		}),
		[content, seriesTitle, posterUrl, seasons],
	);

	const handleDownloadEpisode = (ep, epNumber, epTitle) => {
		const epIndirildiMi = isDownloaded({
			contentId: seriesContent.id,
			seriesId: seriesContent.id,
			season: selectedSeason,
			episode: epNumber,
		});
		if (epIndirildiMi) {
			toast.info(`"${epTitle}" zaten indirildi.`);
			return;
		}
		requestDownload({
			content: seriesContent,
			episode: {
				season: Number(selectedSeason),
				episode: Number(epNumber),
				episodeTitle: epTitle,
				url: ep.url,
			},
		});
	};

	// Tüm sezonu indirme: her bölüm kuyruğa ayrı ayrı girer; eş zamanlılık
	// sınırı DownloadManager'da (maxConcurrentDownloads).
	const handleDownloadSeason = () => {
		if (sortedEpisodes.length === 0) return;

		alert({
			title: "Sezonu İndir",
			message: `${selectedSeason}. Sezondaki ${sortedEpisodes.length} bölüm indirme kuyruğuna eklensin mi?`,
			confirmText: "Tümünü Ekle",
			cancelText: "Vazgeç",
			onConfirm: () => {
						sortedEpisodes.forEach((ep, i) => {
							const epNumber =
								ep.episode || ep.episode_number || i + 1;
							const epTitle =
								ep.title && ep.title.trim() !== ""
									? ep.title.trim()
									: `${selectedSeason}. Sezon ${epNumber}. Bölüm`;

							const indirildi = isDownloaded({
								contentId: seriesContent.id,
								seriesId: seriesContent.id,
								season: selectedSeason,
								episode: epNumber,
							});
							if (indirildi || !ep.url) return;

							requestDownload({
								content: seriesContent,
								episode: {
									season: Number(selectedSeason),
									episode: Number(epNumber),
									episodeTitle: epTitle,
									url: ep.url,
								},
							});
						});
					},
		});
	};

	// Bölüme tıklanınca oynat
	const handleEpisodeClick = (ep, index) => {
		if (onEpisodePress) {
			onEpisodePress(ep);
			return;
		}

		if (ep.url) {
			const epNumber = ep.episode || ep.episode_number || index + 1;
			const epKey = `s${selectedSeason}_e${epNumber}`;
			const epProgress =
				episodesProgress?.[ep.url] ||
				episodesProgress?.[epKey] ||
				(ep.id && episodesProgress?.[ep.id]);

			// Sonraki bölümü tespit et (eğer varsa)
			const nextEp = sortedEpisodes[index + 1] || null;

			router.push({
				pathname: "/player",
				params: {
					url: ep.url,
					title: seriesTitle || content?.title || ep.title || "Dizi",
					subtitle: `${selectedSeason}. Sezon ${epNumber}. Bölüm${
						ep.title ? ` - ${ep.title}` : ""
					}`,
					poster: ep.poster || posterUrl || null,
					type: "episode",
					id:
						ep.id ||
						ep.url ||
						`${content?.id || content?.url || "series"}_s${selectedSeason}_e${epNumber}`,
					plugin: content?.plugin,
					seriesId: content?.id || content?.url,
					seriesTitle: seriesTitle || content?.title || "Dizi",
					season: selectedSeason,
					episode: epNumber,
					episodeTitle: ep.title || `Bölüm ${epNumber}`,
					totalEpisodes: totalEpisodes || undefined,
					currentTime:
						epProgress?.status === "in_progress"
							? epProgress.currentTime
							: 0,
					nextEpisode: nextEp
						? JSON.stringify({
								id: nextEp.id || nextEp.url,
								url: nextEp.url,
								title: nextEp.title,
								season: selectedSeason,
								episode:
									nextEp.episode ||
									nextEp.episode_number ||
									epNumber + 1,
								poster: nextEp.poster || posterUrl,
							})
						: undefined,
				},
			});
		}
	};

	// ─── "İzlendi işaretle" yardımcıları ───────────────────────────────────
	// Sezon ⋮ menüsü, bölüm bağlam menüsü ve çoklu seçim modunun ortak
	// mantığı. Ağır iş (storage yazımı) çağıran ekrandadır:
	// `onSetWatched(marks, watched)` → işaretlenen bölüm sayısını döner.
	const progressForEpisode = useCallback(
		(ep, index) => {
			const epNumber = ep.episode || ep.episode_number || index + 1;
			const epKey = `s${selectedSeason}_e${epNumber}`;
			return (
				episodesProgress?.[ep.url] ||
				episodesProgress?.[epKey] ||
				(ep.id && episodesProgress?.[ep.id])
			);
		},
		[episodesProgress, selectedSeason],
	);

	const isEpisodeCompleted = useCallback(
		(ep, index) => progressForEpisode(ep, index)?.status === "completed",
		[progressForEpisode],
	);

	// Seçim anahtarı: önce url (tekil), yoksa `s{sezon}_e{bölüm}`.
	const episodeSelectionKey = useCallback(
		(ep, index) => {
			const epNumber = ep.episode || ep.episode_number || index + 1;
			return ep.url || `s${selectedSeason}_e${epNumber}`;
		},
		[selectedSeason],
	);

	// Seçim anahtarlarını `onSetWatched` işaret listesine çevirir.
	const buildMarksForKeyList = useCallback(
		(keys) => {
			const keySet = new Set(keys);
			const marks = [];
			sortedEpisodes.forEach((ep, index) => {
				const key = episodeSelectionKey(ep, index);
				if (!keySet.has(key)) return;
				const epNumber = ep.episode || ep.episode_number || index + 1;
				marks.push({
					season: Number(selectedSeason) || selectedSeason,
					episode: Number(epNumber) || epNumber,
					title: ep.title ? ep.title.trim() : null,
					url: ep.url || null,
					id: ep.id || null,
					poster: ep.poster || posterUrl || null,
				});
			});
			return marks;
		},
		[sortedEpisodes, episodeSelectionKey, selectedSeason, posterUrl],
	);

	const showFeedback = useCallback((message) => {
		setFeedbackMessage(message);
	}, []);

	useEffect(() => {
		if (!feedbackMessage) return;
		const timer = setTimeout(() => setFeedbackMessage(""), 2600);
		return () => clearTimeout(timer);
	}, [feedbackMessage]);

	const applyMarks = useCallback(
		async (marks, watched) => {
			if (!marks || marks.length === 0 || isApplyingMarks) return;
			if (typeof onSetWatched !== "function") return;

			setIsApplyingMarks(true);
			try {
				const count = await onSetWatched(marks, watched);
				const applied = Number(count) || marks.length;
				showFeedback(
					watched
						? `${applied} bölüm "izlendi" işaretlendi`
						: `${applied} bölümün işareti kaldırıldı`,
				);
				setIsSelectionMode(false);
				setSelectedEpisodes({});
			} catch (error) {
				console.error("İzlendi işaretleme hatası:", error);
				showFeedback("İşlem başarısız oldu");
			} finally {
				setIsApplyingMarks(false);
			}
		},
		[isApplyingMarks, onSetWatched, showFeedback],
	);

	const toggleEpisodeSelection = useCallback((key) => {
		setSelectedEpisodes((prev) => {
			const next = { ...prev };
			if (next[key]) delete next[key];
			else next[key] = true;
			return next;
		});
	}, []);

	const selectedKeys = useMemo(
		() => Object.keys(selectedEpisodes),
		[selectedEpisodes],
	);
	const selectedCount = selectedKeys.length;
	const allSelected =
		sortedEpisodes.length > 0 && selectedCount === sortedEpisodes.length;

	const toggleSelectAll = useCallback(() => {
		if (allSelected) {
			setSelectedEpisodes({});
			return;
		}
		const next = {};
		sortedEpisodes.forEach((ep, index) => {
			next[episodeSelectionKey(ep, index)] = true;
		});
		setSelectedEpisodes(next);
	}, [allSelected, sortedEpisodes, episodeSelectionKey]);

	const enterSelectionMode = useCallback((preselectKey) => {
		setMenuState(null);
		setIsSelectionMode(true);
		setSelectedEpisodes(preselectKey ? { [preselectKey]: true } : {});
	}, []);

	const cancelSelection = useCallback(() => {
		if (isSeasonModalOpen) {
			setIsSeasonModalOpen(false);
			return true;
		}
		if (menuState) {
			setMenuState(null);
			return true;
		}
		if (isSelectionMode) {
			setIsSelectionMode(false);
			setSelectedEpisodes({});
			return true;
		}
		return false;
	}, [isSeasonModalOpen, menuState, isSelectionMode]);

	// Üst ekran (MovieDetails) geri tuşunda önce bunu çağırır: seçim/menü
	// açıkken geri tuşu ekrandan çıkmaz, yalnızca seçimi kapatır.
	useImperativeHandle(
		ref,
		() => ({
			cancelSelection,
		}),
		[cancelSelection],
	);

	// Seçim modu açıkken donanım geri tuşu güvencesi (bileşen tek başına
	// kullanılırsa da çalışır; üst ekranın dinleyicisi önce davranır).
	useEffect(() => {
		if (!isSelectionMode) return;
		const onBackPress = () => cancelSelection();
		const sub = BackHandler.addEventListener(
			"hardwareBackPress",
			onBackPress,
		);
		return () => sub.remove();
	}, [isSelectionMode, cancelSelection]);

	const seasonMarksAll = useCallback(
		() =>
			buildMarksForKeyList(
				sortedEpisodes.map((ep, index) =>
					episodeSelectionKey(ep, index),
				),
			),
		[buildMarksForKeyList, sortedEpisodes, episodeSelectionKey],
	);

	const seasonAllCompleted =
		sortedEpisodes.length > 0 &&
		sortedEpisodes.every((ep, index) => isEpisodeCompleted(ep, index));

	const menuTitle = useMemo(() => {
		if (!menuState) return "";
		if (menuState.type === "season") return `${selectedSeason}. Sezon`;

		const { ep, index } = menuState;
		const epNumber = ep.episode || ep.episode_number || index + 1;
		const rawTitle = ep.title ? ep.title.trim() : "";
		return rawTitle
			? `${epNumber}. ${rawTitle}`
			: `${selectedSeason}. ${epNumber}. Bölüm`;
	}, [menuState, selectedSeason]);

	const menuSubtitle = useMemo(() => {
		if (!menuState) return "";
		const title = seriesTitle || content?.title || "Dizi";
		if (menuState.type === "season") {
			return `${title} • ${sortedEpisodes.length} Bölüm`;
		}
		return title;
	}, [menuState, seriesTitle, content, sortedEpisodes.length]);

	const menuActions = useMemo(() => {
		if (!menuState) return [];

		if (menuState.type === "season") {
			return [
				seasonAllCompleted
					? {
							key: "season-unmark",
							label: "Sezonu İzlenmedi Yap",
							description: `${selectedSeason}. sezondaki tüm bölüm işaretlerini kaldır`,
							icon: "close-circle-outline",
							iconColor: "#f43f5e",
							iconBg: "rgba(244, 63, 94, 0.15)",
							onPress: () => applyMarks(seasonMarksAll(), false),
						}
					: {
							key: "season-mark",
							label: "Sezonu İzlendi İşaretle",
							description: `${sortedEpisodes.length} bölümün tamamını işaretle`,
							icon: "checkmark-done-outline",
							iconColor: "#10b981",
							iconBg: "rgba(16, 185, 129, 0.15)",
							onPress: () => applyMarks(seasonMarksAll(), true),
						},
				{
					key: "select-episodes",
					label: "Bölüm Seç…",
					description: "Birden fazla bölümü elle seç ve işaretle",
					icon: "list-outline",
					onPress: () => enterSelectionMode(),
				},
				{
					key: "season-download",
					label: "Sezonu İndir",
					description:
						"Seçili sezonun bölümlerini indirme kuyruğuna ekle",
					icon: "download-outline",
					iconColor: "#38bdf8",
					iconBg: "rgba(56, 189, 248, 0.15)",
					onPress: () => {
						setMenuState(null);
						handleDownloadSeason();
					},
				},
			];
		}

		const { ep, index } = menuState;
		const done = isEpisodeCompleted(ep, index);
		const buBolumIndirildi = isDownloaded({
			contentId: content?.id || content?.url || seriesTitle,
			seriesId: content?.id || content?.url || seriesTitle,
			season: selectedSeason,
			episode: ep.episode || ep.episode_number || index + 1,
		});
		const singleMark = buildMarksForKeyList([
			episodeSelectionKey(ep, index),
		]);

		return [
			{
				key: "ep-download",
				label: buBolumIndirildi ? "İndirildi" : "Bölümü İndir",
				description: buBolumIndirildi
					? "Bu bölüm zaten indirildi"
					: "İndirme ayarlarıyla kuyruğa ekle",
				icon: buBolumIndirildi
					? "checkmark-done-outline"
					: "download-outline",
				iconColor: buBolumIndirildi ? "#10b981" : "#38bdf8",
				iconBg: buBolumIndirildi
					? "rgba(16, 185, 129, 0.15)"
					: "rgba(56, 189, 248, 0.15)",
				onPress: () => {
					setMenuState(null);
					handleDownloadEpisode(
						ep,
						ep.episode || ep.episode_number || index + 1,
						ep.title ||
							`${selectedSeason}. Sezon ${
								ep.episode || ep.episode_number || index + 1
							}. Bölüm`,
					);
				},
			},
			done
				? {
						key: "ep-unmark",
						label: "İzlenmedi Olarak İşaretle",
						icon: "close-circle-outline",
						iconColor: "#f43f5e",
						iconBg: "rgba(244, 63, 94, 0.15)",
						onPress: () => applyMarks(singleMark, false),
					}
				: {
						key: "ep-mark",
						label: "İzlendi Olarak İşaretle",
						icon: "checkmark-circle-outline",
						iconColor: "#10b981",
						iconBg: "rgba(16, 185, 129, 0.15)",
						onPress: () => applyMarks(singleMark, true),
					},
			{
				key: "select-episodes",
				label: "Bölüm Seç…",
				description: "Çoklu seçim moduna geç",
				icon: "list-outline",
				onPress: () =>
					enterSelectionMode(episodeSelectionKey(ep, index)),
			},
		];
	}, [
		menuState,
		seasonAllCompleted,
		selectedSeason,
		sortedEpisodes.length,
		seasonMarksAll,
		applyMarks,
		enterSelectionMode,
		isEpisodeCompleted,
		buildMarksForKeyList,
		isDownloaded,
		handleDownloadEpisode,
		handleDownloadSeason,
		seriesTitle,
		content?.id,
		content?.url,
		episodeSelectionKey,
	]);

	if (loading && (!normalizedSeasons || seasonKeys.length === 0)) {
		return (
			<View style={[styles.container, { marginBottom: sp(24) }]}>
				<View
					style={[
						styles.loadingBox,
						{
							backgroundColor: Palette.surfaceLow,
							paddingVertical: sp(18),
							gap: sp(10),
						},
					]}>
					<ActivityIndicator size="small" color={Palette.primary} />
					<Text
						style={[
							styles.loadingText,
							{
								color: Palette.onSurfaceVariant,
								fontSize: sp(13),
							},
						]}>
						Bölümler yükleniyor...
					</Text>
				</View>
			</View>
		);
	}

	if (!normalizedSeasons || seasonKeys.length === 0) {
		return null;
	}

	return (
		<View style={[styles.container, { marginBottom: sp(24) }]}>
			{isSelectionMode ? (
				/* Seçim Modu Çubuğu — bölümleri elle seçip toplu işaretleme */
				<View
					style={[
						styles.selectionBar,
						{ gap: sp(8), marginBottom: sp(12) },
					]}>
					<TVPressable
						style={({ focused }) => [
							styles.selectionChip,
							{ backgroundColor: Palette.surface },
							focused && styles.focusRing,
						]}
						onPress={toggleSelectAll}
						activeOpacity={0.75}>
						<Ionicons
							name={allSelected ? "checkbox" : "square-outline"}
							size={sp(15)}
							color={Palette.onSurface}
						/>
						<Text
							style={[
								styles.selectionChipText,
								{ color: Palette.onSurface, fontSize: sp(12) },
							]}>
							{allSelected ? "Seçimi Kaldır" : "Tümünü Seç"}
						</Text>
					</TVPressable>

					<Text
						style={[
							styles.selectionCountText,
							{
								color: Palette.onSurfaceVariant,
								fontSize: sp(12),
							},
						]}>
						{selectedCount} bölüm
					</Text>

					<TVPressable
						style={({ focused }) => [
							styles.selectionChip,
							styles.selectionChipPrimary,
							selectedCount === 0 && { opacity: 0.5 },
							focused && styles.focusRing,
						]}
						onPress={() => {
							if (selectedCount === 0 || isApplyingMarks) return;
							applyMarks(
								buildMarksForKeyList(selectedKeys),
								true,
							);
						}}
						activeOpacity={0.75}>
						{isApplyingMarks ? (
							<ActivityIndicator
								size="small"
								color={Palette.background}
							/>
						) : (
							<Ionicons
								name="checkmark-done"
								size={sp(15)}
								color={Palette.background}
							/>
						)}
						<Text
							style={[
								styles.selectionChipPrimaryText,
								{ fontSize: sp(12) },
							]}>
							İzlendi İşaretle
						</Text>
					</TVPressable>

					<TVPressable
						style={({ focused }) => [
							styles.selectionChip,
							styles.selectionChipDanger,
							selectedCount === 0 && { opacity: 0.5 },
							focused && styles.focusRing,
						]}
						onPress={() => {
							if (selectedCount === 0 || isApplyingMarks) return;
							applyMarks(
								buildMarksForKeyList(selectedKeys),
								false,
							);
						}}
						activeOpacity={0.75}>
						<Ionicons
							name="close-circle-outline"
							size={sp(15)}
							color={Palette.error}
						/>
						<Text
							style={[
								styles.selectionChipText,
								{ color: Palette.error, fontSize: sp(12) },
							]}>
							İzlenmedi Yap
						</Text>
					</TVPressable>

					<TVPressable
						style={({ focused }) => [
							styles.selectionChip,
							focused && styles.focusRing,
						]}
						onPress={() => {
							setIsSelectionMode(false);
							setSelectedEpisodes({});
						}}
						activeOpacity={0.75}>
						<Text
							style={[
								styles.selectionChipText,
								{ color: Palette.onSurface, fontSize: sp(12) },
							]}>
							Vazgeç
						</Text>
					</TVPressable>
				</View>
			) : (
				<>
					{/* Sezon hapı + sıralama / toplu indirme / ⋮ — solla hizalı */}
					<View
						style={[
							styles.headerRow,
							{ marginBottom: sp(14), gap: sp(10) },
						]}>
						<View style={[styles.headerControls, { gap: sp(8) }]}>
							{/* Sezon seçici */}
							<TVPressable
								style={({ focused }) => [
									styles.seasonPill,
									{
										paddingHorizontal: sp(12),
										paddingVertical: sp(6),
										gap: sp(6),
									},
									focused && styles.focusRing,
								]}
								onPress={() => setIsSeasonModalOpen(true)}
								ref={seasonPillRef}
								nextFocusDown={
									focusTags[tvFocusIndex] || focusTags[0]
								}
								activeOpacity={0.75}>
								<Text
									style={[
										styles.seasonPillText,
										{
											color: Palette.onSurface,
											fontSize: sp(13),
										},
									]}
									numberOfLines={1}>
									Sezon {selectedSeason}
								</Text>
								<Ionicons
									name="chevron-down"
									size={sp(16)}
									color={Palette.onSurfaceVariant}
								/>
							</TVPressable>

							{/* Sıralama (artan / azalan) */}
							<TVPressable
								style={({ focused }) => [
									styles.iconButton,
									{
										width: sp(32),
										height: sp(32),
										borderRadius: sp(16),
									},
									focused && styles.focusRing,
								]}
								onPress={() =>
									setSortOrder((prev) =>
										prev === "asc" ? "desc" : "asc",
									)
								}
								activeOpacity={0.75}
								accessibilityLabel="Bölüm sıralaması"
								nextFocusDown={
									focusTags[tvFocusIndex] || focusTags[0]
								}>
								<Ionicons
									name={
										sortOrder === "asc"
											? "arrow-up"
											: "arrow-down"
									}
									size={sp(16)}
									color={Palette.onSurfaceVariant}
								/>
							</TVPressable>

							{/* Sezonun tamamını indir */}
							<TVPressable
								style={({ focused }) => [
									styles.iconButton,
									{
										width: sp(32),
										height: sp(32),
										borderRadius: sp(16),
									},
									focused && styles.focusRing,
								]}
								onPress={handleDownloadSeason}
								activeOpacity={0.7}
								accessibilityLabel="Sezonu indir"
								nextFocusDown={
									focusTags[tvFocusIndex] || focusTags[0]
								}
								hitSlop={{
									top: 8,
									bottom: 8,
									left: 8,
									right: 8,
								}}>
								<Ionicons
									name="download-outline"
									size={sp(17)}
									color={Palette.onSurfaceVariant}
								/>
							</TVPressable>

							{/* Sezon işlemleri */}
							<TVPressable
								style={({ focused }) => [
									styles.iconButton,
									{
										width: sp(32),
										height: sp(32),
										borderRadius: sp(16),
									},
									focused && styles.focusRing,
								]}
								onPress={() => setMenuState({ type: "season" })}
								activeOpacity={0.75}
								accessibilityLabel="Sezon işlemleri"
								nextFocusDown={
									focusTags[tvFocusIndex] || focusTags[0]
								}
								hitSlop={{
									top: 8,
									bottom: 8,
									left: 8,
									right: 8,
								}}>
								<Ionicons
									name="ellipsis-vertical"
									size={sp(16)}
									color={Palette.onSurfaceVariant}
								/>
							</TVPressable>
						</View>
					</View>
					{/* TV: odaklanan bölümün adı/özeti/süresi (tasarım). */}
					{tvEpisodes && tvFocused ? (
						<View style={{ marginBottom: sp(12) }}>
							<Text
								style={[
									styles.tvEpisodeTitle,
									{ fontSize: sp(22) },
								]}
								numberOfLines={1}>
								{`${tvFocusedNo}. ${tvFocusedTitle}`.toUpperCase()}
							</Text>
							{tvFocused?.overview ? (
								<Text
									style={[
										styles.episodeSynopsis,
										{ fontSize: sp(13), marginTop: sp(4) },
									]}
									numberOfLines={2}>
									{tvFocused.overview}
								</Text>
							) : null}
							<View
								style={{
									flexDirection: "row",
									alignItems: "center",
									gap: sp(10),
									marginTop: sp(6),
								}}>
								{tvFocusedDuration ? (
									<Text
										style={[
											styles.episodeDurationText,
											{ fontSize: sp(13) },
										]}>
										{tvFocusedDuration}
									</Text>
								) : null}
								<Text
									style={[
										styles.episodeStatus,
										{
											fontSize: sp(13),
											color:
												tvFocusedStatus === "İzlendi"
													? Palette.secondary
													: tvFocusedStatus ===
														  "Kaldığın yer"
														? Palette.primary
														: Palette.outline,
										},
									]}>
									{tvFocusedStatus}
								</Text>
							</View>
						</View>
					) : null}
				</>
			)}

			{/* Bölüm Listesi
			    Dikey (telefon + tablet): alt alta, tam genişlik.
			    Yatay ve TV: 10-feet ızgarası — kapak üstte, metin altında;
			    4 sütun (referans: i_erik_detay_tv_10_foot_aray_z).
			    ⚠️ Kaydırmasız `ScrollView` DEĞİL düz `View`: iç içe
			    kaydırma kabı, kumanda odağı bu bölüme geldiğinde dıştaki
			    sayfayı yanlış konuma kaydırıyordu (odaklanan kart ekranın
			    en üstüne taşınıyor, hero görünümden çıkıyordu). */}
			<ScrollView
				horizontal={tvEpisodes}
				scrollEnabled={tvEpisodes}
				showsHorizontalScrollIndicator={false}
				contentContainerStyle={[
					tvEpisodes ? styles.episodesSlider : styles.episodesList,
					{ gap: tvEpisodes ? sliderGap : sp(10) },
				]}>
				{sortedEpisodes.map((ep, index) => {
					const epNumber =
						ep.episode || ep.episode_number || index + 1;
					const rawTitle = ep.title ? ep.title.trim() : "";
					/*
					 * Başlık biçimi: Netflix/Prime tarzı '<bölüm>. <bölüm adı>'.
					 * Kart içinde numara ayrı etikette durur, başlıkta yalnızca
					 * bölüm adı kalır (referans tasarım).
					 */
					const epDisplayTitle = rawTitle
						? `${epNumber}. ${rawTitle}`
						: `${epNumber}. Bölüm`;

					const epIndirildi = isDownloaded({
						contentId: content?.id || content?.url || seriesTitle,
						seriesId: content?.id || content?.url || seriesTitle,
						season: selectedSeason,
						episode: epNumber,
					});

					const epKey = `s${selectedSeason}_e${epNumber}`;
					const epProgress =
						episodesProgress?.[ep.url] ||
						episodesProgress?.[epKey] ||
						(ep.id && episodesProgress?.[ep.id]);

					const isCompleted = epProgress?.status === "completed";
					const isInProgress = epProgress?.status === "in_progress";
					const selectionKey = episodeSelectionKey(ep, index);
					const isSelected = Boolean(selectedEpisodes[selectionKey]);

					const epDurationFormatted = getEpisodeDurationTurkish(
						ep,
						epProgress,
						content?.runtime_minutes,
					);

					/*
					 * Bölüm kapağı: backend çoğu bölümde `still_url`
					 * vermiyor (null). Boş siyah kutu yerine dizinin
					 * backdrop'u, o da yoksa afişi kullanılır.
					 */
					const thumbUri =
						ep.still_url ||
						ep.poster ||
						ep.thumbnail ||
						ep.image ||
						content?.backdrop_url ||
						content?.poster_url ||
						posterUrl ||
						null;

					const progressPercent = Math.min(
						100,
						Math.max(
							8,
							Math.round(
								(epProgress?.progress ||
									(epProgress?.duration > 0
										? epProgress.currentTime /
											epProgress.duration
										: 0.18)) * 100,
							),
						),
					);

					// "N dk kaldı" — yalnızca gerçek süre bilgisi varsa.
					const kalanSn =
						isInProgress && epProgress?.duration > 0
							? Math.max(
									0,
									epProgress.duration -
										(epProgress.currentTime || 0),
								)
							: 0;
					const kalanDk =
						kalanSn > 0
							? `${Math.max(1, Math.round(kalanSn / 60))} dk kaldı`
							: "";

					/* Izgarada süre satırı: izlenen bölümde kalan süre yazar. */
					const epMetaText =
						tvEpisodes && isInProgress
							? kalanDk
							: epDurationFormatted;

					const statusLabel = isCompleted
						? "İzlendi"
						: isInProgress
							? "Kaldığın yer"
							: "Sırada";
					const statusColor = isCompleted
						? Palette.secondary
						: isInProgress
							? Palette.primary
							: Palette.outline;

					/* Sabit genişlik: odak değişince kart boyutu değişmez. */
					const isTvFocus = tvEpisodes && index === tvFocusIndex;

					return (
						<TVPressable
							key={
								ep.url ||
								`${selectedSeason}-${epNumber}-${index}`
							}
							style={({ focused }) => [
								styles.episodeCard,
								tvEpisodes
									? {
											width: slideW,
											height: focusCardH,
											borderRadius: sp(14),
											backgroundColor: Palette.surfaceLow,
											opacity: isTvFocus ? 1 : 0.6,
										}
									: {
											width: "100%",
											padding: sp(8),
											borderRadius: sp(16),
											gap: sp(10),
											backgroundColor: isInProgress
												? Palette.surfaceHigh
												: Palette.surfaceLow,
										},
								!tvEpisodes &&
									isInProgress &&
									styles.episodeCardActive,
								isSelected && styles.episodeCardSelected,
								(focused || isTvFocus) && styles.focusRing,
							]}
							onFocus={
								tvEpisodes
									? () => setTvFocusIndex(index)
									: undefined
							}
							ref={
								tvEpisodes
									? (node) => {
											cardRefs.current[index] = node;
										}
									: undefined
							}
							nextFocusUp={tvEpisodes ? headerTag : undefined}
							nextFocusLeft={
								tvEpisodes ? focusTags[index - 1] : undefined
							}
							nextFocusRight={
								tvEpisodes ? focusTags[index + 1] : undefined
							}
							onPress={() => {
								if (isSelectionMode) {
									toggleEpisodeSelection(selectionKey);
									return;
								}
								handleEpisodeClick(ep, index);
							}}
							onLongPress={() => {
								if (isSelectionMode) return;
								setMenuState({ type: "episode", ep, index });
							}}
							activeOpacity={0.75}>
							{/* Aktif bölüm hapı YALNIZCA telefonda: ızgarada aynı
							    bilgi kapak üstünde ve süre satırında durur. */}
							{isInProgress && !tvEpisodes ? (
								<View style={styles.episodeActiveRow}>
									<View
										style={[
											styles.episodeActivePill,
											{
												gap: sp(4),
												paddingHorizontal: sp(8),
												paddingVertical: sp(2),
											},
										]}>
										<Ionicons
											name="play-circle"
											size={sp(13)}
											color={Palette.onPrimary}
										/>
										<Text
											style={[
												styles.episodeActivePillText,
												{
													fontSize: sp(10),
													color: Palette.onPrimary,
												},
											]}>
											Kaldığın Yer
										</Text>
									</View>
									{kalanDk ? (
										<Text
											style={[
												styles.episodeStatus,
												{
													fontSize: sp(12),
													color: Palette.secondary,
												},
											]}
											numberOfLines={1}>
											{kalanDk}
										</Text>
									) : null}
								</View>
							) : null}

							<View
								style={[
									styles.episodeCardRow,
									{ gap: sp(12) },
									tvEpisodes && styles.episodeCardStack,
								]}>
								{/* Sol: seçim kutusu ya da 16:9 küçük görsel */}
								{isSelectionMode ? (
									<View
										style={[
											styles.selectionCheckbox,
											isSelected &&
												styles.selectionCheckboxChecked,
											{
												width: sp(28),
												height: sp(28),
												borderRadius: sp(14),
											},
										]}>
										{isSelected && (
											<Ionicons
												name="checkmark"
												size={sp(16)}
												color={Palette.background}
											/>
										)}
									</View>
								) : (
									<View
										style={[
											styles.thumbnail,
											tvEpisodes
												? {
														width: "100%",
														height: "100%",
														borderRadius: sp(14),
													}
												: {
														width: tileW,
														height: tileH,
														borderRadius: sp(8),
													},
										]}>
										{thumbUri ? (
											<Image
												source={{ uri: thumbUri }}
												style={[
													styles.thumbnailImage,
													tvEpisodes
														? {
																width: "100%",
																height: "100%",
															}
														: {
																width: tileW,
																height: tileH,
															},
													!tvEpisodes &&
														!isCompleted &&
														!isInProgress &&
														styles.thumbnailImageIdle,
												]}
												contentFit="cover"
												contentPosition="center"
												transition={150}
												cachePolicy="memory-disk"
											/>
										) : null}
										<View
											style={[
												styles.thumbnailOverlay,
												isCompleted &&
													styles.thumbnailOverlayDone,
												isInProgress &&
													styles.thumbnailOverlayActive,
											]}>
											{isCompleted ? (
												<Ionicons
													name="checkmark-circle"
													size={sp(24)}
													color={Palette.secondary}
												/>
											) : isInProgress ? (
												<View
													style={[
														styles.thumbnailPlay,
														{
															width: sp(32),
															height: sp(32),
															borderRadius:
																sp(16),
															backgroundColor:
																Palette.primary,
														},
													]}>
													<Ionicons
														name="play"
														size={sp(18)}
														color={
															Palette.onPrimary
														}
														style={
															styles.playIconOffset
														}
													/>
												</View>
											) : (
												<View
													style={[
														styles.thumbnailPlay,
														{
															width: sp(28),
															height: sp(28),
															borderRadius:
																sp(14),
														},
													]}>
													<Ionicons
														name="play"
														size={sp(16)}
														color={
															Palette.onSurface
														}
														style={
															styles.playIconOffset
														}
													/>
												</View>
											)}
										</View>
										{/* Kapak sol altı: bölüm etiketi. */}
										{tvEpisodes ? (
											<View
												style={{
													position: "absolute",
													bottom: sp(6),
													left: sp(6),
													backgroundColor:
														"rgba(0,0,0,0.72)",
													borderRadius: sp(6),
													paddingHorizontal: sp(6),
													paddingVertical: sp(2),
												}}>
												<Text
													style={{
														color: "#ffffff",
														fontFamily:
															FontFamily.semiBold,
														fontSize: sp(11),
													}}
													numberOfLines={1}>
													S{selectedSeason} B
													{epNumber}
												</Text>
											</View>
										) : null}
										{isInProgress && (
											<View
												style={
													styles.thumbnailProgressTrack
												}>
												<View
													style={[
														styles.thumbnailProgressFill,
														{
															width: `${progressPercent}%`,
														},
													]}
												/>
											</View>
										)}
									</View>
								)}
								{tvEpisodes ? null : (
									<View
										style={{
											flex: 1,
											flexDirection: "row",
											alignItems: "center",
											gap: sp(8),
										}}>
										<View
											style={
												styles.episodeTitleContainer
											}>
											{/* Durum satırı: TV'de "S1 B1 · Sırada", telefonda "N. BÖLÜM · Sırada". */}
											<View
												style={[
													styles.episodeTitleRow,
													{ gap: sp(8) },
												]}>
												<Text
													style={[
														styles.episodeLabel,
														{
															fontSize: sp(10),
															color: isInProgress
																? Palette.primary
																: Palette.onSurfaceVariant,
														},
													]}
													numberOfLines={1}>
													{tvEpisodes
														? `S${selectedSeason} B${epNumber}`
														: `${epNumber}. BÖLÜM`}
												</Text>
												{isInProgress ? null : (
													<Text
														style={[
															styles.episodeStatus,
															{
																fontSize:
																	sp(12),
																color: statusColor,
															},
														]}
														numberOfLines={1}>
														{statusLabel}
													</Text>
												)}
											</View>
											{/* Izgarada numara başlığın içinde durur
										    (referans: "4. Boya ve Kan"). */}
											<Text
												style={[
													styles.episodeTitleText,
													{
														fontSize: sp(16),
														color: Palette.onSurface,
													},
												]}
												numberOfLines={1}>
												{tvEpisodes
													? `${epNumber}. ${rawTitle || "Bölüm"}`
													: rawTitle}
											</Text>

											{epMetaText ? (
												<Text
													style={[
														styles.episodeDurationText,
														{
															fontSize: sp(12),
															color:
																tvEpisodes &&
																isInProgress
																	? Palette.secondary
																	: Palette.onSurfaceVariant,
															marginTop: sp(2),
														},
													]}
													numberOfLines={1}>
													{epMetaText}
												</Text>
											) : null}

											{/* Prime: bölüm özeti (backend `overview`) 2 satır. */}
											{ep.overview ? (
												<Text
													style={[
														styles.episodeSynopsis,
														{
															fontSize: sp(11.5),
															marginTop: sp(2),
														},
													]}
													numberOfLines={2}>
													{ep.overview}
												</Text>
											) : null}
										</View>

										{/* Telefon: sağda indirme dairesi. Izgarada bu
									    eylem kapağın sağ üstünde. */}
										{tvEpisodes ? null : (
											<TVPressable
												style={({ focused }) => [
													styles.downloadButton,
													{
														width: sp(36),
														height: sp(36),
														borderRadius: sp(18),
														backgroundColor:
															isInProgress
																? Palette.secondary
																: Palette.surfaceHigh,
													},
													focused && styles.focusRing,
												]}
												onPress={() =>
													handleDownloadEpisode(
														ep,
														epNumber,
														epDisplayTitle,
													)
												}
												activeOpacity={0.65}
												hitSlop={{
													top: 8,
													bottom: 8,
													left: 8,
													right: 8,
												}}>
												<Ionicons
													name={
														epIndirildi
															? "checkmark-done-outline"
															: "download-outline"
													}
													size={sp(18)}
													color={
														isInProgress
															? Palette.background
															: epIndirildi
																? Palette.secondary
																: Palette.onSurfaceVariant
													}
												/>
											</TVPressable>
										)}
									</View>
								)}
							</View>
						</TVPressable>
					);
				})}
			</ScrollView>

			{/* Sezon Seçici Modal (Açılır Menü / Bottom Sheet) */}
			<Modal
				visible={isSeasonModalOpen}
				transparent
				animationType="fade"
				onRequestClose={() => setIsSeasonModalOpen(false)}>
				<Pressable
					style={styles.modalOverlay}
					onPress={() => setIsSeasonModalOpen(false)}>
					<Pressable
						style={[
							styles.modalContent,
							{
								backgroundColor: Palette.surface,
								borderColor: Palette.outlineVariant,
								borderRadius: sp(20),
								padding: sp(16),
							},
						]}>
						{/* Modal Başlık */}
						<View
							style={[
								styles.modalHeader,
								{
									paddingBottom: sp(12),
									marginBottom: sp(8),
								},
							]}>
							<Text
								style={[
									styles.modalTitle,
									{
										color: Palette.onSurface,
										fontSize: sp(16),
									},
								]}>
								Sezon Seçin
							</Text>
							<TVPressable
								style={({ focused }) => [
									styles.iconButton,
									{
										width: sp(32),
										height: sp(32),
										borderRadius: sp(16),
									},
									focused && styles.focusRing,
								]}
								onPress={() => setIsSeasonModalOpen(false)}
								hitSlop={{
									top: 8,
									bottom: 8,
									left: 8,
									right: 8,
								}}>
								<Ionicons
									name="close"
									size={sp(20)}
									color={Palette.onSurfaceVariant}
								/>
							</TVPressable>
						</View>

						{/* Sezonlar Listesi */}
						<ScrollView
							style={styles.modalList}
							showsVerticalScrollIndicator={false}>
							{seasonKeys.map((sKey) => {
								const isSelected = selectedSeason === sKey;
								const count =
									normalizedSeasons[sKey]?.length || 0;

								return (
									<TVPressable
										key={sKey}
										autoFocus={isSelected}
										style={({ focused }) => [
											styles.modalSeasonItem,
											{
												paddingVertical: sp(11),
												paddingHorizontal: sp(12),
												borderRadius: sp(12),
											},
											isSelected && {
												backgroundColor:
													"rgba(192,193,255,0.14)",
											},
											focused && styles.focusRing,
										]}
										onPress={() => {
											handleSeasonSelect(sKey);
											setIsSeasonModalOpen(false);
										}}
										activeOpacity={0.7}>
										<View
											style={[
												styles.modalSeasonLeft,
												{ gap: sp(10) },
											]}>
											<Ionicons
												name="albums-outline"
												size={sp(18)}
												color={
													isSelected
														? Palette.primary
														: Palette.onSurfaceVariant
												}
											/>
											<Text
												style={[
													styles.modalSeasonName,
													{
														color: isSelected
															? Palette.primary
															: Palette.onSurface,
														fontFamily: isSelected
															? FontFamily.semiBold
															: FontFamily.medium,
														fontSize: sp(15),
													},
												]}>
												Sezon {sKey}
											</Text>
											<Text
												style={[
													styles.modalSeasonCount,
													{
														color: Palette.onSurfaceVariant,
														fontSize: sp(12.5),
													},
												]}>
												({count} Bölüm)
											</Text>
										</View>

										{isSelected && (
											<Ionicons
												name="checkmark"
												size={sp(20)}
												color={Palette.primary}
											/>
										)}
									</TVPressable>
								);
							})}
						</ScrollView>
					</Pressable>
				</Pressable>
			</Modal>

			{/* Bölüm/Sezon işlem menüsü (TV + dokunmatik ortak) */}
			<ActionMenuModal
				visible={Boolean(menuState)}
				onClose={() => setMenuState(null)}
				title={menuTitle}
				subtitle={menuSubtitle}
				actions={menuActions}
			/>

			{/* Geçici geri bildirim balonu ("3 bölüm işaretlendi") */}
			{Boolean(feedbackMessage) && (
				<View
					style={[
						styles.feedbackToast,
						{
							backgroundColor: Palette.surfaceHighest,
							borderColor: "rgba(76,215,246,0.5)",
							paddingVertical: sp(8),
							paddingHorizontal: sp(14),
						},
					]}
					pointerEvents="none">
					<Ionicons
						name="checkmark-circle"
						size={sp(15)}
						color={Palette.secondary}
					/>
					<Text
						style={[
							styles.feedbackToastText,
							{ color: Palette.onSurface, fontSize: sp(12) },
						]}>
						{feedbackMessage}
					</Text>
				</View>
			)}
		</View>
	);
});

// Geri tuşu işbirliği için referans (bkz. MovieDetails `seasonsRef`).
export default SeasonsSection;
const styles = StyleSheet.create({
	container: {},
	/* TV slider başlığı: odaklanan bölümün adı (tasarım: büyük, kalın). */
	tvEpisodeTitle: {
		color: Palette.onSurface,
		fontFamily: FontFamily.bold,
		letterSpacing: 0.4,
	},
	headerRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "flex-start",
		flexWrap: "wrap",
	},
	headerControls: {
		flexDirection: "row",
		alignItems: "center",
	},
	seasonPill: {
		flexDirection: "row",
		alignItems: "center",
		alignSelf: "flex-start",
		borderRadius: 999,
		backgroundColor: Palette.surfaceHigh,
	},
	seasonPillText: {
		fontFamily: FontFamily.semiBold,
	},
	iconButton: {
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: Palette.surface,
	},
	/* Bölüm listesi (telefon/tablet dikey): alt alta, tam genişlik. */
	episodesList: {
		flexDirection: "column",
	},
	/* Bölüm slider'ı (TV + yatay tablet): yan yana kartlar. */
	episodesSlider: {
		flexDirection: "row",
		alignItems: "center",
	},
	/* Slider kartı: kapak üstte, metin altta. */
	episodeCardStack: {
		flexDirection: "column",
		alignItems: "stretch",
	},
	episodeCard: {
		flexDirection: "column",
	},
	episodeCardRow: {
		flexDirection: "row",
		alignItems: "center",
	},
	episodeCardActive: {
		elevation: 6,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.35,
		shadowRadius: 10,
	},
	episodeCardSelected: {
		borderWidth: 1.5,
		borderColor: Palette.secondary,
	},
	thumbnail: {
		overflow: "hidden",
		backgroundColor: Palette.surfaceHighest,
		flexShrink: 0,
	},
	thumbnailImage: {
		position: "absolute",
		top: 0,
		left: 0,
	},
	thumbnailImageIdle: {
		opacity: 0.8,
	},
	/* Kapağı kaplayan durum katmanı; akışta `flex: 1` ile doluyor. */
	thumbnailOverlay: {
		flex: 1,
		width: "100%",
		alignItems: "center",
		justifyContent: "center",
	},
	thumbnailOverlayDone: {
		backgroundColor: "rgba(14,14,16,0.5)",
	},
	thumbnailOverlayActive: {
		backgroundColor: "rgba(14,14,16,0.3)",
	},
	thumbnailPlay: {
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "rgba(42,42,44,0.85)",
	},
	/* Yuvarlatılmış köşeler çubuğun uçlarını kırpmasın diye içeriden. */
	thumbnailProgressTrack: {
		position: "absolute",
		left: 5,
		right: 5,
		bottom: 5,
		height: 3,
		borderRadius: 2,
		overflow: "hidden",
		backgroundColor: "rgba(14,14,16,0.75)",
	},
	thumbnailProgressFill: {
		height: "100%",
		borderRadius: 2,
		backgroundColor: Palette.secondary,
	},
	playIconOffset: {
		marginLeft: 2,
	},
	episodeTitleContainer: {
		flex: 1,
		minWidth: 0,
		justifyContent: "center",
	},
	episodeActiveRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
	episodeActivePill: {
		flexDirection: "row",
		alignItems: "center",
		alignSelf: "flex-start",
		borderRadius: 999,
		backgroundColor: Palette.primaryContainer,
	},
	episodeActivePillText: {
		fontFamily: FontFamily.bold,
	},
	episodeTitleRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
	episodeLabel: {
		fontFamily: FontFamily.bold,
		letterSpacing: 0.4,
		flexShrink: 1,
	},
	episodeStatus: {
		fontFamily: FontFamily.medium,
	},
	episodeTitleText: {
		fontFamily: FontFamily.semiBold,
		letterSpacing: -0.2,
		marginTop: 2,
	},
	episodeDurationText: {
		fontFamily: FontFamily.regular,
	},
	episodeSynopsis: {
		color: Palette.onSurfaceVariant,
		fontFamily: FontFamily.regular,
	},
	downloadButton: {
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: Palette.surfaceHigh,
		flexShrink: 0,
	},
	/* Sezon seçici modal */
	modalOverlay: {
		flex: 1,
		backgroundColor: "rgba(0,0,0,0.65)",
		justifyContent: "center",
		alignItems: "center",
		padding: 24,
	},
	modalContent: {
		width: "100%",
		maxHeight: 380,
		borderWidth: 1,
	},
	modalHeader: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		borderBottomWidth: StyleSheet.hairlineWidth,
		borderBottomColor: Palette.outlineVariant,
	},
	modalTitle: {
		fontFamily: FontFamily.semiBold,
	},
	modalList: {
		maxHeight: 280,
	},
	modalSeasonItem: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginVertical: 2,
	},
	modalSeasonLeft: {
		flexDirection: "row",
		alignItems: "center",
	},
	modalSeasonName: {},
	modalSeasonCount: {},
	loadingBox: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		borderRadius: 12,
	},
	loadingText: {
		fontFamily: FontFamily.medium,
	},
	/* ── İzlendi işaretleme: seçim modu, ⋮ menüsü, geri bildirim ── */
	selectionBar: {
		flexDirection: "row",
		alignItems: "center",
		flexWrap: "wrap",
	},
	selectionChip: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		paddingVertical: 8,
		paddingHorizontal: 12,
		borderRadius: 999,
		borderWidth: 1,
		borderColor: "transparent",
	},
	selectionChipText: {
		fontFamily: FontFamily.semiBold,
	},
	selectionChipPrimary: {
		backgroundColor: Palette.secondary,
		borderColor: Palette.secondary,
	},
	selectionChipPrimaryText: {
		fontFamily: FontFamily.bold,
		color: Palette.background,
	},
	selectionChipDanger: {
		backgroundColor: "rgba(255,180,171,0.12)",
		borderColor: Palette.error,
	},
	selectionCountText: {
		fontFamily: FontFamily.medium,
		paddingHorizontal: 2,
	},
	selectionCheckbox: {
		borderWidth: 1.5,
		borderColor: Palette.outline,
		alignItems: "center",
		justifyContent: "center",
		flexShrink: 0,
	},
	selectionCheckboxChecked: {
		backgroundColor: Palette.secondary,
		borderColor: Palette.secondary,
	},
	feedbackToast: {
		position: "absolute",
		bottom: 8,
		alignSelf: "center",
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		borderWidth: 1,
		borderRadius: 999,
	},
	feedbackToastText: {
		fontFamily: FontFamily.semiBold,
	},
	focusRing: {
		borderWidth: 2,
		borderColor: Palette.primary,
	},
});
