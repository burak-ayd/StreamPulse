/**
 * (auth) Grup Layout
 *
 * Oturum varsa (app)'e yönlendir.
 * Giriş zorunlu DEĞİL — kullanıcı ayarlardan veya profil'den erişir.
 */

import { useAuth } from "@/context/AuthContext";
import { Stack, useRouter } from "expo-router";
import { useEffect } from "react";

export default function AuthLayout() {
	const { isLoggedIn } = useAuth();
	const router = useRouter();

	useEffect(() => {
		if (isLoggedIn) {
			// Zaten giriş yapılmış — geri git
			if (router.canGoBack()) {
				router.back();
			}
		}
	}, [isLoggedIn, router]);

	return (
		<Stack
			screenOptions={{
				headerShown: false,
				animation: "slide_from_bottom",
			}}
		/>
	);
}
