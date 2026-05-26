// src\app\(auth)\_layout.jsx
// import { useAuth } from "@context/AuthContext";
// import { Redirect, Slot } from "expo-router";

// export default function AuthLayout() {
// 	const { session, isInitialized } = useAuth();
// 	console.log("3");

// 	if (!isInitialized) return null;

// 	// Giriş yapılmışsa direkt uygulamaya gönder
// 	if (session) return <Redirect href="/(app)" />;

// 	return <Slot />;
// }

// src\app\(auth)\_layout.jsx
import { Slot } from "expo-router";
console.log("3 - AuthLayout Çalıştı");

export default function AuthLayout() {
	// Yönlendirme mantığı tamamen RootLayout'a taşındı.
	return <Slot />;
}
