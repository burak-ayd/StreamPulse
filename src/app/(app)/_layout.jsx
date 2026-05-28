// src\app\(app)\_layout.jsx
import { DarkTheme, DefaultTheme, Slot, ThemeProvider } from "expo-router";
import { useColorScheme } from "react-native";
console.log("2 - AppLayout Çalıştı");

export default function AppLayout() {
	const colorScheme = useColorScheme();
	// Yönlendirme mantığı tamamen RootLayout'a taşındı.
	return (
		<ThemeProvider
			value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
			<Slot />
		</ThemeProvider>
	);
}
