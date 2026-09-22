import { fetchPlatforms } from "@/services/api";
import { useThemeContext } from "@context/ThemeContext";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
	ActivityIndicator,
	ScrollView,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from "react-native";

const PlatformList = () => {
	const router = useRouter();
	const { theme, colors } = useThemeContext();
	const [selectedPlatform, setSelectedPlatform] = useState(null);
	const [platformList, setPlatformList] = useState([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let isMounted = true;
		async function loadPlatforms() {
			try {
				setLoading(true);
				const data = await fetchPlatforms();
				if (isMounted && data) {
					setPlatformList(data);
				}
			} catch (error) {
				console.error("Platformlar yüklenirken hata:", error);
			} finally {
				if (isMounted) setLoading(false);
			}
		}
		loadPlatforms();
		return () => {
			isMounted = false;
		};
	}, []);

	const handlePlatformSelect = (platform) => {
		setSelectedPlatform(platform.id || platform.name);
		router.push({
			pathname: "/(app)/platforms",
			params: { platformData: JSON.stringify(platform) },
		});
	};

	if (loading) {
		return (
			<View style={styles.loadingContainer}>
				<ActivityIndicator size="small" color={colors.primary} />
			</View>
		);
	}

	return (
		<ScrollView contentContainerStyle={styles.scrollContent}>
			{platformList.map((platform, index) => {
				const platformKey = platform.id || platform.name || index;
				const isSelected =
					selectedPlatform &&
					selectedPlatform === (platform.id || platform.name);

				return (
					<TouchableOpacity
						key={platformKey}
						style={[
							styles.platformItem,
							{
								backgroundColor: colors.cardBg,
								borderColor: colors.border,
								borderWidth: isSelected ? 2 : 1,
							},
						]}
						onPress={() => handlePlatformSelect(platform)}>
						<Image
							source={{
								uri: platform.favicon,
							}}
							style={styles.platformImage}
							contentFit="contain"
							transition={150}
							cachePolicy="memory-disk"
						/>
						<Text
							style={[
								styles.platformText,
								{ color: colors.text },
							]}>
							{platform.name}
						</Text>
					</TouchableOpacity>
				);
			})}
		</ScrollView>
	);
};

export default PlatformList;

const styles = StyleSheet.create({
	scrollContent: {
		paddingBottom: 20,
		gap: 10,
	},
	loadingContainer: {
		padding: 24,
		justifyContent: "center",
		alignItems: "center",
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
		borderRadius: 6,
	},
	platformText: {
		fontSize: 16,
		fontWeight: "500",
	},
});
