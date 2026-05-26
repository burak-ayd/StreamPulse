import { MaterialIcons } from "@expo/vector-icons";
import { supabase } from "@utils/supabase";
import { Stack } from "expo-router";
import { useEffect, useState } from "react";
import {
	Dimensions,
	FlatList,
	Image,
	ScrollView,
	StatusBar,
	StyleSheet,
	Text,
	TouchableOpacity,
	useColorScheme,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import "react-native-url-polyfill/auto";

const { width } = Dimensions.get("window");

const POPULAR_MOVIES = [
	{
		id: "1",
		title: "Interstellar",
		genre: "Bilim Kurgu / Drama",
		rating: "8.7",
		duration: "2sa 49dk",
		image: "https://images.unsplash.com/photo-1534447677768-be436bb09401?w=800&auto=format&fit=crop&q=60",
	},
	{
		id: "2",
		title: "Inception",
		genre: "Aksiyon / Bilim Kurgu",
		rating: "8.8",
		duration: "2sa 28dk",
		image: "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=800&auto=format&fit=crop&q=60",
	},
	{
		id: "3",
		title: "The Dark Knight",
		genre: "Aksiyon / Suç",
		rating: "9.0",
		duration: "2sa 32dk",
		image: "https://images.unsplash.com/photo-1509281373149-e957c6296406?w=800&auto=format&fit=crop&q=60",
	},
	{
		id: "4",
		title: "Avatar: The Way of Water",
		genre: "Macera / Fantezi",
		rating: "7.6",
		duration: "3sa 12dk",
		image: "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=800&auto=format&fit=crop&q=60",
	},
];

const RECOMMENDED_MOVIES = [
	{
		id: "5",
		title: "Dune: Part Two",
		genre: "Macera / Bilim Kurgu",
		rating: "8.9",
		duration: "2sa 46dk",
		image: "https://images.unsplash.com/photo-1478760329108-5c3ed9d495a0?w=800&auto=format&fit=crop&q=60",
	},
	{
		id: "6",
		title: "Oppenheimer",
		genre: "Biyografi / Drama",
		rating: "8.4",
		duration: "3sa",
		image: "https://images.unsplash.com/photo-1440404653325-ab127d49abc1?w=800&auto=format&fit=crop&q=60",
	},
	{
		id: "7",
		title: "Spider-Man: Across the Spider-Verse",
		genre: "Animasyon / Macera",
		rating: "8.6",
		duration: "2sa 20dk",
		image: "https://images.unsplash.com/photo-1626814026160-2237a95fc5a0?w=800&auto=format&fit=crop&q=60",
	},
];

export default function Index() {
	const systemColorScheme = useColorScheme();
	const [userEmail, setUserEmail] = useState("");
	const [userName, setUserName] = useState("");
	const [userAvatarUrl, setUserAvatarUrl] = useState("");
	const [theme, setTheme] = useState(systemColorScheme || "dark");
	console.log("6-Index Render Edildi");
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

	const toggleTheme = () => {
		setTheme((prev) => (prev === "dark" ? "light" : "dark"));
	};

	const colors = {
		primary: "#ea2a33",
		bg: theme === "dark" ? "#121212" : "#f8f6f6",
		cardBg: theme === "dark" ? "#1A1A1A" : "#ffffff",
		text: theme === "dark" ? "#ffffff" : "#111827",
		textSecondary: theme === "dark" ? "#9ca3af" : "#4b5563",
		border: theme === "dark" ? "#374151" : "#d1d5db",
	};

	return (
		<>
			<Stack.Screen options={{ headerShown: false }} />
			<SafeAreaView
				edges={["top", "left", "right"]}
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
						<TouchableOpacity
							style={[
								styles.headerIconBtn,
								{
									backgroundColor: colors.cardBg,
									borderColor: colors.border,
								},
							]}
							onPress={toggleTheme}>
							<MaterialIcons
								name={
									theme === "dark"
										? "light-mode"
										: "dark-mode"
								}
								size={18}
								color={colors.text}
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
							onPress={handleLogout}>
							<MaterialIcons
								name="logout"
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
					<View
						style={[
							styles.welcomeBanner,
							{ backgroundColor: colors.cardBg },
						]}>
						<View>
							<Text
								style={[
									styles.welcomeSub,
									{ color: colors.textSecondary },
								]}>
								Tekrar hoş geldin,
							</Text>
							<Text
								style={[
									styles.welcomeTitle,
									{ color: colors.text },
								]}
								numberOfLines={1}>
								{userName ||
									userEmail.split("@")[0] ||
									"Sinefil"}
							</Text>
						</View>
						{userAvatarUrl ? (
							<Image
								source={{ uri: userAvatarUrl }}
								style={styles.avatar}
							/>
						) : (
							<View
								style={[
									styles.avatar,
									{ backgroundColor: colors.primary },
								]}>
								<Text style={styles.avatarText}>
									{(userEmail.charAt(0) || "S").toUpperCase()}
								</Text>
							</View>
						)}
					</View>

					{/* Popular Movies */}
					<View style={styles.sectionContainer}>
						<View style={styles.sectionHeader}>
							<Text
								style={[
									styles.sectionTitle,
									{ color: colors.text },
								]}>
								Popüler Filmler
							</Text>
							<TouchableOpacity>
								<Text
									style={[
										styles.seeAll,
										{ color: colors.primary },
									]}>
									Tümünü Gör
								</Text>
							</TouchableOpacity>
						</View>

						<FlatList
							data={POPULAR_MOVIES}
							keyExtractor={(item) => item.id}
							horizontal
							showsHorizontalScrollIndicator={false}
							contentContainerStyle={styles.horizontalList}
							renderItem={({ item }) => (
								<TouchableOpacity
									style={[
										styles.movieCard,
										{ backgroundColor: colors.cardBg },
									]}
									activeOpacity={0.9}>
									<Image
										source={{ uri: item.image }}
										style={styles.moviePoster}
									/>
									<View style={styles.ratingBadge}>
										<MaterialIcons
											name="star"
											size={14}
											color="#FFD700"
										/>
										<Text style={styles.ratingText}>
											{item.rating}
										</Text>
									</View>
									<View style={styles.movieInfo}>
										<Text
											style={[
												styles.movieTitle,
												{ color: colors.text },
											]}
											numberOfLines={1}>
											{item.title}
										</Text>
										<Text
											style={[
												styles.movieMeta,
												{ color: colors.textSecondary },
											]}>
											{item.duration} •{" "}
											{item.genre.split(" / ")[0]}
										</Text>
									</View>
								</TouchableOpacity>
							)}
						/>
					</View>

					{/* Recommended Section */}
					<View style={styles.sectionContainer}>
						<View style={styles.sectionHeader}>
							<Text
								style={[
									styles.sectionTitle,
									{ color: colors.text },
								]}>
								Senin İçin Seçilenler
							</Text>
							<TouchableOpacity>
								<Text
									style={[
										styles.seeAll,
										{ color: colors.primary },
									]}>
									Tümünü Gör
								</Text>
							</TouchableOpacity>
						</View>

						{RECOMMENDED_MOVIES.map((item) => (
							<TouchableOpacity
								key={item.id}
								style={[
									styles.horizontalMovieCard,
									{ backgroundColor: colors.cardBg },
								]}
								activeOpacity={0.8}>
								<Image
									source={{ uri: item.image }}
									style={styles.horizontalPoster}
								/>
								<View style={styles.horizontalMovieInfo}>
									<Text
										style={[
											styles.movieTitle,
											{ color: colors.text },
										]}
										numberOfLines={1}>
										{item.title}
									</Text>
									<Text
										style={[
											styles.movieGenre,
											{ color: colors.primary },
										]}>
										{item.genre}
									</Text>
									<View style={styles.metaRow}>
										<MaterialIcons
											name="schedule"
											size={14}
											color={colors.textSecondary}
										/>
										<Text
											style={[
												styles.horizontalMetaText,
												{ color: colors.textSecondary },
											]}>
											{item.duration}
										</Text>
										<View style={styles.metaSeparator} />
										<MaterialIcons
											name="star"
											size={14}
											color="#FFD700"
										/>
										<Text
											style={[
												styles.horizontalMetaText,
												{ color: colors.text },
											]}>
											{item.rating}
										</Text>
									</View>
								</View>
								<TouchableOpacity
									style={[
										styles.playButton,
										{ backgroundColor: colors.primary },
									]}>
									<MaterialIcons
										name="play-arrow"
										size={20}
										color="#ffffff"
									/>
								</TouchableOpacity>
							</TouchableOpacity>
						))}
					</View>
				</ScrollView>
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
	welcomeBanner: {
		margin: 20,
		padding: 20,
		borderRadius: 16,
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.05,
		shadowRadius: 8,
		elevation: 3,
	},
	welcomeSub: { fontSize: 14, fontWeight: "500", marginBottom: 4 },
	welcomeTitle: { fontSize: 22, fontWeight: "bold", maxWidth: width * 0.55 },
	avatar: {
		width: 48,
		height: 48,
		borderRadius: 24,
		justifyContent: "center",
		alignItems: "center",
	},
	avatarText: { color: "#ffffff", fontSize: 18, fontWeight: "bold" },
	sectionContainer: { marginBottom: 28 },
	sectionHeader: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		paddingHorizontal: 20,
		marginBottom: 16,
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
