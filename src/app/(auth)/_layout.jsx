// src/app/(auth)/_layout.jsx
import { Slot } from "expo-router";
console.log("3 - AuthLayout Çalıştı");

export default function AuthLayout() {
	// Yönlendirme mantığı tamamen RootLayout'a taşındı.
	return <Slot />;
}
