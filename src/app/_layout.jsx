import { AuthProvider } from "@/context/AuthContext";
import { SyncProvider } from "@/context/SyncContext";
import { LanguageDisplayProvider } from "@/context/LanguageDisplayContext";
import { PlayerSettingsProvider } from "@/context/PlayerSettingsContext";
import { ThemeProvider } from "@/context/ThemeContext";
import * as ScreenOrientation from "expo-screen-orientation";
import { Slot } from "expo-router";
import React, { useEffect } from "react";
import { Platform } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

export default function RootLayout() {
	useEffect(() => {
		async function lockTVOrientation() {
			try {
				if (Platform.isTV) {
					// TV ise daima yatay (Landscape) olarak kilitle
					await ScreenOrientation.lockAsync(
						ScreenOrientation.OrientationLock.LANDSCAPE
					);
				} else {
					// Telefon veya tablet ise serbest bırak veya varsayılan portre yap
					await ScreenOrientation.unlockAsync();
				}
			} catch (e) {
				console.warn("Ekran yönü kilitlenirken hata oluştu:", e);
			}
		}

		lockTVOrientation();
	}, []);

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
