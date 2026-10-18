/**
 * OTA güncelleme kontrol akışı (expo-updates · custom server).
 *
 * ── Akış ─────────────────────────────────────────────────────────────────
 *   1. Açılışta ve ön plana her dönüşte sessizce `checkForUpdateAsync`.
 *   2. Yeni manifest VARSAYSA `fetchUpdateAsync` ile arka planda indir.
 *   3. İndirme bittiğinde:
 *        - Bildirim tercihi KAPALIYSA (varsayılan): hiçbir şey yapma.
 *          expo-updates yeni bundle'ı uygulama BİR SONRAKİ AÇILIŞINDA
 *          otomatik devreye alır — kullanıcı fark etmez.
 *        - Tercih AÇIKSA Alert: "Şimdi yenile" → `reloadAsync`; "Kapat"
 *          → aynı sessiz döngü.
 *
 * ── Güvenlik süzgeçleri ──────────────────────────────────────────────
 *   - __DEV__ bloklu: API'ler geliştirme modunda reddedilir.
 *   - Konkurenza kilidi: tek kontrol döngüsü (checkingRef).
 *   - Reddedilen güncelleme hatırlanır: kullanıcı "Kapat" derse aynı
 *     manifest id için tekrar sorulmaz, ama sessiz otomatik uygulamanın
 *     (sonraki açılış) yolu açık kalır.
 *
 * Referans: AstorTest2 (app/_layout.jsx) akışının, StreamPulse'un
 * bloklamayan güncelleme UX'iyle (bkz. AppUpdateContext dokumantasyonu)
 * birleştirilmiş hâli. Native config: app.config.js → `updates`.
 */
import { useEffect, useRef } from "react";
import { Alert, AppState } from "react-native";
import * as Updates from "expo-updates";
import { getNotifyOnUpdate, otaUpdateConfig } from "@/services/otaUpdate";

export function useOtaUpdate() {
	const isCheckingRef = useRef(false);
	const declinedUpdateIdsRef = useRef(new Set());

	useEffect(() => {
		/* __DEV__ veya native config eksikse hiçbir network çağrısı açma. */
		if (__DEV__ || !otaUpdateConfig.isConfigured) {
			return undefined;
		}

		async function checkAndDownload() {
			if (isCheckingRef.current) return;

			try {
				isCheckingRef.current = true;

				const check = await Updates.checkForUpdateAsync();

				/*
				 * isRollBackToEmbedded: sunucu "embedded sürüme dön" emri
				 * vermiş demektir (bozuk güncellemeyi geri alma). Bu durumda
				 * indirme YOK — expo-updates bir sonraki açılışta embedded
				 * sürüme düşer; kullanıcıya dokunmayız.
				 */
				if (!check.isAvailable || check.isRollBackToEmbedded) return;

				const pendingUpdateId =
					check.manifest?.updateId ??
					check.manifest?.extra?.expoClient?.otaUpdateId;

				if (declinedUpdateIdsRef.current.has(pendingUpdateId)) {
					/* Zaten soruldu/reddedildi; sessiz indirme döngüsüne hiç
					 * girmeden çık — manifest id zaten sonraki açılışta
					 * uygulanacak, tekrar fetch boş yük olurdu. */
					return;
				}

				await Updates.fetchUpdateAsync();

				const notify = await getNotifyOnUpdate();
				if (!notify) return; // Sessiz model: bir sonraki açılışta otomatik.

				Alert.alert(
					"Yeni sürüm hazır",
					"Uygulama güncellemesi indirildi. Şimdi yenilemek ister misiniz? Reddeder, kısa bir süre sonra uygulamayı yeniden açabilirsiniz; güncelleme kendiliğinden uygulanır.",
					[
						{
							text: "Şimdi yenile",
							onPress: () => {
								Updates.reloadAsync().catch((reloadError) => {
									console.warn("OTA yenileme hatası:", reloadError?.message);
								});
							},
						},
						{
							text: "Kapat",
							style: "cancel",
							onPress: () => {
								if (pendingUpdateId) {
									declinedUpdateIdsRef.current.add(pendingUpdateId);
								}
							},
						},
					],
					{ cancelable: true },
				);
			} catch (error) {
				/* Sessiz akış bile hatayı kamufle etmeli: offline durum QUARANTINE
				 * DEĞİL — sonraki foreground'da tekrar dener. */
				console.warn("OTA güncelleme kontrol hatası:", error?.message);
			} finally {
				isCheckingRef.current = false;
			}
		}

		checkAndDownload();

		const subscription = AppState.addEventListener("change", (nextState) => {
			if (nextState === "active") {
				checkAndDownload();
			}
		});

		return () => {
			subscription.remove();
		};
	}, []);
}
