import TVPressable from "@/components/common/TVPressable";
import {
	applyDisabledPlugins,
	fetchPluginStatus,
	fetchPlatforms,
} from "@/services/api";
import { useTvMetrics } from "@/utils/tvMetrics";
import {
	LIVE_TV_PLATFORM,
	NONE_PLATFORM,
	getPluginVisibilitySettings,
	getSelectedPlatform,
	saveSelectedPlatform,
} from "@/utils/storage";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
	 * Bu liste TV'de 1920px genişliğinde tek sütun olarak açılıyordu: kart
	 * solda küçücük kalıp sağında 1200px boşluk bırakıyordu. Panel artık
	 * ortalanmış ve dar (bkz. `Bottomsheetmodal`), burada da punto, kart
	 * yüksekliği ve boşluklar TV ölçeğine çıkarılıyor.
	 *
	 * Arama kutusu TV'de GİZLENİR: kumandada klavye yok, `TextInput`
	 * odaklanamaz ve kullanıcı yazamaz — işlevsiz bir kontrol göstermek
	 * yerine gizlemek doğrusu.
	 */
	const { isTV, sp, focusScale } = useTvMetrics();

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

			if (saved &&
				visibleList.some(
					(p) =>
						(p.id && p.id === saved.id) ||
						(p.name && p.name === saved.name),
				)) {
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
		const kullanilabilirler = platformList.filter((p) => !devredeMi(p));

		if (kullanilabilirler.length === 0) {
			handlePlatformSelect(NONE_PLATFORM);
			return;
		}
		const randomIndex = Math.floor(Math.random() * kullanilabilirler.length);
		const chosen = kullanilabilirler[randomIndex];
		handlePlatformSelect(chosen);
	};

	/*
	 * ── Canlı TV kartı: `handlePlatformSelect` DEĞİL, navigasyon ──────
	 *
	 * Bu bilinçli bir ayrım ve en sık yapılabilecek hatadır. Kartın
	 * `handlePlatformSelect`'e verilmesi şu iki yanlışı birlikte getirirdi:
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
	 * anlamsızlaştırırdı. Kart, Random gibi, listenin DIŞINDA durur.
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
	 * Kullanıcıya gösterilecek devre özeti.
	 *
	 * Kayan mesaj (toast) kullanmıyoruz: bu liste bir BottomSheet içinde ve
	 * modal içinde toast çakışabilir. Ayrıca mesaj kartların ÜZERİNDE
	 * zaten rozet olarak görünüyor; bant yalnız "kaç kaynak kapalı" bilgisini
	 * özetliyor.
	 */
	const devredeOlanlar = useMemo(
		() => filteredPlatforms.filter((p) => devredeMi(p)),
		[filteredPlatforms],
	);

	const seciliDevredeMi = useMemo(() => {
		if (isNoneSelected) return false;
		const secili = platformList.find(
			(p) =>
				(p?.id && p.id === selectedPlatformId) ||
				(p?.name && p.name === selectedPlatformId),
		);
		return devredeMi(secili);
	}, [platformList, selectedPlatformId, isNoneSelected]);

	return (
		<View
			style={[
				styles.container,
				{
					paddingHorizontal: sp(16),
					paddingTop: sp(12),
					paddingBottom: sp(24),
				},
			]}>
			{/* Modal Header — TV'de alt başlık gizlenir: panel yüksekliği
			    sınırlı, dikey alan kartlara daha çok ait. */}
			<View style={[styles.header, { marginBottom: sp(isTV ? 10 : 16) }]}>
				<Text
					style={[styles.headerTitle, { fontSize: sp(isTV ? 18 : 21) }]}
					numberOfLines={1}>
					Platform / Eklenti Seçimi
				</Text>
				{!isTV && (
					<Text
						style={[
							styles.headerSubtitle,
							{ fontSize: sp(13), marginTop: sp(4) },
						]}
						numberOfLines={2}>
						İçeriklerin getirileceği kaynağı belirleyin
					</Text>
				)}
			</View>

			{/* Seçili kaynak devreye girdiyse uyarı — içerik yüklenemez */}
			{seciliDevredeMi ? (
				<View
					style={[
						styles.alertBox,
						{ padding: sp(12), marginBottom: sp(12), gap: sp(8), borderRadius: sp(12) },
					]}>
					<Ionicons
						name="warning"
						size={sp(18)}
						color="#f59e0b"
						style={styles.alertIcon}
					/>
					<Text style={[styles.alertText, { fontSize: sp(13), lineHeight: sp(18) }]}>
						Seçili kaynak geçici olarak kullanım dışı. İçerik
						güncellenemeyebilir; başka bir kaynak seçin.
					</Text>
				</View>
			) : null}

			{/* Devre özeti */}
			{devredeOlanlar.length > 0 ? (
				<View
					style={[
						styles.infoBox,
						{ padding: sp(12), marginBottom: sp(12), gap: sp(8), borderRadius: sp(12) },
					]}>
					<Ionicons
						name="information-circle"
						size={sp(18)}
						color="#60a5fa"
						style={styles.alertIcon}
					/>
					<Text style={[styles.infoText, { fontSize: sp(13), lineHeight: sp(18) }]}>
						{devredeOlanlar.length} kaynak geçici olarak kullanım dışı
						(devam ediyor). Kendiliğinden geri gelirler.
					</Text>
				</View>
			) : null}

			{/* Search Input — TV'de kumanda ile yazılamaz, gizlenir. */}
			{!isTV && (
				<View style={[styles.searchBox, { marginBottom: sp(12), height: sp(40), gap: sp(8) }]}>
					<Ionicons name="search" size={sp(17)} color="#9ca3af" />
					<TextInput
						style={[styles.searchInput, { fontSize: sp(13) }]}
						placeholder="Eklenti ara..."
						placeholderTextColor="#6b7280"
						value={searchQuery}
						onChangeText={setSearchQuery}
						autoCapitalize="none"
						autoCorrect={false}
					/>
					{searchQuery.length > 0 && (
						<TVPressable
							onPress={() => setSearchQuery("")}
							focusedStyle={{
								backgroundColor: "rgba(229, 9, 20, 0.2)",
								borderRadius: sp(10),
							}}>
							<Ionicons
								name="close-circle"
								size={sp(16)}
								color="#9ca3af"
							/>
						</TVPressable>
					)}
				</View>
			)}

			{/* Filter Pills */}
			<View
				style={[
					styles.filterRow,
					{ gap: sp(9), marginBottom: sp(isTV ? 10 : 14) },
				]}>
				{[
					{ id: "all", label: "Tümü" },
					{ id: "movie", label: "Filmler" },
					{ id: "series", label: "Diziler" },
					{ id: "anime", label: "Animeler" },
				].map((f) => (
					<TVPressable
						key={f.id}
						style={[
							styles.filterPill,
							{
								paddingHorizontal: sp(16),
								paddingVertical: sp(isTV ? 7 : 9),
								borderRadius: sp(18),
							},
							activeFilter === f.id && styles.filterPillActive,
						]}
						focusedStyle={{
							borderWidth: 2,
							borderColor: "#E50914",
							backgroundColor: "rgba(229, 9, 20, 0.2)",
							transform: [{ scale: focusScale }],
						}}
						onPress={() => setActiveFilter(f.id)}
						activeOpacity={0.7}>
						<Text
							style={[
								styles.filterPillText,
								{ fontSize: sp(13) },
								activeFilter === f.id &&
									styles.filterPillTextActive,
							]}>
							{f.label}
						</Text>
					</TVPressable>
				))}
			</View>

			{/* List */}
			{loading ? (
				<View style={styles.loadingContainer}>
					<ActivityIndicator size="small" color="#2563EB" />
				</View>
			) : (
				<ScrollView
					style={styles.scrollView}
					contentContainerStyle={[styles.scrollContent, { paddingBottom: sp(20), gap: sp(10) }]}
					showsVerticalScrollIndicator={false}>
					{/* Kart stili — TV'de daha büyük dokunma hedefi, ama panel
					    yüksekliği sınırlı olduğu için dikey boşluk sıkı. */}
					{(() => {
						const cardStyle = {
							padding: sp(isTV ? 11 : 14),
							gap: sp(12),
							borderRadius: sp(14),
						};
						const cardFocused = {
							borderWidth: 2,
							borderColor: "#E50914",
							backgroundColor: "rgba(229, 9, 20, 0.15)",
							transform: [{ scale: focusScale }],
						};
						const iconBox = {
							width: sp(isTV ? 40 : 44),
							height: sp(isTV ? 40 : 44),
							borderRadius: sp(12),
						};

						return (
							<>
					{/* 1. None Option */}
					<TVPressable
						style={[
							styles.platformCard,
							cardStyle,
							isNoneSelected && styles.platformCardActive,
						]}
						focusedStyle={cardFocused}
						onPress={() => handlePlatformSelect(NONE_PLATFORM)}
						activeOpacity={0.7}>
						<View
							style={[
								styles.iconContainer,
								iconBox,
								{ backgroundColor: "rgba(107, 114, 128, 0.2)" },
							]}>
							<Ionicons
								name="cloud-offline"
								size={sp(22)}
								color="#9ca3af"
							/>
						</View>
						<View style={styles.platformDetails}>
							<Text
								style={[styles.platformName, { fontSize: sp(15) }]}
								numberOfLines={1}>
								None (Hiçbiri)
							</Text>
							<Text
								style={[styles.platformDesc, { fontSize: sp(12), marginTop: sp(3) }]}
								numberOfLines={1}>
								Sadece indirilen ögeleri göster (Çevrimdışı)
							</Text>
						</View>
						<View style={styles.radioWrapper}>
							{isNoneSelected ? (
								<Ionicons
									name="checkmark-circle"
									size={sp(24)}
									color="#2563EB"
								/>
							) : (
								<View
									style={[
										styles.radioCircle,
										{ width: sp(22), height: sp(22), borderRadius: sp(11) },
									]}
								/>
							)}
						</View>
					</TVPressable>

					{/* 2. Random Option */}
					<TVPressable
						style={[styles.platformCard, cardStyle]}
						focusedStyle={cardFocused}
						onPress={handleSelectRandom}
						activeOpacity={0.7}>
						<View
							style={[
								styles.iconContainer,
								iconBox,
								{ backgroundColor: "rgba(37, 99, 235, 0.15)" },
							]}>
							<Ionicons
								name="shuffle"
								size={sp(22)}
								color="#38bdf8"
							/>
						</View>
						<View style={styles.platformDetails}>
							<Text
								style={[styles.platformName, { fontSize: sp(15) }]}
								numberOfLines={1}>
								Random (Rastgele)
							</Text>
							<Text
								style={[styles.platformDesc, { fontSize: sp(12), marginTop: sp(3) }]}
								numberOfLines={1}>
								Aktif eklentiler arasından rastgele birini seç
							</Text>
						</View>
						<Ionicons
							name="chevron-forward"
							size={sp(20)}
							color="#6b7280"
						/>
					</TVPressable>

					{/* 3. Canlı TV — Random kartının BİREBİR kopyası.
					    *
					    * Tek farklar (bileşen, ikon, metin, `onPress`): Random bir
					    * EYLEM kartıdır ve listede kalıcı seçim YAPMAZ; bu kart
					    * bir VARIŞ NOKTASIdır ve yukarıdaki `canliTvAc`
					    * gerekçesiyle seçim zincirine hiç girmemelidir. Aynı
					    * `platformCard` + odak stili kullanıldığı için iki kart
					    * görsel olarak ayırt edilemez — kasıtlı: ikisi de
					    * "listedeki bir eklenti değil, uygulamanın kendi kaynağı"
					    * ailesinden, aynı yerde, aynı biçimde durmalı.
					    *
					    * ⚠️ `activeFilter === "all"` sarmalayıcısı: film/dizi/anime
					    * hapları bir EKLENTİ içeriği türüne göre filtreler; canlı
					    * TV ne film ne dizi ne animedir, dolayısıyla bu
					    * filtrelerde görünmesi kullanıcıya "seçilemeyen bir kart"
					    * izlenimi verirdi. "Tümü" altında ise kart listenin en
					    * üstünde, her zaman ulaşılabilir durumdadır.
					    *
					    * ⚠️ `searchQuery` bu kartı ETKİLEMEZ (Random ile aynı
					    * davranış, kasıtlı tutarlılık): arama kutusu "Eklenti
					    * ara..." yazıyor ve `filteredPlatforms`'u tarıyor; canlı TV
					    * bir eklenti olmadığı için burada listelenmesi zaten
					    * anlamsız. Buna karşılık kullanıcı tam da "canlı" yazıp
					    * kartı arıyorsa kart kaybolmak istemez (ve altındaki
					    * liste süzülürken kart yerinde kalarak "arama yalnız
					    * eklentileri etkiliyor" mesajını görsel olarak verir). */}
					{activeFilter === "all" && (
						<TVPressable
							style={[styles.platformCard, cardStyle]}
							focusedStyle={cardFocused}
							onPress={canliTvAc}
							activeOpacity={0.7}>
							<View
								style={[
									styles.iconContainer,
									iconBox,
									{ backgroundColor: "rgba(229, 9, 20, 0.15)" },
								]}>
								<Ionicons
									name="tv"
									size={sp(22)}
									color="#E50914"
								/>
							</View>
							<View style={styles.platformDetails}>
								<Text
									style={[styles.platformName, { fontSize: sp(15) }]}
									numberOfLines={1}>
									{LIVE_TV_PLATFORM.displayName}
								</Text>
								<Text
									style={[styles.platformDesc, { fontSize: sp(12), marginTop: sp(3) }]}
									numberOfLines={1}>
									{LIVE_TV_PLATFORM.description}
								</Text>
							</View>
							<Ionicons
								name="chevron-forward"
								size={sp(20)}
								color="#6b7280"
							/>
						</TVPressable>
					)}

					{/* Section Divider */}
					<View style={[styles.divider, { marginTop: sp(8), marginBottom: sp(4) }]}>
						<Text
							style={[
								styles.dividerText,
								{ fontSize: sp(12), letterSpacing: sp(0.6) },
							]}>
							Mevcut Eklentiler ({filteredPlatforms.length})
						</Text>
					</View>

					{/* 4. Platform List */}
					{filteredPlatforms.map((platform, index) => {
						const key = platform.id || platform.name || index;
						const isSelected =
							!isNoneSelected &&
							(selectedPlatformId === platform.id ||
								selectedPlatformId === platform.name);
						const kapali = devredeMi(platform);

						return (
							<TVPressable
								key={key}
								// Devrede kaynak: dokunulamaz + TV kumandasında ODAK
								// ALINAMAZ (TVPressable `focusable={!disabled}`).
								disabled={kapali}
								style={[
									styles.platformCard,
									cardStyle,
									isSelected && !kapali && styles.platformCardActive,
									kapali && styles.platformCardDisabled,
								]}
								focusedStyle={kapali ? undefined : cardFocused}
								onPress={() => handlePlatformSelect(platform)}
								activeOpacity={0.7}>
								{platform.favicon ? (
									<Image
										source={{ uri: platform.favicon }}
										style={[
											styles.platformImage,
											iconBox,
											kapali && styles.platformImageDisabled,
										]}
										contentFit="contain"
										transition={0}
										recyclingKey={platform.favicon}
										cachePolicy="memory-disk"
									/>
								) : (
									<View style={[styles.iconContainer, iconBox]}>
										<Text style={[styles.flagEmoji, { fontSize: sp(20) }]}>
											🇹🇷
										</Text>
									</View>
								)}

								<View style={styles.platformDetails}>
									<View style={[styles.titleRow, { gap: sp(7) }]}>
										<Text
											style={[
												styles.platformName,
												{ fontSize: sp(15) },
												kapali && styles.platformNameDisabled,
											]}
											numberOfLines={1}>
											{platform.name}
										</Text>
										{platform.language && (
											<View
												style={[
													styles.langBadge,
													{
														paddingHorizontal: sp(6),
														paddingVertical: sp(2),
														borderRadius: sp(5),
													},
												]}>
												<Text
													style={[
														styles.langText,
														{ fontSize: sp(10) },
													]}>
													{platform.language.toUpperCase()}
												</Text>
											</View>
										)}
										{/* Rozet — yalnız devrede olanlarda */}
										{kapali ? (
											<View
												style={[
													styles.disabledBadge,
													{
														paddingHorizontal: sp(7),
														paddingVertical: sp(3),
														borderRadius: sp(5),
													},
												]}>
												<Text
													style={[
														styles.disabledBadgeText,
														{ fontSize: sp(10) },
													]}>
													Kullanım dışı
												</Text>
											</View>
										) : null}
									</View>
									<Text
										style={[
											styles.platformDesc,
											{ fontSize: sp(12), marginTop: sp(3) },
										]}
										numberOfLines={1}>
										{platform.description ||
											(platform.categories
												? `${platform.categories.length} Kategori`
												: "Aktif Eklenti")}
									</Text>
									{/* Sebep — rozeti tek başına yetersiz */}
									{kapali ? (
										<Text
											style={[
												styles.disabledReason,
												{ fontSize: sp(11), marginTop: sp(4), lineHeight: sp(15) },
											]}
											numberOfLines={2}>
											{platform.son_hata ||
												platform.durum_mesaji ||
												"Siteye ulaşılamıyor."}
										</Text>
									) : null}
								</View>

								<View style={styles.radioWrapper}>
									{kapali ? (
										/* Seçilemeyeceği için onay işareti YANLIŞ
										   yönlendirme yapmamalı; durumu temsil eden
										   bir ikon gösteriyoruz. */
										<Ionicons
											name="ban"
											size={sp(22)}
											color="#6b7280"
										/>
									) : isSelected ? (
										<Ionicons
											name="checkmark-circle"
											size={sp(24)}
											color="#2563EB"
										/>
									) : (
										<View
											style={[
												styles.radioCircle,
												{ width: sp(22), height: sp(22), borderRadius: sp(11) },
											]}
										/>
									)}
								</View>
							</TVPressable>
						);
					})}

					{filteredPlatforms.length === 0 && (
						<View style={[styles.emptyContainer, { padding: sp(32) }]}>
							<Text style={[styles.emptyText, { fontSize: sp(14) }]}>
								Eşleşen eklenti bulunamadı.
							</Text>
						</View>
					)}
							</>
						);
					})()}
				</ScrollView>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
	},
	header: {},
	headerTitle: {
		color: "#ffffff",
		fontWeight: "700",
		letterSpacing: -0.3,
	},
	headerSubtitle: {
		color: "#9ca3af",
	},
	searchBox: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: "#161b22",
		borderRadius: 12,
		paddingHorizontal: 12,
		borderWidth: 1,
		borderColor: "rgba(255, 255, 255, 0.08)",
	},
	searchInput: {
		flex: 1,
		color: "#ffffff",
	},
	filterRow: {
		flexDirection: "row",
	},
	filterPill: {
		backgroundColor: "#161b22",
		borderWidth: 1,
		borderColor: "rgba(255, 255, 255, 0.06)",
	},
	filterPillActive: {
		backgroundColor: "#2563EB",
		borderColor: "#2563EB",
	},
	filterPillText: {
		color: "#9ca3af",
		fontWeight: "500",
	},
	filterPillTextActive: {
		color: "#ffffff",
		fontWeight: "700",
	},
	scrollView: {
		flex: 1,
	},
	scrollContent: {},
	platformCard: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: "#161b22",
		borderWidth: 1,
		borderColor: "rgba(255, 255, 255, 0.06)",
	},
	platformCardActive: {
		borderColor: "#2563EB",
		backgroundColor: "rgba(37, 99, 235, 0.12)",
	},
	iconContainer: {
		justifyContent: "center",
		alignItems: "center",
	},
	flagEmoji: {},
	platformImage: {
		overflow: "hidden",
		backgroundColor: "#21262d",
	},
	platformDetails: {
		flex: 1,
	},
	titleRow: {
		flexDirection: "row",
		alignItems: "center",
	},
	platformName: {
		color: "#ffffff",
		fontWeight: "600",
		flexShrink: 1,
	},
	langBadge: {
		backgroundColor: "rgba(255, 255, 255, 0.1)",
	},
	langText: {
		color: "#9ca3af",
		fontWeight: "700",
	},
	platformDesc: {
		color: "#9ca3af",
	},
	radioWrapper: {
		paddingLeft: 6,
	},
	radioCircle: {
		borderWidth: 2,
		borderColor: "#4b5563",
	},
	divider: {},
	dividerText: {
		color: "#6b7280",
		fontWeight: "600",
		textTransform: "uppercase",
	},
	loadingContainer: {
		padding: 40,
		alignItems: "center",
		justifyContent: "center",
	},
	emptyContainer: {
		alignItems: "center",
	},
	emptyText: {
		color: "#6b7280",
	},

	/*
	 * ── Devre dışı (kullanım dışı) stilleri ──
	 *
	 * Palet mevcut koyu tema ile aynı: kart #161b22, kenarlık
	 * rgba(255,255,255,0.06), ikincil metin #9ca3af.
	 *
	 * `opacity` kartın TAMAMINA uygulanmaz — rozet ve sebep metni de soluk
	 * görünürdü. Bunun yerine metin/renk ayrı ayrı soluklaştırılır, böylece
	 * rozet okunabilir kalır.
	 */
	platformCardDisabled: {
		backgroundColor: "#12161c",
		borderColor: "rgba(255, 255, 255, 0.03)",
	},
	platformImageDisabled: {
		opacity: 0.4,
	},
	platformNameDisabled: {
		color: "#6b7280",
	},
	disabledBadge: {
		backgroundColor: "rgba(239, 68, 68, 0.15)",
		borderWidth: 1,
		borderColor: "rgba(239, 68, 68, 0.4)",
	},
	disabledBadgeText: {
		color: "#f87171",
		fontWeight: "700",
	},
	disabledReason: {
		color: "#6b7280",
	},
	alertBox: {
		flexDirection: "row",
		alignItems: "flex-start",
		backgroundColor: "rgba(245, 158, 11, 0.12)",
		borderWidth: 1,
		borderColor: "rgba(245, 158, 11, 0.35)",
	},
	alertIcon: {
		marginTop: 1,
	},
	alertText: {
		flex: 1,
		color: "#fbbf24",
	},
	infoBox: {
		flexDirection: "row",
		alignItems: "flex-start",
		backgroundColor: "rgba(37, 99, 235, 0.10)",
		borderWidth: 1,
		borderColor: "rgba(96, 165, 250, 0.25)",
	},
	infoText: {
		flex: 1,
		color: "#93c5fd",
	},
});
