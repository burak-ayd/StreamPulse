import { AuthProvider } from "@/context/AuthContext";
import { SyncProvider } from "@/context/SyncContext";
import { LanguageDisplayProvider } from "@/context/LanguageDisplayContext";
import { PlayerSettingsProvider } from "@/context/PlayerSettingsContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { Slot } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";

export default function RootLayout() {
	return (
		<ThemeProvider>
			<AuthProvider>
				<SyncProvider>
					<PlayerSettingsProvider>
						<LanguageDisplayProvider>
							<SafeAreaProvider>
								<Slot />
							</SafeAreaProvider>
						</LanguageDisplayProvider>
					</PlayerSettingsProvider>
				</SyncProvider>
			</AuthProvider>
		</ThemeProvider>
	);
}
