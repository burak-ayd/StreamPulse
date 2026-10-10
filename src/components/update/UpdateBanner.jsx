/**
 * Uygulama açılışında sessiz kontrol sonucu "güncelleme var" çıkarsa
 * ekranın üstünde beliren kart.
 *
 * Kasıtlı davranış: banner KULLANICIYI BLOKLAMAZ. Yalnızca bilgi verir;
 * dokununca modal açılır, kapatma (×) güncellemeyi erteler — bir sonraki
 * açılışta kontrol yine yapılır. AstorTest2'deki davranış (güncelleme
 * varsa uygulama açılmaz) offline kullanıcıyı kilitliyordu.
 */
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useThemeContext } from "@/context/ThemeContext";
import { useAppUpdate } from "@/context/AppUpdateContext";
import React, { useEffect, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function UpdateBanner() {
	const { colors } = useThemeContext();
	const { bannerVisible, release, openSheet, dismissBanner } = useAppUpdate();
	const insets = useSafeAreaInsets();

	/*
	 * `useRef(new Animated.Value(0))` DEĞİL: proje lint'i (react-hooks/refs)
	 * render sırasında ref okumayı yasaklıyor — doğru bir uyarı, çünkü ref
	 * değişimi render'ı tetiklemez ve değer güncelliği belirsizleşir.
	 * Animated.Value bir NESNEDİR; `useState` tembel başlatıcısıyla üretmek
	 * hem kurala uyar hem de değer render boyunca kararlı kalır.
	 */
	const [slide] = useState(() => new Animated.Value(0));

	useEffect(() => {
		if (!bannerVisible) return;
		slide.stopAnimation();
		Animated.spring(slide, {
			toValue: 1,
			useNativeDriver: true,
			damping: 18,
			stiffness: 180,
		}).start();
	}, [bannerVisible, slide]);

	if (!bannerVisible || !release) return null;

	const translateY = slide.interpolate({
		inputRange: [0, 1],
		outputRange: [-140, 0],
	});

	return (
		<View
			style={[styles.wrapper, { top: insets.top + 8 }]}
			pointerEvents="box-none">
			<Animated.View
				style={[
					styles.card,
					{
						backgroundColor: colors.cardBg,
						borderColor: colors.border,
						opacity: slide,
						transform: [{ translateY }],
					},
				]}>
				<Pressable
					onPress={openSheet}
					style={styles.pressArea}
					accessibilityRole="button"
					accessibilityLabel={`Yeni sürüm ${release.version} bulundu. Güncellemeyi açmak için dokunun`}>
					<View style={[styles.iconBox, { backgroundColor: colors.primary }]}>
						<Ionicons
							name="cloud-download-outline"
							size={20}
							color="#ffffff"
						/>
					</View>

					<View style={styles.textBox}>
						<Text style={[styles.title, { color: colors.text }]}>
							Yeni sürüm yayında
						</Text>
						<Text
							style={[styles.subtitle, { color: colors.textSecondary }]}
							numberOfLines={1}>
							v{release.version} • {release.sizeMB} MB — dokunarak incele
						</Text>
					</View>
				</Pressable>

				<Pressable
					onPress={dismissBanner}
					hitSlop={10}
					style={styles.close}
					accessibilityRole="button"
					accessibilityLabel="Güncelleme bildirimini kapat">
					<Ionicons
						name="close"
						size={18}
						color={colors.textSecondary}
					/>
				</Pressable>
			</Animated.View>
		</View>
	);
}

const styles = StyleSheet.create({
	// absolute: banner diğer ekranların üstüne binmeli, düzen akışını
	// kaydırmamalı. pointerEvents="box-none" aradaki boşluğun dokunuşu
	// alttaki içeriğe geçirir.
	wrapper: {
		position: "absolute",
		left: 12,
		right: 12,
		zIndex: 50,
		elevation: 50,
	},
	card: {
		flexDirection: "row",
		alignItems: "center",
		borderRadius: 14,
		borderWidth: 1,
		paddingRight: 6,
		paddingVertical: 10,
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
		width: 38,
		height: 38,
		borderRadius: 19,
		alignItems: "center",
		justifyContent: "center",
	},
	textBox: {
		flex: 1,
		marginLeft: 12,
	},
	title: {
		fontSize: 15,
		fontWeight: "700",
	},
	subtitle: {
		fontSize: 13,
		marginTop: 2,
	},
	close: {
		width: 34,
		height: 34,
		alignItems: "center",
		justifyContent: "center",
	},
});