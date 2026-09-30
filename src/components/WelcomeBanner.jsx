import { Image } from "expo-image";
import { Dimensions, StyleSheet, Text, View } from "react-native";
const width = Dimensions.get("window").width;
const WelcomeBanner = ({ userEmail, userAvatarUrl, userName, colors }) => {
	return (
		<View
			style={[styles.welcomeBanner, { backgroundColor: colors.cardBg }]}>
			<View>
				<Text
					style={[
						styles.welcomeSub,
						{ color: colors.textSecondary },
					]}>
					Tekrar hoş geldin,
				</Text>
				<Text
					style={[styles.welcomeTitle, { color: colors.text }]}
					numberOfLines={1}>
					{userName || userEmail.split("@")[0] || "Sinefil"}
				</Text>
			</View>
			{userAvatarUrl ? (
				<Image
					source={{ uri: userAvatarUrl }}
					style={styles.avatar}
					contentFit="cover"
					transition={150}
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
	);
};

export default WelcomeBanner;

const styles = StyleSheet.create({
	avatar: {
		width: 48,
		height: 48,
		borderRadius: 24,
		overflow: "hidden",
		justifyContent: "center",
		alignItems: "center",
	},
	avatarText: { color: "#ffffff", fontSize: 18, fontWeight: "bold" },
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
});
