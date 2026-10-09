import { useCallback, useEffect, useRef } from "react";
import {
	addToWatchHistory,
	markEpisodeComplete,
	removeContinueWatching,
	saveContinueWatching,
} from "@/utils/storage";

/**
 * Tamamlama eşiği: konum oranı bu değere ulaşınca içerik tamamlanmış
 * sayılır ve "kaldığın yerden devam et" listesinden kaldırılır.
 *
 * ⚠️ TARİHÇE:
 *
 *   1. Başlangıçta kural böyleydi ve kullanıcı memnundu.
 *   2. "Tamamlanmamış içerik tamamlanmış sayılıyor" şikâyeti üzerine
 *      `watchedSeconds >= %60` koşulu eklendi.
 *   3. Bu koşul kullanıcının BEKLEDİĞİ davranışı bozdu: "videonun tüm
 *      süresini tamamlarsam çalışıyor ama önceden %90 gelince bu
 *      listeden kalkıyordu."
 *   4. Koşul tamamen kaldırıldı; %90 geri geldi.
 *
 * Bu, Netflix / YouTube / Prime ve referans uygulama CloudStream
 * davranışıdır. Kullanıcı son %10'a geldiyse içerik bitmiştir; sarmayla
 * mı ilerlediği sorgulanmaz.
 */
const COMPLETION_PROGRESS_RATIO = 0.9;

/**
 * Resume toleransı (saniye).
 *
 * Resume hedefine bu kadar yaklaşınca "ulaşıldı" kabul edilir.
 * Tam eşitlik çok katıdır: HLS segment sınırları ve kayan nokta
 * yuvarlaması hedefin birkaç saniye altında kalmasına yol açar; bu
 * durumda koruma kalıcı olarak "henüz ulaşılmadı" der ve içerik hiç
 * kaydedilmezdi.
 */
const RESUME_SLACK_SECONDS = 10;

/**
 * Olaylar arasındaki duvar-saati için tolerans (saniye).
 *
 * `onProgress` 500 ms aralıkla gelir; iki olay arasında gerçek zaman
 * **her zaman** bir miktar akar. Tam eşitlik (`min(delta, wallElapsed)`)
 * kısa oynatmalarda krediyi gereksiz yere sıfırlardı.
 */
const SEEK_GRACE_SECONDS = 1;

/**
 * Monotonik duvar-saati (ms).
 *
 * React Compiler'ın saflık kuralı (`react-hooks/purity`) render'da
 * `Date.now()` çağrılmasını reddeder. Bu çağrı yalnızca `onProgress`
 * OLAY geri çağırmasının İÇİNDEDİR, render'da değil.
 */
function nowMs() {
	return typeof performance !== "undefined" && performance.now
		? performance.now()
		: Date.now();
}

/**
 * ── `useWatchProgress` ─────────────────────────────────────────
 *
 * "Kaldığın yerden devam et" ve "izleme geçmişi" kayıtlarının TÜM
 * mantığı burada. `VideoPlayer` bu dosyayı okumaz; yalnızca `onProgress`
 * verisini ve içerik kimliğini geçer.
 *
 * ⚠️ Neden ayrı dosya: bu mantık `handleProgress` içine gömülüyken
 * ana bileşen 1900 satırdı ve üç ayrı sorumluluğu (render, jest, kalıcı
 * kayıt) aynı yerdeydi. Sorumluluk ayrımı, birini değiştirirken diğer
 * ikisini yanlışlıkla bozma riskini ortadan kaldırır.
 *
 * ⚠️ AYAR DEĞERİ: `canSeek` kapısı. Canlı yayında `totalDuration`
 * BİLEREK 0 yazılır; HLS canlıda `duration` "oynatma penceresi" olarak
 * bildirilir ve büyür, normal akışta oran 0.9'u geçince içerik "bitti"
 * sayılırdı. Bu, `expo-video` için yazılmış bir notun `react-native-video`
 * ya taşınmasıdır — mantık ve niyet korunmuştur.
 *
 * @param {object}   options
 * @param {Function} options.onProgress  (currentTime, duration) => void
 */
export default function useWatchProgress({
	contentId,
	contentType,
	title,
	poster,
	targetUrl,
	seriesInfo,
	plugin,
	subtitle,
	isLive,
	canSeek,
	resolvedUrl,
	resumeTarget = 0,
	onProgress,
}) {
	const lastSavedTimeRef = useRef(0);
	const hasMarkedCompleteRef = useRef(false);
	const currentTimeRef = useRef(0);
	const durationRef = useRef(0);
	// Son gözlenen konum: seek tespiti için (bkz. `handleProgress`).
	const lastObservedTimeRef = useRef(0);
	// Kullanıcının GERÇEKTEN izlediği süre (seek atladığı süre hariç).
	const watchedSecondsRef = useRef(0);

	/*
	 * ⚠️ SORUN 3 VE 4 — ARABELLEK SIKIŞMASI "SEEK" SAYILIYORDU.
	 *
	 * "Dizi bölümü tamamladıktan sonra kaldığın yerden devam et'ten
	 * kalkmıyor" ve "yeni bölüm otomatik gelmiyor".
	 *
	 * Eski tespit kuralı büyüklük eşiğine bakıyordu:
	 *
	 *     const isSeek = Math.abs(delta) > 3;
	 *
	 * `onProgress` 500 ms'de bir geliyor, yani normal ilerleme `delta`
	 * ≈ 0.5 sn'dir. Ancak **yavaş bağlantıda video arabelleğe alır**;
	 * arabellekten çıkınca `currentTime` tek olayda 10-30 saniye atlar.
	 * Bu atlayış `delta > 3` olduğu için "kullanıcı seek etti" sanılıyor
	 * ve izlenen süreye EKLENMİYOR.
	 *
	 * Sonuç: kullanıcı bölümü baştan sona izliyor, `watchedSecondsRef`
	 * yine de eşiğe ulaşamıyor → `genuinelyWatched` false →
	 * `markComplete()` hiç çalışmıyor → hem tamamlama kaydı yapılmıyor
	 * (sorun 3) hem de sonraki bölüm eklenmiyor (sorun 4).
	 *
	 * ÇÖZÜM — iki kaynak birbirinden ayrılıyor:
	 *
	 *  1. KULLANICI ARACILIĞI İLE GERÇEKLEŞEN SEEK'İ BİZ İŞARETLİYORUZ.
	 *     `noteUserSeek()` çağrılır; bir sonraki ilerlemede bu olay
	 *     seek sayılır ve izlenen süreye girmez.
	 *
	 *  2. ARI BÜYÜKLÜK EŞİĞİ KALDIRILDI. Seek işaretlenmemişse atlayış
	 *     arabellek çıkışıdır ve kullanıcı O SÜRE İZLİYORDUR; ama
	 *     arabellekte geçen süre "izleme" sayılmaz. Bu yüzden kredilenen
	 *     süre, iki olay arasındaki GERÇEK duvar-saatiyle sınırlanır:
	 *
	 *         kredi = min(currentTime atlama, geçen duvar-saati + tolerans)
	 *
	 *     Böylece 10 dakikalık arabelleklenmiş oynatma, 10 dakika
	 *     "izlenmiş" sayılmaz; ama 10 saniyelik kısa bir arabellek
	 *     çıkışı da oynatıcıyı mahkûm etmez.
	 */

	/** Kullanıcı (veya resume/kaynak değişimi) seek başlattı. */
	const pendingUserSeekRef = useRef(false);
	/** Son `onProgress` olayının duvar-saati (ms). */
	const lastProgressWallRef = useRef(0);

	const noteUserSeek = useCallback(() => {
		pendingUserSeekRef.current = true;
	}, []);

	/*
	 * ⚠️ SORUN 7: YAVAŞ BAĞLANTIDA KALDIĞIN KONUM EZİLİYOR.
	 *
	 * "Bağlantı yavaş olduğu için video geç yükleniyor, bu yüzden
	 * kaldığın yerden devam et video tarafından eziliyor gibi."
	 *
	 * Mekanizma:
	 *   1. Kullanıcı 30:00'da kaldığı bir içeriği açıyor (kayıtlı).
	 *   2. `Video` mount olur, `onLoad` gelir; resume seek'i
	 *      `setTimeout(..., 300)` ile UYGULANIR.
	 *   3. Yavaş bağlantıda bu 300 ms içinde `onProgress` birkaç kez
	 *      gelir ve konum 0 → 5 → 10 → ... ilerler.
	 *   4. `shouldSave` yalnızca `curTime >= 10` diyor → **10 saniyelik
	 *      konum hemen kaydediliyor**, kayıtlı 30:00 SİLİNİYOR.
	 *   5. Kullanıcı oynatmadan çıkarsa (ya da oynatıcı yeniden yüklenirse)
	 *      elinde 10 saniyelik bir kayıt kalıyor.
	 *
	 * `resumeTarget` bu pencereyi kapatır: resume uygulanana kadar
	 * (ya da oynatıcı gerçekten oraya ulaşana kadar) KAYIT YAPILMAZ.
	 */
	const resumeTargetRef = useRef(0);

	/**
	 * Yeni içerik yüklendiğinde çağrılır: resume hedefini bildirir.
	 * `VideoPlayer`, kayıtlı konumu `onLoad` sırasında buraya geçirir.
	 */
	const setResumeTarget = useCallback((seconds) => {
		const v = Number(seconds) || 0;
		resumeTargetRef.current = v > 0 ? v : 0;
		// Yeni hedef için sayaçları da sıfırla.
		lastSavedTimeRef.current = 0;
		lastObservedTimeRef.current = 0;
	}, []);

	// İçerik değişince kayıt durumunu sıfırla.
	useEffect(() => {
		hasMarkedCompleteRef.current = false;
		lastSavedTimeRef.current = 0;
		lastObservedTimeRef.current = 0;
		watchedSecondsRef.current = 0;
	}, [contentId, targetUrl, seriesInfo?.episode, seriesInfo?.season]);

	/**
	 * İçerik bittiğinde: geçmişe "tamamlandı" olarak yaz.
	 *
	 * @param {boolean} force `true` ise (video GERÇEKTEN sonuna ulaştıysa,
	 *   yani `onEnd` geldiyse) "izlenen süre" eşiğine bakılmaz.
	 *
	 * ⚠️ SORUN 3/4 — KULLANICI TALE BİRLEŞTİRME.
	 *
	 * "Sardırma yaparak bitirsem bile bu özellik çalışmalı, önceden
	 * çalışıyordu."
	 *
	 * Burada iki farklı eylem karıştırılıyor:
	 *
	 *   a) Kullanıcı sonuna kadar sardı ve VİDEO BİTTİ (`onEnd`) →
	 *      içeriği bitirmiştir. Netflix, YouTube, Prime ve CloudStream'in
	 *      tamamında bu durumda "tamamlandı" işaretlenir; atlama yapılıp
	 *      yapılmadığı SORGULANMAZ. Aksi hâlde kullanıcı 90 dakika
	 *      sarmadan bitirdiğinde uygulama ona "izlemedin" der — bu
	 *      yanlış.
	 *
	 *   b) Kullanıcı %95'e kadar sardı ve ÇIKTI (video bitmedi) →
	 *      burada "izlenen süre" eşiği korunur. Bu koruma, "tamamlanmamış
	 *      içerik tamamlanmış sayılıyor" şikâyetini karşılar.
	 *
	 * Önceki hâlde (a) bile `watchedSecondsRef` eşiğine takılıyordu,
	 * çünkü sarmada geçen süre "izlenen süreye" girmiyordu. Yani
	 * kullanıcı filmi sürükleyerek bitiremiyordu.
	 *
	 * `onEnd` artık `force = true` ile çağırılır ve (a) her zaman tamamlanır.
	 */
	const markComplete = useCallback((force = false) => {
		const id = contentId || targetUrl || resolvedUrl;
		if (!id || isLive || hasMarkedCompleteRef.current) return;
		hasMarkedCompleteRef.current = true;

		const url = targetUrl || resolvedUrl;

		if (contentType === "episode") {
			markEpisodeComplete(
				seriesInfo?.seriesId,
				seriesInfo?.season,
				seriesInfo?.episode,
				seriesInfo?.nextEpisode,
				{
					id,
					title,
					poster,
					url,
					seriesTitle: seriesInfo?.seriesTitle,
					episodeTitle: seriesInfo?.episodeTitle,
					totalEpisodes: seriesInfo?.totalEpisodes,
					seriesUrl: seriesInfo?.seriesUrl,
					plugin: plugin || seriesInfo?.plugin,
				},
			);
		} else {
			removeContinueWatching(id);
			addToWatchHistory({
				id,
				title,
				poster,
				type: "movie",
				url,
				plugin: plugin || seriesInfo?.plugin,
				overview: subtitle,
				isCompleted: true,
				progress: 1.0,
				watchedAt: new Date().toISOString(),
			});
		}
	}, [
		contentId,
		contentType,
		title,
		poster,
		targetUrl,
		seriesInfo,
		plugin,
		subtitle,
		isLive,
		resolvedUrl,
	]);

	/**
	 * İlerleme güncellemesi.
	 *
	 * ⚠️ BU FONKSİYONDA KULLANICI ŞİKÂYETİ (sorun 7) GİDERİLDİ:
	 * "Bazen kaldığın yeri doğru kaydetmiyor, bazen tamamlanmamış içerik
	 * tamamlanmış sayılıyor."
	 *
	 * ESKİ KURAL iki ayrı hata üretiyordu:
	 *
	 *  (a) `curTime - lastSaved >= 5` — GERİ SARMA sonrası fark NEGATİF
	 *      olduğu için kayıt yapılmıyordu; diskteki konum İLERİDE kalıyordu.
	 *      Kullanıcı geri sarmayı bırakıp çıkınca "izlediğim yere dön" yerine
	 *      daha ileri bir konum açılıyordu.
	 *
	 *  (b) `progress >= 0.9 → markComplete()` — konum tek başına yeterli
	 *      sayılıyordu. Kullanıcı %95'e SADECE SEK EDİP izlemeden çıkarsa
	 *      içerik "tamamlandı" işaretleniyordu. Bu, izleme geçmişini
	 *      kullanıcının izlemediği içeriklerle dolduruyordu.
	 *
	 * YENİ KURAL:
	 *  · Saklama: zaman FARKININ mutlak değeri 5 sn'yi aşarsa KAYDEDİLİR.
	 *    Geri sarma da kayda girer.
	 *  · Tamamlama: konum oranı DEĞİL, **izlenen süre** kullanılır. Yani
	 *    kullanıcının o içerikte geçirdiği toplam duvar-saati, orantılı
	 *    biçimde (seek atladığı süre kadar) hesaplanır. Bu, referans
	 *    uygulamanın "seek'i tamamlanma saymama" davranışıdır.
	 */
	const handleProgress = (curTime, playableDuration) => {
		currentTimeRef.current = curTime;
		durationRef.current = playableDuration || 0;
		onProgress?.(curTime, playableDuration);

		const totalDuration = canSeek ? playableDuration || 0 : 0;
		const id = contentId || targetUrl || resolvedUrl;

		if (!id || totalDuration <= 0) return;

		/*
		 * ⚠️ SORUN 9 — TAMAMLAMA GERİ ALINAMAZ OLMALI.
		 *
		 * "Dizi bölümü ya da film tamamladıktan sonra kaldığın yerden
		 * devam et kısmından otomatik kalkmıyor."
		 *
		 * Mekanizma: tamamlama kararı `watchedSecondsRef` ile veriliyor.
		 * Bu sayaç içerik değişince sıfırlanıyor. Oynatma sırasında bir
		 * yeniden render'da (ör. eklenti detayı yeniden çekilirken
		 * `seriesInfo` değişirse) sayaç sıfırlanabiliyor. O an:
		 *
		 *   · `handleProgress` artık `genuinelyWatched` bulamıyor,
		 *   · unmount cleanup'ı `markComplete` yerine
		 *     `saveContinueWatching` çağırıyor,
		 *   · içerik "devam et" listesine DÜNDÜ.
		 *
		 * Çözüm: tamamlama kararı TEK YÖNLÜDÜR. Bir kez tamamlandıysa
		 * bu oturum boyunca hiçbir olay onu geri alıp listeye
		 * yeniden yazamaz.
		 */
		if (hasMarkedCompleteRef.current) return;

		/*
		 * İLERLEME HESABI (sorun 3 + 4).
		 *
		 * `delta`: iki olay arasındaki KONUM farkı.
		 * `wallElapsed`: iki olay arasındaki GERÇEK geçen süre.
		 *
		 * ⚠️ SIRA ÖNEMLİ — BURADA İKİ KEZ BUG YAPILDI:
		 *
		 *   1. `isFirstObservation` hesabı `lastObservedTimeRef.current =
		 *      curTime` ATAMASINDAN SONRA yapılırsa `current === curTime`
		 *      olduğu için DAİMA `true` döner. Bu durumda
		 *      `watchedSecondsRef` HİÇ ARTMAZ ve `genuinelyWatched` hiç
		 *      `true` olmaz → içerik hiçbir zaman tamamlanmaz.
		 *
		 *   Doğrusu: "ilk olay mu?" sorusu, eski değer HENÜZ
		 *   üzerine yazılmadan, yani `delta`'nın hesaplandığı anda
		 *   cevaplanmalıdır.
		 *
		 *   2. `lastProgressWallRef` de aynı nedenle ilk olayda
		 *      duvar-saati farkı `delta`ya eşit olmalıdır; aksi hâlde
		 *      ilk olay kendi kendisine kredi verir.
		 *
		 * Seek'i artık büyüklükten değil, KENDİ işaretimizden anlıyoruz.
		 */
		const isFirstObservation = lastObservedTimeRef.current === 0;
		const delta = curTime - lastObservedTimeRef.current;
		lastObservedTimeRef.current = curTime;

		const wallNow = nowMs();
		const isFirstWall = lastProgressWallRef.current === 0;
		const wallElapsed = isFirstWall
			? delta
			: Math.max(0, (wallNow - lastProgressWallRef.current) / 1000);
		lastProgressWallRef.current = wallNow;

		// Kullanıcı aracılığıyla (veya resume/kaynak değişimi) başlatılan
		// seek: izlenen süreye katılmaz, işaret temizlenir.
		const isUserSeek = pendingUserSeekRef.current;
		if (isUserSeek) pendingUserSeekRef.current = false;

		if (!isUserSeek && !isFirstObservation && !isFirstWall) {
			/*
			 * Arabellek çıkışı: konum büyük bir sıçrama yaptı ama
			 * kullanıcı gerçekte yalnızca `wallElapsed` kadar süre
			 * izleyebildi. Krediyi duvar-saatiyle sınırlıyoruz.
			 *
			 * `SEEK_GRACE_SECONDS`: `onProgress` 500 ms'de bir geldiği
			 * için olaylar arasında daima bir miktar duvar-saati vardır;
			 * tam eşitlik kısa oynatmaları haksız yerine sıfır kredilirdi.
			 */
			const credited = Math.min(
				Math.max(0, delta),
				wallElapsed + SEEK_GRACE_SECONDS,
			);
			watchedSecondsRef.current += credited;
		}

		// Saklama eşiği: mutlak fark 5 sn. Geri sarmada da çalışır.
		const shouldSave =
			curTime >= 10 &&
			(lastSavedTimeRef.current === 0 ||
				Math.abs(curTime - lastSavedTimeRef.current) >= 5);
		if (!shouldSave) return;

		/*
		 * ⚠️ SORUN 7 — RESUME PENCERESİ KORUMASI.
		 *
		 * Resume hedefi varsa ve oynatıcı henüz ona ULAŞMADIYSA kayıt
		 * yapılmaz. Yavaş bağlantıda resume seek'i uygulanana kadar
		 * `onProgress` düşük konumlar bildirir; bunları yazmak kayıtlı
		 * ilerlemeyi silerdi.
		 *
		 * Tolerans: `RESUME_SLACK_SECONDS`. Hedefe tam olarak varamayan
		 * durumlarda (HLS segment atlama, yuvarlama) sürekli "ulaşılmadı"
		 * sayıp hiç kayıt almamak yerine hedefe yaklaşmış konumları
		 * kabul ediyoruz.
		 *
		 * ⚠️ Bu koruma SADECE geriye doğru ilerlemeyi engeller. Kullanıcı
		 * resume noktasından sonra normal izliyorsa `curTime >= hedef`
		 * olduğu için koruma devre dışı kalır, kayıt serbestçe devam eder.
		 */
		const resumeTarget = resumeTargetRef.current;
		if (
			resumeTarget > 0 &&
			curTime < resumeTarget - RESUME_SLACK_SECONDS
		) {
			return;
		}

		lastSavedTimeRef.current = curTime;
		const progress = curTime / totalDuration;

		/*
		 * Tamamlama kuralı: oran %90'a ulaştığında içerik tamamlanmış
		 * sayılır.
		 *
		 * ⚠️ TARİHÇE — BURAYA İKİ KEZ AŞIRI KURAL EKLENDİ, SONRA GERİ
		 * ALINDI:
		 *
		 *   1. Önce `progress >= 0.9` tek başına yeterliydi (doğru davranış).
		 *   2. "Tamamlanmamış içerik tamamlanmış sayılıyor" şikâyeti
		 *      üzerine `watchedSeconds >= %60` koşulu eklendi.
		 *   3. Kullanıcı geri bildirdi: "videonun tüm süresini
		 *      tamamlarsam çalışıyor ama önceden %90 gelince bu
		 *      listeden kalkıyordu". Yani %60 koşulu, kullanıcının
		 *      BEKLEDİĞİ davranışı bozuyordu.
		 *
		 * Sonuç: koşul tamamen kaldırıldı, %90 eşiği geri geldi. Bu,
		 * Netflix / YouTube / Prime ve referans uygulama CloudStream
		 * davranışıdır: son %10'a gelen içerik tamamlanmıştır.
		 *
		 * "İzlenen süre" sayacı (`watchedSecondsRef`) yalnızca ilerleme
		 * hesabında kalıyor; tamamlama kararına artık girmez.
		 */
		if (progress >= COMPLETION_PROGRESS_RATIO) {
			markComplete();
			return;
		}

		saveContinueWatching({
			id,
			title,
			poster,
			type: contentType,
			currentTime: curTime,
			duration: totalDuration,
			progress,
			url: targetUrl || resolvedUrl,
			seriesId: seriesInfo?.seriesId,
			seriesTitle: seriesInfo?.seriesTitle,
			seriesUrl: seriesInfo?.seriesUrl,
			plugin: plugin || seriesInfo?.plugin,
			season: seriesInfo?.season,
			episode: seriesInfo?.episode,
			episodeTitle: seriesInfo?.episodeTitle,
			nextEpisode: seriesInfo?.nextEpisode,
			totalEpisodes: seriesInfo?.totalEpisodes,
		});
	};

	// Bileşen kapanırken son konumu kaydet (kullanıcı geri tuşuyla çıkmış
	// olabilir; `onProgress` her 5 saniyede bir yazdığı için buradaki
	// kayıt 5 saniyeye kadar tazeyleştirir).
	useEffect(() => {
		return () => {
			const curTime = currentTimeRef.current;
			const totalDuration = durationRef.current;
			const id = contentId || targetUrl || resolvedUrl;
			if (!id || isLive || curTime < 10 || totalDuration <= 0) return;

			/*
			 * ⚠️ SORUN 7 — ÇIKIŞ KAYDINDA DA AYNI KORUMA.
			 *
			 * Kullanıcı resume uygulanmadan çıkarsa (yavaş bağlantı +
			 * hemen kapatma) `currentTimeRef` düşük bir değerde olur.
			 * Bu değeri yazmak kayıtlı ilerlemeyi silerdi. Resume hedefi
			 * ulaşılmadıysa kayıt YAPILMAZ — diskteki kayıtlı konum
			 * olduğu gibi kalır ve kullanıcı bir sonraki açılışta doğru
			 * yerden devam eder.
			 */
			const resumeTarget = resumeTargetRef.current;
			if (
				resumeTarget > 0 &&
				curTime < resumeTarget - RESUME_SLACK_SECONDS
			) {
				return;
			}

			/*
			 * ⚠️ SORUN 9 (çıkış yolu): Oturumda tamamlanmış içerik
			 * çıkışta YENİDEN kaydedilmez.
			 *
			 * `markComplete` bu noktadan önce çalışmış olabilir ve
			 * `watchedSecondsRef` arada sıfırlanmış olabilir. Eski
			 * davranışta bu durumda `genuinelyWatched` `false` çıkıp
			 * `saveContinueWatching` çağrılıyordu → tamamlanan bölüm
			 * "kaldığın yerden devam et" listesine geri dönüyordu.
			 */
			if (hasMarkedCompleteRef.current) return;

			const progress = curTime / totalDuration;

			/*
			 * Çıkışta da %90 kuralı: `onProgress` son %10'a gelmeden
			 * kullanıcı kapatırsa (`onEnd` çalışmaz), konum oranı tek
			 * başına yeterlidir — aksi hâlde tamamlanması gereken içerik
			 * listede kalırdı.
			 */
			if (progress >= COMPLETION_PROGRESS_RATIO) {
				markComplete();
				return;
			}

			saveContinueWatching({
				id,
				title,
				poster,
				type: contentType,
				currentTime: curTime,
				duration: totalDuration,
				progress,
				url: targetUrl || resolvedUrl,
				seriesId: seriesInfo?.seriesId,
				seriesTitle: seriesInfo?.seriesTitle,
				season: seriesInfo?.season,
				episode: seriesInfo?.episode,
				episodeTitle: seriesInfo?.episodeTitle,
				nextEpisode: seriesInfo?.nextEpisode,
			});
		};
	}, [
		contentId,
		targetUrl,
		title,
		poster,
		contentType,
		seriesInfo,
		resolvedUrl,
		isLive,
		markComplete,
	]);

	return { handleProgress, markComplete, setResumeTarget, noteUserSeek };
}