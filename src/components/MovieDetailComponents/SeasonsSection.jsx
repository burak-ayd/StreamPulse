import TVPressable from "@components/common/TVPressable";
import { useThemeContext } from "@/context/ThemeContext";
import { useDownload } from "@/context/DownloadContext";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useRouter } from "expo-router";
import React, {
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
	Alert,
	BackHandler,
	Modal,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { formatTime } from "@/utils/formatters";
import ActionMenuModal from "@/components/modal/ActionMenuModal";

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
				const hours = parts[0];
				const mins = parts[1];
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
	const { colors, theme } = useThemeContext();
	const { requestDownload, isDownloaded } = useDownload();
	const router = useRouter();

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
		if (seasonKeys.includes(internalSelectedSeason)) return internalSelectedSeason;
		if (initialSeason && seasonKeys.includes(String(initialSeason))) return String(initialSeason);
		return seasonKeys[0] || "1";
	}, [isControlled, controlledSelectedSeason, seasonKeys, internalSelectedSeason, initialSeason]);

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
			Alert.alert("İndirme", `"${epTitle}" zaten indirildi.`);
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
		Alert.alert(
			"Sezonu İndir",
			`${selectedSeason}. Sezondaki ${sortedEpisodes.length} bölüm indirme kuyruğuna eklensin mi?`,
			[
				{ text: "Vazgeç", style: "cancel" },
				{
					text: "Tümünü Ekle",
					onPress: () => {
						sortedEpisodes.forEach((ep, i) => {
							const epNumber = ep.episode || ep.episode_number || i + 1;
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
				},
			],
		);
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
					subtitle: `${selectedSeason}. Sezon ${epNumber}. Bölüm${ep.title ? ` - ${ep.title}` : ""}`,
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
	useImperativeHandle(ref, () => ({ cancelSelection }), [cancelSelection]);

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
					description: "Seçili sezonun bölümlerini indirme kuyruğuna ekle",
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
							`${selectedSeason}. Sezon ${ep.episode || ep.episode_number || index + 1}. Bölüm`,
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
				onPress: () => enterSelectionMode(episodeSelectionKey(ep, index)),
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
			<View style={styles.container}>
				<View
					style={[
						styles.loadingBox,
						{
							backgroundColor: colors.cardBg,
							borderColor: colors.border,
						},
					]}>
					<ActivityIndicator size="small" color={colors.primary} />
					<Text
						style={[
							styles.loadingText,
							{ color: colors.textSecondary },
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
		<View style={styles.container}>
			{isSelectionMode ? (
				/* Seçim Modu Çubuğu — bölümleri elle seçip toplu işaretleme */
				<View style={styles.selectionBar}>
					<TVPressable
						style={({ focused }) => [
							styles.selectionChip,
							{
								backgroundColor:
									theme === "dark" ? "#161B24" : "#ffffff",
								borderColor:
									theme === "dark" ? "#232A36" : "#E2E8F0",
							},
							focused && styles.controlsButtonFocused,
						]}
						onPress={toggleSelectAll}
						activeOpacity={0.75}>
						<Ionicons
							name={allSelected ? "checkbox" : "square-outline"}
							size={15}
							color={colors.text}
						/>
						<Text
							style={[
								styles.selectionChipText,
								{ color: colors.text },
							]}>
							{allSelected ? "Seçimi Kaldır" : "Tümünü Seç"}
						</Text>
					</TVPressable>

					<Text
						style={[
							styles.selectionCountText,
							{ color: colors.textSecondary },
						]}>
						{selectedCount} bölüm
					</Text>

					<TVPressable
						style={({ focused }) => [
							styles.selectionChip,
							styles.selectionChipPrimary,
							selectedCount === 0 && { opacity: 0.5 },
							focused && styles.controlsButtonFocused,
						]}
						onPress={() => {
							if (selectedCount === 0 || isApplyingMarks)
								return;
							applyMarks(
								buildMarksForKeyList(selectedKeys),
								true,
							);
						}}
						activeOpacity={0.75}>
						{isApplyingMarks ? (
							<ActivityIndicator size="small" color="#ffffff" />
						) : (
							<Ionicons
								name="checkmark-done"
								size={15}
								color="#ffffff"
							/>
						)}
						<Text style={styles.selectionChipPrimaryText}>
							İzlendi İşaretle
						</Text>
					</TVPressable>

					<TVPressable
						style={({ focused }) => [
							styles.selectionChip,
							styles.selectionChipDanger,
							selectedCount === 0 && { opacity: 0.5 },
							focused && styles.controlsButtonFocused,
						]}
						onPress={() => {
							if (selectedCount === 0 || isApplyingMarks)
								return;
							applyMarks(
								buildMarksForKeyList(selectedKeys),
								false,
							);
						}}
						activeOpacity={0.75}>
						<Ionicons
							name="close-circle-outline"
							size={15}
							color="#f43f5e"
						/>
						<Text
							style={[
								styles.selectionChipText,
								{ color: "#f43f5e" },
							]}>
							İzlenmedi Yap
						</Text>
					</TVPressable>

					<TVPressable
						style={({ focused }) => [
							styles.selectionChip,
							{
								borderColor:
									theme === "dark" ? "#232A36" : "#E2E8F0",
							},
							focused && styles.controlsButtonFocused,
						]}
						onPress={() => {
							setIsSelectionMode(false);
							setSelectedEpisodes({});
						}}
						activeOpacity={0.75}>
						<Text
							style={[
								styles.selectionChipText,
								{ color: colors.text },
							]}>
							Vazgeç
						</Text>
					</TVPressable>
				</View>
			) : (
			/* Kontrol Çubuğu (Sezon Dropdown, Bölüm Sıralama, Sezon İndir) */
			<View style={styles.controlsBar}>
				{/* 1. Sezon Seçim Dropdown Butonu */}
				<TVPressable
					style={({ focused }) => [
						styles.seasonDropdownButton,
						{
							backgroundColor:
								theme === "dark" ? "#161B24" : "#ffffff",
							borderColor:
								theme === "dark" ? "#232A36" : "#E2E8F0",
						},
						focused && styles.controlsButtonFocused,
					]}
					onPress={() => setIsSeasonModalOpen(true)}
					activeOpacity={0.75}>
					<Text
						style={[
							styles.seasonDropdownText,
							{ color: colors.text },
						]}>
						Sezon {selectedSeason}
					</Text>
					<Ionicons
						name="chevron-down"
						size={15}
						color={colors.text}
						style={styles.dropdownChevron}
					/>
				</TVPressable>

				{/* 2. Bölüm Sıralama Butonu (Bölüm ↑ / Bölüm ↓) */}
				<TVPressable
					style={({ focused }) => [
						styles.sortButton,
						{
							backgroundColor:
								theme === "dark" ? "#161B24" : "#ffffff",
							borderColor:
								theme === "dark" ? "#232A36" : "#E2E8F0",
						},
						focused && styles.controlsButtonFocused,
					]}
					onPress={() =>
						setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"))
					}
					activeOpacity={0.75}>
					<Text style={[styles.sortButtonText, { color: colors.text }]}>
						Bölüm {sortOrder === "asc" ? "↑" : "↓"}
					</Text>
				</TVPressable>

				{/* 3. Sezon Bölüm Sayısı & Toplu İndir Butonu */}
				<TVPressable
					style={({ focused }) => [
						styles.seasonDownloadButton,
						focused && styles.controlsButtonFocused,
					]}
					onPress={handleDownloadSeason}
					activeOpacity={0.7}
					hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
					<Ionicons
						name="download-outline"
						size={19}
						color={colors.primary}
					/>
					<Text
						style={[
							styles.seasonDownloadText,
							{ color: colors.text },
						]}>
						{sortedEpisodes.length} Bölüm
					</Text>
				</TVPressable>

				{/* 4. Daha Fazla (⋮) — sezon menüsü: izlendi işaretle / bölüm seç */}
				<TVPressable
					style={({ focused }) => [
						styles.moreButton,
						{
							backgroundColor:
								theme === "dark" ? "#161B24" : "#ffffff",
							borderColor:
								theme === "dark" ? "#232A36" : "#E2E8F0",
						},
						focused && styles.controlsButtonFocused,
					]}
					onPress={() => setMenuState({ type: "season" })}
					activeOpacity={0.75}
					hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
					<Ionicons
						name="ellipsis-vertical"
						size={16}
						color={colors.text}
					/>
				</TVPressable>
			</View>
			)}

			{/* Bölüm Listesi */}
			<View style={styles.episodesList}>
{sortedEpisodes.map((ep, index) => {
					const epNumber = ep.episode || ep.episode_number || index + 1;
					const rawTitle = ep.title ? ep.title.trim() : "";
				/*
				 * Başlık biçimi: '<sezon>. <bölüm>. Bölüm' veya
				 * '<bölüm>. <bölüm adı>'.
				 *
				 * ⚠️ İlk sayı SEZON numarasıdır, bölüm numarası DEĞİL.
				 * Eskiden `${epNumber}. ${epNumber}. Bölüm` yazıyordu ve
				 * sezon 1'de iki sayı aynı olduğu için ("1. 1. Bölüm")
				 * hata fark edilmiyordu; sezon 1 bölüm 2 ekranda
				 * "2. 2. Bölüm" olarak görünüyordu — yani "2. sezon,
				 * 2. bölüm" yanlış izlenimi veriyordu. `selectedSeason`
				 * zaten bu satırda indirme kimliği için kullanılıyordu.
				 */
				const epDisplayTitle = rawTitle
					? `${epNumber}. ${rawTitle}`
					: `${selectedSeason}. ${epNumber}. Bölüm`;


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

					const isDark = theme === "dark";
					const epDurationFormatted = getEpisodeDurationTurkish(
						ep,
						epProgress,
						content?.runtime_minutes,
					);

					return (
						<TVPressable
							key={ep.url || `${selectedSeason}-${epNumber}-${index}`}
							style={({ focused }) => [
								styles.episodeCard,
								{
									backgroundColor: isDark
										? isInProgress
											? "#131823"
											: "#10141D"
										: isInProgress
											? "#fff5f5"
											: "#ffffff",
									borderColor: isInProgress
										? "rgba(229, 9, 20, 0.55)"
										: isDark
											? "rgba(255, 255, 255, 0.08)"
											: "rgba(0, 0, 0, 0.08)",
									borderWidth: isInProgress ? 1.5 : 1,
								},
								isInProgress && styles.episodeCardActive,
								isSelected && styles.episodeCardSelected,
								focused && styles.episodeCardFocused,
							]}
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
							{/* Sol: Seçim kutusu ya da Play / Tik İkonu */}
							{isSelectionMode ? (
								<View
									style={[
										styles.selectionCheckbox,
										isSelected &&
											styles.selectionCheckboxChecked,
									]}>
									{isSelected && (
										<Ionicons
											name="checkmark"
											size={15}
											color="#ffffff"
										/>
									)}
								</View>
							) : (
								<View
									style={[
										styles.playIconContainer,
										{
											backgroundColor: isInProgress
												? "#E50914"
												: isDark
													? "#1e293b"
													: "#f1f5f9",
										},
										isInProgress &&
											styles.playIconActiveGlow,
									]}>
									<Ionicons
										name={
											isCompleted
												? "checkmark-circle"
												: "play"
										}
										size={isCompleted ? 17 : 13}
										color={
											isInProgress
												? "#ffffff"
												: "#E50914"
										}
										style={
											!isCompleted
												? styles.playIconOffset
												: null
										}
									/>
								</View>
							)}

							{/* Orta: Bölüm Başlığı & Devam Durumu */}
							<View style={styles.episodeTitleContainer}>
								<View style={styles.episodeTitleRow}>
									<Text
										style={[
											styles.episodeTitleText,
											{
												color: isDark ? "#ffffff" : "#0f172a",
												fontWeight: isInProgress ? "700" : "600",
											},
										]}
										numberOfLines={1}>
										{epDisplayTitle}
									</Text>
									{isCompleted && (
										<View
											style={[
												styles.completedBadge,
												{
													backgroundColor: isDark
														? "rgba(56, 189, 248, 0.16)"
														: "rgba(56, 189, 248, 0.12)",
													borderColor: isDark
														? "rgba(56, 189, 248, 0.3)"
														: "rgba(56, 189, 248, 0.25)",
													borderWidth: 0.5,
												},
											]}>
											<Text
												style={[
													styles.completedBadgeText,
													{
														color: isDark
															? "#38bdf8"
															: "#0284c7",
													},
												]}>
												TAMAMLANDI
											</Text>
										</View>
									)}
									{isInProgress && (
										<View style={styles.inProgressBadge}>
											<Text style={styles.inProgressBadgeText}>
												İZLENİYOR
											</Text>
										</View>
									)}
								</View>

								{/* Süre / İlerleme Satırı */}
								{isInProgress ? (
									<View style={styles.episodeProgressRow}>
										<View
											style={[
												styles.miniProgressBarTrack,
												{
													backgroundColor: isDark
														? "#334155"
														: "#e2e8f0",
												},
											]}>
											<View
												style={[
													styles.miniProgressBarFill,
													{
														width: `${Math.min(100, Math.max(8, Math.round((epProgress.progress || (epProgress.duration > 0 ? epProgress.currentTime / epProgress.duration : 0.18)) * 100)))}%`,
													},
												]}
											/>
										</View>
										<Text style={styles.episodeProgressText}>
											{formatTime(epProgress.currentTime)}
											{epProgress.duration > 0
												? ` / ${formatTime(epProgress.duration)}`
												: ""}
										</Text>
									</View>
								) : (
									<Text
										style={[
											styles.episodeDurationText,
											{ color: isDark ? "#94a3b8" : "#64748b" },
										]}
										numberOfLines={1}>
										{epDurationFormatted || `${selectedSeason}. Sezon ${epNumber}. Bölüm`}
									</Text>
								)}
							</View>

							{/* Sağ: İndir Butonu (w-8 h-8 rounded-full) */}
							<TVPressable
								style={({ focused }) => [
									styles.downloadButton,
									{
										backgroundColor: isDark
											? "#1e293b"
											: "#f1f5f9",
									},
									focused && styles.controlsButtonFocused,
								]}
								onPress={() =>
									handleDownloadEpisode(ep, epNumber, epDisplayTitle)
								}
								activeOpacity={0.65}
								hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
								<Ionicons
									name={
										epIndirildi
											? "checkmark-done-outline"
											: "download-outline"
									}
									size={15}
									color={
										epIndirildi
											? "#10b981"
											: isInProgress
												? colors.text
												: isDark
													? "#94a3b8"
													: "#64748b"
									}
								/>
							</TVPressable>
						</TVPressable>
					);
				})}
			</View>

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
								backgroundColor:
									theme === "dark" ? "#141414" : "#ffffff",
								borderColor: colors.border,
							},
						]}>
						{/* Modal Başlık */}
						<View style={styles.modalHeader}>
							<Text
								style={[
									styles.modalTitle,
									{ color: colors.text },
								]}>
								Sezon Seçin
							</Text>
							<TVPressable
								onPress={() => setIsSeasonModalOpen(false)}
								style={({ focused }) => [
									focused && styles.controlsButtonFocused,
								]}
								hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
								<Ionicons
									name="close"
									size={22}
									color={colors.textSecondary}
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
											isSelected && {
												backgroundColor: `${colors.primary}22`,
											},
											focused && styles.modalSeasonItemFocused,
										]}
										onPress={() => {
											handleSeasonSelect(sKey);
											setIsSeasonModalOpen(false);
										}}
										activeOpacity={0.7}>
										<View style={styles.modalSeasonLeft}>
											<Ionicons
												name="albums-outline"
												size={18}
												color={
													isSelected
														? colors.primary
														: colors.textSecondary
												}
											/>
											<Text
												style={[
													styles.modalSeasonName,
													{
														color: isSelected
															? colors.primary
															: colors.text,
														fontWeight: isSelected
															? "700"
															: "500",
													},
												]}>
												Sezon {sKey}
											</Text>
											<Text
												style={[
													styles.modalSeasonCount,
													{
														color: colors.textSecondary,
													},
												]}>
												({count} Bölüm)
											</Text>
										</View>

										{isSelected && (
											<Ionicons
												name="checkmark"
												size={20}
												color={colors.primary}
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
				<View style={styles.feedbackToast} pointerEvents="none">
					<Ionicons
						name="checkmark-circle"
						size={15}
						color="#10b981"
					/>
					<Text style={styles.feedbackToastText}>
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
	container: {
		marginBottom: 24,
	},
	/* Kontrol Çubuğu (Ekran görüntüsündeki gibi: Sezon 1 v | Bölüm ^ | 10 Bölüm) */
	controlsBar: {
		flexDirection: "row",
		alignItems: "center",
		marginBottom: 16,
		gap: 10,
	},
	seasonDropdownButton: {
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: 14,
		paddingVertical: 9,
		borderRadius: 10,
		borderWidth: 1,
		gap: 6,
	},
	seasonDropdownText: {
		fontSize: 13,
		fontWeight: "700",
		letterSpacing: -0.2,
	},
	dropdownChevron: {
		marginTop: 1,
	},
	sortButton: {
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: 12,
		paddingVertical: 9,
		borderRadius: 10,
		borderWidth: 1,
	},
	sortButtonText: {
		fontSize: 13,
		fontWeight: "700",
		letterSpacing: -0.2,
	},
	seasonDownloadButton: {
		flexDirection: "row",
		alignItems: "center",
		marginLeft: "auto",
		gap: 6,
		paddingVertical: 6,
		paddingHorizontal: 6,
	},
	seasonDownloadText: {
		fontSize: 13,
		fontWeight: "600",
	},
	/* Bölüm Listesi (Card tabanlı, stitch_unified_cinema_ui_redesigna stili) */
	episodesList: {
		gap: 8,
	},
	episodeCard: {
		flexDirection: "row",
		alignItems: "center",
		paddingVertical: 12,
		paddingHorizontal: 12,
		borderRadius: 14,
		justifyContent: "space-between",
		gap: 12,
	},
	episodeCardActive: {
borderWidth: 1.5,
borderColor: "rgba(229, 9, 20, 0.55)",
	},
	playIconContainer: {
		width: 28,
		height: 28,
		borderRadius: 14,
		alignItems: "center",
		justifyContent: "center",
		flexShrink: 0,
	},
	playIconActiveGlow: {
borderWidth: 1.5,
borderColor: "rgba(229, 9, 20, 0.65)",
backgroundColor: "rgba(229, 9, 20, 0.18)",
	},
	playIconOffset: {
		marginLeft: 1.5,
	},
	episodeTitleContainer: {
		flex: 1,
		minWidth: 0,
		justifyContent: "center",
	},
	episodeTitleRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
	},
	episodeTitleText: {
		fontSize: 12.5,
		letterSpacing: -0.2,
		flexShrink: 1,
	},
	completedBadge: {
		paddingHorizontal: 6,
		paddingVertical: 1.5,
		borderRadius: 4,
	},
	completedBadgeText: {
		fontSize: 9,
		fontWeight: "800",
		letterSpacing: 0.4,
		textTransform: "uppercase",
	},
	inProgressBadge: {
		backgroundColor: "#E50914",
		paddingHorizontal: 6,
		paddingVertical: 1.5,
		borderRadius: 4,
	},
	inProgressBadgeText: {
		color: "#ffffff",
		fontSize: 9,
		fontWeight: "800",
		letterSpacing: 0.4,
		textTransform: "uppercase",
	},
	episodeProgressRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		marginTop: 4,
	},
	miniProgressBarTrack: {
		width: 75,
		height: 4,
		borderRadius: 2,
		overflow: "hidden",
	},
	miniProgressBarFill: {
		height: "100%",
		borderRadius: 2,
		backgroundColor: "#E50914",
	},
	episodeProgressText: {
		fontSize: 10,
		fontWeight: "700",
		color: "#E50914",
	},
	episodeDurationText: {
		fontSize: 10.5,
		fontWeight: "500",
		marginTop: 2,
	},
	downloadButton: {
		width: 32,
		height: 32,
		borderRadius: 16,
		justifyContent: "center",
		alignItems: "center",
		flexShrink: 0,
	},
	/* Modal (Dropdown Açılır Menü) */
	modalOverlay: {
		flex: 1,
		backgroundColor: "rgba(0, 0, 0, 0.65)",
		justifyContent: "center",
		alignItems: "center",
		padding: 24,
	},
	modalContent: {
		width: "100%",
		maxHeight: 380,
		borderRadius: 16,
		borderWidth: 1,
		padding: 16,
	},
	modalHeader: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingBottom: 12,
		borderBottomWidth: StyleSheet.hairlineWidth,
		borderBottomColor: "rgba(100, 116, 139, 0.2)",
		marginBottom: 8,
	},
	modalTitle: {
		fontSize: 16,
		fontWeight: "700",
	},
	modalList: {
		maxHeight: 280,
	},
	modalSeasonItem: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingVertical: 12,
		paddingHorizontal: 12,
		borderRadius: 10,
		marginVertical: 2,
	},
	modalSeasonLeft: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
	},
	modalSeasonName: {
		fontSize: 15,
	},
	modalSeasonCount: {
		fontSize: 13,
	},
	loadingBox: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		paddingVertical: 18,
		borderRadius: 12,
		borderWidth: 1,
		gap: 10,
	},
	loadingText: {
		fontSize: 14,
		fontWeight: "500",
	},
	/* ── İzlendi işaretleme: seçim modu, ⋮ menüsü, geri bildirim ── */
	selectionBar: {
		flexDirection: "row",
		alignItems: "center",
		flexWrap: "wrap",
		gap: 8,
		marginBottom: 12,
	},
	selectionChip: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		paddingVertical: 8,
		paddingHorizontal: 12,
		borderRadius: 10,
		borderWidth: 1,
	},
	selectionChipText: {
		fontSize: 12,
		fontWeight: "700",
	},
	selectionChipPrimary: {
		backgroundColor: "#10b981",
		borderColor: "#10b981",
	},
	selectionChipPrimaryText: {
		fontSize: 12,
		fontWeight: "800",
		color: "#ffffff",
	},
	selectionChipDanger: {
		backgroundColor: "rgba(244, 63, 94, 0.1)",
		borderColor: "rgba(244, 63, 94, 0.4)",
	},
	selectionCountText: {
		fontSize: 12,
		fontWeight: "600",
		paddingHorizontal: 2,
	},
	selectionCheckbox: {
		width: 28,
		height: 28,
		borderRadius: 14,
		borderWidth: 1.5,
		borderColor: "rgba(148, 163, 184, 0.6)",
		alignItems: "center",
		justifyContent: "center",
		flexShrink: 0,
	},
	selectionCheckboxChecked: {
		backgroundColor: "#10b981",
		borderColor: "#10b981",
	},
	episodeCardSelected: {
		borderWidth: 1.5,
		borderColor: "rgba(16, 185, 129, 0.8)",
	},
	moreButton: {
		width: 36,
		height: 36,
		borderRadius: 10,
		borderWidth: 1,
		alignItems: "center",
		justifyContent: "center",
		marginLeft: 8,
	},
	feedbackToast: {
		position: "absolute",
		bottom: 8,
		alignSelf: "center",
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		backgroundColor: "rgba(15, 23, 42, 0.95)",
		borderWidth: 1,
		borderColor: "rgba(16, 185, 129, 0.4)",
		paddingVertical: 8,
		paddingHorizontal: 14,
		borderRadius: 999,
	},
	feedbackToastText: {
		color: "#f1f5f9",
		fontSize: 12,
		fontWeight: "600",
	},
	controlsButtonFocused: {
		borderWidth: 2,
		borderColor: "#E50914",
		transform: [{ scale: 1.05 }],
	},
	episodeCardFocused: {
		borderWidth: 2,
		borderColor: "#E50914",
		transform: [{ scale: 1.02 }],
	},
	modalSeasonItemFocused: {
		borderWidth: 2,
		borderColor: "#E50914",
		transform: [{ scale: 1.02 }],
	},
});
