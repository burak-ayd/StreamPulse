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
import { FontFamily, Palette } from "@/constants/theme";
import { useFocusCentering } from "@/hooks/useFocusCentering";
import { useTvMetrics } from "@/utils/tvMetrics";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useCallback } from "react";
import { FlatList, Platform, StyleSheet, Text, View } from "react-native";

/**
 * Kategori ikonları — backend id'leri sabit. Tanınmayan bir kategori
 * gelirse `ellipse-outline` kullanılır; ikon yüzünden satır kaybolmaz.
 */
const KATEGORI_IKON = {
	tum: "apps-outline",
	ulusal: "flag-outline",
	spor: "football-outline",
	haber: "newspaper-outline",
	"belgesel-cocuk": "paw-outline",
	"muzik-eğlence": "musical-notes-outline",
	sinema: "film-outline",
};

/**
 * @param {{categories: Array<{id: string, name: string, order?: number,
 *          kanal_sayisi?: number}>,
 *          selectedId: string,
 *          onSelect: (id: string) => void}} props
 */
function CategoryRail({ categories, selectedId, onSelect }) {
	const list = Array.isArray(categories) ? categories : [];
	const { sp } = useTvMetrics();

	/*
	 * SORUN 5 — odaklanan kategori hapı yatayda ORTALANIR.
	 * `useFocusCentering({ horizontal: true })` bunu tek yerden verir.
	 */
	const { listRef, handleItemFocus } = useFocusCentering({
		horizontal: true,
	});

	const renderItem = useCallback(
		({ item, index }) => {
			const isSelected = item.id === selectedId;
			const count =
				typeof item.kanal_sayisi === "number" ? item.kanal_sayisi : null;
			const icon = KATEGORI_IKON[item.id] || "ellipse-outline";

			return (
				<TVPressable
					style={[
						styles.pill,
						isSelected ? styles.pillSelected : styles.pillIdle,
					]}
					focusedStyle={
						isSelected ? styles.pillFocusedSelected : styles.pillFocused
					}
					onPress={() => onSelect(item.id)}
					onFocus={() => handleItemFocus(index)}
					accessibilityRole="tab"
					accessibilityState={{ selected: isSelected }}
					accessibilityLabel={`${item.name}${count !== null ? `, ${count} kanal` : ""}`}>
					<Ionicons
						name={icon}
						size={sp(14)}
						color={
							isSelected
								? Palette.onPrimary
								: Palette.onSurfaceVariant
						}
					/>
					<Text
						style={[
							styles.pillText,
							{ fontSize: sp(13) },
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
		},
		[selectedId, onSelect, handleItemFocus, sp],
	);

	/*
	 * Liste boşken (kategoriler henüz yüklenmedi) rayı hiç render etmiyoruz.
	 * Boş bir ray + "Tüm Kanallar" yerine hiçbir şey olmayan bir üst blok,
	 * yükleniyor göstergesinin altında daha temiz duruyor.
	 */
	if (list.length === 0) return null;

	return (
		<FlatList
			ref={listRef}
			data={list}
			renderItem={renderItem}
			keyExtractor={(item) => item.id}
			horizontal
			showsHorizontalScrollIndicator={false}
			/*
			 * SORUN 2 (TV): kırpma, ekran dışındaki hapı native tarafta
			 * DETACH eder; odaklı hap detache olursa kumanda odağı düşer
			 * ve listedeki başka bir öğeye zıplar.
			 */
			removeClippedSubviews={!Platform.isTV}
			contentContainerStyle={styles.content}
			/*
			 * `flexGrow/flexShrink: 0` ŞART. React Native `ScrollView`
			 * temel stilinde `flexGrow: 1, flexShrink: 1` uygular; bu ray
			 * `flex: 1` bir sütunda kardeşi olan kanal listesiyle yarışır
			 * ve haplar dikeyde kırpılır.
			 */
			style={styles.rail}
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
		paddingVertical: 12,
	},
	pill: {
		flexDirection: "row",
		alignItems: "center",
		// Yatay rayda yan komşular varsa RN hapsı yatayda ezebiliyor;
		// metin kırpılmasın, kap doğal genişliğinde kalsın.
		flexShrink: 0,
		gap: 7,
		paddingHorizontal: 14,
		paddingVertical: 8,
		borderRadius: 999,
		borderWidth: 2,
		borderColor: "transparent",
	},
	pillIdle: {
		backgroundColor: Palette.surfaceLow,
	},
	pillSelected: {
		backgroundColor: Palette.primary,
	},
	pillFocused: {
		borderColor: Palette.primary,
		backgroundColor: Palette.surfaceHigh,
	},
	pillFocusedSelected: {
		borderColor: Palette.onSurface,
	},
	pillText: {
		lineHeight: 18,
		fontFamily: FontFamily.semiBold,
	},
	pillTextIdle: {
		color: Palette.onSurfaceVariant,
	},
	pillTextSelected: {
		color: Palette.onPrimary,
	},
	countBadge: {
		minWidth: 20,
		paddingHorizontal: 5,
		paddingVertical: 1,
		borderRadius: 999,
		alignItems: "center",
	},
	countBadgeIdle: {
		backgroundColor: Palette.surfaceHigh,
	},
	countBadgeSelected: {
		backgroundColor: "rgba(16, 0, 169, 0.18)",
	},
	countText: {
		fontSize: 10,
		lineHeight: 14,
		fontFamily: FontFamily.bold,
	},
	countTextIdle: {
		color: Palette.onSurface,
	},
	countTextSelected: {
		color: Palette.onPrimary,
	},
});
