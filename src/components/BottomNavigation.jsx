import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useRouter } from "expo-router";
import { StyleSheet, TouchableOpacity, View } from "react-native";

export default function BottomNavigation({ activeRoute, onOpenPlatforms }) {
	const router = useRouter();

	const navItems = [
		{ id: "home", icon: "home", route: "/(app)" },
		{ id: "search", icon: "search", route: "/(app)/search" },
		{ id: "library", icon: "folder", route: "/(app)/library" },
		{ id: "downloads", icon: "download", route: "/(app)/downloads" },
		{ id: "settings", icon: "settings", route: "/(app)/settings" },
	];

	const handleAction = (item) => {
		if (item.route) {
			router.push(item.route);
		}
	};

	return (
		<View
			style={[
				styles.container,
				{
					backgroundColor: "#0d0e12",
					borderTopColor: "rgba(255, 255, 255, 0.08)",
				},
			]}>
			{navItems.map((item) => {
				const isActive = item.route && activeRoute === item.route;
				return (
					<TouchableOpacity
						key={item.id}
						onPress={() => handleAction(item)}
						style={styles.navItem}
						activeOpacity={0.7}>
						{isActive ? (
							<View style={styles.activePill}>
								<Ionicons
									name={item.icon}
									size={21}
									color="#ffffff"
								/>
							</View>
						) : (
							<Ionicons
								name={`${item.icon}-outline`}
								size={22}
								color="#8E8E93"
							/>
						)}
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
		paddingVertical: 10,
		paddingHorizontal: 12,
		alignItems: "center",
		justifyContent: "space-around",
	},
	navItem: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		height: 40,
	},
	activePill: {
		backgroundColor: "#2563EB",
		paddingHorizontal: 18,
		paddingVertical: 7,
		borderRadius: 12,
		justifyContent: "center",
		alignItems: "center",
	},
});
