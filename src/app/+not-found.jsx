import { Link, Stack } from "expo-router";
import { Text, View } from "react-native";

export default function NotFoundScreen() {
	return (
		<>
			<Stack.Screen options={{ title: "Oops!" }} />
			<View
				style={{
					flex: 1,
					alignItems: "center",
					justifyContent: "center",
					padding: 20,
					backgroundColor: "#0A0A0A",
				}}>
				<Text
					style={{
						fontSize: 20,
						fontWeight: "bold",
						color: "white",
					}}>
					This screen doesn't exist.
				</Text>
				<Link href="/" asChild>
					<Text style={{ marginTop: 14, color: "#3B82F6" }}>
						Go to home screen!
					</Text>
				</Link>
			</View>
		</>
	);
}
