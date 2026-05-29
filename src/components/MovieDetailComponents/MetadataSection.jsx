import { useThemeContext } from "@context/ThemeContext";
import { Ionicons } from "@expo/vector-icons";
import {
	formatContentType,
	formatRating,
	formatRuntime,
	formatStatus,
	formatVoteCount,
	formatYear,
	getCountryFlag,
} from "@utils/formatters";
import { ScrollView, StyleSheet, Text, View } from "react-native";

export default function MetadataSection({ content }) {
	const { colors } = useThemeContext();

	const metadata = [
		{
			icon: "star",
			value: content.rating ? `${formatRating(content.rating)}/10` : null,
			subValue: content.vote_count
				? `(${formatVoteCount(content.vote_count)} oy)`
				: null,
			color: "#F5C518",
		},
		{
			icon: "time-outline",
			value: formatRuntime(content.runtime_minutes),
			color: colors.primary,
		},
		{
			icon: "calendar-outline",
			value: formatYear(content.release_date),
			color: colors.primary,
		},
		{
			icon: "flag-outline",
			value: content.country
				? `${getCountryFlag(content.country)} ${content.country}`
				: null,
			color: colors.primary,
		},
		{
			icon: "shield-outline",
			value: content.age_rating,
			color: colors.primary,
		},
		{
			icon: "film-outline",
			value: formatContentType(content.content_type),
			color: colors.primary,
		},
		{
			icon: "information-circle-outline",
			value: formatStatus(content.status),
			color: colors.primary,
		},
	].filter((item) => item.value && item.value !== "N/A");

	return (
		<View style={styles.container}>
			<ScrollView
				horizontal
				showsHorizontalScrollIndicator={false}
				contentContainerStyle={styles.scrollContent}>
				{metadata.map((item, index) => (
					<View
						key={index}
						style={[
							styles.badge,
							{
								backgroundColor: colors.cardBg,
								borderColor: colors.border,
							},
						]}>
						<Ionicons
							name={item.icon}
							size={14}
							color={item.color}
						/>
						<Text
							style={[styles.badgeText, { color: colors.text }]}>
							{item.value}
						</Text>
						{item.subValue && (
							<Text
								style={[
									styles.badgeSubText,
									{ color: colors.textSecondary },
								]}>
								{item.subValue}
							</Text>
						)}
					</View>
				))}
			</ScrollView>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		marginBottom: 20,
	},
	scrollContent: {
		gap: 8,
		paddingRight: 20,
	},
	badge: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		paddingHorizontal: 12,
		paddingVertical: 8,
		borderRadius: 8,
		borderWidth: 1,
	},
	badgeText: {
		fontSize: 13,
		fontWeight: "600",
	},
	badgeSubText: {
		fontSize: 11,
		fontWeight: "500",
	},
});
