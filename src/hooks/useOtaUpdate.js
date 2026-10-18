/**
 * OTA güncelleme kontrol akışı (expo-updates · custom server).
 *
 * ── Akış ─────────────────────────────────────────────────────────────────
 *   1. Açılışta ve ön plana her dönüşte sessizce `checkForUpdateAsync`.
 *   2. Yeni manifest VARSAYSA `fetchUpdateAsync` ile arka planda indir.
 *   3. İndirme bittiğinde:
 *        - Bildirim tercihi KAPALIYSA (varsayılan): hiçbir şey yapılmaz,
 *          sadece `applicationPendingRef` işaretlenir.
 *        - Tercih AÇIKSA Alert: "Şimdi yenile" → `reloadAsync`; "Kapat"
 *          → aynı sessiz döngü.
 *   4. Uygulama ARKA PLANA geçtiğinde güncelleme HAZIRSA ve kullanıcı
 *      oturum-önemli bir ekranda DEĞİLSE → sessiz `reloadAsync`. Böylece
 *      kullanıcı güncel sürümü hiçbir "kapat-aç" yapmadan bir SONRAKİ
 *      dönüşte görür; fark etmesine gerek kalmaz.
 *
 * ── Güvenlik süzgeçleri ──────────────────────────────────────────────
 *   - __DEV__ bloklu: API'ler geliştirme modunda reddedilir.
 *   - Konkurenza kilidi: tek kontrol döngüsü (checkingRef).
 *   - Oturum-önemli ekranlar (BLOCKING_SEGMENTS): video oynatıcı,
 *     indirme ekranı, form/ayar vb. ARKA plana geçildikçe reload
 *     GECİKTİRİLİR — ekran değişince veya sonraki açılışta uygulanır.
 *   - Reddedilen güncelleme hatırlanır: kullanıcı "Kapat" derse aynı
 *     manifest id için tekrar SORULMAZ; sessiz otomatik uygulama
 *     (arka plan / sonraki açılış) yolu her koşulda açık kalır.
 *
 * Referans: AstorTest2 (app/_layout.jsx) akışının, StreamPulse'un
 * bloklamayan güncelleme UX'iyle (bkz. AppUpdateContext dokumantasyonu)
 * birleştirilmiş hâli. Native config: app.config.js → `updates`.
 */
import { useEffect, useRef } from "react";
import { Alert, AppState } from "react-native";
import { useSegments } from "expo-router";
import * as Updates from "expo-updates";
import { getNotifyOnUpdate, otaUpdateConfig } from "@/services/otaUpdate";

/**
 * Arka plana geçişte reload'un GÜVENSİZ olduğu route segmentleri.
 * `useSegments()` route adlarını ve `[param]` değerlerini döndürür;
 * route adı bölümü bu sette geçiyorsa reload GECİKTİRİLİR.
 */
const BLOCKING_SEGMENTS = new Set([
	"(auth)", // login/register/tv-login — form girdisi
	"player", // video oynatıcı (aktif oynatma)
	"MovieDetails", // detay + oynatma girişi
	"live", // canlı yayın listesi/izleme
	"downloads", // öğe indirme ilerlemesi
	"library", // mini oynatma (playingItemId)
	"tv-activate", // TV eşleştirme akışı
	"settings", // ayar ekranları (form + geçiş hâli)
	"EditProfile", // profil formu girdisi
]);

export function useOtaUpdate() {
	const isCheckingRef = useRef(false);
	const declinedUpdateIdsRef = useRef(new Set());
	const applicationPendingRef = useRef(false);
	const segmentsRef = useRef([]);

	/* Son segment değerini ref'te tut: async/subscription kapanışlarında
	 * staleClosure yerine daima güncel değer okunsun. */
	const segments = useSegments();
	useEffect(() => {
		segmentsRef.current = segments ?? [];
	}, [segments]);

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
					 * girmeden çık — indirme zaten tamamlanmış, güncelleme
					 * arka plan / sonraki açılışta uygulanacak. */
					return;
				}

				await Updates.fetchUpdateAsync();

				/* İndirme tamam → arka plana geçişte sessiz uygulama kapısı
				 * açık (bildirim tercihinden bağımsız). */
				applicationPendingRef.current = true;

				const notify = await getNotifyOnUpdate();
				if (!notify) return; // Sessiz model: arka plan / sonraki açılışta otomatik.

				Alert.alert(
					"Yeni sürüm hazır",
					"Uygulama güncellemesi indirildi. Şimdi yenilemek ister misiniz? Redderseniz arka plana geçtiğinizde veya uygulamayı yeniden açtığınızda sessizce uygulanır.",
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
				/* Hata olsa bile sessizce atlanır: sonraki foreground'da
				 * tekrar denenir, kullanıcıya gösterilmez. */
				console.warn("OTA güncelleme kontrol hatası:", error?.message);
			} finally {
				isCheckingRef.current = false;
			}
		}

		checkAndDownload();

		const subscription = AppState.addEventListener("change", (nextState) => {
			if (nextState === "active") {
				checkAndDownload();
				return;
			}

			/*
			 * Arka plana geçişte bekleyen güncellemeyi uygula — yalnızca
			 * oturum-önemli bir ekranda DEĞİLSEK (video, indirme, form,
			 * ayar). Güvensiz ekranda gecikir: kullanıcı o ekrandan çıkıp
			 * tekrar arka plana geçince uygulanır; hiç yapılmazsa sonraki
			 * tam açılışta expo-updates yine otomatik devreye alır.
			 */
			if (
				nextState === "background" &&
				applicationPendingRef.current &&
				!segmentsRef.current.some((segment) =>
					BLOCKING_SEGMENTS.has(segment),
				)
			) {
				applicationPendingRef.current = false;
				Updates.reloadAsync().catch((reloadError) => {
						/* Reload başarısız olursa bayrağı geri kapatma — bir
						 * sonraki arka plan geçişinde tekrar dener. */
						applicationPendingRef.current = true;
						console.warn("OTA arka plan yenileme hatası:", reloadError?.message);
					});
			}
		});

		return () => {
			subscription.remove();
		};
	}, []);
}
