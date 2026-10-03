import TVPressable from "@/components/common/TVPressable";
import { NAV_RAIL_WIDTH, useNavLayout } from "@/hooks/useNavLayout";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";

/** @deprecated Geriye uyumluluk: artık useNavLayout'ı kullanın. */
export const TV_NAV_WIDTH = NAV_RAIL_WIDTH;

const NAV_ITEMS = [
	{ id: "home", icon: "home", route: "/(app)" },
	{ id: "search", icon: "search", route: "/(app)/search" },
	{ id: "library", icon: "folder", route: "/(app)/library" },
	{ id: "downloads", icon: "download", route: "/(app)/downloads" },
	{ id: "settings", icon: "settings", route: "/(app)/settings" },
];

export default function BottomNavigation({ activeRoute, onOpenPlatforms }) {
	const router = useRouter();
	// Tek kaynak: TV + tablet yatay → sol ray; telefon ve tablet dikey → alt bar.
	const { isSideRail } = useNavLayout();

	const handleAction = (item) => {
		if (item.route && activeRoute !== item.route) {
			router.push(item.route);
		}
	};

	// Sol tarafta dikey ray: TV ve tablet (yatay)
	if (isSideRail) {
		return (
			<View style={styles.railContainer}>
				<View style={styles.railNavList}>
					{NAV_ITEMS.map((item) => {
						const isActive =
							item.route && activeRoute === item.route;
						return (
							<TVPressable
								key={item.id}
								onPress={() => handleAction(item)}
								style={styles.railItem}
								focusedStyle={styles.railItemFocused}>
								{({ focused }) => (
									<View
										style={[
											styles.railIconBox,
											isActive
												? styles.railIconBoxActive
												: styles.railIconBoxInactive,
											focused && styles.railIconBoxFocused,
										]}>
										<Ionicons
											name={
												isActive
													? item.icon
													: `${item.icon}-outline`
											}
											size={22}
											color={
												isActive || focused
													? "#ffffff"
													: "#8E8E93"
											}
										/>
									</View>
								)}
							</TVPressable>
						);
					})}
				</View>
			</View>
		);
	}

	// Altta yatay bar: telefon ve tablet (dikey)
	return (
		<View style={styles.container}>
			{NAV_ITEMS.map((item) => {
				const isActive = item.route && activeRoute === item.route;
				return (
					<TVPressable
						key={item.id}
						onPress={() => handleAction(item)}
						style={styles.navItem}
						focusedStyle={styles.navItemFocused}>
						{({ focused }) => (
							<View
								style={[
									isActive
										? styles.activePill
										: styles.inactivePill,
									focused &&
										(isActive
											? styles.activePillFocused
											: styles.inactivePillFocused),
								]}>
								<Ionicons
									name={
										isActive
											? item.icon
											: `${item.icon}-outline`
									}
									size={22}
									color={focused || isActive ? "#ffffff" : "#8E8E93"}
								/>
							</View>
						)}
					</TVPressable>
				);
			})}
		</View>
	);
}

const styles = StyleSheet.create({
	// --- Sol taraf rayı: TV + tablet (yatay) ---
	railContainer: {
		position: "absolute",
		top: 0,
		bottom: 0,
		left: 0,
		width: NAV_RAIL_WIDTH,
		backgroundColor: "#0d0e12",
		borderRightWidth: 1,
		borderRightColor: "rgba(255, 255, 255, 0.08)",
		alignItems: "center",
		justifyContent: "center",
		paddingVertical: 16,
		zIndex: 9999,
		elevation: 24,
	},
	railNavList: {
		flexDirection: "column",
		alignItems: "center",
		justifyContent: "center",
		gap: 16,
	},
	railItem: {
		width: 44,
		height: 44,
		alignItems: "center",
		justifyContent: "center",
		borderRadius: 14,
	},
	railItemFocused: {
		transform: [{ scale: 1.12 }],
	},
	railIconBox: {
		width: 44,
		height: 44,
		borderRadius: 14,
		alignItems: "center",
		justifyContent: "center",
	},
	railIconBoxActive: {
		backgroundColor: "#2563EB",
	},
	railIconBoxInactive: {
		backgroundColor: "transparent",
	},
	// TV performans: odakta elevation DEĞİŞTİRİLMEZ, sadece kenar + zemin.
	railIconBoxFocused: {
		backgroundColor: "rgba(229, 9, 20, 0.25)",
		borderColor: "#E50914",
		borderWidth: 2,
	},

	// --- Alt bar: telefon + tablet (dikey) ---
	container: {
		flexDirection: "row",
		borderTopWidth: 1,
		borderTopColor: "rgba(255, 255, 255, 0.08)",
		backgroundColor: "#0d0e12",
		paddingVertical: 10,
		paddingHorizontal: 12,
		alignItems: "center",
		justifyContent: "space-around",
	},
	navItem: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		height: 44,
	},
	navItemFocused: {
		transform: [{ scale: 1.12 }],
	},
	activePill: {
		backgroundColor: "#2563EB",
		paddingHorizontal: 18,
		paddingVertical: 7,
		borderRadius: 12,
		justifyContent: "center",
		alignItems: "center",
	},
	activePillFocused: {
		backgroundColor: "#FF3B30",
		borderColor: "#FFFFFF",
		borderWidth: 1.5,
	},
	inactivePill: {
		paddingHorizontal: 14,
		paddingVertical: 6,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
	},
	inactivePillFocused: {
		backgroundColor: "rgba(255, 59, 48, 0.25)",
		borderColor: "#FF3B30",
		borderWidth: 1.5,
	},
});
