/**
 * Oturum Teşhis Ekranı
 *
 * AMAÇ
 * "Uygulama kendiliğinden çıkış yapıyor" belirtisinin nedenini cihazda
 * görmek. Sunucu logları bu belirtide sessiz kalabiliyor: uygulama
 * oturumu hiç kullanmayı denemeden giriş ekranına düşerse sunucuya
 * hiç istek gitmemiş olur.
 *
 * NE GÖSTERİR
 * `utils/authDiagnostics.js` içindeki halka tampon (son 50 olay):
 *
 *   hasSession   → SecureStore'da access/refresh var mıydı?
 *   saveTokens   → Yazma başarılı mı, HANGİ token yazıldı?
 *   refresh      → Sunucu ne dedi (200 / 401 / ağ hatası)?
 *   getMe        → /api/auth/me kararı ve gerekçesi
 *   checkSession → Açılışta hangi dala düşüldü?
 *   clearTokens  → Token'lar silindi mi, NEDEN?
 *   authExpired  → Oturum kapatıcı tetiklendi mi?
 *
 * GÜVENLİK
 * Token değerleri burada da YOK; yalnızca varlık/uzunluk ve sunucu hata
 * kodu görünür.
 */

import TVPressable from "@/components/common/TVPressable";
import { useThemeContext } from "@/context/ThemeContext";
import { useTvMetrics } from "@/utils/tvMetrics";
import { authDiag } from "@/utils/authDiagnostics";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
	Alert,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/** `sonuc` alanına göre kaydın ciddiyet rengi. */
function kayitRengi(olay, veri, colors) {
	const sonuc = veri?.sonuc ?? veri?.neden ?? "";
	if (olay === "clearTokens" || olay === "authExpired") return colors.error;
	if (sonuc === "terminal" || sonuc === "token_yok" || sonuc === "token_oldu")
		return colors.error;
	if (sonuc === "transient" || sonuc === "network" || sonuc === "server")
		return colors.warning;
	if (sonuc === "ok" || sonuc === "dogrulandi" || sonuc === "refreshed")
		return colors.success;
	return colors.textSecondary;
}

/** Olay adını Türkçeye çevirir (okunabilirlik için). */
const OLAY_ADI = {
	hasSession: "Oturum var mı?",
	saveTokens: "Token yazıldı",
	refresh: "Token yenileme",
	getMe: "Profil doğrulama",
	checkSession: "Açılış kontrolü",
	clearTokens: "Token SİLİNDİ",
	authExpired: "Oturum kapatıcı",
	login: "Giriş yapıldı",
	logout: "Çıkış yapıldı",
	signup: "Kayıt oldu",
};

export default function AuthDiagScreen() {
	const { colors } = useThemeContext();
	const { contentMaxWidth } = useTvMetrics();
	const router = useRouter();
	const [kayitlar, setKayitlar] = useState([]);
	const [yukleniyor, setYukleniyor] = useState(true);

	const yenile = useCallback(async () => {
		setYukleniyor(true);
		const liste = await authDiag.read();
		// En yeni en üstte gösterilir (halka tampon eski→yeni sıralıyor).
		setKayitlar([...liste].reverse());
		setYukleniyor(false);
	}, []);

	// Ekran her açıldığında tazele: teşhis "olduktan sonra" bakılır.
	useFocusEffect(
		useCallback(() => {
			yenile();
		}, [yenile]),
	);

	const temizle = () => {
		Alert.alert("Kayıtları temizle", "Tüm oturum teşhis kaydı silinsin mi?", [
			{ text: "Vazgeç", style: "cancel" },
			{
				text: "Temizle",
				style: "destructive",
				onPress: async () => {
					await authDiag.clear();
					yenile();
				},
			},
		]);
	};

	const metniKopyala = async () => {
		// ⚠️ Clipboard bilinçli olarak KULLANILMAZ.
		// `Clipboard` React Native çekirdeğinden kaldırıldı ve projede
		// `expo-clipboard` / `@react-native-clipboard/clipboard` da yok.
		// Gereksiz bağımlılık eklemek yerine metin `selectable`
		// yapıldı (aşağıdaki blok): kullanıcı uzun basıp sistem
		// "Panoya kopyala" aracını kullanır. Bu her platformda çalışır
		// ve sürüm kırılganlığı getirmez.
		Alert.alert(
			"Kopyalamak için",
			"Kayıt metnine uzun basıp 'Panoya kopyala' seçeneğini kullan.",
		);
	};

	return (
		<SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
			<Stack.Screen options={{ headerShown: false }} />

			{/* Üst çubuk */}
			<View
				style={[
					styles.topBar,
					{ borderBottomColor: colors.border, backgroundColor: colors.bg },
				]}>
				<TVPressable
					onPress={() => router.back()}
					focusedStyle={styles.topBarBtnFocused}
					style={styles.topBarBtn}
					accessibilityLabel="Geri">
					<Ionicons name="arrow-back" size={22} color={colors.text} />
				</TVPressable>
				<Text style={[styles.topBarTitle, { color: colors.text }]}>
					Oturum Teşhisi
				</Text>
				<TVPressable
					onPress={yenile}
					focusedStyle={styles.topBarBtnFocused}
					style={styles.topBarBtn}
					accessibilityLabel="Yenile">
					<Ionicons name="refresh" size={20} color={colors.text} />
				</TVPressable>
			</View>

			<ScrollView
				contentContainerStyle={[
					styles.scrollContent,
					contentMaxWidth
						? { alignSelf: "center", width: "100%", maxWidth: contentMaxWidth }
						: null,
				]}
				showsVerticalScrollIndicator={false}>
				{/* Açıklama */}
				<View
					style={[
						styles.infoCard,
						{ backgroundColor: colors.surface, borderColor: colors.border },
					]}>
					<Text style={[styles.infoTitle, { color: colors.text }]}>
						Çıkış olduğunda buraya bak
					</Text>
					<Text style={[styles.infoBody, { color: colors.textSecondary }]}>
						Uygulama oturumu hiç kullanmayı denemeden giriş ekranına
						düşerse sunucu loglarında HİÇBİR iz kalmaz. Bu kayıt o an
						cihazda ne olduğunu gösterir. Token değerleri burada
						görünmez, yalnızca varlıkları ve sunucunun döndüğü kod.
					</Text>
				</View>

				{/* Kısayollar */}
				<View style={styles.eylemSatiri}>
					<TVPressable
						onPress={metniKopyala}
						focusedStyle={styles.eylemBtnFocused}
						style={[styles.eylemBtn, { backgroundColor: colors.surface }]}
						accessibilityLabel="Kopyalama bilgisi">
						<Ionicons
							name="information-circle-outline"
							size={16}
							color={colors.text}
						/>
						<Text style={[styles.eylemBtnYazi, { color: colors.text }]}>
							Nasıl kopyalarım?
						</Text>
					</TVPressable>
					<TVPressable
						onPress={temizle}
						focusedStyle={styles.eylemBtnFocused}
						style={[styles.eylemBtn, { backgroundColor: colors.surface }]}
						accessibilityLabel="Kayıtları temizle">
						<Ionicons name="trash-outline" size={16} color={colors.text} />
						<Text style={[styles.eylemBtnYazi, { color: colors.text }]}>
							Temizle
						</Text>
					</TVPressable>
				</View>

				{/* Kayıt listesi */}
				{yukleniyor ? (
					<Text style={[styles.bosYazi, { color: colors.textSecondary }]}>
						Yükleniyor…
					</Text>
				) : kayitlar.length === 0 ? (
					<View
						style={[
							styles.bosKart,
							{ backgroundColor: colors.surface, borderColor: colors.border },
						]}>
						<Text style={[styles.bosYazi, { color: colors.textSecondary }]}>
							Kayıt yok. Uygulamayı kapatıp yeniden aç; sorun
							oluştuğunda buraya dön.
						</Text>
					</View>
				) : (
					kayitlar.map((k) => {
						const saat = new Date(k.ms);
						const zaman = `${String(saat.getHours()).padStart(2, "0")}:${String(saat.getMinutes()).padStart(2, "0")}:${String(saat.getSeconds()).padStart(2, "0")}`;
						const renk = kayitRengi(k.olay, k.veri, colors);
						return (
							<View
								key={`${k.ms}-${k.sira}`}
								style={[
									styles.kayit,
									{ backgroundColor: colors.surface, borderColor: colors.border },
								]}>
								<View style={styles.kayitBaslik}>
									<View
										style={[styles.nokta, { backgroundColor: renk }]}
									/>
									<Text style={[styles.olay, { color: colors.text }]}>
										{OLAY_ADI[k.olay] ?? k.olay}
									</Text>
									<Text
										style={[styles.zaman, { color: colors.textSecondary }]}>
										{zaman}
									</Text>
								</View>
								<Text
									style={[styles.veri, { color: colors.textSecondary }]}
									selectable>
									{JSON.stringify(k.veri)}
								</Text>
							</View>
						);
					})
				)}

				<TVPressable
					onPress={() => router.back()}
					focusedStyle={styles.geriBtnFocused}
					style={[styles.geriBtn, { backgroundColor: colors.surface }]}
					accessibilityLabel="Geri dön">
					<Text style={[styles.geriBtnYazi, { color: colors.text }]}>
						Geri dön
					</Text>
				</TVPressable>
			</ScrollView>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	topBar: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: 12,
		height: 52,
		borderBottomWidth: 1,
	},
	topBarBtn: {
		width: 40,
		height: 40,
		alignItems: "center",
		justifyContent: "center",
		borderRadius: 8,
	},
	topBarBtnFocused: { opacity: 0.6 },
	topBarTitle: { fontSize: 17, fontWeight: "600" },

	scrollContent: { padding: 16, paddingBottom: 40, gap: 10 },

	infoCard: { padding: 14, borderRadius: 12, borderWidth: 1 },
	infoTitle: { fontSize: 14, fontWeight: "700", marginBottom: 6 },
	infoBody: { fontSize: 12, lineHeight: 18 },

	eylemSatiri: { flexDirection: "row", gap: 10 },
	eylemBtn: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 6,
		paddingVertical: 12,
		borderRadius: 10,
	},
	eylemBtnFocused: { opacity: 0.6 },
	eylemBtnYazi: { fontSize: 13, fontWeight: "600" },

	bosKart: { padding: 20, borderRadius: 12, borderWidth: 1, alignItems: "center" },
	bosYazi: { fontSize: 13, textAlign: "center", lineHeight: 19 },

	kayit: { padding: 11, borderRadius: 10, borderWidth: 1 },
	kayitBaslik: { flexDirection: "row", alignItems: "center", gap: 7 },
	nokta: { width: 7, height: 7, borderRadius: 4 },
	olay: { fontSize: 13, fontWeight: "600", flex: 1 },
	zaman: { fontSize: 11 },
	veri: { fontSize: 11, marginTop: 5, fontFamily: "monospace" },

	geriBtn: {
		marginTop: 10,
		paddingVertical: 13,
		borderRadius: 10,
		alignItems: "center",
	},
	geriBtnFocused: { opacity: 0.6 },
	geriBtnYazi: { fontSize: 14, fontWeight: "600" },
});