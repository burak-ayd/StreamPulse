/**
 * Satır sonu kutusunu işaretleyen özel değer.
 *
 * ⚠️ Neden `Symbol` ve neden bir dize DEĞİL: satırdaki gerçek
 * içerikler `contentKey` ile anahtarlanıyor ve bazı eklentiler başlığı
 * boş/işaretli gelebiliyor. `Symbol` hiçbir içerikle eşleşemez.
 */
const SEE_ALL_SENTINEL = Symbol("see-all");

import TVPressable from "@/components/common/TVPressable";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { FontFamily, Palette } from "@/constants/theme";
import { StyleSheet, Text, View } from "react-native";

/**
 * Satır sonu "Tümünü İncele" kutusu (sorun 1).
 * Netflix/Prime Video tarzı satır sonu navigasyon butonu.
 */
function SeeAllTile({ onPress }) {
	return (
		<TVPressable
			onPress={onPress}
			style={styles.seeAllTile}
			focusedStyle={styles.seeAllTileFocused}
			accessibilityLabel="Kategorinin tümünü göster">
			<View style={styles.seeAllIconWrap}>
				<Ionicons name="arrow-forward" size={20} color={Palette.primary} />
			</View>
			<Text style={styles.seeAllText} numberOfLines={2}>
				Tümünü İncele
			</Text>
		</TVPressable>
	);
}

const styles = StyleSheet.create({
	seeAllTile: {
		width: 144,
		height: 144 / (2 / 3) + 8 + 20 + 2 + 16,
		borderRadius: 12,
		borderWidth: 1,
		borderColor: "transparent",
		backgroundColor: "#2D2C2F",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		paddingHorizontal: 12,
	},
	seeAllTileFocused: {
		borderColor: Palette.primary,
		borderWidth: 3,
	},
	seeAllIconWrap: {
		width: 40,
		height: 40,
		borderRadius: 20,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "rgba(192, 193, 255, 0.1)",
	},
	seeAllText: {
		color: "#FFFFFF",
		fontFamily: "Inter-Medium",
		fontSize: 13,
		lineHeight: 18,
		textAlign: "center",
	},
});

export { SEE_ALL_SENTINEL, SeeAllTile };