import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, processLock } from "@supabase/supabase-js";
import { AppState, Platform } from "react-native";
import "react-native-url-polyfill/auto";

export const supabase = createClient(
	process.env.EXPO_PUBLIC_SUPABASE_URL,
	process.env.EXPO_PUBLIC_SUPABASE_KEY,
	{
		auth: {
			...(Platform.OS !== "web" ? { storage: AsyncStorage } : {}),
			autoRefreshToken: true,
			persistSession: true,
			detectSessionInUrl: false,
			lock: processLock,
		},
	},
);
if (Platform.OS !== "web") {
	AppState.addEventListener("change", (state) => {
		if (state === "active") {
			supabase.auth.startAutoRefresh();
		} else {
			supabase.auth.stopAutoRefresh();
		}
	});
}
