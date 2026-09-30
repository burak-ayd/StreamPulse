import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Linking } from "react-native";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useThemeContext } from "@context/ThemeContext";
import * as WebBrowser from "expo-web-browser";

export default function TrailerSection({ trailerUrl }) {
	const { colors, theme } = useThemeContext();

	if (!trailerUrl) return null;

	const handleOpenTrailer = async () => {
		try {
			await WebBrowser.openBrowserAsync(trailerUrl);
		} catch (error) {
			console.error("Error opening trailer:", error);
			Linking.openURL(trailerUrl);
		}
	};

	return (
		<TouchableOpacity
			style={[
				styles.trailerPill,
				{
					backgroundColor:
						theme === "dark" ? "#1A1A1A" : colors.cardBg,
					borderColor:
						theme === "dark" ? "#2B2B2B" : colors.border,
				},
			]}
			onPress={handleOpenTrailer}
			activeOpacity={0.8}>
			<View style={[styles.iconWrapper, { backgroundColor: colors.primary }]}>
				<Ionicons name="play" size={14} color="#ffffff" />
			</View>

			<View style={styles.textContainer}>
				<Text
					style={[styles.trailerTitle, { color: colors.text }]}
					numberOfLines={1}>
					Resmi Fragmanı İzle
				</Text>
			</View>

			<View
				style={[
					styles.badge,
					{
						backgroundColor:
							theme === "dark" ? "#241416" : "#fee2e2",
						borderColor: colors.primary,
					},
				]}>
				<Text style={[styles.badgeText, { color: colors.primary }]}>
					HD
				</Text>
			</View>

			<Ionicons
				name="chevron-forward"
				size={16}
				color={colors.textSecondary}
			/>
		</TouchableOpacity>
	);
}

const styles = StyleSheet.create({
	trailerPill: {
		flexDirection: "row",
		alignItems: "center",
		paddingVertical: 10,
		paddingHorizontal: 14,
		borderRadius: 12,
		borderWidth: 1,
		marginBottom: 16,
		gap: 10,
	},
	iconWrapper: {
		width: 26,
		height: 26,
		borderRadius: 13,
		justifyContent: "center",
		alignItems: "center",
	},
	textContainer: {
		flex: 1,
	},
	trailerTitle: {
		fontSize: 13,
		fontWeight: "600",
	},
	badge: {
		paddingHorizontal: 6,
		paddingVertical: 2,
		borderRadius: 4,
		borderWidth: StyleSheet.hairlineWidth,
	},
	badgeText: {
		fontSize: 10,
		fontWeight: "800",
	},
});
