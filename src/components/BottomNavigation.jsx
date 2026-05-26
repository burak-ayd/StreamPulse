import { useThemeContext } from "@context/ThemeContext";
import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

export default function BottomNavigation({ activeRoute }) {
	const router = useRouter();
	const { theme, colors } = useThemeContext();

	const navItems = [
		{ name: "Home", icon: "home", route: "/(app)" },
		{ name: "Filmler", icon: "movie", route: "/(app)/movies" },
		{ name: "Discover", icon: "explore", route: "/(app)/discover" },
		{ name: "Diziler", icon: "tv", route: "/(app)/series" },

		{ name: "Search", icon: "search", route: "/(app)/search" },
	];

	const handleNavigation = (route) => {
		router.push(route);
	};

	return (
		<View
			style={[
				styles.container,
				{
					backgroundColor: colors.bg,
					borderTopColor: colors.border,
				},
			]}>
			{navItems.map((item) => {
				const isActive = activeRoute === item.route;
				return (
					<TouchableOpacity
						key={item.route}
						onPress={() => handleNavigation(item.route)}
						style={styles.navItem}
						activeOpacity={0.7}>
						<MaterialIcons
							name={item.icon}
							size={24}
							color={
								isActive ? colors.primary : colors.textSecondary
							}
							style={{
								fontVariationSettings:
									isActive && item.icon === "person"
										? "'FILL' 1"
										: "'FILL' 0",
							}}
						/>
						<Text
							style={[
								styles.navLabel,
								{
									color: isActive
										? colors.primary
										: colors.textSecondary,
									fontWeight: isActive ? "bold" : "500",
								},
							]}>
							{item.name}
						</Text>
					</TouchableOpacity>
				);
			})}
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flexDirection: "row",
		borderTopWidth: 1,
		paddingBottom: 8,
		paddingTop: 8,
		paddingHorizontal: 8,
		gap: 8,
	},
	navItem: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		paddingVertical: 8,
	},
	navLabel: {
		fontSize: 11,
		marginTop: 4,
		letterSpacing: 0.015,
	},
});
