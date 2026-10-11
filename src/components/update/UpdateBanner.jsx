/**
 * Uygulama açılışında sessiz kontrol sonucu "güncelleme var" çıkarsa
 * ekranın üstünde beliren kart.
 *
 * Kasıtlı davranış: banner KULLANICIYI BLOKLAMAZ. Yalnızca bilgi verir;
 * dokununca modal açılır, kapatma (×) güncellemeyi erteler — bir sonraki
 * açılışta kontrol yine yapılır.
 *
 * ── Geri sayım halkası ─────────────────────────────────────────────────
 * Kalan süre, kapatma tuşunun çevresindeki **düz bir yay** olarak
 * gösterilir ve saat yönünün TERSİNE (yukarı → sol → aşağı) söner.
 *
 * ⚠️ Neden iki yarım daire + kırpma tekniği:
 *   `react-native-svg` projede kurulu DEĞİL ve bu küçük değişiklik için
 *   yeni bağımlılık (react-countdown-circle-timer vb.) eklemek orantısız.
 *   RN'de SVG'siz dairesel ilerleme için yerleşik çözüm şudur:
 *
 *   • Tam bir daire, ÜST ve SAĞ kenarları renkli, ALT ve SOL kenarları
 *     şeffaf → çizilen şey 180°'lik TEK bir yarım yaydır (sağ+üst).
 *   • Bu daire iki kutuya (sol yarım / sağ yarım) yerleştirilir; kutular
 *     `overflow:hidden` ile daireyi kırpar ve sadece kendi yarısını
 *     gösterir.
 *   • Her yarı kendi dairesini döndürür: döndükçe yayın bir kısmı
 *     kırpma penceresinin dışına çıkar ve görünen yay KISALIR.
 *
 *   Kalan yay L (derece, 0…360) için türetilen açılar:
 *       sol  = L ≤ 180 ? 45 − L : −135
 *       sağ  = L ≤ 180 ? −135 : 45 − L
 *   Bu formül 0.02 adımla tüm p∈[0,1] aralığında sayısal olarak doğrulandı.
 *
 *   Dönüş `Animated.timing` + `useNativeDriver` ile sürülür (60 fps,
 *   JS başına düşmez); saniye sayacı yalnızca vurgu rengi ve erişilebilirlik
 *   etiketi için 1 sn'de bir güncellenir.
 *
 * ── TV ──────────────────────────────────────────────────────────────────
 *  1. Düz `Pressable` kumandada odaklanmaz; `TVPressable` odak alır ve OK'a
 *     cevap verir. Banner açılır açılmaz odağı alır (`autoFocus`).
 *  2. TV'de sol ray (56dp) ekranın tamamında durur ve kenarlar overscan
 *     nedeniyle kırpılır. Sol kenar = ray + iç boşluk; kart
 *     `contentMaxWidth` ile ortalanıyor.
 *  Metin/ikon ölçüleri `useTvMetrics().sp()` ile ölçeklenir (1080p'de 1.2×).
 */
import TVPressable from "@/components/common/TVPressable";
import { useAppUpdate } from "@/context/AppUpdateContext";
import { useThemeContext } from "@/context/ThemeContext";
import { useNavLayout } from "@/hooks/useNavLayout";
import { useTvMetrics } from "@/utils/tvMetrics";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useEffect, useState } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Bildirim kaç saniye sonra kendiliğinden kaybolur. */
const AUTO_DISMISS_SECONDS = 10;

/** Son bu kadar saniyede kart çerçevesi vurgu rengine döner. */
const URGENT_SECONDS = 3;

/**
 * Yay 6 saat yönüne yalnızca `progress` bu değerin ÜSTÜNDEYKEN uzanır.
 * Altındaki dikiş yamasının görünme alt sınırı (bkz. `showPatch`).
 */
const PATCH_MIN_PROGRESS = 0.53;

/** Ekran kenarından içeri pay (banner bu kadar daralır). */
const BANNER_EDGE = 18;

function BannerCard({
	release,
	colors,
	isTV,
	sp,
	radius,
	iconSize,
	maxWidth,
	onOpen,
	onDismiss,
}) {
	const [slide] = useState(() => new Animated.Value(0));
	// 1 → 0 arası akan ilerleme. Halkanın dönüşü bundan türetilir.
	const [progress] = useState(() => new Animated.Value(1));
	// Vurgu rengi + erişilebilirlik etiketi için kaba saniye sayacı.
	const [secondsLeft, setSecondsLeft] = useState(AUTO_DISMISS_SECONDS);
	// Alt dikiş yaması: başta var, geri sayımın ilk yarısında kaldırılır.
	const [showPatch, setShowPatch] = useState(true);

	// `useRef(new Animated.Value(0))` DEĞİL: proje lint'i (react-hooks/refs)
	// render sırasında ref okumayı yasaklıyor. Animated.Value bir NESNEDİR;
	// `useState` tembel başlatıcısıyla üretmek hem kurala uyar hem de değer
	// render boyunca kararlı kalır.
	useEffect(() => {
		Animated.spring(slide, {
			toValue: 1,
			useNativeDriver: true,
			damping: 18,
			stiffness: 180,
		}).start();
	}, [slide]);

	useEffect(() => {
		progress.setValue(1);
		const spin = Animated.timing(progress, {
			toValue: 0,
			duration: AUTO_DISMISS_SECONDS * 1000,
			easing: Easing.linear,
			useNativeDriver: true,
		});
		spin.start();

		// Kapatma burada: geri sayımın YAN ETKİSİ updater'ın içinde olmaz.
		const timer = setTimeout(
			() => onDismiss(),
			AUTO_DISMISS_SECONDS * 1000,
		);
		/*
		 * Yama, yay 6 saat yönüne yalnızca `progress` bu değerin üstündeyken
		 * uzanır. `opacity` interpolasyonuyla gizlemek yerine KAYITLI render
		 * kullanıyoruz: 0.0001 genişlikte bir inputRange native tarafta kayan
		 * nokta hassasiyeti nedeniyle güvenilir değil, üstelik yanlışlıkla
		 * yarı saydam kalabiliyordu. Yama yokken ekranda HİÇ yoktur.
		 *
		 * `setShowPatch(true)` burada çağrılmıyor: `BannerCard`, banner
		 * gizlendiğinde (parent `null` döndüğünde) UNMOUNT olur, dolayısıyla
		 * her görünüşte `useState(true)` zaten taze başlangıçtır. Effect
		 * gövdesinde senkron setState ise projede lint hatası veriyor.
		 */
		const patchTimer = setTimeout(
			() => setShowPatch(false),
			AUTO_DISMISS_SECONDS * 1000 * (1 - PATCH_MIN_PROGRESS),
		);
		const tick = setInterval(
			() => setSecondsLeft((value) => Math.max(0, value - 1)),
			1000,
		);

		return () => {
			spin.stop();
			clearTimeout(timer);
			clearTimeout(patchTimer);
			clearInterval(tick);
		};
	}, [progress, onDismiss]);

	// Halka ölçüleri. Telefonda sabit; TV'de `sp()` ile ölçeklenir.
	const ringSize = isTV ? sp(44) : 44;
	const ringWidth = isTV ? sp(3) : 3;
	const closeSize = isTV ? sp(34) : 34;
	const ringRadius = ringSize / 2 - ringWidth / 2;
	// Yama yayin RADIAL kalinligini tasirmamali; yalnizca dikişin 1 px
	// yatay acigini kapatacak kadar genis olmali.
	const patchWidth = 6;
	const patchHeight = ringWidth;
	/*
	 * KIRPMA PENCERELERİ
	 *
	 * İki kutu TAM KAPALI durur (`halfWidth = ringSize / 2`) ve iki yay
	 * tam olarak birbirini tamamlar.
	 *
	 * ⚠️ Burada 1 px üst üste binme de kaydırma da DENENDİ ve GERİ
	 * ALINDI: örtüşen iki anti-alias'lı kenar ÜST ÜSTE karışınca
	 * (1−a₁)(1−a₂) çift karışımı doğuyor ve dikişte 1 piksellik bir
	 * benek oluşuyordu. Tam kapama daha iyi sonuç veriyor: iki yay
	 * karşılıklı (biri bittiği yerde diğeri başlıyor), dikişte ortak bir
	 * kenar oluşuyor.
	 *
	 * NOT: "iki ayrı yarım çember" izleniminin gerçek sebebi dikiş DEĞİL,
	 * dairenin halka merkezinden kaymasıydı (aşağıdaki `left` değerleri).
	 */
	const halfWidth = ringSize / 2;

	/**
	 * RN'in `interpolate()` çıktısı sayısal bileşen içermeyen bir string'i
	 * ("NaNdeg") reddedip runtime'da Invariant fırlatıyor. Aşağıdaki
	 * interpolasyonlarda hesaplanan her açı bu korumadan geçiyor: sıralama
	 * kaynaklı bir hatada değer `undefined`'a düşüp NaN'a yayılır ve banner
	 * sessizce değil, GÜRÜLTÜLÜ çöker.
	 */
	const deg = (value) => (Number.isFinite(value) ? value : 0);

	// Halka dönüşleri. Türetilmiş formülün sürekli (piecewise) karşılığı:
	//   L = 360·p.  L≤180: sol = 45−L, sağ = −135.  L>180: sol = −135, sağ = 45−L.
	// p=0,5'te her iki formül de −135 verir → interpolasyonda dikiş yok.
	//
	// ⚠️ extrapolate: "clamp" ZORUNLU. Varsayılan "extend" ile aralık
	// dışındaki değerler doğrusal uzatılır; 0.5 eşiğinin altında sol yarımın
	// açısı 45°'nin ALTINA iner ve yay yanlış yerden başlar.
	const leftRotate = progress.interpolate({
		inputRange: [0, 0.5, 1],
		outputRange: [`${deg(45)}deg`, `${deg(-135)}deg`, `${deg(-135)}deg`],
		extrapolate: "clamp",
	});
	const rightRotate = progress.interpolate({
		inputRange: [0, 0.5, 1],
		outputRange: [`${deg(-135)}deg`, `${deg(-135)}deg`, `${deg(-315)}deg`],
		extrapolate: "clamp",
	});


	const translateY = slide.interpolate({
		inputRange: [0, 1],
		outputRange: [-140, 0],
		extrapolate: "clamp",
	});

	const isUrgent = secondsLeft <= URGENT_SECONDS;

	/*
	 * Her yarımın içindeki daire: üst+sağ kenarı renkli (180°'lik yay),
	 * alt+sol kenarı şeffaf.
	 *
	 * ⚠️ left DEĞERİ HER YARIMDA FARKLIDIR — ortak rcStyle'te tutulamaz.
	 * Daire, halkanın TAM MERKEZİNE (x = ringSize/2) hizalanmalıdır; her iki
	 * yarımda da aynı left kullanılırsa sol kutu kendi sol kenarına
	 * hizalayan daire üretir ve yay, halkanın sağına yapışıp ters yönde
	 * çizilir ("iki ayrı yarım çember" belirtisi).
	 *
	 *   sol kutu  x = [0, S/2+overlap]        → daire [0,S] → left = 0
	 *   sağ kutu  x = [S/2-overlap, S]        → daire [0,S] → left = overlap − S/2
	 */
	const arcStyle = {
		width: ringSize,
		height: ringSize,
		borderWidth: ringWidth,
		borderRadius: ringSize / 2,
		borderTopColor: colors.primary,
		borderRightColor: colors.primary,
		borderBottomColor: "transparent",
		borderLeftColor: "transparent",
	};

	return (
		<Animated.View
			style={[
				styles.card,
				{
					backgroundColor: colors.cardBg,
					borderColor: isUrgent ? colors.primary : colors.border,
					opacity: slide,
					transform: [{ translateY }],
					width: "100%",
					maxWidth: maxWidth ?? undefined,
					borderRadius: radius,
					paddingVertical: isTV ? sp(12) : 10,
					borderWidth: isTV ? 2 : 1,
				},
			]}>
			<TVPressable
				style={styles.pressArea}
				focusedStyle={{
					backgroundColor: colors.border,
					borderRadius: radius - 4,
				}}
				// TV'de odak buraya gelsin; aksi halde kumandayla banner'a
				// hiç ulaşılamaz.
				autoFocus
				onPress={onOpen}
				accessibilityRole="button"
				accessibilityLabel={`Yeni sürüm ${release.version} bulundu. Güncellemeyi açmak için dokunun`}>
				<View
					style={[
						styles.iconBox,
						{
							backgroundColor: colors.primary,
							width: iconSize,
							height: iconSize,
							borderRadius: iconSize / 2,
						},
					]}>
					<Ionicons
						name="cloud-download-outline"
						size={sp(20)}
						color="#ffffff"
					/>
				</View>

				<View style={styles.textBox}>
					<Text
						style={[
							styles.title,
							{ color: colors.text, fontSize: sp(15) },
						]}>
						Yeni sürüm yayında
					</Text>
					<Text
						style={[
							styles.subtitle,
							{ color: colors.textSecondary, fontSize: sp(13) },
						]}
						numberOfLines={1}>
						v{release.version} • {release.sizeMB} MB —{" "}
						{isTV ? "OK ile aç" : "incele"}
					</Text>
				</View>
			</TVPressable>

			{/* Geri sayım halkası — kapatma tuşunun çevresinde. */}
			<View
				style={[styles.ring, { width: ringSize, height: ringSize }]}
				accessibilityLabel={`${secondsLeft} saniye sonra kapanacak`}>
				{/* Dikiş yaması — yay 6 saat'e ulaşana kadar ekranda, sonra tamamen gider. */}
				{showPatch && (
					<View
						pointerEvents="none"
						style={[
							styles.seamPatch,
							{
								width: patchWidth,
								height: patchHeight,
								backgroundColor: colors.primary,
								left: (ringSize - patchWidth) / 2,
								top: ringSize / 2 + ringRadius - patchHeight / 2,
							},
						]}
					/>
				)}

				{/* SOL YARIM: soldaki yay miktarı. */}
				<View
					style={[
						styles.ringHalf,
						{ width: halfWidth, height: ringSize, left: 0 },
					]}>
					<Animated.View
						style={[
							styles.ringArc,
							arcStyle,
							{ left: 0, transform: [{ rotate: leftRotate }] },
						]}
					/>
				</View>

				{/* SAĞ YARIM: sağdaki yay miktarı. */}
				<View
					style={[
						styles.ringHalf,
						{ width: halfWidth, height: ringSize, right: 0 },
					]}>
					<Animated.View
						style={[
							styles.ringArc,
							arcStyle,
							{
								left: -ringSize / 2,
								transform: [{ rotate: rightRotate }],
							},
						]}
					/>
				</View>

				<TVPressable
					onPress={onDismiss}
					hitSlop={10}
					style={[
						styles.close,
						{
							top: (ringSize - closeSize) / 2,
							left: (ringSize - closeSize) / 2,
							width: closeSize,
							height: closeSize,
						},
					]}
					focusedStyle={{
						backgroundColor: colors.border,
						borderRadius: closeSize / 2,
					}}
					accessibilityRole="button"
					accessibilityLabel="Güncelleme bildirimini kapat">
					<Ionicons
						name="close"
						size={sp(18)}
						color={isUrgent ? colors.primary : colors.textSecondary}
					/>
				</TVPressable>
			</View>
		</Animated.View>
	);
}

export default function UpdateBanner() {
	const { colors } = useThemeContext();
	const { bannerVisible, release, openSheet, dismissBanner, sheetVisible } =
		useAppUpdate();
	const insets = useSafeAreaInsets();
	const { isTV, sp, gutter, contentMaxWidth } = useTvMetrics();
	const { contentPaddingLeft } = useNavLayout();

	/*
	 * Modal açıkken banner render EDİLMEZ.
	 *
	 * TV'de iki `hasTVPreferredFocus` görünümü aynı anda varsa Android TV
	 * hangisine odak vereceğini garanti etmez; banner arka planda kalıp
	 * modalın "Güncellemeyi indir" düğmesinin okunu bozuyordu. Modal zaten
	 * aynı bilgiyi gösterdiği için banner'ı gizlemek bilgi kaybı değil.
	 */
	if (!bannerVisible || !release || sheetVisible) return null;

	const edge = isTV ? gutter + 6 : BANNER_EDGE;

	return (
		<View
			style={[
				styles.wrapper,
				{
					top: insets.top + (isTV ? sp(14) : 8),
					// Sol kenar: TV'de navigasyon rayı + iç boşluk. Rayın
					// ALTINDA kalmamak için `contentPaddingLeft` ekleniyor.
					left: contentPaddingLeft + edge,
					right: edge,
				},
			]}
			pointerEvents="box-none">
			<BannerCard
				release={release}
				colors={colors}
				isTV={isTV}
				sp={sp}
				radius={isTV ? sp(16) : 14}
				iconSize={isTV ? sp(38) : 38}
				maxWidth={contentMaxWidth}
				onOpen={openSheet}
				onDismiss={dismissBanner}
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	// absolute: banner diğer ekranların üstüne binmeli, düzen akışını
	// kaydırmamalı. pointerEvents="box-none" aradaki boşluğun dokunuşu
	// alttaki içeriğe geçirir.
	wrapper: {
		position: "absolute",
		// TV rayı (BottomNavigation) zIndex: 9999 kullanıyor; banner en
		// üstte kalmalı. elevation (50) Android'de asıl sıralama
		// mekanizması ama RN zIndex'ini de eşliyoruz ki ikisi de tutarlı
		// karar versin.
		zIndex: 10000,
		elevation: 50,
		alignItems: "center",
	},
	card: {
		flexDirection: "row",
		alignItems: "center",
		paddingRight: 6,
		paddingLeft: 10,
		shadowColor: "#000",
		shadowOpacity: 0.25,
		shadowRadius: 12,
		shadowOffset: { width: 0, height: 4 },
		elevation: 8,
	},
	pressArea: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
	},
	iconBox: {
		alignItems: "center",
		justifyContent: "center",
	},
	textBox: {
		flex: 1,
		marginLeft: 12,
	},
	title: {
		fontWeight: "700",
	},
	subtitle: {
		marginTop: 2,
	},
	ring: {
		marginLeft: 10,
		alignItems: "center",
		justifyContent: "center",
	},
	ringHalf: {
		position: "absolute",
		top: 0,
		overflow: "hidden",
	},
	ringArc: {
		position: "absolute",
		top: 0,
	},
	seamPatch: {
		position: "absolute",
	},
	close: {
		position: "absolute",
		alignItems: "center",
		justifyContent: "center",
	},
});
