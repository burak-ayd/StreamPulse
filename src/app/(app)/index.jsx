import PlatformList from "@/components/content/PlatformList";
import BottomSheetModal from "@/components/modal/Bottomsheetmodal";
import BottomNavigation from "@components/BottomNavigation";
import FeaturedCarousel from "@components/FeaturedCarousel";
import HorizontalMovieCard from "@components/HorizontalMovieCard";
import VerticalMovieCard from "@components/VerticalMovieCard";
import {
	FEATURED_MOVIES,
	POPULAR_MOVIES,
	RECOMMENDED_MOVIES,
} from "@constants/data";
import { useThemeContext } from "@context/ThemeContext";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { getUserProfile } from "@utils/storage";
import { Stack, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
	ScrollView,
	StatusBar,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function Index() {
	const { theme, colors } = useThemeContext();
	const [userName, setUserName] = useState("");
	const [userAvatarUrl, setUserAvatarUrl] = useState("");
	const [isPlatformModalVisible, setIsPlatformModalVisible] = useState(false);

	const router = useRouter();

	useEffect(() => {
		let isMounted = true;
		async function loadProfile() {
			try {
				const profile = await getUserProfile();
				if (isMounted && profile) {
					setUserName(profile.displayName || profile.username || "Kullanıcı");
					setUserAvatarUrl(profile.avatarUrl || "");
				}
			} catch (error) {
				console.error("Profil yüklenirken hata:", error);
			}
		}
		loadProfile();
		return () => {
			isMounted = false;
		};
	}, []);

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
						{ borderBottomColor: colors.border },
					]}>
					<View style={styles.headerLogo}>
						<Ionicons
							name="film"
							size={26}
							color={colors.primary}
						/>
						<Text
							style={[
								styles.headerTitle,
								{ color: colors.text },
							]}>
							StreamPulse
						</Text>
					</View>

					<View style={styles.headerActions}>
						{/* Platforms Modal Icon */}
						<TouchableOpacity
							style={[
								styles.headerIconBtn,
								{
									backgroundColor: colors.cardBg,
									borderColor: colors.border,
								},
							]}
							onPress={() => {
								setIsPlatformModalVisible(true);
							}}>
							<Ionicons
								name="grid-outline"
								size={18}
								color={colors.primary}
							/>
						</TouchableOpacity>
						<TouchableOpacity
							style={[
								styles.headerIconBtn,
								{
									backgroundColor: colors.cardBg,
									borderColor: colors.border,
								},
							]}
							onPress={() => router.push("/(app)/profile")}>
							<Ionicons
								name="person"
								size={18}
								color={colors.primary}
							/>
						</TouchableOpacity>
					</View>
				</View>

				<ScrollView
					showsVerticalScrollIndicator={false}
					contentContainerStyle={styles.scrollContainer}>
					{/* Carousel */}
					<FeaturedCarousel
						movies={FEATURED_MOVIES}
						onPress={(movie) =>
							router.push({
								pathname: `/(app)/MovieDetails/${movie.id}`,
							})
						}
						oneMovieCard={false}
					/>

					{/* Popular Movies */}
					<HorizontalMovieCard
						colors={colors}
						movies={POPULAR_MOVIES}
						title="Popüler Filmler"
					/>

					{/* Recommended Section */}
					<VerticalMovieCard
						colors={colors}
						title="Senin İçin Seçilenler"
						movies={RECOMMENDED_MOVIES}
					/>
				</ScrollView>

				<BottomSheetModal
					visible={isPlatformModalVisible}
					onClose={() => setIsPlatformModalVisible(false)}
					snapToHeight={0.7}
					title=""
					opacity={0.55}
					handle={false}
					closeOnBackdrop={true}
					swipeable={true}>
					<PlatformList />
				</BottomSheetModal>
				<BottomNavigation activeRoute="/(app)" />
			</SafeAreaView>
		</>
	);
}

const styles = StyleSheet.create({
	safeArea: { flex: 1 },
	header: {
		height: 60,
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		paddingHorizontal: 20,
		borderBottomWidth: 1,
	},
	headerLogo: { flexDirection: "row", alignItems: "center", gap: 8 },
	headerTitle: { fontSize: 20, fontWeight: "bold", letterSpacing: 0.5 },
	headerActions: { flexDirection: "row", alignItems: "center", gap: 12 },
	headerIconBtn: {
		width: 36,
		height: 36,
		borderRadius: 18,
		borderWidth: 1,
		justifyContent: "center",
		alignItems: "center",
	},
	scrollContainer: { paddingBottom: 40 },
});
