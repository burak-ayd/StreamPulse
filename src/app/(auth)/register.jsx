/**
 * Kayıt Ekranı
 *
 * E-posta + kullanıcı adı + parola ile kayıt.
 * "Hesabın var mı? Giriş yap" linki ile login'e yönlendirir.
 */

import TVPressable from "@/components/common/TVPressable";
import { useAuth } from "@/context/AuthContext";
import { useThemeContext } from "@/context/ThemeContext";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
	ActivityIndicator,
	BackHandler,
	KeyboardAvoidingView,
	Platform,
	ScrollView,
	StatusBar,
	StyleSheet,
	Text,
	TextInput,
	TouchableOpacity,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function RegisterScreen() {
	const { colors, theme } = useThemeContext();
	const { signup } = useAuth();
	const router = useRouter();

	const [email, setEmail] = useState("");
	const [username, setUsername] = useState("");
	const [displayName, setDisplayName] = useState("");
	const [password, setPassword] = useState("");
	const [showPassword, setShowPassword] = useState(false);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState("");

	useFocusEffect(
		useCallback(() => {
			const onBackPress = () => {
				if (router.canGoBack()) {
					router.back();
				} else {
					router.replace("/(app)");
				}
				return true;
			};
			const sub = BackHandler.addEventListener(
				"hardwareBackPress",
				onBackPress,
			);
			return () => sub.remove();
		}, [router]),
	);

	const handleRegister = async () => {
		if (!email.trim()) {
			setError("E-posta adresi gereklidir.");
			return;
		}
		if (!username.trim()) {
			setError("Kullanıcı adı gereklidir.");
			return;
		}
		if (username.trim().length < 3) {
			setError("Kullanıcı adı en az 3 karakter olmalıdır.");
			return;
		}
		if (!password || password.length < 6) {
			setError("Parola en az 6 karakter olmalıdır.");
			return;
		}

		setError("");
		setIsSubmitting(true);

		try {
			await signup({
				email: email.trim().toLowerCase(),
				password,
				username: username.trim(),
				display_name: displayName.trim() || username.trim(),
			});
			// Başarılı — AuthContext isLoggedIn=true olacak, layout geri yönlendirir
		} catch (err) {
			setError(err.message || "Kayıt başarısız. Lütfen tekrar deneyin.");
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<>
			<Stack.Screen options={{ headerShown: false }} />
			<SafeAreaView
				style={[styles.container, { backgroundColor: colors.bg }]}>
				<StatusBar
					barStyle={
						theme === "dark" ? "light-content" : "dark-content"
					}
					backgroundColor={colors.bg}
				/>
				<KeyboardAvoidingView
					behavior={Platform.OS === "ios" ? "padding" : "height"}
					style={styles.flex}>
					<ScrollView
						contentContainerStyle={styles.scrollContent}
						keyboardShouldPersistTaps="handled"
						showsVerticalScrollIndicator={false}>
						{/* Geri düğmesi */}
						<TVPressable
							style={styles.backButton}
							focusedStyle={styles.headerButtonFocused}
							onPress={() =>
								router.canGoBack()
									? router.back()
									: router.replace("/(app)")
							}
							activeOpacity={0.7}>
							<Ionicons
								name="close"
								size={28}
								color={colors.text}
							/>
						</TVPressable>

						{/* Başlık */}
						<View style={styles.headerSection}>
							<View
								style={[
									styles.iconCircle,
									{
										backgroundColor:
											"rgba(56, 189, 248, 0.12)",
									},
								]}>
								<Ionicons
									name="person-add-outline"
									size={36}
									color="#38bdf8"
								/>
							</View>
							<Text
								style={[styles.title, { color: colors.text }]}>
								Hesap Oluştur
							</Text>
							<Text
								style={[
									styles.subtitle,
									{ color: colors.textSecondary },
								]}>
								Favori ve listelerini tüm cihazlarında
								senkronize et
							</Text>
						</View>

						{/* Hata mesajı */}
						{error ? (
							<View style={styles.errorContainer}>
								<Ionicons
									name="alert-circle"
									size={18}
									color="#ef4444"
								/>
								<Text style={styles.errorText}>{error}</Text>
							</View>
						) : null}

						{/* Form */}
						<View style={styles.formSection}>
							<View style={styles.inputGroup}>
								<Text
									style={[
										styles.inputLabel,
										{ color: colors.textSecondary },
									]}>
									E-posta
								</Text>
								<View
									style={[
										styles.inputWrapper,
										{
											backgroundColor: colors.cardBg,
											borderColor: colors.border,
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
											styles.input,
											{ color: colors.text },
										]}
										placeholder="ornek@email.com"
										placeholderTextColor={
											colors.textSecondary
										}
										value={email}
										onChangeText={setEmail}
										keyboardType="email-address"
										autoCapitalize="none"
										autoComplete="email"
										autoCorrect={false}
									/>
								</View>
							</View>

							<View style={styles.inputGroup}>
								<Text
									style={[
										styles.inputLabel,
										{ color: colors.textSecondary },
									]}>
									Kullanıcı Adı
								</Text>
								<View
									style={[
										styles.inputWrapper,
										{
											backgroundColor: colors.cardBg,
											borderColor: colors.border,
										},
									]}>
									<Ionicons
										name="at-outline"
										size={20}
										color={colors.textSecondary}
										style={styles.inputIcon}
									/>
									<TextInput
										style={[
											styles.input,
											{ color: colors.text },
										]}
										placeholder="sinemasever"
										placeholderTextColor={
											colors.textSecondary
										}
										value={username}
										onChangeText={setUsername}
										autoCapitalize="none"
										autoCorrect={false}
									/>
								</View>
							</View>

							<View style={styles.inputGroup}>
								<Text
									style={[
										styles.inputLabel,
										{ color: colors.textSecondary },
									]}>
									Görünen Ad (isteğe bağlı)
								</Text>
								<View
									style={[
										styles.inputWrapper,
										{
											backgroundColor: colors.cardBg,
											borderColor: colors.border,
										},
									]}>
									<Ionicons
										name="person-outline"
										size={20}
										color={colors.textSecondary}
										style={styles.inputIcon}
									/>
									<TextInput
										style={[
											styles.input,
											{ color: colors.text },
										]}
										placeholder="Sinema Sever"
										placeholderTextColor={
											colors.textSecondary
										}
										value={displayName}
										onChangeText={setDisplayName}
										autoCorrect={false}
									/>
								</View>
							</View>

							<View style={styles.inputGroup}>
								<Text
									style={[
										styles.inputLabel,
										{ color: colors.textSecondary },
									]}>
									Parola
								</Text>
								<View
									style={[
										styles.inputWrapper,
										{
											backgroundColor: colors.cardBg,
											borderColor: colors.border,
										},
									]}>
									<Ionicons
										name="lock-closed-outline"
										size={20}
										color={colors.textSecondary}
										style={styles.inputIcon}
									/>
									<TextInput
										style={[
											styles.input,
											{ color: colors.text },
										]}
										placeholder="En az 6 karakter"
										placeholderTextColor={
											colors.textSecondary
										}
										value={password}
										onChangeText={setPassword}
										secureTextEntry={!showPassword}
										autoCapitalize="none"
										autoComplete="new-password"
									/>
									<TVPressable
										onPress={() =>
											setShowPassword(!showPassword)
										}
										style={styles.eyeButton}
										focusedStyle={styles.eyeButtonFocused}>
										<Ionicons
											name={
												showPassword
													? "eye-off-outline"
													: "eye-outline"
											}
											size={20}
											color={colors.textSecondary}
										/>
									</TVPressable>
								</View>
							</View>

							{/* Kayıt butonu */}
							<TVPressable
								style={[
									styles.primaryButton,
									isSubmitting && styles.disabledButton,
								]}
								focusedStyle={styles.primaryButtonFocused}
								onPress={handleRegister}
								disabled={isSubmitting}
								activeOpacity={0.8}>
								{isSubmitting ? (
									<ActivityIndicator
										color="#fff"
										size="small"
									/>
								) : (
									<Text style={styles.primaryButtonText}>
										Hesap Oluştur
									</Text>
								)}
							</TVPressable>
						</View>

						{/* Alt link */}
						<View style={styles.footerSection}>
							<Text
								style={[
									styles.footerText,
									{ color: colors.textSecondary },
								]}>
								Zaten hesabın var mı?{" "}
							</Text>
							<TVPressable
								focusedStyle={styles.footerLinkFocused}
								onPress={() => router.replace("/(auth)/login")}>
								<Text style={styles.footerLink}>Giriş Yap</Text>
							</TVPressable>
						</View>
					</ScrollView>
				</KeyboardAvoidingView>
			</SafeAreaView>
		</>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
	},
	flex: {
		flex: 1,
	},
	scrollContent: {
		flexGrow: 1,
		paddingHorizontal: 24,
		paddingBottom: 40,
	},
	backButton: {
		width: 44,
		height: 44,
		borderRadius: 22,
		justifyContent: "center",
		alignItems: "center",
		marginTop: 8,
		marginLeft: -8,
	},
	headerSection: {
		alignItems: "center",
		marginTop: 16,
		marginBottom: 28,
	},
	iconCircle: {
		width: 72,
		height: 72,
		borderRadius: 36,
		justifyContent: "center",
		alignItems: "center",
		marginBottom: 20,
	},
	title: {
		fontSize: 28,
		fontWeight: "700",
		marginBottom: 8,
		letterSpacing: -0.5,
	},
	subtitle: {
		fontSize: 15,
		textAlign: "center",
		lineHeight: 22,
		maxWidth: 280,
	},
	errorContainer: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: "rgba(239, 68, 68, 0.1)",
		borderRadius: 12,
		paddingHorizontal: 14,
		paddingVertical: 12,
		marginBottom: 20,
		gap: 8,
	},
	errorText: {
		color: "#ef4444",
		fontSize: 14,
		flex: 1,
	},
	formSection: {
		gap: 18,
	},
	inputGroup: {
		gap: 8,
	},
	inputLabel: {
		fontSize: 14,
		fontWeight: "600",
		marginLeft: 4,
	},
	inputWrapper: {
		flexDirection: "row",
		alignItems: "center",
		borderRadius: 14,
		borderWidth: 1,
		height: 52,
		paddingHorizontal: 14,
	},
	inputIcon: {
		marginRight: 10,
	},
	input: {
		flex: 1,
		fontSize: 16,
		height: "100%",
	},
	eyeButton: {
		padding: 4,
		marginLeft: 8,
	},
	primaryButton: {
		backgroundColor: "#38bdf8",
		borderRadius: 14,
		height: 52,
		justifyContent: "center",
		alignItems: "center",
		marginTop: 8,
	},
	disabledButton: {
		opacity: 0.6,
	},
	primaryButtonText: {
		color: "#fff",
		fontSize: 17,
		fontWeight: "700",
	},
	footerSection: {
		flexDirection: "row",
		justifyContent: "center",
		alignItems: "center",
		marginTop: 28,
	},
	footerText: {
		fontSize: 15,
	},
	footerLink: {
		fontSize: 15,
		fontWeight: "700",
		color: "#38bdf8",
	},
	headerButtonFocused: {
		backgroundColor: "rgba(229, 9, 20, 0.2)",
		borderRadius: 22,
		transform: [{ scale: 1.1 }],
	},
	eyeButtonFocused: {
		backgroundColor: "rgba(229, 9, 20, 0.15)",
		borderRadius: 8,
	},
	primaryButtonFocused: {
		borderWidth: 2,
		borderColor: "#FFFFFF",
		backgroundColor: "#0284c7",
		transform: [{ scale: 1.02 }],
	},
	footerLinkFocused: {
		borderWidth: 1,
		borderColor: "#38bdf8",
		backgroundColor: "rgba(56, 189, 248, 0.15)",
		borderRadius: 6,
		paddingHorizontal: 6,
		paddingVertical: 2,
	},
});
