import Image from "@/components/common/SmartImage";
import TVPressable from "@/components/common/TVPressable";
import { isTabletSize } from "@/hooks/useNavLayout";
import {
	applyDisabledPlugins,
	fetchPlatforms,
	fetchPluginStatus,
} from "@/services/api";
import {
	LIVE_TV_PLATFORM,
	NONE_PLATFORM,
	getPluginVisibilitySettings,
	getSelectedPlatform,
	saveSelectedPlatform,
} from "@/utils/storage";
import { getFlagFromIso } from "@/utils/formatters";
import { useTvMetrics } from "@/utils/tvMetrics";
import { FontFamily, Palette } from "@/constants/theme";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	ActivityIndicator,
	AppState,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";

/**
 * Devre durumu yoklama aralığı (ms).
 *
 * Backend'in devre bekleme süresiyle (varsayılan `PLUGIN_DISABLE_COOLDOWN`
 * = 60 sn) aynı değerde: daha kısa yoklama boşuna trafik, daha uzun yoklama
 * kullanıcıya bayat liste gösterir.
 */
const DURUM_YOKLAMA_ARALIGI = 60_000;

/** Kullanılabilir kaynakları süzen kategori hapları. */
const FILTERS = [
	{ id: "all", label: "Tümü" },
	{ id: "movie", label: "Filmler" },
	{ id: "series", label: "Diziler" },
	{ id: "anime", label: "Animeler" },
];

/**
 * Bir eklenti devrede mi?
 *
 * Backend hem `devrede` hem `kullanilabilir` gönderiyor; `kullanilabilir`
 * okunur çünkü UI açısından doğrudan kullanılabilir.
 *
 * `fetchPlatforms` her platformu `...p` ile yaydığı için bu alanlar API
 * katmanından otomatik gelir — ayrı bir uç gerekmez.
 */
function devredeMi(platform) {
	if (!platform) return false;
	if (typeof platform.kullanilabilir === "boolean") {
		return !platform.kullanilabilir;
	}
	return Boolean(platform.devrede);
}

/**
 * Devrede olmayan kaynaklardan rastgele birini seçer.
 *
 * ⚠️ Neden bileşenin DIŞINDA? `Math.random` render sırasında çağrılırsa
 * `react-hooks/purity` kuralı bunu render içi safsızlık sayar ("cannot
 * call impure function during render"). Satır tanıtıcısı düz bir
 * nesneden (`hizliSecim[].onPress`) geldiği için derleyici çağrı zincirini
 * izleyemiyor ve fonksiyonu render'da çalışan varsayıyordu. Bileşen
 * dışına alınınca kural uygulanmaz — ve zaten doğrusu da bu: seçim
 * yalnızca KULLANICI kartı bastığında, yani bir olayda olmalı.
 *
 * @returns {object|null} seçilen platform, ya da kullanılabilir kaynak yoksa null
 */
function rastgeleKullanilabilir(platformList) {
	const kullanilabilirler = platformList.filter((p) => !devredeMi(p));
	if (kullanilabilirler.length === 0) return null;
	return kullanilabilirler[
		Math.floor(Math.random() * kullanilabilirler.length)
	];
}

/**
 * Diziyi sabit genişlikli satırlara böler.
 *
 * ⚠️ Yüzde genişlik + `flexWrap` yerine satır başına tam sayıda öğe
 * gruplanıyor: her hücre `flex: 1` aldığı için kart genişliği ölçüm
 * almadan (onLayout'sız) doğru hesaplanır ve TV'de tek sütunda kalan
 * TEK kart iki sütunluk listenin genişliğine esnemez. Dizi tek sütundaysa
 * bu fonksiyon kimliğe yakın sonuç verir, ayrı kod yolu gerektirmez.
 */
function satirlaraBol(ogeler, sutun) {
	const satirlar = [];
	for (let i = 0; i < ogeler.length; i += sutun) {
		satirlar.push(ogeler.slice(i, i + sutun));
	}
	return satirlar;
}

export default function PlatformList({ onSelectPlatform, onOpenLiveTv, onClose }) {
	/*
	 * Yedek yol: kart her zaman `onOpenLiveTv` çağırmak yerine önce ona
	 * danışır. Bileşen tek başına kullanıldığında (veya çağıran bu prop'u
	 * vermeyi unuttuğunda) kartın çalışmaz olmasındansa, doğrudan rota
	 * bilinen `/(app)/live` adresine gitmesi yeğdir. `expo-router`'ın rota
	 * adresinin tek doğruluk kaynağı olması da bu yüzden `liveApi.js`
	 * tarafında bir "/live" sabiti olmamasıyla tutarlı.
	 */
	const router = useRouter();

	/**
	 * TV ölçüleri.
	 *
	 * Bu liste TV'de 1920px genişliğinde TEK sütun olarak açılıyordu: kart
	 * solda küçücük kalıp sağda 1200px boşluk bırakıyordu. Artık iki sütuna
	 * geçiyor ve panel `PlatformList`'in çağrıldığı tek modalde
	 * `BottomSheetModal`'ın `tvPanelWidthRatio` prop'uyla genişletiliyor —
	 * 441dp'lik panel iki sütuna bölününce kart adları kırpılıyordu.
	 *
	 * Arama kutusu TV'de GİZLENİR: kumandada klavye yok, `TextInput`
	 * odaklanamaz ve kullanıcı yazamaz — işlevsiz bir kontrol göstermek
	 * yerine gizlemek doğrusu.
	 */
	const { isTV, sp, width, height } = useTvMetrics();

	/**
	 * Sütun sayısı — kullanım kuralı:
	 *
	 *   • TV                            → 2 sütun (uzaktan okunur, geniş ekran)
	 *   • Tablet YANDEĞER                → 2 sütun
	 *   • Telefon ve tablet DİKEY        → 1 sütun
	 *
	 * Aynı "sol ray" kuralı `useNavLayout.shouldUseSideRail` ile aynı
	 * mantığı taşır: TV ve yatay tablet geniş ekran, gerisi dar.
	 */
	const sutun =
		isTV || (isTabletSize(width, height) && width > height) ? 2 : 1;

	/**
	 * Yoğunluk ölçeği.
	 *
	 * `sp()` yalnızca TV'de büyütür. İki sütuna geçen yatay tablette
	 * ölçek 1 kalır ve satırlar 600dp genişliğinde telefon satırı gibi
	 * görünür; bu yüzden sütun sayısına bağlı ikinci bir kademe ekleniyor.
	 * TV'de iki ölçek üst üste biner: 13p → ~18p, uzaktan okunabilir.
	 */
	const yogunluk = sutun === 2 ? 1.15 : 1;
	/** Ölçeklenmiş tam sayı. Kart içindeki her boyut buradan geçer. */
	const sz = (n) => sp(Math.round(n * yogunluk));

	const [selectedPlatformId, setSelectedPlatformId] = useState("none");
	const [platformList, setPlatformList] = useState([]);
	const [loading, setLoading] = useState(true);
	const [searchQuery, setSearchQuery] = useState("");
	const [activeFilter, setActiveFilter] = useState("all"); // 'all' | 'movie' | 'series' | 'anime'

	/**
	 * Yüklenemeyen logolar — `key → true`.
	 *
	 * ⚠️ Neden gerekiyor: bayrağa düşme yalnızca `favicon` ALANI boşsa
	 * tetikleniyordu. Ama eklenti `favicon` alanını dolu gönderip URL'i
	 * 404/ölü verirse `SmartImage` hata verir ve BOŞ kutu çizer — ne
	 * ikon ne bayrak görünür (FilmModu, Sinewix'te bu). Artık görsel
	 * gerçekten yüklenemediğinde de bayrağa düşülüyor.
	 *
	 * `Set` yerine düz nesne: `Set`'i state'te mutasyona uğratmak yerine
	 * yeni nesne kurmak, React'in "aynı referans" karşılaştırmasını
	 * yanlışlıkla tetiklemiyor.
	 */
	const [kirikLogo, setKirikLogo] = useState({});

	const logoYuklenemedi = useCallback((key) => {
		setKirikLogo((oncekiler) =>
			oncekiler[key] ? oncekiler : { ...oncekiler, [key]: true },
		);
	}, []);

	// Yoklama zamanlayıcısı ve uygulama ön plan dinleyicisi için referans.
	const yoklamaRef = useRef(null);

	const loadPlatforms = useCallback(async () => {
		try {
			const [data, saved, visibility] = await Promise.all([
				fetchPlatforms(),
				getSelectedPlatform(),
				getPluginVisibilitySettings(),
			]);

			const list = Array.isArray(data) ? data : [];
			const visibleList = list.filter(
				(p) => visibility?.[p.name || p.id] !== false,
			);

			if (
				saved &&
				visibleList.some(
					(p) =>
						(p.id && p.id === saved.id) ||
						(p.name && p.name === saved.name),
				)
			) {
				setSelectedPlatformId(saved.id || saved.name);
			} else if (visibleList.length > 0) {
				setSelectedPlatformId(visibleList[0].id || visibleList[0].name);
			} else {
				setSelectedPlatformId("none");
			}

			return visibleList;
		} catch (error) {
			console.error("Platformlar yüklenirken hata:", error);
			setSelectedPlatformId("none");
			return [];
		}
	}, []);

	useEffect(() => {
		let isMounted = true;

		async function initialLoad() {
			setLoading(true);
			const list = await loadPlatforms();
			if (!isMounted) return;
			setPlatformList(list);
			setLoading(false);
		}

		initialLoad();
		return () => {
			isMounted = false;
		};
	}, [loadPlatforms]);

	/**
	 * 60 sn'de bir devre durumunu kontrol et.
	 *
	 * `/api/plugins/status` YALNIZCA devrede olanları döner ve önbelleklenmez;
	 * devrede kaynak yokken cevap ~65 bayt (ölçüldü). Statik liste 300 sn
	 * önbellekli olduğu için burada tam liste yeniden çekilmez.
	 */
	const durumuKontrolEt = useCallback(async () => {
		const veri = await fetchPluginStatus();
		if (!veri) return; // ağ/yoklama hatası — sessizce geç

		setPlatformList((oncekiler) => {
			const uygulanmis = applyDisabledPlugins(
				oncekiler,
				veri.kullanim_disi,
			);
			// Boş cevapta aynı referans döner; React gereksiz render üretmez.
			return uygulanmis;
		});
	}, []);

	useEffect(() => {
		yoklamaRef.current = setInterval(
			durumuKontrolEt,
			DURUM_YOKLAMA_ARALIGI,
		);
		return () => {
			if (yoklamaRef.current) {
				clearInterval(yoklamaRef.current);
				yoklamaRef.current = null;
			}
		};
	}, [durumuKontrolEt]);

	/*
	 * Uygulama arka plana alınınca yoklamayı DURDUR (pil), öne dönünce hemen
	 * bir tur at (bayat liste görmeme).
	 */
	useEffect(() => {
		const abonelik = AppState.addEventListener("change", (sonraki) => {
			if (sonraki === "active") {
				durumuKontrolEt();
			}
		});
		return () => abonelik?.remove?.();
	}, [durumuKontrolEt]);

	const handlePlatformSelect = async (platform) => {
		// Devrede kaynak SEÇİLEMEZ. TVPressable `disabled` zaten dokunmayı
		// engelliyor; bu kapı, `disabled`'ı yok sayan platformlar (Web/TV)
		// için güvenlik ağıdır.
		if (devredeMi(platform)) {
			return;
		}

		const id = platform?.id || platform?.name;
		setSelectedPlatformId(id);
		await saveSelectedPlatform(platform);

		if (onSelectPlatform) {
			onSelectPlatform(platform);
		}
	};

	const handleSelectRandom = async () => {
		// Devrede kaynaklar rastgele seçime DAHİL EDİLMEZ — aksi halde
		// kullanıcı kalıcı olarak bozuk bir kaynağa düşer.
		const chosen = rastgeleKullanilabilir(platformList);

		if (!chosen) {
			handlePlatformSelect(NONE_PLATFORM);
			return;
		}
		handlePlatformSelect(chosen);
	};

	/*
	 * ── Canlı TV kartı: `handlePlatformSelect` DEĞİL, navigasyon ──────
	 *
	 * Bu bilinçli bir ayrım ve en sık yapılabilecek hatadır. Kartın
	 * `handlePlatformSelect`'e verilmesi şu iki yanlışı birlikte getirdi:
	 *
	 *   1. `saveSelectedPlatform(platform)` platformu KALICI olarak seçerdi.
	 *      Kalıcı seçim, uygulama yeniden açıldığında `index.jsx`'in
	 *      otomatik olarak `/api/plugins/{name}/main-page` (ve `categories`)
	 *      çağırdığı akışın GİRDİSİDİR. `canli-tv` ne bir `PluginBase`
	 *      eklentisi ne de `/api/plugins/...` ucu olan bir kaynak; kullanıcı
	 *      uygulamayı yeniden açtığında boş ekran/404 ile karşılaşırdı.
	 *      `LIVE_TV_PLATFORM.is_live` alanı tam olarak bu sözleşmeyi taşıyor.
	 *   2. Seçim durumu (`platformCardActive` + onay işareti) ve "devrede"
	 *      mantığı bu kartta anlamsız: canlı TV'nin devre durumu yoktur, M3U
	 *      sağlığı ekranın kendi işidir.
	 *
	 * Alternatif düşünüldü: kartı `filteredPlatforms` içine sokup bir
	 * `is_live` dalıyla ayırmak. Reddedildi — `filteredPlatforms` sayımı
	 * ("Mevcut Eklentiler (N)"), arama filtresi ve devre rozetleri bu diziye
	 * bağlı; uydurma bir eklentiyi içine almak sayaçları ve filtreleri
	 * anlamsızlaştırırdı. Kart, Random ve Hiçbiri ile birlikte listenin
	 * DIŞINDA, en üstteki "Hızlı Seçim" bölümünde durur.
	 *
	 * ⚠️ Arama ve kategori hapları bu kartı ETKİLEMEZ (bilinçli): haplar
	 * "eklenti içeriği türüne" göre süzer, canlı TV ne film ne dizi ne
	 * animedir. Bu yüzden kart, filtre ne olursa olsun bölümde kalır —
	 * kullanıcı "canlı" yazıp aradığında da kaybolmaz.
	 */
	const canliTvAc = useCallback(() => {
		if (onOpenLiveTv) {
			onOpenLiveTv();
			return;
		}
		router.push("/(app)/live");
	}, [onOpenLiveTv, router]);

	// Filtered platforms
	const filteredPlatforms = useMemo(() => {
		let result = platformList;

		if (activeFilter === "movie") {
			result = result.filter(
				(p) =>
					p.name.toLowerCase().includes("film") ||
					p.name.toLowerCase().includes("sinema") ||
					(p.categories &&
						p.categories.some((c) =>
							(typeof c === "string" ? c : c.name || "")
								.toLowerCase()
								.includes("film"),
						)),
			);
		} else if (activeFilter === "series") {
			result = result.filter(
				(p) =>
					p.name.toLowerCase().includes("dizi") ||
					(p.categories &&
						p.categories.some((c) =>
							(typeof c === "string" ? c : c.name || "")
								.toLowerCase()
								.includes("dizi"),
						)),
			);
		} else if (activeFilter === "anime") {
			result = result.filter(
				(p) =>
					p.name.toLowerCase().includes("anime") ||
					(p.categories &&
						p.categories.some((c) =>
							(typeof c === "string" ? c : c.name || "")
								.toLowerCase()
								.includes("anime"),
						)),
			);
		}

		if (searchQuery.trim().length > 0) {
			const q = searchQuery.toLowerCase().trim();
			result = result.filter((p) => p.name.toLowerCase().includes(q));
		}

		return result;
	}, [platformList, activeFilter, searchQuery]);

	const isNoneSelected =
		selectedPlatformId === "none" || selectedPlatformId === "None";

	/*
	 * ── Üst bölüm: Hiçbiri · Rastgele · Canlı TV ─────────────────────
	 *
	 * Üçü de "listedeki bir eklenti değil, uygulamanın kendi kaynağı"
	 * ailesinden. Rastgele ve Canlı TV bir EYLEM, Hiçbiri bir KALICI SEÇİM
	 * olduğu için ilk ikisi seçim halkası yerine chevron taşır.
	 *
	 * ⚠️ `useMemo` YOK: `handleSelectRandom` her render'da yeni bir
	 * fonksiyon kimliği alır ve `platformList`'i yakalar. Diziyi
	 * `useMemo`'ya kapatmak, bağımlılık listesine eklenmemiş bu iki
	 * fonksiyonda BAYAT bir liste yakalamak demekti — "Rastgele" bir süre
	 * sonra devreye girmiş kaynakları da seçebilirdi. Ucuz türetmeleri
	 * belleğe almamak burada doğru olan.
	 */
	const hizliSecim = [
		{
			key: "none",
			label: "Hiçbiri",
			icon: (
				<Ionicons
					name="cloud-offline"
					size={sz(22)}
					color={Palette.outline}
				/>
			),
			iconBg: "rgba(144, 143, 160, 0.16)",
			onPress: () => handlePlatformSelect(NONE_PLATFORM),
			selected: isNoneSelected,
		},
		{
			key: "rastgele",
			label: "Rastgele",
			icon: (
				<Ionicons name="shuffle" size={sz(22)} color={Palette.secondary} />
			),
			iconBg: "rgba(76, 215, 246, 0.14)",
			onPress: handleSelectRandom,
			chevron: true,
		},
		{
			key: "canli-tv",
			label: LIVE_TV_PLATFORM.displayName,
			icon: <Ionicons name="tv" size={sz(22)} color={Palette.error} />,
			iconBg: "rgba(255, 180, 171, 0.14)",
			onPress: canliTvAc,
			chevron: true,
		},
	];

	/** Alt bölüm: gerçek eklentiler. */
	const eklentiSatirlari = filteredPlatforms.map((platform, index) => {
		const kapali = devredeMi(platform);
		return {
			key: platform.id || platform.name || `p-${index}`,
			label: platform.name,
			kapali,
			/* Yeşil nokta = kaynak şu an kullanılabilir (tasarımdaki çevrimiçi
			   işareti). Kullanım dışı kaynakta nokta yok. */
			dot: !kapali,
			favicon: platform.favicon,
			bayrak: getFlagFromIso(platform.language),
			onPress: () => handlePlatformSelect(platform),
			selected:
				!kapali &&
				!isNoneSelected &&
				(selectedPlatformId === platform.id ||
					selectedPlatformId === platform.name),
		};
	});

	/**
	 * TV kumandası odak halkası — camgöbeği.
	 *
	 * Seçim kırmızı olduğu için odak da kırmızı olsaydı "odakta" ile
	 * "seçili" aynı renkle anlatılır, kumandayla gezerken hangi kaynağın
	 * GERÇEKTEN seçili olduğu okunmazdı. İkisi ayrı renk olunca ikisi de
	 * tek bakışta anlaşılır.
	 *
	 * ⚠️ `transform: [{ scale }]` YOK. Ölçek, kartı komşusunun ÜZERİNE
	 * biniyordu: iki sütunda kart ≈950px geniş olduğundan 1.08 ölçek her
	 * kenardan ≈38px büyütüyor, aradaki ≈8px'lik boşluğun on katı. Odak
	 * vurgusu artık YALNIZCA 2px'lik kenarlık ve arka plan tonuyla
	 * veriliyor; 3 metreden okunan kalın çizgi ölçekten daha güçlü.
	 */
	const odakStili = {
		borderColor: Palette.primary,
		backgroundColor: "rgba(192, 193, 255, 0.10)",
	};

	/** Satırın sağ ucu: chevron / seçim halkası. Kullanım dışı satırda hiçbiri. */
	const satirSonu = (item) => {
		if (item.chevron) {
			return (
				<Ionicons
					name="chevron-forward"
					size={sz(16)}
					color={Palette.outline}
					style={{ marginLeft: sz(12) }}
				/>
			);
		}
		if (item.kapali) return null;
		if (item.selected) {
			return (
				<View
					style={[
						styles.radioDolu,
						{
							width: sz(24),
							height: sz(24),
							borderRadius: sz(12),
							marginLeft: sz(12),
						},
					]}>
					<Ionicons
						name="checkmark"
						size={sz(15)}
						color={Palette.onPrimaryContainer}
					/>
				</View>
			);
		}
		return (
			<View
				style={[
					styles.radioBos,
					{
						width: sz(20),
						height: sz(20),
						borderRadius: sz(10),
						marginLeft: sz(12),
					},
				]}
			/>
		);
	};

	/**
	 * Tek satırın tamamı — Hızlı Seçim ve eklenti listesi aynı çizimi kullanır.
	 *
	 * Kart dili referans tasarımdan: 44dp ikon kutusu (favicon ya da renkli
	 * ikon), ad + durum rozeti, sağda seçim halkası/ok. İkinci meta satırı
	 * (profil, yapım sayısı, kalite rozetleri) YOK: bu veriler backend'de
	 * bulunmuyor, uydurulmuyor.
	 *
	 * `kompakt`: Hızlı Seçim'in üçe bölünmüş kartları için dikey yerleşim
	 * (ikon üstte, ad altta). ≈95dp'lik hücreye satır yerleşimi sığmadığı
	 * için ad ve seçim işareti kayboluyordu.
	 */
	const satir = (item, kompakt = false) => {
		/** İkon kutusunun kenar uzunluğu — bayrak da buna göre ölçeklenir. */
		const kutuKenar = 44;
		const kutu = {
			width: sz(kutuKenar),
			height: sz(kutuKenar),
			borderRadius: sz(12),
		};

		return (
			<TVPressable
				disabled={Boolean(item.kapali)}
				style={[
					styles.satir,
					kompakt && styles.satirKompakt,
					{
						padding: kompakt ? sz(12) : sz(14),
						borderRadius: sz(16),
					},
					item.selected && styles.satirSecili,
					item.kapali && styles.satirKapali,
				]}
				focusedStyle={item.kapali ? null : odakStili}
				onPress={item.onPress}
				activeOpacity={0.7}>
				<View style={[styles.ikonSarici, kutu]}>
					{item.favicon && !kirikLogo[item.key] ? (
						<Image
							source={{ uri: item.favicon }}
							style={[
								styles.logo,
								kutu,
								item.kapali && styles.logoKapali,
							]}
							contentFit="contain"
							transition={0}
							recyclingKey={item.favicon}
							cachePolicy="memory-disk"
							/* Görsel gelmezse bayrağa düş — aksi hâlde 404
							   veren bir favicon satırı bomboş kalıyor. */
							onError={() => logoYuklenemedi(item.key)}
						/>
					) : (
						<View
							style={[
								styles.ikonKutusu,
								kutu,
								item.iconBg
									? { backgroundColor: item.iconBg }
									: null,
								item.kapali && styles.ikonKutusuKapali,
							]}>
							{item.icon ?? (
								<Text
									style={[
										styles.bayrak,
										/*
										 * Bayrak, kutuyu doldursun diye punto
										 * kenarın %80'i; `lineHeight` ise tam
										 * kenar. İkisi olmadan emoji, fontun
										 * ascent/descent boşluğuna oturup kutunun
										 * ortasında küçük ve aşağı kayık duruyor.
										 */
										{
											fontSize: sz(
												Math.round(kutuKenar * 0.8),
											),
											lineHeight: sz(kutuKenar),
										},
										item.kapali && styles.bayrakKapali,
									]}>
									{item.bayrak}
								</Text>
							)}
						</View>
					)}

					{/* Çevrimiçi işareti — yalnızca kullanılabilir kaynakta. */}
					{item.dot ? <View style={styles.durumNoktasi} /> : null}
				</View>

				<View
					style={
						kompakt
							? styles.adSariciKompakt
							: [styles.adSarici, { marginLeft: sz(14) }]
					}>
					<Text
						style={[
							styles.satirAdi,
							kompakt
								? { fontSize: sz(12), textAlign: "center" }
								: { fontSize: sz(14) },
							item.kapali && styles.satirAdiKapali,
						]}
						numberOfLines={kompakt ? 2 : 1}>
						{item.label}
					</Text>
					{item.kapali && !kompakt ? (
						<View
							style={[
								styles.kapaliRozet,
								{
									paddingHorizontal: sz(6),
									paddingVertical: sz(2),
									borderRadius: sz(4),
									marginLeft: sz(8),
								},
							]}>
							<Text
								style={[
									styles.kapaliRozetText,
									{ fontSize: sz(10) },
								]}>
								Kullanım dışı
							</Text>
						</View>
					) : null}
				</View>

				{kompakt ? null : satirSonu(item)}
			</TVPressable>
		);
	};

	/**
	 * Bir diziyi sabit sütun sayısıyla, satır satır basar.
	 *
	 * `sutunSayisi` dışarıdan verilir çünkü eklenti listesi cihazın
	 * genişliğinden gelen `sutun` sayısını kullanır.
	 */
	const izgara = (ogeler, sutunSayisi, kompakt = false) => (
		<View style={{ gap: sz(8) }}>
			{satirlaraBol(ogeler, sutunSayisi).map((satirDizi, sIndex) => (
				<View
					key={`s${sIndex}`}
					style={{ flexDirection: "row", gap: sz(8) }}>
					{satirDizi.map((item) => (
						<View key={item.key} style={{ flex: 1 }}>
							{satir(item, kompakt)}
						</View>
					))}
					{/* Tek kart kalan son satırda genişlik bozulmasın diye
					    görünmez bir hücre ekleniyor. */}
					{satirDizi.length < sutunSayisi && (
						<View style={{ flex: 1 }} />
					)}
				</View>
			))}
		</View>
	);

	return (
		<View
			style={[
				styles.container,
				{
					/*
					 * Dış boşluklar bilinçli olarak dar. Altta 16dp vardı ve
					 * panel yüksekliğinin son iki satırını boş bırakıyordu:
					 * liste bittiğinde karttan sonra kalın bir ölü şerit
					 * kalıyor, panel sanki içerik sığmamış gibi duruyordu.
					 *
					 * ⚠️ Alt boşluğun asıl payı artık `BottomSheetModal`'ın
					 * kendi inset'i (`altTasma`); burada 6dp yeter.
					 */
					paddingHorizontal: sz(16),
					paddingTop: sz(2),
					paddingBottom: sz(6),
				},
			]}>
			{/* Başlık — sayaç rozeti ve kapatma düğmesi referans tasarımdan. */}
			<View
				style={[
					styles.baslikSatiri,
					{ paddingBottom: sz(12), marginBottom: sz(12) },
				]}>
				<View style={styles.baslikSol}>
					<View style={styles.baslikUstSatiri}>
						<Text
							style={[styles.baslik, { fontSize: sz(19) }]}
							numberOfLines={1}>
							Platform Seçimi
						</Text>
						<View
							style={[
								styles.sayacRozeti,
								{
									paddingHorizontal: sz(8),
									paddingVertical: sz(2),
									borderRadius: sz(999),
									marginLeft: sz(8),
								},
							]}>
							<Text
								style={[styles.sayacText, { fontSize: sz(11) }]}>
								{platformList.length} Eklenti
							</Text>
						</View>
					</View>
					{!isTV && (
						<Text
							style={[
								styles.baslikAlt,
								{ fontSize: sz(12), marginTop: sz(2) },
							]}
							numberOfLines={2}>
							İçeriklerin getirileceği aktif sağlayıcıyı seçin
						</Text>
					)}
				</View>
				{onClose ? (
					<TVPressable
						style={[
							styles.kapatDugmesi,
							{
								width: sz(36),
								height: sz(36),
								borderRadius: sz(18),
								marginLeft: sz(8),
							},
						]}
						focusedStyle={{ borderColor: Palette.primary }}
						onPress={onClose}
						accessibilityLabel="Kapat">
						<Ionicons
							name="close"
							size={sz(19)}
							color={Palette.onSurfaceVariant}
						/>
					</TVPressable>
				) : null}
			</View>

			{/* Arama — TV'de kumanda ile yazılamaz, gizlenir. */}
			{!isTV && (
				<View
					style={[
						styles.aramaKutusu,
						{
							height: sz(40),
							borderRadius: sz(12),
							paddingHorizontal: sz(12),
							gap: sz(8),
							marginBottom: sz(10),
						},
					]}>
					<Ionicons
						name="search"
						size={sz(18)}
						color={Palette.onSurfaceVariant}
					/>
					<TextInput
						style={[styles.aramaInput, { fontSize: sz(13) }]}
						placeholder="Eklenti ara (ör. HD Film, Dizi, Box)..."
						placeholderTextColor={Palette.outline}
						value={searchQuery}
						onChangeText={setSearchQuery}
						autoCapitalize="none"
						autoCorrect={false}
					/>
					{searchQuery.length > 0 && (
						<TVPressable
							onPress={() => setSearchQuery("")}
							focusedStyle={{
								opacity: 0.7,
							}}
							hitSlop={6}>
							<Ionicons
								name="close-circle"
								size={sz(16)}
								color={Palette.outline}
							/>
						</TVPressable>
					)}
				</View>
			)}

			{/* Kategori hapları — Canlı TV hapı yok: kart zaten üstte ve
			    her filtre altında görünür kalıyor. */}
			<View
				style={[
					styles.hapSatiri,
					{ gap: sz(8), marginBottom: sz(12) },
				]}>
				{FILTERS.map((f) => (
					<TVPressable
						key={f.id}
						style={[
							styles.hap,
							{
								paddingHorizontal: sz(12),
								paddingVertical: sz(6),
								borderRadius: sz(999),
							},
							activeFilter === f.id && styles.hapAktif,
						]}
						focusedStyle={{
							borderColor: Palette.primary,
						}}
						onPress={() => setActiveFilter(f.id)}
						activeOpacity={0.7}>
						<Text
							style={[
								styles.hapText,
								{ fontSize: sz(12) },
								activeFilter === f.id && styles.hapTextAktif,
							]}>
							{f.label}
						</Text>
					</TVPressable>
				))}
			</View>

			{/* Liste */}
			{loading ? (
				<View style={styles.yukleniyor}>
					<ActivityIndicator size="small" color={Palette.primary} />
				</View>
			) : (
				<ScrollView
					style={styles.kaydirma}
					contentContainerStyle={{
						paddingBottom: sz(4),
						gap: sz(14),
					}}
					showsVerticalScrollIndicator={false}>
					{/* Hızlı Seçim */}
					<View>
						<View
							style={[
								styles.bolumSatiri,
								{ marginBottom: sz(6) },
							]}>
							<Text
								style={[
									styles.bolumBasligi,
									{ fontSize: sz(10) },
								]}>
								Hızlı Seçim
							</Text>
						</View>
						{izgara(hizliSecim, 3, true)}
					</View>

					{/* Eklentiler */}
					<View>
						<View
							style={[
								styles.bolumSatiri,
								{ marginBottom: sz(6) },
							]}>
							<Text
								style={[
									styles.bolumBasligi,
									{ fontSize: sz(10) },
								]}>
								Eklentiler ({filteredPlatforms.length})
							</Text>
							<Text
								style={[
									styles.bolumIpucu,
									{ fontSize: sz(10), marginLeft: sz(8) },
								]}>
								dokun veya kumandayla seç
							</Text>
						</View>

						{eklentiSatirlari.length > 0 ? (
							izgara(eklentiSatirlari, sutun)
						) : (
							<View
								style={[
									styles.bos,
									{ paddingVertical: sz(26) },
								]}>
								<Text
									style={[
										styles.bosText,
										{ fontSize: sz(12) },
									]}>
									Eşleşen eklenti bulunamadı.
								</Text>
							</View>
						)}
					</View>
				</ScrollView>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
	},

	/* ── Başlık ── */
	baslikSatiri: {
		flexDirection: "row",
		alignItems: "flex-start",
		borderBottomWidth: 1,
		borderBottomColor: "rgba(70, 69, 84, 0.45)",
	},
	baslikSol: {
		flex: 1,
	},
	baslikUstSatiri: {
		flexDirection: "row",
		alignItems: "center",
	},
	kapatDugmesi: {
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "rgba(229, 225, 228, 0.06)",
		borderWidth: 1,
		borderColor: "rgba(229, 225, 228, 0.08)",
	},
	baslik: {
		color: Palette.onSurface,
		fontFamily: FontFamily.bold,
		letterSpacing: -0.2,
		flexShrink: 1,
	},
	baslikAlt: {
		color: Palette.onSurfaceVariant,
		fontFamily: FontFamily.regular,
	},
	sayacRozeti: {
		backgroundColor: Palette.surface,
		borderWidth: 1,
		borderColor: "rgba(70, 69, 84, 0.45)",
	},
	sayacText: {
		color: Palette.secondary,
		fontFamily: FontFamily.semiBold,
	},

	/* ── Arama ── */
	aramaKutusu: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: Palette.surfaceLowest,
		borderWidth: 1,
		borderColor: "rgba(70, 69, 84, 0.45)",
	},
	aramaInput: {
		flex: 1,
		color: Palette.onSurface,
		fontFamily: FontFamily.regular,
		padding: 0,
	},

	/* ── Kategori hapları ── */
	hapSatiri: {
		flexDirection: "row",
		flexWrap: "wrap",
	},
	hap: {
		backgroundColor: Palette.surface,
		borderWidth: 1,
		borderColor: "rgba(70, 69, 84, 0.45)",
	},
	hapAktif: {
		backgroundColor: Palette.primaryContainer,
		borderColor: "transparent",
	},
	hapText: {
		color: Palette.onSurfaceVariant,
		fontFamily: FontFamily.medium,
	},
	hapTextAktif: {
		color: Palette.onPrimaryContainer,
		fontFamily: FontFamily.semiBold,
	},

	/* ── Bölüm başlıkları ── */
	bolumSatiri: {
		flexDirection: "row",
		alignItems: "center",
	},
	bolumBasligi: {
		color: Palette.onSurfaceVariant,
		fontFamily: FontFamily.semiBold,
		letterSpacing: 0.8,
		textTransform: "uppercase",
	},
	bolumIpucu: {
		color: Palette.outline,
		flex: 1,
	},

	/* ── Satırlar ──
	 *
	 * `borderWidth` HER ZAMAN 2: odak ve seçim yalnız rengi değiştirir,
	 * kalınlığı değil. Kalınlık da değişseydi odak halkasına girildiğinde
	 * içerik 1px kayardı — kumandayla gezerken her satırda görülen
	 * titreme tam olarak budur.
	 */
	satir: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: Palette.surface,
		borderWidth: 2,
		borderColor: "transparent",
	},
	satirSecili: {
		borderColor: Palette.primaryContainer,
		backgroundColor: "rgba(128, 131, 255, 0.10)",
	},
	satirKompakt: {
		flexDirection: "column",
		alignItems: "center",
		justifyContent: "center",
	},
	satirKapali: {
		backgroundColor: Palette.surfaceLow,
		borderStyle: "dashed",
		borderColor: "rgba(70, 69, 84, 0.55)",
		opacity: 0.8,
	},
	satirAdi: {
		color: Palette.onSurface,
		fontFamily: FontFamily.bold,
		letterSpacing: -0.2,
		flexShrink: 1,
	},
	satirAdiKapali: {
		color: Palette.onSurfaceVariant,
		fontFamily: FontFamily.medium,
	},
	adSarici: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
	},
	adSariciKompakt: {
		alignItems: "center",
		marginTop: 8,
	},

	/* ── Satır solu ── */
	ikonSarici: {
		position: "relative",
	},
	durumNoktasi: {
		position: "absolute",
		right: 3,
		bottom: 3,
		width: 8,
		height: 8,
		borderRadius: 4,
		backgroundColor: "#34d399",
	},
	ikonKutusu: {
		justifyContent: "center",
		alignItems: "center",
		backgroundColor: Palette.surfaceHighest,
	},
	ikonKutusuKapali: {
		opacity: 0.4,
	},
	logo: {
		overflow: "hidden",
		backgroundColor: Palette.surfaceHighest,
	},
	logoKapali: {
		opacity: 0.4,
	},
	/*
	 * Bayrak emojisi.
	 *
	 * Emoji zaten renkli olduğu için `color` vermek işe yaramaz; soluk
	 * görünüm `opacity` ile alınıyor (bkz. `bayrakKapali`).
	 */
	bayrak: {},
	bayrakKapali: {
		opacity: 0.4,
	},

	/* ── Satır sağı ── */
	radioBos: {
		borderWidth: 2,
		borderColor: Palette.outlineVariant,
	},
	radioDolu: {
		backgroundColor: Palette.primaryContainer,
		alignItems: "center",
		justifyContent: "center",
	},
	kapaliRozet: {
		backgroundColor: "rgba(255, 180, 171, 0.12)",
		borderWidth: 1,
		borderColor: "rgba(255, 180, 171, 0.38)",
	},
	kapaliRozetText: {
		color: Palette.error,
		fontFamily: FontFamily.semiBold,
	},

	/* ── Durumlar ── */
	kaydirma: {
		flex: 1,
	},
	yukleniyor: {
		padding: 40,
		alignItems: "center",
		justifyContent: "center",
	},
	bos: {
		alignItems: "center",
	},
	bosText: {
		color: Palette.outline,
		fontFamily: FontFamily.regular,
	},
});
