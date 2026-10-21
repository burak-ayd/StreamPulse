import { StyleSheet, Text, View } from "react-native";

/**
 * Okunmamış adet rozet noktası — `deger` 0 ise hiç çizilmez.
 *
 * Alt menü çubuğundan taşındı (2026-10-21): bildirim düğmesi artık ana
 * ekran üst kromunda profil simgesinin yanındaki zilde; rozet de orada.
 * TV rayı ikon kutusuna ve telefon başlık düğmesine `pointerEvents:
 * "none"` ile bindirilir; dokunuş bandın kendisine gider.
 *
 * @param {{deger: number}} props
 */
function RozetNokta({ deger }) {
	if (!deger || deger <= 0) return null;
	const metin = deger > 99 ? "99+" : String(deger);
	return (
		<View
			pointerEvents="none"
			style={[
				styles.rozetNokta,
				metin.length > 1 ? styles.rozetNoktaGenis : null,
			]}>
			<Text style={styles.rozetYazi} maxFontSizeMultiplier={1.1}>
				{metin}
			</Text>
		</View>
	);
}

export default RozetNokta;

const styles = StyleSheet.create({
	rozetNokta: {
		position: "absolute",
		top: -4,
		right: -7,
		minWidth: 17,
		height: 17,
		borderRadius: 9,
		backgroundColor: "#E50914",
		borderWidth: 1.5,
		borderColor: "#0d0e12",
		paddingHorizontal: 3.5,
		alignItems: "center",
		justifyContent: "center",
	},
	rozetNoktaGenis: {
		borderRadius: 9,
	},
	rozetYazi: {
		color: "#ffffff",
		fontSize: 9.5,
		fontWeight: "800",
	},
});
