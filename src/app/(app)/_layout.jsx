// import { useAuth } from "@context/AuthContext";
// import { Redirect, Slot } from "expo-router";

// export default function AppLayout() {
// 	const { session, isInitialized } = useAuth();
// 	console.log("isInitialized:", isInitialized);
// 	console.log("app layout session:", session);

// 	if (!isInitialized) return null;

// 	// Giriş yapılmamışsa login'e gönder
// 	if (!session) return <Redirect href="/(auth)/register" />;

// 	return <Slot />;
// }

// // src\app\(app)\_layout.jsx
// import { useAuth } from "@context/AuthContext";
// import { Redirect, Slot } from "expo-router";
// import { ActivityIndicator, View } from "react-native";

// export default function AppLayout() {
// 	const { session, isInitialized } = useAuth();
// 	console.log("2");

// 	if (!isInitialized) {
// 		return (
// 			<View
// 				style={{
// 					flex: 1,
// 					justifyContent: "center",
// 					alignItems: "center",
// 				}}>
// 				<ActivityIndicator size="large" />
// 			</View>
// 		);
// 	}

// 	// Oturum yoksa auth grubundaki login sayfasına fırlat
// 	if (!session) {
// 		return <Redirect href="/(auth)/login" />; // veya register hangisini istiyorsan
// 	}

// 	return <Slot />;
// }

// src\app\(app)\_layout.jsx
import { Slot } from "expo-router";
console.log("2 - AppLayout Çalıştı");

export default function AppLayout() {
	// Yönlendirme mantığı tamamen RootLayout'a taşındı.
	return <Slot />;
}
