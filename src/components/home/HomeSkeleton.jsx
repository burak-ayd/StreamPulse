/**
 * HomeSkeleton — ana sayfanın ilk kare iskeleti
 * =============================================
 *
 * Ne zaman görünür: eklenti seçimi + kategori listesi gelene kadar
 * (`loadingPlatform`). Eskiden burada ekranı kaplayan bir spinner vardı;
 * veri gelince hero ve kategori satırları "beliriyordu".
 *
 * Burada ekranın KENDİ düzeni çizilir:
 *   1. `HeroBanner` — `skeleton` prop'uyla kendi geometrisini çizer
 *      (başlık/ok/filtre düğmeleri ÇALIŞIR kalır; kullanıcı bekleme
 *      sırasında eklenti değiştirebilir).
 *   2. Üç kategori satırı iskeleti — içerik geldikçe satır satır
 *      gerçek içerikle değişiyor, ekran zıplamıyor.
 *
 * Kaç satır çizileceği ekran YÜKSEKLİĞİNE göre hesaplanır: TV'de
 * 540dp'ye 3 satır sığarken telefonda 5–6 satır sığar. Sabit sayı
 * her iki durumda da ya boşluk bırakır ya da ekranı taşırırdı.
 */

import HeroBanner from "@/components/home/HeroBanner";
import { MovieCategoryRowSkeleton } from "@/components/home/MovieCategorySection";
import { useMemo } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";

/** Bir satırın gerçek yüksekliği + aradaki boşluk (yaklaşık, dp). */
const ROW_BLOCK_H = 236;

export default function HomeSkeleton({
	platform,
	userAvatarUrl,
	onPlatformPress,
	onSearchPress,
	onProfilePress,
}) {
	const { height } = useWindowDimensions();

	const rowCount = useMemo(() => {
		// Hero yüksekliği ekrana göre değişiyor; kaba bir pay ayırıp
		// kalan alanı satırlara bölüyoruz. Alt navigasyon ~80dp.
		const usable = height - 380 - 80;
		return Math.max(2, Math.min(6, Math.floor(usable / ROW_BLOCK_H)));
	}, [height]);

	return (
		<View style={styles.container} pointerEvents="box-none">
			<HeroBanner
				skeleton
				platform={platform}
				userAvatarUrl={userAvatarUrl}
				onPlatformPress={onPlatformPress}
				onSearchPress={onSearchPress}
				onProfilePress={onProfilePress}
			/>

			{Array.from({ length: rowCount }).map((_, index) => (
				<MovieCategoryRowSkeleton key={`sk-row-${index}`} />
			))}
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
	},
});