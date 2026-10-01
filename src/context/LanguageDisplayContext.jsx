import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useState } from "react";

export const LANGUAGE_DISPLAY_MODES = {
	ICON: "icon", // Sadece Simge (Örn: 🇹🇷 [cc])
	ICON_TEXT: "icon_text", // Simge + Yazı (Örn: 🇹🇷 [cc] Dublaj & Altyazılı)
	TEXT: "text", // Sadece Yazı (Örn: Dublaj & Altyazılı)
};

const STORAGE_KEY = "streampulse_language_display_mode";

const LanguageDisplayContext = createContext({
	languageDisplayMode: LANGUAGE_DISPLAY_MODES.ICON,
	setLanguageDisplayMode: () => {},
});

export function LanguageDisplayProvider({ children }) {
	const [languageDisplayMode, setModeState] = useState(
		LANGUAGE_DISPLAY_MODES.ICON,
	);

	useEffect(() => {
		async function loadSavedMode() {
			try {
				const saved = await AsyncStorage.getItem(STORAGE_KEY);
				if (
					saved &&
					Object.values(LANGUAGE_DISPLAY_MODES).includes(saved)
				) {
					setModeState(saved);
				}
			} catch (e) {
				console.warn("Dil gösterim tercihi yüklenemedi:", e);
			}
		}
		loadSavedMode();
	}, []);

	const setLanguageDisplayMode = async (newMode) => {
		try {
			setModeState(newMode);
			await AsyncStorage.setItem(STORAGE_KEY, newMode);
		} catch (e) {
			console.error("Dil gösterim tercihi kaydedilemedi:", e);
		}
	};

	return (
		<LanguageDisplayContext.Provider
			value={{ languageDisplayMode, setLanguageDisplayMode }}>
			{children}
		</LanguageDisplayContext.Provider>
	);
}

export function useLanguageDisplay() {
	return useContext(LanguageDisplayContext);
}
