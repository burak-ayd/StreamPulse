import React, { createContext, useContext, useEffect, useState } from "react";
import {
	DEFAULT_PLAYER_SETTINGS,
	getPlayerSettings,
	savePlayerSettings,
	resetPlayerSettings as resetStorageSettings,
} from "@/utils/storage";

const PlayerSettingsContext = createContext({
	settings: DEFAULT_PLAYER_SETTINGS,
	updateSettings: async () => {},
	resetSettings: async () => {},
	isLoading: true,
});

export function PlayerSettingsProvider({ children }) {
	const [settings, setSettings] = useState(DEFAULT_PLAYER_SETTINGS);
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		let isMounted = true;
		getPlayerSettings()
			.then((loaded) => {
				if (isMounted) setSettings(loaded);
			})
			.finally(() => {
				if (isMounted) setIsLoading(false);
			});

		return () => {
			isMounted = false;
		};
	}, []);

	const updateSettings = async (updates) => {
		try {
			const updated = await savePlayerSettings(updates);
			setSettings(updated);
			return updated;
		} catch (error) {
			console.error("Player settings update error:", error);
		}
	};

	const resetSettings = async () => {
		try {
			const reset = await resetStorageSettings();
			setSettings(reset);
			return reset;
		} catch (error) {
			console.error("Player settings reset error:", error);
		}
	};

	return (
		<PlayerSettingsContext.Provider
			value={{
				settings,
				updateSettings,
				resetSettings,
				isLoading,
			}}>
			{children}
		</PlayerSettingsContext.Provider>
	);
}

export function usePlayerSettings() {
	const context = useContext(PlayerSettingsContext);
	if (!context) {
		return {
			settings: DEFAULT_PLAYER_SETTINGS,
			updateSettings: async () => {},
			resetSettings: async () => {},
			isLoading: false,
		};
	}
	return context;
}
