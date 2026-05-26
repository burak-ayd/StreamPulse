//  Modal Component
// src/components/modal/PlatformModal.jsx

import { useThemeContext } from "@context/ThemeContext";
import { MaterialIcons } from "@expo/vector-icons";
import { supabase } from "@utils/supabase";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
	Image,
	Modal,
	ScrollView,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from "react-native";

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
		<Modal
			visible={isVisible}
			onDismiss={onDismiss}
			animationType="fade"
			presentationStyle="overFullScreen"
			transparent={true}>
			<View style={styles.modalOverlay}>
				<View
					style={[
						styles.modalContent,
						{
							backgroundColor: colors.bg,
							borderColor: colors.border,
						},
					]}>
					<View style={styles.header}>
						<Text
							style={[styles.modalTitle, { color: colors.text }]}>
							Platform Seçin
						</Text>
						<TouchableOpacity
							style={styles.closeButton}
							onPress={onDismiss}>
							<MaterialIcons
								name="close"
								size={24}
								color={colors.text}
							/>
						</TouchableOpacity>
					</View>
					<ScrollView showsVerticalScrollIndicator={false}>
						<View style={styles.platformList}>
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
						</View>
					</ScrollView>
				</View>
			</View>
		</Modal>
	);
};

export default PlatformModal;

const styles = StyleSheet.create({
	modalOverlay: {
		flex: 1,
		justifyContent: "flex-end",
		backgroundColor: "rgba(0, 0, 0, 0.5)",
	},
	modalContent: {
		borderTopLeftRadius: 20,
		borderTopRightRadius: 20,
		padding: 20,
		maxHeight: "80%",
	},
	header: {
		width: "100%",
		marginTop: 20,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
	closeButton: {
		padding: 10,
	},
	modalTitle: {
		fontSize: 20,
		fontWeight: "bold",
		marginBottom: 20,
	},
	platformList: {
		gap: 10,
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
