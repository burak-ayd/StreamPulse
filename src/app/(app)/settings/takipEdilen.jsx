/**
 * Takip Edilen Diziler — bildirim takip listesinin kendi sayfası
 * (1.0.41; Ayarlar'daki yerleşik liste buraya taşındı).
 *
 * Sunucu `GET /settings-list` satırları listelenir; dizi kartının
 * altında hangi KAYNAKTAN (eklentiden) takip edildiği yazar:
 *   `mode=watched_source` → tek kaynak çipi (satırdaki watched_provider),
 *   `mode=all_sources`    → "Tüm kaynaklar" çipi (o dizinin izlendiği
 *                           bilinen tüm kaynaklardan bildirim gelir).
 *
 * Sıralama:
 *   A-Z / Z-A               → görünen başlığa göre (yerel anımsatıcı
 *                             doldurur; bilinmeyen başlık "Dizi #n"
 *                             düzeyine düşer),
 *   Yeni→Eski / Eski→Yeni   → satırın `created_at`'ına göre (eklenme
 *                             zamanı sunucu 1.14.7+'dan gelir).
 *
 * Filtre: kaynak adı çipleri. `all_sources` dizisi HER kaynaktan
 * bildirim aldığı için kaynak süzgeçlerinde de çıkar; çipi bunu
 * doğrular. Anahtar düğmesiyle aç/kapat (aç/kapat akışı Ayarlar'dan
 * taşındı — dizi başına TEK satır; sunucu upsert `(user_id, tmdb_id)`).
 *
 * ÇIKARMA (1.0.42): kartta çöp düğmesi ya da UZUN BASIŞ — sunucudan
 * tercih satırı SİLİNİR (DELETE /settings; 1.14.8+ ucu), listede
 * kalmaz. Aç/kapattan farkı budur: kapatmak satırı susturur, çıkarma
 * satırı siler. Onaylı; iyimser çıkarılır, hata da geri gelir.
 */

import TVPressable from "@/components/common/TVPressable";
import { useThemeContext } from "@/context/ThemeContext";
import { useTvMetrics } from "@/utils/tvMetrics";
import { openLogin } from "@/utils/authRoutes";
import {
	basliklariOku,
	bildirimTercihListesi,
	tercihSil,
	tercihYaz,
} from "@/services/bildirimApi";
import { hasSession } from "@/services/token";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
	ActivityIndicator,
	Alert,
	BackHandler,
	FlatList,
	RefreshControl,
	ScrollView,
	StatusBar,
	StyleSheet,
	Switch,
	Text,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/** Sıralama çeşitleri — çip metinleriyle tek yerde (temel dörtlü). */
const SIRALAR = [
	{ id: "az", metin: "A→Z" },
	{ id: "za", metin: "Z→A" },
	{ id: "yeni", metin: "Yeni→Eski" },
	{ id: "eski", metin: "Eski→Yeni" },
];

/**
 * Kaynak çip metni: watched_source'ta kaynak adının kendisi,
 * all_sources'ta "Tüm kaynaklar".
 */
function kaynakEtiketi(satir) {
	if (satir.mode === "all_sources") return "Tüm kaynaklar";
	return satir.watched_provider || "Bilinmeyen kaynak";
}

export default function TakipEdilenDizilerScreen() {
	const { colors, theme } = useThemeContext();
	const { isTV, sp, contentMaxWidth } = useTvMetrics();
	const router = useRouter();

	const [satirlar, setSatirlar] = useState([]);
	const [magaza, setMagaza] = useState({});
	const [yukleniyor, setYukleniyor] = useState(true);
	const [yenileniyor, setYenileniyor] = useState(false);
	const [oturumVar, setOturumVar] = useState(false);
	const [yaziyor, setYaziyor] = useState(null);
	/** "tumu" | "tum_kaynaklar" | kaynak adı */
	const [filtre, setFiltre] = useState("tumu");
	const [siralama, setSiralama] = useState("az");

	const basiliCek = useCallback(async ({ sifirla = false } = {}) => {
		if (sifirla) setYenileniyor(true);
		try {
			const oturum = await hasSession();
			setOturumVar(Boolean(oturum));
			if (!oturum) {
				setSatirlar([]);
				setMagaza({});
				return;
			}
			const [yeniSatirlar, yeniMagaza] = await Promise.all([
				bildirimTercihListesi(),
				basliklariOku(),
			]);
			setSatirlar(yeniSatirlar);
			setMagaza(yeniMagaza ?? {});
		} finally {
			setYukleniyor(false);
			if (sifirla) setYenileniyor(false);
		}
	}, []);

	// Odağa her girişte (ve dönüşte) tazelensin.
	useFocusEffect(
		useCallback(() => {
			void basiliCek();
		}, [basiliCek]),
	);

	useFocusEffect(
		useCallback(() => {
			const onBackPress = () => {
				if (router.canGoBack()) router.back();
				else router.replace("/(app)/settings");
				return true;
			};
			const subscription = BackHandler.addEventListener(
				"hardwareBackPress",
				onBackPress,
			);
			return () => subscription.remove();
		}, [router]),
	);

	/** Anahtar düğmesi — Ayarlar'dan taşınan bekleyen yazım (tek satır/dizi). */
	const gecistir = useCallback(
		async (satir) => {
			if (yaziyor) return;
			const tekrar = !satir.enabled;
			setYaziyor(satir.tmdb_id);
			// İyimser gösterim: sunucu onayına kadar yeni değer; hatada geri.
			setSatirlar((eski) =>
				eski.map((s) =>
					s.tmdb_id === satir.tmdb_id ? { ...s, enabled: tekrar } : s,
				),
			);
			const sonuc = await tercihYaz({
				tmdbId: satir.tmdb_id,
				enabled: tekrar,
				mode: satir.mode || "watched_source",
				watchedProvider: satir.watched_provider ?? null,
			});
			setYaziyor(null);
			if (!sonuc.ok) {
				setSatirlar((eski) =>
					eski.map((s) =>
						s.tmdb_id === satir.tmdb_id
							? { ...s, enabled: satir.enabled }
							: s,
					),
				);
				Alert.alert(
					"Bildirim ayarı yazılamadı",
					sonuc.mesaj || "Sunucuya ulaşılamadı.",
				);
				return;
			}
			if (sonuc.data) {
				// Sunucunun kanonik yanıtını satıra işle
				// (all_sources → watched_provider NULL temizliği dahil).
				setSatirlar((eski) =>
					eski.map((s) =>
						s.tmdb_id === satir.tmdb_id ? { ...s, ...sonuc.data } : s,
					),
				);
			}
		},
		[yaziyor],
	);

	/** Filtre çip adayları: Tümü + (varsa) Tüm kaynaklar + kaynak adları. */
	const kaynakCipleri = useMemo(() => {
		const adlar = new Set();
		let tumKaynakVar = false;
		for (const s of satirlar) {
			if (s.mode === "all_sources") {
				tumKaynakVar = true;
				continue;
			}
			if (s.watched_provider) adlar.add(s.watched_provider);
		}
		return [
			{ id: "tumu", metin: `Tümü (${satirlar.length})` },
			...(tumKaynakVar
				? [
						{
							id: "tum_kaynaklar",
							metin: "Tüm kaynaklar",
						},
					]
				: []),
			...[...adlar]
				.sort((a, b) => a.localeCompare(b, "tr"))
				.map((ad) => ({ id: ad, metin: ad })),
		];
	}, [satirlar]);

	/**
	 * Süzgeç düşüşü: seçili kapı son satırın çıkmasıyla boş alırsa
	 * görünüm sessizce "Tümü"ne iner (çip kaybolur, seçim çipe bağlı).
	 */
	const gecerliFiltre = kaynakCipleri.some((c) => c.id === filtre)
		? filtre
		: "tumu";

	/**
	 * Satırı listeden ÇIKAR (1.0.42): onaylı — sunucudan tercih satırı
	 * SİLİNİR (tercihSil; 1.14.8+ ucu). Aç/kapatun tersi değildir:
	 * kapatım satırı susturur, çıkarma satırı siler. İyimser çıkar;
	 * sunucu reddederse satır geri gelir (başka cihazla yarışta satır
	 * az önce silinmiş olabilir — tekrar deneme).
	 */
	const satiriCikar = useCallback(
		(satir) => {
			// gorunen'den gelen biçimli satırda etiket hazır; çıplak
			// satırdaysa (yeniden eklem akışında) aynı çözüm uygulanır.
			const etiket =
				satir.etiket ??
				magaza[satir.tmdb_id] ??
				`Dizi #${String(satir.tmdb_id).replace(/[^0-9]/g, "")}`;
			Alert.alert(
				"Takipten çıkar",
				`"${etiket}" bildirim takibinden çıkar; listede görünmez ve bölüm bildirimi verilmez. Dizinin sayfasında yeniden takip kurabilirsin.`,
				[
					{ text: "Vazgeç", style: "cancel" },
					{
						text: "Çıkar",
						style: "destructive",
						onPress: async () => {
							// İyimser çıkar; hata tüm satırı geri koyar.
							setSatirlar((eski) =>
								eski.filter((s) => s.tmdb_id !== satir.tmdb_id),
							);
							const tamam = await tercihSil({
								tmdbId: satir.tmdb_id,
							});
							if (!tamam) {
								setSatirlar((eski) =>
									eski.some((s) => s.tmdb_id === satir.tmdb_id)
										? eski
										: [satir, ...eski],
								);
								Alert.alert(
									"Çıkarılamadı",
									"Sunucuya ulaşılamadı; satır listede bırakıldı.",
								);
							}
						},
					},
				],
			);
		},
		[magaza],
	);

	/** Çekim hâli: etiket + eklenme zamanı (Eksik zaman → 0). */
	const sekilli = useMemo(
		() =>
			satirlar.map((s) => ({
				...s,
				etiket:
					magaza[s.tmdb_id] ??
					`Dizi #${String(s.tmdb_id).replace(/[^0-9]/g, "")}`,
				zaman: new Date(s.created_at ?? "").getTime() || 0,
			})),
		[satirlar, magaza],
	);

	/** Süzgeç + sırala: all_sources dizisi her kaynak süzgeçine de girer. */
	const gorunen = useMemo(() => {
		let liste = sekilli;
		if (gecerliFiltre === "tum_kaynaklar") {
			liste = sekilli.filter((s) => s.mode === "all_sources");
		} else if (gecerliFiltre !== "tumu") {
			liste = sekilli.filter(
				(s) =>
					s.mode === "all_sources" || s.watched_provider === gecerliFiltre,
			);
		}
		const kopya = [...liste];
		switch (siralama) {
			case "za":
				kopya.sort((a, b) => b.etiket.localeCompare(a.etiket, "tr"));
				break;
			case "yeni":
				kopya.sort((a, b) => b.zaman - a.zaman);
				break;
			case "eski":
				kopya.sort((a, b) => a.zaman - b.zaman);
				break;
			default:
				kopya.sort((a, b) => a.etiket.localeCompare(b.etiket, "tr"));
		}
		return kopya;
	}, [sekilli, gecerliFiltre, siralama]);

	/** Tek dizi kartı: başlık + kaynak çip(ler)i + çöp + anahtar düğmesi. */
	const kartKutucuk = ({ item }) => {
		const acik = Boolean(item.enabled);
		return (
			<TVPressable
				onLongPress={() => satiriCikar(item)}
				focusedStyle={styles.kartOdak}
				style={[
					styles.kart,
					{
						backgroundColor: colors.cardBg,
						borderColor: colors.border,
						opacity: acik ? 1 : 0.62,
						padding: sp(12 + (isTV ? 2 : 0)),
						borderRadius: sp(14),
					},
				]}>
				<View
					style={[
						styles.kartSimge,
						{
							width: sp(38),
							height: sp(38),
							borderRadius: sp(12),
						},
					]}>
					<Ionicons name="tv-outline" size={sp(19)} color="#E50914" />
				</View>
				<View style={styles.kartGovde}>
					<Text
						style={[
							styles.kartBaslik,
							{
								color: acik ? colors.text : colors.textSecondary,
								fontSize: sp(isTV ? 16 : 14),
							},
						]}
						numberOfLines={1}>
						{item.etiket}
					</Text>
					<View style={styles.kartCipSatiri}>
						<View
							style={[
								styles.kartCip,
								{
									backgroundColor: "rgba(229, 9, 20, 0.10)",
									borderColor: "rgba(229, 9, 20, 0.28)",
									borderRadius: sp(7),
								},
							]}>
							<Ionicons
								name={item.mode === "all_sources" ? "albums" : "link"}
								size={sp(11)}
								color="#E50914"
							/>
							<Text
								style={{
									color: "#E50914",
									fontSize: sp(11),
									fontWeight: "600",
								}}>
								{kaynakEtiketi(item)}
							</Text>
						</View>
					</View>
				</View>
				<TVPressable
					onPress={() => satiriCikar(item)}
					style={styles.kartCop}
					focusedStyle={styles.cipOdak}
					accessibilityLabel={`${item.etiket} takipten çıkar`}>
					<Ionicons
						name="trash-outline"
						size={sp(17)}
						color="#E50914"
					/>
				</TVPressable>
				<Switch
					value={acik}
					trackColor={{
						false: colors.border,
						true: "#FF3D5E",
					}}
					thumbColor="#ffffff"
					disabled={yaziyor === item.tmdb_id}
					onValueChange={() => void gecistir(item)}
				/>
			</TVPressable>
		);
	};

	return (
		<>
			<Stack.Screen options={{ headerShown: false }} />
			<SafeAreaView
				edges={["top", "left", "right", "bottom"]}
				style={[styles.container, { backgroundColor: colors.bg }]}>
				<StatusBar
					barStyle={theme === "dark" ? "light-content" : "dark-content"}
					backgroundColor={colors.bg}
				/>
				{/* Kendi üst çubuğumuz — bildirimler.jsx ile aynı desen */}
				<View
					style={[
						styles.topBar,
						{
							borderBottomColor: colors.border,
							backgroundColor: colors.bg,
						},
					]}>
					<TVPressable
						onPress={() => router.back()}
						focusedStyle={styles.topBarBtnFocused}
						style={styles.topBarBtn}
						accessibilityLabel="Geri">
						<Ionicons name="arrow-back" size={22} color={colors.text} />
					</TVPressable>
					<Text style={[styles.topBarTitle, { color: colors.text }]}>
						Takip Edilen Diziler
					</Text>
					{satirlar.length > 0 ? (
						<Text
							style={{
								color: colors.textSecondary,
								fontSize: sp(13),
								fontWeight: "600",
							}}>
							{satirlar.length} dizi
						</Text>
					) : (
						<View style={styles.topBarSpacer} />
					)}
				</View>

				{!oturumVar && !yukleniyor ? (
					<GirisKart sp={sp} colors={colors} />
				) : yukleniyor ? (
					<View style={styles.merkezli}>
						<ActivityIndicator color="#E50914" />
					</View>
				) : satirlar.length === 0 ? (
					<BosDurum sp={sp} colors={colors} />
				) : (
					<View style={styles.govde}>
						{/* Süzge + sıralama çipleri — TV'de merkezeli sütun */}
						<View
							style={[
								styles.cipAlan,
								contentMaxWidth
									? {
											alignSelf: "center",
											width: "100%",
											maxWidth: contentMaxWidth,
										}
									: null,
							]}>
							<Text
								style={{ color: colors.textSecondary, fontSize: sp(11) }}>
								KAYNAK
							</Text>
							<ScrollView
								horizontal
								showsHorizontalScrollIndicator={false}
								contentContainerStyle={styles.cipSatir}>
								{kaynakCipleri.map((cip) => (
									<Cip
										key={cip.id}
										sp={sp}
										metin={cip.metin}
										secili={filtre === cip.id}
										onPress={() => setFiltre(cip.id)}
									/>
								))}
							</ScrollView>
							<Text
								style={{ color: colors.textSecondary, fontSize: sp(11) }}>
								SIRA
							</Text>
							<ScrollView
								horizontal
								showsHorizontalScrollIndicator={false}
								contentContainerStyle={styles.cipSatir}>
								{SIRALAR.map((cip) => (
									<Cip
										key={cip.id}
										sp={sp}
										metin={cip.metin}
										secili={siralama === cip.id}
										onPress={() => setSiralama(cip.id)}
									/>
								))}
							</ScrollView>
						</View>
						<FlatList
							data={gorunen}
							keyExtractor={(item) => item.tmdb_id}
							renderItem={kartKutucuk}
							ItemSeparatorComponent={() => (
								<View style={{ height: sp(9) }} />
							)}
							ListEmptyComponent={
								<Text style={{ color: colors.textSecondary, padding: sp(14) }}>
									Bu süzgeçte dizi yok.
								</Text>
							}
							contentContainerStyle={[
								styles.listeGovde,
								contentMaxWidth
									? {
											alignSelf: "center",
											width: "100%",
											maxWidth: contentMaxWidth,
										}
									: null,
							]}
							refreshControl={
								<RefreshControl
									refreshing={yenileniyor}
									onRefresh={() => basiliCek({ sifirla: true })}
									tintColor={colors.textSecondary}
								/>
							}
						/>
					</View>
				)}
			</SafeAreaView>
		</>
	);
}

/** Çip düğmesi — seçiliyse kırmızı dolgulu. */
function Cip({ sp, metin, secili, onPress }) {
	return (
		<TVPressable
			onPress={onPress}
			style={[
				styles.cip,
				{
					borderRadius: sp(9),
					paddingVertical: sp(6),
					paddingHorizontal: sp(12),
					backgroundColor: secili ? "rgba(229, 9, 20, 0.16)" : "transparent",
				},
			]}
			focusedStyle={styles.cipOdak}>
			<Text
				style={{
					color: secili ? "#E50914" : "#8E8E93",
					fontSize: sp(12.5),
					fontWeight: secili ? "700" : "600",
				}}>
				{metin}
			</Text>
		</TVPressable>
	);
}

/** Oturum yokken gösterilen sessiz kart — `openLogin` akışa geçirir. */
function GirisKart({ sp, colors }) {
	const router = useRouter();
	return (
		<View style={styles.merkezli}>
			<Ionicons
				name="lock-closed-outline"
				size={sp(34)}
				color={colors.textSecondary}
			/>
			<Text
				style={{
					color: colors.text,
					fontSize: sp(15),
					marginTop: sp(10),
					fontWeight: "600",
				}}>
				Takip listesi hesabınla çalışır
			</Text>
			<Text
				style={{
					color: colors.textSecondary,
					fontSize: sp(12.5),
					marginTop: sp(4),
					textAlign: "center",
					maxWidth: sp(260),
				}}>
				Bildirim takiplerini girişle yönetebilirsin.
			</Text>
			<TVPressable
				onPress={() => openLogin(router)}
				focusedStyle={{ opacity: 0.85 }}
				style={{ marginTop: sp(14) }}>
				<View
					style={{
						backgroundColor: "#E50914",
						paddingHorizontal: sp(18),
						paddingVertical: sp(9),
						borderRadius: sp(12),
					}}>
					<Text
						style={{
							color: "#fff",
							fontWeight: "700",
							fontSize: sp(13.5),
						}}>
						Giriş yap
					</Text>
				</View>
			</TVPressable>
		</View>
	);
}

function BosDurum({ sp, colors }) {
	return (
		<View style={styles.merkezli}>
			<Ionicons
				name="television-outline"
				size={sp(34)}
				color={colors.textSecondary}
			/>
			<Text
				style={{
					color: colors.text,
					fontSize: sp(15),
					marginTop: sp(10),
					fontWeight: "600",
				}}>
				Henüz takip yok
			</Text>
			<Text
				style={{
					color: colors.textSecondary,
					fontSize: sp(12.5),
					marginTop: sp(4),
					textAlign: "center",
					maxWidth: sp(260),
				}}>
				{
					'Dizi detayında diziye özel "Yeni bölüm bildirimi"ni açın; izlediğin diziler bu listeye yazar.'
				}
			</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	container: { flex: 1 },
	topBar: {
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: 14,
		paddingVertical: 10,
		borderBottomWidth: 1,
		gap: 10,
	},
	topBarBtn: {
		width: 38,
		height: 38,
		alignItems: "center",
		justifyContent: "center",
		borderRadius: 10,
	},
	topBarBtnFocused: {
		backgroundColor: "rgba(229, 9, 20, 0.18)",
	},
	topBarTitle: {
		fontSize: 17,
		fontWeight: "700",
		flex: 1,
	},
	topBarSpacer: { width: 38 },
	govde: { flex: 1 },
	cipAlan: { paddingHorizontal: 14, paddingTop: 10, gap: 6 },
	cipSatir: { flexDirection: "row", gap: 8, paddingVertical: 4 },
	cip: {
		borderWidth: 1,
		borderColor: "rgba(128, 128, 128, 0.25)",
		alignItems: "center",
		justifyContent: "center",
	},
	cipOdak: { opacity: 0.85 },
	kart: {
		flexDirection: "row",
		alignItems: "center",
		borderWidth: 1,
		gap: 11,
		paddingHorizontal: 12,
		paddingVertical: 10,
	},
	kartSimge: {
		backgroundColor: "rgba(229, 9, 20, 0.13)",
		alignItems: "center",
		justifyContent: "center",
	},
	kartGovde: { flex: 1, gap: 5 },
	kartBaslik: { fontWeight: "700" },
	kartCipSatiri: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
	kartCip: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		borderWidth: 1,
		paddingHorizontal: 8,
		paddingVertical: 3,
	},
	kartCop: {
		width: 30,
		height: 30,
		alignItems: "center",
		justifyContent: "center",
		borderRadius: 8,
		marginRight: 2,
	},
	kartOdak: {
		borderColor: "rgba(229, 9, 20, 0.55)",
	},
	listeGovde: {
		paddingHorizontal: 14,
		paddingVertical: 12,
		gap: 0,
	},
	merkezli: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		padding: 20,
	},
});
