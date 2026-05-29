import { WATCH_HISTORY } from "@constants/data";
import { useThemeContext } from "@context/ThemeContext";
import { MaterialIcons } from "@expo/vector-icons";
import { supabase } from "@utils/supabase";
import { Stack, useRouter } from "expo-router";
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
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const { width } = Dimensions.get("window");

export default function ProfileScreen() {
	const { theme, colors, toggleTheme } = useThemeContext();

	const router = useRouter();
	const [userEmail, setUserEmail] = useState("");
	const [userName, setUserName] = useState("");
	const [userDisplayName, setUserDisplayName] = useState("");
	const [userAvatarUrl, setUserAvatarUrl] = useState("");
	const [activeTab, setActiveTab] = useState("history");

	useEffect(() => {
		supabase.auth.getSession().then(async ({ data: { session } }) => {
			if (!session) return;
			setUserEmail(session.user.email ?? "");

			const { data } = await supabase
				.from("profiles")
				.select("*")
				.eq("id", session.user.id);

			const { data: urlData } = await supabase.storage
				.from("avatars")
				.createSignedUrl(
					data[0].avatar_url.replace("/avatars/", ""),
					3600,
				);

			if (data && data[0]) {
				setUserName(data[0].username ?? "");
				setUserDisplayName(data[0].display_name ?? "");
				setUserAvatarUrl(urlData?.signedUrl ?? "");
				// Signed URL için path'i doğru çıkar
				const avatarPath = data[0].avatar_url.split("/avatars/")[1];
				if (avatarPath) {
					const { data: urlData, error } = await supabase.storage
						.from("avatars")
						.createSignedUrl(avatarPath, 3600);

					if (!error && urlData?.signedUrl) {
						setUserAvatarUrl(urlData.signedUrl);
					} else {
						console.log("signedUrl error:", error);
					}
				}
			}
		});
	}, []);

	const handleBack = () => {
		router.back();
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

				{/* Top App Bar */}
				<View
					style={[
						styles.topBar,
						{
							borderBottomColor: colors.border,
							backgroundColor: colors.bg,
						},
					]}>
					<TouchableOpacity
						onPress={handleBack}
						style={styles.backButton}>
						<MaterialIcons
							name="arrow-back"
							size={28}
							color={colors.text}
						/>
					</TouchableOpacity>
					<Text style={[styles.topBarTitle, { color: colors.text }]}>
						Profile
					</Text>
					{/* <TouchableOpacity
						onPress={toggleTheme}
						style={styles.settingsButton}>
						<MaterialIcons
							name={theme === "dark" ? "light-mode" : "dark-mode"}
							size={24}
							color={colors.text}
						/>
					</TouchableOpacity> */}
					{/* Settings */}
					<TouchableOpacity
						onPress={() => router.push("/settings")}
						style={styles.settingsButton}>
						<MaterialIcons
							name="settings"
							size={24}
							color={colors.text}
						/>
					</TouchableOpacity>
				</View>

				<ScrollView
					showsVerticalScrollIndicator={false}
					contentContainerStyle={styles.scrollContainer}>
					{/* Profile Header */}
					<View style={styles.profileHeader}>
						{/* Avatar */}
						{userAvatarUrl ? (
							<Image
								source={{
									uri: userAvatarUrl,
								}}
								style={styles.avatar}
							/>
						) : (
							<View
								style={[
									styles.avatar,
									{ backgroundColor: colors.primary },
								]}>
								<Text style={styles.avatarText}>
									{(userEmail.charAt(0) || "U").toUpperCase()}
								</Text>
							</View>
						)}

						{/* Name and Username */}
						<Text style={[styles.userName, { color: colors.text }]}>
							{userDisplayName ||
								userEmail.split("@")[0] ||
								"User"}
						</Text>
						<Text
							style={[
								styles.userHandle,
								{ color: colors.textSecondary },
							]}>
							@
							{(
								userName ||
								userEmail.split("@")[0] ||
								"user"
							).toLowerCase()}
						</Text>
					</View>

					{/* Stats Component */}
					<View style={styles.statsContainer}>
						<View
							style={[
								styles.statCard,
								{ backgroundColor: colors.cardBg },
							]}>
							<Text
								style={[
									styles.statNumber,
									{ color: colors.text },
								]}>
								128
							</Text>
							<Text
								style={[
									styles.statLabel,
									{ color: colors.textSecondary },
								]}>
								Filmler
							</Text>
						</View>
						<View
							style={[
								styles.statCard,
								{ backgroundColor: colors.cardBg },
							]}>
							<Text
								style={[
									styles.statNumber,
									{ color: colors.text },
								]}>
								34
							</Text>
							<Text
								style={[
									styles.statLabel,
									{ color: colors.textSecondary },
								]}>
								Diziler
							</Text>
						</View>
						<View
							style={[
								styles.statCard,
								{ backgroundColor: colors.cardBg },
							]}>
							<Text
								style={[
									styles.statNumber,
									{ color: colors.text },
								]}>
								750
							</Text>
							<Text
								style={[
									styles.statLabel,
									{ color: colors.textSecondary },
								]}>
								Saat
							</Text>
						</View>
					</View>

					{/* Tabs */}
					<View
						style={[
							styles.tabsContainer,
							{ borderBottomColor: colors.border },
						]}>
						<TouchableOpacity
							onPress={() => setActiveTab("history")}
							style={[
								styles.tab,
								{
									borderBottomColor:
										activeTab === "history"
											? colors.primary
											: "transparent",
								},
							]}>
							<Text
								style={[
									styles.tabText,
									{
										color:
											activeTab === "history"
												? colors.primary
												: colors.textSecondary,
										fontWeight:
											activeTab === "history"
												? "bold"
												: "600",
									},
								]}>
								İzleme Geçmişi
							</Text>
						</TouchableOpacity>
						<TouchableOpacity
							onPress={() => setActiveTab("favorites")}
							style={[
								styles.tab,
								{
									borderBottomColor:
										activeTab === "favorites"
											? colors.primary
											: "transparent",
								},
							]}>
							<Text
								style={[
									styles.tabText,
									{
										color:
											activeTab === "favorites"
												? colors.primary
												: colors.textSecondary,
										fontWeight:
											activeTab === "favorites"
												? "bold"
												: "600",
									},
								]}>
								Favoriler
							</Text>
						</TouchableOpacity>
					</View>

					{/* Image Grid */}
					<View style={styles.gridContainer}>
						<FlatList
							data={WATCH_HISTORY}
							keyExtractor={(item) => item.id}
							numColumns={3}
							scrollEnabled={false}
							columnWrapperStyle={styles.gridRow}
							renderItem={({ item }) => (
								<TouchableOpacity
									style={[
										styles.gridItem,
										{ backgroundColor: colors.cardBg },
									]}
									activeOpacity={0.8}>
									<Image
										source={{ uri: item.image }}
										style={styles.gridImage}
									/>
								</TouchableOpacity>
							)}
						/>
					</View>
				</ScrollView>
			</SafeAreaView>
		</>
	);
}

const styles = StyleSheet.create({
	safeArea: {
		flex: 1,
	},
	topBar: {
		height: 60,
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		paddingHorizontal: 16,
		borderBottomWidth: 1,
	},
	backButton: {
		width: 48,
		height: 48,
		justifyContent: "center",
		alignItems: "center",
	},
	topBarTitle: {
		flex: 1,
		fontSize: 18,
		fontWeight: "bold",
		textAlign: "center",
		letterSpacing: -0.015,
	},
	settingsButton: {
		width: 48,
		height: 48,
		justifyContent: "center",
		alignItems: "center",
	},
	scrollContainer: {
		paddingBottom: 40,
	},
	profileHeader: {
		alignItems: "center",
		paddingVertical: 32,
		paddingHorizontal: 16,
	},
	avatar: {
		width: 128,
		height: 128,
		borderRadius: 64,
		justifyContent: "center",
		alignItems: "center",
		marginBottom: 16,
	},
	avatarText: {
		color: "#ffffff",
		fontSize: 48,
		fontWeight: "bold",
	},
	userName: {
		fontSize: 22,
		fontWeight: "bold",
		marginBottom: 4,
		letterSpacing: -0.015,
	},
	userHandle: {
		fontSize: 16,
		fontWeight: "400",
		marginBottom: 16,
	},
	editButton: {
		width: "100%",
		height: 40,
		borderRadius: 8,
		justifyContent: "center",
		alignItems: "center",
		borderWidth: 1,
		marginTop: 8,
	},
	editButtonText: {
		fontSize: 14,
		fontWeight: "bold",
		letterSpacing: 0.015,
	},
	statsContainer: {
		flexDirection: "row",
		paddingHorizontal: 16,
		gap: 12,
		marginBottom: 24,
	},
	statCard: {
		flex: 1,
		borderRadius: 12,
		padding: 16,
		alignItems: "center",
		justifyContent: "center",
	},
	statNumber: {
		fontSize: 24,
		fontWeight: "bold",
		marginBottom: 4,
	},
	statLabel: {
		fontSize: 12,
		fontWeight: "500",
	},
	tabsContainer: {
		flexDirection: "row",
		borderBottomWidth: 1,
		paddingHorizontal: 16,
		marginBottom: 16,
	},
	tab: {
		flex: 1,
		paddingVertical: 16,
		borderBottomWidth: 3,
		alignItems: "center",
	},
	tabText: {
		fontSize: 14,
		letterSpacing: 0.015,
	},
	gridContainer: {
		paddingHorizontal: 16,
		paddingBottom: 20,
	},
	gridRow: {
		justifyContent: "space-between",
		marginBottom: 12,
	},
	gridItem: {
		width: (width - 48) / 3,
		aspectRatio: 3 / 4,
		borderRadius: 8,
		overflow: "hidden",
	},
	gridImage: {
		width: "100%",
		height: "100%",
	},
});
