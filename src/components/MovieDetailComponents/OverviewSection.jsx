import TVPressable from "@components/common/TVPressable";
import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useThemeContext } from "@context/ThemeContext";
import { useTvMetrics } from "@/utils/tvMetrics";

/**
 * OverviewSection – Mockup tasarımdaki kırmızı sol-çizgili card tasarımı.
 * Başlıkta "Özet" ve yanında kırmızı accent bar, genişletilebilir açıklama metni.
 */
export default function OverviewSection({ content }) {
	const { colors, theme } = useThemeContext();
	const { sp, textMaxWidth, focusScale } = useTvMetrics();
	const [expanded, setExpanded] = useState(false);

	if (!content.overview) return null;

	/**
	 * TV'de özet metni ekranın tamamına yayılıyordu (1920px ≈ 200
	 * karakterlik satır) — okunmuyordu. `textMaxWidth` satır uzunluğunu
	 * insanın rahat okuyabildiği aralıkta tutar; telefon etkilenmez
	 * (`textMaxWidth === undefined`).
	 */
	const shouldShowExpandButton = content.overview.length > 180;

	const surfaceBg = theme === "dark" ? "#161B24" : "#ffffff";
	const surfaceBorder = theme === "dark" ? "#232A36" : "#E2E8F0";

	return (
		<View style={[styles.container, { marginBottom: sp(24) }]}>
			{/* Section Title with red accent bar */}
			<View
				style={[styles.titleRow, { gap: sp(12), marginBottom: sp(14) }]}>
				<View
					style={[
						styles.accentBar,
						{ width: sp(5), height: sp(26), borderRadius: sp(3) },
					]}
				/>
				<Text
					style={[
						styles.sectionTitle,
						{ color: colors.text, fontSize: sp(21) },
					]}>
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
						padding: sp(20),
						borderRadius: sp(18),
					},
				]}>
				<Text
					style={[
						styles.overview,
						{
							color: colors.textSecondary,
							fontSize: sp(16),
							lineHeight: sp(25),
							maxWidth: textMaxWidth,
						},
					]}
					numberOfLines={expanded ? undefined : 4}>
					{content.overview}
				</Text>

				{shouldShowExpandButton && (
					<TVPressable
						onPress={() => setExpanded(!expanded)}
						activeOpacity={0.7}
						style={({ focused }) => [
							styles.expandRow,
							{ marginTop: sp(12), paddingHorizontal: sp(10), paddingVertical: sp(6) },
							focused && {
								borderWidth: 2,
								borderColor: "#E50914",
								borderRadius: sp(10),
								backgroundColor: "rgba(229, 9, 20, 0.15)",
								transform: [{ scale: focusScale }],
							},
						]}>
						<Text
							style={[
								styles.expandButton,
								{ color: colors.primary, fontSize: sp(15) },
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
	container: {},
	titleRow: {
		flexDirection: "row",
		alignItems: "center",
	},
	accentBar: {
		backgroundColor: "#E50914",
	},
	sectionTitle: {
		fontWeight: "700",
		letterSpacing: -0.2,
	},
	card: {
		borderWidth: 1,
	},
	overview: {},
	expandRow: {
		alignSelf: "flex-start",
	},
	expandButton: {
		fontWeight: "700",
	},
});
