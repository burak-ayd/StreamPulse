import { useThemeContext } from "@/context/ThemeContext";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Stack, useRouter } from "expo-router";
import {
	Alert,
	ScrollView,
	StatusBar,
	StyleSheet,
	Switch,
	Text,
	TouchableOpacity,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

function SettingItem({
	icon,
	label,
	onPress,
	rightComponent,
	showChevron = true,
}) {
	const { colors } = useThemeContext();
	return (
		<TouchableOpacity
			style={styles.settingItem}
			onPress={onPress}
			disabled={!onPress}
			activeOpacity={onPress ? 0.7 : 1}>
			<View style={styles.settingItemLeft}>
				<View
					style={[
						styles.iconContainer,
						{ backgroundColor: `${colors.primary}1A` },
					]}>
					<Ionicons
						name={icon}
						size={22}
						color={colors.primary}
					/>
				</View>
				<Text style={[styles.settingLabel, { color: colors.text }]}>
					{label}
				</Text>
			</View>
			<View style={styles.settingItemRight}>
				{rightComponent}
				{showChevron && !rightComponent && (
					<Ionicons
						name="chevron-forward"
						size={20}
						color={colors.textSecondary}
					/>
				)}
			</View>
		</TouchableOpacity>
	);
}

function SectionHeader({ title }) {
	const { colors } = useThemeContext();
	return (
		<Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>
			{title}
		</Text>
	);
}

export default function SettingsScreen() {
	const { theme, toggleTheme, colors } = useThemeContext();
	const router = useRouter();

	const handleBack = () => {
		router.back();
	};

	const handleClearCache = () => {
		Alert.alert(
			"Verileri Temizle",
			"Tüm yerel veriler ve geçmiş silinsin mi?",
			[
				{ text: "İptal", style: "cancel" },
				{
					text: "Temizle",
					style: "destructive",
					onPress: async () => {
						try {
							await AsyncStorage.clear();
							Alert.alert("Başarılı", "Yerel veriler temizlendi.");
						} catch {
							Alert.alert("Hata", "Veriler temizlenirken hata oluştu.");
						}
					},
				},
			],
		);
	};

	return (
		<>
			<Stack.Screen options={{ headerShown: false }} />
			<SafeAreaView
				edges={["top", "left", "right", "bottom"]}
				style={[styles.safeArea, { backgroundColor: colors.bg }]}>
				<StatusBar
					barStyle={
						theme === "dark" ? "light-content" : "dark-content"
					}
					backgroundColor={colors.bg}
				/>

				{/* Header */}
				<View
					style={[
						styles.header,
						{
							borderBottomColor: colors.border,
							backgroundColor: colors.cardBg,
						},
					]}>
					<TouchableOpacity
						onPress={handleBack}
						style={styles.backButton}>
						<Ionicons
							name="arrow-back"
							size={24}
							color={colors.text}
						/>
					</TouchableOpacity>
					<Text style={[styles.headerTitle, { color: colors.text }]}>
						Ayarlar
					</Text>
					<View style={styles.headerRight} />
				</View>

				<ScrollView
					showsVerticalScrollIndicator={false}
					contentContainerStyle={styles.scrollContainer}>
					{/* Account Section */}
					<View style={styles.section}>
						<SectionHeader title="PROFİL" />
						<View
							style={[
								styles.settingsGroup,
								{
									backgroundColor: colors.cardBg,
									borderColor: colors.border,
								},
							]}>
							<SettingItem
								icon="person-outline"
								label="Profili Düzenle"
								onPress={() =>
									router.push({
										pathname: "profile/EditProfile",
									})
								}
							/>
						</View>
					</View>

					{/* App Settings Section */}
					<View style={styles.section}>
						<SectionHeader title="UYGULAMA AYARLARI" />
						<View
							style={[
								styles.settingsGroup,
								{
									backgroundColor: colors.cardBg,
									borderColor: colors.border,
								},
							]}>
							<SettingItem
								icon="contrast-outline"
								label="Koyu Mod"
								showChevron={false}
								rightComponent={
									<Switch
										value={theme === "dark"}
										onValueChange={toggleTheme}
										trackColor={{
											false: colors.border,
											true: colors.primary,
										}}
										thumbColor="#ffffff"
										ios_backgroundColor={colors.border}
									/>
								}
							/>
							<View
								style={[
									styles.divider,
									{ backgroundColor: colors.border },
								]}
							/>
							<SettingItem
								icon="notifications-outline"
								label="Bildirim Ayarları"
								onPress={() => {
									Alert.alert("Bildirimler", "Bildirim ayarları aktiftir.");
								}}
							/>
							<View
								style={[
									styles.divider,
									{ backgroundColor: colors.border },
								]}
							/>
							<SettingItem
								icon="globe-outline"
								label="Dil"
								rightComponent={
									<View style={styles.languageContainer}>
										<Text
											style={[
												styles.languageText,
												{ color: colors.textSecondary },
											]}>
											Türkçe
										</Text>
										<Ionicons
											name="chevron-forward"
											size={20}
											color={colors.textSecondary}
										/>
									</View>
								}
								showChevron={false}
							/>
						</View>
					</View>

					{/* Player & Subtitles Section */}
					<View style={styles.section}>
						<SectionHeader title="OYNATICI VE MEDYA" />
						<View
							style={[
								styles.settingsGroup,
								{
									backgroundColor: colors.cardBg,
									borderColor: colors.border,
								},
							]}>
							<SettingItem
								icon="play-circle-outline"
								label="Oynatıcı ve Altyazı Ayarları"
								onPress={() =>
									router.push({
										pathname: "settings/player",
									})
								}
							/>
						</View>
					</View>

					{/* Data Section */}
					<View style={styles.section}>
						<SectionHeader title="VERİ VE DEPOLAMA" />
						<View
							style={[
								styles.settingsGroup,
								{
									backgroundColor: colors.cardBg,

									borderColor: colors.border,
								},
							]}>
							<SettingItem
								icon="trash-outline"
								label="Yerel Verileri Sıfırla"
								onPress={handleClearCache}
							/>
						</View>
					</View>

					{/* About Section */}
					<View style={styles.section}>
						<SectionHeader title="HAKKINDA" />
						<View
							style={[
								styles.settingsGroup,
								{
									backgroundColor: colors.cardBg,
									borderColor: colors.border,
								},
							]}>
							<SettingItem
								icon="information-circle-outline"
								label="Sürüm"
								showChevron={false}
								rightComponent={
									<Text
										style={[
											styles.versionText,
											{ color: colors.textSecondary },
										]}>
										1.0.0
									</Text>
								}
							/>
						</View>
					</View>
				</ScrollView>
			</SafeAreaView>
		</>
	);
}

const styles = StyleSheet.create({
	safeArea: {
		flex: 1,
	},
	header: {
		height: 56,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: 16,
		borderBottomWidth: 1,
	},
	backButton: {
		width: 40,
		height: 40,
		justifyContent: "center",
		alignItems: "center",
	},
	headerTitle: {
		flex: 1,
		fontSize: 18,
		fontWeight: "bold",
		textAlign: "center",
	},
	headerRight: {
		width: 40,
	},
	scrollContainer: {
		paddingTop: 24,
		paddingBottom: 32,
		paddingHorizontal: 16,
	},
	section: {
		marginBottom: 32,
	},
	sectionHeader: {
		fontSize: 12,
		fontWeight: "600",
		letterSpacing: 1.2,
		textTransform: "uppercase",
		paddingHorizontal: 16,
		paddingBottom: 8,
	},
	settingsGroup: {
		borderRadius: 12,
		overflow: "hidden",
	},
	settingItem: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		minHeight: 56,
		paddingHorizontal: 16,
		paddingVertical: 8,
	},
	settingItemLeft: {
		flexDirection: "row",
		alignItems: "center",
		flex: 1,
		gap: 16,
	},
	iconContainer: {
		width: 40,
		height: 40,
		borderRadius: 20,
		justifyContent: "center",
		alignItems: "center",
	},
	settingLabel: {
		fontSize: 16,
		fontWeight: "500",
		flex: 1,
	},
	settingItemRight: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
	},
	divider: {
		height: 1,
		marginLeft: 72,
	},
	languageContainer: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
	},
	languageText: {
		fontSize: 16,
	},
	versionText: {
		fontSize: 16,
	},
});
