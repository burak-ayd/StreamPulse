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

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get("window");

const SWIPE_CLOSE_THRESHOLD = 80;
const SWIPE_VELOCITY_THRESHOLD = 0.4;

/**
 * TV'de alt sayfa değil, ortalanmış bir PANEL.
 *
 * Bottom sheet telefon içindir: parmakla alttan yukarı sürüklenir, ekranın
 * altına yapışır. TV'de sürükleme yoktur ve 1920px genişliğinde bir
 * yapışkan sayfa, içindeki 38dp kartlarla birlikte boş bir bant gibi
 * görünüyordu. TV'de bu yüzden:
 *
 *   • panel ortalanır ve `maxWidth` ile daralır,
 *   • dört köşesi yuvarlatılır, sürükleme tutamağı gösterilmez,
 *   • `snapToHeight` oranı ekran YÜKSEKLİĞİ yerine en-boy oranıyla
 *     sınırlanır (0.78 × 1080 = 843px, panelin içi boş kalıyordu).
 */
const TV_PANEL_WIDTH_RATIO = 0.46;
const TV_PANEL_MAX_WIDTH = 900;

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

	/** TV'de panel ortada durur; genişliği ekranın oranıyla sınırlanır. */
	const tvPanelWidth = Math.min(
		SCREEN_WIDTH * TV_PANEL_WIDTH_RATIO,
		TV_PANEL_MAX_WIDTH,
	);

	/**
	 * TV panel YÜKSEKLİĞİ — ekranın %88'i, en-boy tavanıyla.
	 *
	 * `snapToHeight` (0.78) ekranın %78'idir ve 1080p'de 843px'tir;
	 * en-boy katsayısıyla (2.35) daraltılınca ≈600px'e düşüyor ve liste
	 * yalnızca 1.5 kart gösteriyordu. Burada tavanı doğrudan ekranın
	 * yüksekliğinden türetiyoruz: TV'de dikey kaydırma zaten var, asıl
	 * derd dar panelin BİTMEKTE zorlamasıydı.
	 */
	const tvPanelHeight = Math.min(
		SCREEN_HEIGHT * 0.88,
		tvPanelWidth * (SCREEN_HEIGHT / SCREEN_WIDTH) * 2.6,
	);

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
			const closeTarget = sheetHeightRef.current || SCREEN_HEIGHT;
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
		[translateY, backdropOpacity],
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
					const closeTarget = sheetHeightRef.current || SCREEN_HEIGHT;
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
			<View
				style={[StyleSheet.absoluteFill, isTV && styles.tvCenter]}
				pointerEvents="box-none">
			<Animated.View
				onLayout={handleLayout}
				style={[
					styles.sheet,
					isTV && styles.sheetTv,
					isTV ? { width: tvPanelWidth, height: sheetHeight } : null,
					isAuto
						? { maxHeight: SCREEN_HEIGHT * 0.85 }
						: { height: sheetHeight },
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

				{/* İçerik */}
				<View
					style={[
						styles.content,
						isAuto && styles.autoContent,
						{ paddingBottom: Math.max(insets.bottom, 20) },
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
	/** TV: ekranın ortasında duran, dört köşesi yuvarlatılmış panel. */
	sheetTv: {
		position: "relative",
		borderRadius: 20,
		borderWidth: 1,
		borderColor: "rgba(255, 255, 255, 0.14)",
		shadowOffset: { width: 0, height: 12 },
		shadowOpacity: 0.55,
		elevation: 28,
	},
	/** TV: paneli ekranın ortasında tutan sarmalayıcı. */
	tvCenter: {
		justifyContent: "center",
		alignItems: "center",
		paddingHorizontal: 40,
		paddingVertical: 24,
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
