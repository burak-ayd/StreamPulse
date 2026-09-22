import BottomNavigation from "@components/BottomNavigation";
import { useThemeContext } from "@context/ThemeContext";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { Stack } from "expo-router";
import { useState } from "react";
import {
	ScrollView,
	StatusBar,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function SearchScreen() {
	const { theme, colors } = useThemeContext();
	const [searchQuery, setSearchQuery] = useState("");

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
						Arama
					</Text>
				</View>

				<ScrollView
					showsVerticalScrollIndicator={false}
					contentContainerStyle={styles.scrollContainer}>
					{/* Search Input */}
					<View style={styles.searchContainer}>
						<View
							style={[
								styles.searchInputWrapper,
								{ backgroundColor: colors.cardBg, borderColor: colors.border, borderWidth: 1 },
							]}>
							<Ionicons
								name="search"
								size={20}
								color={colors.textSecondary}
							/>
							<TextInput
								style={[
									styles.searchInput,
									{ color: colors.text },
								]}
								placeholder="Film veya dizi ara..."
								placeholderTextColor={colors.textSecondary}
								value={searchQuery}
								onChangeText={setSearchQuery}
							/>
						</View>
					</View>

					{/* Empty State */}
					<View style={styles.emptyState}>
						<Ionicons
							name="search-outline"
							size={64}
							color={colors.textSecondary}
						/>
						<Text
							style={[
								styles.emptyStateText,
								{ color: colors.textSecondary },
							]}>
							Favori film ve dizilerinizi aramaya başlayın
						</Text>
					</View>
				</ScrollView>

				<BottomNavigation activeRoute="/(app)/search" />
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
	searchContainer: {
		paddingHorizontal: 16,
		paddingVertical: 16,
	},
	searchInputWrapper: {
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: 12,
		borderRadius: 12,
		height: 48,
		gap: 8,
	},
	searchInput: {
		flex: 1,
		fontSize: 16,
	},
	emptyState: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		paddingVertical: 100,
		gap: 16,
	},
	emptyStateText: {
		fontSize: 16,
		textAlign: "center",
		paddingHorizontal: 32,
	},
});
