import { useCallback, useEffect, useRef, useState } from "react";
import {
	Animated,
	BackHandler,
	Dimensions,
	Modal,
	PanResponder,
	Platform,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

const SWIPE_CLOSE_THRESHOLD = 80;
const SWIPE_VELOCITY_THRESHOLD = 0.4;

/**
 * TV panelinin geometrisi.
 *
 * Bottom sheet telefon içindir: parmakla alttan yukarı sürüklenir, ekranın
 * altına yapışır. TV'de sürükleme yoktur ve dar bir panel, içindeki kartlarla
 * birlikte "ortada asılı kalmış bir kutu" gibi görünüyordu.
 *
 * ⚠️ Artık TV paneli de telefonda GİBİ: sol, sağ ve alt kenara yapışık,
 * yalnızca ÜST köşeleri yuvarlatılmış. Daha önce ortada duran ve dört köşesi
 * yuvarlak panelde odaklanan kart ölçeklenince panelin sol/alt kenarını
 * geçip arkadaki siyah zeminde ASILI kalıyordu. Kenara yapışık panelde
 * kartın taşınabileceği tek yer ekranın kendisi — orada taşma görünmez.
 */
const TV_PANEL_HEIGHT_RATIO = 0.9;

/**
 * BottomSheetModal
 *
 * Props:
 *  visible         {boolean}  – modalı göster/gizle
 *  onClose         {function} – kapatma callback'i
 *  snapToHeight    {number|string} – 0-1 arası oran veya "auto"
 *  fitContent      {boolean}  – modal yüksekliğini içeriğe göre otomatik ayarla
 *  closeOnBackdrop {boolean}  – backdrop'a tıklayınca kapat, varsayılan true
 *  swipeable       {boolean}  – sürükleyerek kapat, varsayılan true
 *  title           {string}   – opsiyonel başlık
 *  handle          {boolean}  – tutma çubuğu (drag handle) göster
 *  opacity         {number}   – arka plan karartma opaklığı
 *  children        {node}     – modal içeriği
 */
const BottomSheetModal = ({
	visible,
	onClose,
	snapToHeight = 0.6,
	fitContent = false,
	closeOnBackdrop = true,
	swipeable = true,
	title,
	handle = false,
	opacity = 0.55,
	children,
}) => {
	const insets = useSafeAreaInsets();
	const isAuto = fitContent || snapToHeight === "auto";
	const isTV = Platform.isTV;

	/**
	 * Alt taşma — panelin alt kenarı bu kadar EKSİĞE çekilir.
	 *
	 * ⚠️ Sorun: edge-to-edge Android'de `Dimensions.get("window")` sistem
	 * çubuklarını da içerir, ama Modal'ın kendi kutusu navigasyon çubuğunun
	 * ÜSTÜNDE bitiyor. Panel `bottom: 0` ile o kutunun tabanına oturduğu
	 * için altta ince bir şerit kalıyor ve Modal saydam olduğundan arkadaki
	 * anasayfa o şeritten görünüyordu.
	 *
	 * Çözüm: yükseklik de AYNI KADAR artırılır. `bottom: -T` +
	 * `height: H + T` → üst kenar yerinde kalır (`(bottom + T) - (H + T)`),
	 * yalnız alt kenar `T` kadar aşağı iner. Kutu beklenenden kısaysa
	 * fazlalık ekran dışında kalır, görünmez; bir şey bozulmaz.
	 */
	const altTasma = insets.bottom;

	/**
	 * TV panel YÜKSEKLİĞİ — ekranın %90'ı.
	 *
	 * `snapToHeight` (0.78) ekranın %78'idir ve 1080p'de 843px'tir; önceden
	 * bir en-boy katsayısıyla daha da daraltılınca ≈600px'e düşüyor ve liste
	 * yalnızca 1.5 kart gösteriyordu. Tavan doğrudan ekranın yüksekliğinden
	 * türetiliyor: TV'de dikey kaydırma zaten var, asıl derd panelin
	 * BİTMEKTE zorlamasıydı.
	 *
	 * Genişlik türetilmiyor — `styles.sheet` zaten `left: 0 / right: 0`
	 * ile ekranın tamamına yapışık.
	 */
	const tvPanelHeight = SCREEN_HEIGHT * TV_PANEL_HEIGHT_RATIO;

	const fixedHeight =
		typeof snapToHeight === "number"
			? isTV
				? tvPanelHeight
				: SCREEN_HEIGHT * snapToHeight
			: isTV
				? tvPanelHeight
				: SCREEN_HEIGHT * 0.5;

	const [measuredHeight, setMeasuredHeight] = useState(0);

	const sheetHeight = isAuto
		? measuredHeight > 0
			? measuredHeight
			: SCREEN_HEIGHT * 0.4
		: fixedHeight;

	const sheetHeightRef = useRef(sheetHeight);
	sheetHeightRef.current = sheetHeight;

	const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
	const backdropOpacity = useRef(new Animated.Value(0)).current;
	const isClosingByGesture = useRef(false);
	const hasOpened = useRef(false);

	// ─── Animasyon yardımcıları ──────────────────────────────────────────────
	const animateOpen = useCallback(() => {
		Animated.parallel([
			Animated.spring(translateY, {
				toValue: 0,
				damping: 22,
				stiffness: 280,
				mass: 0.9,
				useNativeDriver: true,
			}),
			Animated.timing(backdropOpacity, {
				toValue: 1,
				duration: 260,
				useNativeDriver: true,
			}),
		]).start();
	}, [translateY, backdropOpacity]);

	const animateClose = useCallback(
		(onFinish) => {
			const closeTarget =
				(sheetHeightRef.current || SCREEN_HEIGHT) + altTasma;
			Animated.parallel([
				Animated.spring(translateY, {
					toValue: closeTarget,
					damping: 26,
					stiffness: 300,
					mass: 0.8,
					useNativeDriver: true,
				}),
				Animated.timing(backdropOpacity, {
					toValue: 0,
					duration: 200,
					useNativeDriver: true,
				}),
			]).start(({ finished }) => {
				if (finished) onFinish?.();
			});
		},
		[translateY, backdropOpacity, altTasma],
	);

	// ─── visible değişince aç/kapat ──────────────────────────────────────────
	useEffect(() => {
		if (visible) {
			isClosingByGesture.current = false;
			if (!isAuto || measuredHeight > 0) {
				hasOpened.current = true;
				translateY.setValue(sheetHeightRef.current);
				animateOpen();
			} else {
				hasOpened.current = false;
				translateY.setValue(SCREEN_HEIGHT);
			}
		} else {
			hasOpened.current = false;
			if (!isClosingByGesture.current) {
				animateClose();
			}
		}
		/*
		 * `translateY` bilinçli olarak bağımlılık dizisinde YOK.
		 *
		 * O bir `useRef(...).current` — React state değil, bir örnek. effect
		 * içinde `translateY.setValue(...)` çağrılıyor (bir değer okunmuyor,
		 * sadece yazılıyor), yani effect'in veriye bağımlılığı yok. Diziye
		 * eklemek de doğru olmazdı: kural `useRef(...).current` okumasını
		 * "render sırasında ref okunuyor" sayıp `react-hooks/refs` hatası
		 * üretiyor (ölçüldü: 2 hata ekleniyordu).
		 */
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [visible, isAuto, animateOpen, animateClose, measuredHeight]);

	useEffect(() => {
		if (!visible) return;
		const onBackPress = () => {
			onClose?.();
			return true;
		};
		const sub = BackHandler.addEventListener(
			"hardwareBackPress",
			onBackPress,
		);
		return () => sub.remove();
	}, [visible, onClose]);

	// İçerik ölçümü (fitContent aktifse)
	const handleLayout = (e) => {
		if (!isAuto) return;
		const h = Math.round(e.nativeEvent.layout.height);
		if (h > 0 && Math.abs(h - measuredHeight) > 2) {
			setMeasuredHeight(h);
			sheetHeightRef.current = h;
			if (visible && !hasOpened.current) {
				hasOpened.current = true;
				translateY.setValue(h);
				animateOpen();
			}
		}
	};

	// ─── PanResponder ────────────────────────────────────────────────────────
	//
	// TV'de sürükleme YOKTUR (kumanda yok); PanResponder devreye girmese de
	// `onMoveShouldSetPanResponder` TV'de panelin kaymasını engellemek için
	// yanlışlıkla devreye girebilirdi.
	const panResponder = useRef(
		PanResponder.create({
			onStartShouldSetPanResponder: () => swipeable && !isTV,
			onMoveShouldSetPanResponder: (_, gs) =>
				swipeable && !isTV && gs.dy > 5,

			onPanResponderGrant: () => {
				translateY.extractOffset();
			},

			onPanResponderMove: (_, gs) => {
				if (gs.dy < 0) return;
				translateY.setValue(gs.dy);
			},

			onPanResponderRelease: (_, gs) => {
				translateY.flattenOffset();
				const shouldClose =
					gs.dy > SWIPE_CLOSE_THRESHOLD ||
					gs.vy > SWIPE_VELOCITY_THRESHOLD;

				if (shouldClose) {
					isClosingByGesture.current = true;
					const closeTarget =
						(sheetHeightRef.current || SCREEN_HEIGHT) + altTasma;
					Animated.parallel([
						Animated.spring(translateY, {
							toValue: closeTarget,
							damping: 24,
							stiffness: 280,
							useNativeDriver: true,
						}),
						Animated.timing(backdropOpacity, {
							toValue: 0,
							duration: 180,
							useNativeDriver: true,
						}),
					]).start(({ finished }) => {
						if (finished) onClose();
					});
				} else {
					// Snap back: açık konuma yay
					Animated.spring(translateY, {
						toValue: 0,
						damping: 20,
						stiffness: 260,
						useNativeDriver: true,
					}).start();
				}
			},

			onPanResponderTerminate: () => {
				translateY.flattenOffset();
				Animated.spring(translateY, {
					toValue: 0,
					damping: 20,
					stiffness: 260,
					useNativeDriver: true,
				}).start();
			},
		}),
	).current;

	if (!visible) return null;

	return (
		<Modal
			transparent
			animationType="none"
			visible={visible}
			onRequestClose={onClose}
			statusBarTranslucent>
			{/* Backdrop */}
			<Animated.View
				style={[
					styles.backdrop,
					{
						opacity: backdropOpacity.interpolate({
							inputRange: [0, 1],
							outputRange: [0, opacity],
						}),
					},
				]}>
				<Pressable
					style={StyleSheet.absoluteFill}
					onPress={closeOnBackdrop ? onClose : undefined}
				/>
			</Animated.View>

			{/* Sheet */}
			<View style={StyleSheet.absoluteFill} pointerEvents="box-none">
				<Animated.View
					onLayout={handleLayout}
					style={[
						styles.sheet,
						isTV && styles.sheetTv,
						{
							bottom: -altTasma,
							...(isAuto
								? {
										maxHeight: SCREEN_HEIGHT * 0.85,
										paddingBottom: altTasma,
									}
								: { height: sheetHeight + altTasma }),
						},
						{ transform: [{ translateY }] },
					]}
					{...panResponder.panHandlers}>
					{/* Drag handle — telefonda var, TV'de anlamsız */}
					{handle && !isTV ? (
						<View style={styles.handleContainer}>
							<View style={styles.handle} />
						</View>
					) : null}

					{/* Başlık */}
					{title ? (
						<View style={styles.titleRow}>
							<Text style={styles.titleText}>{title}</Text>
						</View>
					) : null}

					{/* İçerik — alt boşluk kasıtlı olarak dar.
					    Panel artık `altTasma` kadar ekranın altına taşıyor
					    (bkz. `altTasma`), buraya da tam inset kadar pay
					    verilirse son kart navigasyon çubuğunun arkasına
					    gömülür. Çubuk yokken 10dp: son kart ekranın
kabına yapışmasın diye yeterli, "kalın ölü şerit" de bırakmıyor. */}
					<View
						style={[
							styles.content,
							isAuto && styles.autoContent,
							{ paddingBottom: Math.max(insets.bottom, 10) },
						]}>
						{children}
					</View>
				</Animated.View>
			</View>
		</Modal>
	);
};

const styles = StyleSheet.create({
	backdrop: {
		...StyleSheet.absoluteFill,
		backgroundColor: "#000000ff",
	},
	sheet: {
		position: "absolute",
		bottom: 0,
		left: 0,
		right: 0,
		backgroundColor: "rgba(15, 15, 15, 1)",
		borderTopLeftRadius: 20,
		borderTopRightRadius: 20,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: -4 },
		shadowOpacity: 0.12,
		shadowRadius: 16,
		elevation: 24,
	},
	/**
	 * TV: telefonla AYNI yerleşim — sol, sağ ve alt kenara yapışık, yalnız
	 * üst köşeler yuvarlak.
	 *
	 * `styles.sheet` zaten `bottom/left/right: 0` ve üst köşeleri yuvarlatık
	 * getiriyor; burada yalnız alt köşeler düzleştirilip dört kenar yerine
	 * TEK üst çizgi bırakılıyor. Kenar çizgisi kaldırılırsa panelin
	 * ekranın sağ ve sol kenarına değdiği yer çizgiyle belli olur ve panel
	 * yine "yerleştirilmiş kutu" gibi durur.
	 *
	 * ⚠️ `position: "relative"` ve dört köşe `borderRadius` BİLEREK kaldırıldı:
	 * göreli konumlandırma `bottom: 0`'ı iptal edip paneli ortaya atıyordu.
	 */
	sheetTv: {
		borderBottomLeftRadius: 0,
		borderBottomRightRadius: 0,
		borderTopWidth: 1,
		borderLeftWidth: 1,
		borderRightWidth: 1,
		borderBottomWidth: 1,
		borderColor: "rgba(255, 255, 255, 0.14)",
		borderBottomColor: "#000000",
		shadowOffset: { width: 0, height: -6 },
		shadowOpacity: 0.45,
		shadowRadius: 20,
		elevation: 26,
	},
	handleContainer: {
		alignItems: "center",
		paddingTop: 12,
		paddingBottom: 4,
	},
	handle: {
		width: 40,
		height: 4,
		borderRadius: 2,
		backgroundColor: "#E0E0E0",
	},
	titleRow: {
		paddingHorizontal: 20,
		paddingTop: 8,
		paddingBottom: 12,
		borderBottomWidth: StyleSheet.hairlineWidth,
		borderBottomColor: "#333333",
	},
	titleText: {
		fontSize: 17,
		fontWeight: "600",
		color: "#e0e0e0ff",
		textAlign: "center",
	},
	content: {
		flex: 1,
		paddingHorizontal: 20,
		paddingTop: 16,
	},
	autoContent: {
		flex: 0,
	},
});

export default BottomSheetModal;
