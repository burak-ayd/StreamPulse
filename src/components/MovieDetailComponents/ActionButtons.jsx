import { useThemeContext } from "@context/ThemeContext";
import { Ionicons } from "@expo/vector-icons";
import {
	Alert,
	Share,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from "react-native";

export default function ActionButtons({ content }) {
	const { colors } = useThemeContext();

	const handleWatch = () => {
		Alert.alert(
			"Şimdi İzle",
			`${content.title} izlemeye başlamak üzeresiniz.`,
			[
				{ text: "İptal", style: "cancel" },
				{ text: "İzle", onPress: () => console.log("Watch pressed") },
			],
		);
	};

	const handleAddToList = () => {
		Alert.alert("Listem", "Bu özellik yakında eklenecek!");
	};

	const handleShare = async () => {
		try {
			await Share.share({
				message: `${content.title}\n\n${content.overview || "Harika bir içerik!"}`,
				title: content.title,
			});
		} catch (error) {
			console.error("Share error:", error);
		}
	};

	const handleFavorite = () => {
		Alert.alert("Favoriler", "Bu özellik yakında eklenecek!");
	};

	return (
		<View style={styles.container}>
			{/* Primary Button - Watch */}
			<TouchableOpacity
				style={[
					styles.primaryButton,
					{ backgroundColor: colors.primary },
				]}
				onPress={handleWatch}
				activeOpacity={0.8}>
				<Ionicons name="play" size={20} color="#ffffff" />
				<Text style={styles.primaryButtonText}>Şimdi İzle</Text>
			</TouchableOpacity>

			{/* Secondary Buttons */}
			<View style={styles.secondaryButtons}>
				<TouchableOpacity
					style={[
						styles.secondaryButton,
						{
							backgroundColor: colors.cardBg,
							borderColor: colors.border,
						},
					]}
					onPress={handleAddToList}
					activeOpacity={0.8}>
					<Ionicons name="add" size={20} color={colors.text} />
					<Text
						style={[
							styles.secondaryButtonText,
							{ color: colors.text },
						]}>
						Listem
					</Text>
				</TouchableOpacity>

				<TouchableOpacity
					style={[
						styles.secondaryButton,
						{
							backgroundColor: colors.cardBg,
							borderColor: colors.border,
						},
					]}
					onPress={handleShare}
					activeOpacity={0.8}>
					<Ionicons
						name="share-social-outline"
						size={20}
						color={colors.text}
					/>
					<Text
						style={[
							styles.secondaryButtonText,
							{ color: colors.text },
						]}>
						Paylaş
					</Text>
				</TouchableOpacity>

				<TouchableOpacity
					style={[
						styles.iconButton,
						{
							backgroundColor: colors.cardBg,
							borderColor: colors.border,
						},
					]}
					onPress={handleFavorite}
					activeOpacity={0.8}>
					<Ionicons
						name="heart-outline"
						size={20}
						color={colors.text}
					/>
				</TouchableOpacity>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		marginBottom: 24,
	},
	primaryButton: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		paddingVertical: 14,
		borderRadius: 12,
		marginBottom: 12,
	},
	primaryButtonText: {
		color: "#ffffff",
		fontSize: 16,
		fontWeight: "700",
	},
	secondaryButtons: {
		flexDirection: "row",
		gap: 8,
	},
	secondaryButton: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 6,
		paddingVertical: 12,
		borderRadius: 12,
		borderWidth: 1,
	},
	secondaryButtonText: {
		fontSize: 14,
		fontWeight: "600",
	},
	iconButton: {
		width: 48,
		height: 48,
		justifyContent: "center",
		alignItems: "center",
		borderRadius: 12,
		borderWidth: 1,
	},
});
