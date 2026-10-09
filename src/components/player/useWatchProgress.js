import { useCallback, useEffect, useRef } from "react";
import {
	addToWatchHistory,
	markEpisodeComplete,
	removeContinueWatching,
	saveContinueWatching,
} from "@/utils/storage";

/**
 * Tamamlanma eşikleri.
 *
 * ⚠️ ESKİ KURAL: oran >= 0.9 → tamamlandı. Bu, kullanıcı %95'e yalnızca
 * SEK EDİP çıksa bile içeriği tamamlanmış sayıyordu (kullanıcı şikâyeti).
 * `saveContinueWatching` de aynı eşiği kullanıyor; iki yerin ayrışması
 * "listede görünüyor ama tamamlanmış da sayılıyor" tutarsızlığı üretir.
 *
 * YENİ KURAL iki koşulu birlikte arar:
 *   · oran  → konum sona yaklaşmış mı
 *   · süre  → kullanıcı GERÇEKTEN izlemiş mi (seek atlamayı saymaz)
 */
const COMPLETION_PROGRESS_RATIO = 0.9;
/** Toplam sürenin en az bu kadarı gerçekten izlenmiş olmalı. */
const COMPLETION_WATCH_RATIO = 0.6;

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

	// İçerik değişince kayıt durumunu sıfırla.
	useEffect(() => {
		hasMarkedCompleteRef.current = false;
		lastSavedTimeRef.current = 0;
		lastObservedTimeRef.current = 0;
		watchedSecondsRef.current = 0;
	}, [contentId, targetUrl, seriesInfo?.episode, seriesInfo?.season]);

	/** İçerik bittiğinde: geçmişe "tamamlandı" olarak yaz. */
	const markComplete = useCallback(() => {
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
		 * Seek TESPİTİ: `onProgress` 500 ms sıklığında gelir; seek
		 * sonrası ilk karede konum sıçrar. Bu sıçramayı "izlenen süre"
		 * hesabına YANLIŞ eklememek için delta'nın büyüklüğüne bakıyoruz.
		 */
		const delta = curTime - lastObservedTimeRef.current;
		lastObservedTimeRef.current = curTime;

		// Büyük sıçrama = seek (ya da kaynak değişimi). İzlenen süreye
		// katılmaz; yalnızca konum güncellenir.
		const isSeek = lastObservedTimeRef.current > 0 && Math.abs(delta) > 3;

		if (!isSeek) {
			// Gerçek oynatma: geçen süreyi izlenen süreye ekle.
			watchedSecondsRef.current += Math.max(0, delta);
		}

		// Saklama eşiği: mutlak fark 5 sn. Geri sarmada da çalışır.
		const shouldSave =
			curTime >= 10 &&
			(lastSavedTimeRef.current === 0 ||
				Math.abs(curTime - lastSavedTimeRef.current) >= 5);
		if (!shouldSave) return;

		lastSavedTimeRef.current = curTime;
		const progress = curTime / totalDuration;

		/*
		 * Tamamlama kuralı: oran %90'ı geçse bile TEK BAŞINA yetmez —
		 * kullanıcının içerikte gerçekten izlediği süre de orantılı bir
		 * eşiği geçmelidir. Böylece %95'e atlayıp izlemeyen kullanıcı
		 * içeriği TAMAMLANMIŞ saymaz.
		 *
		 * Eşik = toplam sürenin %60'ı. Normalde izleyen kullanıcı bu eşiği
		 * zaten %90 oranına ulaşmadan geçer; sadece atlayan kullanıcı
		 * geride kalır.
		 */
		const requiredWatchSeconds = totalDuration * COMPLETION_WATCH_RATIO;
		const genuinelyWatched =
			progress >= COMPLETION_PROGRESS_RATIO &&
			watchedSecondsRef.current >= requiredWatchSeconds;

		if (genuinelyWatched) {
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

			const progress = curTime / totalDuration;

			/*
			 * ⚠️ Aynı "izlenen süre" kuralı: konum %90'ı geçse bile gerçekten
			 * izlenmemişse çıkışta da TAMAMLAMA yapılmaz, konum KAYDEDİLİR.
			 * Aksi hâlde kullanıcı %95'e atlayıp hemen çıkarsa içerik yine
			 * tamamlanmış sayılırdı (sorun 7).
			 */
			const genuinelyWatched =
				progress >= COMPLETION_PROGRESS_RATIO &&
				watchedSecondsRef.current >= totalDuration * COMPLETION_WATCH_RATIO;

			if (genuinelyWatched) {
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

	return { handleProgress, markComplete };
}