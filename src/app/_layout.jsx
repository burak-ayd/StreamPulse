// src/app/_layout.jsx
import { ThemeProvider } from "@context/ThemeContext";
import { Slot } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";

export default function RootLayout() {
	return (
		<ThemeProvider>
			<SafeAreaProvider>
				<Slot />
			</SafeAreaProvider>
		</ThemeProvider>
	);
}
