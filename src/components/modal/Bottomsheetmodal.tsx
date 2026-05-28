import React, { useCallback, useEffect, useRef } from "react";
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

// ─── Eşik değerleri ────────────────────────────────────────────────────────
const SWIPE_CLOSE_THRESHOLD = 120; // px aşağı sürüklenince kapanır
const SWIPE_VELOCITY_THRESHOLD = 0.5; // hız eşiği (px/ms)

// ─── Tipler ────────────────────────────────────────────────────────────────
interface BottomSheetModalProps {
	visible: boolean;
	onClose: () => void;
	/**
	 * Modal'ın ekranın kaçta kaçını kaplamasını istediğinizi belirtin.
	 * Örn: 0.5 → ekranın %50'si, 0.9 → %90'ı. Varsayılan: 0.6
	 */
	snapToHeight?: number;
	/** Backdrop'a tıklayınca kapansın mı? Varsayılan: true */
	closeOnBackdrop?: boolean;
	/** Sürükleme ile kapama. Varsayılan: true */
	swipeable?: boolean;
	children?: React.ReactNode;
	/** Modal başlığı */
	title?: string;
}

// ─── Ana Bileşen ───────────────────────────────────────────────────────────
export const BottomSheetModal: React.FC<BottomSheetModalProps> = ({
	visible,
	onClose,
	snapToHeight = 0.6,
	closeOnBackdrop = true,
	swipeable = true,
	children,
	title,
}) => {
	const sheetHeight = SCREEN_HEIGHT * snapToHeight;

	// translateY: 0 = açık, sheetHeight = tamamen kapanmış
	const translateY = useRef(new Animated.Value(sheetHeight)).current;
	const backdropOpacity = useRef(new Animated.Value(0)).current;
	const lastGestureY = useRef(0);

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
		(onFinish?: () => void) => {
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
			translateY.setValue(sheetHeight); // başlangıç konumu: kapalı
			animateOpen();
		} else {
			animateClose();
		}
	}, [visible]);

	// ─── PanResponder: sürükleme ─────────────────────────────────────────────
	const panResponder = useRef(
		PanResponder.create({
			onStartShouldSetPanResponder: () => swipeable,
			onMoveShouldSetPanResponder: (_, gs) => swipeable && gs.dy > 5, // sadece aşağı harekette devral

			onPanResponderGrant: () => {
				// Mevcut animasyon değerini yakala
				translateY.extractOffset();
			},

			onPanResponderMove: (_, gs) => {
				lastGestureY.current = gs.dy;
				// Sadece aşağı sürüklemeye izin ver (negative = yukarı, engelle)
				if (gs.dy < 0) return;
				translateY.setValue(gs.dy);
			},

			onPanResponderRelease: (_, gs) => {
				translateY.flattenOffset();
				const shouldClose =
					gs.dy > SWIPE_CLOSE_THRESHOLD ||
					gs.vy > SWIPE_VELOCITY_THRESHOLD;

				if (shouldClose) {
					// Kapatma animasyonu bitince callback'i çağır
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
					// Geri yay: snap to open
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

	// ─── Render ──────────────────────────────────────────────────────────────
	if (!visible) return null;

	return (
		<Modal
			transparent
			animationType="none" // Kendi animasyonumuzu kullanıyoruz
			visible={visible}
			onRequestClose={onClose}
			statusBarTranslucent>
			{/* ── Backdrop ── */}
			<Animated.View
				style={[
					styles.backdrop,
					{
						opacity: backdropOpacity.interpolate({
							inputRange: [0, 1],
							outputRange: [0, 0.8],
						}),
					},
				]}>
				<Pressable
					style={StyleSheet.absoluteFill}
					onPress={closeOnBackdrop ? onClose : undefined}
				/>
			</Animated.View>

			{/* ── Sheet ── */}
			<Animated.View
				style={[
					styles.sheet,
					{ height: sheetHeight },
					{ transform: [{ translateY }] },
				]}
				{...panResponder.panHandlers}>
				{/* Drag handle */}
				<View style={styles.handleContainer}>
					<View style={styles.handle} />
				</View>

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

// ─── Stiller ──────────────────────────────────────────────────────────────
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
		backgroundColor: "#fff",
		borderTopLeftRadius: 20,
		borderTopRightRadius: 20,
		// Gölge
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
		borderBottomColor: "#F0F0F0",
	},
	titleText: {
		fontSize: 17,
		fontWeight: "600",
		color: "#1A1A1A",
		textAlign: "center",
	},
	content: {
		flex: 1,
		paddingHorizontal: 20,
		paddingTop: 16,
	},
});

export default BottomSheetModal;
