// app/(auth)/register.jsx
import Register from "@components/auth/Register";
import { useRouter } from "expo-router";

export default function RegisterScreen() {
	const router = useRouter();
	console.log("5-RegisterScreen Render Edildi");

	return (
		<Register
			onLoginPress={() => router.push("/(auth)/login")}
			onRegisterSuccess={() => router.push("/(auth)/login")}
		/>
	);
}
