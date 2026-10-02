import TVPressable from "@components/common/TVPressable";
import React, { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useThemeContext } from "@context/ThemeContext";

/**
 * OverviewSection – Mockup tasarımdaki kırmızı sol-çizgili card tasarımı.
 * Başlıkta "Özet" ve yanında kırmızı accent bar, genişletilebilir açıklama metni.
 */
export default function OverviewSection({ content }) {
	const { colors, theme } = useThemeContext();
	const [expanded, setExpanded] = useState(false);

	if (!content.overview) return null;

	const shouldShowExpandButton = content.overview.length > 180;

	const surfaceBg = theme === "dark" ? "#161B24" : "#ffffff";
	const surfaceBorder = theme === "dark" ? "#232A36" : "#E2E8F0";

	return (
		<View style={styles.container}>
			{/* Section Title with red accent bar */}
			<View style={styles.titleRow}>
				<View style={styles.accentBar} />
				<Text style={[styles.sectionTitle, { color: colors.text }]}>
					Özet
				</Text>
			</View>

			{/* Overview Card */}
			<View
				style={[
					styles.card,
					{
						backgroundColor: surfaceBg,
						borderColor: surfaceBorder,
					},
				]}>
				<Text
					style={[styles.overview, { color: colors.textSecondary }]}
					numberOfLines={expanded ? undefined : 4}>
					{content.overview}
				</Text>

				{shouldShowExpandButton && (
					<TVPressable
						onPress={() => setExpanded(!expanded)}
						activeOpacity={0.7}
						style={({ focused }) => [
							styles.expandRow,
							focused && styles.expandRowFocused,
						]}>
						<Text
							style={[
								styles.expandButton,
								{ color: colors.primary },
							]}>
							{expanded
								? "Daha Az Göster ▴"
								: "Devamını Oku ▾"}
						</Text>
					</TVPressable>
				)}
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		marginBottom: 20,
	},
	titleRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		marginBottom: 12,
	},
	accentBar: {
		width: 4,
		height: 22,
		borderRadius: 2,
		backgroundColor: "#E50914",
	},
	sectionTitle: {
		fontSize: 18,
		fontWeight: "700",
		letterSpacing: -0.2,
	},
	card: {
		borderRadius: 16,
		borderWidth: 1,
		padding: 16,
	},
	overview: {
		fontSize: 14,
		lineHeight: 22,
	},
	expandRow: {
		marginTop: 8,
		alignSelf: "flex-start",
	},
	expandButton: {
		fontSize: 13,
		fontWeight: "700",
	},
	expandRowFocused: {
		borderWidth: 1,
		borderColor: "#E50914",
		borderRadius: 6,
		paddingHorizontal: 6,
		paddingVertical: 2,
	},
});
