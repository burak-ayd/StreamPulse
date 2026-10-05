/**
 * CategoryRail — CANLI TV KATEGORİ RAYI
 *
 * 7 kategoriyi yatay rayda gösterir (`tum`, `ulusal`, `spor`, `haber`,
 * `belgesel-cocuk`, `muzik-eğlence`, `sinema`). Seçili kategori vurgulanır;
 * her hap kanal sayısını rozet olarak taşır.
 *
 * ── Neden `FlatList` ve `@expo/ui` `List` DEĞİL ──────────────────
 * 7 elemanlık SABİT bir liste sanallaştırmaya ihtiyaç duymaz; `List`
 * kütüphanesinin varlık sebebi yerel iOS/Android liste görünümü ve
 * ayarlar listesi tipi koyu temalar. Kanal ızgarası (138 eleman) sanallaşır,
 * bu ray sanallaşmaz. Aynı sebeple `library.jsx` ve `discover.jsx`'deki
 * gibi `ScrollView horizontal` da YETMEZ: `FlatList` `numColumns`'ı
 * değiştiğinde yeniden ölçüm yapar, TV'de rayın içeriği değiştiğinde
 * boşluğu doğru yönetir.
 *
 * ── `kanal_sayisi` rozeti ─────────────────────────────────────────
 * Backend her kategoriyi `kanal_sayisi` ile birlikte veriyor. Bu sayı
 * sunucudan geldiği için ekranda hesaplanmaz — istemcide kanal listesinden
 * yeniden saymak, kategori değiştiğinde (o listede henüz kanal yokken)
 * rozeti "0" gösterirdi.
 *
 * ── `autoFocus` YOK ───────────────────────────────────────────────
 * TV'de `hasTVPreferredFocus` ilk karede odağı bu raya çeker ve geri
 * düğmesi ile arama kutusuna klavye odağı hiç gelmez. Odağı üst çubuktaki
 * geri düğmesine bırakıyoruz; kumanda kullanıcısı AÇ/IÇARİ ile raya
 * iner, DOWN ile ızgaraya geçer.
 */

import TVPressable from "@/components/common/TVPressable";
import { ColorsM3 } from "@/constants/theme";
import { FlatList, StyleSheet, Text, View } from "react-native";

/** Sabit koyu palet — gerekçe `ChannelCard` dosya başında. */
const c = ColorsM3.dark;

/**
 * @param {{categories: Array<{id: string, name: string, order?: number,
 *          kanal_sayisi?: number}>,
 *          selectedId: string,
 *          onSelect: (id: string) => void}} props
 */
function CategoryRail({ categories, selectedId, onSelect }) {
	const list = Array.isArray(categories) ? categories : [];

	const renderItem = ({ item }) => {
		const isSelected = item.id === selectedId;
		const count =
			typeof item.kanal_sayisi === "number" ? item.kanal_sayisi : null;

		return (
			<TVPressable
				style={[
					styles.pill,
					isSelected ? styles.pillSelected : styles.pillIdle,
				]}
				focusedStyle={styles.pillFocused}
				onPress={() => onSelect(item.id)}
				accessibilityRole="tab"
				accessibilityState={{ selected: isSelected }}
				accessibilityLabel={`${item.name}${count !== null ? `, ${count} kanal` : ""}`}>
				<Text
					style={[
						styles.pillText,
						isSelected
							? styles.pillTextSelected
							: styles.pillTextIdle,
					]}
					numberOfLines={1}>
					{item.name}
				</Text>

				{count !== null ? (
					<View
						style={[
							styles.countBadge,
							isSelected
								? styles.countBadgeSelected
								: styles.countBadgeIdle,
						]}>
						<Text
							style={[
								styles.countText,
								isSelected
									? styles.countTextSelected
									: styles.countTextIdle,
							]}>
							{count}
						</Text>
					</View>
				) : null}
			</TVPressable>
		);
	};

	/*
	 * Liste boşken (kategoriler henüz yüklenmedi) rayı hiç render etmiyoruz.
	 * Boş bir ray + "Tüm Kanallar" yerine hiçbir şey olmayan bir üst blok,
	 * yükleniyor göstergesinin altında daha temiz duruyor.
	 */
	if (list.length === 0) return null;

	return (
		<FlatList
			data={list}
			renderItem={renderItem}
			keyExtractor={(item) => item.id}
			horizontal
			showsHorizontalScrollIndicator={false}
			contentContainerStyle={styles.content}
			/*
			 * `flexGrow/flexShrink: 0` ŞART. React Native `ScrollView`
			 * temel stilinde `flexGrow: 1, flexShrink: 1` uygular; bu ray
			 * `flex: 1` bir sütunda kardeşi olan 138 kanallık DİKEY
			 * `FlatList` ile yarışır. Dikey listenin devasa içerik isteği
			 * büzülme fazlasını neredeyse tamamen kendi emdiği için yatay
			 * ray yalnızca ~10dp küçülür ve haplar 34dp yerine 24dp'e
			 * sıkışır — kategori adı dikeyden kırpılır (ölçüldü: ray 44dp,
			 * beklenen 54dp). Sıfırlanınca ray içerik yüksekliğine
			 * (10 + 34 + 10) tam oturur ve yalnızca yatayda büyür.
			 */
			style={styles.rail}
			// Ray yalnızca 7 elemanlığa kadar sanallaştırmayı boşuna
			// çalıştırmasın diye kapsamı tek ekrana sabitliyoruz.
			initialNumToRender={7}
			maxToRenderPerBatch={7}
			windowSize={1}
		/>
	);
}

export default CategoryRail;

const styles = StyleSheet.create({
	rail: {
		flexGrow: 0,
		flexShrink: 0,
	},
	content: {
		gap: 8,
		paddingHorizontal: 16,
		paddingVertical: 10,
	},
	pill: {
		flexDirection: "row",
		alignItems: "center",
		// Yatay rayda yan komşular varsa RN hapsı yatayda ezebiliyor;
		// metin kırpılmasın, kap doğal genişliğinde kalsın.
		flexShrink: 0,
		gap: 6,
		paddingHorizontal: 14,
		paddingVertical: 7,
		borderRadius: 999,
		borderWidth: 1,
	},
	pillIdle: {
		backgroundColor: c.surfaceContainer,
		borderColor: c.outlineVariant,
	},
	pillSelected: {
		backgroundColor: c.primaryContainer,
		borderColor: c.primaryContainer,
	},
	pillText: {
		fontSize: 13,
		lineHeight: 18,
		fontWeight: "600",
	},
	pillTextIdle: {
		color: c.onSurfaceVariant,
	},
	pillTextSelected: {
		color: c.onPrimaryContainer,
	},
	countBadge: {
		minWidth: 20,
		paddingHorizontal: 5,
		paddingVertical: 1,
		borderRadius: 999,
		alignItems: "center",
	},
	countBadgeIdle: {
		backgroundColor: c.surfaceContainerHigh,
	},
	countBadgeSelected: {
		// Seçili hap zaten kırmızı; rozet beyaz zeminde koyu mürekkep
		// kullanıyor ki kontrast kaybolmasın.
		backgroundColor: c.onPrimaryContainer,
	},
	countText: {
		fontSize: 10,
		lineHeight: 14,
		fontWeight: "700",
	},
	countTextIdle: {
		color: c.onSurface,
	},
	countTextSelected: {
		color: c.primaryContainer,
	},
	// TV odak — kenar + ölçek, gölge/elevation yok (bkz. CategoryCard notu).
	pillFocused: {
		borderColor: "#FFFFFF",
		borderWidth: 2,
		transform: [{ scale: 1.05 }],
	},
});
