/**
 * Canlı TV — ANA EKRAN
 *
 * Backend'de film/dizi scraper'larından TAMAMEN AYRI bir alt sistem
 * (`Core/Live`) var; `/api/live/*` uçları auth gerektirmez. Bu ekran o
 * alt sistemin giriş kapısı: 138 kanal, 7 kategori.
 *
 * ── Bu ekran SEKME DEĞİL ──────────────────────────────────────────
 * `router.push` ile açılır, dolayısıyla `BottomNavigation` YOKTUR
 * (kullanıcı açıkça istemedi ve alt navigasyon yalnızca sekme
 * ekranlarında var). Üstte geri düğmesi duruyor; `router.back()` denenir,
 * geçmiş yoksa ana ekrana `replace` edilir (bkz. `category.jsx`).
 *
 * ── Arama SUNUCUDA ────────────────────────────────────────────────
 * Filtreleme `q` parametresiyle sunucuya bırakıldı. Backend aksan/harf
 * duyarsız normalize ediyor; istemcide ikinci bir normalize yazmak
 * "TRT" için iki farklı yorum doğurur ve hangisinin doğru olduğunu
 * kimse bilemez (bkz. `apiClient.getMe` yorumundaki "iki kaynaklı gerçek"
 * dersi). Girdi 300 ms debounce'lanır: her tuşta istek atmak mobil
 * bağlantıda pahalı, debounce olmadan beklemekse kullanıcı "donuyor"
 * sanır.
 *
 * ── Program rehberi (EPG) YOK ─────────────────────────────────────
 * Bilinçli karar: backend EPG dönmüyor ve istenmedi. Kullanıcı "şu an ne
 * oynuyor" bilgisini GÖRMEYECEK. Bu ekranda uydurma program satırı
 * üretmek, uygulamanın geri kalanından bu kadar farklı bir davranış
 * olurdu. Kanaldan ne oynadığını öğrenmenin tek dürüst yolu yayının
 * kendisi (oynatıcı) veya sağlayıcının kendi rehberi.
 *
 * ── Sütun sayısı ──────────────────────────────────────────────────
 * İki bilgiden hesaplanır: `Platform.isTV` ve ÖLÇÜLEN içerik genişliği.
 *
 * ⚠️ `Dimensions.get("window")` KULLANILMAZ. Modül yüklenirken bir kez
 * ölçülür, ekran döndüğünde (`onLayout` sözleşmesi gereği yeni ölçüm
 * gelir) ve TV'de sol navigasyon rayının (56px) kapladığı alanı içermez.
 * `onLayout` gerçek içerik kutusunu verdiği için hem TV'de hem tablette
 * doğru sütun sayısı çıkar.
 *
 * Hedef kart genişliği platforma göre değişir:
 *   • TV   → 76dp. 1920px TV ekranı çoğu Android TV'de 960dp raporlanır;
 *            ray (56) + kenar boşluğu (28) düşülünce 876dp kalır ve
 *            (876+10)/(76+10) = 10 sütun çıkar. İstenen "10×18 gibi geniş
 *            ızgara" bu değerle birebir tutarlı.
 *   • Diğer → 104dp. 360dp telefon: 332dp içerik → (332+10)/(104+10) = 3
 *            sütun. İstenen "mobilde 3" aynı şekilde birebir.
 *
 * 1×960dp raporlayan (density 1) bazı Android TV cihazlarında 21 sütun
 * çıkabilecek hesap; bu yüzden üst sınır 10. Sabit sütun sayısı TV'de
 * 21 kartı da göstermekten iyi: kartlar okunur kalır ve tek ekranda
 * gezinme yapılabilir.
 *
 * ── Durum makinesi ────────────────────────────────────────────────
 * `yukleniyor` tek bayrak, ama ekran mantığı AYRI: spinner yalnızca
 * liste BOŞKEN gösterilir. Kategori değiştirirken eski liste ekranda
 * kalır ve altta küçük bir "yenileniyor" satırı döner. Böylece (a) hata
 * halinde sonsuza dek dönen spinner yok — hata kendi görünümüne
 * geçer, (b) her kategori değişiminde ekran boşalıp dolmaz.
 */

import CategoryRail from "@/components/live/CategoryRail";
import ChannelCard from "@/components/live/ChannelCard";
import ChannelCardSkeleton from "@/components/live/ChannelCardSkeleton";
import TVPressable from "@/components/common/TVPressable";
import { useNavLayout } from "@/hooks/useNavLayout";
import { useFocusCentering } from "@/hooks/useFocusCentering";
import { useTvMetrics } from "@/utils/tvMetrics";
import {
	CANLI_TV_KATEGORI_TUMU,
	LIVE_ERROR_REASON,
	fetchLiveCategories,
	fetchLiveChannels,
} from "@/services/liveApi";
import { ColorsM3, ScreenGutter } from "@/constants/theme";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { Stack, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
	ActivityIndicator,
	BackHandler,
	FlatList,
	Platform,
	StatusBar,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/** Sabit koyu palet — gerekçe `ChannelCard` dosya başında. */
const c = ColorsM3.dark;

/** Arama girdisinin sunucuya gitmeden önce bekleneceği süre (ms). */
const ARAMA_DEBOUNCE_MS = 300;

/** Kategori değişimi / arama sırasında eski listede ne kadar süre kalınır. */
const GRID_GAP = 10;

/** Platform hedef kart genişliği (dp) — bkz. dosya başındaki hesap. */
const HEDEF_KART = Platform.isTV ? 76 : 104;
const MIN_SUTUN = 3;
const MAX_SUTUN = 10;

/**
 * `liveApi` sonucunu tek biçime indirger.
 *
 * ⚠️ Başarı GÖVDESİ İKİ AİLEDE FARKLI:
 *   • `fetchLiveCategories()` → `{ ok:true, status, data:{ kategoriler } }`
 *   • `fetchLiveChannels()`   → `{ ok:true, status, data:{ channels } }`
 * Yani liste uçları veriyi `data` İÇİNDE, tekil kanal ucu ise düz
 * (`fetchLiveChannel`) döndürüyor. Ekranlar şemadan bağımsız olsun diye
 * `data ?? sonuc` ile açılıyor: iç içe ailede `data`, düz ailede `sonuc`
 * okunur. İkisi de zaten `veri` diye döner, geri kalan kod tek yol bilir.
 *
 * Hata ayrımı `liveApi` tarafında üretilmiş geliyor:
 *   `{ ok:false, status, reason, detail: string|null, retryable?, ... }`
 * Burada yalnızca `retryable` DEĞERDEŞLİĞİ tamamlanıyor: servis `retryable`
 * alanını YALNIZCA `server` dalında dolduruyor, `network`/`notfound`/
 * `badrequest` için ekran kendi kararını vermeli. Kritik olan ayrım:
 * `notfound` ve `badrequest` KALICIDIR — bunlarda "Tekrar Dene" önermek
 * çalışmayan bir düğmedir.
 *
 * @param {object|null} sonuc
 * @returns {{ok: true, veri: object} | {ok: false, reason: string,
 *            mesaj: string|null, retryable: boolean}}
 */
function liveSonuc(sonuc) {
	if (!sonuc) {
		return {
			ok: false,
			reason: LIVE_ERROR_REASON.NETWORK,
			mesaj: null,
			retryable: true,
		};
	}
	if (sonuc.ok === false) {
		const reason = sonuc.reason || LIVE_ERROR_REASON.SERVER;
		const gecici =
			reason === LIVE_ERROR_REASON.NETWORK ||
			reason === LIVE_ERROR_REASON.SERVER;
		return {
			ok: false,
			reason,
			// FastAPI'nin `{ detail: { mesaj } }` sarmalayıcısı `liveFetch`
			// içinde açılıp `detail`e YASSI metin olarak yazılıyor; sözlük
			// gelirse de okunabilsin diye iki biçim birden deneniyor.
			mesaj:
				(typeof sonuc.detail === "string"
					? sonuc.detail
					: sonuc.detail?.mesaj) || null,
			retryable: sonuc.retryable ?? gecici,
		};
	}
	return { ok: true, veri: sonuc.data ?? sonuc };
}

/** `reason`'u kullanıcı diline çeviren tek yer. */
function hataMesaji(hata) {
	if (hata?.mesaj) return hata.mesaj;
	switch (hata?.reason) {
		case LIVE_ERROR_REASON.NETWORK:
			return "Sunucuya ulaşılamıyor. Bağlantını kontrol et.";
		case LIVE_ERROR_REASON.SERVER:
			return "Kanal listesi şu an alınamıyor. Sunucu geçici olarak yanıt vermiyor.";
		case LIVE_ERROR_REASON.NOT_FOUND:
			return "Bu kanal bulunamadı.";
		case LIVE_ERROR_REASON.BAD_REQUEST:
			/*
			 * 400 = bilinmeyen kategori. Sunucudaki M3U yenilenmiş ve
			 * istemcimiz bayat kalınmışsa bu olur; "yenile" demek
			 * "tekrar dene" demekten daha doğru çünkü aynı kategori
			 * isteği tekrar 400 döner.
			 */
			return "Bu kategori artık sunucuda yok. Kategori listesi güncellenmeyi bekliyor.";
		default:
			return "Beklenmeyen bir hata oluştu.";
	}
}

export default function LiveScreen() {
	const router = useRouter();
	// Sol ray (TV / yatay tablet) varken içerik sola kayar — tüm ekranlar
	// aynı kararı vermek zorunda (bkz. hooks/useNavLayout.js).
	const { contentPaddingLeft } = useNavLayout();
	// TV: kanal ızgarası ortalanmış sütuna alınır (bkz. utils/tvMetrics.js).
	const { contentMaxWidth } = useTvMetrics();

	// ── Kategori ──────────────────────────────────────────────────
	const [kategoriler, setKategoriler] = useState([]);
	const [seciliKategori, setSeciliKategori] =
		useState(CANLI_TV_KATEGORI_TUMU);

	// ── Arama ─────────────────────────────────────────────────────
	/** Anlık: kullanıcının yazdığı metin (kutunun değeri). */
	const [arama, setArama] = useState("");
	/** Debounce'lanmış: sunucuya giden `q`. */
	const [aramaSorgusu, setAramaSorgusu] = useState("");

	// ── Kanal listesi ─────────────────────────────────────────────
	const [kanallar, setKanallar] = useState([]);
	const [yukleniyor, setYukleniyor] = useState(true);
	/** `{ reason, mesaj, retryable }` veya `null`. */
	const [hata, setHata] = useState(null);

	/** Ölçülen içerik genişliği (kenar boşluğu ve ray çıkarılmış). */
	const [icerikGenisligi, setIcerikGenisligi] = useState(0);

	// ── TV Odak Ortalama (Sorun 5) ──────────────────────────────────
	const onLayout = useCallback(
		(e) => {
			const w =
				e.nativeEvent.layout.width -
				contentPaddingLeft -
				ScreenGutter * 2;
			setIcerikGenisligi((prev) => (Math.abs(prev - w) < 0.5 ? prev : w));
		},
		[contentPaddingLeft],
	);

	// ── Sütun sayısı ──────────────────────────────────────────────
	const sutunSayisi = useMemo(() => {
		if (icerikGenisligi <= 0) return 0; // ölçüm yoksa ızgara render edilmez
		const ham = Math.floor(
			(icerikGenisligi + GRID_GAP) / (HEDEF_KART + GRID_GAP),
		);
		return Math.max(MIN_SUTUN, Math.min(MAX_SUTUN, ham));
	}, [icerikGenisligi]);

	const kartGenisligi = useMemo(() => {
		if (sutunSayisi <= 0) return 0;
		return (
			(icerikGenisligi - GRID_GAP * (sutunSayisi - 1)) / sutunSayisi
		);
	}, [icerikGenisligi, sutunSayisi]);

	/*
	 * SORUN 5 — odaklanan kanalın SATIRI ekranın dikey ortasına taşınır.
	 *
	 * Kart indeksi tek başına hedef olamaz: kartın bulunduğu satırın
	 * yatayda da görüş alanında olması gerekir. Bu yüzden satırın İLK
	 * kartına geçiş yapılır (`columns: sutunSayisi`).
	 */
	const {
		listRef,
		handleItemFocus: handleCardFocus,
		onScrollToIndexFailed,
		clearRetry,
	} = useFocusCentering({ columns: sutunSayisi });

	// Ekrandan çıkarken bekleyen "tekrar ortalama" zamanlayıcısını iptal et.
	useEffect(() => clearRetry, [clearRetry]);

	// ── Kategoriler (bir kez) ─────────────────────────────────────
	useEffect(() => {
		let iptal = false;

		async function kategorileriYukle() {
			try {
				const sonuc = liveSonuc(await fetchLiveCategories());
				if (iptal) return;
				if (sonuc.ok) {
					/*
					 * Sunucu `kategoriler` altında döndürüyor (doğrulanmış
					 * sözleşme); liste boş gelirse ray render edilmez ve
					 * seçim `CANLI_TV_KATEGORI_TUMU`da kalır — servis
					 * kategori verilmediğinde aynı değeri varsayılan olarak
					 * kullanıyor, yani liste yine dolar.
					 */
					const liste = Array.isArray(sonuc.veri?.kategoriler)
						? sonuc.veri.kategoriler
						: [];
					setKategoriler(liste);
					/*
					 * `tum` satırı listede yoksa (yalnız gerçek kategoriler
					 * dönerse) ilk gerçek kategoriye düşüyoruz; yoksa ray
					 * boş kalır ve liste hiç çekilmez.
					 */
					setSeciliKategori((onceki) =>
						onceki || (liste[0]?.id ?? ""),
					);
				} else {
					setHata(sonuc);
				}
			} catch (h) {
				if (!iptal) setHata({ ...liveSonuc(null), mesaj: h?.message });
			}
		}

		kategorileriYukle();
		return () => {
			iptal = true;
		};
	}, []);

	// ── Arama debounce ────────────────────────────────────────────
	useEffect(() => {
		const zamanlayici = setTimeout(
			() => setAramaSorgusu(arama.trim()),
			ARAMA_DEBOUNCE_MS,
		);
		return () => clearTimeout(zamanlayici);
	}, [arama]);

	// ── Kanal listesi (kategori + arama değişince) ─────────────────
	//
	// Ağ ile state uygulaması AYRILDI (bkz. `category.jsx`): aynı kod hem
	// ilk yükleme hem kategori değişimi hem "tekrar dene" için kullanılır.
	// `iptal` bayrağı, ekrandan çıkarken uçan isteğin unmount olmuş bir
	// bileşene setState uygulamasını engeller (derleyici `useEffect`
	// gövdesinde doğrudan setState'i reddettiği için veri çekme iç içe
	// async fonksiyona alındı).
	const kanallariYukle = useCallback(async () => {
		/*
		 * Yükleyici SAF olmalı: state'e dokunan tek yer çağıran taraftır
		 * (aşağıdaki `yukle` ve `handleRetry`). Burada `setKanallar` çağırmak
		 * "tekrar dene" yolunda listeyi gereksiz yere boşaltırdı.
		 *
		 * `seciliKategori` boşsa (kategori listesi yüklenemedi ve ray boş
		 * kaldı) sunucuya gitmek anlamsız — servis kategori verilmezse
		 * zaten "tum" varsayılanını kullanır, ama o zaman HİÇBİR şey
		 * göstermemek yerine bu hatayı yükseltmek dürüst davranış.
		 */
		if (!seciliKategori) {
			return {
				ok: false,
				reason: LIVE_ERROR_REASON.NOT_FOUND,
				mesaj: null,
				retryable: true,
			};
		}

		try {
			const sonuc = liveSonuc(
				await fetchLiveChannels({
					category: seciliKategori,
					q: aramaSorgusu || undefined,
				}),
			);
			if (!sonuc.ok) return sonuc;
			return {
				ok: true,
				veri: Array.isArray(sonuc.veri?.channels) ? sonuc.veri.channels : [],
			};
		} catch (h) {
			return { ...liveSonuc(null), mesaj: h?.message };
		}
	}, [seciliKategori, aramaSorgusu]);

	useEffect(() => {
		let iptal = false;

		async function yukle() {
			setYukleniyor(true);
			const sonuc = await kanallariYukle();
			if (iptal) return;
			setYukleniyor(false);
			if (sonuc.ok) {
				setKanallar(sonuc.veri);
				setHata(null);
			} else {
				setHata(sonuc);
			}
		}

		if (seciliKategori) yukle();
		return () => {
			iptal = true;
		};
	}, [seciliKategori, kanallariYukle]);

	// ── Geri ──────────────────────────────────────────────────────
	const handleBack = useCallback(() => {
		if (router.canGoBack()) router.back();
		else router.replace("/(app)");
	}, [router]);

	useEffect(() => {
		if (Platform.OS !== "android") return;
		const sub = BackHandler.addEventListener("hardwareBackPress", () => {
			handleBack();
			return true;
		});
		return () => sub.remove();
	}, [handleBack]);

	const handleRetry = useCallback(() => {
		/*
		 * Kategori/ara sorgusu değişmeden yeniden çekmek için sayaç yerine
		 * doğrudan aynı yükleyiciyi çağırıyoruz: `kanallariYukle` her iki
		 * girdiye de bağlı olduğu için ek bir "reload" state'i eklemek
		 * ikinci bir gerçek kaynak olurdu.
		 */
		setHata(null);
		(async () => {
			setYukleniyor(true);
			const sonuc = await kanallariYukle();
			setYukleniyor(false);
			if (sonuc.ok) {
				setKanallar(sonuc.veri);
			} else {
				setHata(sonuc);
			}
		})();
	}, [kanallariYukle]);

	const handleChannelPress = useCallback(
		(channel) => {
			if (!channel?.id) return;
			router.push({
				pathname: "/(app)/live/[id]",
				params: { id: String(channel.id) },
			});
		},
		[router],
	);

	const handleClearSearch = useCallback(() => {
		setArama("");
		// Debounce'u beklemeden listeyi hemen serbest bırakmak, kullanıcının
		// "X"e bastıktan sonra 300 ms boyunca yanlış sonucu görmesini önler.
		setAramaSorgusu("");
	}, []);

	const keyExtractor = useCallback((item) => item.id, []);

	const renderItem = useCallback(
		({ item, index }) => (
			<ChannelCard
				channel={item}
				width={kartGenisligi}
				onPress={() => handleChannelPress(item)}
				onFocus={() => handleCardFocus(index)}
			/>
		),
		[kartGenisligi, handleChannelPress, handleCardFocus],
	);

	const baslangicKategoriAdi = useMemo(
		() => kategoriler.find((k) => k.id === seciliKategori)?.name,
		[kategoriler, seciliKategori],
	);

	/*
	 * Görünüm kararları — üçü AYRI, spinner hiçbirini gölgelemiyor.
	 *
	 * ⚠️ `gosterHata` `!yukleniyor` koşulunu TAŞIMAZ. Kategori listesi
	 * başarısız olursa `seciliKategori` boş kalır, kanal yükleyicisi hiç
	 * çalışmaz ve `yukleniyor` true'da kalır; `!yukleniyor` koşulu
	 * ekranda HİÇBİR ŞEYin render edilmemesine (boş ekran) yol açardı.
	 * `hata` bir kez yazıldıktan sonra yükleme bitmiş demektir, dolayısıyla
	 * hata dalı kendi başına yeterlidir.
	 */
	const listeBos = kanallar.length === 0;
	const gosterYukleniyor = yukleniyor && listeBos && !hata;
	const gosterHata = Boolean(hata) && listeBos;
	const gosterBos = !yukleniyor && !hata && listeBos && sutunSayisi > 0;
	const gosterIzgara = sutunSayisi > 0 && (kanallar.length > 0 || yukleniyor);

	const renderBosDurum = () => (
		<View style={styles.center}>
			<Ionicons
				name={aramaSorgusu ? "search-outline" : "tv-outline"}
				size={44}
				color={c.onSurfaceVariant}
			/>
			<Text style={[styles.centerTitle, { color: c.onSurface }]}>
				{aramaSorgusu ? "Eşleşen kanal yok" : "Bu kategoride kanal yok"}
			</Text>
			<Text style={[styles.centerText, { color: c.onSurfaceVariant }]}>
				{aramaSorgusu
					? `"${aramaSorgusu}" için sonuç bulunamadı. Farklı bir kelime dene ya da aramayı temizle.`
					: "Seçili kategoride listelenecek kanal bulunamadı."}
			</Text>
			{aramaSorgusu ? (
				<TVPressable
					onPress={handleClearSearch}
					focusedStyle={styles.retryFocused}
					style={styles.retryBtn}>
					<Ionicons
						name="close-circle"
						size={16}
						color={c.primaryContainer}
					/>
					<Text
						style={[styles.retryText, { color: c.primaryContainer }]}>
						Aramayı Temizle
					</Text>
				</TVPressable>
			) : null}
		</View>
	);

	const renderHataDurumu = () => (
		<View style={styles.center}>
			<Ionicons
				name="cloud-offline-outline"
				size={44}
				color={c.onSurfaceVariant}
			/>
			<Text style={[styles.centerTitle, { color: c.onSurface }]}>
				Kanallar yüklenemedi
			</Text>
			<Text style={[styles.centerText, { color: c.onSurfaceVariant }]}>
				{hataMesaji(hata)}
			</Text>
			{hata?.retryable ? (
				<TVPressable
					autoFocus
					onPress={handleRetry}
					focusedStyle={styles.retryFocused}
					style={styles.retryBtn}>
					<Ionicons
						name="refresh"
						size={16}
						color={c.primaryContainer}
					/>
					<Text
						style={[styles.retryText, { color: c.primaryContainer }]}>
						Tekrar Dene
					</Text>
				</TVPressable>
			) : null}
		</View>
	);

	return (
		<>
			<Stack.Screen options={{ headerShown: false }} />
			<SafeAreaView
				edges={["top", "left", "right"]}
				onLayout={onLayout}
				style={[
					styles.safeArea,
					{
						backgroundColor: c.surfaceLowest,
						paddingLeft: contentPaddingLeft,
					},
				]}>
				{/*
				 * Palet sabit koyu olduğu için `barStyle` daima
				 * `light-content`; tema bağlamına bağlamak bu ekranda
				 * anlamsız.
				 */}
				<StatusBar barStyle="light-content" backgroundColor={c.surfaceLowest} />

				{/* Üst çubuk — geri + başlık + toplam */}
				<View
					style={[
						styles.topBar,
						{
							backgroundColor: c.surfaceLowest,
							borderBottomColor: `${c.surfaceContainerHigh}66`,
						},
					]}>
					<TVPressable
						onPress={handleBack}
						focusedStyle={styles.backFocused}
						style={[
							styles.backBtn,
							{ backgroundColor: `${c.surfaceContainerHigh}CC` },
						]}
						accessibilityLabel="Geri">
						<Ionicons name="arrow-back" size={21} color={c.onSurface} />
					</TVPressable>

					<View style={styles.topBarTitleWrap}>
						<Text
							style={[styles.topBarTitle, { color: c.onSurface }]}
							numberOfLines={1}>
							Canlı TV
						</Text>
						{/* Yalnızca sunucunun VERDİĞİ kategori sayısı gösterilir;
						    kanal toplamı kategoriye bağlı olduğu için burada
						    yazılmaz. */}
						<View
							style={[
								styles.countChip,
								{
									backgroundColor: c.surfaceContainerHigh,
									borderColor: c.outlineVariant,
								},
							]}>
							<Text style={[styles.countText, { color: c.tertiary }]}>
								{kategoriler.length} kategori
							</Text>
						</View>
					</View>
				</View>

				{/* Kategori rayı */}
				{/*
				 * Kategori değişiminde arama METNİ SİLİNMEZ. Kullanıcı
				 * "spor" filtreliyken başka bir kategoriye geçip aynı
				 * filtreyi sürdürmek isteyebilir; metni düşürürsek arama
				 * kutusu ile gerçek `q` arasındaki bağ kopar ve kullanıcı
				 * neden sonuç gelmediğini anlamaz. Bunun yerine başlık
				 * satırındaki sayaç, etkin filtreyi açıkça yazar.
				 */}
				<CategoryRail
					categories={kategoriler}
					selectedId={seciliKategori}
					onSelect={setSeciliKategori}
				/>

				{/* Arama kutusu — şekil `PlatformList`'ten, renkler M3'ten */}
				<View style={styles.searchWrap}>
					<View
						style={[
							styles.searchBox,
							{
								backgroundColor: c.surfaceContainer,
								borderColor: c.outlineVariant,
							},
						]}>
						<Ionicons
							name="search"
							size={17}
							color={c.onSurfaceVariant}
						/>
						<TextInput
							style={[styles.searchInput, { color: c.onSurface }]}
							placeholder="Kanal ara…"
							placeholderTextColor={`${c.onSurfaceVariant}99`}
							value={arama}
							onChangeText={setArama}
							returnKeyType="search"
							autoCapitalize="none"
							autoCorrect={false}
						/>
						{arama.length > 0 ? (
							<TVPressable
								onPress={handleClearSearch}
								focusedStyle={styles.searchClearFocused}
								accessibilityLabel="Aramayı temizle">
								<Ionicons
									name="close-circle"
									size={16}
									color={c.onSurfaceVariant}
								/>
							</TVPressable>
						) : null}
					</View>
				</View>

				{/* Liste başlığı */}
				{kanallar.length > 0 ? (
					<View style={styles.subHeader}>
						<Text
							style={[styles.subHeaderText, { color: c.onSurfaceVariant }]}>
							{kanallar.length} kanal
							{baslangicKategoriAdi ? ` • ${baslangicKategoriAdi}` : ""}
							{aramaSorgusu ? ` • "${aramaSorgusu}"` : ""}
						</Text>
					</View>
				) : null}

				{/* Gövde — üç ayrı durum + ızgara */}
				{gosterYukleniyor ? (
					/*
					 * Izgara iskeleti. Aynı `sutunSayisi` / `kartGenisligi`
					 * hesabını kullanıyor; kanallar geldiğinde birebir yerine
					 * oturuyor. Önceden "Kanallar yükleniyor" yazısı vardı —
					 * o metin yerine gerçek yerleşim çiziliyor.
					 */
					<View
						style={[
							styles.listContent,
							styles.listContentEmpty,
							contentMaxWidth
								? {
										alignSelf: "center",
										width: "100%",
										maxWidth: contentMaxWidth,
									}
								: null,
						]}
						pointerEvents="none">
						{Array.from({ length: sutunSayisi * 4 }).map((_, index) => (
							<View
								key={`sk-kanal-${index}`}
								style={{
									width: kartGenisligi,
									marginRight:
										(index % sutunSayisi) === sutunSayisi - 1
											? 0
											: GRID_GAP,
									marginBottom: GRID_GAP,
								}}>
								<ChannelCardSkeleton width={kartGenisligi} />
							</View>
						))}
					</View>
				) : gosterHata ? (
					renderHataDurumu()
				) : gosterIzgara ? (
					<FlatList
						ref={listRef}
						contentInsetAdjustmentBehavior="automatic"
						/*
						 * `numColumns` çalışma anında değişir (dönme / TV-mobil
						 * geçişi). React Native bunu desteklemez ve "Changing
						 * numColumns on the fly is not supported" uyarısı
						 * basıp ölçümü bozar; `key` ile liste kasten
						 * yeniden kurulur. Kayıp tek şey kaydırma konumu ve
						 * odak — ikisi de sütun sayısı değiştiğinde zaten
						 * anlamsız.
						 */
						key={`live-cols-${sutunSayisi}`}
						data={kanallar}
						renderItem={renderItem}
						keyExtractor={keyExtractor}
						numColumns={sutunSayisi}
						columnWrapperStyle={styles.row}
						contentContainerStyle={[
							styles.listContent,
							kanallar.length === 0 && styles.listContentEmpty,
							// TV: kanal ızgarası ortalanmış sütunda kalsın.
							contentMaxWidth
								? {
										alignSelf: "center",
										width: "100%",
										maxWidth: contentMaxWidth,
									}
								: null,
						]}
						showsVerticalScrollIndicator={false}
						onScrollToIndexFailed={onScrollToIndexFailed}
						/*
						 * `getItemLayout` YOK. Kategori ekranında (sonsuz
						 * kaydırma) kullanılıyor çünkü 20'şer sayfa geliyor;
						 * burada liste 138 kanalda BİTER ve kart yüksekliği
						 * kanal adının 1–2 satıra düşmesine göre değişir.
						 * Yanlış bir `getItemLayout` (yüksekliği olduğundan
						 * büyük hesaplayan) kaydırmayı zıplatırdı; 138
						 * elemanı sanallaştırmak zaten sorun değil.
						 */
						initialNumToRender={Platform.isTV ? 40 : 12}
						maxToRenderPerBatch={12}
						windowSize={7}
						/*
						 * `removeClippedSubviews` false: TV'de odaklı kartın
						 * detache olması kumanda odağını kaybettirir
						 * (bkz. `library.jsx` ana ızgara notu).
						 */
						removeClippedSubviews={false}
						// Yenileme sırasında eski liste ekranda kalıyor;
						// kaydırma sonuna gelen kullanıcı boş ekranla
						// karşılaşmasın diye altta küçük gösterge.
						ListFooterComponent={
							yukleniyor && kanallar.length > 0 ? (
								<View style={styles.footer}>
									<ActivityIndicator
										size="small"
										color={c.primaryContainer}
									/>
									<Text
										style={[
											styles.footerText,
											{ color: c.onSurfaceVariant },
										]}>
										Güncelleniyor…
									</Text>
								</View>
							) : null
						}
					/>
				) : gosterBos ? (
					renderBosDurum()
				) : null}
			</SafeAreaView>
		</>
	);
}

const styles = StyleSheet.create({
	safeArea: { flex: 1 },

	// Üst çubuk
	topBar: {
		height: 56,
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		paddingHorizontal: ScreenGutter,
		borderBottomWidth: 1,
	},
	backBtn: {
		width: 40,
		height: 40,
		borderRadius: 20,
		alignItems: "center",
		justifyContent: "center",
	},
	topBarTitleWrap: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		minWidth: 0,
	},
	topBarTitle: {
		fontSize: 18,
		lineHeight: 24,
		fontWeight: "700",
		letterSpacing: -0.2,
		flexShrink: 1,
	},
	countChip: {
		paddingHorizontal: 8,
		paddingVertical: 2,
		borderRadius: 999,
		borderWidth: 1,
	},
	countText: {
		fontSize: 11,
		lineHeight: 16,
		fontWeight: "700",
	},

	// Arama
	searchWrap: {
		paddingHorizontal: ScreenGutter,
		paddingTop: 12,
		paddingBottom: 4,
	},
	searchBox: {
		// Ölçü ve şekil `PlatformList`'ten birebir; yalnızca renkler M3
		// paletine taşındı (eski `#161b22` yerine `surfaceContainer`).
		flexDirection: "row",
		alignItems: "center",
		borderRadius: 12,
		paddingHorizontal: 12,
		height: 40,
		borderWidth: 1,
		gap: 8,
	},
	searchInput: {
		flex: 1,
		fontSize: 13,
	},
	searchClearFocused: {
		borderRadius: 999,
		backgroundColor: c.surfaceContainerHighest,
		transform: [{ scale: 1.12 }],
	},

	// Liste başlığı
	subHeader: {
		paddingHorizontal: ScreenGutter,
		paddingTop: 8,
		paddingBottom: 2,
	},
	subHeaderText: {
		fontSize: 11,
		lineHeight: 16,
		fontWeight: "600",
	},

	// Izgara
	listContent: {
		paddingHorizontal: ScreenGutter,
		paddingTop: 12,
		paddingBottom: 40,
		rowGap: GRID_GAP,
	},
	listContentEmpty: {
		flexGrow: 1,
		justifyContent: "center",
	},
	row: { gap: GRID_GAP },

	// Alt durumlar
	center: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		gap: 12,
		paddingHorizontal: 32,
	},
	centerTitle: {
		fontSize: 15,
		lineHeight: 20,
		fontWeight: "700",
		textAlign: "center",
	},
	centerText: {
		fontSize: 13,
		lineHeight: 18,
		textAlign: "center",
	},
	retryBtn: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		paddingHorizontal: 18,
		paddingVertical: 9,
		borderRadius: 999,
		borderWidth: 1,
		borderColor: c.primaryContainer,
		marginTop: 4,
	},
	retryText: {
		fontSize: 13,
		lineHeight: 18,
		fontWeight: "700",
	},
	footer: {
		alignItems: "center",
		justifyContent: "center",
		paddingVertical: 22,
		gap: 10,
	},
	footerText: {
		fontSize: 13,
		lineHeight: 18,
	},

	// TV odak — elevation yok (bkz. CategoryCard / ChannelCard notu)
	backFocused: { transform: [{ scale: 1.12 }] },
	retryFocused: {
		backgroundColor: c.surfaceContainerHigh,
		transform: [{ scale: 1.05 }],
	},
});