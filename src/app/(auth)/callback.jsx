import { router } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";

import { supabase } from "@utils/supabase";

export default function Callback() {
	console.log("callback");
	useEffect(() => {
		const handleAuth = async () => {
			const {
				data: { session },
			} = await supabase.auth.getSession();

			if (session) {
				router.replace("/(app)");
			} else {
				router.replace("/(auth)/login");
			}
		};

		handleAuth();
	}, []);

	return (
		<View
			style={{
				flex: 1,
				justifyContent: "center",
				alignItems: "center",
			}}>
			<ActivityIndicator size="large" />
		</View>
	);
}
