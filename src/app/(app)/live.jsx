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
 *   • TV   → 130dp. 1920px TV ekranı çoğu Android TV'de 960dp raporlanır;
 *            ray (56) + kenar boşluğu (28) düşülünce 876dp kalır ve
 *            (876+10)/(130+10) = 6 sütun çıkar.
 *   • Diğer → 128dp. 360dp telefon: 332dp içerik → (332+10)/(128+10) = 2
 *            sütun.
 *
 * Sütun sayısı üst sınırı 6: daha fazlası kartları logonun okunmadığı
 * küçük karelere çeviriyordu (eski tasarımın "demode" görünmesinin
 * sebeplerinden biri).
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
import FeaturedChannel from "@/components/live/FeaturedChannel";
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
import { FontFamily, Palette, ScreenGutter } from "@/constants/theme";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { Stack, useFocusEffect, useRouter } from "expo-router";
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

/** Arama girdisinin sunucuya gitmeden önce bekleneceği süre (ms). */
const ARAMA_DEBOUNCE_MS = 300;

/** Kategori değişimi / arama sırasında eski listede ne kadar süre kalınır. */
const GRID_GAP = 10;

/**
 * Platform hedef kart genişliği (dp).
 *
 * 4:3 yayın kutusu artık kare logodan daha geniş bir hedef ister:
 *   • TV   → ~130dp: 960dp raporlayan 1080p TV'de (ray + kenar düşünce
 *            ~872dp) 6 sütun çıkar; logolar okunur kalır.
 *   • Diğer → ~128dp: 360dp telefonda 2 sütun.
 * Sabit sütun sayısı yerine hedef GENİŞLİK kullanılıyor: kartlar her
 * ekranda aynı görsel ağırlıkta kalıyor.
 */
const HEDEF_KART = Platform.isTV ? 130 : 128;
const MIN_SUTUN = 2;
const MAX_SUTUN = 6;

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
	const { contentMaxWidth, sp, isWide, height } = useTvMetrics();

	// ── Kategori ──────────────────────────────────────────────────
	const [kategoriler, setKategoriler] = useState([]);
	const [seciliKategori, setSeciliKategori] =
		useState(CANLI_TV_KATEGORI_TUMU);

	// ── Arama ─────────────────────────────────────────────────────
	/** Anlık: kullanıcının yazdığı metin (kutunun değeri). */
	const [arama, setArama] = useState("");
	/** Debounce'lanmış: sunucuya giden `q`. */
	const [aramaSorgusu, setAramaSorgusu] = useState("");
	/** TV'de arama kutusuna odak geldiğinde kenarlık vurgulanır. */
	const [aramaOdakta, setAramaOdakta] = useState(false);

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

	// ODAK'a bağlı kayıt: ekran odakta değilken geri tuşunu yutmaz.
	useFocusEffect(
		useCallback(() => {
			if (Platform.OS !== "android") return;
			const sub = BackHandler.addEventListener("hardwareBackPress", () => {
				handleBack();
				return true;
			});
			return () => sub.remove();
		}, [handleBack]),
	);

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
	 * Vitrin kartı: seçili kategorinin İLK kanalı. Arama sırasında
	 * gösterilmez — kullanıcı zaten belirli bir sonuç arıyor ve vitrin
	 * ekranın üstünü gereksiz kaplardı.
	 */
	const oneCikan = useMemo(
		() => (aramaSorgusu ? null : kanallar[0] || null),
		[aramaSorgusu, kanallar],
	);
	/*
	 * Kısa ekranlarda (örn. yatay telefon, 720p TV) vitrin gizlenir:
	 * üst blok ızgaraya yer bırakmazsa ekran "sadece tanıtım" olur.
	 */
	const vitrin = isWide && height < 480 ? null : oneCikan;

	const renderArama = () => (
		<View
			style={[
				styles.searchBox,
				isWide && styles.searchBoxWide,
				{
					height: sp(46),
					borderRadius: sp(23),
					borderColor: aramaOdakta
						? Palette.primary
						: Palette.outlineVariant,
				},
			]}>
			<Ionicons
				name="search"
				size={sp(18)}
				color={Palette.onSurfaceVariant}
			/>
			<TextInput
				style={[
					styles.searchInput,
					{ color: Palette.onSurface, fontSize: sp(14) },
				]}
				placeholder="Kanal ara…"
				placeholderTextColor={`${Palette.onSurfaceVariant}99`}
				value={arama}
				onChangeText={setArama}
				onFocus={() => setAramaOdakta(true)}
				onBlur={() => setAramaOdakta(false)}
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
						color={Palette.onSurfaceVariant}
					/>
				</TVPressable>
			) : null}
		</View>
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
				color={Palette.onSurfaceVariant}
			/>
			<Text style={[styles.centerTitle, { color: Palette.onSurface }]}>
				{aramaSorgusu ? "Eşleşen kanal yok" : "Bu kategoride kanal yok"}
			</Text>
			<Text style={[styles.centerText, { color: Palette.onSurfaceVariant }]}>
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
						color={Palette.primary}
					/>
					<Text
						style={[styles.retryText, { color: Palette.primary }]}>
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
				color={Palette.onSurfaceVariant}
			/>
			<Text style={[styles.centerTitle, { color: Palette.onSurface }]}>
				Kanallar yüklenemedi
			</Text>
			<Text style={[styles.centerText, { color: Palette.onSurfaceVariant }]}>
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
						color={Palette.primary}
					/>
					<Text
						style={[styles.retryText, { color: Palette.primary }]}>
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
						backgroundColor: Palette.surfaceLowest,
						paddingLeft: contentPaddingLeft,
					},
				]}>
				{/*
				 * Palet sabit koyu olduğu için `barStyle` daima
				 * `light-content`; tema bağlamına bağlamak bu ekranda
				 * anlamsız.
				 */}
				<StatusBar barStyle="light-content" backgroundColor={Palette.surfaceLowest} />

				{/* Üst çubuk — geri + başlık (+ geniş ekranda arama) */}
				<View style={styles.topBar}>
					<TVPressable
						onPress={handleBack}
						focusedStyle={null}
						style={({ focused }) => [
							styles.backBtn,
							focused && styles.backFocused,
						]}
						accessibilityLabel="Geri">
						<Ionicons name="arrow-back" size={21} color={Palette.onSurface} />
					</TVPressable>

					<View style={styles.topBarTitleWrap}>
						<View style={styles.eyebrowRow}>
							<View style={styles.eyebrowDot} />
							<Text
								style={[styles.eyebrow, { fontSize: sp(10) }]}>
								CANLI YAYIN
							</Text>
						</View>
						<Text
							style={[
								styles.topBarTitle,
								{ color: Palette.onSurface, fontSize: sp(22) },
							]}
							numberOfLines={1}>
							Canlı TV
						</Text>
					</View>

					{isWide ? (
						<View style={styles.searchInline}>{renderArama()}</View>
					) : null}
				</View>

				{!isWide ? (
					<View style={styles.searchWrap}>{renderArama()}</View>
				) : null}

				{/* Vitrin: seçili kategorinin ilk kanalı */}
				{vitrin ? (
					<View style={styles.featuredWrap}>
						<FeaturedChannel
							channel={vitrin}
							categoryName={baslangicKategoriAdi}
							onPress={() => handleChannelPress(vitrin)}
						/>
					</View>
				) : null}

				{/* Kategori rayı */}
				{/*
				 * Kategori değişiminde arama METNİ SİLİNMEZ. Kullanıcı
				 * "spor" filtreliyken başka bir kategoriye geçip aynı
				 * filtreyi sürdürmek isteyebilir; metni düşürürsek arama
				 * kutusu ile gerçek `q` arasındaki bağ kopar ve kullanıcı
				 * neden sonuç gelmediğini anlamaz. Bölüm başlığındaki
				 * sayaç etkin filtreyi açıkça yazar.
				 */}
				<CategoryRail
					categories={kategoriler}
					selectedId={seciliKategori}
					onSelect={setSeciliKategori}
				/>

				{/* Liste başlığı */}
				{kanallar.length > 0 ? (
					<View style={styles.subHeader}>
						<Text
							style={[
								styles.subHeaderTitle,
								{ color: Palette.onSurface, fontSize: sp(15) },
							]}
							numberOfLines={1}>
							{baslangicKategoriAdi || "Kanallar"}
						</Text>
						<Text
							style={[
								styles.subHeaderText,
								{
									color: Palette.onSurfaceVariant,
									fontSize: sp(11),
								},
							]}
							numberOfLines={1}>
							{kanallar.length} kanal
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
							styles.skeletonGrid,
							contentMaxWidth
								? {
										alignSelf: "center",
										width: "100%",
										maxWidth: contentMaxWidth,
									}
								: null,
						]}
						pointerEvents="none">
						{Array.from({
							length: sutunSayisi * (isWide ? 2 : 3),
						}).map((_, index) => (
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
										color={Palette.primary}
									/>
									<Text
										style={[
											styles.footerText,
											{ color: Palette.onSurfaceVariant },
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
		minHeight: 58,
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		paddingHorizontal: ScreenGutter,
		paddingTop: 4,
	},
	backBtn: {
		width: 36,
		height: 36,
		borderRadius: 18,
		alignItems: "center",
		justifyContent: "center",
		borderWidth: 2,
		borderColor: "transparent",
	},
	topBarTitleWrap: {
		flex: 1,
		minWidth: 0,
	},
	eyebrowRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
	},
	eyebrowDot: {
		width: 6,
		height: 6,
		borderRadius: 3,
		backgroundColor: "#ff5b6e",
	},
	eyebrow: {
		color: Palette.onSurfaceVariant,
		lineHeight: 14,
		fontFamily: FontFamily.bold,
		letterSpacing: 1.4,
	},
	topBarTitle: {
		lineHeight: 30,
		fontFamily: FontFamily.bold,
		letterSpacing: -0.5,
	},

	// Arama
	searchInline: {
		flexShrink: 1,
		width: "36%",
		minWidth: 240,
		maxWidth: 420,
		paddingLeft: 12,
	},
	searchWrap: {
		paddingHorizontal: ScreenGutter,
		paddingTop: 10,
		paddingBottom: 2,
	},
	searchBox: {
		// Diğer ekranlardaki arama hapıyla aynı dil: dolgu yüzey + ince kenar.
		flexDirection: "row",
		alignItems: "center",
		borderWidth: 1,
		paddingHorizontal: 14,
		gap: 8,
		backgroundColor: Palette.surfaceLow,
	},
	searchBoxWide: {
		width: "100%",
	},
	searchInput: {
		flex: 1,
		paddingVertical: 0,
	},
	searchClearFocused: {
		borderRadius: 999,
		borderWidth: 2,
		borderColor: Palette.primary,
	},

	// Vitrin
	featuredWrap: {
		paddingHorizontal: ScreenGutter,
		paddingTop: 6,
	},

	// Liste başlığı
	subHeader: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 12,
		paddingHorizontal: ScreenGutter,
		paddingTop: 6,
		paddingBottom: 2,
	},
	subHeaderTitle: {
		fontFamily: FontFamily.bold,
		letterSpacing: -0.2,
		flexShrink: 1,
	},
	subHeaderText: {
		fontFamily: FontFamily.medium,
		flexShrink: 1,
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
	skeletonGrid: {
		flexDirection: "row",
		flexWrap: "wrap",
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
		fontFamily: FontFamily.bold,
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
		borderWidth: 2,
		borderColor: Palette.primary,
		marginTop: 4,
	},
	retryText: {
		fontSize: 13,
		lineHeight: 18,
		fontFamily: FontFamily.bold,
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

	// TV odak — yalnız kenarlık (tasarım kuralı: ölçek/dolgu yok)
	backFocused: {
		borderWidth: 2,
		borderColor: Palette.primary,
	},
	retryFocused: {
		borderWidth: 2,
		borderColor: Palette.primary,
	},
});