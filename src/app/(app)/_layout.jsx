// src\app\(app)\_layout.jsx
import { Platform, useColorScheme } from "react-native";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";

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

/**
 * Menü sekmeleri (sorun 3).
 *
 * Sekmeler yığında "ileri" adım DEĞİL, aynı seviyede yan yana duran
 * hedeflerdir: nereden nereye gidildiğine göre yön değiştiremeyecekleri
 * için sağdan kayan animasyon her zaman yanlış yönü anlatıyordu.
 * Bunlar çapraz söner; detay/oynatıcı gibi gerçek push'lar sağdan
 * kaymaya devam eder.
 */
const SECTION_ROUTES = [
	"index",
	"search",
	"library",
	"downloads",
	"settings",
	"profile",
];

export default function AppLayout() {
	const colorScheme = useColorScheme();
	// TV'de tüm geçişler animasyonsuz (kumanda gecikmesi).
	const sectionAnimation = Platform.isTV ? "none" : "fade";

	return (
		<ThemeProvider
			value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
			<Stack
				screenOptions={{
					headerShown: false,
					animation: Platform.isTV ? "none" : "slide_from_right",
					/*
					 * Odak dışı ekranlar React güncellemesi almayı bırakır.
					 * Yığında altı ağır ekran birikiyor (liste + görsel);
					 * arka plandaki indirme sayaçları ve veri tazelemeleri
					 * geçiş sırasında JS'i meşgul etmesin diye dondurulur.
					 */
					freezeOnBlur: true,
					contentStyle: { backgroundColor: "#0d0e12" },
				}}>
				{SECTION_ROUTES.map((name) => (
					<Stack.Screen
						key={name}
						name={name}
						options={{ animation: sectionAnimation }}
					/>
				))}
			</Stack>
		</ThemeProvider>
	);
}
