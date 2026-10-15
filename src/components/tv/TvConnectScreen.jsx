/**
 * TV Bağla — TELEFON tarafı (paylaşılan ekran).
 *
 * Akış (plan §4.2): TV ekranındaki kod ya QR ile okutulur ya da elle girilir;
 * onay `/api/auth/device/verify` ucuna gider ve TV oturumunu AÇAN taraf TV olur
 * (bu ekran yalnızca izin verir). Bu yüzden burada token saklanmaz.
 *
 * İki giriş yolu tek ekranda toplanır: kullanıcı kamerayı reddettiğinde akış
 * ölürse "TV bağlama" özelliği yarım kalırdı.
 *
 * Neden paylaşılan bileşen: iki rota aynı ekranı açar —
 *   • `/(app)/settings/tv-connect` (Ayarlar satırı)
 *   • `/tv-activate` (QR'daki `streampulse://tv-activate?code=…` bağlantısı)
 * Kopyalanmış bir ekran, düzeltmelerin yalnızca birinde kalmasına yol açardı.
 */

import TVPressable from "@/components/common/TVPressable";
import QrScanner, { kameraKullanilabilir } from "@/components/tv/QrScanner";
import { useAuth } from "@/context/AuthContext";
import { useThemeContext } from "@/context/ThemeContext";
import {
	approveDeviceCode,
	extractActivationCode,
	normalizeActivationCode,
} from "@/services/deviceAuth";
import { openLogin } from "@/utils/authRoutes";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { Stack, useIsFocused, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
	ActivityIndicator,
	KeyboardAvoidingView,
	Platform,
	ScrollView,
	StatusBar,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/**
 * Dokunsal geri bildirim — TV'de ve hata durumunda sessizce atlanır.
 *
 * ⚠️ `try/catch` şart: titreşimi olmayan cihazlarda (TV kutusu, emülatör)
 * çağrı reddedilebilir. Geri bildirim "süs"tür; başarılı bir eşleştirmeyi
 * çökertmemelidir.
 *
 * @param {"basari"|"hata"} tur
 */
function titret(tur) {
	if (Platform.isTV) return;
	try {
		Haptics.notificationAsync(
			tur === "basari"
				? Haptics.NotificationFeedbackType.Success
				: Haptics.NotificationFeedbackType.Error,
		).catch(() => {});
	} catch {
		// Titreşim yoksa yok sayılır.
	}
}

/**
 * @param {object} props
 * @param {string} [props.initialCode] - QR bağlantısından gelen kod (deep link)
 * @param {boolean} [props.autoSubmit] - Kod varsa açılışta kendiliğinden onayla
 */
export default function TvConnectScreen({ initialCode = "", autoSubmit = false }) {
	const { colors, theme } = useThemeContext();
	const { isLoggedIn } = useAuth();
	const router = useRouter();
	/**
	 * Ekran odakta mı?
	 *
	 * ⚠️ Kamera önizlemesi YALNIZCA odaktayken çizilir: `expo-camera` aynı anda
	 * tek önizlemeye izin verir ve odak dışı kalan bir ekran kamerayı serbest
	 * bırakmazsa (ör. giriş ekranına gidildiğinde) cihazda kamera meşgul kalır,
	 * pil tüketilir; başka bir ekran kamerayı açmak isterse siyah görüntü alır.
	 */
	const odakta = useIsFocused();

	const kameraVar = kameraKullanilabilir();
	const baslangicKodu = normalizeActivationCode(initialCode);

	/** qr | kod — kamera yoksa ve kod varsa doğrudan kod sekmesi açılır. */
	const [sekme, setSekme] = useState(
		kameraVar && !baslangicKodu ? "qr" : "kod",
	);
	const [kod, setKod] = useState(baslangicKodu);
	/** hazir | gonderiyor | basarili */
	const [durum, setDurum] = useState("hazir");
	const [hata, setHata] = useState("");
	const [sonuc, setSonuc] = useState(null);

	const girisRef = useRef(null);
	/** Aynı kod iki kez onaylanmasın (çift dokunuş + QR tekrarı). */
	const gonderiliyor = useRef(false);
	const sokuldu = useRef(false);

	useEffect(() => {
		sokuldu.current = false;
		return () => {
			sokuldu.current = true;
		};
	}, []);

	// ─── Onayla ──────────────────────────────────────────
	const bagla = useCallback(async (hamKod) => {
		const temiz = normalizeActivationCode(hamKod);

		if (temiz.length !== 6) {
			setHata("Kod 6 karakterden oluşur. TV ekranındaki kodu kontrol edin.");
			return;
		}
		if (gonderiliyor.current) return;
		gonderiliyor.current = true;

		setDurum("gonderiyor");
		setHata("");

		try {
			const yanit = await approveDeviceCode(temiz);
			if (sokuldu.current) return;
			titret("basari");
			setSonuc(yanit);
			setDurum("basarili");
		} catch (err) {
			if (sokuldu.current) return;
			titret("hata");
			const bekleme = Number(err?.retryAfter) > 0 ? ` (${err.retryAfter} sn bekleyin)` : "";
			setHata(
				`${err?.message || "TV bağlanamadı. Lütfen tekrar deneyin."}${bekleme}`,
			);
			setDurum("hazir");
			// Yanlış kod denemesi sayacı işledi: kullanıcı düzeltebilsin.
			girisRef.current?.focus();
		} finally {
			gonderiliyor.current = false;
		}
	}, []);

	// ─── Derin bağlantı: kod geldiyse kendiliğinden onayla ──
	// ⚠️ Bağımlılık listesi BİLİNÇLİ olarak boş: bu çağrı AĞA çıkar ve bir kod
	// yalnızca BİR kez onaylanabilir (ikinci istek "kod kullanıldı" hatası
	// döner). Effect, sekme/kod durumu değiştikçe yeniden çalışmamalıdır.
	useEffect(() => {
		if (!autoSubmit || !baslangicKodu || !isLoggedIn) return;
		// eslint-disable-next-line react-hooks/set-state-in-effect
		bagla(baslangicKodu);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// QR okundu → kod sekmesine geç ve onayla (kullanıcı ilerlemeyi görsün).
	const qrOkundu = useCallback(
		(veri) => {
			const okunan = extractActivationCode(veri);
			setSekme("kod");
			setKod(okunan);
			bagla(okunan);
		},
		[bagla],
	);

	const git = useCallback(() => {
		if (router.canGoBack()) router.back();
		else router.replace("/(app)/settings");
	}, [router]);

	// ─── Giriş gerekli ───────────────────────────────────
	if (!isLoggedIn) {
		return (
			<>
				<Stack.Screen options={{ headerShown: false }} />
				<SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
					<View style={styles.uyariAlani}>
						<Ionicons name="lock-closed-outline" size={44} color="#F59E0B" />
						<Text style={[styles.uyariBaslik, { color: colors.text }]}>
							Giriş yapmanız gerekiyor
						</Text>
						<Text style={[styles.uyariMetin, { color: colors.textSecondary }]}>
							TV’nizi bağlamak için önce bu telefonda oturum açmalısınız — TV,
							kendi hesabınıza bu telefon üzerinden bağlanır.
						</Text>
						<TVPressable
							style={styles.birincilDugme}
							focusedStyle={styles.birincilDugmeOdak}
							onPress={() => openLogin(router)}
							activeOpacity={0.85}>
							<Text style={styles.birincilDugmeMetni}>Giriş Yap</Text>
						</TVPressable>
						<TVPressable
							style={styles.baglantiDugme}
							focusedStyle={styles.baglantiDugmeOdak}
							onPress={git}
							activeOpacity={0.7}>
							<Text style={[styles.baglantiMetni, { color: colors.textSecondary }]}>
								Vazgeç
							</Text>
						</TVPressable>
					</View>
				</SafeAreaView>
			</>
		);
	}

	// ─── Başarı ──────────────────────────────────────────
	if (durum === "basarili") {
		const cihazAdi = sonuc?.device_name || "TV";
		return (
			<>
				<Stack.Screen options={{ headerShown: false }} />
				<SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
					<StatusBar
						barStyle={theme === "dark" ? "light-content" : "dark-content"}
						backgroundColor={colors.bg}
					/>
					<View style={styles.uyariAlani}>
						<View style={styles.basariHalka}>
							<Ionicons name="checkmark" size={52} color="#22c55e" />
						</View>
						<Text style={[styles.uyariBaslik, { color: colors.text }]}>
							{cihazAdi} cihazınızda oturum açıldı!
						</Text>
						<Text style={[styles.uyariMetin, { color: colors.textSecondary }]}>
							{sonuc?.message ||
								"TV oturumu onaylandı."}{" "}
							TV’niz birkaç saniye içinde kendiliğinden açılacak — bu ekranda
							başka bir şey yapmanıza gerek yok.
						</Text>
						<TVPressable
							style={styles.birincilDugme}
							focusedStyle={styles.birincilDugmeOdak}
							onPress={git}
							activeOpacity={0.85}>
							<Text style={styles.birincilDugmeMetni}>Bitti</Text>
						</TVPressable>
						<TVPressable
							style={styles.baglantiDugme}
							focusedStyle={styles.baglantiDugmeOdak}
							onPress={() => {
								setSonuc(null);
								setKod("");
								setHata("");
								setDurum("hazir");
								setSekme(kameraVar ? "qr" : "kod");
							}}
							activeOpacity={0.7}>
							<Text style={[styles.baglantiMetni, { color: colors.textSecondary }]}>
								Başka bir TV bağla
							</Text>
						</TVPressable>
					</View>
				</SafeAreaView>
			</>
		);
	}

	// ─── Ana ekran: sekme + kod ──────────────────────────
	const gonderiyor = durum === "gonderiyor";

	return (
		<>
			<Stack.Screen options={{ headerShown: false }} />
			<SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
				<StatusBar
					barStyle={theme === "dark" ? "light-content" : "dark-content"}
					backgroundColor={colors.bg}
				/>
				<KeyboardAvoidingView
					behavior={Platform.OS === "ios" ? "padding" : undefined}
					style={styles.esnek}>
					<ScrollView
						contentContainerStyle={styles.icerik}
						keyboardShouldPersistTaps="handled"
						showsVerticalScrollIndicator={false}>
						{/* Başlık */}
						<View style={styles.ustSatir}>
							<TVPressable
								style={styles.kapatDugmesi}
								focusedStyle={styles.kapatDugmesiOdak}
								onPress={git}
								activeOpacity={0.7}>
								<Ionicons name="close" size={26} color={colors.text} />
							</TVPressable>
							<View style={styles.esnek}>
								<Text style={[styles.baslik, { color: colors.text }]}>
									TV’de Oturum Aç
								</Text>
								<Text style={[styles.altBaslik, { color: colors.textSecondary }]}>
									TV ekranındaki kodu girin ya da QR kodu okutun
								</Text>
							</View>
						</View>

						{/* Sekmeler — kamera yoksa yalnız kod yolu kalır. */}
						{kameraVar ? (
							<View
								style={[
									styles.sekmeler,
									{ backgroundColor: colors.cardBg, borderColor: colors.border },
								]}>
								<TVPressable
									style={[
										styles.sekme,
										sekme === "qr" && styles.sekmeAktif,
									]}
									focusedStyle={styles.sekmeOdak}
									onPress={() => setSekme("qr")}
									activeOpacity={0.8}>
									<Ionicons
										name="qr-code-outline"
										size={18}
										color={sekme === "qr" ? "#fff" : colors.textSecondary}
									/>
									<Text
										style={[
											styles.sekmeMetni,
											{ color: sekme === "qr" ? "#fff" : colors.textSecondary },
										]}>
										QR Kodu Okut
									</Text>
								</TVPressable>
								<TVPressable
									style={[
										styles.sekme,
										sekme === "kod" && styles.sekmeAktif,
									]}
									focusedStyle={styles.sekmeOdak}
									onPress={() => setSekme("kod")}
									activeOpacity={0.8}>
									<Ionicons
										name="keypad-outline"
										size={18}
										color={sekme === "kod" ? "#fff" : colors.textSecondary}
									/>
									<Text
										style={[
											styles.sekmeMetni,
											{ color: sekme === "kod" ? "#fff" : colors.textSecondary },
										]}>
										6 Haneli Kodu Gir
									</Text>
								</TVPressable>
							</View>
						) : null}

						{/* QR sekmesi — kamera yalnızca odaktayken çizilir (bkz. `odakta`). */}
						{sekme === "qr" && kameraVar && odakta ? (
							<View style={styles.kameraAlani}>
								<QrScanner onKodOkundu={qrOkundu} />
								<Text style={[styles.kameraNotu, { color: colors.textSecondary }]}>
									TV ekranındaki QR kodu çerçeveye ortalayın
								</Text>
							</View>
						) : null}

						{/* Kod sekmesi */}
						{sekme === "kod" ? (
							<View style={styles.kodAlani}>
								<Text style={[styles.kodEtiketi, { color: colors.textSecondary }]}>
									TV EKRANINDAKİ 6 HANELİ KOD
								</Text>

								<View style={styles.kodSatiri}>
									{(kod.padEnd(6, " ").slice(0, 6)).split("").map((karakter, sira) => (
										<React.Fragment key={`hane-${sira}`}>
											{sira === 3 ? (
												<Text
													style={[styles.tire, { color: colors.textSecondary }]}>
													–
												</Text>
											) : null}
											<View
												style={[
													styles.kodKutusu,
													{
														backgroundColor: colors.cardBg,
														borderColor:
															sekme === "kod" && kod.length === sira
																? "#38bdf8"
																: colors.border,
													},
												]}>
												<Text style={[styles.kodKarakteri, { color: colors.text }]}>
													{karakter === " " ? "" : karakter}
												</Text>
											</View>
										</React.Fragment>
									))}
								</View>

								{/*
								 * Görünmez giriş: kutucuklar sadece GÖRSELDİR; tuş
								 * takımı bu şeffaf alandan gelir. Kullanıcı kutucuklara
								 * dokunduğunda odak oraya gider (üstte tam kaplıdır).
								 */}
								<TextInput
									ref={girisRef}
									value={kod}
									onChangeText={(deger) =>
										setKod(extractActivationCode(deger).slice(0, 6))
									}
									onSubmitEditing={() => bagla(kod)}
									style={styles.gizliGiris}
									maxLength={6}
									autoCapitalize="characters"
									autoCorrect={false}
									autoComplete="off"
									autoFocus={!baslangicKodu}
									caretHidden
									returnKeyType="go"
									editable={!gonderiyor}
								/>

								{hata ? (
									<View style={styles.hataKutusu}>
										<Ionicons name="alert-circle" size={18} color="#ef4444" />
										<Text style={styles.hataMetni}>{hata}</Text>
									</View>
								) : null}

								<TVPressable
									style={[
										styles.birincilDugme,
										(gonderiyor || kod.length !== 6) && styles.pasifDugme,
									]}
									focusedStyle={styles.birincilDugmeOdak}
									onPress={() => bagla(kod)}
									disabled={gonderiyor || kod.length !== 6}
									activeOpacity={0.85}>
									{gonderiyor ? (
										<ActivityIndicator color="#fff" size="small" />
									) : (
										<Text style={styles.birincilDugmeMetni}>TV’yi Bağla</Text>
									)}
								</TVPressable>

								<Text style={[styles.ipucu, { color: colors.textSecondary }]}>
									Kod, TV ekranının sağ tarafında büyük harflerle gösterilir ve 5
									dakika geçerlidir.
								</Text>
							</View>
						) : null}
					</ScrollView>
				</KeyboardAvoidingView>
			</SafeAreaView>
		</>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
	},
	esnek: {
		flex: 1,
	},
	icerik: {
		paddingHorizontal: 20,
		paddingBottom: 40,
	},
	ustSatir: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		marginTop: 8,
		marginBottom: 20,
	},
	kapatDugmesi: {
		width: 42,
		height: 42,
		borderRadius: 21,
		justifyContent: "center",
		alignItems: "center",
	},
	kapatDugmesiOdak: {
		backgroundColor: "rgba(229, 9, 20, 0.2)",
	},
	baslik: {
		fontSize: 22,
		fontWeight: "700",
		letterSpacing: -0.3,
	},
	altBaslik: {
		fontSize: 13,
		marginTop: 2,
		lineHeight: 18,
	},
	sekmeler: {
		flexDirection: "row",
		borderRadius: 14,
		borderWidth: 1,
		padding: 4,
		gap: 4,
		marginBottom: 20,
	},
	sekme: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 7,
		paddingVertical: 10,
		borderRadius: 10,
	},
	sekmeAktif: {
		backgroundColor: "#38bdf8",
	},
	sekmeOdak: {
		borderWidth: 2,
		borderColor: "#FFFFFF",
	},
	sekmeMetni: {
		fontSize: 13,
		fontWeight: "700",
	},
	kameraAlani: {
		height: 340,
	},
	kameraNotu: {
		fontSize: 12,
		textAlign: "center",
		marginTop: 10,
	},
	kodAlani: {
		position: "relative",
	},
	kodEtiketi: {
		fontSize: 11,
		fontWeight: "700",
		letterSpacing: 1,
		marginBottom: 12,
	},
	kodSatiri: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		marginBottom: 18,
	},
	tire: {
		fontSize: 26,
		fontWeight: "700",
		marginHorizontal: 6,
	},
	kodKutusu: {
		width: 46,
		height: 60,
		borderRadius: 12,
		borderWidth: 1,
		alignItems: "center",
		justifyContent: "center",
		marginRight: 8,
	},
	kodKarakteri: {
		fontSize: 26,
		fontWeight: "700",
	},
	gizliGiris: {
		position: "absolute",
		top: 26,
		left: 0,
		right: 0,
		height: 78,
		opacity: 0.02,
		color: "transparent",
	},
	hataKutusu: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		backgroundColor: "rgba(239, 68, 68, 0.1)",
		borderRadius: 12,
		paddingHorizontal: 14,
		paddingVertical: 12,
		marginBottom: 14,
	},
	hataMetni: {
		color: "#ef4444",
		fontSize: 13,
		flex: 1,
		lineHeight: 18,
	},
	birincilDugme: {
		backgroundColor: "#38bdf8",
		borderRadius: 14,
		height: 52,
		justifyContent: "center",
		alignItems: "center",
	},
	birincilDugmeOdak: {
		borderWidth: 2,
		borderColor: "#FFFFFF",
		backgroundColor: "#0284c7",
	},
	pasifDugme: {
		opacity: 0.5,
	},
	birincilDugmeMetni: {
		color: "#fff",
		fontSize: 16,
		fontWeight: "700",
	},
	baglantiDugme: {
		alignItems: "center",
		paddingVertical: 12,
		marginTop: 6,
	},
	baglantiDugmeOdak: {
		opacity: 0.7,
	},
	baglantiMetni: {
		fontSize: 14,
		fontWeight: "600",
	},
	ipucu: {
		fontSize: 12,
		lineHeight: 18,
		textAlign: "center",
		marginTop: 16,
	},
	uyariAlani: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 28,
		gap: 12,
	},
	uyariBaslik: {
		fontSize: 20,
		fontWeight: "700",
		textAlign: "center",
	},
	uyariMetin: {
		fontSize: 14,
		lineHeight: 21,
		textAlign: "center",
		marginBottom: 8,
	},
	basariHalka: {
		width: 96,
		height: 96,
		borderRadius: 48,
		backgroundColor: "rgba(34, 197, 94, 0.12)",
		alignItems: "center",
		justifyContent: "center",
		marginBottom: 4,
	},
});
