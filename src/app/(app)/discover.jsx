import BottomNavigation from "@components/BottomNavigation";
import { useNavLayout } from "@/hooks/useNavLayout";
import TVPressable from "@/components/common/TVPressable";
import { CATEGORIES } from "@constants/data";
import { useThemeContext } from "@context/ThemeContext";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { Stack, useRouter } from "expo-router";
import { useEffect } from "react";
import {
	BackHandler,
	FlatList,
	ScrollView,
	StatusBar,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function DiscoverScreen() {
	const { theme, colors } = useThemeContext();
	const router = useRouter();
	// Sol ray (TV / tablet yatay) varken icerik sola kayar.
	const { contentPaddingLeft } = useNavLayout();

	useEffect(() => {
		const onBackPress = () => {
			router.push("/(app)");
			return true;
		};
		const sub = BackHandler.addEventListener("hardwareBackPress", onBackPress);
		return () => sub.remove();
	}, [router]);

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
					]}>
					<Text style={[styles.headerTitle, { color: colors.text }]}>
						Keşfet
					</Text>
				</View>

				<ScrollView
					showsVerticalScrollIndicator={false}
					contentContainerStyle={styles.scrollContainer}>
					{/* Categories Section */}
					<View style={styles.sectionContainer}>
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
							numColumns={2}
							scrollEnabled={false}
							columnWrapperStyle={styles.categoryRow}
							renderItem={({ item, index }) => (
								<TVPressable
									autoFocus={index === 0}
									style={[
										styles.categoryCard,
										{ backgroundColor: colors.cardBg },
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
		justifyContent: "space-between",
		marginBottom: 12,
	},
	categoryCard: {
		width: "48%",
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
