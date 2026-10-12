import { AuthProvider } from "@/context/AuthContext";
import { SyncProvider } from "@/context/SyncContext";
import { LanguageDisplayProvider } from "@/context/LanguageDisplayContext";
import { PlayerSettingsProvider } from "@/context/PlayerSettingsContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { AppUpdateProvider } from "@/context/AppUpdateContext";
import UpdateBanner from "@/components/update/UpdateBanner";
import UpdateSheet from "@/components/update/UpdateSheet";
import SplashOverlay from "@/components/splash/SplashOverlay";
import * as ScreenOrientation from "expo-screen-orientation";
import { Stack } from "expo-router";
import React, { useEffect, useState } from "react";
import { Platform } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { startNetworkQualityWatch } from "@/utils/imageQuality";

/*
 * ⚠️ Bu import YALNIZCA isimler için değil: modül YÜKLENİRKEN
 * `SplashScreen.preventAutoHideAsync()` çalışır ve `fetch` saymaya sarılır.
 * Yalnızca `useEffect` içinde beklemek yetmez — expo-router ilk ekranı
 * çizer çizmez native splash'ı KENDİSİ gizler.
 */
import { hideNativeSplash, waitForStartupGate } from "@/utils/splashScreen";

export default function RootLayout() {
	const [splashVisible, setSplashVisible] = useState(true);

	/*
	 * ── Açılış kapısı ──────────────────────────────────────────────
	 *
	 * Splash'ı, uygulamanın açılış istekleri (oturum kontrolü, güncelleme
	 * kontrolü, ilk içerik) bitene kadar — en az 1,2 sn, en çok 3 sn —
	 * açık tutar, sonra ANİMASYONLU kapatır.
	 *
	 * ⚠️ Sıralama: native splash ÖNCE kapanır, JS animasyonu SONRA başlar.
	 * Tersi yapılırsa animasyon native splash'ın arkasında oynar, o da
	 * kapanınca içerik hazır olur ve geçiş bir "sıçrama" olur.
	 */
	useEffect(() => {
		let cancelled = false;

		async function runStartupGate() {
			try {
				await waitForStartupGate();
			} catch (error) {
				// Bekleme mantığı hata verse bile uygulama kilitlenmemeli.
				console.warn("Açılış kapısı hatası:", error?.message);
			} finally {
				await hideNativeSplash();
				if (!cancelled) setSplashVisible(false);
			}
		}

		runStartupGate();
		return () => {
			cancelled = true;
		};
	}, []);

	/*
	 * ⚠️ UYARLANABİLİR GÖRSEL KALİTESİ (sorun 6)
	 *
	 * "yavaş bağlantı hızında resimler tam yüklenmiyor" şikâyetinin
	 * çözümü iki parçalıdır:
	 *
	 *   1. BAŞLANGIÇ TAHMİNİ — burada başlatılan izleyici, bağlantı
	 *      hücreselse uygulamayı doğrudan düşük kaliteye alır.
	 *   2. GERÇEK ÖLÇÜM — `SmartImage` her yüklemenin gerçek süresini
	 *      raporlar; motor yavaşsa düşürür, hızlanınca yükseltir.
	 *
	 * İkinci parça olmadan uygulama yalnızca "hücresel = yavaş" varsayar
	 * ve yavaş wifi'de küçük görsel göstermeye devam ederdi.
	 */
	useEffect(() => startNetworkQualityWatch(), []);

	useEffect(() => {
		async function lockTVOrientation() {
			try {
				if (Platform.isTV) {
					// TV ise daima yatay (Landscape) olarak kilitle
					await ScreenOrientation.lockAsync(
						ScreenOrientation.OrientationLock.LANDSCAPE
					);
				} else {
					// Telefon veya tablet ise serbest bırak veya varsayılan portre yap
					await ScreenOrientation.unlockAsync();
				}
			} catch (e) {
				console.warn("Ekran yönü kilitlenirken hata oluştu:", e);
			}
		}

		lockTVOrientation();
	}, []);

	return (
		<ThemeProvider>
			{/*
			 * AppUpdateProvider en dışta: hem banner hem ayarlar satırı
			 * aynı güncelleme durumunu okusun diye tek doğruluk kaynağı
			 * burada. Açılışta otomatik kontrolü bu provider başlatır.
			 */}
			<AppUpdateProvider>
				<AuthProvider>
					<SyncProvider>
						<PlayerSettingsProvider>
							<LanguageDisplayProvider>
								<SafeAreaProvider>
									{/*
									 * ⚠️ SORUN 4 (GENEL) — `<Slot/>` → `<Stack/>`.
									 *
									 * `<Slot/>` yalnızca ODAKTAKİ ekranı çizer;
									 * başka bir ekrana gidildiğinde önceki ekran
									 * **tamamen unmount** olur. Bu yüzden geri
									 * tuşuna basıp dönüldüğünde:
									 *   • kaydırma konumu sıfırlanıyordu,
									 *   • seçili filtre/sekme sıfırlanıyordu,
									 *   • yüklenmiş veri (kategori sayfaları gibi)
									 *     baştan isteniyordu.
									 *
									 * `<Stack/>` ekranları yığın hâlinde TUTAR:
									 * önceki ekran mount durumunu ve dolayısıyla
									 * kaydırma konumunu, filtreleri ve indirilmiş
									 * satırları korur. Aynı zamanda Android geri
									 * tuşu ile sistem geri gezinmesi de doğru
									 * çalışır.
									 *
									 * TV'de animasyon KAPALI: 10 feet UI'de geçiş
									 * efekti kumandaya gecikme olarak yansıyor ve
									 * akıcılığı düşürüyor.
									 */}
									<Stack
										screenOptions={{
											headerShown: false,
											animation: Platform.isTV
												? "none"
												: "slide_from_right",
											contentStyle: {
												backgroundColor: "#0d0e12",
											},
										}}
									/>
									{/* absolute banner + modal: düzen akışına dokunmaz. */}
									<UpdateBanner />
									<UpdateSheet />
									{/*
									 * Son çocuk = en üstte. Native splash'ın
									 * hemen altında bekler, kapı açılınca
									 * animasyonla kaybolur. TV'de native
									 * splash hiç görünmediği için bu katman
									 * açılış ekranının kendisidir.
									 */}
									<SplashOverlay visible={splashVisible} />
								</SafeAreaProvider>
							</LanguageDisplayProvider>
						</PlayerSettingsProvider>
					</SyncProvider>
				</AuthProvider>
			</AppUpdateProvider>
		</ThemeProvider>
	);
}
