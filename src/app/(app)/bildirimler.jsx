/**
 * Bildirimler — Yeni Bölüm Gelen Kutusu
 *
 * Sunucu Faz 2-3'ün ürettiği `notification` satırlarını listeler:
 *   { items, has_more } satırı: id, tmdb_id (media_key), series_title
 *   (NULL — İSTEMCİ yerelde çözer), provider, season, episode,
 *   read_at, created_at.
 *
 * Davranış:
 * - Odağa girince yenilenir; satıra dokunmak tek satırı okundu sayar.
 * - UZUN BASIŞ satırı siler (onaylı); sunucudaki DELETE /{id} ucu yalnız
 *   sahibin satırını siler. İyimser çıkar, sunucu reddederse geri gelir.
 * - Sağ üstteki "Tümü okundu" toplu işaretleme, yanındaki çöp kutusu
 *   ise her şeyi SİLER (onaylı; sunucudaki id'siz DELETE ucu); rozet
 *   (ana ekran kromundaki zil) servisin abonelik yayınıyla güncellenir.
 * - Giriş yoksa sakince bir "hesap gerekli" kartı gösterir — hata fırlatmaz.
 */

import TVPressable from "@/components/common/TVPressable";
import { useThemeContext } from "@/context/ThemeContext";
import { useTvMetrics } from "@/utils/tvMetrics";
import { openLogin } from "@/utils/authRoutes";

import {
	basliklariOku,
	bildirimHedef,
	bildirimHedefeGec,
	bildirimSil,
	bildirimleriTumunuSil,
	gelenKutusuGetir,
	goreceZaman,
	okunduIsaretle,
	okunduTumunuIsaretle,
} from "@/services/bildirimApi";
import { hasSession } from "@/services/token";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import {
	ActivityIndicator,
	Alert,
	BackHandler,
	FlatList,
	RefreshControl,
	StatusBar,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/**
 * Görece satır metni: `series_title` sunucudan NULL gelebilir —
 * yerel başlık anımsatıcısı (tmdb_key → başlık) doldurur. Hiçbiri
 * yoksa genel ifade düşer; karşılaşma her zaman şans lehine.
 */
function satirBasligi(satir, hafiza) {
	const yerel = hafiza[satir.tmdb_id];
	return satir.series_title || yerel || "Takip ettiğin dizi";
}

function sezonBolumEtiketi(satir) {
	return `${satir.season}. Sezon ${satir.episode}. Bölüm`;
}

export default function BildirimlerScreen() {
	const { colors, theme } = useThemeContext();
	const { isTV, sp, contentMaxWidth } = useTvMetrics();
	const router = useRouter();

	const [satirlar, setSatirlar] = useState([]);
	const [yukleniyor, setYukleniyor] = useState(true);
	const [yenileniyor, setYenileniyor] = useState(false);
	const [oturumVar, setOturumVar] = useState(false);
	const [dahaVar, setDahaVar] = useState(false);

	// Yerel başlık anımsatıcısı — çekim başında bir kez okunur.
	const baslikHafizasi = useRef({});
	const hafizayiOkuyucu = useCallback(async () => {
		baslikHafizasi.current = await basliklariOku();
	}, []);

	/**
	 * Liste çekimi. `uygula` basılı sürüm — RefreshControl'den mi
	 * (enekleme göstergesi) yoksa odağa girinden mi ayrıştırır.
	 */
	const basiliCek = useCallback(async ({ sifirla = false } = {}) => {
		if (sifirla) setYenileniyor(true);
		try {
			const oturum = await hasSession();
			setOturumVar(Boolean(oturum));
			if (!oturum) {
				setSatirlar([]);
				setDahaVar(false);
				return;
			}
			await hafizayiOkuyucu();
			const { satirlar: yeniSatirlar, dahaVar } = await gelenKutusuGetir({
				limit: 50,
			});
			setSatirlar(yeniSatirlar);
			setDahaVar(dahaVar);
		} finally {
			setYukleniyor(false);
			if (sifirla) setYenileniyor(false);
		}
	}, [hafizayiOkuyucu]);

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
				else router.replace("/(app)");
				return true;
			};
			const subscription = BackHandler.addEventListener(
				"hardwareBackPress",
				onBackPress,
			);
			return () => subscription.remove();
		}, [router]),
	);

	/** Satıra dokunmak → tek satır okundu (sunucu idempotent). */
	const satiriOkunduSay = async (satir) => {
		if (satir.read_at) return;
		// İyimser yerel damga: ekranda anında "okundu" görünür; sunucuya
		// ulaşılamazsa damga geri alınır (kullanıcı fark edebilir),
		// sonraki çekim sunucu hakikatinden kesinleştirir.
		setSatirlar((eski) =>
			eski.map((e) =>
				e.id === satir.id
					? { ...e, read_at: new Date().toISOString() }
					: e,
			),
		);
		const adet = await okunduIsaretle([satir.id]);
		if (adet === null) {
			// Sunucuya gidemedi — damgayı geri al, kullanıcı fark edebilir.
			setSatirlar((eski) =>
				eski.map((e) =>
					e.id === satir.id ? { ...e, read_at: null } : e,
				),
			);
		}
	};

	const okunmamisAdet = satirlar.filter((s) => !s.read_at).length;

	const tumunuOkunduSay = () => {
		if (okunmamisAdet === 0) return;
		Alert.alert(
			"Tümünü okundu say",
			`${okunmamisAdet} okunmamış bildirim okundu işaretlenecek.`,
			[
				{ text: "Vazgeç", style: "cancel" },
				{
					text: "Okundu say",
					onPress: async () => {
						await okunduTumunuIsaretle();
						// Sunucu idempotent; yereli uzlaşma ile damgala.
						setSatirlar((eski) =>
							eski.map((e) => ({
								...e,
								read_at: e.read_at || new Date().toISOString(),
							})),
						);
					},
				},
			],
		);
	};

	/**
	 * Satıra dokunma (Faz 6 karar 2, 2026-10-23): bölümü DOĞRUDAN
	 * OYNATMA. Satır önce okundu damgası alır (gezinti beklemez);
	 * sunucunun hedef yanıtında dizi sayfa adresi VARSA derin bağ açılır
	 * (ekran hedef bölümü otomatik oynatır). Adres öğrenilmemişse ya da
	 * hatada dokunma klasik davranışa iner — yalnız okundu damgası.
	 */
	const satirAc = async (satir) => {
		void satiriOkunduSay(satir);
		try {
			const hedef = await bildirimHedef(satir.id);
			if (hedef && bildirimHedefeGec(router, hedef)) return;
		} catch (e) {
			console.warn("Bildirim hedefi açılamadı:", e?.message);
		}
	};

	/** Uzun basış → satır silme onayı. İyimser çıkarır; hatada geri koyar. */
	const satiriSil = (satir) => {
		Alert.alert(
			"Bildirimi sil",
			`"${satirBasligi(satir, baslikHafizasi.current)}" listenden silinecek.`,
			[
				{ text: "Vazgeç", style: "cancel" },
				{
					text: "Sil",
					style: "destructive",
					onPress: async () => {
						// İyimser çıkar; sunucu reddederse satır geri gelir
						// (başka cihazda silinmiş olabilir — sonraki çekim
						// sunucu hakikatini zaten kesinleştirir).
						setSatirlar((eski) => eski.filter((e) => e.id !== satir.id));
						const tamam = await bildirimSil(satir.id);
						if (!tamam) {
							setSatirlar((eski) =>
								eski.some((e) => e.id === satir.id)
									? eski
									: [satir, ...eski],
							);
						}
					},
				},
			],
		);
	};

	/** Üst çubuğun toplu silmesi — gelen kutusunu tümüyle boşaltır. */
	const tumunuSil = () => {
		if (satirlar.length === 0) return;
		Alert.alert(
			"Tümünü sil",
			"Gelen kutusundaki tüm bildirimler — okunmuşlar dahil — silinecek. Bu işlem geri alınamaz.",
			[
				{ text: "Vazgeç", style: "cancel" },
				{
					text: "Sil",
					style: "destructive",
					onPress: async () => {
						// İyimser boşalt; sunucu reddederse liste gerçek
						// hakikatinden yeniden kurulur (basiliCek).
						setSatirlar([]);
						setDahaVar(false);
						const adet = await bildirimleriTumunuSil();
						if (adet === null) void basiliCek();
					},
				},
			],
		);
	};

	/** Eski sayfa: `has_more` true ise son satırın `created_at`'i imleçtir. */
	const eskiSayfayiCek = async () => {
		if (!dahaVar || satirlar.length === 0) return;
		const imlec = satirlar[satirlar.length - 1]?.created_at;
		const { satirlar: yeni, dahaVar: devam } = await gelenKutusuGetir({
			limit: 50,
			before: imlec,
		});
		setSatirlar((eski) => [...eski, ...yeni]);
		setDahaVar(devam);
	};

	const satirKutucuk = ({ item }) => {
		const okundu = Boolean(item.read_at);
		return (
			<TVPressable
				onPress={() => satirAc(item)}
				onLongPress={() => satiriSil(item)}
				style={[
					styles.satir,
					{
						backgroundColor: colors.cardBg,
						borderColor: colors.border,
						padding: sp(12 + (isTV ? 2 : 0)),
						borderRadius: sp(14),
					},
				]}
				focusedStyle={styles.satirOdak}>
				<View
					style={[
						styles.satirSimge,
						{
							backgroundColor: okundu
								? "rgba(142, 142, 147, 0.12)"
								: "rgba(229, 9, 20, 0.13)",
							width: sp(38),
							height: sp(38),
							borderRadius: sp(12),
						},
					]}>
					<Ionicons
						name={okundu ? "notifications-off-outline" : "notifications"}
						size={sp(19)}
						color={okundu ? "#8E8E93" : "#E50914"}
					/>
				</View>
				<View style={styles.satirMetinleri}>
					<Text
						style={[
							styles.satirBaslik,
							{
								color: okundu ? colors.textSecondary : colors.text,
								fontSize: sp(isTV ? 16 : 14),
							},
						]}
						numberOfLines={1}>
						{satirBasligi(item, baslikHafizasi.current)}
					</Text>
					<Text
						style={[
							styles.satirAlt,
							{
								color: colors.textSecondary,
								fontSize: sp(isTV ? 13.5 : 12),
							},
						]}
						numberOfLines={1}>
						{sezonBolumEtiketi(item)} • {item.provider} •{" "}
						{goreceZaman(item.created_at)}
					</Text>
				</View>
				{!okundu && <View style={styles.okunmamisNokta} />}
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
				{/* Kendi üst çubuğumuz — sync.jsx ile aynı desen */}
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
						Bildirimler
					</Text>
					{satirlar.length > 0 ? (
						<View style={styles.topBarEylemler}>
							{okunmamisAdet > 0 && (
								<TVPressable
									onPress={tumunuOkunduSay}
									focusedStyle={styles.topBarBtnFocused}
									style={[styles.topBarBtn, styles.topBarBtnMetin]}
									accessibilityLabel="Tümünü okundu say">
									<Text
										style={{ color: "#E50914", fontSize: sp(13.5) }}>
										Tümü okundu
									</Text>
								</TVPressable>
							)}
							<TVPressable
								onPress={tumunuSil}
								focusedStyle={styles.topBarBtnFocused}
								style={styles.topBarBtn}
								accessibilityLabel="Tüm bildirimleri sil">
								<Ionicons
									name="trash-outline"
									size={sp(19)}
									color="#E50914"
								/>
							</TVPressable>
						</View>
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
					<FlatList
						data={satirlar}
						keyExtractor={(item) => String(item.id)}
						renderItem={satirKutucuk}
						ItemSeparatorComponent={() => (
							<View style={{ height: sp(9) }} />
						)}
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
						onEndReached={eskiSayfayiCek}
						onEndReachedThreshold={0.4}
						refreshControl={
							<RefreshControl
								refreshing={yenileniyor}
								onRefresh={() => basiliCek({ sifirla: true })}
								tintColor={colors.textSecondary}
							/>
						}
					/>
				)}
			</SafeAreaView>
		</>
	);
}

/** Oturum yokken gösterilen sessiz kart — `openLogin` akışa geçirir. */
function GirisKart({ sp, colors }) {
	const router = useRouter();
	return (
		<View style={styles.merkezli}>
			<Ionicons name="lock-closed-outline" size={sp(34)} color={colors.textSecondary} />
			<Text
				style={{
					color: colors.text,
					fontSize: sp(15),
					marginTop: sp(10),
					fontWeight: "600",
				}}>
				Bildirimler hesabınla çalışır
			</Text>
			<Text
				style={{
					color: colors.textSecondary,
					fontSize: sp(12.5),
					marginTop: sp(4),
					textAlign: "center",
					maxWidth: sp(260),
				}}>
				Takip ettiğin dizilerin yeni bölüm bildirimlerine girişle ulaşabilirsin.
			</Text>
			<TVPressable
				onPress={() => openLogin(router)}
				focusedStyle={{ opacity: 0.85 }}
				style={{
					marginTop: sp(14),
				}}>
				<View
					style={{
						backgroundColor: "#E50914",
						paddingHorizontal: sp(18),
						paddingVertical: sp(9),
						borderRadius: sp(12),
					}}>
					<Text style={{ color: "#fff", fontWeight: "700", fontSize: sp(13.5) }}>
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
			<Ionicons name="notifications-off-outline" size={sp(34)} color={colors.textSecondary} />
			<Text
				style={{
					color: colors.text,
					fontSize: sp(15),
					marginTop: sp(10),
					fontWeight: "600",
				}}>
				Şimdilik sessiz
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
					'Dizi detayında diziye özel "Yeni bölüm bildirimi"ni açın; takip ettiğin kaynakta yeni bölüm çıktığında buraya düşer.'
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
	topBarBtnMetin: {
		width: undefined,
		paddingHorizontal: 8,
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
	topBarEylemler: {
		flexDirection: "row",
		alignItems: "center",
		gap: 2,
	},
	listeGovde: {
		paddingHorizontal: 14,
		paddingVertical: 12,
		gap: 0,
	},
	satir: {
		flexDirection: "row",
		alignItems: "center",
		borderWidth: 1,
		gap: 11,
	},
	satirOdak: {
		borderColor: "#E50914",
		borderWidth: 2,
		backgroundColor: "rgba(229, 9, 20, 0.10)",
	},
	satirSimge: {
		alignItems: "center",
		justifyContent: "center",
	},
	satirMetinleri: {
		flex: 1,
		gap: 3,
	},
	satirBaslik: {
		fontWeight: "700",
	},
	satirAlt: {},
	okunmamisNokta: {
		width: 9,
		height: 9,
		borderRadius: 5,
		backgroundColor: "#E50914",
		marginRight: 3,
	},
	merkezli: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 24,
	},
});
