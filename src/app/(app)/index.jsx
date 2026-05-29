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
import { MaterialIcons } from "@expo/vector-icons";
import { supabase } from "@utils/supabase";
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
import "react-native-url-polyfill/auto";

export default function Index() {
	const { theme, colors, toggleTheme } = useThemeContext();
	const [userEmail, setUserEmail] = useState("");
	const [userName, setUserName] = useState("");
	const [userAvatarUrl, setUserAvatarUrl] = useState("");
	const [isPlatformModalVisible, setIsPlatformModalVisible] = useState(false);

	console.log("6-Index Render Edildi");

	const router = useRouter();

	useEffect(() => {
		supabase.auth.getSession().then(async ({ data: { session } }) => {
			if (!session) return;
			setUserEmail(session.user.email ?? "");

			const { data } = await supabase
				.from("profiles")
				.select("*")
				.eq("id", session.user.id);

			if (data && data[0]) {
				setUserName(data[0].full_name ?? "");
				setUserAvatarUrl(data[0].avatar_url ?? "");
			}
		});
	}, []);

	const handleLogout = async () => {
		// SignOut olunca RootLayout'taki useEffect bunu yakalayıp otomatik (auth)/login'e atacak
		await supabase.auth.signOut();
	};

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
						<MaterialIcons
							name="movie"
							size={28}
							color={colors.primary}
						/>
						<Text
							style={[
								styles.headerTitle,
								{ color: colors.text },
							]}>
							CineVerse
						</Text>
					</View>

					<View style={styles.headerActions}>
						{/* platformlar iconu eklenecek */}
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
							<MaterialIcons
								name="menu-book"
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
							<MaterialIcons
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
					{/* Welcome Banner */}
					{/* Carousel */}
					<FeaturedCarousel
						movies={FEATURED_MOVIES} // API'nızdan gelen veri
						onPress={(movie) =>
							router.push({
								pathname: "/(app)/detail",
								params: { movie },
							})
						}
						oneMovieCard={false}
					/>
					{/* TEST BUTONU - Geçici */}
					<TouchableOpacity
						style={{
							backgroundColor: colors.primary,
							padding: 16,
							margin: 20,
							borderRadius: 12,
							alignItems: "center",
						}}
						onPress={() =>
							router.push(
								"/(app)/MovieDetails/1e70a60f-e5fc-45d9-aa19-a987062faec6",
							)
						}>
						<Text
							style={{
								color: "#fff",
								fontWeight: "700",
								fontSize: 16,
							}}>
							🎬 Test: Film Detayı Aç
						</Text>
					</TouchableOpacity>
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
					snapToHeight={0.7} // ekranın %70'ı
					title=""
					opacity={0.55}
					handle={false}
					closeOnBackdrop={true} // backdrop'a tıklayınca kapat
					swipeable={true} // sürükleyerek kapat
				>
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

	sectionContainer: { marginBottom: 28 },
	sectionHeader: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		paddingHorizontal: 20,
		marginVertical: 16,
	},
	sectionTitle: { fontSize: 18, fontWeight: "bold" },
	seeAll: { fontSize: 13, fontWeight: "600" },
	horizontalList: { paddingHorizontal: 20, gap: 16 },
	movieCard: {
		width: 150,
		borderRadius: 16,
		overflow: "hidden",
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.1,
		shadowRadius: 6,
		elevation: 4,
	},
	moviePoster: { width: "100%", height: 200, backgroundColor: "#333" },
	ratingBadge: {
		position: "absolute",
		top: 10,
		left: 10,
		backgroundColor: "rgba(0, 0, 0, 0.75)",
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: 8,
		paddingVertical: 4,
		borderRadius: 20,
		gap: 4,
	},
	ratingText: { color: "#ffffff", fontSize: 11, fontWeight: "bold" },
	movieInfo: { padding: 12 },
	movieTitle: { fontSize: 14, fontWeight: "bold", marginBottom: 4 },
	movieMeta: { fontSize: 11 },
	horizontalMovieCard: {
		flexDirection: "row",
		marginHorizontal: 20,
		marginBottom: 12,
		borderRadius: 16,
		overflow: "hidden",
		padding: 12,
		alignItems: "center",
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.05,
		shadowRadius: 4,
		elevation: 2,
	},
	horizontalPoster: {
		width: 70,
		height: 90,
		borderRadius: 8,
		backgroundColor: "#333",
	},
	horizontalMovieInfo: { flex: 1, marginLeft: 16, justifyContent: "center" },
	movieGenre: {
		fontSize: 12,
		fontWeight: "500",
		marginBottom: 6,
		marginTop: 2,
	},
	metaRow: { flexDirection: "row", alignItems: "center", gap: 4 },
	horizontalMetaText: { fontSize: 11, fontWeight: "500" },
	metaSeparator: {
		width: 4,
		height: 4,
		borderRadius: 2,
		backgroundColor: "#9ca3af",
		marginHorizontal: 4,
	},
	playButton: {
		width: 36,
		height: 36,
		borderRadius: 18,
		justifyContent: "center",
		alignItems: "center",
		marginLeft: 10,
	},
});
