import { ThemeProvider } from "@/context/ThemeContext";
import { PlayerSettingsProvider } from "@/context/PlayerSettingsContext";
import { Slot } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";

export default function RootLayout() {
	return (
		<ThemeProvider>
			<PlayerSettingsProvider>
				<SafeAreaProvider>
					<Slot />
				</SafeAreaProvider>
			</PlayerSettingsProvider>
		</ThemeProvider>
	);
}

