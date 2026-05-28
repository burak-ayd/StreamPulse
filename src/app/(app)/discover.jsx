import BottomNavigation from "@components/BottomNavigation";
import { CATEGORIES } from "@constants/data";
import { useThemeContext } from "@context/ThemeContext";
import { MaterialIcons } from "@expo/vector-icons";
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
						Discover
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
							Browse by Category
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
									<MaterialIcons
										name={item.icon}
										size={40}
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
							Trending Now
						</Text>
						<View
							style={[
								styles.trendingCard,
								{ backgroundColor: colors.cardBg },
							]}>
							<MaterialIcons
								name="trending-up"
								size={48}
								color={colors.primary}
							/>
							<Text
								style={[
									styles.trendingText,
									{ color: colors.textSecondary },
								]}>
								Discover what's trending in your region
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
