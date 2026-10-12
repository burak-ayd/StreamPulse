// src\app\(app)\_layout.jsx
import { Platform, useColorScheme } from "react-native";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
console.log("2 - AppLayout Çalıştı");

export default function AppLayout() {
	const colorScheme = useColorScheme();

	/*
	 * ⚠️ SORUN 4 (GENEL) — `<Slot/>` yerine `<Stack/>`.
	 *
	 * `<Slot/>` sadece odaktaki ekranı çizer; yeni bir ekrana push
	 * edildiğinde önceki ekran UNMOUNT olur. Geri tuşuna basıldığında
	 * ekran sıfırdan kurulduğu için:
	 *   • ana sayfanın kaydırma konumu,
	 *   • seçili sekme / filtre,
	 *   • yüklenmiş kategori sayfaları
	 * kayboluyordu. `<Stack/>` ekranları mount durumunda TUTAR; geri
	 * dönüşte React ağacı yeniden kurulmadığı için tüm bu durum
	 * kendiliğinden korunur.
	 *
	 * TV'de animasyon kapalı: kumandayla gezinirken geçiş efekti
	 * gereksiz gecikme yaratıyordu.
	 */
	return (
		<ThemeProvider
			value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
			<Stack
				screenOptions={{
					headerShown: false,
					animation: Platform.isTV ? "none" : "slide_from_right",
					contentStyle: { backgroundColor: "#0d0e12" },
				}}
			/>
		</ThemeProvider>
	);
}