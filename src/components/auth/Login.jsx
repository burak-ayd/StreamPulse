import { useThemeContext } from "@context/ThemeContext";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import { supabase } from "@utils/supabase";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React, { useCallback, useState } from "react";
import {
	Alert,
	Animated,
	Platform,
	ScrollView,
	StatusBar,
	StyleSheet,
	Text,
	TextInput,
	TouchableOpacity,
	View,
} from "react-native";
import {
	SafeAreaView,
	useSafeAreaInsets,
} from "react-native-safe-area-context";

export default function Login({
	onRegisterPress,
	onForgotPasswordPress,
	onLoginSuccess,
}) {
	const router = useRouter();

	const insets = useSafeAreaInsets();
	// Initialize theme based on system settings, but let user toggle for full preview!
	const { theme, colors } = useThemeContext();

	const [email, setEmail] = useState("test@gmail.com");
	const [password, setPassword] = useState("123456789");
	const [showPassword, setShowPassword] = useState(false);

	// Focus states for input highlight rings
	// 1. Focus state'leri BURADA KALMALI (Bunları silmiyoruz)
	const [isEmailFocused, setIsEmailFocused] = useState(false);
	const [isPasswordFocused, setIsPasswordFocused] = useState(false);

	const [isLoading, setIsLoading] = useState(false);

	const handleEmailFocus = useCallback(() => {
		setTimeout(() => setIsEmailFocused(true), 100);
	}, []);

	const handleEmailBlur = useCallback(() => {
		setIsEmailFocused(false);
	}, []);

	const handlePasswordFocus = useCallback(() => {
		setTimeout(() => setIsPasswordFocused(true), 100);
	}, []);

	const handlePasswordBlur = useCallback(() => {
		setIsPasswordFocused(false);
	}, []);

	// Animation state for button press scale feedback
	const buttonScale = React.useRef(new Animated.Value(1)).current;

	const handlePressIn = () => {
		Animated.spring(buttonScale, {
			toValue: 0.96,
			useNativeDriver: true,
		}).start();
	};

	const handlePressOut = () => {
		Animated.spring(buttonScale, {
			toValue: 1,
			useNativeDriver: true,
		}).start();
	};

	const handleLogin = async () => {
		if (!email || !password) {
			Alert.alert("Hata", "Email ve şifre boş bırakılamaz.");
			return;
		}
		setIsLoading(true);
		try {
			const { data, error } = await supabase.auth.signInWithPassword({
				email,
				password,
			});
			if (error) throw error;

			// console.log("User signed in:", data);

			// BAŞARILI GİRİŞ SONRASI MANUEL YÖNLENDİRME:
			router.replace("/(app)");
		} catch (error) {
			Alert.alert("Giriş Hatası", error.message);
		} finally {
			setIsLoading(false);
		}
	};
	const handleGoogleSignIn = async () => {
		const redirectTo = Linking.createURL("auth/callback");
		console.log(redirectTo);

		const { data } = await supabase.auth.signInWithOAuth({
			provider: "google",
			options: {
				redirectTo,
				skipBrowserRedirect: true,
			},
		});

		const result = await WebBrowser.openAuthSessionAsync(
			data.url,
			redirectTo,
		);

		console.log("result:", result);

		if (result.type !== "success") return;

		// Fragment'tan token'ları parse et (#access_token=...&refresh_token=...)
		const params = new URLSearchParams(result.url.split("#")[1]);
		const access_token = params.get("access_token");
		const refresh_token = params.get("refresh_token");

		if (access_token && refresh_token) {
			const { error } = await supabase.auth.setSession({
				access_token,
				refresh_token,
			});
			if (error) console.error(error);
			// session artık kuruldu, yönlendirme yapabilirsin
		}
	};

	return (
		<SafeAreaView
			edges={["top", "left", "right"]}
			style={[styles.safeArea, { backgroundColor: colors.bg }]}>
			<StatusBar
				barStyle={theme === "dark" ? "light-content" : "dark-content"}
				backgroundColor={colors.bg}
			/>

			{/* Floating Theme Toggle (Premium visual feedback feature) */}
			<TouchableOpacity
				style={[
					styles.themeToggle,
					{
						backgroundColor: colors.cardBg,
						borderColor: colors.border,
						top:
							insets.top > 0
								? insets.top + 10
								: Platform.OS === "ios"
									? 50
									: 20,
					},
				]}
				onPress={toggleTheme}
				activeOpacity={0.8}>
				<MaterialIcons
					name={theme === "dark" ? "light-mode" : "dark-mode"}
					size={20}
					color={colors.text}
				/>
			</TouchableOpacity>
			<ScrollView
				contentContainerStyle={styles.scrollContent}
				showsVerticalScrollIndicator={false}
				keyboardShouldPersistTaps="handled">
				<View style={styles.container}>
					{/* Logo Area */}
					<View style={styles.logoContainer}>
						<View
							style={[
								styles.iconWrapper,
								{ backgroundColor: colors.primary + "1A" },
							]}>
							<MaterialIcons
								name="movie"
								size={48}
								color={colors.primary}
							/>
						</View>
						<Text style={[styles.logoText, { color: colors.text }]}>
							CineVerse
						</Text>
					</View>

					{/* Headline */}
					<Text style={[styles.title, { color: colors.text }]}>
						Giriş Yap
					</Text>

					{/* Form Container */}
					<View style={styles.formContainer}>
						{/* Email Field */}
						<View style={styles.inputGroup}>
							<Text
								style={[styles.label, { color: colors.text }]}>
								E-posta veya Kullanıcı Adı
							</Text>
							<View
								style={[
									styles.inputWrapper,
									{
										backgroundColor: colors.cardBg,
										borderColor: isEmailFocused
											? colors.primary
											: colors.border,
									},
									// isEmailFocused &&
									// 	styles.inputFocusedShadow,
								]}>
								<TextInput
									style={[
										styles.input,
										{ color: colors.text },
									]}
									placeholder="E-posta veya kullanıcı adınızı girin"
									placeholderTextColor={colors.textMuted}
									value={email}
									onChangeText={setEmail}
									onFocus={handleEmailFocus}
									onBlur={handleEmailBlur}
									autoCapitalize="none"
									autoCorrect={false}
									autoComplete="off"
									textContentType="none"
									importantForAutofill="no"
								/>
							</View>
						</View>

						{/* Password Field */}
						<View style={styles.inputGroup}>
							<View style={styles.passwordHeader}>
								<Text
									style={[
										styles.label,
										{ color: colors.text },
									]}>
									Şifre
								</Text>
								<TouchableOpacity
									onPress={onForgotPasswordPress}
									activeOpacity={0.7}>
									<Text
										style={[
											styles.forgotPasswordText,
											{ color: colors.primary },
										]}>
										Şifremi Unuttum?
									</Text>
								</TouchableOpacity>
							</View>
							<View
								style={[
									styles.inputWrapper,
									styles.passwordInputRow,
									{
										backgroundColor: colors.cardBg,
										borderColor: isPasswordFocused
											? colors.primary
											: colors.border,
									},
									// isPasswordFocused &&
									// 	styles.inputFocusedShadow,
								]}>
								<TextInput
									style={[
										styles.input,
										styles.passwordInput,
										{ color: colors.text },
									]}
									placeholder="Şifrenizi girin"
									placeholderTextColor={colors.textMuted}
									secureTextEntry={!showPassword}
									autoComplete="off"
									textContentType="password"
									importantForAutofill="no"
									value={password}
									onChangeText={setPassword}
									onFocus={handlePasswordFocus}
									onBlur={handlePasswordBlur}
									autoCapitalize="none"
									autoCorrect={false}
								/>
								<TouchableOpacity
									onPress={() =>
										setShowPassword(!showPassword)
									}
									activeOpacity={0.7}
									style={styles.eyeIconWrapper}>
									<MaterialIcons
										name={
											showPassword
												? "visibility"
												: "visibility-off"
										}
										size={22}
										color={colors.textSecondary}
									/>
								</TouchableOpacity>
							</View>
						</View>
					</View>

					{/* Login Button */}
					<Animated.View
						style={{
							transform: [{ scale: buttonScale }],
							width: "100%",
						}}>
						<TouchableOpacity
							style={[
								styles.loginButton,
								{ backgroundColor: colors.primary },
							]}
							activeOpacity={0.9}
							onPressIn={handlePressIn}
							onPressOut={handlePressOut}
							onPress={handleLogin}>
							<Text style={styles.loginButtonText}>
								Giriş Yap
							</Text>
						</TouchableOpacity>
					</Animated.View>

					{/* Social Login Divider */}
					<View style={styles.dividerContainer}>
						<View
							style={[
								styles.dividerLine,
								{ backgroundColor: colors.border },
							]}
						/>
						<Text
							style={[
								styles.dividerText,
								{ color: colors.textSecondary },
							]}>
							veya şununla devam et
						</Text>
						<View
							style={[
								styles.dividerLine,
								{ backgroundColor: colors.border },
							]}
						/>
					</View>

					{/* Social Login Buttons */}
					<View style={styles.socialContainer}>
						<TouchableOpacity
							style={[
								styles.socialButton,
								{
									backgroundColor: colors.cardBg,
									borderColor: colors.border,
								},
							]}
							activeOpacity={0.8}
							onPress={handleGoogleSignIn}>
							<Ionicons
								size={28}
								name="logo-google"
								color="#fff" // Force white for better contrast
							/>
						</TouchableOpacity>
					</View>

					{/* Register Footer */}
					<View style={styles.footerContainer}>
						<Text
							style={[
								styles.footerText,
								{ color: colors.textSecondary },
							]}>
							Hesabın yok mu?{" "}
						</Text>
						<TouchableOpacity
							onPress={onRegisterPress}
							activeOpacity={0.7}>
							<Text
								style={[
									styles.signUpLink,
									{ color: colors.primary },
								]}>
								Kaydol
							</Text>
						</TouchableOpacity>
					</View>
				</View>
			</ScrollView>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safeArea: {
		flex: 1,
	},
	keyboardAvoidingView: {
		flex: 1,
	},
	scrollContent: {
		flexGrow: 1,
		justifyContent: "center",
		paddingHorizontal: 24,
		paddingVertical: 40,
	},
	container: {
		alignItems: "center",
		width: "100%",
		maxWidth: 400,
		alignSelf: "center",
	},
	themeToggle: {
		position: "absolute",
		top: Platform.OS === "ios" ? 50 : 20,
		right: 20,
		zIndex: 10,
		width: 40,
		height: 40,
		borderRadius: 20,
		justifyContent: "center",
		alignItems: "center",
		borderWidth: 1,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 4,
		elevation: 3,
	},
	logoContainer: {
		alignItems: "center",
		marginBottom: 20,
	},
	iconWrapper: {
		width: 80,
		height: 80,
		borderRadius: 40,
		justifyContent: "center",
		alignItems: "center",
		marginBottom: 12,
	},
	logoText: {
		fontSize: 32,
		fontWeight: "bold",
		letterSpacing: 0.5,
	},
	title: {
		fontSize: 28,
		fontWeight: "bold",
		marginBottom: 32,
		textAlign: "center",
	},
	formContainer: {
		width: "100%",
		gap: 20,
		marginBottom: 28,
	},
	inputGroup: {
		width: "100%",
	},
	label: {
		fontSize: 15,
		fontWeight: "600",
		marginBottom: 8,
	},
	passwordHeader: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginBottom: 8,
	},
	forgotPasswordText: {
		fontSize: 13,
		fontWeight: "500",
		textDecorationLine: "underline",
	},
	inputWrapper: {
		width: "100%",
		height: 56,
		borderRadius: 12,
		borderWidth: 1.5,
		paddingHorizontal: 16,
		justifyContent: "center",
	},
	passwordInputRow: {
		flexDirection: "row",
		alignItems: "center",
		paddingRight: 8,
	},
	input: {
		flex: 1,
		fontSize: 16,
		height: "100%",
		paddingVertical: 0,
	},
	passwordInput: {
		paddingRight: 10,
	},
	eyeIconWrapper: {
		height: "100%",
		justifyContent: "center",
		paddingHorizontal: 10,
	},
	inputFocusedShadow: {
		shadowColor: "#ea2a33",
		shadowOffset: { width: 0, height: 0 },
		shadowOpacity: 0.2,
		shadowRadius: 6,
		elevation: 4,
	},
	loginButton: {
		width: "100%",
		height: 52,
		borderRadius: 12,
		justifyContent: "center",
		alignItems: "center",
		shadowColor: "#ea2a33",
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.3,
		shadowRadius: 8,
		elevation: 6,
	},
	loginButtonText: {
		color: "#ffffff",
		fontSize: 16,
		fontWeight: "bold",
		letterSpacing: 0.5,
	},
	dividerContainer: {
		flexDirection: "row",
		alignItems: "center",
		marginVertical: 32,
		width: "100%",
	},
	dividerLine: {
		flex: 1,
		height: 1,
		opacity: 0.5,
	},
	dividerText: {
		fontSize: 14,
		marginHorizontal: 12,
	},
	socialContainer: {
		flexDirection: "row",
		justifyContent: "center",
		gap: 16,
		marginBottom: 32,
	},
	socialButton: {
		width: 52,
		height: 52,
		borderRadius: 26,
		borderWidth: 1,
		justifyContent: "center",
		alignItems: "center",
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 1 },
		shadowOpacity: 0.1,
		shadowRadius: 2,
		elevation: 2,
	},
	socialIcon: {
		width: 24,
		height: 24,
	},
	appleIconDark: {
		tintColor: "#ffffff",
	},
	footerContainer: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
	},
	footerText: {
		fontSize: 14,
	},
	signUpLink: {
		fontSize: 14,
		fontWeight: "bold",
	},
});
