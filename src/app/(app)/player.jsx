import VideoPlayer from "@/components/player/VideoPlayer";
import { extractVideoSources, fetchPluginDetail } from "@/services/api";
import {
	LIVE_ERROR_REASON,
	fetchLiveStreams,
	oynatilabilirAkislaraCevir,
} from "@/services/liveApi";
import { addToWatchHistory, getContinueWatching } from "@/utils/storage";
import { resetBrightness } from "@/utils/deviceControls";
import {
	lockPlayerOrientation,
	restoreAppOrientation,
} from "@/utils/orientation";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import TVPressable from "@/components/common/TVPressable";
import {
	ActivityIndicator,
	BackHandler,
	StyleSheet,
	Text,
	View,
} from "react-native";

/**
 * Sezon/bölüm numarasını içerik URL'sinden çıkarır.
 *
 * ⚠️ Neden gerekli: bölüm bağlantısı doğrudan (arama sonucu, favoriler,
 * paylaşılan link) açılabiliyor. Bu durumda `params.season` /
 * `params.episode` BOŞ gelir, `seriesInfo` de sezon/bölüm taşımaz ve
 * izleme geçmişine `season` / `episode` alanları boş yazılır → profil
 * ekranında "S1:B4" etiketi gösterilemez.
 *
 * Desteklenen yaygın desenler:
 *   .../sezon-1/bolum-2/     .../sezon/1/bolum/2
 *   .../season-1/episode-2
 *
 * @param {string} url
 * @returns {{season?: number, episode?: number}}
 */
function seasonEpisodeFromUrl(url) {
	if (typeof url !== "string" || url.length === 0) return {};
	const s = Number(
		url.match(/\bsezon[-\/](\d+)/i)?.[1] ??
			url.match(/\bseason[-\/](\d+)/i)?.[1],
	);
	const e = Number(
		url.match(/\bbolum[-\/](\d+)/i)?.[1] ??
			url.match(/\bepisode[-\/](\d+)/i)?.[1],
	);
	return {
		...(Number.isInteger(s) && s > 0 ? { season: s } : {}),
		...(Number.isInteger(e) && e > 0 ? { episode: e } : {}),
	};
}

export default function PlayerScreen() {
	const params = useLocalSearchParams();
	const router = useRouter();
	const targetUrl = params.url;
	const title = params.title || "Video";
	const subtitle = params.subtitle || "";
	const poster = params.poster || null;
	const contentId = params.id || null;
	const contentType = params.type || (params.episode ? "episode" : "movie");
	const [dynamicNextEpisode, setDynamicNextEpisode] = useState(null);
	/*
	 * ── Canlı TV dalı ──
	 *
	 * `params.live` = kanal slug'ı (`live/[id].jsx` → `handleStreamPress`).
	 * Doluluğu bir "canlı yayın modu" bayrağı gibi kullanıyoruz: film/dizi
	 * akışı `params.url` ile gelir ve canlı TV'nin `url` parametresi YOKTUR,
	 * çünkü adresi kanal değil, `fetchLiveStreams` cevabındaki akış kaydıdır.
	 * `isCanli` bu yüzden `!targetUrl`'den değil `params.live`'dan türetilir:
	 * aksi halde "adres yok" hatasını "canlı TV" sanardık.
	 */
	const liveKanalId = params.live || null;
	const isCanli = Boolean(liveKanalId);
	/*
	 * Başlangıç akışı indeksi. `live/[id].jsx` ekranda gördüğü sıranın
	 * `index`'ini gönderiyor ve diziyi yeniden sıralamamamızı KAPATAN bir
	 * kararla bunu yapmamızı da yazdırmış: sırayı değiştirirsek
	 * TrackSelectionModal'daki liste ekrandaki listeden farklılaşır ve
	 * otomatik yedek geçişi kullanıcının seçtiği akışa değil, başka bir
	 * akışa düşer. Bu yüzden sıra korunur, oynatıcıya başlangıç indeksi
	 * verilir (`initialSourceIndex`) ve kopma olursa YEDEK GEÇİŞİ bu
	 * indeksten devam eder.
	 *
	 * `Number(...)` geçersiz/NaN dönerse 0'a düşürülür: sıra dışı bir
	 * indeks, sessizce "ilk akıştan başla" demekten kötüdür.
	 */
	const liveBaslangicIndeks = (() => {
		if (!isCanli) return 0;
		const ham = Number(params.liveStreamIndex);
		return Number.isInteger(ham) && ham >= 0 ? ham : 0;
	})();
	const seriesInfo = useMemo(() => {
		let base = null;
		if (params.seriesInfo) {
			base =
				typeof params.seriesInfo === "string"
					? JSON.parse(params.seriesInfo)
					: params.seriesInfo;
		} else if (params.seriesId || params.season || params.episode) {
			base = {
				seriesId: params.seriesId || params.id,
				seriesTitle: params.seriesTitle || params.title,
				seriesUrl:
					params.seriesUrl ||
					(params.seriesId &&
					(String(params.seriesId).startsWith("http") ||
						String(params.seriesId).startsWith("/"))
						? params.seriesId
						: undefined),
				plugin: params.plugin,
				season: params.season ? Number(params.season) : undefined,
				episode: params.episode ? Number(params.episode) : undefined,
				episodeTitle: params.episodeTitle,
				totalEpisodes: params.totalEpisodes
					? Number(params.totalEpisodes)
					: undefined,
				nextEpisode: params.nextEpisode
					? typeof params.nextEpisode === "string"
						? JSON.parse(params.nextEpisode)
						: params.nextEpisode
					: undefined,
			};
		}
		if (base && !base.nextEpisode && dynamicNextEpisode) {
			return { ...base, nextEpisode: dynamicNextEpisode };
		}
		return base;
	}, [
		params.seriesInfo,
		params.seriesId,
		params.seriesUrl,
		params.plugin,
		params.season,
		params.episode,
		params.id,
		params.title,
		params.seriesTitle,
		params.episodeTitle,
		params.totalEpisodes,
		params.nextEpisode,
		dynamicNextEpisode,
	]);
	// Eğer sonraki bölüm bilgisi gelmediyse, dizi detayından otomatik hesapla
	useEffect(() => {
		if (contentType !== "episode") return;
		if (params.nextEpisode) return;
		const sUrl =
			params.seriesUrl ||
			(params.seriesId && String(params.seriesId).startsWith("http")
				? params.seriesId
				: null) ||
			(targetUrl && String(targetUrl).includes("/dizi/")
				? targetUrl.replace(/\/sezon-\d+\/bolum-\d+.*$/, "")
				: null);
		const pName = params.plugin;
		const currSeason = params.season ? Number(params.season) : 1;
		const currEpisode = params.episode ? Number(params.episode) : 1;
		if (sUrl && pName) {
			fetchPluginDetail(pName, sUrl)
				.then((detail) => {
					const seasons = detail?.seasons;
					if (seasons && typeof seasons === "object") {
						const currList =
							seasons[String(currSeason)] || seasons[currSeason] || [];
						if (Array.isArray(currList)) {
							const idx = currList.findIndex(
								(e) => Number(e.episode || e.episode_number) === currEpisode,
							);
							if (idx !== -1 && idx + 1 < currList.length) {
								const nextObj = currList[idx + 1];
								setDynamicNextEpisode({
									id: nextObj.id || nextObj.url,
									url: nextObj.url,
									title: nextObj.title,
									season: currSeason,
									episode: Number(
										nextObj.episode ||
											nextObj.episode_number ||
											currEpisode + 1,
									),
									poster: nextObj.poster || poster,
								});
							} else {
								const nextSeasonList = seasons[String(currSeason + 1)];
								if (
									Array.isArray(nextSeasonList) &&
									nextSeasonList.length > 0
								) {
									const nextObj = nextSeasonList[0];
									setDynamicNextEpisode({
										id: nextObj.id || nextObj.url,
										url: nextObj.url,
										title: nextObj.title,
										season: currSeason + 1,
										episode: Number(
											nextObj.episode || nextObj.episode_number || 1,
										),
										poster: nextObj.poster || poster,
									});
								}
							}
						}
					}
				})
				.catch((err) => {
					console.warn("player.jsx nextEpisode çözme hatası:", err);
				});
		}
	}, [
		contentType,
		params.nextEpisode,
		params.seriesUrl,
		params.seriesId,
		params.plugin,
		params.season,
		params.episode,
		targetUrl,
		poster,
	]);
	const [initialTime, setInitialTime] = useState(
		params.currentTime ? Number(params.currentTime) : 0,
	);
	const [sources, setSources] = useState([]);
	// Canlı TV'de `targetUrl` yoktur; yalnız `loading`'in bu yüzden `false`
	// başlaması ekranı "bağlantı bulunamadı" hatasında açardı.
	const [loading, setLoading] = useState(Boolean(targetUrl || liveKanalId));
	const [error, setError] = useState(
		!targetUrl && !liveKanalId
			? "Oynatılacak video bağlantısı bulunamadı."
			: null,
	);
	useEffect(() => {
		async function checkResumePosition() {
			/*
			 * Canlı yayında "kaldığın yerden devam et" YOKTUR. Kanal
			 * yayını her an baştan akar; bir resume değeri oynatıcıyı
			 * pencerenin dışına (veya çok geriye) sıçratırdı. Üstelik
			 * `getContinueWatching()` bir AsyncStorage okuması — canlı TV
			 * açılışında gereksiz.
			 */
			if (isCanli) return;
			if (params.currentTime) {
				setInitialTime(Number(params.currentTime));
				return;
			}
			try {
				const continueData = await getContinueWatching();
				const match = continueData.find(
					(item) =>
						item.id === (contentId || targetUrl) ||
						(targetUrl && item.url === targetUrl),
				);
				if (match && match.currentTime > 10) {
					setInitialTime(match.currentTime);
				}
			} catch (err) {
				console.error("Resume pozisyonu kontrol edilirken hata:", err);
			}
		}
		checkResumePosition();
	}, [contentId, targetUrl, params.currentTime, isCanli]);
	/**
	 * Kaynakları getirir: film/dizi → extractor, canlı TV → M3U akışları.
	 *
	 * ───────────────────────────
	 * ⚠️ CANLI TV EXTRACTOR ZİNCİRİNE GİRMEZ.
	 *
	 * Film/dizi yolunda `extractVideoSources(url)` backend'e
	 * `/api/extract` isteği atar: sunucu `load_item()` → `load_links()`
	 * kazıma zincirini çalıştırır, gömülü oynatıcıyı açar, iframe'i
	 * çözer ve HLS adresini geri döndürür. Canlı TV'de bu zincirin
	 * HİÇBİR ADIMI YOKTUR: `Core/Live` bir `PluginBase` DEĞİLDİR, içerik
	 * sayfası yoktur ve kanal adresi M3U listesinden doğrudan gelir.
	 * Dolayısıyla `/api/extract` çağırmak yalnızca 404 + gereksiz bir tur
	 * demektir; doğru uç `/api/live/streams/{id}`'dir. Bu, ilk mesajdaki
	 * mimari kararın (canlı TV ayrı bir alt sistemdir) FRONTEND karşılığıdır.
	 * ───────────────────────────
	 *
	 * Dönüş `{ kaynaklar, hata }`: hata `null` yerine makine tarafı
	 * `LIVE_ERROR_REASON` taşır, çünkü 404 ("kanal yok — tekrar denemenin
	 * anlamı yok") ile 503/ağ hatası ("yeniden dene") farklı mesaj ister.
	 *
	 * `toPlayerSources` iki eleme yapar: `url` taşımayan satırları ve
	 * HLS OLMAYAN adresleri (web sayfası/YouTube izleme sayfası) atar.
	 * İlk eleme eskiden vardı — tek bir akışın ölü olması listenin
	 * tamamını düşürmez, oynatıcı sıradakini dener. İkinci eleme oynatıcıya
	 * HTML girmesini engeller; onsız ExoPlayer 23002 ("Input does not start
	 * with the #EXTM3U header") basar ve "HLS sanılan mp4" denemesi de
	 * onu kurtaramaz (bkz. `@/utils/hlsUrl`).
	 *
	 * Bir kanalın TÜM akışları elendiğinde bu ayrım önemlidir:
	 * `kaynakHatasi` `null` (istek başarılıydı) döner, ama kullanıcıya
	 * "sunucu akış göndermedi" demek YANLIŞ olur. O yüzden aşağıda elenen
	 * adet de taşınır ve mesaj ayrımı yapılır.
	 *
	 * @returns {Promise<{ kaynaklar: Array, hata: string|null,
	 *                     elenen: number }>}
	 */
	const kaynaklariGetir = useCallback(async () => {
		if (!isCanli) {
			const extracted = await extractVideoSources(targetUrl);
			return { kaynaklar: extracted, hata: null, elenen: 0 };
		}
		const sonuc = await fetchLiveStreams(liveKanalId);
		if (!sonuc?.ok) {
			return { kaynaklar: [], hata: sonuc?.reason || null, elenen: 0 };
		}
		const { kaynaklar, elenen } = oynatilabilirAkislaraCevir(sonuc.streams);
		return { kaynaklar, hata: null, elenen };
	}, [isCanli, liveKanalId, targetUrl]);
	/** Makine tarafı hata sınıfını kullanıcı metnine çevirir. */
	const canliHataMesaji = useCallback(
		(reason) =>
			reason === LIVE_ERROR_REASON.NOT_FOUND
				? "Kanal bulunamadı."
				: "Bu kanal için yayın akışı alınamadı.",
		[],
	);
	/**
	 * Boş kaynak listesinin kullanıcı metnini ÜÇ AYRI ANLAMI ayırt ederek
	 * TEK yerden üretir.
	 *
	 * ⚠️ Neden ayrı fonksiyon: bu kararı YERDE İKİ AYRI YERDE kopyalamak
	 * (bir kez açılış `useEffect`'inde, bir kez "Tekrar Dene" düğmesinde)
	 * tam olarak bu dosyanın başındaki uyarının konusu: iki kopya
	 * ayrışırsa birinde "yayın adresi geçersiz" görünürken diğerinde
	 * "yayın akışı alınamadı" görünür ve hangi mesajın doğru olduğu
	 * belirsizleşir.
	 *
	 *   · `!isCanli`        → film/dizi yolu
	 *   · `elenen > 0`      → sunucu akış GÖNDERDİ ama hepsi web sayfasıydı.
	 *                         Bu bir yayın kesintisi DEĞİL, M3U'da
	 *                         düzeltilecek bir satırdır; ayrı söylenmeli.
	 *   · `kaynakHatasi`    → istek başarısız (404 / ağ / sunucu)
	 *
	 * @param {string|null} kaynakHatasi
	 * @param {number} elenen - `hlsOynatilabilirMi` filtresinin attığı akış sayısı
	 * @returns {string}
	 */
	const kaynakHatasiMesaji = useCallback(
		(kaynakHatasi, elenen) => {
			if (!isCanli) return "Bu içerik için video kaynağı bulunamadı.";
			if (elenen > 0)
				return "Bu kanalın yayın adresi geçersiz. Lütfen daha sonra tekrar deneyin.";
			return canliHataMesaji(kaynakHatasi);
		},
		[isCanli, canliHataMesaji],
	);
	const loadSources = useCallback(async () => {
		if (!targetUrl && !liveKanalId) {
			setError("Oynatılacak video bağlantısı bulunamadı.");
			setLoading(false);
			return;
		}
		try {
			setLoading(true);
			setError(null);
			const {
				kaynaklar: extracted,
				hata: kaynakHatasi,
				elenen,
			} = await kaynaklariGetir();
			if (Array.isArray(extracted) && extracted.length > 0) {
				setSources(extracted);
				// Canlı TV izleme geçmişine yazılmaz (bkz. `VideoPlayer`
				// → `isLive` yorumu: bölüm/süre kavramı yok).
				if (isCanli) return;
				// Add to watch history (recent play)
				if (contentId || title) {
					/*
					 * ⚠️ Sezon/bölüm yedeği.
					 *
					 * `seriesInfo` yalnızca dizi sayfasından gelindiğinde
					 * doludur. Bölüm bağlantısı doğrudan açıldığında
					 * (arama/favoriler/paylaşım) `params.season` ve
					 * `params.episode` boş gelir ve profil ekranında
					 * "S1:B4" etiketi gösterilemez. URL'den türetiyoruz.
					 */
					const sezonBolum = seasonEpisodeFromUrl(targetUrl);
					if (contentType === "episode") {
						addToWatchHistory({
							id: contentId || targetUrl,
							title: seriesInfo?.seriesTitle || title,
							seriesTitle: seriesInfo?.seriesTitle || title,
							seriesId: seriesInfo?.seriesId,
							season: seriesInfo?.season ?? sezonBolum.season,
							episode: seriesInfo?.episode ?? sezonBolum.episode,
							episodeTitle: seriesInfo?.episodeTitle,
							poster,
							type: "episode",
							url: targetUrl,
							totalEpisodes: seriesInfo?.totalEpisodes,
							overview: subtitle,
							plugin: params.plugin || seriesInfo?.plugin,
						}).catch(() => {});
					} else {
						addToWatchHistory({
							id: contentId || targetUrl,
							title,
							poster,
							type: "movie",
							url: targetUrl,
							overview: subtitle,
							plugin: params.plugin || seriesInfo?.plugin,
						}).catch(() => {});
					}
				}
			} else {
				setError(kaynakHatasiMesaji(kaynakHatasi, elenen));
			}
		} catch (err) {
			console.error("Player loadSources error:", err);
			setError("Video kaynakları alınırken bir hata oluştu.");
		} finally {
			setLoading(false);
		}
	}, [
		targetUrl,
		liveKanalId,
		isCanli,
		contentId,
		title,
		subtitle,
		poster,
		contentType,
		seriesInfo,
		params.plugin,
		kaynaklariGetir,
		kaynakHatasiMesaji,
	]);
	useEffect(() => {
		// Video oynatıcı açıldığında yatay moda kilitlenir, çıkarken
		// uygulamanın "temel" yönüne döner (TV'de yatay — bkz. sorun 7).
		lockPlayerOrientation().catch(() => {});
		return () => {
			restoreAppOrientation();
		};
	}, []);
	useEffect(() => {
		if (!targetUrl && !liveKanalId) return;
		let isMounted = true;
		kaynaklariGetir()
			.then(({ kaynaklar: extracted, hata: kaynakHatasi, elenen }) => {
				if (!isMounted) return;
				if (Array.isArray(extracted) && extracted.length > 0) {
					setSources(extracted);
					// Canlı TV izleme geçmişine yazılmaz: ne bölüm ne süre
					// vardır, "Kaldığın Yerden Devam Et" satırı da üretilmez.
					if (isCanli) return;
					if (contentId || title) {
						addToWatchHistory({
							id: contentId || targetUrl,
							title,
							poster,
							overview: subtitle,
							plugin: params.plugin || seriesInfo?.plugin,
						}).catch(() => {});
					}
				} else {
					setError(kaynakHatasiMesaji(kaynakHatasi, elenen));
				}
			})
			.catch((err) => {
				if (!isMounted) return;
				console.error("Player loadSources error:", err);
				setError("Video kaynakları alınırken bir hata oluştu.");
			})
			.finally(() => {
				if (isMounted) setLoading(false);
			});
		return () => {
			isMounted = false;
		};
	}, [
		targetUrl,
		liveKanalId,
		isCanli,
		contentId,
		title,
		subtitle,
		poster,
		params.plugin,
		seriesInfo,
		kaynaklariGetir,
		kaynakHatasiMesaji,
	]);
	const handleClose = useCallback(() => {
		/*
		 * ⚠️ Pencere parlaklığını oynatıcıdan ÇIKARKEN temizle.
		 *
		 * `window.attributes.screenBrightness` yalnızca Activity yok
		 * olunca sıfırlanır; ekran kapanırken Activity yaşamaya devam
		 * eder, bu yüzden ekran çıkışta kısık kalıyordu.
		 *
		 * `VideoPlayer`'ın unmount temizliği de bunu yapıyor; burada
		 * ikinci bir güvence. Expo Router `Stack` ekranı mount durumunu
		 * KORUYABİLDİĞİ için unmount tetiklenmeyebilir. `resetBrightness`
		 * idempotent olduğundan iki kez çağrılmak zararsızdır.
		 */
		resetBrightness();
		restoreAppOrientation();
		router.back();
	}, [router]);
	// Yükleme veya hata ekranındayken kumanda Geri tuşuyla çıkış
	useEffect(() => {
		if (loading || error) {
			const onBackPress = () => {
				handleClose();
				return true;
			};
			const sub = BackHandler.addEventListener(
				"hardwareBackPress",
				onBackPress,
			);
			return () => sub.remove();
		}
	}, [loading, error, handleClose]);
	return (
		<View style={styles.container}>
			<Stack.Screen options={{ headerShown: false }} />
			{loading && (
				<View style={styles.centerContainer}>
					<ActivityIndicator size="large" color="#FF3B30" />
					<Text style={styles.loadingTitle}>Video Kaynakları Taranıyor</Text>
					<Text style={styles.loadingSubtitle}>
						Lütfen bekleyin, en uygun yayın akışı hazırlanıyor...
					</Text>
					<TVPressable
						autoFocus={true}
						style={[styles.backButton, { marginTop: 32 }]}
						focusedStyle={styles.backButtonFocused}
						onPress={handleClose}
					>
						<Ionicons name="arrow-back" size={20} color="#FFFFFF" />
						<Text style={styles.backButtonText}>Vazgeç</Text>
					</TVPressable>
				</View>
			)}
			{!loading && error && (
				<View style={styles.centerContainer}>
					<Ionicons name="alert-circle-outline" size={60} color="#FF453A" />
					<Text style={styles.errorTitle}>Kaynak Bulunamadı</Text>
					<Text style={styles.errorDescription}>{error}</Text>
					<View style={styles.errorButtonsRow}>
						<TVPressable
							autoFocus={true}
							style={styles.retryButton}
							focusedStyle={styles.retryButtonFocused}
							onPress={loadSources}
						>
							<Ionicons name="refresh" size={18} color="#FFFFFF" />
							<Text style={styles.buttonText}>Tekrar Dene</Text>
						</TVPressable>
						<TVPressable
							style={styles.backButton}
							focusedStyle={styles.backButtonFocused}
							onPress={handleClose}
						>
							<Ionicons name="arrow-back" size={18} color="#FFFFFF" />
							<Text style={styles.buttonText}>Geri Dön</Text>
						</TVPressable>
					</View>
				</View>
			)}
			{!loading && !error && sources.length > 0 && (
				<VideoPlayer
					sources={sources}
					title={title}
					subtitle={subtitle}
					poster={poster}
					onClose={handleClose}
					initialTime={initialTime}
					contentId={contentId || targetUrl}
					contentType={contentType}
					seriesInfo={seriesInfo}
					targetUrl={targetUrl}
					plugin={params.plugin || seriesInfo?.plugin}
					/*
					 * Canlı TV modu: iki bayrak birlikte gider.
					 * `isLive` → seek/süre arayüzü gizlenir, izleme
					 *   geçmişi yazılmaz (canlıda "neredeyse izliyorum"
					 *   diye bir konum yoktur).
					 * `initialSourceIndex` → kullanıcının kanal ekranında
					 *   seçtiği akıştan başlar, kopmada yedek geçiş listeden
					 *   devam eder (sıra KORUNUR, yeniden sıralama yok).
					 * Film/dizi yolunda ikisi de 0/false → davranış aynı.
					 */
					isLive={isCanli}
					initialSourceIndex={liveBaslangicIndeks}
				/>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: "#000000",
	},
	centerContainer: {
		flex: 1,
		backgroundColor: "#0B0E14",
		justifyContent: "center",
		alignItems: "center",
		paddingHorizontal: 28,
	},
	loadingTitle: {
		color: "#FFFFFF",
		fontSize: 18,
		fontWeight: "700",
		marginTop: 20,
	},
	loadingSubtitle: {
		color: "#8E8E93",
		fontSize: 14,
		textAlign: "center",
		marginTop: 8,
		lineHeight: 20,
	},
	errorTitle: {
		color: "#FFFFFF",
		fontSize: 20,
		fontWeight: "700",
		marginTop: 16,
	},
	errorDescription: {
		color: "#8E8E93",
		fontSize: 14,
		textAlign: "center",
		marginTop: 8,
		marginBottom: 28,
		lineHeight: 20,
	},
	errorButtonsRow: {
		flexDirection: "row",
		gap: 12,
	},
	retryButton: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		backgroundColor: "#FF3B30",
		paddingHorizontal: 20,
		paddingVertical: 12,
		borderRadius: 12,
		borderWidth: 2,
		borderColor: "transparent",
	},
	retryButtonFocused: {
		borderColor: "#FFFFFF",
		transform: [{ scale: 1.08 }],
	},
	backButton: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		backgroundColor: "rgba(255, 255, 255, 0.12)",
		paddingHorizontal: 20,
		paddingVertical: 12,
		borderRadius: 12,
		borderWidth: 2,
		borderColor: "transparent",
	},
	backButtonFocused: {
		borderColor: "#FF3B30",
		backgroundColor: "rgba(255, 59, 48, 0.3)",
		transform: [{ scale: 1.08 }],
	},
	buttonText: {
		color: "#FFFFFF",
		fontSize: 14,
		fontWeight: "600",
	},
	backButtonText: {
		color: "#FFFFFF",
		fontSize: 14,
		fontWeight: "600",
	},
});
