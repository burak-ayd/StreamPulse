// import { useAuthStore } from "@store/auth-store";
// import { supabase } from "@utils/supabase";
// import { Slot, useRouter, useSegments } from "expo-router";
// import { useEffect } from "react";
// import { View } from "react-native";

// export default function RootLayout() {
// 	const { session, setSession } = useAuthStore();
// 	const router = useRouter();
// 	const segments = useSegments();

// 	useEffect(() => {
// 		const {
// 			data: { subscription },
// 		} = supabase.auth.onAuthStateChange((_event, session) =>
// 			setSession(session),
// 		);
// 		return () => subscription.unsubscribe();
// 	}, []);

// 	useEffect(() => {
// 		const inAuthGroup = segments[0] === "(auth)";
// 		if (!session && !inAuthGroup) router.replace("/(auth)/login");
// 		if (session && inAuthGroup) router.replace("/(app)");
// 	}, [session, segments]);

// 	if (session === undefined) {
// 		return <View style={{ flex: 1, backgroundColor: "#121212" }} />;
// 	}
// 	return <Slot />;
// }

// src\app\_layout.jsx
// import { AuthProvider, useAuth } from "@context/AuthContext";
// import { Slot, useRouter, useSegments } from "expo-router";
// import { useEffect } from "react";
// import { ActivityIndicator, View } from "react-native";
// import { SafeAreaProvider } from "react-native-safe-area-context";

// function RootNavigation() {
// 	const { session, isInitialized } = useAuth();
// 	const segments = useSegments();
// 	const router = useRouter();

// 	useEffect(() => {
// 		if (!isInitialized) return;

// 		// Kullanıcının o anda hangi klasör grubunda olduğunu kontrol et
// 		const inAuthGroup = segments[0] === "(auth)";

// 		if (session && inAuthGroup) {
// 			// Kullanıcı login olduysa ve hala (auth) içindeyse, ana uygulamaya fırlat
// 			router.replace("/(app)");
// 		} else if (!session && !inAuthGroup) {
// 			// Kullanıcı çıkış yaptıysa ve (auth) dışında bir yerdeyse, login'e fırlat
// 			router.replace("/(auth)/login");
// 		}
// 	}, [session, isInitialized, segments]);

// 	if (!isInitialized) {
// 		return (
// 			<View
// 				style={{
// 					flex: 1,
// 					justifyContent: "center",
// 					alignItems: "center",
// 				}}>
// 				<ActivityIndicator size="large" color="#0000ff" />
// 			</View>
// 		);
// 	}

// 	return <Slot />;
// }

// export default function RootLayout() {
// 	console.log("1");
// 	return (
// 		<AuthProvider>
// 			<SafeAreaProvider>
// 				<RootNavigation />
// 			</SafeAreaProvider>
// 		</AuthProvider>
// 	);
// }

// src\app\_layout.jsx
import { AuthProvider, useAuth } from "@context/AuthContext";
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
		<AuthProvider>
			<SafeAreaProvider>
				<RootNavigation />
			</SafeAreaProvider>
		</AuthProvider>
	);
}
