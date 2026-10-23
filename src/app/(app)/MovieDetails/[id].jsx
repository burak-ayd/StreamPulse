import { useThemeContext } from "@/context/ThemeContext";
import { fetchPluginDetail } from "@/services/api";
import { canonicalType, isSeriesContent } from "@/utils/mediaType";
import {
	getContentLibraryStatus,
	getContentWatchProgress,
	getSelectedPlatform,
	getSeriesEpisodesProgress,
	markEpisodesWatched,
	saveSeriesTotalEpisodes,
	toggleFavorite,
	unmarkEpisodesWatched,
} from "@/utils/storage";
import { useReactiveData } from "@/utils/storageListener";
import { useTvMetrics } from "@/utils/tvMetrics";
import TVPressable from "@components/common/TVPressable";
import ListSelectModal from "@components/modal/ListSelectModal";
import { useContentDetails } from "@hooks/useContentDetails";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import {
	Stack,
	useFocusEffect,
	useLocalSearchParams,
	useRouter,
} from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	Alert,
	BackHandler,
	Linking,
	ScrollView,
	Share,
	StyleSheet,
	Text,
	View,
} from "react-native";

// Components
import ActionButtons from "@components/MovieDetailComponents/ActionButtons";
import NotificationPreferenceCard from "@components/MovieDetailComponents/NotificationPreferenceCard";
import CastSection from "@components/MovieDetailComponents/CastSection";
import CrewSection from "@components/MovieDetailComponents/CrewSection";
import ErrorState from "@components/MovieDetailComponents/ErrorState";
import HeroSection from "@components/MovieDetailComponents/HeroSection";
import LoadingState from "@components/MovieDetailComponents/LoadingState";
import MetadataSection from "@components/MovieDetailComponents/MetadataSection";
import OverviewSection from "@components/MovieDetailComponents/OverviewSection";
import RelatedContent from "@components/MovieDetailComponents/RelatedContent";
import SeasonsSection from "@components/MovieDetailComponents/SeasonsSection";
import { tercihFavoriIleHizala } from "@/services/bildirimApi";

/**
 * Detay Sayfası Bölüm / Bileşen Aktiflik Ayarları
 * İstediğiniz bileşeni buradan true / false yaparak kolayca açıp kapatabilirsiniz.
 */
export const DETAIL_SECTIONS_CONFIG = {
	showTrailer: true, // Fragman butonu eylem gridinde yer almaktadır
	showCrew: false, // Kullanıcı isteği ile devre dışı bırakıldı (gözükmesin)
	showCast: true, // Oyuncular bölümü
	showOverview: true, // Açıklama / Özet bölümü
	showSeasons: true, // Sezonlar ve bölümler listesi
	showMetadata: true, // Film detay meta bilgileri (süre, puan, çıkış yılı vb.)
	showRelated: true, // Benzer içerikler bölümü
	showActionButtons: true, // Eylem butonları (Hemen İzle, Listem, Fragman, Favori, İndir)
	showFloatingBookmark: true, // Sağ altta kayan hızlı Liste/Kitaplık butonu
};

/**
 * Movie/Series Details Screen (Birleşik Modern Tasarım)
 * Dynamic route: /(app)/MovieDetails/[id]
 */
export default function MovieDetailsScreen() {
	const params = useLocalSearchParams();
	const id = params.id;
	const passedMovie = useMemo(() => {
		if (!params.movieData) return null;
		try {
			return typeof params.movieData === "string"
				? JSON.parse(params.movieData)
				: params.movieData;
		} catch (_e) {
			return null;
		}
	}, [params.movieData]);

	// Bildirim derin bağ hedefi (Faz 6 karar 2, 2026-10-23): otomatik
	// oynatılacak sezon/bölüm. Paramlar yoksa null — ekran eskisi gibi
	// davranır. Memo yalnız rota paramlarını sayılar; "bölüm listeleri
	// hazır olunca bir kez oynat" davranışı SeasonsSection içindedir.
	const otomatikBolum = useMemo(() => {
		const sezon = Number(params.otomatikSezon);
		const bolum = Number(params.otomatikBolum);
		if (!Number.isFinite(sezon) || sezon < 1) return null;
		if (!Number.isFinite(bolum) || bolum < 1) return null;
		return { sezon, bolum };
	}, [params.otomatikSezon, params.otomatikBolum]);

	const { colors, theme } = useThemeContext();
	const router = useRouter();

	/**
	 * TV ölçüleri (bkz. `utils/tvMetrics.js`).
	 *
	 * Bu ekran TV'de en çok şikâyet edilen ekranlardan biriydi: her
	 * bölüm 1920px'in tamamına yayılıyor, sekmeler telefon ölçüsünde
	 * küçük kalıyor, "Ses & Altyazı" satırı iki ucu ekranın iki kenarına
	 * yapışıyordu. `contentMaxWidth` içeriği ortalanmış bir sütuna
	 * topluyor, `sp` punto/boşlukları büyütüyor.
	 */
	const { isTV, sp, gutter, contentMaxWidth, textMaxWidth, focusScale } =
		useTvMetrics();

	const [selectedPlatformName, setSelectedPlatformName] = useState(null);

	useEffect(() => {
		getSelectedPlatform()
			.then((p) => {
				if (p?.name) setSelectedPlatformName(p.name);
			})
			.catch(() => {});
	}, []);

	// Dizi için passedMovie'deki seriesUrl veya seriesId, yoksa normal url
	const movieUrl = useMemo(() => {
		if (passedMovie?.seriesUrl) return passedMovie.seriesUrl;
		if (
			passedMovie?.type === "episode" &&
			passedMovie?.seriesId &&
			(String(passedMovie.seriesId).startsWith("http") ||
				String(passedMovie.seriesId).startsWith("/"))
		) {
			return passedMovie.seriesId;
		}
		if (passedMovie?.url) return passedMovie.url;
		if (params.url) return params.url;
		if (
			id &&
			(String(id).startsWith("http") || String(id).startsWith("/"))
		) {
			return id;
		}
		return null;
	}, [passedMovie, params.url, id]);

	const pluginName =
		passedMovie?.plugin || params.plugin || selectedPlatformName;

	const [pluginDetail, setPluginDetail] = useState(null);
	const [pluginLoading, setPluginLoading] = useState(Boolean(movieUrl));
	const [activeTab, setActiveTab] = useState("overview"); // 'overview' | 'episodes' | 'related'

	// Sadece ve sadece statik mock kimlikler için useContentDetails çağrılır
	const isPureStaticContent = Boolean(
		!movieUrl &&
		!passedMovie &&
		id &&
		!String(id).startsWith("http") &&
		!String(id).includes("/") &&
		!String(id).includes("_"),
	);

	// Normal statik / CMS içerikleri için hook (plugin değilse çağrılır)
	const {
		content: apiContent,
		loading: apiLoading,
		error: apiError,
		refetch: apiRefetch,
	} = useContentDetails(isPureStaticContent ? id : null);

	// Plugin içerik detayını backend'den çek (/api/plugins/{name}/detail?url=...)
	useEffect(() => {
		let isMounted = true;
		if (movieUrl && pluginName) {
			queueMicrotask(() => {
				if (isMounted) setPluginLoading(true);
			});
			fetchPluginDetail(pluginName, movieUrl)
				.then((res) => {
					if (isMounted && res) {
						setPluginDetail(res);
					}
				})
				.catch((err) => {
					console.error("Plugin detay çekme hatası:", err);
				})
				.finally(() => {
					if (isMounted) setPluginLoading(false);
				});
		} else if (!movieUrl) {
			queueMicrotask(() => {
				if (isMounted) setPluginLoading(false);
			});
		}
		return () => {
			isMounted = false;
		};
	}, [pluginName, movieUrl]);

	// Tüm verileri birleştir: pluginDetail > apiContent > passedMovie
	const content = useMemo(() => {
		if (pluginDetail) {
			const parsedRating = pluginDetail.rating
				? typeof pluginDetail.rating === "number"
					? pluginDetail.rating
					: parseFloat(pluginDetail.rating) || null
				: passedMovie?.rating
					? parseFloat(passedMovie.rating) || null
					: null;

			return {
				id: pluginDetail.slug || id,
				title: pluginDetail.title || passedMovie?.title,
				original_title:
					pluginDetail.original_title ||
					pluginDetail.title ||
					passedMovie?.title,
				tagline:
					pluginDetail.tagline ||
					pluginDetail.tags ||
					(Array.isArray(pluginDetail.genre)
						? pluginDetail.genre.join(" • ")
						: typeof pluginDetail.genre === "string"
							? pluginDetail.genre
							: null) ||
					passedMovie?.category ||
					null,
				overview:
					pluginDetail.description ||
					passedMovie?.description ||
					null,
				poster_url:
					pluginDetail.poster_url ||
					pluginDetail.poster ||
					passedMovie?.poster,
				backdrop_url:
					pluginDetail.backdrop_url ||
					passedMovie?.backdrop_url ||
					passedMovie?.backdrop ||
					pluginDetail.poster_url ||
					pluginDetail.poster ||
					passedMovie?.poster,
				rating: parsedRating,
				vote_count: pluginDetail.vote_count || null,
				runtime_minutes: pluginDetail.runtime_minutes || null,
				release_date:
					pluginDetail.release_date ||
					pluginDetail.year ||
					passedMovie?.release_date ||
					null,
				country: pluginDetail.country || null,
				language:
					pluginDetail.language || passedMovie?.language || null,
				age_rating: pluginDetail.age_rating || null,
				content_type: canonicalType({
					// Sıralama `isSeriesContent` içinde: önce backend'in model
					// sınıfından türettiği `is_series`, sonra normalize
					// `media_type` sözleşmesi, sonra alttaki alanlar.
					// Eskiden `content_type` ÖNCE okunuyordu; dizi için
					// `MovieInfo` dönen bir plugin'da yanlış değeri
					// (`"movie"`) kilitliyordu.
					is_series: pluginDetail.is_series,
					media_type: pluginDetail.media_type,
					content_type: pluginDetail.content_type,
					seasons: pluginDetail.seasons,
					episodes: pluginDetail.episodes,
					seriesId: passedMovie?.seriesId,
					seriesTitle: passedMovie?.seriesTitle,
				}),
				// ⚠️ `is_series` ve `media_type` AŞAĞIDA `passedMovie`'dan
				// tamamlanıyordu; oysa detay cevabı ikisini de DOĞRU
				// biliyor. Alanlar buraya taşınmayınca satır ~349'daki
				// `content?.is_series ?? passedMovie?.is_series` ikisinde de
				// boş bulup `passedMovie.media_type`'a düşüyordu.
				//
				// Kategori (`main-page`) listesi dizileri `media_type: "Film"`
				// etiketiyle geliyor (arama ise doğru şekilde "Dizi" dönüyor).
				// Sonuç: `isSeriesContent` 2. adımda "Film"e kısa devre yapıp
				// `isSeries = false` veriyor ve `isSeries &&` kapısındaki
				// "Bölümler" sekmesi hiç render edilmiyordu — bölümler API'de
				// vardı, ekranda görünmüyordu.
				//
				// Detay cevabı liste verisinden DAHA GÜÇLÜ bir kaynaktır
				// (`content_type` sözleşmesi + modelden türetilen `is_series`),
				// bu yüzden öncelik ona verilir.
				is_series:
					pluginDetail.is_series === true ||
					pluginDetail.is_series === "true",
				media_type: pluginDetail.media_type || null,
				status: pluginDetail.status || null,
				director:
					pluginDetail.director ||
					pluginDetail.directors?.[0] ||
					null,
				creator: pluginDetail.creator || null,
				production_co: pluginDetail.production_co || null,
				cast_members:
					pluginDetail.cast_members ||
					(Array.isArray(pluginDetail.actors)
						? pluginDetail.actors
						: pluginDetail.actors
							? pluginDetail.actors.split(", ")
							: []),
				trailer_url:
					pluginDetail.fragman_url || pluginDetail.trailer_url,
				url: pluginDetail.url || movieUrl,
				plugin: pluginName,
				// TMDB zenginleştirmesinden gelen dizi kimliği — bildirim
				// kartının peşine geçer (`NotificationPreferenceCard`).
				tmdb_id: pluginDetail.tmdb_id || null,
				seasons: pluginDetail.seasons || passedMovie?.seasons || null,
				episodes:
					pluginDetail.episodes || passedMovie?.episodes || null,
				related: pluginDetail.related || null,
			};
		}

		if (apiContent) {
			return {
				...apiContent,
				status: apiContent.status || null,
				age_rating: apiContent.age_rating || null,
				director: apiContent.director || null,
				production_co: apiContent.production_co || null,
			};
		}

		if (passedMovie) {
			// ⚠️ Bu dallık detay API'si YOK düşülüp doğrudan liste/derin bağ
			// verisiyle açıldığında çalışır (çevrimdışı, arşiv, TV kumandası).
			// Sinyaller `mediaType.js`'de tek yerde toplandı; buradaki
			// `initialSeason`/`category` ipuçları da ona girdi.
			return {
				id: passedMovie.id || id,
				title: passedMovie.seriesTitle || passedMovie.title,
				original_title: passedMovie.seriesTitle || passedMovie.title,
				tagline:
					passedMovie.initialSeason && passedMovie.initialEpisode
						? `${passedMovie.initialSeason}. Sezon ${passedMovie.initialEpisode}. Bölüm`
						: passedMovie.category || null,
				overview: passedMovie.description || null,
				poster_url:
					passedMovie.poster ||
					passedMovie.poster_url ||
					passedMovie.image,
				backdrop_url:
					passedMovie.backdrop_url ||
					passedMovie.backdrop ||
					passedMovie.poster ||
					passedMovie.poster_url ||
					passedMovie.image,
				rating: passedMovie.rating
					? typeof passedMovie.rating === "number"
						? passedMovie.rating
						: parseFloat(passedMovie.rating) || null
					: null,
				vote_count: null,
				runtime_minutes: null,
				release_date: passedMovie.release_date || null,
				language: passedMovie.language || null,
				age_rating: null,
				content_type: canonicalType({
					is_series: passedMovie.is_series,
					media_type: passedMovie.media_type,
					type: passedMovie.type,
					content_type: passedMovie.content_type,
					seasons: passedMovie.seasons,
					seriesId: passedMovie.seriesId,
					seriesTitle: passedMovie.seriesTitle,
					// Derin bağdan gelen bölüm bilgisi güçlü bir dizi işaretidir.
					season: passedMovie.initialSeason ?? passedMovie.season,
					episode: passedMovie.initialEpisode ?? passedMovie.episode,
					category: passedMovie.category,
					title: passedMovie.title,
					url: passedMovie.url,
				}),
				status: null,
				director: null,
				production_co: null,
				url: movieUrl,
				plugin: pluginName,
				tmdb_id: passedMovie.tmdb_id || null,
				seasons: null,
				episodes: null,
				cast_members: [],
			};
		}

		return null;
	}, [pluginDetail, apiContent, passedMovie, id, pluginName, movieUrl]);

	const loading = isPureStaticContent
		? apiLoading
		: pluginLoading && !content && !passedMovie;
	const error = isPureStaticContent ? apiError : null;

	// ⚠️ Tek kaynak: `utils/mediaType.js`. Eskiden burada `content_type`,
	// `seasons`, `episodes`, `passedMovie.is_series`, `category` ve başlıkta
	// "sezon" araması ayrı ayrı OR'lanıyordu; `MovieDetails` içindeki iki
	// farklı zincirle aynı sonucu vermiyordu.
	//
	// `content` yayılır (seasons/episodes/content_type/type/title hazır gelir),
	// ardından eksik sinyaller `passedMovie`'dan tamamlanır.
	const isSeries = isSeriesContent({
		...content,
		is_series: content?.is_series ?? passedMovie?.is_series,
		// ⚠️ `passedMovie.media_type` yalnızca `content` KENDİ tür sinyali
		// veremiyorsa devreye girmeli.
		//
		// Sebep: `isSeriesContent` sırası `is_series → media_type →
		// content_type → …` ve `media_type` BİTİŞ bir cevap verir. Liste
		// verisi (`main-page`) dizileri `media_type: "Film"` etiketlediği
		// için, bu fallback `content_type: "series"` (detay cevabından)
		// gelen DOĞRU sinyali sessizce eziyordu. `content_type` zaten bir
		// sinyal olduğundan, varken listeye düşmek yanlıştır.
		media_type:
			content?.media_type ??
			(content?.content_type ? undefined : passedMovie?.media_type),
		seriesId: content?.seriesId ?? passedMovie?.seriesId,
		seriesTitle: content?.seriesTitle ?? passedMovie?.seriesTitle,
		season:
			content?.season ??
			passedMovie?.initialSeason ??
			passedMovie?.season,
		episode:
			content?.episode ??
			passedMovie?.initialEpisode ??
			passedMovie?.episode,
		category: passedMovie?.category ?? content?.category,
		url: content?.url ?? movieUrl,
	});

	// Kaldığın Yerden Devam Et ve Bölüm Tamamlanma Durumları
	const [watchProgress, setWatchProgress] = useState(null);
	const [episodesProgress, setEpisodesProgress] = useState({});

	const loadWatchProgress = useCallback(() => {
		if (!content) return;
		let isMounted = true;
		getContentWatchProgress(content)
			.then((res) => {
				if (isMounted) setWatchProgress(res);
			})
			.catch((err) =>
				console.warn("Watch progress yükleme hatası:", err),
			);

		if (isSeries) {
			getSeriesEpisodesProgress(content.id || content.url, content.title)
				.then((res) => {
					if (isMounted) setEpisodesProgress(res || {});
				})
				.catch((err) =>
					console.warn("Bölüm ilerleme yükleme hatası:", err),
				);
		}
		return () => {
			isMounted = false;
		};
	}, [content, isSeries]);

	useFocusEffect(
		useCallback(() => {
			const cleanup = loadWatchProgress();
			return () => {
				cleanup?.();
			};
		}, [loadWatchProgress]),
	);

	// Sync gelen izleme durumunu odak değişimi olmadan da ekrana yansıt.
	// (loadWatchProgress bir temizleme fonksiyonu döndürür; burada yalnızca
	//  yükleme tarafı çağrılır, cleanup useFocusEffect'ın işidir.)
	useReactiveData(
		useCallback(() => {
			loadWatchProgress()?.();
		}, [loadWatchProgress]),
		["user_watch_history", "user_watchlist", "user_continue_watching"],
	);

	// Tür / Kategori listesi (Dram, Tarih, Epik Savaş vb.)
	const genreList = useMemo(() => {
		const raw =
			pluginDetail?.genre ||
			pluginDetail?.genres ||
			pluginDetail?.categories ||
			passedMovie?.genre ||
			passedMovie?.genres ||
			content?.tagline;

		if (Array.isArray(raw)) return raw;
		if (typeof raw === "string") {
			return raw
				.split(/[,/·•]/)
				.map((s) => s.trim())
				.filter(Boolean);
		}
		return [];
	}, [pluginDetail, passedMovie, content?.tagline]);

	// Toplam bölüm sayısı hesaplama
	const totalEpisodesCount = useMemo(() => {
		if (!content?.seasons) return 0;
		if (
			typeof content.seasons === "object" &&
			!Array.isArray(content.seasons)
		) {
			return Object.values(content.seasons).reduce(
				(acc, list) => acc + (Array.isArray(list) ? list.length : 0),
				0,
			);
		}
		if (Array.isArray(content.seasons)) {
			return content.seasons.reduce(
				(acc, s) =>
					acc + (Array.isArray(s.episodes) ? s.episodes.length : 1),
				0,
			);
		}
		return 0;
	}, [content]);

	useEffect(() => {
		if (totalEpisodesCount > 0) {
			if (content?.id)
				saveSeriesTotalEpisodes(content.id, totalEpisodesCount);
			if (content?.url)
				saveSeriesTotalEpisodes(content.url, totalEpisodesCount);
			if (content?.title)
				saveSeriesTotalEpisodes(content.title, totalEpisodesCount);
		}
	}, [totalEpisodesCount, content?.id, content?.url, content?.title]);

	// Backend'den gelen Ses ve Altyazı seçeneklerini tespit et (varsa gösterilecek)
	const audioSubtitleOptions = useMemo(() => {
		const rawLanguage =
			pluginDetail?.language ||
			passedMovie?.language ||
			content?.language;
		const rawAudio =
			pluginDetail?.audio || pluginDetail?.dubbing || content?.audio;
		const rawSubtitles =
			pluginDetail?.subtitles ||
			pluginDetail?.subtitle ||
			content?.subtitles;
		const rawLanguages = pluginDetail?.languages || content?.languages;

		const options = [];

		const checkAndAdd = (text) => {
			if (!text || typeof text !== "string") return;
			const lower = text.toLowerCase();
			if (lower.includes("dublaj") || lower.includes("türkçe dublaj")) {
				if (!options.includes("Türkçe Dublaj")) {
					options.push("Türkçe Dublaj");
				}
			}
			if (
				lower.includes("altyazı") ||
				lower.includes("altyazılı") ||
				lower.includes("sub")
			) {
				if (!options.includes("TR Altyazı")) {
					options.push("TR Altyazı");
				}
			}
			if (lower.includes("orijinal") || lower.includes("original")) {
				if (!options.includes("Orijinal Dil")) {
					options.push("Orijinal Dil");
				}
			}
		};

		if (Array.isArray(rawLanguages)) {
			rawLanguages.forEach(checkAndAdd);
		} else if (rawLanguages) {
			checkAndAdd(rawLanguages);
		}

		if (rawLanguage) checkAndAdd(rawLanguage);
		if (rawAudio) checkAndAdd(rawAudio);
		if (rawSubtitles) checkAndAdd(rawSubtitles);

		if (Array.isArray(rawAudio)) {
			rawAudio.forEach((a) => {
				const label =
					typeof a === "string" ? a : a?.name || a?.language;
				if (label && !options.includes(label)) options.push(label);
			});
		}
		if (Array.isArray(rawSubtitles)) {
			rawSubtitles.forEach((s) => {
				const label =
					typeof s === "string" ? s : s?.name || s?.language;
				if (label && !options.includes(label)) options.push(label);
			});
		}

		return options;
	}, [pluginDetail, passedMovie, content]);

	// Favori ve Kitaplık / İzleme Listesi Durumları
	const [isFav, setIsFav] = useState(false);
	const [inWatchlist, setInWatchlist] = useState(false);
	const [watchlistStatus, setWatchlistStatus] = useState(null); // 'watching' | 'planned' | 'completed' | null
	const [isListSelectModalVisible, setIsListSelectModalVisible] =
		useState(false);
	const [selectedSeason, setSelectedSeason] = useState(() => {
		// Deep-link automatic target takes priority in the starting season (Faz 6 decision 2).
		const ilk = otomatikBolum?.sezon ?? passedMovie?.initialSeason;
		return ilk != null ? String(ilk) : null;
	});

	// Bölüm seçim modu / işlem menüsü durumunu geri tuşunda kapatabilmek
	// için SeasonsSection referansı (bkz. aşağıdaki BackHandler).
	const seasonsRef = useRef(null);

	useFocusEffect(
		useCallback(() => {
			const onBackPress = () => {
				// Önce bölüm seçim modu / bağlam menüsü açık mı? Açıksa geri
				// tuşu ekrandan çıkmaz, yalnızca seçimi/menüyü kapatır.
				if (seasonsRef.current?.cancelSelection?.()) {
					return true;
				}
				if (isListSelectModalVisible) {
					setIsListSelectModalVisible(false);
					return true;
				}
				if (router.canGoBack()) router.back();
				else router.replace("/(app)");
				return true;
			};

			const subscription = BackHandler.addEventListener(
				"hardwareBackPress",
				onBackPress,
			);
			return () => subscription.remove();
		}, [isListSelectModalVisible, router]),
	);

	const movieItem = useMemo(() => {
		if (!content) return null;
		const targetId = content.id || content.url || id;
		const targetUrl = content.url || movieUrl;
		return {
			id: targetId,
			title: content.title,
			poster: content.poster_url || content.backdrop_url,
			type: isSeries ? "series" : "movie",
			plugin: content.plugin || pluginName,
			url: targetUrl,
			seriesUrl: isSeries ? targetUrl : undefined,
		};
	}, [content, isSeries, id, movieUrl, pluginName]);

	useEffect(() => {
		const targetId = content?.id || content?.url;
		if (targetId) {
			getContentLibraryStatus(targetId)
				.then((status) => {
					setIsFav(Boolean(status?.isFav));
					setInWatchlist(Boolean(status?.currentList));
					setWatchlistStatus(status?.currentList || null);
				})
				.catch(() => {});
		}
	}, [content?.id, content?.url]);

	/**
	 * İşaretlenen bölümlerden SONRA gelen ilk bölümü bulur.
	 *
	 * Devam kaydı işaretlenen bölümde duruyorsa sonraki bölüme taşınır
	 * (bkz. `markEpisodesWatched` → `options.nextEpisode`). Sezon
	 * nesnesi/ dizisi/episodes üç biçimini de düzleştirir; sezonlar ve
	 * bölümler numaraya göre sıralanır.
	 */
	const findNextEpisodeAfterMarks = useCallback(
		(marks) => {
			if (!content) return null;

			const flat = [];
			const pushEpisodes = (list, seasonKey) => {
				if (!Array.isArray(list)) return;
				list.forEach((ep, index) => {
					const epNumber =
						ep.episode || ep.episode_number || index + 1;
					const sNum = Number(
						ep.season || ep.season_number || seasonKey,
					);
					flat.push({
						season: Number.isFinite(sNum)
							? sNum
							: seasonKey,
						episode: Number(epNumber) || epNumber,
						title: ep.title || null,
						url: ep.url || null,
						id: ep.id || null,
						poster: ep.poster || null,
					});
				});
			};

			if (
				content.seasons &&
				typeof content.seasons === "object" &&
				!Array.isArray(content.seasons)
			) {
				Object.entries(content.seasons).forEach(([sKey, list]) =>
					pushEpisodes(list, sKey),
				);
			} else if (Array.isArray(content.seasons)) {
				content.seasons.forEach((seasonObj, sIdx) => {
					if (!seasonObj || typeof seasonObj !== "object") return;
					const sKey =
						seasonObj.season ||
						seasonObj.season_number ||
						sIdx + 1;
					pushEpisodes(
						Array.isArray(seasonObj.episodes)
							? seasonObj.episodes
							: seasonObj.items,
						sKey,
					);
				});
			}
			if (flat.length === 0) {
				pushEpisodes(content.episodes, 1);
			}
			if (flat.length === 0) return null;

			flat.sort((a, b) => {
				const sa = Number(a.season) || 0;
				const sb = Number(b.season) || 0;
				if (sa !== sb) return sa - sb;
				return (Number(a.episode) || 0) - (Number(b.episode) || 0);
			});

			const markedSet = new Set(
				(marks || []).map(
					(m) => `s${Number(m.season)}_e${Number(m.episode)}`,
				),
			);
			let lastMarkedIndex = -1;
			flat.forEach((item, index) => {
				if (markedSet.has(`s${item.season}_e${item.episode}`)) {
					lastMarkedIndex = index;
				}
			});
			for (let i = lastMarkedIndex + 1; i < flat.length; i++) {
				const candidate = flat[i];
				if (
					!markedSet.has(
						`s${candidate.season}_e${candidate.episode}`,
					)
				) {
					return candidate;
				}
			}
			return null;
		},
		[content],
	);

	/**
	 * Bölüm(ler)i "İzlendi"/"İzlenmedi" işaretler (SeasonsSection menüsü).
	 *
	 * ⚠️ Veri yazımı storage'dadır (`markEpisodesWatched` /
	 * `unmarkEpisodesWatched`) ve hesaba senkronlanır; burada yalnızca
	 * içerik meta verisi ile "sıradaki bölüm" hesaplanır.
	 *
	 * @param {Array} marks  Seçilen bölümler ({season, episode, title, url, id, poster})
	 * @param {boolean} watched  true: işaretle, false: işareti kaldır
	 * @returns {Promise<number>} İşaretlenen/işareti kaldırılan bölüm sayısı
	 */
	const handleSetWatchedEpisodes = useCallback(
		async (marks, watched) => {
			if (!content || !marks?.length) return 0;

			const meta = {
				id: content.id || content.url,
				url: content.url || movieUrl,
				title: content.title,
				poster_url: content.poster_url || content.backdrop_url,
				plugin: content.plugin || pluginName,
				seriesTitle: content.title,
			};

			let count = 0;
			if (watched) {
				const nextEpisode = findNextEpisodeAfterMarks(marks);
				count = await markEpisodesWatched(meta, marks, {
					nextEpisode,
				});
			} else {
				await unmarkEpisodesWatched(meta, marks);
				count = marks.length;
			}

			// Ekrandaki "TAMAMLANDI" rozetleri hemen güncellensin.
			// ⚠️ `loadWatchProgress` bir cleanup fonksiyonu DÖNDÜRÜR;
			// `?.()` ile çağırmak döndürülen cleanup'ı ANINDA çalıştırır ve
			// iç effect'in `isMounted=false` olmasına yol açar → setState'ler
			// atlanır, rozetler o ekranda hiç yenilenmez. Düz çağrı yeterli;
			// cleanup'ın kendisi `useFocusEffect`{ L419-442 } döndürülür.
			loadWatchProgress();
			return count;
		},
		[content, movieUrl, pluginName, loadWatchProgress, findNextEpisodeAfterMarks],
	);

	const handleToggleFavorite = async () => {
		if (!movieItem) return;
		try {
			const updated = await toggleFavorite(movieItem);
			setIsFav(Boolean(updated));
			// Faz 6.2 (user decision 2026-10-23): add-to-favorites automatically
			// starts tracking (if the existing preference is preserved), remove-to-favorites
			// automatically mutes an preference that is on. It never blocks the favorite flow.
			void tercihFavoriIleHizala({
				tmdbId: content?.tmdb_id,
				isSeries: Boolean(isSeries),
				watchedProvider: pluginName,
				diziUrl: content?.url || movieUrl,
				favoride: Boolean(updated),
			});
		} catch (e) {
			console.error("Favori değiştirme hatası:", e);
		}
	};

	const handleToggleWatchlist = () => {
		if (!movieItem) return;
		setIsListSelectModalVisible(true);
	};

	const handleListStatusChanged = (newList, newFav) => {
		setWatchlistStatus(newList);
		setInWatchlist(Boolean(newList));
		if (newFav !== undefined) {
			setIsFav(Boolean(newFav));
			// ListSelectModal içindeki favori düğmesi de Faz 6.2 hizalamasına
			// girer (favori verme → otomatik takip; çıkarma → sustur).
			void tercihFavoriIleHizala({
				tmdbId: content?.tmdb_id,
				isSeries: Boolean(isSeries),
				watchedProvider: pluginName,
				diziUrl: content?.url || movieUrl,
				favoride: Boolean(newFav),
			});
		}
	};

	const handleShare = async () => {
		if (!content) return;
		try {
			await Share.share({
				message: `${content.title}\n\n${content.overview || "StreamPulse üzerinden harika bir içerik!"}`,
				title: content.title,
			});
		} catch (error) {
			console.error("Paylaşım hatası:", error);
		}
	};

	const handleOpenTrailer = async () => {
		const trailerUrl = content?.trailer_url;
		if (!trailerUrl) {
			Alert.alert(
				"Bilgi",
				"Bu içerik için fragman bağlantısı bulunamadı.",
			);
			return;
		}
		try {
			await WebBrowser.openBrowserAsync(trailerUrl);
		} catch (error) {
			console.error("Fragman açma hatası:", error);
			Linking.openURL(trailerUrl);
		}
	};

	// Loading state
	if (loading && !content) {
		return <LoadingState />;
	}

	// Error state
	if (error && !content) {
		return <ErrorState error={error} onRetry={apiRefetch} />;
	}

	// Content not found
	if (!content) {
		return <ErrorState error="İçerik bulunamadı" onRetry={apiRefetch} />;
	}

	const surfaceBg = theme === "dark" ? "#161B24" : "#ffffff";
	const surfaceBorder = theme === "dark" ? "#232A36" : "#E2E8F0";

	return (
		<View style={[styles.rootContainer, { backgroundColor: colors.bg }]}>
			<Stack.Screen options={{ headerShown: false }} />

			<ScrollView
				style={[styles.container, { backgroundColor: colors.bg }]}
				contentInsetAdjustmentBehavior="automatic"
				showsVerticalScrollIndicator={false}>
				{/* 1. HERO SECTION - Backdrop, başlık, rozetler, geri & paylaş */}
				<HeroSection
					content={content}
					onShare={handleShare}
					genreList={genreList}
				/>

				{/* 2. ANA İÇERİK ALANI */}
				<View
					style={[
						styles.contentWrapper,
						{
							paddingHorizontal: 20 + gutter,
							paddingTop: sp(10),
							paddingBottom: sp(80),
							// TV'de her bölüm 1920px'e yayılıyordu; ortalanmış
							// bir sütun hem okunur hem de "tek ekran" hissi verir.
							width: "100%",
							maxWidth: contentMaxWidth,
							alignSelf: "center",
						},
					]}>
					{/* Meta Hapları (Süre, Yıl, Yaş Sınırı, Kalite, Durum) */}
					{DETAIL_SECTIONS_CONFIG.showMetadata && (
						<MetadataSection content={content} />
					)}

					{/* Eylem Butonları (Kaldığın Yerden Devam Et Kartı / Hemen Şimdi İzle + Listem, Favori, İndir, Fragman) */}
					{DETAIL_SECTIONS_CONFIG.showActionButtons && (
						<ActionButtons
							content={content}
							inWatchlist={inWatchlist}
							watchlistStatus={watchlistStatus}
							isFav={isFav}
							watchProgress={watchProgress}
							totalEpisodesCount={totalEpisodesCount}
							onToggleWatchlist={handleToggleWatchlist}
							onToggleFavorite={handleToggleFavorite}
							onOpenTrailer={handleOpenTrailer}
						/>
					)}

					{/* Yeni Bölüm Bildirimi Kartı — yalnızca dizi + tmdb eşleşmesi varken */}
					{isSeries &&
						content?.tmdb_id &&
						(content?.url || movieUrl) && (
							<NotificationPreferenceCard
								key={String(content.tmdb_id)}
								tmdbId={content.tmdb_id}
								diziUrl={content?.url || movieUrl}
								kaynakAdi={content?.plugin || pluginName || null}
								diziBasligi={
									content?.title || passedMovie?.seriesTitle || null
								}
								// Faz 6.3: TMDB dizi durumu — bitmiş dizide kart
								// vaat yerine "yeni bölüm beklenmiyor" der.
								diziDurumu={content?.status || null}
							/>
						)}

					{/* Ses & Altyazı Bilgi Çubuğu (Yalnızca backend sonucunda varsa gösterilir) */}
					{audioSubtitleOptions.length > 0 && (
						<View
							style={[
								styles.audioSubtitleRow,
								{
									backgroundColor: surfaceBg,
									borderColor: surfaceBorder,
									// Etiket + rozetler tek satırda, aralarında
									// SABİT boşluk. `space-between` olsaydı
									// rozetler sağ uca savrulup telefon ekranını
									// boydan boya kaplayan bir boşluk bırakıyordu
									// (bkz. `styles.audioSubtitleRow` notu).
									flexDirection: "row",
									alignItems: "center",
									gap: sp(12),
									paddingHorizontal: sp(14),
									paddingVertical: sp(11),
									borderRadius: sp(14),
									marginBottom: sp(16),
								},
							]}>
							<View style={[styles.audioLeft, { gap: sp(7) }]}>
								<Ionicons
									name="chatbubbles-outline"
									size={sp(16)}
									color="#E50914"
								/>
								<Text
									style={[
										styles.audioLabel,
										{
											color: colors.textSecondary,
											fontSize: sp(12.5),
										},
									]}>
									Ses & Altyazı:
								</Text>
							</View>
							<View style={[styles.audioChips, { gap: sp(7) }]}>
								{audioSubtitleOptions.map((optionText, idx) => (
									<View
										key={idx}
										style={[
											styles.audioChip,
											{
												backgroundColor:
													theme === "dark"
														? "#0B0E14"
														: "#f1f5f9",
												borderColor: surfaceBorder,
												paddingHorizontal: sp(10),
												paddingVertical: sp(5),
												borderRadius: sp(9),
											},
										]}>
										<Text
											style={[
												styles.audioChipText,
												{
													color: colors.text,
													fontSize: sp(12),
												},
											]}>
											{optionText}
										</Text>
									</View>
								))}
							</View>
						</View>
					)}

					{/* 3. SEKME GEÇİŞİ (TABS SWITCHER) */}
					<View
						style={[
							styles.tabBar,
							{
								borderBottomColor: surfaceBorder,
								marginBottom: sp(24),
								gap: sp(isTV ? 10 : 24),
							},
						]}>
						{/* Tab 1: Genel Bakış */}
						<TVPressable
							style={({ focused }) => [
								styles.tabItem,
								{
									paddingVertical: sp(8),
									paddingHorizontal: sp(13),
									borderRadius: sp(12),
								},
								activeTab === "overview" &&
									styles.tabItemActive,
								focused && {
									backgroundColor: "rgba(229, 9, 20, 0.22)",
									borderWidth: 2,
									borderColor: "#E50914",
									transform: [{ scale: focusScale }],
								},
							]}
							onPress={() => setActiveTab("overview")}
							activeOpacity={0.7}>
							<Text
								style={[
									styles.tabText,
									{
										color:
											activeTab === "overview"
												? "#E50914"
												: colors.textSecondary,
										fontWeight:
											activeTab === "overview"
												? "800"
												: "600",
										fontSize: sp(15),
									},
								]}>
								Genel Bakış
							</Text>
							{activeTab === "overview" && (
								<View style={styles.tabIndicator} />
							)}
						</TVPressable>

						{isSeries && (
							<TVPressable
								style={({ focused }) => [
									styles.tabItem,
									{
										paddingVertical: sp(8),
									paddingHorizontal: sp(13),
										borderRadius: sp(12),
									},
									activeTab === "episodes" &&
										styles.tabItemActive,
									focused && {
										backgroundColor:
											"rgba(229, 9, 20, 0.22)",
										borderWidth: 2,
										borderColor: "#E50914",
										transform: [{ scale: focusScale }],
									},
								]}
								onPress={() => setActiveTab("episodes")}
								activeOpacity={0.7}>
								<View
									style={[
										styles.tabWithBadge,
										{ gap: sp(8) },
									]}>
									<Text
										style={[
											styles.tabText,
											{
												color:
													activeTab === "episodes"
														? "#E50914"
														: colors.textSecondary,
												fontWeight:
													activeTab === "episodes"
														? "800"
														: "600",
												fontSize: sp(15),
											},
										]}>
										Bölümler
									</Text>
									{totalEpisodesCount > 0 && (
										<View
											style={[
												styles.tabCountBadge,
												{
													paddingHorizontal: sp(8),
													paddingVertical: sp(2),
													borderRadius: sp(12),
												},
											]}>
											<Text
												style={[
													styles.tabCountText,
													{ fontSize: sp(13) },
												]}>
												{totalEpisodesCount}
											</Text>
										</View>
									)}
								</View>
								{activeTab === "episodes" && (
									<View style={styles.tabIndicator} />
								)}
							</TVPressable>
						)}

						{/* Tab 3: Benzerler */}
						<TVPressable
							style={({ focused }) => [
								styles.tabItem,
								{
									paddingVertical: sp(8),
									paddingHorizontal: sp(13),
									borderRadius: sp(12),
								},
								activeTab === "related" && styles.tabItemActive,
								focused && {
									backgroundColor: "rgba(229, 9, 20, 0.22)",
									borderWidth: 2,
									borderColor: "#E50914",
									transform: [{ scale: focusScale }],
								},
							]}
							onPress={() => setActiveTab("related")}
							activeOpacity={0.7}>
							<Text
								style={[
									styles.tabText,
									{
										color:
											activeTab === "related"
												? "#E50914"
												: colors.textSecondary,
										fontWeight:
											activeTab === "related"
												? "800"
												: "600",
										fontSize: sp(15),
									},
								]}>
								Benzerler
							</Text>
							{activeTab === "related" && (
								<View style={styles.tabIndicator} />
							)}
						</TVPressable>
					</View>

					{/* 4. SEKMELERE GÖRE İÇERİK GÖSTERİMİ */}

					{/* --- GENEL BAKIŞ SEKMESİ --- */}
					{activeTab === "overview" && (
						<>
							{/* Özet Bölümü */}
							{DETAIL_SECTIONS_CONFIG.showOverview && (
								<OverviewSection content={content} />
							)}

							{/* Dizi ise Sezon ve Bölümler Bölümü */}
							{isSeries && DETAIL_SECTIONS_CONFIG.showSeasons && (
								<SeasonsSection
									seasons={content.seasons}
									episodes={content.episodes}
									loading={pluginLoading && !content.seasons}
									initialSeason={passedMovie?.initialSeason}
									selectedSeason={selectedSeason}
									onSeasonChange={setSelectedSeason}
									seriesTitle={content.title}
									posterUrl={
										content.poster_url ||
										content.backdrop_url
									}
									content={content}
									episodesProgress={episodesProgress}
									totalEpisodes={totalEpisodesCount}
									ref={seasonsRef}
									onSetWatched={handleSetWatchedEpisodes}
								/>
							)}

							{/* Oyuncular Bölümü */}
							{DETAIL_SECTIONS_CONFIG.showCast &&
								content.cast_members &&
								content.cast_members.length > 0 && (
									<CastSection cast={content.cast_members} />
								)}

							{/* Ekip Bilgisi (Gerektiğinde açılabilir) */}
							{DETAIL_SECTIONS_CONFIG.showCrew && (
								<CrewSection content={content} />
							)}

							{/* Detay Bilgileri Tablosu (Yönetmen, Orijinal Dil, Yayıncı Ağ - Yalnızca varsa gösterilir) */}
							{Boolean(
								content.director ||
								content.language ||
								content.production_co,
							) && (
								<View
									style={[
										styles.detailsTableCard,
										{
											backgroundColor: surfaceBg,
											borderColor: surfaceBorder,
											paddingHorizontal: sp(16),
											paddingVertical: sp(11),
											borderRadius: sp(14),
														// Etiket ile değer arası 1300px'e yayılıyordu
											// ("Orijinal Dil" … "Dublaj & Altyazılı");
											// ikisi de kısa metin, aralarındaki boşluk
											// anlamsız. Metin sütununun genişliğine sabitleniyor.
											width: "100%",
											maxWidth: textMaxWidth,
											alignSelf: "flex-start",
											marginBottom: sp(18),
										},
									]}>
									{Boolean(content.director) && (
										<View
											style={[
												styles.detailsRow,
												{ paddingVertical: sp(10) },
											]}>
											<Text
												style={[
													styles.detailsLabel,
													{
														color: colors.textSecondary,
														fontSize: sp(13.5),
													},
												]}>
												Yönetmen
											</Text>
											<Text
												style={[
													styles.detailsValue,
													{
														color: colors.text,
														fontSize: sp(13.5),
													},
												]}>
												{content.director}
											</Text>
										</View>
									)}

									{Boolean(
										content.director &&
										(content.language ||
											content.production_co),
									) && (
										<View
											style={[
												styles.detailsDivider,
												{
													backgroundColor:
														surfaceBorder,
												},
											]}
										/>
									)}

									{Boolean(content.language) && (
										<View
											style={[
												styles.detailsRow,
												{ paddingVertical: sp(10) },
											]}>
											<Text
												style={[
													styles.detailsLabel,
													{
														color: colors.textSecondary,
														fontSize: sp(13.5),
													},
												]}>
												Orijinal Dil
											</Text>
											<Text
												style={[
													styles.detailsValue,
													{
														color: colors.text,
														fontSize: sp(13.5),
													},
												]}>
												{content.language}
											</Text>
										</View>
									)}

									{Boolean(
										content.language &&
										content.production_co,
									) && (
										<View
											style={[
												styles.detailsDivider,
												{
													backgroundColor:
														surfaceBorder,
												},
											]}
										/>
									)}

									{Boolean(content.production_co) && (
										<View
											style={[
												styles.detailsRow,
												{ paddingVertical: sp(10) },
											]}>
											<Text
												style={[
													styles.detailsLabel,
													{
														color: colors.textSecondary,
														fontSize: sp(13.5),
													},
												]}>
												Yayıncı Ağ
											</Text>
											<Text
												style={[
													styles.detailsValue,
													{
														color: colors.text,
														fontSize: sp(13.5),
													},
												]}>
												{content.production_co}
											</Text>
										</View>
									)}
								</View>
							)}

							{/* Film ise veya benzer içerikler varsa göster */}
							{!isSeries &&
								DETAIL_SECTIONS_CONFIG.showRelated && (
									<RelatedContent
										contentType={content.content_type}
										currentId={content.id}
										pluginRelated={content.related}
									/>
								)}
						</>
					)}

					{/* --- BÖLÜMLER SEKMESİ --- */}
					{activeTab === "episodes" && isSeries && (
						<View style={styles.episodesTabContainer}>
							<SeasonsSection
								seasons={content.seasons}
								episodes={content.episodes}
								loading={pluginLoading && !content.seasons}
								initialSeason={otomatikBolum?.sezon ?? passedMovie?.initialSeason}
								selectedSeason={selectedSeason}
								onSeasonChange={setSelectedSeason}
								otomatikBolum={otomatikBolum}
								seriesTitle={content.title}
								posterUrl={
									content.poster_url || content.backdrop_url
								}
								content={content}
								episodesProgress={episodesProgress}
								ref={seasonsRef}
								onSetWatched={handleSetWatchedEpisodes}
							/>
						</View>
					)}

					{/* --- BENZERLER SEKMESİ --- */}
					{activeTab === "related" && (
						<View style={styles.relatedTabContainer}>
							<RelatedContent
								contentType={content.content_type}
								currentId={content.id}
								pluginRelated={content.related}
							/>
						</View>
					)}
				</View>
			</ScrollView>

			{/* 5. SAĞ ALTTA KAYAN HIZLI KİTAPLIK / LİSTEM BUTONU (FAB) */}
			{/* {DETAIL_SECTIONS_CONFIG.showFloatingBookmark && (
				<TouchableOpacity
					style={[
						styles.floatingBookmark,
						{
							backgroundColor: inWatchlist
								? (watchlistStatus === "completed" ? "#10b981" : watchlistStatus === "planned" ? "#0284c7" : "#E50914")
								: surfaceBg,
							borderColor: inWatchlist
								? (watchlistStatus === "completed" ? "#10b981" : watchlistStatus === "planned" ? "#0284c7" : "#E50914")
								: surfaceBorder,
						},
					]}
					onPress={handleToggleWatchlist}
					activeOpacity={0.8}
					hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
					<Ionicons
						name={
							watchlistStatus === "watching"
								? "play-circle"
								: watchlistStatus === "completed"
									? "checkmark-circle"
									: inWatchlist
										? "bookmark"
										: "bookmark-outline"
						}
						size={22}
						color={inWatchlist ? "#ffffff" : "#E50914"}
					/>
				</TouchableOpacity>
			)} */}

			{/* List Selection Modal */}
			<ListSelectModal
				visible={isListSelectModalVisible}
				movie={movieItem}
				onClose={() => setIsListSelectModalVisible(false)}
				onStatusChanged={handleListStatusChanged}
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	rootContainer: {
		flex: 1,
	},
	container: {
		flex: 1,
	},
	contentWrapper: {},

	/* Ses & Altyazı Bilgi Çubuğu */
	/**
	 * ⚠️ `justifyContent: "space-between"` BURADA OLMAMALI.
	 *
	 * Bu değer, satır yorumunun çözdüğü sorunun ta kendisi: "Ses & Altyazı:"
	 * etiketi ekranın sol ucuna, rozetler sağ ucuna savruluyor, aralarında
	 * telefon ekranını boydan boya kaplayan bir boşluk kalıyordu. Satıra
	 * `gap` eklemek yetmiyor — `gap` yalnızca öğeler YAN YANA dururken
	 * işe yarar, `space-between` onları uçlara yapıştırdığı için aradaki
	 * mesafeyi kapatmaz.
	 *
	 * Çözüm: `space-between` kaldırıldı. Etiket sola yaslanır, rozetler
	 * etiketin hemen sağında sabit `gap` ile durur; sığmayan rozetler
	 * `flexWrap` ile alt satıra iner (taşma yok).
	 */
	audioSubtitleRow: {
		flexDirection: "row",
		flexWrap: "wrap",
		borderWidth: 1,
	},
	audioLeft: {
		flexDirection: "row",
		alignItems: "center",
		/** Etiket ezilmesin, fazla rozetler alt satıra insin. */
		flexShrink: 0,
	},
	audioLabel: {
		fontWeight: "600",
	},
	audioChips: {
		flexDirection: "row",
		flexWrap: "wrap",
		/** Tek satıra sığdığında sağa yaslı, sığmazsa kendi içinde sarar. */
		justifyContent: "flex-end",
		flexShrink: 1,
	},
	audioChip: {
		borderWidth: 1,
	},
	audioChipText: {
		fontWeight: "600",
	},

	/* Sekmeler (Tab Bar) */
	tabBar: {
		flexDirection: "row",
		borderBottomWidth: 1,
	},
	tabItem: {
		position: "relative",
	},
	tabItemActive: {},
	tabWithBadge: {
		flexDirection: "row",
		alignItems: "center",
	},
	tabText: {},
	tabCountBadge: {
		backgroundColor: "rgba(100, 116, 139, 0.25)",
	},
	tabCountText: {
		fontWeight: "700",
		color: "#94a3b8",
	},
	tabIndicator: {
		position: "absolute",
		bottom: -1,
		left: 0,
		right: 0,
		height: 3,
		borderRadius: 2,
		backgroundColor: "#E50914",
	},

	/* Sekme İçi Özel Alanlar */
	episodesTabContainer: {
		paddingTop: 4,
	},
	relatedTabContainer: {
		paddingTop: 4,
	},

	/* Detay Bilgileri Tablosu */
	detailsTableCard: {
		borderWidth: 1,
	},
	detailsRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
	detailsLabel: {
		fontWeight: "500",
	},
	detailsValue: {
		fontWeight: "700",
	},
	detailsDivider: {
		height: 1,
		width: "100%",
	},

	/* Kayan Liste/Kitaplık Butonu (FAB) */
	floatingBookmark: {
		position: "absolute",
		bottom: 24,
		right: 20,
		width: 48,
		height: 48,
		borderRadius: 24,
		borderWidth: 1,
		justifyContent: "center",
		alignItems: "center",
		shadowColor: "#E50914",
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.35,
		shadowRadius: 8,
		elevation: 8,
		zIndex: 99,
	},
});
