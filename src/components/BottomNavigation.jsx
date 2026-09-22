import { useThemeContext } from "@context/ThemeContext";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useRouter } from "expo-router";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

export default function BottomNavigation({ activeRoute }) {
	const router = useRouter();
	const { theme, colors } = useThemeContext();

	const navItems = [
		{ name: "Ana Sayfa", icon: "home", route: "/(app)" },
		// { name: "Filmler", icon: "film", route: "/(app)/movies" },
		{ name: "Arama", icon: "search", route: "/(app)/search" },

		// { name: "Diziler", icon: "tv", route: "/(app)/series" },
		{ name: "Keşfet", icon: "compass", route: "/(app)/discover" },
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
				const iconName = isActive ? item.icon : `${item.icon}-outline`;
				return (
					<TouchableOpacity
						key={item.route}
						onPress={() => handleNavigation(item.route)}
						style={styles.navItem}
						activeOpacity={0.7}>
						<Ionicons
							name={iconName}
							size={22}
							color={
								isActive ? colors.primary : colors.textSecondary
							}
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
