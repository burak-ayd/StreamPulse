// app/_layout.jsx
import { AuthProvider, useAuth } from "@context/AuthContext";
import { ThemeProvider } from "@context/ThemeContext";
import { Slot, useRouter, useSegments } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

function RootNavigation() {
	const { session, isInitialized } = useAuth();
	const segments = useSegments();
	const router = useRouter();

	useEffect(() => {
		if (!isInitialized) return;

		const currentGroup = segments[0];

		// Expo Router'ın tamamen hazır olmasını ve render döngüsünün bitmesini garantiye alıyoruz
		const timeout = setTimeout(() => {
			if (session) {
				// Kullanıcı giriş yapmış ama hala auth sayfalarındaysa
				if (
					currentGroup === "(auth)" ||
					currentGroup === "login" ||
					currentGroup === "register"
				) {
					console.log("--> Yönlendiriliyor: (app)");
					router.replace("/(app)");
				}
			} else {
				// Kullanıcı giriş yapmamış ama içerideki korumalı sayfalardaysa
				if (currentGroup !== "(auth)") {
					console.log("--> Yönlendiriliyor: (auth)/login");
					router.replace("/(auth)/login");
				}
			}
		}, 1); // 1 milisaniyelik gecikme router'ı uyandırmak için yeterlidir

		return () => clearTimeout(timeout);
	}, [session, isInitialized, segments]);

	if (!isInitialized) {
		return (
			<View
				style={{
					flex: 1,
					justifyContent: "center",
					alignItems: "center",
				}}>
				<ActivityIndicator size="large" color="#0000ff" />
			</View>
		);
	}

	return <Slot />;
}

export default function RootLayout() {
	console.log("1 - RootLayout Render Edildi");
	return (
		<ThemeProvider>
			<AuthProvider>
				<SafeAreaProvider>
					<RootNavigation />
				</SafeAreaProvider>
			</AuthProvider>
		</ThemeProvider>
	);
}
