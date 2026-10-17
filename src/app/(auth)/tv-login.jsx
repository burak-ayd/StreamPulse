/**
 * TV Giriş Ekranı — Kod ve QR ile Oturum Açma
 *
 * TV'de kumandayla e-posta/parola yazmak işkencedir; bu yüzden TV'nin
 * VARSAYILAN giriş ekranı budur (plan §4.1). Sol sütunda QR (telefondan
 * okutulur), sağ sütunda 6 haneli kod durur; TV sunucuyu `interval` saniyede
 * bir yoklar ve kod onaylandığı anda KENDİ GoTrue oturumunu devralır
 * (`AuthContext.adoptSession`).
 *
 * ⚠️ Neden `setTimeout` zinciri, `setInterval` değil: yoklama aralığı sabit
 * değildir — sunucu `202` yanıtında `interval`, `429` yanıtında `Retry-After`
 * gönderir. Sabit aralıklı bir `setInterval` bu değerleri yok sayar ve sunucu
 * "çok hızlı yokluyorsun" dediği hâlde istemci aynı hızda devam ederdi.
 *
 * ⚠️ IPTV/TV tuzağı: bu ekran telefon akışının TERSİDİR. Kod TELEFONDA
 * girilir, oturum TV'de açılır. Bu yüzden burada kamera aranmaz.
 */

import TVPressable from "@/components/common/TVPressable";
import { useAuth } from "@/context/AuthContext";
import { useThemeContext } from "@/context/ThemeContext";
import { pollDeviceToken, requestDeviceCode } from "@/services/deviceAuth";
import { getDeviceInfo } from "@/utils/deviceId";
import { useTvMetrics } from "@/utils/tvMetrics";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
	ActivityIndicator,
	BackHandler,
	ScrollView,
	StatusBar,
	StyleSheet,
	Text,
	View,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import { SafeAreaView } from "react-native-safe-area-context";

/** Sunucu bir aralık bildirmezse kullanılan yoklama süresi (saniye). */
const VARSAYILAN_YOKLAMA_SN = 3;

/** Sarı/sunucu hatasında (kod hâlâ geçerli) yoklama süresi (saniye). */
const HATA_SONRASI_YOKLAMA_SN = 5;

/**
 * Geri sayımı `04:59` biçiminde yazar.
 * @param {number} saniye
 * @returns {string}
 */
function geriSayimMetni(saniye) {
	const guvenli = Math.max(0, Math.floor(saniye));
	const dakika = Math.floor(guvenli / 60);
	const kalan = guvenli % 60;
	return `${String(dakika).padStart(2, "0")}:${String(kalan).padStart(2, "0")}`;
}

export default function TvLoginScreen() {
	const { colors, theme } = useThemeContext();
	const { adoptSession } = useAuth();
	const router = useRouter();
	const { isTV, sp, width } = useTvMetrics();

	/** Sunucudan gelen kod paketi (`device_code`, `user_code`, `qr_data`, …). */
	const [kod, setKod] = useState(null);
	/** hazirlaniyor | bekliyor | onaylandi | hata */
	const [durum, setDurum] = useState("hazirlaniyor");
	const [mesaj, setMesaj] = useState("");
	const [kalan, setKalan] = useState(0);

	/** Kod isteği sürerken ikinci bir isteği engeller (süre + buton + 410). */
	const istekSuruyor = useRef(false);
	/** Bileşen söküldüyse geç gelen yanıtları yok sayar. */
	const sokuldu = useRef(false);
	/**
	 * Onaylandıktan SONRA kurulan oturum token'ları.
	 *
	 * Neden saklanır: `adoptSession` yalnızca `/me` adımında geçici olarak
	 * düşerse (ağ/5xx) oturum SAĞLAMDIR ama kimlik çekilememiştir. Kullanıcıyı
	 * yeniden koda göndermek yerine aynı token'larla tekrar denenir.
	 *
	 * ⚠️ `useRef` DEĞİL `useState`: butonun etiketi ("Tekrar Dene" / "Kodu
	 * Yenile") bu değere BAĞLI. Ref'te tutulsaydı değer sessizce değişir,
	 * ekran yeniden çizilmediği için etiket yanlış kalırdı.
	 */
	const [bekleyenTokenlar, setBekleyenTokenlar] = useState(null);

	// ─── Kapat / geri ────────────────────────────────────
	const kapat = useCallback(() => {
		if (router.canGoBack()) router.back();
		else router.replace("/(app)");
	}, [router]);

	// ODAK'a bağlı kayıt: ekran odakta değilken geri tuşunu yutmaz.
	useFocusEffect(
		useCallback(() => {
			const alt = BackHandler.addEventListener("hardwareBackPress", () => {
				kapat();
				return true;
			});
			return () => alt.remove();
		}, [kapat]),
	);

	useEffect(() => {
		sokuldu.current = false;
		return () => {
			sokuldu.current = true;
		};
	}, []);

	// ─── Yeni kod iste ───────────────────────────────────
	const yeniKod = useCallback(async () => {
		// Çift tetikleme koruması: süre dolumu, `410` yanıtı ve kullanıcı
		// düğmesi aynı anda gelebilir; üç istek kod sınırını boşa harcardı.
		if (istekSuruyor.current) return;
		istekSuruyor.current = true;

		setKod(null);
		setDurum("hazirlaniyor");
		setMesaj("");
		setBekleyenTokenlar(null);

		try {
			const cihaz = await getDeviceInfo();
			const yanit = await requestDeviceCode(cihaz);
			if (sokuldu.current) return;
			setKod(yanit);
			setKalan(Number(yanit?.expires_in) || 300);
			setDurum("bekliyor");
		} catch (hata) {
			if (sokuldu.current) return;
			setDurum("hata");
			setMesaj(
				hata?.message ||
					"TV kodu alınamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.",
			);
		} finally {
			istekSuruyor.current = false;
		}
	}, []);

	// İlk kod: ekran açılır açılmaz istenir.
	useEffect(() => {
		// Bu çağrı DIŞ SİSTEME (depo + ağ) bağlanır ve yalnızca ilk çizimde
		// gereklidir; effect içinden tetiklenmesi bilinçlidir.
		// eslint-disable-next-line react-hooks/set-state-in-effect
		yeniKod();
	}, [yeniKod]);

	// ─── Geri sayım ──────────────────────────────────────
	useEffect(() => {
		if (durum !== "bekliyor" || !kod) return;
		const zamanlayici = setInterval(() => {
			setKalan((onceki) => (onceki > 0 ? onceki - 1 : 0));
		}, 1000);
		return () => clearInterval(zamanlayici);
	}, [durum, kod]);

	// Süre doldu → TV kendi kendine yeni kod ister (kullanıcı bir şey yapmaz).
	// Yoklamanın `410` yanıtı ikinci savunma hattıdır; ikisi de `yeniKod`un
	// çift tetikleme korumasından geçer.
	useEffect(() => {
		if (durum === "bekliyor" && kod && kalan <= 0) {
			// eslint-disable-next-line react-hooks/set-state-in-effect
			yeniKod();
		}
	}, [durum, kod, kalan, yeniKod]);

	// ─── Yoklama döngüsü ─────────────────────────────────
	useEffect(() => {
		if (durum !== "bekliyor" || !kod?.device_code) return;

		let iptal = false;
		let zamanlayici = null;

		const yokla = async () => {
			const sonuc = await pollDeviceToken(kod.device_code);
			if (iptal || sokuldu.current) return;

			switch (sonuc.kind) {
				case "approved": {
					setDurum("onaylandi");
					iptal = true; // döngü bitti; yeni bir yoklama zamanlanmaz
					setBekleyenTokenlar(sonuc.tokens);
					try {
						await adoptSession(sonuc.tokens);
						// Oturum açıldı. Yığın doluysa `(auth)` layout'u bizi
						// geri alır (kullanıcı nereden geldiyse oraya döner);
						// yığın boşsa (TV doğrudan bu ekranda açıldıysa) ana
						// sayfaya geçilir.
						if (!router.canGoBack()) router.replace("/(app)");
					} catch (hata) {
						// `auth` (401) → token gerçekten ölü; yeni kod şart.
						if (hata?.statusCode === 401) setBekleyenTokenlar(null);
						setDurum("hata");
						setMesaj(
							hata?.message ||
								"Oturum açılamadı. Lütfen tekrar deneyin.",
						);
					}
					return;
				}

				case "pending":
					zamanlayici = setTimeout(
						yokla,
						(sonuc.interval || VARSAYILAN_YOKLAMA_SN) * 1000,
					);
					return;

				case "throttled":
					// Sunucu "yavaş" dedi: `Retry-After` kadar beklenir.
					zamanlayici = setTimeout(
						yokla,
						(sonuc.retryAfter || 10) * 1000,
					);
					return;

				case "expired":
				case "invalid":
					// Kod öldü (süre doldu / tüketildi): TV yenisini üretir.
					yeniKod();
					return;

				default:
					// Ağ/sunucu hatası: kod hâlâ geçerli olabilir, yoklama sürer.
					zamanlayici = setTimeout(yokla, HATA_SONRASI_YOKLAMA_SN * 1000);
					return;
			}
		};

		zamanlayici = setTimeout(
			yokla,
			(kod.interval || VARSAYILAN_YOKLAMA_SN) * 1000,
		);

		return () => {
			iptal = true;
			if (zamanlayici) clearTimeout(zamanlayici);
		};
	}, [durum, kod, adoptSession, router, yeniKod]);

	// ─── Elle tekrar dene ────────────────────────────────
	const tekrarDene = useCallback(async () => {
		// Token varsa kod YENİDEN İSTENMEZ: oturum sağlam, yalnızca kimlik
		// adımı düşmüştür (bkz. `bekleyenTokenlar` durumu).
		if (!bekleyenTokenlar) {
			yeniKod();
			return;
		}

		setDurum("onaylandi");
		setMesaj("");
		try {
			await adoptSession(bekleyenTokenlar);
			if (!router.canGoBack()) router.replace("/(app)");
		} catch (hata) {
			if (hata?.statusCode === 401) setBekleyenTokenlar(null);
			setDurum("hata");
			setMesaj(hata?.message || "Oturum açılamadı. Lütfen tekrar deneyin.");
		}
	}, [adoptSession, bekleyenTokenlar, router, yeniKod]);

	// ─── Görsel ölçüler ──────────────────────────────────
	const qrBoyut = Math.max(180, Math.min(sp(250), width * 0.24));
	const kodMetni = (kod?.user_code ?? "").padEnd(6, " ").slice(0, 6);
	const kodKarakterleri = kodMetni.split("");
	const surekliUyari = kalan > 0 && kalan <= 60;
	const bekliyor = durum === "bekliyor";

	return (
		<>
			<Stack.Screen options={{ headerShown: false }} />
			<SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
				<StatusBar
					barStyle={theme === "dark" ? "light-content" : "dark-content"}
					backgroundColor={colors.bg}
				/>
				<ScrollView
					contentContainerStyle={[
						styles.icerik,
						{ paddingHorizontal: isTV ? sp(56) : 24 },
					]}
					showsVerticalScrollIndicator={false}>
					{/* Üst şerit: kapat + başlık */}
					<View style={styles.ustSatir}>
						<TVPressable
							style={styles.kapatDugmesi}
							focusedStyle={styles.kapatDugmesiOdak}
							onPress={kapat}
							activeOpacity={0.7}>
							<Ionicons name="close" size={sp(28)} color={colors.text} />
						</TVPressable>
						<View style={styles.baslikBlogu}>
							<Text
								style={[
									styles.baslik,
									{ color: colors.text, fontSize: sp(26) },
								]}>
								TV’de Oturum Aç
							</Text>
							<Text
								style={[
									styles.altBaslik,
									{
										color: colors.textSecondary,
										fontSize: sp(14),
										maxWidth: isTV ? width * 0.62 : undefined,
									},
								]}>
								TV’ye e-posta ve parola yazmanıza gerek yok — telefonunuzdan
								saniyeler içinde bağlayın.
							</Text>
						</View>
					</View>

					{/* İki sütun: solda QR, sağda kod */}
					<View style={[styles.sutunlar, isTV && styles.sutunlarYanYana]}>
						{/* ── SOL: QR ile anında giriş ── */}
						<View style={styles.qrSutunu}>
							<View
								style={[
									styles.qrKarti,
									{ borderColor: colors.border, padding: sp(14) },
								]}>
								{kod?.qr_data ? (
									<QRCode
										value={kod.qr_data}
										size={qrBoyut}
										backgroundColor="#FFFFFF"
										color="#0B1220"
									/>
								) : (
									<View
										style={{
											width: qrBoyut,
											height: qrBoyut,
											alignItems: "center",
											justifyContent: "center",
										}}>
										<ActivityIndicator color="#38bdf8" />
									</View>
								)}
							</View>
							<Text
								style={[
									styles.qrAciklama,
									{
										color: colors.textSecondary,
										fontSize: sp(13),
										maxWidth: qrBoyut + sp(40),
									},
								]}>
								StreamPulse mobil uygulamasında <Text style={styles.vurgu}>Ayarlar → TV’de
								Oturum Aç</Text> ekranından bu QR kodu okutun.
							</Text>
						</View>

						{/* ── SAĞ: kod ile giriş ── */}
						<View style={styles.kodSutunu}>
							<Text
								style={[
									styles.bolumBasligi,
									{ color: colors.textSecondary, fontSize: sp(12) },
								]}>
								VEYA TELEFONUNUZA BU KODU GİRİN
							</Text>

							<View style={styles.kodSatiri}>
								{kodKarakterleri.map((karakter, sira) => (
									<React.Fragment key={`hane-${sira}`}>
										{sira === 3 ? (
											<Text
												style={[
													styles.tire,
													{ color: colors.textSecondary, fontSize: sp(30) },
												]}>
												–
											</Text>
										) : null}
										<View
											style={[
												styles.kodKutusu,
												{
													width: sp(56),
													height: sp(74),
													borderRadius: sp(12),
													backgroundColor: colors.cardBg,
													borderColor:
														durum === "onaylandi" ? "#22c55e" : colors.border,
												},
											]}>
											<Text
												style={[
													styles.kodKarakteri,
													{ color: colors.text, fontSize: sp(32) },
												]}>
												{karakter === " " ? "" : karakter}
											</Text>
										</View>
									</React.Fragment>
								))}
							</View>

							{/* Geri sayım */}
							<View style={styles.satir}>
								<Ionicons
									name="time-outline"
									size={sp(16)}
									color={surekliUyari ? "#ef4444" : colors.textSecondary}
								/>
								<Text
									style={[
										styles.sayiMetni,
										{
											color: surekliUyari ? "#ef4444" : colors.textSecondary,
											fontSize: sp(14),
										},
									]}>
									{bekliyor
										? `Kodun geçerliliği ${geriSayimMetni(kalan)}`
										: durum === "hazirlaniyor"
											? "Yeni kod hazırlanıyor…"
											: " "}
								</Text>
							</View>

							{/* Durum satırı */}
							<View style={styles.durumAlani}>
								{durum === "bekliyor" ? (
									<View style={styles.satir}>
										<Ionicons
											name="phone-portrait-outline"
											size={sp(18)}
											color="#38bdf8"
										/>
										<Text
											style={[
												styles.durumMetni,
												{ color: colors.textSecondary, fontSize: sp(14) },
											]}>
											Onay bekleniyor — telefonunuzdan kodu girdiğiniz an TV
											kendiliğinden açılır.
										</Text>
									</View>
								) : null}

								{durum === "onaylandi" ? (
									<View style={styles.satir}>
										<Ionicons
											name="checkmark-circle"
											size={sp(20)}
											color="#22c55e"
										/>
										<Text
											style={[
												styles.durumMetni,
												{ color: colors.textSecondary, fontSize: sp(14) },
											]}>
											Onaylandı! Oturum açılıyor…
										</Text>
									</View>
								) : null}

								{durum === "hata" ? (
									<View style={styles.satir}>
										<Ionicons
											name="alert-circle"
											size={sp(20)}
											color="#ef4444"
										/>
										<Text
											style={[
												styles.durumMetni,
												{ color: "#ef4444", fontSize: sp(14) },
											]}>
											{mesaj}
										</Text>
									</View>
								) : null}
							</View>

							{/* Düğmeler */}
							<View style={styles.dugmeler}>
								<TVPressable
									style={styles.yenileDugmesi}
									focusedStyle={styles.yenileDugmesiOdak}
									onPress={tekrarDene}
									disabled={durum === "hazirlaniyor" || durum === "onaylandi"}
									activeOpacity={0.8}>
									<Ionicons name="refresh-outline" size={sp(18)} color="#38bdf8" />
									<Text
										style={[styles.yenileMetni, { fontSize: sp(15) }]}>
										{durum === "hata" && bekleyenTokenlar
											? "Tekrar Dene"
											: "Kodu Yenile"}
									</Text>
								</TVPressable>

								{/* İkincil yol: kumandayla yazmayı göze alan kullanıcı için
								    e-posta/parola girişi (plan §4.1). */}
								<TVPressable
									style={styles.ikincilDugme}
									focusedStyle={styles.ikincilDugmeOdak}
									onPress={() => router.replace("/(auth)/login")}
									activeOpacity={0.8}>
									<Ionicons
										name="keypad-outline"
										size={sp(18)}
										color={colors.text}
									/>
									<Text
										style={[
											styles.ikincilMetni,
											{ color: colors.text, fontSize: sp(15) },
										]}>
										Kumanda ile E-posta/Şifre Girerek Oturum Aç
									</Text>
								</TVPressable>
							</View>
						</View>
					</View>
				</ScrollView>
			</SafeAreaView>
		</>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
	},
	icerik: {
		paddingTop: 8,
		paddingBottom: 40,
	},
	ustSatir: {
		flexDirection: "row",
		alignItems: "center",
		gap: 16,
		marginBottom: 24,
	},
	kapatDugmesi: {
		width: 44,
		height: 44,
		borderRadius: 22,
		justifyContent: "center",
		alignItems: "center",
	},
	kapatDugmesiOdak: {
		backgroundColor: "rgba(229, 9, 20, 0.2)",
		transform: [{ scale: 1.1 }],
	},
	baslikBlogu: {
		flex: 1,
	},
	baslik: {
		fontWeight: "700",
		letterSpacing: -0.5,
		marginBottom: 4,
	},
	altBaslik: {
		lineHeight: 20,
	},
	sutunlar: {
		gap: 28,
	},
	sutunlarYanYana: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: 48,
	},
	qrSutunu: {
		alignItems: "center",
	},
	qrKarti: {
		backgroundColor: "#FFFFFF",
		borderRadius: 18,
		borderWidth: 1,
	},
	qrAciklama: {
		textAlign: "center",
		lineHeight: 20,
		marginTop: 12,
	},
	vurgu: {
		color: "#38bdf8",
		fontWeight: "600",
	},
	kodSutunu: {
		flex: 1,
	},
	bolumBasligi: {
		fontWeight: "700",
		letterSpacing: 1,
		marginBottom: 14,
	},
	kodSatiri: {
		flexDirection: "row",
		alignItems: "center",
		marginBottom: 14,
	},
	tire: {
		fontWeight: "700",
		marginHorizontal: 8,
	},
	kodKutusu: {
		alignItems: "center",
		justifyContent: "center",
		borderWidth: 1,
		marginRight: 10,
	},
	kodKarakteri: {
		fontWeight: "700",
		letterSpacing: 1,
	},
	satir: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
	},
	sayiMetni: {
		fontWeight: "600",
	},
	durumAlani: {
		minHeight: 52,
		justifyContent: "center",
		marginTop: 4,
		marginBottom: 8,
	},
	durumMetni: {
		flex: 1,
		lineHeight: 20,
	},
	dugmeler: {
		gap: 12,
	},
	yenileDugmesi: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		borderRadius: 12,
		borderWidth: 1,
		borderColor: "rgba(56, 189, 248, 0.5)",
		paddingVertical: 12,
	},
	yenileDugmesiOdak: {
		borderColor: "#38bdf8",
		backgroundColor: "rgba(56, 189, 248, 0.15)",
	},
	yenileMetni: {
		color: "#38bdf8",
		fontWeight: "700",
	},
	ikincilDugme: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		borderRadius: 12,
		paddingVertical: 12,
	},
	ikincilDugmeOdak: {
		backgroundColor: "rgba(255, 255, 255, 0.08)",
		borderWidth: 1,
		borderColor: "rgba(255, 255, 255, 0.35)",
	},
	ikincilMetni: {
		fontWeight: "600",
	},
});
