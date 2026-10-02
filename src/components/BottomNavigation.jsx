import TVPressable from "@/components/common/TVPressable";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useRouter } from "expo-router";
import { Platform, StyleSheet, View } from "react-native";

export const TV_NAV_WIDTH = 56;

export default function BottomNavigation({ activeRoute, onOpenPlatforms }) {
	const router = useRouter();
	const isTV = Platform.isTV;

	const navItems = [
		{ id: "home", icon: "home", route: "/(app)" },
		{ id: "search", icon: "search", route: "/(app)/search" },
		{ id: "library", icon: "folder", route: "/(app)/library" },
		{ id: "downloads", icon: "download", route: "/(app)/downloads" },
		{ id: "settings", icon: "settings", route: "/(app)/settings" },
	];

	const handleAction = (item) => {
		if (item.route && activeRoute !== item.route) {
			router.push(item.route);
		}
	};

	// Android TV: Vertical Left Navigation Rail
	if (isTV) {
		return (
			<View style={styles.tvContainer}>
				{/* TV Top Brand Badge
				<View style={styles.tvLogoContainer}>
					<View style={styles.tvLogoCircle}>
						<Ionicons name="play" size={20} color="#E50914" />
					</View>
				</View>
				*/}

				{/* TV Vertical Navigation Rail (Centered) */}
				<View style={styles.tvNavList}>
					{navItems.map((item) => {
						const isActive =
							item.route && activeRoute === item.route;
						return (
							<TVPressable
								key={item.id}
								onPress={() => handleAction(item)}
								style={styles.tvNavItem}
								focusedStyle={styles.tvNavItemFocused}>
								{({ focused }) => {
									if (isActive) {
										return (
											<View
												style={[
													styles.tvActivePill,
													focused &&
														styles.tvActivePillFocused,
												]}>
												<Ionicons
													name={item.icon}
													size={22}
													color="#ffffff"
												/>
											</View>
										);
									}
									return (
										<View
											style={[
												styles.tvInactivePill,
												focused &&
													styles.tvInactivePillFocused,
											]}>
											<Ionicons
												name={`${item.icon}-outline`}
												size={22}
												color={
													focused
														? "#ffffff"
														: "#8E8E93"
												}
											/>
										</View>
									);
								}}
							</TVPressable>
						);
					})}
				</View>

				{/* Bottom spacer for visual balance
				<View style={styles.tvBottomSpacer} />
				*/}
			</View>
		);
	}

	// Phone & Tablet: Horizontal Bottom Navigation Bar
	return (
		<View style={styles.container}>
			{navItems.map((item) => {
				const isActive = item.route && activeRoute === item.route;
				return (
					<TVPressable
						key={item.id}
						onPress={() => handleAction(item)}
						style={styles.navItem}
						focusedStyle={styles.navItemFocused}>
						{({ focused }) => {
							if (isActive) {
								return (
									<View
										style={[
											styles.activePill,
											focused && styles.activePillFocused,
										]}>
										<Ionicons
											name={item.icon}
											size={21}
											color="#ffffff"
										/>
									</View>
								);
							}
							return (
								<View
									style={[
										styles.inactivePill,
										focused && styles.inactivePillFocused,
									]}>
									<Ionicons
										name={`${item.icon}-outline`}
										size={22}
										color={focused ? "#ffffff" : "#8E8E93"}
									/>
								</View>
							);
						}}
					</TVPressable>
				);
			})}
		</View>
	);
}

const styles = StyleSheet.create({
	// --- TV Vertical Navigation Rail Styles ---
	tvContainer: {
		position: "absolute",
		top: 0,
		bottom: 0,
		left: 0,
		width: TV_NAV_WIDTH,
		backgroundColor: "#0d0e12",
		borderRightWidth: 1,
		borderRightColor: "rgba(255, 255, 255, 0.08)",
		alignItems: "center",
		justifyContent: "center",
		paddingVertical: 16,
		zIndex: 9999,
		elevation: 24,
	},
	tvLogoContainer: {
		alignItems: "center",
		justifyContent: "center",
		paddingTop: 8,
	},
	tvLogoCircle: {
		width: 42,
		height: 42,
		borderRadius: 21,
		backgroundColor: "rgba(229, 9, 20, 0.12)",
		alignItems: "center",
		justifyContent: "center",
		borderWidth: 1.5,
		borderColor: "rgba(229, 9, 20, 0.4)",
	},
	tvNavList: {
		flexDirection: "column",
		alignItems: "center",
		justifyContent: "center",
		gap: 16,
	},
	tvNavItem: {
		width: 44,
		height: 44,
		alignItems: "center",
		justifyContent: "center",
		borderRadius: 14,
	},
	tvNavItemFocused: {
		transform: [{ scale: 1.12 }],
	},
	tvActivePill: {
		width: 44,
		height: 44,
		backgroundColor: "#2563EB",
		borderRadius: 14,
		alignItems: "center",
		justifyContent: "center",
	},
	tvActivePillFocused: {
		backgroundColor: "#E50914",
		borderColor: "#FFFFFF",
		borderWidth: 2,
	},
	tvInactivePill: {
		width: 44,
		height: 44,
		borderRadius: 14,
		alignItems: "center",
		justifyContent: "center",
	},
	tvInactivePillFocused: {
		backgroundColor: "rgba(229, 9, 20, 0.25)",
		borderColor: "#E50914",
		borderWidth: 2,
	},
	tvBottomSpacer: {
		height: 42,
	},

	// --- Mobile / Tablet Horizontal Bottom Bar Styles ---
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
		shadowColor: "#FF3B30",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.6,
		shadowRadius: 6,
		elevation: 6,
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
