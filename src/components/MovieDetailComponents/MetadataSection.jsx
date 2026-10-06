import { useThemeContext } from "@context/ThemeContext";
import { useTvMetrics } from "@/utils/tvMetrics";
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
import { ScrollView, StyleSheet, Text, View } from "react-native";

/**
 * MetadataSection – Mockup tasarımındaki hap (pill) şeklinde meta bilgiler.
 * Süre, Yıl, Yaş sınırı, Kalite, Durum gibi bilgileri küçük kutucuklar halinde gösterir.
 */
export default function MetadataSection({ content }) {
	const { colors, theme } = useThemeContext();
	const { sp, gutter } = useTvMetrics();

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
		<View style={[styles.container, { marginBottom: sp(14) }]}>
			{/*
			 * TV'de haplar TEK SATIRDA yan yana durur.
			 *
			 * `flexWrap: "wrap"` telefon için doğru: dar ekranda alt alta
			 * sarar. TV'de aynı davranış 5–6 hapı 2–3 satıra bölüyor ve
			 * "meta bilgisi" 3 bloklu bir liste gibi görünüyordu. Oysa
			 * bunlar kısa etiketler — hepsi tek satıra sığar.
			 *
			 * `overflow: "scroll"` yedek güvence: 4K dışında beklenmedik
			 * bir eklenti 20 rozet döndürürse satır yatay kaydırılabilir,
			 * taşma yapmaz.
			 */}
			<ScrollView
				horizontal
				showsHorizontalScrollIndicator={false}
				style={styles.pillsScroll}
				contentContainerStyle={[
					styles.pillsRow,
					{ gap: sp(8), paddingRight: gutter },
				]}>
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
								paddingHorizontal: sp(11),
								paddingVertical: sp(7),
								borderRadius: sp(10),
								gap: sp(5),
							},
							item.isAgeRating && styles.ageRatingPill,
							item.isStatus && styles.statusPill,
						]}>
						{item.icon && (
							<Ionicons
								name={item.icon}
								size={sp(15)}
								color={item.iconColor || colors.textSecondary}
							/>
						)}
						{item.isStatus && (
							<View
								style={[
									styles.statusDot,
									{
										width: sp(7),
										height: sp(7),
										borderRadius: sp(4),
									},
								]}
							/>
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
									fontSize: sp(13),
								},
								item.isAgeRating && styles.ageRatingText,
							]}>
							{item.value}
						</Text>
					</View>
				))}
			</ScrollView>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {},
	/** Yatay kaydırma yalnızca TV'de devreye girer (telefonda `flexWrap` yeter). */
	pillsScroll: {
		flexGrow: 0,
	},
	pillsRow: {
		flexDirection: "row",
		flexWrap: "wrap",
		alignItems: "center",
	},
	pill: {
		flexDirection: "row",
		alignItems: "center",
		borderWidth: 1,
	},
	pillText: {
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
		backgroundColor: "#34d399",
	},
});
