/**
 * Canlı TV — KANAL DETAY
 *
 * `live.jsx` ızgarasındaki bir karttan açılır (`/(app)/live/[id]`).
 * Kanalın meta verisini ve — kritik olan — AKIŞ LİSTESİNİ gösterir.
 *
 * ── Neden akış listesi ayrı bir uçla değil, `fetchLiveChannel` ile ──
 * `/api/live/{id}` hem `channel` hem `streams` döndürüyor. İki ayrı istek
 * atmak yerine tek istek: kullanıcı detay ekranını açtığında iki uç arası
 * yarış (biri geldi diğeri gelmedi) mümkün değil.
 *
 * ── `liveStreamIndex` neden var ───────────────────────────────────
 * Oynatıcıya SADECE bir URL değil, "hangi akıştan başla" indeksi
 * gönderiyoruz. Sebebi: canlı HLS yayınları sık kopar ve oynatıcının
 * otomatik olarak bir sonraki akışa geçebilmesi için elinde TÜM akış
 * listesi ve bir başlangıç noktası olmalı. `fetchLiveStreams(id)` liste
 * vermek için ayrı bir uç olarak duruyor; oynatıcı bu parametreyle
 * başlangıç akışını seçer, kopma olursa listedeki sıradakine geçer.
 *
 * ⚠️ DİZİYE SIRALAMA YAPILMAZ. Backend `streams[]` dizisini
 * `primary → backup → alt` sırasında ve `quality_score`'a göre
 * önceliklendirilmiş olarak veriyor; ekranda diziyi YENİDEN SIRALAMAK
 * gönderdiğimiz indeksi yanlış akışa işaret ederdi. Dizi olduğu gibi
 * oynatıcıya gider, ekranla oynatıcı aynı sırayı görür.
 *
 * ── Program rehberi (EPG) YOK ─────────────────────────────────────
 * Bilinçli karar (bkz. `live.jsx` başlığı): uydurma "şu an şu oynuyor"
 * satırı üretmiyoruz. Kullanıcı bunu yayının kendisinden öğrenir.
 *
 * ── 404 / 503 ayrımı ──────────────────────────────────────────────
 * `/api/live/{id}` bilinmeyen kanal için 404, kaynak geçici olarak
 * erişilemezken 503 (`{ detail: { mesaj, retryable: true } }` +
 * `Retry-After: 30`) döner. İkisi farklı eylem ister: 404'te "tekrar
 * dene" işe yaramaz, 503'te gereklidir. Bu yüzden `retryable` ayrımı
 * ekranda korunuyor ve 404 durumunda doğrudan geri öneriliyor.
 *
 * ── Kategori adı neden ayrıca çekiliyor ──────────────────────────
 * Kanal gövdesinde `category` ALAN KODUDUR (`"spor"`), kullanıcıya
 * gösterilecek ad ("Canlı Spor") yalnızca kategori listesinde var. Adı
 * dosyada sabit bir sözlükle uydurmak, backend kategori adını değiştirdiğinde
 * sessizce yanlış metin göstermek demek. 7 elemanlık cevap (görece
 * ucuz) tek doğruluk kaynağı olarak okunuyor; okunamazsa ham kod
 * gösterilir, yine uydurma yok.
 */

import TVPressable from "@/components/common/TVPressable";
import {
	LIVE_ERROR_REASON,
	fetchLiveCategories,
	fetchLiveChannel,
} from "@/services/liveApi";
import { ColorsM3, ScreenGutter } from "@/constants/theme";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import {
	Stack,
	useLocalSearchParams,
	useRouter,
} from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
	ActivityIndicator,
	BackHandler,
	Platform,
	ScrollView,
	StatusBar,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/** Sabit koyu palet — gerekçe `ChannelCard` dosya başında. */
const c = ColorsM3.dark;

/** Abonelik rozeti sarısı — `ChannelCard` ile aynı ton. */
const PAY_TV_YELLOW = "#F5C518";

/**
 * `liveApi` sonucunu tek biçime indirger.
 *
 * ⚠️ Bu normalleştirici `live.jsx`'tekiyle BİREBİR AYNI olmalı; iki ekran
 * iki ayrı hata eşiği yazarsa birinde "Tekrar Dene" görünürken diğerinde
 * görünmez. Bu yüzden üçüncü bir yardımcı dosyası yerine kopyalama tercih
 * edildi (bkz. `live.jsx` açıklaması).
 *
 * Doğrulanmış sözleşme:
 *   • `fetchLiveChannel(id)` → `{ ok:true, status, channel, streams, total }`
 *     DÜZ zarf. `liveApi.js` artık TÜM başarı dönüşlerini düz veriyor
 *     (`kategoriler`/`channels` de `data` altında değil); bu ekrandaki
 *     `data ?? sonuc` açılımı yine de güvenli kalır çünkü düz zarfın
 *     `.data` alanı yoktur ve `sonuc`'a düşer.
 *   • hata → `{ ok:false, status, reason, detail: string|null, retryable? }`
 *     `retryable` yalnızca `server` dalında gelir.
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
			// içinde açılıp `detail`e YASSI metin olarak yazılıyor.
			mesaj:
				(typeof sonuc.detail === "string"
					? sonuc.detail
					: sonuc.detail?.mesaj) || null,
			retryable: sonuc.retryable ?? gecici,
		};
	}
	return { ok: true, veri: sonuc.data ?? sonuc };
}

/**
 * `reason`'u kullanıcı diline çeviren tek yer.
 * Backend'in kendi mesajı varsa o önceliklidir — kanal kaynaklarına özgü
 * bir 503 mesajı, genel bir "sunucu yanıt vermiyor" cümlesinden daha
 * yardımcıdır.
 */
function hataMesaji(hata) {
	if (hata?.mesaj) return hata.mesaj;
	switch (hata?.reason) {
		case LIVE_ERROR_REASON.NETWORK:
			return "Sunucuya ulaşılamıyor. Bağlantını kontrol et.";
		case LIVE_ERROR_REASON.NOT_FOUND:
			return "Bu kanal artık yayında olmayabilir veya adres değişmiş olabilir. Listeden başka bir kanal seçebilirsin.";
		case LIVE_ERROR_REASON.BAD_REQUEST:
			return "Kanal adresi geçersiz. Listeden tekrar seçmelisin.";
		default:
			return "Sunucu şu an yanıt vermiyor. Biraz sonra tekrar dene.";
	}
}

/** `kind` → ekranda görünen ad + ikon. Backend üç değer gönderiyor. */
const KIND_META = {
	primary: { ad: "Ana Yayın", ikon: "radio-button-on" },
	backup: { ad: "Yedek Akış", ikon: "albums-outline" },
	alt: { ad: "Alternatif", ikon: "shuffle-outline" },
};

/** Tanınmayan `kind` için güvenli varsayılan — akış yine listelenir. */
const KIND_VARSAYILAN = { ad: "Akış", ikon: "ellipse-outline" };

/**
 * Alt bilgi metni.
 *
 * JS sabiti olarak tutuluyor çünkü JSX metnine yazıldığında Türkçe
 * kesme işaretleri (`kanalın`, `sağlayıcının`) `react/no-unescaped-entities`
 * kuralına takılıyor. Metnin tek kaynağı burada olması ayrıca ileride
 * `count` değişirse (örn. "138" yerine canlı toplam) tek yerden
 * güncellenebilmesini sağlıyor.
 */
const ABONELIK_NOTU =
	"138 kanalın çoğu resmi CDN'den HLS yayınıdır. Abonelik rozetli kanallar için ilgili sağlayıcının aboneliği gerekir.";

export default function LiveChannelScreen() {
	const { id } = useLocalSearchParams();
	const router = useRouter();

	/*
	 * `useLocalSearchParams` değeri `string | string[]` olabilir (yol
	 * parametresi tekrarlanırsa dizi döner). Oyun gibi bir id'yi
	 * `encodeURIComponent`'e uğratmamak için önce tek string'e indiriliyor
	 * (aynı yaklaşım: `category.jsx`).
	 */
	const kanalId = typeof id === "string" ? id : "";

	const [kanal, setKanal] = useState(null);
	const [akislar, setAkislar] = useState([]);
	/** `{ reason, mesaj, retryable }` veya `null`. */
	const [hata, setHata] = useState(null);

	/** Kategori kodu → görünen ad. Aşağıdaki açıklama için bkz. */
	const [kategoriAdlari, setKategoriAdlari] = useState({});

	// ── Kategori adları (kanal yüklenmeden paralel) ────────────────
	useEffect(() => {
		let iptal = false;

		async function kategorileriYukle() {
			try {
				const sonuc = liveSonuc(await fetchLiveCategories());
				if (iptal || !sonuc.ok) return;
				const liste = Array.isArray(sonuc.veri?.kategoriler)
					? sonuc.veri.kategoriler
					: Array.isArray(sonuc.veri?.categories)
						? sonuc.veri.categories
						: [];
				setKategoriAdlari(
					Object.fromEntries(
						liste
							.filter((k) => k?.id && k?.name)
							.map((k) => [k.id, k.name]),
					),
				);
			} catch {
				// Kategori adı çözülemezse ham kod gösterilir; bu ekranın
				// kanal verisiyle ilgisi yok, hata YUTULUR.
			}
		}

		kategorileriYukle();
		return () => {
			iptal = true;
		};
	}, []);

	// ── Kanal + akışlar ───────────────────────────────────────────
	//
	// Ağ ile state uygulaması ayrı: `kanaliYukle` hem ilk yükleme hem
	// "tekrar dene" için kullanılır (bkz. `category.jsx` deseni).
	// `iptal` bayrağı uçan isteğin unmount olmuş bileşene yazmasını engeller.
	const kaniYukle = useCallback(async () => {
		if (!kanalId) {
			return { ok: false, reason: "notfound", retryable: false };
		}
		try {
			const sonuc = liveSonuc(await fetchLiveChannel(kanalId));
			if (!sonuc.ok) return sonuc;
			const veri = sonuc.veri || {};
			/*
			 * 200 ama `channel` boş → kanal yok. `yukleniyor` TÜRETİLMİŞ bir
			 * değer olduğu için (`kanal` ve `hata` ikisi de boşken
			 * "yükleniyoruz"), buraya 200-`null` yazmak ekranda
			 * SONSUZA KADAR dönen bir gösterge bırakırdı. Bu yüzden aynı
			 * durumu bir hata gibi döndürüyoruz: kullanıcı "bulunamadı"
			 * görür ve listeden başka kanal seçebilir.
			 */
			if (!veri.channel) {
				return {
					ok: false,
					reason: "notfound",
					mesaj: null,
					retryable: false,
				};
			}
			return {
				ok: true,
				kanal: veri.channel,
				akislar: Array.isArray(veri.streams) ? veri.streams : [],
			};
		} catch (h) {
			return { ...liveSonuc(null), mesaj: h?.message };
		}
	}, [kanalId]);

useEffect(() => {
		/*
		 * Hedeften id gelmediyse istek ATILMAZ. Yükleme göstergesi `state`
		 * değil TÜRETİLMİŞ bir değer (aşağıda `yukleniyor`), dolayısıyla
		 * burada kapatılacak bir bayrak yok: eksik hedef kendiliğinden
		 * "bulunamadı" dalına düşüyor.
		 */
		if (!kanalId) return;

		let iptal = false;

		async function yukle() {
			const sonuc = await kaniYukle();
			if (iptal) return;
			if (sonuc.ok) {
				setKanal(sonuc.kanal);
				setAkislar(sonuc.akislar);
				setHata(null);
			} else {
				setHata(sonuc);
			}
		}

		yukle();
		return () => {
			iptal = true;
		};
	}, [kanalId, kaniYukle]);

	// ── Geri ──────────────────────────────────────────────────────
	const handleBack = useCallback(() => {
		if (router.canGoBack()) router.back();
		else router.replace("/(app)/live");
	}, [router]);

	useEffect(() => {
		if (Platform.OS !== "android") return;
		const sub = BackHandler.addEventListener("hardwareBackPress", () => {
			handleBack();
			return true;
		});
		return () => sub.remove();
	}, [handleBack]);

	/*
	 * "Tekrar Dene": hatayı düşürüyoruz, `yukleniyor` TÜRETİLMİŞ olduğu için
	 * spinner kendiliğinden geri geliyor — ayrı bir `setYukleniyor(true)`
	 * çağrısı gerekmiyor (ve effect içinde setState'e yol açardı).
	 */
	const handleRetry = useCallback(() => {
		setHata(null);
		(async () => {
			const sonuc = await kaniYukle();
			if (sonuc.ok) {
				setKanal(sonuc.kanal);
				setAkislar(sonuc.akislar);
			} else {
				setHata(sonuc);
			}
		})();
	}, [kaniYukle]);

	/**
	 * Akışı oynatıcıya gönder.
	 *
	 * `liveStreamIndex` dizin olarak gönderiliyor (bkz. dosya başı). `index`
	 * ekranda görünen sırayla birebir aynı olduğu için burada bir "hangi
	 * akışı seçtiğim" durumu tutmaya gerek yok.
	 */
	const handleStreamPress = useCallback(
		(_akism, index) => {
			router.push({
				pathname: "/(app)/player",
				params: {
					live: kanalId,
					liveStreamIndex: String(index),
					title: kanal?.name || "Canlı",
					poster: kanal?.logo || undefined,
				},
			});
		},
		[router, kanalId, kanal],
	);

	const kategoriAdi = useMemo(
		() =>
			kategoriAdlari[kanal?.category] ||
			kanal?.category ||
			"bilinmiyor",
		[kategoriAdlari, kanal],
	);

	const isPayTv = Boolean(kanal?.is_paytv);

	/*
	 * ── TÜRETİLMİŞ durum ──────────────────────────────────────────
	 *
	 * Yükleme bayrağı state DEĞİL: `kanal` ve `hata` ikisi de boşken
	 * "yükleniyoruz" demektir. Böylece effect gövdesinde setState'e
	 * gerek kalmıyor (cascading render) ve şu yarar var: hata set edildiği
	 * anda gösterge kendiliğinden kapanır — 503 sonrası "sonsuza dek dönen
	 * spinner" senaryosu yapısal olarak imkânsız.
	 */
	const eksikHedef = !kanalId;
	const yukleniyor = !eksikHedef && !kanal && !hata;
	/**
	 * Hedeften id hiç gelmediyse sunucuya gitmedik: bu da bir 404
	 * durumudur ve "tekrar dene" yerine doğrudan "listeye dön" gösterilir.
	 */
	const hataGorunur = eksikHedef
		? {
				reason: "notfound",
				retryable: false,
				mesaj: "Kanal adresi eksik. Listeden bir kanal seçmelisin.",
			}
		: !yukleniyor && hata
			? hata
			: null;

	// ══ 404 / 503 / hata ═══════════════════════════════════════════
	if (hataGorunur) {
		const h = hataGorunur;
		const notFound = h.reason === "notfound";

		return (
			<>
				<Stack.Screen options={{ headerShown: false }} />
				<SafeAreaView
					edges={["top", "left", "right"]}
					style={[styles.safeArea, { backgroundColor: c.surfaceLowest }]}>
					<StatusBar
						barStyle="light-content"
						backgroundColor={c.surfaceLowest}
					/>
					<TopBar onBack={handleBack} title={kanal?.name || "Kanal"} />

					<View style={styles.center}>
						<Ionicons
							name={
								notFound
									? "help-buoy-outline"
									: "cloud-offline-outline"
							}
							size={44}
							color={c.onSurfaceVariant}
						/>
						<Text
							style={[styles.centerTitle, { color: c.onSurface }]}>
							{notFound ? "Kanal bulunamadı" : "Kanal yüklenemedi"}
						</Text>
						<Text
							style={[styles.centerText, { color: c.onSurfaceVariant }]}>
							{hataMesaji(h)}
						</Text>

						{/* 404'te "tekrar dene" yanıltıcı olurdu; yalnız geri. */}
						{h.retryable ? (
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
						) : (
							<TVPressable
								autoFocus
								onPress={handleBack}
								focusedStyle={styles.retryFocused}
								style={styles.retryBtn}>
								<Ionicons
									name="arrow-back"
									size={16}
									color={c.primaryContainer}
								/>
								<Text
									style={[styles.retryText, { color: c.primaryContainer }]}>
									Listeye Dön
								</Text>
							</TVPressable>
						)}
					</View>
				</SafeAreaView>
			</>
		);
	}

	// ══ Yükleniyor ═════════════════════════════════════════════════
	//
	// Hata ve yükleme AYRI dallar: hata dalında spinner YOK (aksi halde
	// 503 sonrası sonsuza dek dönen bir gösterge kalırdı).
	if (yukleniyor || !kanal) {
		return (
			<>
				<Stack.Screen options={{ headerShown: false }} />
				<SafeAreaView
					edges={["top", "left", "right"]}
					style={[styles.safeArea, { backgroundColor: c.surfaceLowest }]}>
					<StatusBar
						barStyle="light-content"
						backgroundColor={c.surfaceLowest}
					/>
					<TopBar onBack={handleBack} title="Kanal" />
					<View style={styles.center}>
						<ActivityIndicator color={c.primaryContainer} />
						<Text
							style={[styles.centerText, { color: c.onSurfaceVariant }]}>
							Kanal yükleniyor…
						</Text>
					</View>
				</SafeAreaView>
			</>
		);
	}

	// ══ Kanal ══════════════════════════════════════════════════════
	return (
		<>
			<Stack.Screen options={{ headerShown: false }} />
			<SafeAreaView
				edges={["top", "left", "right"]}
				style={[styles.safeArea, { backgroundColor: c.surfaceLowest }]}>
				<StatusBar
					barStyle="light-content"
					backgroundColor={c.surfaceLowest}
				/>
				<TopBar
					onBack={handleBack}
					title={kanal.name || "Kanal"}
					subtitle={`${kategoriAdi} • ${akislar.length} akış`}
				/>

				{/*
				 * ScrollView: akış sayısı küçük (primary + birkaç yedek +
				 * alternatif) ve liste bitiyor — sanallaştırma burada yalnız
				 * ek yük olurdu.
				 */}
				<ScrollView
					showsVerticalScrollIndicator={false}
					contentContainerStyle={styles.scroll}>
					{/* Kanal başlığı */}
					<View style={styles.head}>
						<View
							style={[
								styles.logoBox,
								{
									backgroundColor: c.surfaceContainerHigh,
									borderColor: c.outlineVariant,
								},
							]}>
							{kanal.logo ? (
								<Image
									source={{ uri: kanal.logo }}
									style={styles.logo}
									contentFit="contain"
									contentPosition="center"
									transition={0}
									cachePolicy="memory-disk"
								/>
							) : (
								<Ionicons
									name="tv-outline"
									size={34}
									color={c.onSurfaceVariant}
								/>
							)}
						</View>

						<View style={styles.headText}>
							<Text
								style={[styles.channelName, { color: c.onSurface }]}
								numberOfLines={2}>
								{kanal.name || "Kanal"}
							</Text>

							<View style={styles.headMetaRow}>
								<Text
									style={[
										styles.headMeta,
										{ color: c.onSurfaceVariant },
									]}>
									{kategoriAdi}
								</Text>
								{kanal.lang ? (
									<>
										<Text
											style={[
												styles.headMetaDot,
												{ color: c.outline },
											]}>
											•
										</Text>
										<Text
											style={[
												styles.headMeta,
												{ color: c.onSurfaceVariant },
											]}>
											{String(kanal.lang).toUpperCase()}
										</Text>
									</>
								) : null}
							</View>

							{/* Abonelik rozeti — karttaki rozetten daha ayrıntılı,
							    çünkü burada metin yer alabiliyor. */}
							{isPayTv ? (
								<View
									style={[
										styles.payPill,
										{
											backgroundColor: `${PAY_TV_YELLOW}26`,
											borderColor: PAY_TV_YELLOW,
										},
									]}>
									<Ionicons
										name="lock-closed"
										size={11}
										color={PAY_TV_YELLOW}
									/>
									<Text
										style={[styles.payPillText, { color: PAY_TV_YELLOW }]}>
										Abonelik gerektiren kanal
									</Text>
								</View>
							) : null}
						</View>
					</View>

					{/* Akış listesi */}
					<Text
						style={[
							styles.sectionTitle,
							{ color: c.onSurfaceVariant },
						]}>
						AKIŞLAR
					</Text>

					{akislar.length === 0 ? (
						<View
							style={[
								styles.streamEmpty,
								{
									backgroundColor: c.surfaceContainer,
									borderColor: c.outlineVariant,
								},
							]}>
							<Ionicons
								name="alert-circle-outline"
								size={20}
								color={c.onSurfaceVariant}
							/>
							<Text
								style={[
									styles.streamEmptyText,
									{ color: c.onSurfaceVariant },
								]}>
								Bu kanal için şu anda çözülebilir bir yayın
								adresi yok. Kanal listede kalıyor ama kaynağı
								geçici olarak erişilemez olabilir.
							</Text>
						</View>
					) : (
						<View style={styles.streamList}>
							{akislar.map((akis, index) => (
								<StreamRow
									key={akis.url || `${index}`}
									akis={akis}
									index={index}
									onPress={handleStreamPress}
								/>
							))}
						</View>
					)}

					{/*
					 * Alt bilgi — 138 kanalın bir kısmının neden açılmadığını
					 * açıklamak için. `is_paytv` kanallar LİSTEDE kalıyor
					 * (gizlemiyoruz; gizlemek "kayıp veri" olurdu), rozetle
					 * işaretleniyor. Kullanıcı bu satırla, açılmayan kanalın
					 * uygulama hatası değil abonelik duvarı olduğunu anlar.
					 */}
					<View
						style={[
							styles.infoBox,
							{
								backgroundColor: c.surfaceContainer,
								borderColor: c.outlineVariant,
							},
						]}>
						<Ionicons
							name="information-circle-outline"
							size={16}
							color={c.tertiary}
						/>
						<Text style={[styles.infoText, { color: c.onSurfaceVariant }]}>
							{ABONELIK_NOTU}
						</Text>
					</View>
				</ScrollView>
			</SafeAreaView>
		</>
	);
}

// ════════════════════════════════════════════════════════════════
// Alt bileşenler
// ════════════════════════════════════════════════════════════════

/** Üst çubuk — geri düğmesi + başlık (+ isteğe bağlı alt satır). */
function TopBar({ onBack, title, subtitle }) {
	return (
		<View
			style={[
				styles.topBar,
				{
					backgroundColor: c.surfaceLowest,
					borderBottomColor: `${c.surfaceContainerHigh}66`,
				},
			]}>
			<TVPressable
				onPress={onBack}
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
					{title}
				</Text>
				{subtitle ? (
					<Text
						style={[styles.topBarSub, { color: c.onSurfaceVariant }]}
						numberOfLines={1}>
						{subtitle}
					</Text>
				) : null}
			</View>
		</View>
	);
}

/**
 * Tek akış satırı.
 *
 * `kind` rozeti yayının ROLÜNÜ anlatır (ana / yedek / alternatif) ve
 * kullanıcının bir koptuğunda neden başka seçenek olduğunu gösterir.
 * `quality` yalnızca varsa gösterilir — kalite bilgisi olmayan bir
 * akışta rozet uydurmuyoruz.
 *
 * `is_live: false` ayrıca işaretlenir: bu akış şu an yayında değil
 * demektir ve kullanıcının neden ses gelmediğini açıklar.
 */
function StreamRow({ akis, index, onPress }) {
	const meta = KIND_META[akis?.kind] || KIND_VARSAYILAN;
	const quality = akis?.quality ? String(akis.quality) : null;
	const kaliteVar = Boolean(akis?.quality_score);

	return (
		<TVPressable
			style={[
				styles.streamRow,
				{
					backgroundColor: c.surfaceContainer,
					borderColor: c.outlineVariant,
				},
			]}
			focusedStyle={styles.streamFocused}
			onPress={() => onPress(akis, index)}
			accessibilityLabel={`${meta.ad}${quality ? `, ${quality}` : ""}${akis?.label ? `, ${akis.label}` : ""}`}>
			{({ focused }) => (
				<View style={styles.streamInner}>
					<View
						style={[
							styles.kindBadge,
							akis?.kind === "primary" && styles.kindBadgePrimary,
						]}>
						<Ionicons
							name={meta.ikon}
							size={11}
							color={
								akis?.kind === "primary"
									? c.onPrimaryContainer
									: c.onSurfaceVariant
							}
						/>
						<Text
							style={[
								styles.kindText,
								akis?.kind === "primary" && styles.kindTextPrimary,
							]}>
							{meta.ad}
						</Text>
					</View>

					<View style={styles.streamInfo}>
						{akis?.label ? (
							<Text
								style={[
									styles.streamLabel,
									{
										color: focused
											? c.primaryContainer
											: c.onSurface,
									},
								]}
								numberOfLines={1}>
								{akis.label}
							</Text>
						) : (
							<Text
								style={[
									styles.streamLabel,
									{
										color: focused
											? c.primaryContainer
											: c.onSurface,
									},
								]}
								numberOfLines={1}>
								Akış {index + 1}
							</Text>
						)}

						{/*
						 * Kalite satırı YALNIZCA backend kalite gönderdiyse
						 * görünür. `quality_score` sayısal bir öncelik
						 * puanıdır, ekranda "1080p" gibi bir çözünürlük
						 * diye YAZILMAZ — bu bir uydurma olurdu.
						 */}
						{quality || kaliteVar || akis?.yt_id || akis?.is_live === false ? (
							<View style={styles.streamTags}>
								{quality ? (
									<Text
										style={[
											styles.streamTag,
											{ color: c.tertiary },
										]}>
										{quality}
									</Text>
								) : null}
								{akis?.yt_id ? (
									<Text
										style={[styles.streamTag, { color: c.onSurfaceVariant }]}>
										YouTube kaynağı
									</Text>
								) : null}
								{akis?.is_live === false ? (
									<Text
										style={[styles.streamTag, { color: c.outline }]}>
										Şu an yayında değil
									</Text>
								) : null}
							</View>
						) : null}
					</View>

					<Ionicons
						name="play-circle"
						size={24}
						color={focused ? c.primaryContainer : c.outline}
					/>
				</View>
			)}
		</TVPressable>
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
		minWidth: 0,
	},
	topBarTitle: {
		fontSize: 18,
		lineHeight: 22,
		fontWeight: "700",
		letterSpacing: -0.2,
	},
	topBarSub: {
		fontSize: 11,
		lineHeight: 15,
		fontWeight: "500",
		marginTop: 1,
	},

	scroll: {
		paddingHorizontal: ScreenGutter,
		paddingTop: 16,
		paddingBottom: 48,
		gap: 4,
	},

	// Kanal başlığı
	head: {
		flexDirection: "row",
		gap: 16,
		marginBottom: 22,
	},
	logoBox: {
		width: 92,
		height: 92,
		borderRadius: 16,
		overflow: "hidden",
		borderWidth: 1,
		alignItems: "center",
		justifyContent: "center",
		// `flexShrink` yok: başlık uzun kanal adlarında (örn. "beIN SPORTS
		// 1 HD Türkçe") logoyu sıkıştırmak yerine metni kısaltıyoruz.
		flexShrink: 0,
	},
	logo: {
		width: "100%",
		height: "100%",
	},
	headText: {
		flex: 1,
		minWidth: 0,
	},
	channelName: {
		fontSize: 20,
		lineHeight: 25,
		fontWeight: "700",
		letterSpacing: -0.3,
	},
	headMetaRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		marginTop: 4,
	},
	headMeta: {
		fontSize: 12,
		lineHeight: 16,
		fontWeight: "500",
	},
	headMetaDot: {
		fontSize: 12,
		lineHeight: 16,
	},
	payPill: {
		flexDirection: "row",
		alignItems: "center",
		gap: 5,
		alignSelf: "flex-start",
		marginTop: 8,
		paddingHorizontal: 9,
		paddingVertical: 4,
		borderRadius: 999,
		borderWidth: 1,
	},
	payPillText: {
		fontSize: 11,
		lineHeight: 15,
		fontWeight: "700",
	},

	// Akış listesi
	sectionTitle: {
		fontSize: 11,
		lineHeight: 16,
		fontWeight: "800",
		letterSpacing: 0.6,
		marginBottom: 8,
	},
	streamList: {
		gap: 8,
	},
	streamRow: {
		borderRadius: 14,
		borderWidth: 1,
	},
	streamInner: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		padding: 12,
	},
	kindBadge: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		paddingHorizontal: 8,
		paddingVertical: 4,
		borderRadius: 999,
		backgroundColor: c.surfaceContainerHighest,
	},
	kindBadgePrimary: {
		backgroundColor: c.primaryContainer,
	},
	kindText: {
		fontSize: 10,
		lineHeight: 14,
		fontWeight: "700",
		color: c.onSurfaceVariant,
	},
	kindTextPrimary: {
		color: c.onPrimaryContainer,
	},
	streamInfo: {
		flex: 1,
		minWidth: 0,
	},
	streamLabel: {
		fontSize: 13,
		lineHeight: 18,
		fontWeight: "600",
	},
	streamTags: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		marginTop: 3,
	},
	streamTag: {
		fontSize: 11,
		lineHeight: 15,
		fontWeight: "600",
	},
	streamEmpty: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: 10,
		padding: 12,
		borderRadius: 12,
		borderWidth: 1,
	},
	streamEmptyText: {
		flex: 1,
		fontSize: 12,
		lineHeight: 17,
	},

	// Alt bilgi
	infoBox: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: 10,
		marginTop: 22,
		padding: 12,
		borderRadius: 12,
		borderWidth: 1,
	},
	infoText: {
		flex: 1,
		fontSize: 12,
		lineHeight: 17,
	},

	// Alt durumlar
	center: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		gap: 12,
		paddingHorizontal: 32,
	},
	centerTitle: {
		fontSize: 16,
		lineHeight: 21,
		fontWeight: "700",
		textAlign: "center",
	},
	centerText: {
		fontSize: 13,
		lineHeight: 19,
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

	// TV odak
	backFocused: { transform: [{ scale: 1.12 }] },
	streamFocused: {
		borderColor: c.primaryContainer,
		borderWidth: 2,
		transform: [{ scale: 1.01 }],
	},
	retryFocused: {
		backgroundColor: c.surfaceContainerHigh,
		transform: [{ scale: 1.05 }],
	},
});