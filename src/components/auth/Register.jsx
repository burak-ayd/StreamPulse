import { useThemeContext } from "@context/ThemeContext";
import { MaterialIcons } from "@expo/vector-icons";
import { supabase } from "@utils/supabase";
import React, { useState } from "react";
import {
	Animated,
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
import {
	SafeAreaView as RNSafeAreaView,
	useSafeAreaInsets,
} from "react-native-safe-area-context";

export default function Register({ onLoginPress, onRegisterSuccess }) {
	const insets = useSafeAreaInsets();
	const { theme, colors } = useThemeContext();

	const [username, setUsername] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [showPassword, setShowPassword] = useState(false);

	// Focus states for input highlight rings
	const [isUsernameFocused, setIsUsernameFocused] = useState(false);
	const [isEmailFocused, setIsEmailFocused] = useState(false);
	const [isPasswordFocused, setIsPasswordFocused] = useState(false);

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

	const handleRegister = async () => {
		console.log("Register details:", { username, email, password });
		const { data, error } = await supabase.auth.signUp({
			email,
			password,
			options: {
				data: {
					username,
					full_name: username,
					avatar_url: null,
				},
			},
		});

		if (error) {
			console.log("Error registering:", error);
		} else {
			console.log("User registered:", data);
			onRegisterSuccess();
		}
	};

	return (
		<RNSafeAreaView
			edges={["top", "left", "right"]}
			style={[styles.safeArea, { backgroundColor: colors.bg }]}>
			<StatusBar
				barStyle={theme === "dark" ? "light-content" : "dark-content"}
				backgroundColor={colors.bg}
			/>

			{/* Floating Theme Toggle */}
			{/* <TouchableOpacity
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
			</TouchableOpacity> */}

			<KeyboardAvoidingView
				behavior={Platform.OS === "ios" ? "padding" : "height"}
				style={styles.keyboardAvoidingView}>
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
							<Text
								style={[
									styles.logoText,
									{ color: colors.text },
								]}>
								CineVerse
							</Text>
						</View>

						{/* Header */}
						<View style={styles.headerContainer}>
							<Text
								style={[styles.title, { color: colors.text }]}>
								Hesap Oluştur
							</Text>
							<Text
								style={[
									styles.subtitle,
									{ color: colors.textSecondary },
								]}>
								Aramıza katılmak için bilgileri doldur.
							</Text>
						</View>

						{/* Form Container */}
						<View style={styles.formContainer}>
							{/* Username Field */}
							<View style={styles.inputGroup}>
								<Text
									style={[
										styles.label,
										{ color: colors.text },
									]}>
									Kullanıcı Adı
								</Text>
								<View
									style={[
										styles.inputWrapper,
										{
											backgroundColor: colors.cardBg,
											borderColor: isUsernameFocused
												? colors.primary
												: colors.inputBorder,
										},
										// isUsernameFocused &&
										// 	styles.inputFocusedShadow,
									]}>
									<MaterialIcons
										name="person"
										size={20}
										color={colors.textMuted}
										style={styles.leftIcon}
									/>
									<TextInput
										style={[
											styles.input,
											{ color: colors.text },
										]}
										placeholder="kullaniciadiniz"
										placeholderTextColor={colors.textMuted}
										value={username}
										onChangeText={setUsername}
										onFocus={() =>
											setIsUsernameFocused(true)
										}
										onBlur={() =>
											setIsUsernameFocused(false)
										}
										autoCapitalize="none"
										autoCorrect={false}
									/>
								</View>
							</View>

							{/* Email Field */}
							<View style={styles.inputGroup}>
								<Text
									style={[
										styles.label,
										{ color: colors.text },
									]}>
									E-posta
								</Text>
								<View
									style={[
										styles.inputWrapper,
										{
											backgroundColor: colors.cardBg,
											borderColor: isEmailFocused
												? colors.primary
												: colors.inputBorder,
										},
										// isEmailFocused &&
										// 	styles.inputFocusedShadow,
									]}>
									<MaterialIcons
										name="mail"
										size={20}
										color={colors.textMuted}
										style={styles.leftIcon}
									/>
									<TextInput
										style={[
											styles.input,
											{ color: colors.text },
										]}
										placeholder="ornek@email.com"
										placeholderTextColor={colors.textMuted}
										value={email}
										onChangeText={setEmail}
										onFocus={() => setIsEmailFocused(true)}
										onBlur={() => setIsEmailFocused(false)}
										keyboardType="email-address"
										autoCapitalize="none"
										autoCorrect={false}
									/>
								</View>
							</View>

							{/* Password Field */}
							<View style={styles.inputGroup}>
								<Text
									style={[
										styles.label,
										{ color: colors.text },
									]}>
									Şifre
								</Text>
								<View
									style={[
										styles.inputWrapper,
										{
											backgroundColor: colors.cardBg,
											borderColor: isPasswordFocused
												? colors.primary
												: colors.inputBorder,
										},
										// isPasswordFocused &&
										// 	styles.inputFocusedShadow,
									]}>
									<MaterialIcons
										name="lock"
										size={20}
										color={colors.textMuted}
										style={styles.leftIcon}
									/>
									<TextInput
										style={[
											styles.input,
											styles.passwordInput,
											{ color: colors.text },
										]}
										placeholder="••••••••••"
										placeholderTextColor={colors.textMuted}
										secureTextEntry={!showPassword}
										value={password}
										onChangeText={setPassword}
										onFocus={() =>
											setIsPasswordFocused(true)
										}
										onBlur={() =>
											setIsPasswordFocused(false)
										}
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
											size={20}
											color={colors.textMuted}
										/>
									</TouchableOpacity>
								</View>
							</View>
						</View>

						{/* Register Button */}
						<Animated.View
							style={{
								transform: [{ scale: buttonScale }],
								width: "100%",
								marginTop: 16,
							}}>
							<TouchableOpacity
								style={[
									styles.registerButton,
									{ backgroundColor: colors.primary },
								]}
								activeOpacity={0.9}
								onPressIn={handlePressIn}
								onPressOut={handlePressOut}
								onPress={handleRegister}>
								<Text style={styles.registerButtonText}>
									Kaydol
								</Text>
							</TouchableOpacity>
						</Animated.View>

						{/* Login Footer */}
						<View style={styles.footerContainer}>
							<Text
								style={[
									styles.footerText,
									{ color: colors.textSecondary },
								]}>
								Zaten bir hesabın var mı?{" "}
							</Text>
							<TouchableOpacity
								onPress={onLoginPress}
								activeOpacity={0.7}>
								<Text
									style={[
										styles.loginLink,
										{ color: colors.primary },
									]}>
									Giriş Yap
								</Text>
							</TouchableOpacity>
						</View>
					</View>
				</ScrollView>
			</KeyboardAvoidingView>
		</RNSafeAreaView>
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
	headerContainer: {
		width: "100%",
		alignItems: "center",
		marginBottom: 40,
	},
	title: {
		fontSize: 32,
		fontWeight: "bold",
		textAlign: "center",
		letterSpacing: -0.5,
	},
	subtitle: {
		fontSize: 16,
		textAlign: "center",
		marginTop: 8,
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
		fontSize: 16,
		fontWeight: "500",
		marginBottom: 8,
	},
	inputWrapper: {
		width: "100%",
		height: 56,
		borderRadius: 8,
		borderWidth: 1,
		paddingLeft: 12,
		paddingRight: 12,
		flexDirection: "row",
		alignItems: "center",
	},
	leftIcon: {
		marginRight: 12,
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
		paddingLeft: 10,
	},
	inputFocusedShadow: {
		shadowColor: "#ea2a33",
		shadowOffset: { width: 0, height: 0 },
		shadowOpacity: 0.15,
		shadowRadius: 4,
		elevation: 2,
	},
	registerButton: {
		width: "100%",
		height: 56,
		borderRadius: 8,
		justifyContent: "center",
		alignItems: "center",
		shadowColor: "#ea2a33",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.2,
		shadowRadius: 4,
		elevation: 3,
	},
	registerButtonText: {
		color: "#ffffff",
		fontSize: 16,
		fontWeight: "bold",
	},
	footerContainer: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		marginTop: 32,
	},
	footerText: {
		fontSize: 14,
	},
	loginLink: {
		fontSize: 14,
		fontWeight: "600",
	},
});
