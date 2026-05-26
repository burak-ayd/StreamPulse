// app/(auth)/login.jsx
import Login from "@components/auth/Login";
import { useRouter } from "expo-router";

export default function AuthScreen() {
	const router = useRouter();
	console.log("4-AuthScreen Render Edildi");

	return (
		<Login
			onRegisterPress={() => router.push("/(auth)/register")}
			// signInWithPassword başarılı olunca onAuthStateChange tetiklenir
			// _layout otomatik (tabs)'a yönlendirir
		/>
	);
}
