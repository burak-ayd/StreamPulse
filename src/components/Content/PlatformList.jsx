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
import { useTvMetrics } from "@/utils/tvMetrics";
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
 * Logo yoksa satırın solundaki kutuya yazılacak kısaltma.
 *
 * Referans tasarımda her sağlayıcı için ayrı bir "avatar" vardı; API'de logo
 * alanı boş olan kaynaklar için ilk iki harf (örn. "DP") kullanılır — bayrak
 * emojisi koymak kaldırıldı, her zaman Türkiye olduğu yanlış bilgi veriyordu.
 */
function basHarfler(name) {
	const parcalar = String(name || "")
		.trim()
		.split(/\s+/)
		.filter(Boolean);
	if (parcalar.length === 0) return "?";
	if (parcalar.length === 1) return parcalar[0].slice(0, 2).toUpperCase();
	return (parcalar[0][0] + parcalar[1][0]).toUpperCase();
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

export default function PlatformList({ onSelectPlatform, onOpenLiveTv }) {
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
				<Ionicons name="cloud-offline" size={sz(17)} color="#9CA3AF" />
			),
			iconBg: "rgba(107, 114, 128, 0.20)",
			onPress: () => handlePlatformSelect(NONE_PLATFORM),
			selected: isNoneSelected,
		},
		{
			key: "rastgele",
			label: "Rastgele",
			icon: <Ionicons name="shuffle" size={sz(17)} color="#60A5FA" />,
			iconBg: "rgba(37, 99, 235, 0.18)",
			onPress: handleSelectRandom,
			chevron: true,
		},
		{
			key: "canli-tv",
			label: LIVE_TV_PLATFORM.displayName,
			icon: <Ionicons name="tv" size={sz(17)} color="#F87171" />,
			iconBg: "rgba(229, 9, 20, 0.18)",
			onPress: canliTvAc,
			chevron: true,
		},
	];

	/**
	 * Hızlı Seçim'in sütun sayısı.
	 *
	 * Geniş ekranda (TV / yatay tablet) ÜÇÜ TEK SATIR — eklenti listesinin
	 * 2 sütunlu ızgarasından bağımsız. Üç kartı 2'ye bölmek "2 + 1"
	 * diye kırık bir satır üretiyordu.
	 *
	 * Dar ekranda (telefon / dikey tablet) tek sütun: 360dp'de üç kart
	 * yan yana konunca her birine ≈95dp düşüyor, ad alanı ≈13dp'ye
	 * kalıyordu — yani üç kart da adını kaybediyordu.
	 */
	const hizliSecimSutunu = sutun === 2 ? 3 : 1;

	/** Alt bölüm: gerçek eklentiler. */
	const eklentiSatirlari = filteredPlatforms.map((platform, index) => {
		const kapali = devredeMi(platform);
		return {
			key: platform.id || platform.name || `p-${index}`,
			label: platform.name,
			kapali,
			favicon: platform.favicon,
			basHarf: basHarfler(platform.name),
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
		borderColor: "#38BDF8",
		backgroundColor: "rgba(56, 189, 248, 0.14)",
	};

	/** Satırın sağ ucu: chevron / devre rozeti / seçim halkası. */
	const satirSonu = (item) => {
		if (item.chevron) {
			return (
				<Ionicons
					name="chevron-forward"
					size={sz(15)}
					color="#6B7280"
					style={{ marginLeft: sz(8) }}
				/>
			);
		}
		if (item.kapali) {
			return (
				<View
					style={[
						styles.kapaliRozet,
						{
							paddingHorizontal: sz(6),
							paddingVertical: sz(3),
							borderRadius: sz(6),
							marginLeft: sz(8),
						},
					]}>
					<Text style={[styles.kapaliRozetText, { fontSize: sz(9) }]}>
						Kullanım dışı
					</Text>
				</View>
			);
		}
		if (item.selected) {
			return (
				<View
					style={[
						styles.radioDolu,
						{
							width: sz(17),
							height: sz(17),
							borderRadius: sz(9),
							marginLeft: sz(8),
						},
					]}>
					<Ionicons name="checkmark" size={sz(10)} color="#FFFFFF" />
				</View>
			);
		}
		return (
			<View
				style={[
					styles.radioBos,
					{
						width: sz(17),
						height: sz(17),
						borderRadius: sz(9),
						marginLeft: sz(8),
					},
				]}
			/>
		);
	};

	/** Tek satırın tamamı — hem üst hem alt bölüm aynı çizimi kullanır. */
	const satir = (item) => {
		const kutu = {
			width: sz(sutun === 2 ? 30 : 28),
			height: sz(sutun === 2 ? 30 : 28),
			borderRadius: sz(9),
		};

		return (
			<TVPressable
				disabled={Boolean(item.kapali)}
				style={[
					styles.satir,
					{
						paddingVertical: sz(7),
						paddingHorizontal: sz(10),
						borderRadius: sz(10),
					},
					item.selected && styles.satirSecili,
					item.kapali && styles.satirKapali,
				]}
				focusedStyle={item.kapali ? null : odakStili}
				onPress={item.onPress}
				activeOpacity={0.7}>
				{item.favicon ? (
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
									styles.basHarf,
									{ fontSize: sz(11) },
									item.kapali && styles.basHarfKapali,
								]}>
								{item.basHarf}
							</Text>
						)}
					</View>
				)}

				<Text
					style={[
						styles.satirAdi,
						{ fontSize: sz(13), marginLeft: sz(9) },
						item.kapali && styles.satirAdiKapali,
					]}
					numberOfLines={1}>
					{item.label}
				</Text>

				{satirSonu(item)}
			</TVPressable>
		);
	};

	/**
	 * Bir diziyi sabit sütun sayısıyla, satır satır basar.
	 *
	 * `sutunSayisi` dışarıdan verilir çünkü iki bölüm farklı ızgara kullanır:
	 * Hızlı Seçim geniş ekranda 3, dar ekranda 1 sütun; eklenti listesi ise
	 * her zaman cihazın genişliğinden gelen `sutun`.
	 */
	const izgara = (ogeler, sutunSayisi) => (
		<View style={{ gap: sz(6) }}>
			{satirlaraBol(ogeler, sutunSayisi).map((satirDizi, sIndex) => (
				<View
					key={`s${sIndex}`}
					style={{ flexDirection: "row", gap: sz(7) }}>
					{satirDizi.map((item) => (
						<View key={item.key} style={{ flex: 1 }}>
							{satir(item)}
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
					paddingHorizontal: sz(8),
					paddingTop: sz(2),
					paddingBottom: sz(6),
				},
			]}>
			{/* Başlık — sayaç rozeti referans tasarımdan. */}
			<View style={[styles.baslikSatiri, { marginBottom: sz(10) }]}>
				<View style={styles.baslikSol}>
					<Text
						style={[styles.baslik, { fontSize: sz(16) }]}
						numberOfLines={1}>
						Kaynak / Eklenti
					</Text>
					<View
						style={[
							styles.sayacRozeti,
							{
								paddingHorizontal: sz(7),
								paddingVertical: sz(2),
								borderRadius: sz(9),
								marginLeft: sz(7),
							},
						]}>
						<Text style={[styles.sayacText, { fontSize: sz(10) }]}>
							{platformList.length} Eklenti
						</Text>
					</View>
				</View>
				{!isTV && (
					<Text
						style={[
							styles.baslikAlt,
							{ fontSize: sz(11), marginTop: sz(2) },
						]}
						numberOfLines={2}>
						İçeriklerin getirileceği aktif sağlayıcıyı seçin
					</Text>
				)}
			</View>

			{/* Arama — TV'de kumanda ile yazılamaz, gizlenir. */}
			{!isTV && (
				<View
					style={[
						styles.aramaKutusu,
						{
							height: sz(32),
							borderRadius: sz(8),
							paddingHorizontal: sz(9),
							gap: sz(7),
							marginBottom: sz(8),
						},
					]}>
					<Ionicons name="search" size={sz(13)} color="#6B7280" />
					<TextInput
						style={[styles.aramaInput, { fontSize: sz(12) }]}
						placeholder="Eklenti ara (ör. HD Film, Dizi, Box)..."
						placeholderTextColor="#5B6472"
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
								size={sz(14)}
								color="#6B7280"
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
					{ gap: sz(6), marginBottom: sz(10) },
				]}>
				{FILTERS.map((f) => (
					<TVPressable
						key={f.id}
						style={[
							styles.hap,
							{
								paddingHorizontal: sz(10),
								paddingVertical: sz(5),
								borderRadius: sz(7),
							},
							activeFilter === f.id && styles.hapAktif,
						]}
						focusedStyle={{
							borderColor: "#38BDF8",
						}}
						onPress={() => setActiveFilter(f.id)}
						activeOpacity={0.7}>
						<Text
							style={[
								styles.hapText,
								{ fontSize: sz(11) },
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
					<ActivityIndicator size="small" color="#E50914" />
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
						{izgara(hizliSecim, hizliSecimSutunu)}
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
	baslikSatiri: {},
	baslikSol: {
		flexDirection: "row",
		alignItems: "center",
	},
	baslik: {
		color: "#FFFFFF",
		fontWeight: "700",
		letterSpacing: -0.2,
		flexShrink: 1,
	},
	baslikAlt: {
		color: "#8896AB",
	},
	sayacRozeti: {
		backgroundColor: "#1D2026",
		borderWidth: 1,
		borderColor: "#2A2E38",
	},
	sayacText: {
		color: "#8896AB",
		fontWeight: "700",
	},

	/* ── Arama ── */
	aramaKutusu: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: "#141821",
		borderWidth: 1,
		borderColor: "rgba(255, 255, 255, 0.07)",
	},
	aramaInput: {
		flex: 1,
		color: "#FFFFFF",
		padding: 0,
	},

	/* ── Kategori hapları ── */
	hapSatiri: {
		flexDirection: "row",
	},
	hap: {
		backgroundColor: "#1D2026",
		borderWidth: 1,
		borderColor: "#2A2E38",
	},
	hapAktif: {
		backgroundColor: "#E50914",
		borderColor: "#E50914",
	},
	hapText: {
		color: "#C3CAD6",
		fontWeight: "600",
	},
	hapTextAktif: {
		color: "#FFFFFF",
		fontWeight: "700",
	},

	/* ── Bölüm başlıkları ── */
	bolumSatiri: {
		flexDirection: "row",
		alignItems: "center",
	},
	bolumBasligi: {
		color: "#8896AB",
		fontWeight: "800",
		letterSpacing: 0.8,
		textTransform: "uppercase",
	},
	bolumIpucu: {
		color: "#5B6472",
		flex: 1,
	},

	/* ── Satırlar ──
	 *
	 * `borderWidth` HER ZAMAN 2: odak (camgöbeği) ve seçim (kırmızı) yalnız
	 * rengi değiştirir, kalınlığı değil. Kalınlık da değişseydi odak
	 * halkasına girildiğinde içerik 1px kayardı — kumandayla gezerken
	 * her satırda görülen titreme tam olarak budur.
	 */
	satir: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: "#161B24",
		borderWidth: 2,
		borderColor: "rgba(255, 255, 255, 0.05)",
	},
	satirSecili: {
		borderColor: "#E50914",
		backgroundColor: "rgba(229, 9, 20, 0.14)",
	},
	satirKapali: {
		backgroundColor: "#12161D",
		borderColor: "rgba(255, 255, 255, 0.03)",
	},
	satirAdi: {
		flex: 1,
		color: "#FFFFFF",
		fontWeight: "600",
	},
	satirAdiKapali: {
		color: "#5B6472",
	},

	/* ── Satır solu ── */
	ikonKutusu: {
		justifyContent: "center",
		alignItems: "center",
		backgroundColor: "#1D2026",
	},
	ikonKutusuKapali: {
		opacity: 0.4,
	},
	logo: {
		overflow: "hidden",
		backgroundColor: "#1D2026",
	},
	logoKapali: {
		opacity: 0.4,
	},
	basHarf: {
		color: "#C3CAD6",
		fontWeight: "800",
	},
	basHarfKapali: {
		color: "#5B6472",
	},

	/* ── Satır sağı ── */
	radioBos: {
		borderWidth: 1.5,
		borderColor: "#4B5563",
	},
	radioDolu: {
		backgroundColor: "#E50914",
		alignItems: "center",
		justifyContent: "center",
	},
	kapaliRozet: {
		backgroundColor: "rgba(239, 68, 68, 0.14)",
		borderWidth: 1,
		borderColor: "rgba(239, 68, 68, 0.38)",
	},
	kapaliRozetText: {
		color: "#F87171",
		fontWeight: "700",
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
		color: "#5B6472",
	},
});
