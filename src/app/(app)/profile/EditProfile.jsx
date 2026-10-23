import TVPressable from "@components/common/TVPressable";
import { useAuth } from "@/context/AuthContext";
import { useTvMetrics } from "@/utils/tvMetrics";
import { useThemeContext } from "@/context/ThemeContext";
import { getUserProfile, saveUserProfile } from "@/utils/storage";
import { pushImmediately } from "@/services/sync";
import { updateProfile } from "@/services/apiClient";
import { DateTimePicker } from "@expo/ui/community/datetime-picker";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import Image from "@/components/common/SmartImage";
import * as ImagePicker from "expo-image-picker";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
	ActivityIndicator,
	Alert,
	BackHandler,
	KeyboardAvoidingView,
	Platform,
	ScrollView,
	StatusBar,
	StyleSheet,
	Switch,
	Text,
	TextInput,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function EditProfile() {
	const { theme, colors } = useThemeContext();
	// TV: profil formu ortalanmış sütuna alınır (bkz. utils/tvMetrics.js).
	const { contentMaxWidth } = useTvMetrics();
	const { user, isLoggedIn, refreshUser } = useAuth();
	const router = useRouter();
	const [isLoading, setIsLoading] = useState(false);

	useFocusEffect(
		useCallback(() => {
			const onBackPress = () => {
				if (router.canGoBack()) router.back();
				else router.replace("/(app)/profile");
				return true;
			};

			const subscription = BackHandler.addEventListener(
				"hardwareBackPress",
				onBackPress,
			);
			return () => subscription.remove();
		}, [router]),
	);

	// User data states
	const [email, setEmail] = useState("");
	const [username, setUsername] = useState("");
	const [displayName, setDisplayName] = useState("");
	const [avatarUrl, setAvatarUrl] = useState("");
	const [bio, setBio] = useState("");
	const [language, setLanguage] = useState("Türkçe");
	const [isPrivate, setIsPrivate] = useState(false);
	const [birthDate, setBirthDate] = useState("");

	const [showPicker, setShowPicker] = useState(false);

	// Focus states
	const [isDisplayNameFocused, setIsDisplayNameFocused] = useState(false);
	const [isUsernameFocused, setIsUsernameFocused] = useState(false);
	const [isBioFocused, setIsBioFocused] = useState(false);

	// Language options
	const languageOptions = [
		"Türkçe",
		"English",
		"Deutsch",
		"Français",
		"Español",
	];

	// Load user data on mount
	useEffect(() => {
		let isMounted = true;
		const loadData = async () => {
			try {
				setIsLoading(true);
				const data = await getUserProfile();
				if (!isMounted) return;
				if (isLoggedIn && user) {
					setEmail(user.email || data?.email || "");
					setUsername(user.username || data?.username || "");
					setDisplayName(user.display_name || data?.displayName || "");
					setAvatarUrl(user.avatar_url || data?.avatarUrl || "");
					setBio(user.bio || data?.bio || "");
				} else if (data) {
					setEmail(data.email || "");
					setUsername(data.username || "");
					setDisplayName(data.displayName || "");
					setAvatarUrl(data.avatarUrl || "");
					setBio(data.bio || "");
				}
				if (data && isMounted) {
					setLanguage(data.language || "Türkçe");
					setIsPrivate(data.isPrivate || false);
					setBirthDate(data.birthDate || "");
				}
			} catch (error) {
				console.error("Profil bilgisi alınamadı:", error);
			} finally {
				if (isMounted) {
					setIsLoading(false);
				}
			}
		};

		loadData();

		return () => {
			isMounted = false;
		};
	}, [isLoggedIn, user]);

	const handleBack = () => {
		if (router.canGoBack()) {
			router.back();
		}
	};

	const pickImage = async () => {
		const permissionResult =
			await ImagePicker.requestMediaLibraryPermissionsAsync();

		if (permissionResult.granted === false) {
			Alert.alert(
				"İzin Gerekli",
				"Fotoğraf seçmek için galeri erişim izni gerekli.",
			);
			return;
		}

		const result = await ImagePicker.launchImageLibraryAsync({
			mediaTypes: ImagePicker.MediaTypeOptions.Images,
			allowsEditing: true,
			aspect: [1, 1],
			quality: 0.5,
		base64: true,
		});

		if (!result.canceled && result.assets[0]) {
			const asset = result.assets[0];
			if (asset.base64) {
				const mime = asset.mimeType || "image/jpeg";
				setAvatarUrl("data:" + mime + ";base64," + asset.base64);
			} else {
				setAvatarUrl(asset.uri);
			}
		}
	};

	const handleSave = async () => {
		if (!username.trim()) {
			Alert.alert("Hata", "Kullanıcı adı boş bırakılamaz.");
			return;
		}

		if (!displayName.trim()) {
			Alert.alert("Hata", "Görünen ad boş bırakılamaz.");
			return;
		}

		setIsLoading(true);

		try {
			// 1) Sunucu — user_profiles satırı (avatar, bio, doğum tarihi...).
			//    Girişliyken kaydın "yalnızca cihazda kalması" hatasını burada
			//    düzeltiyoruz: blob senkronu yeterli değildi, /api/auth/me
			//    user_profiles kolonlarından okuyordu.
			let sunucuMesaji = null;
			if (isLoggedIn && user?.id) {
				try {
					const sonuc = await updateProfile({
						username: username.trim(),
						display_name: displayName.trim(),
						avatar_url: avatarUrl || null,
						bio: bio.trim() || null,
						language: language,
						is_private: isPrivate,
						birth_date: birthDate || null,
					});
					if (sonuc.ok) {
						// Oturum kullanıcısını güncelle (avatar vb. ekranda
						// hemen yansısın).
						refreshUser?.();
					} else {
						sunucuMesaji =
							sonuc.reason === "validation"
								? sonuc.detail || "Girdi sunucu tarafından reddedildi."
								: sonuc.reason === "auth"
									? "Oturum doğrulanamadı, lütfen tekrar giriş yapın."
									: null;
						console.warn("Profil sunucuya yazılamadı:", sonuc.reason, sonuc.detail ?? "");
					}
				} catch (e) {
					console.warn("Profil güncelleme isteği hata verdi:", e);
				}
			}

			// 2) Yerel — çevrimdışı kullanım + senkron blob'u (user_profile).
			await saveUserProfile({
				username: username.trim(),
				displayName: displayName.trim(),
				avatarUrl: avatarUrl,
				bio: bio.trim(),
				language: language,
				isPrivate: isPrivate,
				birthDate: birthDate,
			});
			try {
				await pushImmediately();
			} catch (e) {
				console.warn("Profil senkronizasyonu tetiklenemedi:", e);
			}

			Alert.alert(
				sunucuMesaji ? "Kısmen kaydedildi" : "Başarılı",
				sunucuMesaji
					? `${sunucuMesaji}\n(Profil cihazda kaydedildi, sunucuya yazılamadı.)`
					: "Profil kaydedildi.",
				[
					{
						text: "Tamam",
						onPress: () => router.back(),
					},
				],
			);
		} catch (error) {
			Alert.alert(
				"Hata",
				error.message || "Profil güncellenirken hata oluştu.",
			);
		} finally {
			setIsLoading(false);
		}
	};

	const showLanguagePicker = () => {
		Alert.alert(
			"Dil Seçin",
			"",
			languageOptions.map((lang) => ({
				text: lang,
				onPress: () => setLanguage(lang),
			})),
		);
	};

	const formatDate = (dateString) => {
		if (!dateString) return "";
		const date = new Date(dateString);
		return date.toLocaleDateString("tr-TR");
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
					<TVPressable
						onPress={handleBack}
						style={({ focused }) => [
							styles.backButton,
							focused && styles.iconButtonFocused,
						]}>
						<Ionicons
							name="arrow-back"
							size={24}
							color={colors.text}
						/>
					</TVPressable>
					<Text style={[styles.headerTitle, { color: colors.text }]}>
						Profili Düzenle
					</Text>
					<TVPressable
						onPress={handleSave}
						disabled={isLoading}
						style={({ focused }) => [
							styles.saveButton,
							focused && styles.saveButtonFocused,
						]}>
						{isLoading ? (
							<ActivityIndicator
								size="small"
								color={colors.primary}
							/>
						) : (
							<Text
								style={[
									styles.saveButtonText,
									{ color: colors.primary },
								]}>
								Kaydet
							</Text>
						)}
					</TVPressable>
				</View>

				<KeyboardAvoidingView
					behavior={Platform.OS === "ios" ? "padding" : "height"}
					style={styles.keyboardAvoid}>
					<ScrollView
						contentInsetAdjustmentBehavior="automatic"
						showsVerticalScrollIndicator={false}
						contentContainerStyle={[
							styles.scrollContainer,
							// TV: form ortalanmış sütunda kalsın.
							contentMaxWidth
								? {
										alignSelf: "center",
										width: "100%",
										maxWidth: contentMaxWidth,
									}
								: null,
						]}
						keyboardShouldPersistTaps="handled">
						{/* Profile Picture Section */}
						<View
							style={[
								styles.profilePictureSection,
								{
									backgroundColor: colors.cardBg,
									borderColor: colors.border,
								},
							]}>
							<View
								style={[
									styles.avatarContainer,
									{ backgroundColor: colors.primary + "20" },
								]}>
								{avatarUrl ? (
									<Image
										source={{ uri: avatarUrl }}
										style={styles.avatarImage}
										contentFit="cover"
										transition={150}
									/>
								) : (
									<Ionicons
										name="person"
										size={56}
										color={colors.primary}
									/>
								)}
							</View>
							<TVPressable
								style={({ focused }) => [
									styles.changeAvatarButton,
									{ borderColor: colors.primary },
									focused && styles.changeAvatarButtonFocused,
								]}
								onPress={pickImage}>
								<Ionicons
									name="camera"
									size={18}
									color={colors.primary}
								/>
								<Text
									style={[
										styles.changeAvatarText,
										{ color: colors.primary },
									]}>
									{" "}
									Fotoğrafı Değiştir
								</Text>
							</TVPressable>
						</View>

						{/* User Info Form */}
						<View
							style={[
								styles.formSection,
								{
									backgroundColor: colors.cardBg,
									borderColor: colors.border,
								},
							]}>
							{/* Display Name */}
							<View style={styles.inputGroup}>
								<Text
									style={[
										styles.inputLabel,
										{ color: colors.text },
									]}>
									Görünen Ad
								</Text>
								<View
									style={[
										styles.inputWrapper,
										{
											backgroundColor: colors.bg,
											borderColor: isDisplayNameFocused
												? colors.primary
												: colors.border,
										},
									]}>
									<TextInput
										style={[
											styles.textInput,
											{ color: colors.text },
										]}
										value={displayName}
										onChangeText={setDisplayName}
										placeholder="Görünen adınız"
										placeholderTextColor={
											colors.textSecondary
										}
										onFocus={() =>
											setIsDisplayNameFocused(true)
										}
										onBlur={() =>
											setIsDisplayNameFocused(false)
										}
										maxLength={50}
									/>
								</View>
							</View>

							{/* Username */}
							<View style={styles.inputGroup}>
								<Text
									style={[
										styles.inputLabel,
										{ color: colors.text },
									]}>
									Kullanıcı Adı
								</Text>
								<View
									style={[
										styles.inputWrapper,
										{
											backgroundColor: colors.bg,
											borderColor: isUsernameFocused
												? colors.primary
												: colors.border,
										},
									]}>
									<Ionicons
										name="at"
										size={20}
										color={colors.textSecondary}
										style={styles.inputIcon}
									/>
									<TextInput
										style={[
											styles.textInput,
											{
												color: colors.text,
												paddingLeft: 0,
											},
										]}
										value={username}
										onChangeText={setUsername}
										placeholder="kullaniciadi"
										placeholderTextColor={
											colors.textSecondary
										}
										onFocus={() =>
											setIsUsernameFocused(true)
										}
										onBlur={() =>
											setIsUsernameFocused(false)
										}
										autoCapitalize="none"
										maxLength={30}
									/>
								</View>
							</View>

							{/* Email */}
							<View style={styles.inputGroup}>
								<Text
									style={[
										styles.inputLabel,
										{ color: colors.text },
									]}>
									E-posta
								</Text>
								<View
									style={[
										styles.inputWrapper,
										{
											backgroundColor: colors.bg,
											borderColor: colors.border,
											opacity: 0.8,
										},
									]}>
									<Ionicons
										name="mail-outline"
										size={20}
										color={colors.textSecondary}
										style={styles.inputIcon}
									/>
									<TextInput
										style={[
											styles.textInput,
											{
												color: colors.textSecondary,
												paddingLeft: 0,
											},
										]}
										value={email || "Giriş Yapılmadı"}
										editable={false}
									/>
								</View>
							</View>

							{/* Bio */}
							<View style={styles.inputGroup}>
								<Text
									style={[
										styles.inputLabel,
										{ color: colors.text },
									]}>
									Biyografi
								</Text>
								<View
									style={[
										styles.bioInputWrapper,
										{
											backgroundColor: colors.bg,
											borderColor: isBioFocused
												? colors.primary
												: colors.border,
										},
									]}>
									<TextInput
										style={[
											styles.bioTextInput,
											{ color: colors.text },
										]}
										value={bio}
										onChangeText={setBio}
										placeholder="Kendinizi kısaca tanıtın..."
										placeholderTextColor={
											colors.textSecondary
										}
										onFocus={() => setIsBioFocused(true)}
										onBlur={() => setIsBioFocused(false)}
										multiline
										maxLength={150}
										textAlignVertical="top"
									/>
									<Text
										style={[
											styles.charCount,
											{ color: colors.textSecondary },
										]}>
										{bio.length}/150
									</Text>
								</View>
							</View>

							{/* Language */}
							<TVPressable
								style={({ focused }) => [
									styles.inputGroup,
									focused && styles.inputGroupFocused,
								]}
								onPress={showLanguagePicker}>
								<Text
									style={[
										styles.inputLabel,
										{ color: colors.text },
									]}>
									Dil
								</Text>
								<View
									style={[
										styles.selectWrapper,
										{
											backgroundColor: colors.bg,
											borderColor: colors.border,
										},
									]}>
									<Ionicons
										name="globe-outline"
										size={20}
										color={colors.textSecondary}
										style={styles.inputIcon}
									/>
									<Text
										style={[
											styles.selectText,
											{ color: colors.text },
										]}>
										{language}
									</Text>
									<Ionicons
										name="chevron-forward"
										size={20}
										color={colors.textSecondary}
									/>
								</View>
							</TVPressable>

							{/* Birth Date */}
							<TVPressable
								style={({ focused }) => [
									styles.inputGroup,
									focused && styles.inputGroupFocused,
								]}
								onPress={() => {
									setShowPicker(true);
								}}>
								<Text
									style={[
										styles.inputLabel,
										{ color: colors.text },
									]}>
									Doğum Tarihi
								</Text>
								<View
									style={[
										styles.selectWrapper,
										{
											backgroundColor: colors.bg,
											borderColor: colors.border,
										},
									]}>
									<Ionicons
										name="gift-outline"
										size={20}
										color={colors.textSecondary}
										style={styles.inputIcon}
									/>
									<Text
										style={[
											styles.selectText,
											{ color: colors.text },
										]}>
										{birthDate
											? formatDate(birthDate)
											: "Ayarlanmamış"}
									</Text>
									<Ionicons
										name="calendar-outline"
										size={20}
										color={colors.textSecondary}
									/>
								</View>
							</TVPressable>
							{showPicker && (
								<DateTimePicker
									value={
										birthDate
											? new Date(birthDate)
											: new Date()
									}
									mode="date"
									locale="tr-TR"
									display="compact"
									onValueChange={(event, selectedDate) => {
										setShowPicker(false);
										if (selectedDate) {
											setBirthDate(
												selectedDate.toISOString(),
											);
										}
									}}
									onDismiss={() => {
										setShowPicker(false);
									}}
								/>
							)}
						</View>

						{/* Privacy Settings */}
						<View
							style={[
								styles.privacySection,
								{
									backgroundColor: colors.cardBg,
									borderColor: colors.border,
								},
							]}>
							<View style={styles.privacyItem}>
								<View style={styles.privacyTextContainer}>
									<Ionicons
										name="lock-closed-outline"
										size={22}
										color={colors.textSecondary}
										style={styles.privacyIcon}
									/>
									<View>
										<Text
											style={[
												styles.privacyTitle,
												{ color: colors.text },
											]}>
											Hesap Gizliliği
										</Text>
										<Text
											style={[
												styles.privacyDescription,
												{ color: colors.textSecondary },
											]}>
											Profilinizi gizli tutun
										</Text>
									</View>
								</View>
								<Switch
									value={isPrivate}
									onValueChange={setIsPrivate}
									trackColor={{
										false: colors.border,
										true: colors.primary + "80",
									}}
									thumbColor={
										isPrivate
											? colors.primary
											: colors.textSecondary
									}
								/>
							</View>
						</View>
					</ScrollView>
				</KeyboardAvoidingView>
			</SafeAreaView>
		</>
	);
}

const styles = StyleSheet.create({
	safeArea: { flex: 1 },
	header: {
		height: 56,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: 8,
		borderBottomWidth: 1,
	},
	backButton: {
		width: 48,
		height: 48,
		justifyContent: "center",
		alignItems: "center",
	},
	headerTitle: {
		flex: 1,
		fontSize: 18,
		fontWeight: "bold",
		textAlign: "center",
	},
	saveButton: {
		width: 60,
		height: 48,
		justifyContent: "center",
		alignItems: "center",
	},
	saveButtonText: {
		fontSize: 16,
		fontWeight: "600",
	},
	keyboardAvoid: { flex: 1 },
	scrollContainer: {
		paddingTop: 16,
		paddingBottom: 32,
		paddingHorizontal: 16,
	},
	profilePictureSection: {
		padding: 24,
		borderRadius: 16,
		alignItems: "center",
		borderWidth: 1,
		marginBottom: 12,
	},
	avatarContainer: {
		width: 100,
		height: 100,
		borderRadius: 50,
		justifyContent: "center",
		alignItems: "center",
		marginBottom: 12,
		overflow: "hidden",
	},
	avatarImage: {
		width: 100,
		height: 100,
		borderRadius: 50,
		overflow: "hidden",
	},
	changeAvatarButton: {
		flexDirection: "row",
		alignItems: "center",
		paddingVertical: 8,
		paddingHorizontal: 16,
		borderRadius: 20,
		borderWidth: 1,
	},
	changeAvatarText: {
		fontSize: 14,
		fontWeight: "500",
	},
	formSection: {
		padding: 20,
		borderRadius: 16,
		borderWidth: 1,
		marginBottom: 12,
	},
	inputGroup: {
		marginBottom: 20,
	},
	inputLabel: {
		fontSize: 14,
		fontWeight: "600",
		marginBottom: 8,
	},
	inputWrapper: {
		flexDirection: "row",
		alignItems: "center",
		height: 48,
		borderRadius: 12,
		borderWidth: 1.5,
		paddingHorizontal: 12,
	},
	inputIcon: {
		marginRight: 10,
	},
	textInput: {
		flex: 1,
		fontSize: 15,
		paddingVertical: 8,
	},
	bioInputWrapper: {
		borderRadius: 12,
		borderWidth: 1.5,
		padding: 12,
		minHeight: 90,
	},
	bioTextInput: {
		flex: 1,
		fontSize: 15,
		paddingTop: 0,
	},
	charCount: {
		fontSize: 11,
		textAlign: "right",
		marginTop: 4,
	},
	selectWrapper: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		height: 48,
		borderRadius: 12,
		borderWidth: 1.5,
		paddingHorizontal: 12,
	},
	selectText: {
		flex: 1,
		fontSize: 15,
	},
	privacySection: {
		padding: 16,
		borderRadius: 16,
		borderWidth: 1,
		marginBottom: 12,
	},
	privacyItem: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
	privacyTextContainer: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		flex: 1,
	},
	privacyIcon: {
		marginRight: 4,
	},
	privacyTitle: {
		fontSize: 15,
		fontWeight: "600",
	},
	privacyDescription: {
		fontSize: 12,
		marginTop: 2,
	},
	iconButtonFocused: {
		transform: [{ scale: 1.15 }],
	},
	saveButtonFocused: {
		borderWidth: 1.5,
		borderColor: "#E50914",
		borderRadius: 8,
		paddingHorizontal: 8,
		paddingVertical: 4,
		transform: [{ scale: 1.05 }],
	},
	changeAvatarButtonFocused: {
		borderWidth: 2,
		borderColor: "#FFFFFF",
		transform: [{ scale: 1.05 }],
	},
	inputGroupFocused: {
		borderWidth: 1.5,
		borderColor: "#E50914",
		borderRadius: 12,
		padding: 4,
	},
});
