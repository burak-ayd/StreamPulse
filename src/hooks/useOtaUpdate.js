/**
 * OTA güncelleme kontrol akışı (expo-updates · custom server).
 *
 * ── Akış ("yalnızca açılışta, fark ettirmeden" modeli) ─────────────────
 *   1. Kontrol YALNIZCA uygulama AÇILIŞINDA bir kez yapılır (bu hook
 *      RootLayout'ta mount olur). Uygulama açıkken/ön planda BAŞKA
 *      kontrol ve reload YOK — kullanıcı aktif kullanırken kesinti olmaz.
 *   2. Yeni sürüm varsa sessizce `fetchUpdateAsync` ile indirilir.
 *   3. İndirme AÇILIŞ PENCERESİ içinde (splash kapısının azami süresi)
 *      tamamlanırsa `reloadAsync` ile AYNI açılışta uygulanır — reload
 *      splash ekranının altında olup biter, kullanıcı yalnızca normal bir
 *      açılış görür; "kapat-aç" yapması GEREKMEZ.
 *   4. Pencere kaçarsa indirme bekletilir; expo-updates bu güncellemeyi
 *      uygulamanın BİR SONRAKİ açılışında native olarak devreye alır.
 *   5. Bildirim tercihi AÇIKSA otomatik uygulama yerine "Şimdi yenile /
 *      Kapat" sorulur (kullanıcı bunu tercih ettiği için onaylı kesinti).
 *
 * ── Neden bu kadar minimal? (performans + kesintisizlik) ────────────
 *   Önceki sürümdeki "arka plana geçince sessiz reload" modeli
 *   `useSegments()` aboneliği gerektiriyordu; RootLayout navigasyon
 *   durumuna abone olunca HER ekran geçişi tüm sağlayıcı ağacını
 *   yeniden render ediyor ve ana sayfa geçişlerinde takılmaya yol
 *   açıyordu. Ayrıca arka planda reload güvenilir çalışmadığı için
 *   güncelleme yine ancak kapat-aç ile uygulanıyordu. İkisi de
 *   kaldırıldı: bu hook HİÇBİR türde navigation/AppState aboneliği
 *   KURMAZ, sadece mount anında tek bir sessiz kontrol çalıştırır.
 *
 * Referans: AstorTest2 (app/_layout.jsx) akışının, StreamPulse'un
 * bloklamayan güncelleme UX'iyle (bkz. AppUpdateContext dokumantasyonu)
 * birleştirilmiş hâli. Native config: app.config.js → `updates`.
 */
import { useEffect, useRef } from "react";
import { Alert } from "react-native";
import * as Updates from "expo-updates";
import {
	getNotifyOnUpdate,
	getStartupAppliedId,
	otaUpdateConfig,
	setStartupAppliedId,
} from "@/services/otaUpdate";
import { MAX_SPLASH_MS } from "@/utils/splashScreen";

export function useOtaUpdate() {
	/* Oturumda tek kontrol güvencesi (StrictMode çift-çalıştırmasına karşı
	 * da korur). RootLayout bir kez mount olduğundan normalde de tektir. */
	const hasCheckedRef = useRef(false);

	/* JS'in başladığı an — "açılış penceresi" bütçesi bundan ölçülür.
	 * (Render sırasında `Date.now()` çağrılamaz — purity kuralı; bu yüzden
	 * değer effect'in başında atanır, mount anına ~anlıktır.) */
	const launchedAtRef = useRef(0);

	useEffect(() => {
		/* __DEV__ veya native config eksikse hiçbir network çağrısı açma. */
		if (__DEV__ || !otaUpdateConfig.isConfigured) {
			return;
		}

		launchedAtRef.current = Date.now();

		async function checkAndDownload() {
			if (hasCheckedRef.current) return;
			hasCheckedRef.current = true;

			try {
				const check = await Updates.checkForUpdateAsync();

				/*
				 * isRollBackToEmbedded: sunucu "embedded sürüme dön" emri
				 * vermiş demektir (bozuk güncellemeyi geri alma). Bu durumda
				 * indirme YOK — expo-updates bir sonraki açılışta embedded
				 * sürüme düşer; kullanıcıya dokunmayız.
				 */
				if (!check.isAvailable || check.isRollBackToEmbedded) return;

				/* Manifest id (expo-manifests → `Manifest.id`) — aynı sürüm
				 * için üst üste reload döngüsünü engelleyen guard anahtarı. */
				const updateId = check.manifest?.id;
				if (updateId && (await getStartupAppliedId()) === updateId) {
					return;
				}

				await Updates.fetchUpdateAsync();

				const notify = await getNotifyOnUpdate();
				if (notify) {
					/* Tercih AÇIK: otomatik uygulama yerine kullanıcıya sor.
					 * "Şimdi yenile" anında uygular; "Kapat" bir sonraki
					 * açılışa bırakır (native zaten uygular). */
					Alert.alert(
						"Yeni sürüm hazır",
						"Uygulama güncellemesi indirildi. Şimdi yenilemek ister misiniz? Reddederseniz bir sonraki açılışınızda sessizce uygulanır.",
						[
							{
								text: "Şimdi yenile",
								onPress: () => {
									Updates.reloadAsync().catch((reloadError) => {
										console.warn(
											"OTA yenileme hatası:",
											reloadError?.message,
										);
									});
								},
							},
							{
								text: "Kapat",
								style: "cancel",
							},
						],
						{ cancelable: true },
					);
					return;
				}

				/*
				 * Sessiz model: indirme AÇILIŞ PENCERESİ içinde bittiyse AYNI
				 * açılışta uygula — reload, splash ekranının altında olur
				 * biter, kullanıcı fark etmez. Pencere kaçtıysa DOKUNMA:
				 * güncelleme indirilmiş hâlde bekler ve bir sonraki açılışta
				 * expo-updates tarafından native olarak devreye alınır.
				 */
				if (Date.now() - launchedAtRef.current <= MAX_SPLASH_MS) {
					if (updateId) {
						await setStartupAppliedId(updateId);
					}
					try {
						await Updates.reloadAsync();
					} catch (reloadError) {
						/* Uygulama açıkken kesintiye dönüşmesin: reload
						 * başlatılamazsa sessizce vazgeç — indirme durur,
						 * bir sonraki açılış yine uygular. */
						console.warn(
							"OTA açılışta yenileme başlatılamadı:",
							reloadError?.message,
						);
					}
				}
			} catch (error) {
				/* Hata olsa bile sessizce atlanır — kullanıcıya gösterilmez.
				 * Bir sonraki açılışta kontrol zaten yeniden yapılır. */
				console.warn("OTA güncelleme kontrol hatası:", error?.message);
			}
		}

		checkAndDownload();
	}, []);
}
