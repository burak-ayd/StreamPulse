import TVPressable from "@components/common/TVPressable";
import { FontFamily, Palette } from "@/constants/theme";
import { useTvMetrics } from "@/utils/tvMetrics";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

/**
 * OverviewSection – "Özet" başlığı + açıklama + "Devamını oku" bağlantısı.
 * Referans tasarımda kart/accent çizgisi yok; metin doğrudan zeminde.
 */
export default function OverviewSection({ content }) {
	const { sp, textMaxWidth } = useTvMetrics();
	const [expanded, setExpanded] = useState(false);

	if (!content.overview) return null;

	const shouldShowExpandButton = content.overview.length > 180;

	return (
		<View style={[styles.container, { marginBottom: sp(24), gap: sp(8) }]}>
			<Text style={[styles.sectionTitle, { fontSize: sp(18) }]}>Özet</Text>

			<Text
				style={[
					styles.overview,
					{
						fontSize: sp(14),
						lineHeight: sp(21),
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
					style={[styles.expandRow, { gap: sp(4) }]}
					focusedStyle={styles.focusRing}>
					<Text style={[styles.expandText, { fontSize: sp(13) }]}>
						{expanded ? "Daha az göster" : "Devamını oku"}
					</Text>
					<Ionicons
						name={expanded ? "chevron-up" : "chevron-down"}
						size={sp(15)}
						color={Palette.primary}
					/>
				</TVPressable>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	container: {},
	sectionTitle: {
		color: Palette.onSurface,
		fontFamily: FontFamily.semiBold,
	},
	overview: {
		color: Palette.onSurfaceVariant,
		fontFamily: FontFamily.regular,
	},
	expandRow: {
		flexDirection: "row",
		alignItems: "center",
		alignSelf: "flex-start",
	},
	expandText: {
		color: Palette.primary,
		fontFamily: FontFamily.semiBold,
	},
	focusRing: {
		borderWidth: 2,
		borderColor: Palette.primary,
		borderRadius: 6,
	},
});
