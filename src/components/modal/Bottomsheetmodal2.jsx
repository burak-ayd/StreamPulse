import { useCallback, useEffect, useRef } from "react";
import {
	Animated,
	Dimensions,
	Modal,
	PanResponder,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

const SWIPE_CLOSE_THRESHOLD = 120;
const SWIPE_VELOCITY_THRESHOLD = 0.5;

/**
 * BottomSheetModal
 *
 * Props:
 *  visible         {boolean}  – modalı göster/gizle
 *  onClose         {function} – kapatma callback'i
 *  snapToHeight    {number}   – 0-1 arası oran, varsayılan 0.6
 *  closeOnBackdrop {boolean}  – backdrop'a tıklayınca kapat, varsayılan true
 *  swipeable       {boolean}  – sürükleyerek kapat, varsayılan true
 *  title           {string}   – opsiyonel başlık
 *  children        {node}     – modal içeriği
 */
const BottomSheetModal = ({
	visible,
	onClose,
	snapToHeight = 0.6,
	closeOnBackdrop = true,
	swipeable = true,
	title,
	handle = false,
	opacity = 0.55,
	children,
}) => {
	const sheetHeight = SCREEN_HEIGHT * snapToHeight;

	const translateY = useRef(new Animated.Value(sheetHeight)).current;
	const backdropOpacity = useRef(new Animated.Value(0)).current;
	// Gesture ile kapanma başladığında useEffect'in ikinci kez animasyon
	// çalıştırmasını engellemek için kullanılır.
	const isClosingByGesture = useRef(false);

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
				duration: 280,
				useNativeDriver: true,
			}),
		]).start();
	}, [translateY, backdropOpacity]);

	const animateClose = useCallback(
		(onFinish) => {
			Animated.parallel([
				Animated.spring(translateY, {
					toValue: sheetHeight,
					damping: 26,
					stiffness: 300,
					mass: 0.8,
					useNativeDriver: true,
				}),
				Animated.timing(backdropOpacity, {
					toValue: 0,
					duration: 220,
					useNativeDriver: true,
				}),
			]).start(({ finished }) => {
				if (finished) onFinish?.();
			});
		},
		[translateY, backdropOpacity, sheetHeight],
	);

	// ─── visible değişince aç/kapat ──────────────────────────────────────────
	useEffect(() => {
		if (visible) {
			isClosingByGesture.current = false;
			translateY.setValue(sheetHeight);
			animateOpen();
		} else {
			// Gesture zaten kapanma animasyonunu başlattıysa tekrar çalıştırma.
			if (!isClosingByGesture.current) {
				animateClose();
			}
		}
	}, [visible]);

	// ─── PanResponder ────────────────────────────────────────────────────────
	const panResponder = useRef(
		PanResponder.create({
			onStartShouldSetPanResponder: () => swipeable,
			onMoveShouldSetPanResponder: (_, gs) => swipeable && gs.dy > 5,

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
					Animated.parallel([
						Animated.spring(translateY, {
							toValue: sheetHeight,
							damping: 24,
							stiffness: 280,
							useNativeDriver: true,
						}),
						Animated.timing(backdropOpacity, {
							toValue: 0,
							duration: 200,
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
			<Animated.View
				style={[
					styles.sheet,
					{ height: sheetHeight },
					{ transform: [{ translateY }] },
				]}
				{...panResponder.panHandlers}>
				{/* Drag handle */}
				{handle && (
					<View style={styles.handleContainer}>
						<View style={styles.handle} />
					</View>
				)}

				{/* Başlık */}
				{title && (
					<View style={styles.titleRow}>
						<Text style={styles.titleText}>{title}</Text>
					</View>
				)}

				{/* İçerik */}
				<View style={styles.content}>{children}</View>
			</Animated.View>
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
});

export default BottomSheetModal;
