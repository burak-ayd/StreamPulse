// app/+not-found.jsx
import TVPressable from "@/components/common/TVPressable";
import { Link, Stack, useFocusEffect, useRouter } from "expo-router";
import React, { useCallback } from "react";
import { BackHandler, StyleSheet, Text, View } from "react-native";

export default function NotFoundScreen() {
	const router = useRouter();

	useFocusEffect(
		useCallback(() => {
			const onBackPress = () => {
				router.replace("/");
				return true;
			};
			const subscription = BackHandler.addEventListener(
				"hardwareBackPress",
				onBackPress,
			);
			return () => subscription.remove();
		}, [router]),
	);

	return (
		<>
			<Stack.Screen options={{ title: "Oops!", headerShown: false }} />
			<View style={styles.container}>
				<Text style={styles.title}>
					Sayfa bulunamadı!
				</Text>
				<Link href="/" asChild>
					<TVPressable
						autoFocus={true}
						style={styles.button}
						focusedStyle={styles.buttonFocused}>
						<Text style={styles.buttonText}>
							Ana sayfaya git
						</Text>
					</TVPressable>
				</Link>
			</View>
		</>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		padding: 20,
		backgroundColor: "#0A0A0A",
	},
	title: {
		fontSize: 22,
		fontWeight: "bold",
		color: "white",
		marginBottom: 16,
	},
	button: {
		backgroundColor: "#E50914",
		paddingVertical: 12,
		paddingHorizontal: 24,
		borderRadius: 10,
		borderWidth: 2,
		borderColor: "transparent",
	},
	buttonFocused: {
		borderColor: "#FFFFFF",
		backgroundColor: "#b20710",
		transform: [{ scale: 1.08 }],
	},
	buttonText: {
		color: "#FFFFFF",
		fontSize: 16,
		fontWeight: "700",
	},
});
