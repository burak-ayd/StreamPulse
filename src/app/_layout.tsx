import { Stack } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { SafeAreaProvider } from "react-native-safe-area-context";

WebBrowser.maybeCompleteAuthSession();
export default function RootLayout() {
	return (
		<SafeAreaProvider>
			<Stack />
		</SafeAreaProvider>
	);
}
