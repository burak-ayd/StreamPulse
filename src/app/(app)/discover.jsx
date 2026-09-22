import BottomNavigation from "@components/BottomNavigation";
import { CATEGORIES } from "@constants/data";
import { useThemeContext } from "@context/ThemeContext";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { Stack } from "expo-router";
import {
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

	return (
		<>
			<Stack.Screen options={{ headerShown: false }} />
			<SafeAreaView
				edges={["top", "left", "right", "bottom"]}
				style={[styles.safeArea, { backgroundColor: colors.bg }]}>
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
							renderItem={({ item }) => (
								<TouchableOpacity
									style={[
										styles.categoryCard,
										{ backgroundColor: colors.cardBg },
									]}
									activeOpacity={0.8}>
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
								</TouchableOpacity>
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
						<View
							style={[
								styles.trendingCard,
								{ backgroundColor: colors.cardBg },
							]}>
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
						</View>
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
	},
	trendingText: {
		fontSize: 14,
		textAlign: "center",
	},
});
