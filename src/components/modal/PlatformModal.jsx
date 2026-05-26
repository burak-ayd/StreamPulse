import HorizontalCategoryList from "@components/HorizontalCategoryList";
import { useThemeContext } from "@context/ThemeContext";
import { supabase } from "@utils/supabase";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
	Image,
	ScrollView,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from "react-native";
import Modal from "react-native-modal";
const PlatformModal = ({ isVisible, onDismiss }) => {
	const router = useRouter();
	const { theme, colors } = useThemeContext();
	const [selectedPlatform, setSelectedPlatform] = useState(null);
	const [platformList, setPlatformList] = useState([]);
	useEffect(() => {
		supabase.auth.getSession().then(async ({ data: { session } }) => {
			if (!session) return;
			console.log("test");
			const { data } = await supabase
				.from("platforms")
				.select("*")
				.eq("is_active", true)
				.order("id", { ascending: true });

			if (data && data[0]) {
				setPlatformList(data ? data : "Kayıtlı Platform Yok");
			}
		});
	}, []);
	const handlePlatformSelect = (platform) => {
		setSelectedPlatform(platform);
		router.push({
			pathname: "/(app)/platforms",
			params: { platformData: JSON.stringify(platform) },
		});
		onDismiss();
	};
	return (
		<View style={styles.container}>
			<Text style={styles.headerText}>Ana Ekran</Text>

			<Modal
				isVisible={isVisible}
				onBackdropPress={onDismiss} // 1. Etrafındaki boşluğa basınca kapatır
				swipeDirection={["down"]} // 2. Sadece aşağı kaydırma ile kapanmaya izin verir
				onSwipeComplete={onDismiss} // 3. Aşağı kaydırma işlemi bitince çalışır (kapatır)
				propagateSwipe={true} // 4. ÖNEMLİ: ScrollView'in kendi kaydırmasıyla Modal kaydırmasının çakışmasını önler
				style={styles.modalStyle}>
				<View style={styles.modalContent}>
					{/* Sürüklenebilir olduğunu belirten küçük çubuk (UI detayı) */}
					<View style={styles.dragHandle} />

					<Text style={styles.modalTitle}>Platformlar</Text>

					<View style={styles.content}>
						<ScrollView
							contentContainerStyle={styles.scrollContent}>
							{/* Örnek liste elemanları */}
							{platformList.map((platform) => (
								<TouchableOpacity
									key={platform.id}
									style={[
										styles.platformItem,
										{
											backgroundColor: colors.cardBg,
											borderColor: colors.border,
											borderWidth:
												selectedPlatform === platform.id
													? 2
													: 1,
										},
									]}
									onPress={() =>
										handlePlatformSelect(platform)
									}>
									<Image
										source={{
											uri: `https://www.google.com/s2/favicons?domain=${platform.website}&sz=128`,
										}}
										style={styles.platformImage}
									/>
									<Text
										style={[
											styles.platformText,
											{ color: colors.text },
										]}>
										{platform.name}
									</Text>
								</TouchableOpacity>
							))}
						</ScrollView>
						<HorizontalCategoryList />
					</View>
				</View>
			</Modal>
		</View>
	);
};

const styles = StyleSheet.create({
	content: {
		flex: 1,
		justifyContent: "flex-end",
	},
	container: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		backgroundColor: "#0c0b0bff",
	},
	headerText: {
		fontSize: 20,
		marginBottom: 20,
	},
	modalStyle: {
		justifyContent: "flex-end", // Modalı ekranın en altına hizalar
		margin: 0, // Yanlardaki varsayılan boşlukları sıfırlar
	},
	modalContent: {
		backgroundColor: "#0c0b0bff",
		padding: 20,
		height: "90%", // Ekranın %60'ını kaplasın
		borderTopLeftRadius: 20,
		borderTopRightRadius: 20,
	},
	dragHandle: {
		width: 40,
		height: 5,
		backgroundColor: "#ccc",
		borderRadius: 3,
		alignSelf: "center",
		marginBottom: 15,
	},
	modalTitle: {
		fontSize: 18,
		fontWeight: "bold",
		marginBottom: 10,
		textAlign: "center",
	},
	scrollContent: {
		paddingBottom: 20,
		gap: 10,
	},
	listItem: {
		padding: 15,
		borderBottomWidth: 1,
		borderBottomColor: "#eee",
	},
	platformItem: {
		flexDirection: "row",
		alignItems: "center",
		padding: 15,
		borderRadius: 10,
	},
	platformImage: {
		width: 30,
		height: 30,
		marginRight: 10,
	},
	platformText: {
		fontSize: 16,
		fontWeight: "500",
	},
});

export default PlatformModal;
