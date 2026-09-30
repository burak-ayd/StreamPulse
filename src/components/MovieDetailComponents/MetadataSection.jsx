import { useThemeContext } from "@context/ThemeContext";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import {
	formatContentType,
	formatRating,
	formatRuntime,
	formatStatus,
	formatVoteCount,
	formatYear,
	getCountryFlag,
} from "@utils/formatters";
import { StyleSheet, Text, View } from "react-native";

/**
 * MetadataSection – Mockup tasarımındaki hap (pill) şeklinde meta bilgiler.
 * Süre, Yıl, Yaş sınırı, Kalite, Durum gibi bilgileri küçük kutucuklar halinde gösterir.
 */
export default function MetadataSection({ content }) {
	const { colors, theme } = useThemeContext();

	const pills = [
		{
			icon: "time-outline",
			value: formatRuntime(content.runtime_minutes),
			iconColor: "#E50914",
		},
		{
			icon: "calendar-outline",
			value: formatYear(content.release_date),
			iconColor: colors.textSecondary,
		},
		{
			value: content.age_rating,
			isAgeRating: true,
		},
		{
			value: content.country
				? (() => {
						const flag = getCountryFlag(content.country);
						return flag ? `${flag} ${content.country}` : content.country;
				  })()
				: null,
		},
		{
			value: formatContentType(content.content_type),
		},
		{
			value: formatStatus(content.status),
			isStatus: content.status === "Yayınlandı" || content.status === "Returning Series",
		},
	].filter((item) => item.value && item.value !== "N/A");

	return (
		<View style={styles.container}>
			<View style={styles.pillsRow}>
				{pills.map((item, index) => (
					<View
						key={index}
						style={[
							styles.pill,
							{
								backgroundColor:
									theme === "dark"
										? "#161B24"
										: "#ffffff",
								borderColor:
									theme === "dark"
										? "#232A36"
										: "#E2E8F0",
							},
							item.isAgeRating && styles.ageRatingPill,
							item.isStatus && styles.statusPill,
						]}>
						{item.icon && (
							<Ionicons
								name={item.icon}
								size={14}
								color={item.iconColor || colors.textSecondary}
							/>
						)}
						{item.isStatus && (
							<View style={styles.statusDot} />
						)}
						<Text
							style={[
								styles.pillText,
								{
									color: item.isAgeRating
										? "#fb7185"
										: item.isStatus
											? "#34d399"
											: colors.textSecondary,
								},
								item.isAgeRating && styles.ageRatingText,
							]}>
							{item.value}
						</Text>
					</View>
				))}
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		marginBottom: 16,
	},
	pillsRow: {
		flexDirection: "row",
		flexWrap: "wrap",
		alignItems: "center",
		gap: 8,
	},
	pill: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		paddingHorizontal: 10,
		paddingVertical: 6,
		borderRadius: 10,
		borderWidth: 1,
	},
	pillText: {
		fontSize: 12,
		fontWeight: "600",
	},
	ageRatingPill: {},
	ageRatingText: {
		fontWeight: "700",
	},
	statusPill: {
		backgroundColor: "rgba(52,211,153,0.1)",
		borderColor: "rgba(52,211,153,0.2)",
	},
	statusDot: {
		width: 6,
		height: 6,
		borderRadius: 3,
		backgroundColor: "#34d399",
	},
});
