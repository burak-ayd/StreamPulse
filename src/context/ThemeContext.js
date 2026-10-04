//src/context/ThemeContext.js
import { Colors, ColorsM3 } from "@constants/theme";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useState } from "react";
import { useColorScheme } from "react-native";

const ThemeContext = createContext(null);
const THEME_STORAGE_KEY = "app_theme_preference";

export function ThemeProvider({ children }) {
	const systemColorScheme = useColorScheme();
	const [theme, setTheme] = useState(null);
	const [isInitialized, setIsInitialized] = useState(false);

	useEffect(() => {
		// Kaydedilmiş tema tercihini yükle
		const loadTheme = async () => {
			try {
				const savedTheme =
					await AsyncStorage.getItem(THEME_STORAGE_KEY);
				if (savedTheme) {
					// Kullanıcı daha önce tema seçmişse onu kullan
					setTheme(savedTheme);
				} else {
					// İlk kez ise cihaz temasını kullan
					const deviceTheme = systemColorScheme || "dark";
					setTheme(deviceTheme);
				}
			} catch (error) {
				console.error("Tema yüklenirken hata:", error);
				// Hata durumunda cihaz temasını kullan
				setTheme(systemColorScheme || "dark");
			} finally {
				setIsInitialized(true);
			}
		};

		loadTheme();
	}, [systemColorScheme]);

	const toggleTheme = async () => {
		try {
			const newTheme = theme === "dark" ? "light" : "dark";
			setTheme(newTheme);
			// Tema tercihini kaydet
			await AsyncStorage.setItem(THEME_STORAGE_KEY, newTheme);
		} catch (error) {
			console.error("Tema kaydedilirken hata:", error);
		}
	};

	const colors = Colors[theme] ?? Colors.dark; // null guard
	// Material 3 yüzey rampası. Yeni tasarım dili (profil ekranı) eski
	// `colors.cardBg`/`colors.text` yerine bu rampayı kullanır; iki set
	// birbirine karışmasın diye ayrı bir alan olarak sunulur.
	const m3 = ColorsM3[theme] ?? ColorsM3.dark;

	return (
		<ThemeContext.Provider
			value={{
				theme,
				colors,
				m3,
				isInitialized,
				toggleTheme,
			}}>
			{children}
		</ThemeContext.Provider>
	);
}

export function useThemeContext() {
	const context = useContext(ThemeContext);
	if (!context)
		throw new Error("useThemeContext, ThemeProvider içinde kullanılmalı");
	return context;
}
