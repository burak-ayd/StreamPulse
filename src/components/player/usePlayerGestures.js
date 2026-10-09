import { useCallback, useEffect, useRef, useState } from "react";
import { Dimensions, PanResponder, Platform } from "react-native";
import {
	getBrightnessSync,
	getSystemVolumeSync,
	setVolumeKeyIntercept,
	subscribeSystemVolume,
} from "@/utils/deviceControls";
import {
	DOUBLE_TAP_PAUSE_ZONE,
	DOUBLE_TAP_WINDOW_MS,
	GESTURE_FEEDBACK_MS,
	MAX_TAP_HOLD_MS,
	MAX_ZOOM,
	MIN_SEEK_DELTA_SEC,
	MIN_SWIPE_RATIO,
	MIN_VERTICAL_SWIPE_RATIO,
	MIN_ZOOM,
	SEEK_CURVE,
	SWIPE_MULTIPLIER,
	ZOOM_SNAP,
} from "./constants";

/**
 * ── `usePlayerGestures` ────────────────────────────────────────
 *
 * Oynatıcının TÜM dokunma jestlerini tek bir `PanResponder` state
 * makinesinde toplar.
 *
 * ⚠️ NEDEN TEK HOOK: bu jestler birbirine karar verir. Örneğin bir
 * dokunuşta "yatay mı, dikey mi, pinch mi" sorusu cevaplanmadan hiçbiri
 * başlamaz; hepsi `activeAction` üzerinden AYRIŞIR. Ayrı `PanResponder`
 *'lara bölmek, aynı anda birden fazla tanıyıcının sahiplenmesine ve
 * (canlıda yaşandığı gibi) çift dokunmanın hiç çalışmamasına yol açar.
 *
 * `gestures` bayrakları ayarlardan gelir; biri kapatıldığında o jest
 * hiç ARM OLMAZ, yani kullanıcı beklenmedik bir davranış değişikliği
 * yaşamaz.
 *
 * @param {object}   options
 * @param {boolean}  options.canSeek        - VOD'da true, canlıda false
 * @param {boolean}  options.isLive
 * @param {boolean}  options.isLocked       - Kilitliyken tüm jestler kapanır
 * @param {number}   options.duration       - Toplam süre (sn)
 * @param {number}   options.currentTime    - Anlık konum (sn)
 * @param {number}   options.seekDuration   - Çift dokunma adımı (sn)
 * @param {object}   options.flags          - Ayarlardan gelen jest bayrakları
 * @param {Function} options.onSeek              (absSeconds) => void
 * @param {Function} options.onSeekBy            (deltaSeconds) => void
 * @param {Function} options.onTogglePlayPause   () => void
 * @param {Function} options.onSingleTap        () => void
 * @param {Function} options.onHoldSpeedUp      (active: boolean) => void
 * @param {Function} options.onBrightness       (ratio0to1) => void
 * @param {Function} options.onVolume           (ratio0to1) => void
 * @param {Function} options.onSpeedUpRate      (rate) => void
 * @param {Function} options.onInteractionStart () => void  - HUD/kontroller
 * @param {Function} options.onInteractionEnd   () => void
 */
export default function usePlayerGestures({
	canSeek,
	isLive,
	isLocked,
	duration,
	currentTime,
	seekDuration,
	flags = {},
	onSeek,
	onSeekBy,
	onTogglePlayPause,
	onSingleTap,
	onHoldSpeedUp,
	onBrightness,
	onVolume,
	onSpeedUpRate,
	onInteractionStart,
	onInteractionEnd,
}) {
	// ── Canlı görünür geri bildirimleri ────────────────────────
	const [doubleTapInfo, setDoubleTapInfo] = useState(null);
	const [scrubInfo, setScrubInfo] = useState(null); // { position, delta }
	const [hud, setHud] = useState(null); // { type:'brightness'|'volume', ratio, locked }
	const [speedUpActive, setSpeedUpActive] = useState(false);
	const [zoomScale, setZoomScale] = useState(1);

	// ── Ref'ler: PanResponder `[]` ile memo'landığı için ────────
	// (dosyadaki genel desen) güncel değerler refle taşınır.
	const lastTapRef = useRef({ time: 0, x: 0 });
	const pressStartRef = useRef({ time: 0, x: 0, y: 0 });
	/*
	 * Bekleyen TEK dokunuşun zamanlayıcısı (sorun 8).
	 *
	 * İlk dokunuşta `onSingleTap` ertelenir; ikinci dokunuş gelirse
	 * iptal edilir, gelmezse bu zamanlayıcı tetikler.
	 */
	const pendingSingleTapTimerRef = useRef(null);
	const activeActionRef = useRef(null); // 'time' | 'brightness' | 'volume' | 'zoom' | null
	const lastTouchRef = useRef({ x: 0, y: 0 });
	const startTimeRef = useRef(0);
	const longPressTimerRef = useRef(null);
	const hudTimerRef = useRef(null);
	const gestureArmedRef = useRef(false);
	const zoomStartRef = useRef(null);
	const didPanRef = useRef(false);

	/*
	 * `PanResponder` `[]` ile memo'landığı için içinde okunan her değer
	 * refle taşınmak ZORUNDADIR. `scrubInfo` ve `speedUpActive` state olarak
	 * tutulur (JSX bunları render eder) ama `PanResponder` yalnızca ref'in
	 * okuduğu yerde görür — böylece useMemo yeniden oluşmaz.
	 */
	const scrubInfoRef = useRef(scrubInfo);
	const speedUpActiveRef = useRef(speedUpActive);
	// Zoom, `PanResponder` içinden okunduğu için de refle taşınır.
	const zoomScaleRef = useRef(1);
	useEffect(() => {
		zoomScaleRef.current = zoomScale;
	}, [zoomScale]);

	/*
	 * Güncel render değerleri.
	 *
	 * ⚠️ Ref RENDER SIRASINDA güncellenmez; bir `useEffect` ile
	 * senkronlanır. Render'da `ref.current = ...` yazmak, React'in
	 * "bir bileşen saf olmalı" kuralını ihlal eder ve eşzamanlı render'da
	 * yarış koşulu yaratır (stateRef, bir sonraki render'ın değerlerini
	 * önceki render'ın handler'larına sızdırabilir).
	 */
	const stateRef = useRef({});
	// PanResponder'ın okuduğu state'ler de senkronlanır (bkz. `*Ref` notu).
	useEffect(() => {
		scrubInfoRef.current = scrubInfo;
	}, [scrubInfo]);
	useEffect(() => {
		speedUpActiveRef.current = speedUpActive;
	}, [speedUpActive]);

	useEffect(() => {
		stateRef.current = {
			canSeek,
			isLive,
			isLocked,
			duration,
			currentTime,
			seekDuration,
			flags,
			onSeek,
			onSeekBy,
			onTogglePlayPause,
			onSingleTap,
			onHoldSpeedUp,
			onBrightness,
			onVolume,
			onSpeedUpRate,
			onInteractionStart,
			onInteractionEnd,
		};
	});

	const clearLongPress = useCallback(() => {
		if (longPressTimerRef.current) {
			clearTimeout(longPressTimerRef.current);
			longPressTimerRef.current = null;
		}
	}, []);

	const scheduleHudHide = useCallback(() => {
		if (hudTimerRef.current) clearTimeout(hudTimerRef.current);
		hudTimerRef.current = setTimeout(() => setHud(null), 1200);
	}, []);

	/** Kullanıcıya kısa süreli geri bildirim gösterir (çift dokunma ikonu). */
	const flashDoubleTap = useCallback((type, delta) => {
		setDoubleTapInfo({ type, delta });
		setTimeout(() => setDoubleTapInfo(null), GESTURE_FEEDBACK_MS);
	}, []);

	const showHud = useCallback(
		(type, ratio, locked) => {
			setHud({ type, ratio, locked: Boolean(locked) });
			scheduleHudHide();
		},
		[scheduleHudHide],
	);

	// ── Boyut ölçümü ───────────────────────────────────────────
	const getSize = useCallback(() => Dimensions.get("window"), []);

	// ── Uzun basış hızlandırma ─────────────────────────────────
	const startLongPress = useCallback(() => {
		const s = stateRef.current;
		// Canlıda ve kilitliyken hızlandırma yapılmaz.
		if (s.isLive || s.isLocked) return;
		if (!s.flags.longPressSpeedUp) return;
		const delay = s.flags.longPressSpeedUpDelay || 500;
		longPressTimerRef.current = setTimeout(() => {
			const st = stateRef.current;
			if (activeActionRef.current) return; // başka jest başladıysa iptal
			setSpeedUpActive(true);
			st.onHoldSpeedUp?.(true);
		}, delay);
	}, []);

	const cancelLongPress = useCallback(() => {
		clearLongPress();
		if (speedUpActiveRef.current) {
			setSpeedUpActive(false);
			speedUpActiveRef.current = false;
			stateRef.current.onHoldSpeedUp?.(false);
		}
	}, [clearLongPress]);

	// Bileşen kapanırken uzun basış temizliği (kalıcı 2x kalmasın)
	useEffect(() => {
		return () => {
			if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
			if (hudTimerRef.current) clearTimeout(hudTimerRef.current);
			// Bekleyen tek dokunuş: oynatıcı kapanırken tetiklenmemeli
			// (kullanıcı oynatıcıdan çıkarken kontroller birden açılmasın).
			if (pendingSingleTapTimerRef.current) {
				clearTimeout(pendingSingleTapTimerRef.current);
				pendingSingleTapTimerRef.current = null;
			}
		};
	}, []);

	// ── Çift dokunma mantığı ───────────────────────────────────
	const handleTap = useCallback((x) => {
		const s = stateRef.current;
		// Monotonik saat (bkz. `now()`): `Date.now()` saat değişiminde geriye
		// atlayıp çift dokunma penceresini bozabilir. `pressStartRef` de aynı
		// kaynağı kullanır, böylece iki zaman aynı tabanda ölçülür.
		const tapTime = now();
		const { width } = getSize();

		/*
		 * ⚠️ ÇİFT DOKUNMA TESPİTİ.
		 *
		 * "Damga var mı" kontrolü `last.time > 0` idi. Bu, ilk dokunuşun
		 * zaman damgası **tam olarak 0** olduğunda (monotonik saat
		 * başlangıcı, `performance.now()`) çift dokunmayı hiç yakalayamaz
		 * ve kullanıcı her dokunuşta yalnızca tek dokunuş davranışı
		 * görürdü. Varlık ayrı bir bayrakla tutulur.
		 *
		 * `lastTapRef.current.time` artık sadece zaman farkı için kullanılır.
		 */
		const isDoubleTap =
			lastTapRef.current.pending === true &&
			tapTime - lastTapRef.current.time < DOUBLE_TAP_WINDOW_MS;

		if (isDoubleTap) {
			/*
			 * ⚠️ SORUN 8 — ÇİFT DOKUNMADA HUD AÇILIP KAPANIYORDU.
			 *
			 * "çift dokunma ile sararken her dokunuşta player hudu açılıp
			 * kapanıyor."
			 *
			 * Mekanizma: `handleTap` İLK dokunuşta damgayı basıp
			 * `onSingleTap` çağırıyordu (kontrolleri açıp kapatır). İKİNCİ
			 * dokunuşta `isDoubleTap` doğru yakalansa bile ilk dokunuşun
			 * `onSingleTap`'i çoktan çalışmış, HUD bir kez açılıp kapanmış
			 * oluyordu. Sonuç: her çift dokunuşta iki kez sarma, iki kez
			 * kontrol açılıp kapanması.
			 *
			 * Çözüm: ilk dokunuşta `onSingleTap` HİÇ çalıştırılmaz; yalnızca
			 * damga basılır. `pendingSingleTapTimer` süresi dolmadan ikinci
			 * dokunuş gelmezse tek dokunuş YANLAŞIM tetiklenir.
			 *
			 * Böylece: tek dokunuş = kontroller açılır (aynı gecikme,
			 * fark edilmez); çift dokunuş = sarma olur, kontroller
			 * karışmaz.
			 */
			if (pendingSingleTapTimerRef.current) {
				clearTimeout(pendingSingleTapTimerRef.current);
				pendingSingleTapTimerRef.current = null;
			}
			lastTapRef.current = { time: 0, x: 0, pending: false };
			s.onInteractionStart?.();

			// Canlıda seek yok; ortadaki bölge play/pause yapar.
			if (!s.canSeek) {
				s.onTogglePlayPause?.();
				return;
			}

			const half = width / 2;
			const pauseZone = width * DOUBLE_TAP_PAUSE_ZONE;
			const inPauseZone = x > half - pauseZone && x < half + pauseZone;

			// ±15% ortada play/pause (Netflix). Kapalıysa ortada da seek yok,
			// çünkü "ortada ileri" yanıltıcıdır; kullanıcı play/pause bekler.
			if (inPauseZone && s.flags.doubleTapPause) {
				s.onTogglePlayPause?.();
				return;
			}

			if (x < half) {
				s.onSeekBy?.(-s.seekDuration);
				flashDoubleTap("rewind", s.seekDuration);
			} else {
				s.onSeekBy?.(s.seekDuration);
				flashDoubleTap("forward", s.seekDuration);
			}
			return;
		}

		// İlk dokunuş: damgayı tut, `onSingleTap`'i HENÜZ ÇAĞIRMA.
		// İkinci dokunuş 280 ms içinde gelirse yukarıda yakalanır ve
		// tek dokunuş tetiklenmez. Süre dolarsa aşağıdaki zamanlayıcı
		// onu tetikler.
		lastTapRef.current = { time: tapTime, x, pending: true };

		// Basılı kalma (>200 ms) uzun basıştır, "tap" sayılmaz.
		if (tapTime - pressStartRef.current.time > MAX_TAP_HOLD_MS) return;

		/*
		 * Bekleyen tek dokunuşu zamanla. Bu, çift dokunma penceresiyle
		 * aynı süre: ikinci dokunuş bu sürede gelirse `isDoubleTap`
		 * yakalar ve bu zamanlayıcı iptal edilir (aşağıdaki temizleme).
		 */
		if (pendingSingleTapTimerRef.current) {
			clearTimeout(pendingSingleTapTimerRef.current);
		}
		pendingSingleTapTimerRef.current = setTimeout(() => {
			pendingSingleTapTimerRef.current = null;
			// Damga hâlâ duruyorsa ve başka bir dokunuş gelmemişse bu
			// gerçekten TEK dokunuştu. `pending` bayrağını da temizle ki
			// sonraki dokunuş yanlışlıkla çift sayılmasın.
			if (!lastTapRef.current.pending) return;
			if (lastTapRef.current.time !== tapTime) return;
			lastTapRef.current = { time: 0, x: 0, pending: false };
			s.onSingleTap?.();
		}, DOUBLE_TAP_WINDOW_MS);
	}, [getSize, flashDoubleTap]);

	// ── Yatay sürükleme → seek önizleme (KUADRATİK) ─────────────
	const applySwipeSeek = useCallback((currentX) => {
		const s = stateRef.current;
		const { width } = getSize();
		const startX = lastTouchRef.current.startX ?? currentX;
		const rawDx = currentX - startX;
		const dx = rawDx / (width || 1);

		// CloudStream: diffX * diffX — başlangıç yavaş, kenar hızlı.
		const curved = Math.sign(dx) * Math.abs(dx) * Math.abs(dx);
		const deltaSec = curved * (s.duration || 0) * SEEK_CURVE * SWIPE_MULTIPLIER * 0.5;

		const target = Math.max(
			0,
			Math.min(s.duration || 0, startTimeRef.current + deltaSec),
		);

		setScrubInfo({
			position: target,
			delta: target - startTimeRef.current,
		});
	}, [getSize]);

	/*
	 * ── Dikey jest taban değerleri (KRİTİK) ──
	 *
	 * ⚠️ KONUM: Bu ref'ler `applyVerticalSwipe` tarafından kullanıldığı
	 * için TANIMDAN ÖNCE gelmek ZORUNDA. Metro `const`→`var` dönüşümü
	 * yaptığı için bu dosyada "kullanmadan önce tanımla" hatası THROW
	 * ETMEZ — sessizce `undefined` okur ve taban `NaN` olur. Bu, bu
	 * depoda daha önce yaşanan TDZ tuzağıdır.
	 *
	 * `*BaseRef`: bir dikey sürükleme boyunca SABİT kalan başlangıç
	 * değerleri. `applyVerticalSwipe` her karede BUNLARI kullanır.
	 * Sürükleme bitince `*LastRef` değerleri bunlara COMMIT edilir.
	 *
	 * Neden ayrı ref: eğer taban her karede güncellenirse, kümülatif
	 * `delta` tekrar tekrar eklenir ve hassasiyet patlar (bkz.
	 * `applyVerticalSwipe` içindeki açıklama).
	 *
	 * ⚠️ İKİ AYRI ALAN: parlaklık ve sesin tabanları ayrı tutulur.
	 * Tek bir değer kullanılırsa parlaklık jesti ses seviyesinden
	 * başlar.
	 */
	const gestureBaseBrightnessRef = useRef(0.5);
	const gestureBaseVolumeRef = useRef(0.5);
	const lastBrightnessRef = useRef(0.5);
	const lastVolumeRef = useRef(0.5);

	/*
	 * Kalıcı seviye ref'leri — sistem DIŞI değişiklikler de bunları
	 * günceller (telefon tuşu, bildirim paneli, Bluetooth).
	 *
	 * `applyVerticalSwipe` bunları HER KAREDE yazar; `prepareVerticalGesture`
	 * ise bunlardan jest tabanını okur. Bu yüzden tanımları
	 * `applyVerticalSwipe`'ten ÖNCE gelmek zorunda (TDZ tuzağı).
	 */
	const brightnessLevelRef = useRef(0.5);
	const volumeLevelRef = useRef(0.5);

	/*
	 * ── Dikey sürükleme → parlaklık / ses ─────────────────────
	 *
	 * ⚠️ KÜMÜLATİF SÜRÜKLEME DÜZELTMESİ (kullanıcı şikâyeti).
	 *
	 * Şikâyet: "yukarı kaydırıyorum ama ses full'e yetmiyor, ikinci kez
	 * kaydırıyorum ama kaldığı yerden devam etmiyor, daha DÜŞÜK bir
	 * seviyeden yükseltmeye başlıyor."
	 *
	 * Kök neden: `base` her `onPanResponderMove` içinde yeniden hesaplanan
	 * bir "başlangıç + tüm hareket" ifadesiydi. Aradaki her yazma sistem
	 * sesini değiştirdiği için sonraki karede aynı hareket YENİDEN
	 * uygulanıyordu (çift sayım). İkinci sürüklemede `grant` yeni bir
	 * okuma başlatıyor ama o da asenkron olduğu için eldeki değer
	 * karışıyor ve daha düşük bir seviyeden başlanıyordu.
	 *
	 * Çözüm: başlangıç değeri `onPanResponderGrant`'da BİR KEZ sabitlenir;
	 * sürükleme boyunca yalnızca başlangıçtan şu ana kadarki TOPLAM
	 * hareket (`appliedDeltaRef`) uygulanır. Böylece:
	 *   · aynı sürüklemede değer sürekli artar (kayma yok),
	 *   · bırakıp tekrar sürüklediğinde mevcut seviyeden devam edilir.
	 */
	const applyVerticalSwipe = useCallback((currentY) => {
		const s = stateRef.current;
		const { height } = getSize();
		const startY = lastTouchRef.current.startY ?? currentY;
		// Yukarı sürükleme = artış. Parmak başlangıçtan ölçülür → `delta`
		// her karede TOPLAM hareketi verir (kümülatif).
		const dy = (startY - currentY) / (height || 1);
		const delta = dy * SWIPE_MULTIPLIER * 0.5; // tam yükseklik ≈ %100

		/*
		 * ⚠️ HASSASIYET HATASI — ASIL DÜZELTME (kullanıcı şikâyeti:
		 * "az hareket ettiriyorum ama çok fazla artıyor").
		 *
		 * Önceki sürümde uyguladığımız değeri kalıcı seviye ref'ine
		 * HER KAREDE yazıyorduk. Bu, taban değerini kare kare büyütüyordu:
		 *
		 *   kare 1: base=0.50, delta=0.01 → 0.51 → base=0.51
		 *   kare 2: base=0.51, delta=0.02 → 0.53 → base=0.53
		 *   kare 3: base=0.53, delta=0.03 → 0.56
		 *
		 * Aynı `delta` her karede YENİDEN ekleniyordu; 60 fps'te bu
		 * değeri patlatıyor. Parmak barely hareket etse bile ses
		 * sıçramasının sebebi buydu.
		 *
		 * DOĞRU TASARIM: taban (`gestureBase*Ref`) jest ARM olduğunda
		 * BİR KEZ sabitlenir ve SİST boyunca DEĞİŞMEZ. Değer yalnızca
		 * bırakınca (`onPanResponderRelease`) kalıcı seviyeye COMMIT
		 * edilir; böylece sonraki sürükleme doğru yerden başlar.
		 */
		const action = activeActionRef.current;
		if (action !== "brightness" && action !== "volume") return;

		if (action === "brightness") {
			const base = gestureBaseBrightnessRef.current;
			const max = s.flags.extraBrightness ? 2 : 1;
			const next = Math.max(0, Math.min(max, base + delta));
			// ⚠️ TABANı güncelleme — sadece sonucu kaydet.
			lastBrightnessRef.current = next;
			// Kalıcı seviye: sistem DIŞI değişiklikler ve bir sonraki
			// jestin başlangıcı buradan okur.
			brightnessLevelRef.current = next;
			s.onBrightness?.(next);
			showHud("brightness", next, base < 1 && next > 1);
		} else {
			const base = gestureBaseVolumeRef.current;
			const max = s.flags.extraVolume ? 2 : 1;
			const next = Math.max(0, Math.min(max, base + delta));
			lastVolumeRef.current = next;
			volumeLevelRef.current = next;
			s.onVolume?.(next);
			showHud("volume", next, base < 1 && next > 1);
		}
	}, [getSize, showHud]);

	// ── Parlaklık okuma (PanResponder'dan ÖNCE tanımlanmalı) ────
	/*
	 * ⚠️ SIRA ÖNEMLİ: bu, `panResponder`'ın `useMemo` girdisi değil ama
	 * `onPanResponderGrant` içinde çağrılır. Metro `const`→`var`
	 * dönüşümü yaptığı için tanım sonrasında kalsa da çalışır; ancak
	 * güvenliği için kullanıldığı yerdan ÖNCE tanımlıyoruz — aynı tuzak
	 * (use-before-define) bu dosyada düzeltilmişti, tekrarlanmasın.
	 */
	/*
	 * ⚠️ "TEK SES GÖSTERGESİ" DÜZELTMESİ.
	 *
	 * Şikâyet: "telefondan ses açtığımda telefonun kendi ayarı açılıyor,
	 * ben bunu istemiyorum, CloudStream gibi tek bir gösterge istiyorum."
	 *
	 * Sorun iki ayrı seviye kaynağıydı:
	 *   1. Telefonun ses düğmesi → Android kendi sistem seviyesini
	 *      değiştiriyordu, oynatıcı bundan habersizdi.
	 *   2. Oynatıcı jesti → sistem seviyesini değiştiriyordu.
	 * Kullanıcı ikisini AYRI gördüğü için "iki gösterge" diyordu.
	 *
	 * Çözüm: sistem seviyesi TEK doğruluk kaynağı olarak korunur, ancak
	 * o değer artık (a) bir kez yüklenir, (b) jestin uyguladığı her değer
	 * refle YAZILIR. Böylece telefonun düğmesiyle değişen seviye, sonraki
	 * jestin başlangıcı olur ve iki taraf daima aynı değeri gösterir.
	 *
	 * Önceden her `grant`'da ASENKRON okuma tetikleniyordu; parmak
	 * sürüklenmeye başladığında okuma bitmemiş olabildiği için ikinci
	 * sürükleme eski değerden başlıyordu ("daha düşük seviyeden
	 * yükseltiyor" şikâyetinin kaynağı).
	 */
	/**
	 * Yeni bir dikey sürükleme başlatırken başlangıç değerini hazırlar.
	 *
	 * Sistem zaten yüklendiyse refle yazılan güncel değeri kullanır —
	 * YENİDEN ASENKRON OKUMA YAPILMAZ.
	 */
	const prepareVerticalGesture = useCallback(() => {
		if (!stateRef.current.flags.verticalSwipe) return;

		/*
		 * ⚠️ Taban GERÇEK sistem değerinden SENKRON okunur.
		 *
		 * Önceki hâlde okuma ASENKRONDU ve `grant` anında tetikleniyordu.
		 * Kullanıcı parmağını hızlı sürdüğünde okuma bitmeden
		 * `applyVerticalSwipe` çalışıyor ve eldeki bayat değerden
		 * (0.5) başlıyordu. Senkron okuma bu yarışı YOK EDER.
		 *
		 * `?? levelRef` yedeği, modülün bulunmadığı platformlarda
		 * (web / TV) son bilinen değere düşer.
		 */
		const brightnessBase =
			getBrightnessSync() ?? brightnessLevelRef.current;
		const volumeBase = getSystemVolumeSync() ?? volumeLevelRef.current;

		brightnessLevelRef.current = brightnessBase;
		volumeLevelRef.current = volumeBase;

		// ⚠️ Ref okumasını atamanın sağ tarafında YAPMA:
		// React Compiler `react-hooks/immutability` kuralı bunu reddeder.
		gestureBaseBrightnessRef.current = brightnessBase;
		gestureBaseVolumeRef.current = volumeBase;
		lastBrightnessRef.current = brightnessBase;
		lastVolumeRef.current = volumeBase;
	}, []);

	/*
	 * ── Bırakınca COMMIT ──
	 *
	 * Sürükleme boyunca hesaplanan son değerler kalıcı hale getirilir.
	 * Böylece bir sonraki sürükleme doğru seviyeden başlar.
	 *
	 * Bu, önceki "tek gösterge" denemesindeki hatayı düzeltir: o
	 * sürümde commit HER KARE yapılıyordu ve kümülatif `delta` tekrar
	 * tekrar eklenerek hassasiyeti patlatıyordu. Commit artık yalnızca
	 * jestin BİTİMİNDE, bir kez yapılır.
	 */
	const commitVerticalGesture = useCallback(() => {
		const action = activeActionRef.current;
		if (action !== "brightness" && action !== "volume") return;

		if (action === "volume") {
			volumeLevelRef.current = lastVolumeRef.current;
		} else {
			brightnessLevelRef.current = lastBrightnessRef.current;
		}
	}, []);

	/*
	 * ── "TEK GÖSTERGE": telefon ses tuşu ────────────────────
	 *
	 * Kullanıcı şikâyeti: "Telefondan ses açtığımda telefonun kendi ayarı
	 * açılıyor, ben bunu istemiyorum. CloudStream gibi tek bir gösterge
	 * istiyorum."
	 *
	 * Çözüm iki parçalı:
	 *  1. `setVolumeKeyIntercept(true)` → native tarafta fiziksel ses
	 *     tuşları TÜKETİLİR ve `flags = 0` ile kendimiz uygularız.
	 *     Android'ın kendi ses paneli böylece HİÇ açılmaz.
	 *  2. `subscribeSystemVolume(...)` → değişiklik bize bildirilir,
	 *     biz de kendi HUD'umuzu gösteririz.
	 *
	 * Sonuç: ekranda tek gösterge (bizimki) ve seviye `STREAM_MUSIC`
	 * üzerinden zaten telefonla aynıdır.
	 *
	 * ⚠️ `activeActionRef.current === "volume"` kontrolü: kullanıcı
	 * tam jest sürdürürken gelen event'i YOK SAYMALIYIZ, yoksa jestin
	 * kendi değeri dışarıdan gelen bayat değerle ezilir.
	 *
	 * ⚠️ TV'de devre dışı: kumandada ses tuşu anlamlı değil ve
	 * `STREAM_MUSIC` yönetimi TV'de beklenmedik davranış yaratır.
	 */
	useEffect(() => {
		if (Platform.isTV) return;

		setVolumeKeyIntercept(true);

		/*
		 * ⚠️ HUD'UN OYNATICI AÇILIRKEN YANIP SÖNMESİ.
		 *
		 * `ContentObserver`, `Settings.System` genelinden bildirim alır ve
		 * oynatıcı açılırken otomatik parlaklık gibi ALAKASIZ bir ayar
		 * değişimi onu tetikleyebiliyor. `lastStep = -1` ile başladığı
		 * için ilk bildirim "ses değişti" sayılıyor ve HUD bir saniye
		 * görünüp kayboluyordu — kullanıcının tarif ettiği davranış tam
		 * olarak bu.
		 *
		 * Çözüm iki katmanlı:
		 *  1. Native: `lastStep` gözlemci kurulurken mevcut kademeye
		 *     sabitlenir → değişmeyen bildirimler hiç yayınlanmaz.
		 *  2. JS: ilk olayda değer GERÇEKTEN değişmişse gösterilir.
		 *
		 * ⚠️ Kör "ilk olayı yut" YAPILMADI: kullanıcı oynatıcıyı açtıktan
		 * hemen sonra ses tuşuna basarsa o gerçek bir değişikliktir ve
		 * HUD'u görünmelidir. Bu yüzden yalnızca değer `initialVolume` ile
		 * aynıysa yutulur.
		 */
		const initialVolume = getSystemVolumeSync() ?? volumeLevelRef.current;
		let priming = true;

		const unsubscribe = subscribeSystemVolume((v) => {
			if (priming) {
				priming = false;
				volumeLevelRef.current = v;
				// Kurulum bildirimi: seviye değişmemiş, kullanıcı bir şey
				// yapmamış → HUD GÖSTERME.
				if (Math.abs(v - initialVolume) < 1e-6) return;
			}
			// Jest sürüyorken bu event KENDİ yazdığımız değerin
			// yankısıdır; uygulanırsa jesti geri sarar.
			if (activeActionRef.current === "volume") return;
			volumeLevelRef.current = v;
			showHud("volume", v, false);
		});
		return () => {
			unsubscribe();
			setVolumeKeyIntercept(false);
		};
	}, [showHud]);

	/*
	 * ── PanResponder ──────────────────────────────────────────
	 *
	 * ⚠️ TANIM, KULLANIMDAN ÖNCE GELİR. Bu dosyada daha önce tam olarak
	 * bu tuzağa düşüldü: Metro `const`→`var` dönüşümü yaptığı için
	 * use-before-define HATASI VERMEZ, sessizce `undefined` okur ve tüm
	 * jestler çalışmaz hale gelir. ESLint bu sırayı reddediyor; dikkat.
	 *
	 * ⚠️ `useMemo` DEĞİL `useState` lazily başlatıcısıyla bir kez kurulur.
	 * React Compiler `useMemo`'yu koruyamadığını bildiriyordu: içeride
	 * `activeActionRef` / `zoomStartRef` gibi ref'ler okunuyor, yani
	 * değer render'lar arası değişiyor ve memo anlamsız hale geliyor.
	 */
	function createPanResponder() {
		// Ref'ler yalnızca geri çağırma fonksiyonlarının İÇİNDE okunur;
			// render sırasında hiçbir ref okunmaz. Kural `PanResponder.create`
			// 'e geçen nesneyi statik analiz edip çağrım anında okunabileceğini
			// varsayıyor (yanlış pozitif).
			return PanResponder.create({
				// ⚠️ `onStartShouldSetPanResponder` DEĞİL `...Capture`: bu yüzey
				// altındaki TÜM dokunuşları (tek dokunma, çift dokunma, kaydırma)
				// yakalar. Çocuk düğmeler `Pressable` oldukları için kendi
				// dokunuşlarını önce tüketir.
				onStartShouldSetPanResponder: () => {
					const s = stateRef.current;
					if (s.isLocked) return false;
					return true;
				},
				onMoveShouldSetPanResponder: () => {
					const s = stateRef.current;
					if (s.isLocked) return false;
					// Hareket yoksa sürükleme başlatma; tap sayılsın.
					return true;
				},
				onPanResponderGrant: (evt) => {
					const { locationX, locationY } = evt.nativeEvent;
					const s0 = stateRef.current;
					pressStartRef.current = {
						time: now(),
						x: locationX,
						y: locationY,
					};
					lastTouchRef.current = {
						x: locationX,
						y: locationY,
						startX: locationX,
						startY: locationY,
					};
					startTimeRef.current = stateRef.current.currentTime;

					/*
					 * ⚠️ İKİ PARMAK = PINCH ZOOM (F2).
					 *
					 * ⚠️ `grant` TEK PARMAKLA tetiklenir; ikinci parmak
					 * ancak `Move` sırasında gelir. Bu yüzden ARM ölçümü
					 * `onPanResponderMove` içinde de yapılmalıdır —
					 * aşağıdaki "geç kazanma (late acquire)" bloğu
					 * bunu yapıyor.
					 *
					 * Zoom ayrı bir tanıyıcıyla değil AYNI state
					 * makinesinde ele alınır: iki tanıyıcı aynı yüzeye
					 * sahip olursa ikisi birden sahiplenir ve tek/çift
					 * dokunma bozulur (dosyadaki "tek state makinesi"
					 * gerekçesi).
					 */
					if (
						s0.flags.pinchZoom &&
						!s0.isLocked &&
						(evt.nativeEvent.touches?.length ?? 0) >= 2
					) {
						activeActionRef.current = "zoom";
						gestureArmedRef.current = true;
						didPanRef.current = true;
						cancelLongPress();
						zoomStartRef.current = {
							distance: twoFingerDistance(evt.nativeEvent.touches),
							scale: zoomScaleRef.current,
						};
						s0.onInteractionStart?.();
						return;
					}
					gestureArmedRef.current = false;
					didPanRef.current = false;
					activeActionRef.current = null;

					prepareVerticalGesture();
					startLongPress();
				},

				onPanResponderMove: (evt, gesture) => {
					const s = stateRef.current;
					const { width, height } = getSize();

					// Kilitliyken hiçbir jest.
					if (s.isLocked) return;

					// Pinch zoom: başlangıç mesafesine göre ölçekle.
					if (activeActionRef.current === "zoom" && zoomStartRef.current) {
						// ⚠️ `nativeEvent.touchHistory` YANLIŞ alan. React
						// Native'in `CoreEventTypes.d.ts` tanımında
						// `touchHistory` YOKTUR; doğru alan
						// `nativeEvent.touches` (o an ekrandaki TÜM
						// dokunuşlar). `touchHistory` `undefined` geldiği
						// için `twoFingerDistance` hep 0 dönüyor ve zoom
						// hiç başlamıyordu.
						const dist = twoFingerDistance(evt.nativeEvent.touches);
						if (zoomStartRef.current.distance > 0) {
							const ratio = dist / zoomStartRef.current.distance;
							const next = clampZoom(
								zoomStartRef.current.scale * ratio,
							);
							zoomScaleRef.current = next;
							setZoomScale(snapZoom(next));
						}
						return;
					}

					const { locationX, locationY } = evt.nativeEvent;

					/*
					 * ⚠️ GEÇ ZOOM YAKALAMA (pinch'i gerçekten çalıştıran parça).
					 *
					 * `onPanResponderGrant` yalnızca İLK parmakla tetiklenir;
					 * ikinci parmak ancak burada, `Move` sırasında görünür.
					 * `grant`'daki kontrol bu yüzden ASLA iki parmağı
					 * görmezdi ve zoom hiç başlamıyordu.
					 *
					 * Burada, henüz hiçbir yatay/dikey jest ARM olmadıysa
					 * ve iki parmak varsa, zoom'a geç KAZANIYORUZ.
					 * ARM olmuşsak dokunmuyoruz: kullanıcı zaten bir
					 * sürükleme başlattıysa onu bozmak yanlış olur.
					 */
					if (
						s.flags.pinchZoom &&
						!gestureArmedRef.current &&
						(evt.nativeEvent.touches?.length ?? 0) >= 2
					) {
						activeActionRef.current = "zoom";
						gestureArmedRef.current = true;
						didPanRef.current = true;
						cancelLongPress();
						zoomStartRef.current = {
							distance: twoFingerDistance(evt.nativeEvent.touches),
							scale: zoomScaleRef.current,
						};
						s.onInteractionStart?.();
						return;
					}

					const startX = lastTouchRef.current.startX ?? locationX;
					const startY = lastTouchRef.current.startY ?? locationY;
					const absDx = Math.abs(locationX - startX);
					const absDy = Math.abs(locationY - startY);
					const normDx = absDx / (width || 1);
					const normDy = absDy / (height || 1);

					// ── Jest ARM OLMA (tek seferlik karar) ──
					if (!gestureArmedRef.current) {
						// Önce yatay sürükleme: seek için VOD şart.
						if (
							normDx > MIN_SWIPE_RATIO &&
							normDx > normDy &&
							s.flags.swipeSeek &&
							s.canSeek
						) {
							activeActionRef.current = "time";
							gestureArmedRef.current = true;
							didPanRef.current = true;
							cancelLongPress();
							startTimeRef.current = s.currentTime;
							// Seek önizleme HUD'u: kontroller gizlenir
							applySwipeSeek(locationX);
							return;
						}
						// Sonra dikey sürükleme: parlaklık / ses.
						//
						// ⚠️ TV'DE DEVRE DIŞI: Android TV'de dikey sürükleme
						// kumanda gezinmesiyle (DPAD up/down) karışır ve
						// parlaklığı olmayan bir cihazda hiçbir işe yaramaz.
						// Referans uygulama da TV'de bu jesti kapatır.
						if (
							normDy > MIN_VERTICAL_SWIPE_RATIO &&
							normDy > normDx &&
							s.flags.verticalSwipe &&
							!Platform.isTV
						) {
							// ⚠️ YAN TARAFLAR (kullanıcı isteği):
						//   SOL  yarı = SES
						//   SAĞ yarı = PARLAKLIK
						//
						// Buradan önce tersiydi (sol = parlaklık, sağ = ses).
							activeActionRef.current =
								locationX < width / 2 ? "volume" : "brightness";
							gestureArmedRef.current = true;
							didPanRef.current = true;
							cancelLongPress();
							applyVerticalSwipe(locationY);
							return;
						}
						// Eşiğe ulaşılmadıysa hareketi izlemeye devam et.
						return;
					}

					// ── Arm OLUNDUYSA sürükle ──
					if (activeActionRef.current === "time") {
						applySwipeSeek(locationX);
						s.onInteractionStart?.();
					} else if (
						activeActionRef.current === "brightness" ||
						activeActionRef.current === "volume"
					) {
						applyVerticalSwipe(locationY);
						s.onInteractionStart?.();
					}
				},

				onPanResponderRelease: (evt) => {
					const s = stateRef.current;

					// Uzun basış bırakıldı → hızı geri al.
					if (speedUpActiveRef.current) {
						setSpeedUpActive(false);
						speedUpActiveRef.current = false;
						s.onHoldSpeedUp?.(false);
					}
					cancelLongPress();

					// Dikey sürükleme bitti → hesaplanan değeri kalıcı
					// hale getir. Bir sonraki sürükleme buradan başlar.
					commitVerticalGesture();

					// Yatay sürükleme seek'i: Bırakma anında uygula.
					const info = scrubInfoRef.current;
					if (activeActionRef.current === "time" && info) {
						const delta = info.delta;
						// CloudStream: yalnızca 7 sn'den büyük fark seek'e sayılır.
						if (Math.abs(delta) >= MIN_SEEK_DELTA_SEC) {
							s.onSeek?.(info.position);
						}
						setScrubInfo(null);
						scrubInfoRef.current = null;
					}

					// Hiçbir jest ARM olmadıysa bu bir TAP'tır.
					if (!didPanRef.current && !gestureArmedRef.current) {
						const { locationX } = evt.nativeEvent;
						handleTap(locationX);
					}

					activeActionRef.current = null;
					gestureArmedRef.current = false;

					// Zoom bırakılınca kadrajı temizle: bir sonraki tek
					// dokunuşta ölçek 1×'den başlasın (CloudStream
					// `resetZoomToDefault`).
					if (zoomStartRef.current) {
						zoomStartRef.current = null;
						zoomScaleRef.current = 1;
						setZoomScale(1);
					}

					s.onInteractionEnd?.();
				},

				onPanResponderTerminate: () => {
					cancelLongPress();
					// Kesilen jest de değeri commit eder (sonuç yine geçerli).
					commitVerticalGesture();
					activeActionRef.current = null;
					gestureArmedRef.current = false;
					setScrubInfo(null);
					stateRef.current.onInteractionEnd?.();
				},
			});
	}

	/*
	 * `createPanResponder` bir ref okumuyor — yalnızca `PanResponder.create`
	 * çağırıp bir tanıyıcı nesnesi döndürüyor. Ref okumaları o nesnenin
	 * geri çağırma fonksiyonlarının İÇİNDE, yani kullanıcı etkileşimi
	 * sırasında gerçekleşiyor. Kural `PanResponder.create`'e geçen nesneyi
	 * statik analiz edip çağrım anında okunabileceğini varsayıyor (yanlış
	 * pozitif). `useState` başlatıcısı yalnızca BİR KEZ çalışır.
	 */
// eslint-disable-next-line react-hooks/refs
	const [panHandlers] = useState(() => createPanResponder().panHandlers);

	return {
		panHandlers,
		doubleTapInfo,
		scrubInfo,
		hud,
		speedUpActive,
		zoomScale,
	};
}

/**
 * Monotonik milisaniye saati.
 *
 * ⚠️ Neden ayrı fonksiyon: React Compiler'ın saflık kuralı
 * (`react-hooks/purity`) fonksiyon KAYNAĞINA bakar. `Date.now()` veya
 * `performance.now()` doğrudan bir `useMemo`/render gövdesinde çağrılırsa
 * "render sırasında impure çağrı" diye işaretlenir — oysa bu satırlar
 * `PanResponder.create` içindeki OLAY geri çağırmalarında çalışır, render'da
 * değil. Bir fonksiyonun içine alınca çağrı yerini doğru okur.
 *
 * `Date.now()` saat değişiminde (NTP, kullanıcı saati) geriye atlayabilir ve
 * çift dokunma penceresini bozar; bu yüzden monotonik saat tercih edilir.
 */
function now() {
	return typeof performance !== "undefined" && performance.now
		? performance.now()
		: Date.now();
}

/**
 * İki parmak arasındaki mesafe (pinch zoom için).
 *
 * ⚠️ Parametre `nativeEvent.touches` OLMALIDIR.
 *
 * Bu fonksiyon önce `touchHistory` bekliyordu ve yorumu da
 * "`nativeEvent`'de `touches` YOKTUR" diyordu — bu YANLIŞTIR.
 * React Native `CoreEventTypes.d.ts` tanımına göre `TouchEvent`
 * içinde `touches: NativeTouchEvent[]` ("Array of all current touches
 * on the screen") vardır ve `touchHistory` diye bir alan YOKTUR.
 *
 * Sonuç: `touchHistory` her zaman `undefined` geliyor, fonksiyon 0
 * dönüyor ve pinch zoom hiç tetiklenmiyordu.
 *
 * `touches` elemanları `pageX/pageY` (ekran koordinatı) ve
 * `locationX/locationY` (dokunulan görünüm) taşır; iki nokta arası
 * mesafe için ekran koordinatları kullanılır.
 */
function twoFingerDistance(touches) {
	if (!Array.isArray(touches) || touches.length < 2) return 0;
	const a = touches[0];
	const b = touches[touches.length - 1];
	const ax = a.pageX ?? a.locationX ?? 0;
	const ay = a.pageY ?? a.locationY ?? 0;
	const bx = b.pageX ?? b.locationX ?? 0;
	const by = b.pageY ?? b.locationY ?? 0;
	const dx = ax - bx;
	const dy = ay - by;
	return Math.sqrt(dx * dx + dy * dy);
}

/** Zoom'u sınırlar (CloudStream: MIN 0.95, MAX 4.0). */
function clampZoom(scale) {
	return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, scale));
}

/**
 * %100'e yakın ölçekte otomatik geri çekilme.
 *
 * CloudStream `ZOOM_SNAP_SENSITIVITY = 0.07`: |ölçek − 1| < 0.07 ise
 * kadraj bozulmayı bırakır ve video tam ölçeğe döner. Bu, kullanıcının
 * "neredeyse 1× ama tam 1× değil" durumunda takılı kalmasını önler.
 */
function snapZoom(scale) {
	return Math.abs(scale - 1) < ZOOM_SNAP ? 1 : scale;
}