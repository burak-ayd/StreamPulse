import { useEffect, useRef, useState } from "react";

import {
	Animated,
	Dimensions,
	Modal,
	PanResponder,
	Pressable,
	StyleSheet,
	View,
} from "react-native";

const SCREEN_HEIGHT = Dimensions.get("window").height;

export default function BottomSheet({
	visible,
	onClose,
	children,
	height = SCREEN_HEIGHT * 0.9,
}) {
	const translateY = useRef(new Animated.Value(height)).current;

	const [modalVisible, setModalVisible] = useState(visible);

	useEffect(() => {
		if (visible) {
			setModalVisible(true);

			Animated.spring(translateY, {
				toValue: 0,
				useNativeDriver: true,
				damping: 20,
				mass: 0.8,
				stiffness: 120,
			}).start();
		} else {
			hideSheet();
		}
	}, [visible]);

	const hideSheet = () => {
		Animated.timing(translateY, {
			toValue: height,
			duration: 220,
			useNativeDriver: true,
		}).start(() => {
			setModalVisible(false);
		});
	};

	const closeModal = () => {
		Animated.timing(translateY, {
			toValue: height,
			duration: 220,
			useNativeDriver: true,
		}).start(() => {
			setModalVisible(false);
			onClose?.();
		});
	};

	const panResponder = useRef(
		PanResponder.create({
			onStartShouldSetPanResponder: () => true,

			onMoveShouldSetPanResponder: (_, gesture) => {
				return Math.abs(gesture.dy) > 5;
			},

			onPanResponderMove: (_, gesture) => {
				if (gesture.dy > 0) {
					translateY.setValue(gesture.dy);
				}
			},

			onPanResponderRelease: (_, gesture) => {
				const shouldClose = gesture.dy > 120 || gesture.vy > 1.2;

				if (shouldClose) {
					closeModal();
				} else {
					Animated.spring(translateY, {
						toValue: 0,
						useNativeDriver: true,
						damping: 20,
						stiffness: 150,
					}).start();
				}
			},
		}),
	).current;

	if (!modalVisible) {
		return null;
	}

	return (
		<Modal
			transparent
			visible={modalVisible}
			animationType="none"
			statusBarTranslucent
			onRequestClose={closeModal}>
			<View style={styles.container}>
				<Animated.View
					pointerEvents="box-none"
					style={[
						styles.backdrop,
						{
							opacity: translateY.interpolate({
								inputRange: [0, height],
								outputRange: [0.45, 0],
								extrapolate: "clamp",
							}),
						},
					]}>
					<Pressable style={{ flex: 1 }} onPress={closeModal} />
				</Animated.View>

				<Animated.View
					{...panResponder.panHandlers}
					style={[
						styles.sheet,
						{
							height,
							transform: [{ translateY }],
						},
					]}>
					<View style={styles.handle} />

					{children}
				</Animated.View>
			</View>
		</Modal>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		justifyContent: "flex-end",
	},

	// backdrop: {
	// 	...StyleSheet.absoluteFillObject,
	// 	backgroundColor: "rgba(0,0,0,0.45)",
	// },

	sheet: {
		backgroundColor: "#d3d3daff",
		borderTopLeftRadius: 28,
		borderTopRightRadius: 28,
		paddingTop: 14,
		paddingHorizontal: 20,
		paddingBottom: 34,
	},

	handle: {
		width: 52,
		height: 5,
		borderRadius: 999,
		backgroundColor: "#666",
		alignSelf: "center",
		marginBottom: 18,
	},
});
