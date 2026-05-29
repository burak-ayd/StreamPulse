import { useThemeContext } from "@context/ThemeContext";
import DateTimePicker from "@expo/ui/community/datetime-picker";
import { MaterialIcons } from "@expo/vector-icons";
import { supabase } from "@utils/supabase";
import * as ImagePicker from "expo-image-picker";
import { Stack, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
	ActivityIndicator,
	Alert,
	Image,
	KeyboardAvoidingView,
	Platform,
	ScrollView,
	StatusBar,
	StyleSheet,
	Switch,
	Text,
	TextInput,
	TouchableOpacity,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function EditProfile() {
	const { theme, colors } = useThemeContext();
	const router = useRouter();
	const [isLoading, setIsLoading] = useState(false);

	// User data states
	const [userEmail, setUserEmail] = useState("");
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
	const loadUserData = useCallback(async () => {
		const {
			data: { session },
		} = await supabase.auth.getSession();
		if (!session) return;

		setUserEmail(session.user.email ?? "");

		const { data } = await supabase
			.from("profiles")
			.select("*")
			.eq("id", session.user.id)
			.single();

		if (data) {
			setUsername(data.username ?? "");
			setDisplayName(data.display_name ?? "");
			const avatarPath = data.avatar_url.split("/avatars/")[1];
			if (avatarPath) {
				const { data: urlData, error } = await supabase.storage
					.from("avatars")
					.createSignedUrl(avatarPath, 3600);

				if (!error && urlData?.signedUrl) {
					setAvatarUrl(urlData.signedUrl ?? "");
				} else {
					console.log("signedUrl error:", error);
				}
			}
			setBio(data.bio ?? "");
			setLanguage(data.language ?? "Türkçe");
			setIsPrivate(data.is_private ?? false);
			setBirthDate(data.birthdate ?? "");
		}
	}, []);

	// Initial data load
	useEffect(() => {
		loadUserData();
	}, [loadUserData]);

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
			quality: 0.8,
		});

		if (!result.canceled && result.assets[0]) {
			const uri = result.assets[0].uri;
			setAvatarUrl(uri);
		}
	};

	const uploadAvatar = async (uri) => {
		try {
			const fileExt = uri.split(".").pop();
			const fileName = `${Date.now()}.${fileExt}`;

			const {
				data: { session },
			} = await supabase.auth.getSession();

			if (!session) {
				throw new Error("Oturum bulunamadı");
			}

			const userId = session.user.id;
			const arrayBuffer = await fetch(uri).then((r) => r.arrayBuffer());
			const { error: uploadError } = await supabase.storage
				.from("avatars")
				.upload(`${userId}/${fileName}`, arrayBuffer, {
					contentType: `image/${fileExt}`,
				});

			if (uploadError) throw uploadError;

			const { data: urlData } = supabase.storage
				.from("avatars")
				.getPublicUrl(`${userId}/${fileName}`);

			return urlData.publicUrl;
		} catch (error) {
			console.error("Upload error:", error);
			return null;
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
			const {
				data: { session },
			} = await supabase.auth.getSession();
			if (!session) throw new Error("Oturum bulunamadı");

			let newAvatarUrl = avatarUrl;

			// If avatar is a local URI (not a Supabase URL), upload it
			if (avatarUrl && !avatarUrl.includes("supabase")) {
				const uploadedUrl = await uploadAvatar(avatarUrl);
				if (uploadedUrl) {
					newAvatarUrl = uploadedUrl;
				}
			}

			const { error } = await supabase
				.from("profiles")
				.update({
					username: username.trim(),
					display_name: displayName.trim(),
					avatar_url: newAvatarUrl,
					bio: bio.trim(),
					language: language,
					is_private: isPrivate,
					birthdate: birthDate,
					updated_at: new Date().toISOString(),
				})
				.eq("id", session.user.id);

			if (error) throw error;

			Alert.alert("Başarılı", "Profil güncellendi.", [
				{
					text: "Tamam",
					onPress: () => router.back(),
				},
			]);
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
					<TouchableOpacity
						onPress={handleBack}
						style={styles.backButton}>
						<MaterialIcons
							name="arrow-back"
							size={24}
							color={colors.text}
						/>
					</TouchableOpacity>
					<Text style={[styles.headerTitle, { color: colors.text }]}>
						Profili Düzenle
					</Text>
					<TouchableOpacity
						onPress={handleSave}
						disabled={isLoading}
						style={styles.saveButton}>
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
					</TouchableOpacity>
				</View>

				<KeyboardAvoidingView
					behavior={Platform.OS === "ios" ? "padding" : "height"}
					style={styles.keyboardAvoid}>
					<ScrollView
						showsVerticalScrollIndicator={false}
						contentContainerStyle={styles.scrollContainer}
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
										source={{
											uri: avatarUrl.includes("supabase")
												? avatarUrl
												: avatarUrl,
										}}
										style={styles.avatarImage}
									/>
								) : (
									<MaterialIcons
										name="person"
										size={64}
										color={colors.primary}
									/>
								)}
							</View>
							<TouchableOpacity
								style={[
									styles.changeAvatarButton,
									{ borderColor: colors.primary },
								]}
								onPress={pickImage}>
								<MaterialIcons
									name="camera-alt"
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
							</TouchableOpacity>
						</View>

						{/* Email Display */}
						<View
							style={[
								styles.emailSection,
								{
									backgroundColor: colors.cardBg,
									borderColor: colors.border,
								},
							]}>
							<Text
								style={[
									styles.emailLabel,
									{ color: colors.textSecondary },
								]}>
								E-posta
							</Text>
							<Text
								style={[
									styles.emailText,
									{ color: colors.text },
								]}>
								{userEmail || "Yükleniyor..."}
							</Text>
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
									<MaterialIcons
										name="alternate-email"
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
							<TouchableOpacity
								style={styles.inputGroup}
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
									<MaterialIcons
										name="language"
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
									<MaterialIcons
										name="chevron-right"
										size={24}
										color={colors.textSecondary}
									/>
								</View>
							</TouchableOpacity>

							{/* Birth Date */}
							<TouchableOpacity
								style={styles.inputGroup}
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
									<MaterialIcons
										name="cake"
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
									<MaterialIcons
										name="calendar-today"
										size={24}
										color={colors.textSecondary}
									/>
								</View>
							</TouchableOpacity>
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
									<MaterialIcons
										name="lock"
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
											Hesabınızı özel yapın
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
	emailSection: {
		padding: 16,
		borderRadius: 16,
		borderWidth: 1,
		marginBottom: 12,
	},
	emailLabel: {
		fontSize: 12,
		marginBottom: 4,
	},
	emailText: {
		fontSize: 16,
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
		fontSize: 16,
	},
	bioInputWrapper: {
		borderRadius: 12,
		borderWidth: 1.5,
		padding: 12,
		minHeight: 100,
	},
	bioTextInput: {
		fontSize: 16,
		minHeight: 60,
	},
	charCount: {
		fontSize: 12,
		textAlign: "right",
		marginTop: 8,
	},
	selectWrapper: {
		flexDirection: "row",
		alignItems: "center",
		height: 48,
		borderRadius: 12,
		borderWidth: 1.5,
		paddingHorizontal: 12,
	},
	selectText: {
		flex: 1,
		fontSize: 16,
		marginLeft: 10,
	},
	privacySection: {
		padding: 16,
		borderRadius: 16,
		borderWidth: 1,
	},
	privacyItem: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
	privacyTextContainer: {
		flexDirection: "row",
		alignItems: "center",
		flex: 1,
	},
	privacyIcon: {
		marginRight: 12,
	},
	privacyTitle: {
		fontSize: 16,
		fontWeight: "500",
	},
	privacyDescription: {
		fontSize: 12,
		marginTop: 2,
	},
});
