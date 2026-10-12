/**
 * SplashOverlay — açılış ekranı (JS katmanı)
 * ========================================
 *
 * ── Sorun ───────────────────────────────────────────────────────────
 * 1. Native splash çok hızlı kayboluyordu (expo-router ilk ekranı çizer
 *    çizmez kapatıyor) → bu ekran "açılış animasyonu" taşıyamıyordu.
 * 2. Android TV'de native splash **hiç görünmüyor**: AndroidX
 *    `core-splashscreen` splash penceresini yalnızca Android 12+ ve TV
 *    olmayan cihazlarda açar. TV cihazları doğrudan Activity'yi
 *    başlatır, yani kullanıcı splash'sız ana sayfayla karşılaşır.
 *
 * ── Çözüm ───────────────────────────────────────────────────────────
 * `utils/splashScreen.js` native splash'ı açılış kapısı boyunca tutar.
 * Bu bileşen, **onun hemen altında** aynı görseli (marka + wordmark,
 * aynı zemin) kendisi çizer:
 *
 *   • Telefon/tablet: native splash → (kapı açılır) native kapanır →
 *     bu ekran görünür → animasyonla kaybolur. İki katman BİREBİR aynı
 *     olduğu için el değişimi fark edilmez.
 *   • TV: native splash hiç çizilmediği için bu katman zaten İLK kareden
 *     itibaren görünür → kapı açılınca animasyonla kaybolur.
 *
 * ── Animasyon ───────────────────────────────────────────────────────
 * Bekleme: marka yavaşça "nefes alır" (ölçek + parlaklık).
 *   Telefonda bu döngü native splash'ın ARKASINDA çalışır; kapı açılıp
 *   native kapanınca kesintisiz devam eder. Bu yüzden başlangıç animasyonu
 *   YAPILMAZ — aksi hâlde görünmeyen bir geçiş kaybolur.
 * Çıkış: kapak söner, hafifçe büyür ve yukarı kayar (420 ms).
 *
 * `Animated` (react-native) kullanılır, Reanimated değil: projenin geri
 * kalan animasyonları da bu API'yi kullanıyor ve splash'ta ayrı bir JS
 * runtime'ı (worklet) başlatmak gereksiz risk.
 */
import Constants from "expo-constants";
import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, Image, StyleSheet } from "react-native";
import { useTvMetrics } from "@/utils/tvMetrics";

/**
 * Native splash ile BİREBİR aynı zemin — `app.json` →
 * `expo-splash-screen.backgroundColor`. Değer burada ayrı yaşamaya devam
 * ederse el değişimi renk atlaması olarak görünür.
 */
const SPLASH_BG = "#0B0E14";

/**
 * Native splash'ın `imageWidth` değeriyle aynı genişlik: markanın ekrandaki
 * kapladığı alan birebir aynı olmalı.
 */
const LOGO_WIDTH = 260;

/** Çıkış animasyonunun süresi (ms). */
const EXIT_MS = 420;

/** Bir nefes turunun süresi (ms). */
const BREATH_MS = 900;

/**
 * Varyanta göre splash markası.
 *
 * ⚠️ `app.config.js` ikonları `APP_VARIANT` (development/preview/release)
 * göre değiştiriyor. JS katmanı da aynı seçimi yapmalı, yoksa dev/preview
 * yapısında ekranda "yanlış marka" belirir.
 *
 * `require` çağrıları STATİK yazıldı: Metro `require(dinamikYol)`'u
 * çalıştıramaz, yol değişkenle kurulursa build kırılır.
 */
const SPLASH_SOURCES = {
	development: require("../../../assets/icons/dev/splash-icon.png"),
	dev: require("../../../assets/icons/dev/splash-icon.png"),
	preview: require("../../../assets/icons/preview/splash-icon.png"),
	production: require("../../../assets/icons/release/splash-icon.png"),
	release: require("../../../assets/icons/release/splash-icon.png"),
};

/** @returns {number} */
function resolveSplashSource() {
	const variant =
		Constants.expoConfig?.extra?.iconVariant ??
		Constants.manifest?.extra?.iconVariant ??
		"release";
	return SPLASH_SOURCES[variant] ?? SPLASH_SOURCES.release;
}

// Modül yüklenirken bir kez çözülür: render sırasında `require` çalıştırmak
// gereksiz, varyant zaten çalışma boyunca değişmez.
const SPLASH_SOURCE = resolveSplashSource();

/**
 * @param {object} props
 * @param {boolean} props.visible  `false` olduğunda çıkış animasyonu başlar.
 * @param {() => void} [props.onFinished]  Çıkış animasyonu bittiğinde çağrılır.
 */
export default function SplashOverlay({ visible, onFinished }) {
	const { sp, isTV } = useTvMetrics();

	/*
	 * `mounted` ayrı durum: çıkış animasyonu BİTTENE kadar ekranda kalmalı.
	 * Render'ı `visible` ile kesmek animasyonu yarıda bırakır (marka donup
	 * anında kaybolur).
	 */
	const [mounted, setMounted] = useState(true);

	/*
	 * `useState(() => new Animated.Value(0))` — `useRef(new Animated.Value(0))`
	 * DEĞİL. React Compiler'ın `react-hooks/refs` kuralı render sırasında
	 * ref okumayı hata sayar (aşağıdaki `interpolate` çağrıları render'da).
	 * `useState` + tembel başlatıcı aynı "bir kez oluştur, kimliğini koru"
	 * garantisini verir ve kurala uyar.
	 */
	const [breath] = useState(() => new Animated.Value(0));
	const [fade] = useState(() => new Animated.Value(1));
	const [lift] = useState(() => new Animated.Value(0));

	/*
	 * `onFinished` bir ref'te tutulur. Doğrudan effect bağımlılığı olsaydı,
	 * çağıranın her render'da yeni bir arrow üretmesi efekti YENIDEN
	 * tetikler ve animasyon baştan başlardı.
	 */
	const onFinishedRef = useRef(onFinished);

	useEffect(() => {
		onFinishedRef.current = onFinished;
	}, [onFinished]);

	// TV'de 1080p kumandadan 3 m bakılır; marka telefon ölçüsünde kalırsa
	// ekranın ortasında küçük bir nokta gibi görünür.
	const logoSize = sp(isTV ? LOGO_WIDTH * 0.85 : LOGO_WIDTH);

	// ── Bekleme: sonsuz "nefes" döngüsü ───────────────────────────────
	useEffect(() => {
		if (!mounted) return;

		const loop = Animated.loop(
			Animated.sequence([
				Animated.timing(breath, {
					toValue: 1,
					duration: BREATH_MS,
					easing: Easing.inOut(Easing.quad),
					useNativeDriver: true,
				}),
				Animated.timing(breath, {
					toValue: 0,
					duration: BREATH_MS,
					easing: Easing.inOut(Easing.quad),
					useNativeDriver: true,
				}),
			])
		);

		loop.start();
		return () => loop.stop();
	}, [mounted, breath]);

	// ── Çıkış ────────────────────────────────────────────────────────
	useEffect(() => {
		if (visible) return;

		const animation = Animated.parallel([
			Animated.timing(fade, {
				toValue: 0,
				duration: EXIT_MS,
				easing: Easing.out(Easing.cubic),
				useNativeDriver: true,
			}),
			Animated.timing(breath, {
				toValue: 0,
				duration: EXIT_MS,
				easing: Easing.out(Easing.cubic),
				useNativeDriver: true,
			}),
			// Marka büyürken yukarı doğru yükselir: "içeri geçiyor" hissi.
			Animated.timing(lift, {
				toValue: 1,
				duration: EXIT_MS,
				easing: Easing.out(Easing.cubic),
				useNativeDriver: true,
			}),
		]);

		animation.start(({ finished }) => {
			// `finished: false` → animasyon yarıda kesildi (unmount / Fast
			// Refresh). O zaman da temizlik yapılmalı, yoksa ekran hiç kalkmaz.
			setMounted(false);
			if (finished) onFinishedRef.current?.();
		});
	}, [visible, fade, breath, lift]);

	if (!mounted) return null;

	const breathScale = breath.interpolate({
		inputRange: [0, 1],
		outputRange: [1, 1.045],
	});
	const breathOpacity = breath.interpolate({
		inputRange: [0, 1],
		outputRange: [0.92, 1],
	});
	const exitScale = lift.interpolate({
		inputRange: [0, 1],
		outputRange: [1, 1.06],
	});
	const exitShift = lift.interpolate({
		inputRange: [0, 1],
		outputRange: [0, -18],
	});

	return (
		<Animated.View
			style={[styles.fill, { opacity: fade }]}
			// Ekran kapanmadan önce dokunma/uzun basma altındaki içeriğe
			// ulaşmasın. Yalnızca görsel — hiçbir etkileşim yok.
			pointerEvents="auto"
			accessibilityElementsHidden
			importantForAccessibility="no-hide-descendants">
			{/*
			 * İki iç içe Animated.View: "nefes" ve "çıkış" dönüşümleri.
			 * Tek bir view'da `Animated.multiply` ile birleştirmek de mümkün,
			 * ama ayrı view'lar native sürücüde tartışmasız çalışır ve iki
			 * animasyonun birbirini hiç etkilememesini garanti eder.
			 */}
			<Animated.View
				style={[
					styles.center,
					{
						transform: [{ scale: breathScale }],
						opacity: breathOpacity,
					},
				]}>
				<Animated.View
					style={{
						transform: [{ scale: exitScale }, { translateY: exitShift }],
					}}>
					<Image
						source={SPLASH_SOURCE}
						style={{ width: logoSize, height: logoSize }}
						resizeMode="contain"
						// `fadeDuration` bilerek 0: RN varsayılanı 250 ms'de
						// kademeli gösterir ve native splash'tan devralınan
						// görsel ilk karede saydam görünür.
						fadeDuration={0}
					/>
				</Animated.View>
			</Animated.View>
		</Animated.View>
	);
}

const styles = StyleSheet.create({
	fill: {
		/*
		 * ⚠️ `...StyleSheet.absoluteFillObject` DEĞİL, açık yazıldı.
		 *
		 * RN 0.86'da `StyleSheet.absoluteFillObject` KALDIRILDI; yalnızca
		 * `absoluteFill` (tek bir stil referansı) var. `undefined`'ı yaymak
		 * sessizce HİÇBİR şey üretmediği için konumlandırma uygulanmadı ve
		 * ekran normal akışta, ekranın YALNIZCA ALT YARISINI kaplayan bir
		 * çocuk olarak konumlandı. (TV'de ölçülen layout: 960×275 @ y=275.)
		 */
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		backgroundColor: SPLASH_BG,
		alignItems: "center",
		justifyContent: "center",
		/*
		 * ⚠️ `zIndex` REKABET EDİYOR — sayı keyfidir, "büyük yeter" değil.
		 *
		 * Projede mutlak konumlu kardeşler kendi aralarında zIndex ile
		 * sıralanıyor ve açılış ekranı bunların ÜSTÜNDE olmak zorunda:
		 *
		 *   BottomNavigation  zIndex 9999
		 *   UpdateBanner      zIndex 10000   (rayın üstü olsun diye)
		 *   BU EKRAN          zIndex 100000
		 *
		 * Splash ilk yazıldığında 9999 verilmişti; `UpdateBanner`'ın 10000'i
		 * kazandığı için güncelleme kartı açılış ekranının ÜSTÜNDE çiziliyordu
		 * (telefonda ölçüldü: "Yeni sürüm yayında" kartı splash'ın üstünde).
		 * O yüzden burada kasıtlı olarak araların boşluğunda bir sayı seçildi:
		 * ileride 10001'e çıksa bile splash hâlâ üstte kalır.
		 *
		 * `elevation` Android'de ayrı yığın bağlamı açar; kardeş `elevation`
		 * değerleri 2–50 aralığında olduğu için 100 güvenli biçimde yukarıda.
		 */
		zIndex: 100000,
		elevation: 100,
	},
	center: {
		alignItems: "center",
		justifyContent: "center",
	},
});