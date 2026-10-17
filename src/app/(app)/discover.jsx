import BottomNavigation from "@components/BottomNavigation";
import { useNavLayout } from "@/hooks/useNavLayout";
import { useMeasuredColumns } from "@/hooks/useMeasuredColumns";
import { useTvMetrics } from "@/utils/tvMetrics";
import TVPressable from "@/components/common/TVPressable";
import { CATEGORIES } from "@constants/data";
import { useThemeContext } from "@context/ThemeContext";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { useCallback } from "react";
import {
	BackHandler,
	FlatList,
	ScrollView,
	StatusBar,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function DiscoverScreen() {
	const { theme, colors } = useThemeContext();
	const router = useRouter();
	// Sol ray (TV / tablet yatay) varken icerik sola kayar.
	const { contentPaddingLeft } = useNavLayout();
	// TV: keşfet ızgarası ekranı kenardan kenara dolduruyordu.
	const { contentMaxWidth } = useTvMetrics();

	/**
	 * Kategori kartları: sabit "48%" genişlik + `numColumns` kombinasyonu
	 * TV'de taşıyordu (4 sütun × %48 = %192; ekranda 2 dev kare görünüyordu).
	 * Sütun sayısı ve kart genişliği ARTIK kabın ölçüsünden türetilir:
	 * telefon 2, TV/geniş ekran 4+ sütun; kartlar tam oturur.
	 * (Kapta 16dp yatay iç boşluk var — `padding: 16`.)
	 */
	const { onLayout, columns, itemWidth } = useMeasuredColumns({
		minItemWidth: 170,
		gap: 12,
		max: 6,
		min: 2,
		padding: 16,
	});

	// ODAK'a bağlı: Stack altında kalan ekranların kaydı blur'da silinir.
	// Eskiden bu ekran, odakta değilken bile her geri basışını yutuyor ve
	// ana sayfayı üst üste yığıyordu — uygulamadan çıkış imkânsızlaşıyordu.
	useFocusEffect(
		useCallback(() => {
			const onBackPress = () => {
				if (router.canGoBack()) router.back();
				else router.replace("/(app)");
				return true;
			};
			const sub = BackHandler.addEventListener(
				"hardwareBackPress",
				onBackPress,
			);
			return () => sub.remove();
		}, [router]),
	);

	return (
		<>
			<Stack.Screen options={{ headerShown: false }} />
			<SafeAreaView
				edges={["top", "left", "right", "bottom"]}
				style={[styles.safeArea, { backgroundColor: colors.bg, paddingLeft: contentPaddingLeft }]}>
				<StatusBar
					barStyle={
						theme === "dark" ? "light-content" : "dark-content"
					}
					backgroundColor={colors.bg}
				/>

			{/* Header */}
			<View
				style={[
					styles.header,
					{
						borderBottomColor: colors.border,
						backgroundColor: colors.bg,
					},
					contentMaxWidth
						? {
								width: "100%",
								maxWidth: contentMaxWidth,
								alignSelf: "center",
							}
						: null,
				]}>
				<Text style={[styles.headerTitle, { color: colors.text }]}>
					Keşfet
				</Text>
			</View>

			<ScrollView
				contentInsetAdjustmentBehavior="automatic"
				showsVerticalScrollIndicator={false}
				contentContainerStyle={[
					styles.scrollContainer,
					contentMaxWidth
						? {
								alignSelf: "center",
								width: "100%",
								maxWidth: contentMaxWidth,
							}
						: null,
				]}>
				{/* Categories Section */}
				<View style={styles.sectionContainer} onLayout={onLayout}>
					<Text
						style={[
							styles.sectionTitle,
							{ color: colors.text },
						]}>
						Kategorilere Göre Göz At
					</Text>
					<FlatList
						data={CATEGORIES}
						keyExtractor={(item) => item.id}
						// Sütun sayısı ölçümden gelir; değişince liste
						// yeniden kurulur (numColumns sonradan değiştirilemez).
						key={`cat-${columns}`}
						numColumns={columns}
						scrollEnabled={false}
						columnWrapperStyle={styles.categoryRow}
							renderItem={({ item, index }) => (
								<TVPressable
									autoFocus={index === 0}
									style={[
										styles.categoryCard,
										{
											backgroundColor: colors.cardBg,
											width: itemWidth,
										},
									]}
									focusedStyle={styles.categoryCardFocused}
									onPress={() => {
										router.push({
											pathname: "/(app)/search",
											params: { category: item.name },
										});
									}}>
									<Ionicons
										name={item.icon}
										size={36}
										color={colors.primary}
									/>
									<Text
										style={[
											styles.categoryName,
											{ color: colors.text },
										]}>
										{item.name}
									</Text>
								</TVPressable>
							)}
						/>
					</View>

					{/* Trending Section */}
					<View style={styles.sectionContainer}>
						<Text
							style={[
								styles.sectionTitle,
								{ color: colors.text },
							]}>
							Şu Anda Trend
						</Text>
						<TVPressable
							style={[
								styles.trendingCard,
								{ backgroundColor: colors.cardBg },
							]}
							focusedStyle={styles.trendingCardFocused}
							onPress={() => {
								router.push("/(app)/search");
							}}>
							<Ionicons
								name="stats-chart"
								size={44}
								color={colors.primary}
							/>
							<Text
								style={[
									styles.trendingText,
									{ color: colors.textSecondary },
								]}>
								Bölgenizdeki en popüler yapımları keşfedin
							</Text>
						</TVPressable>
					</View>
				</ScrollView>

				<BottomNavigation activeRoute="/(app)/discover" />
			</SafeAreaView>
		</>
	);
}

const styles = StyleSheet.create({
	safeArea: {
		flex: 1,
	},
	header: {
		height: 60,
		justifyContent: "center",
		alignItems: "center",
		borderBottomWidth: 1,
	},
	headerTitle: {
		fontSize: 18,
		fontWeight: "bold",
		letterSpacing: -0.015,
	},
	scrollContainer: {
		paddingBottom: 40,
	},
	sectionContainer: {
		paddingHorizontal: 16,
		paddingVertical: 20,
	},
	sectionTitle: {
		fontSize: 18,
		fontWeight: "bold",
		marginBottom: 16,
	},
	categoryRow: {
		// Kartlar ölçülen genişliği tam doldurduğu için hizalamaya gerek
		// yok; boşluk `useMeasuredColumns` ile aynı (12dp) olmalı.
		gap: 12,
		marginBottom: 12,
	},
	categoryCard: {
		// ⚠️ Genişlik buradan DEĞİL, ölçümden gelir (satır içi stil).
		// Eski "%48" + numColumns kombinasyonu TV'de satırı taşırıyordu.
		aspectRatio: 1,
		borderRadius: 12,
		justifyContent: "center",
		alignItems: "center",
		gap: 8,
		borderWidth: 2,
		borderColor: "transparent",
	},
	categoryCardFocused: {
		borderColor: "#FF3B30",
		backgroundColor: "rgba(255, 59, 48, 0.15)",
		transform: [{ scale: 1.05 }],
	},
	categoryName: {
		fontSize: 14,
		fontWeight: "600",
		textAlign: "center",
	},
	trendingCard: {
		borderRadius: 12,
		padding: 24,
		justifyContent: "center",
		alignItems: "center",
		gap: 12,
		borderWidth: 2,
		borderColor: "transparent",
	},
	trendingCardFocused: {
		borderColor: "#FF3B30",
		transform: [{ scale: 1.03 }],
	},
	trendingText: {
		fontSize: 14,
		textAlign: "center",
	},
});
