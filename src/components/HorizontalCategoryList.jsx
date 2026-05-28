import { CATEGORIES } from "@constants/data";
import { useState } from "react";
import {
	ScrollView,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from "react-native";

const HorizontalCategoryList = () => {
	// Varsayılan olarak ilk kategoriyi seçili yapıyoruz
	const [activeCategory, setActiveCategory] = useState("Action");

	return (
		<View style={styles.container}>
			<ScrollView
				horizontal // ScrollView'in yatay çalışmasını sağlar
				showsHorizontalScrollIndicator={false} // Alt kısımdaki çirkin kaydırma çubuğunu gizler
				contentContainerStyle={styles.scrollContent} // İçeriğin etrafındaki boşlukları ayarlar
			>
				{CATEGORIES[1].map((category, index) => {
					const isActive = activeCategory === category;

					return (
						<TouchableOpacity
							key={index}
							style={[
								styles.button,
								isActive && styles.activeButton, // Eğer seçiliyse aktif stilini uygula
							]}
							onPress={() => setActiveCategory(category)}>
							<Text
								style={[
									styles.buttonText,
									isActive && styles.activeButtonText, // Seçiliyse metin rengini değiştir
								]}>
								{category}
							</Text>
						</TouchableOpacity>
					);
				})}
			</ScrollView>
		</View>
	);
};

const styles = StyleSheet.create({
	container: {
		position: "absolute",
		height: 40, // Alanın yüksekliği
		justifyContent: "center",
		backgroundColor: "rgba(0, 0, 0, 0.9)", // Arka plan rengi

		alignItems: "flex-end",
	},
	scrollContent: {
		paddingHorizontal: 15, // Listenin en başında ve en sonunda boşluk bırakır
		alignItems: "center",
	},
	button: {
		paddingVertical: 4,
		paddingHorizontal: 6,
		backgroundColor: "#1f1f1fff", // Pasif buton arka planı (açık gri)
		borderRadius: 25, // Oval (hap) görünümü verir
		marginRight: 10, // Butonlar arası boşluk
	},
	activeButton: {
		backgroundColor: "#007aff", // Aktif buton arka planı (mavi)
	},
	buttonText: {
		color: "#e6e6e6ff",
		fontSize: 13,
		fontWeight: "600",
	},
	activeButtonText: {
		color: "#ffffff", // Aktif buton metin rengi (beyaz)
	},
});

export default HorizontalCategoryList;
