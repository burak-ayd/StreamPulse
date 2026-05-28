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
} from "react-native";

const PlatformList = () => {
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
	};
	return (
		<>
			<ScrollView contentContainerStyle={styles.scrollContent}>
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
									selectedPlatform === platform.id ? 2 : 1,
							},
						]}
						onPress={() => handlePlatformSelect(platform)}>
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
		</>
	);
};

export default PlatformList;

const styles = StyleSheet.create({
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
