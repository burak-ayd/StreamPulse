import React from "react";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { StyleSheet, Text, View } from "react-native";
import TVPressable from "@/components/common/TVPressable";

/**
 * CloudStream tarzı alt aksiyon çubuğu.
 *
 * ⭐ GÖRÜNÜM KAYNAĞI (kullanıcı ekran görüntüsü):
 *
 *   🔒 Kilitle   ⛶ Yeniden boyutlandır   💬 Altyazı senkronu
 *   ☰ Kaynak      📊 Parçalar              ⏭ Sonraki bölüm
 *
 * Altı eylem TEK SATIRDA, eşit aralıklarla dağıtılmış; her biri ikon
 * üstte/yanında etiket. Düğmelerin zemin rengi **yok** — sadece ikon ve
 * yazı. Bu, önceki "her düğme bir balon içinde" tasarımından belirgin şekilde
 * daha sade.
 *
 * ⚠️ Neden ayrı dosya: alt bar hem yükseklik hem de düğme sayısı olarak
 * `VideoPlayer`'ın en kalabalık katmanıydı. Ayrı bileşen, orkestrasyon
 * dosyasını okunabilir tutar ve barı tek yerden stillendirmeyi sağlar.
 */
export default function PlayerActionBar({ actions, disabled = false, onFocusZone }) {
	if (!actions?.length) return null;

	/*
	 * TV kumandası için "hangi barda odak var" bilgisi.
	 *
	 * ⚠️ SORUN 6 bağlamı: HUD açıkken sol/sağ tuşu hem odak hem de
	 * sarma için kullanılır. `VideoPlayer` yalnızca "alt bardayken
	 * odak gezdirme, aksi hâlde sarma" diyebilmek için buraya bilgi
	 * verir. `onBlur` → `null`: odak bu bardan çıkıp ortaya döndüğünde
	 * sarma yeniden devreye girsin.
	 */
	const handleFocus = () => onFocusZone?.("bottom");
	const handleBlur = () => onFocusZone?.(null);

	return (
		<View style={styles.bar} pointerEvents="box-none">
			{actions.map((action) => {
				if (!action) return null;
				const isActive = Boolean(action.active);
				return (
					<TVPressable
						key={action.key}
						style={styles.item}
						focusedStyle={styles.itemFocused}
						disabled={disabled || action.disabled}
						cancelable={false}
						onFocus={handleFocus}
						onBlur={handleBlur}
						onPress={action.onPress}>
						<View style={styles.itemInner}>
							<Ionicons
								name={action.icon}
								size={20}
								color={isActive ? "#FF3B30" : "#FFFFFF"}
							/>
							{/*
							 * ⚠️ HİZALAMA (sorun 5): `alignItems: "center"` +
							 * sabit etiket yüksekliği, ikon ile yazıyı AYNI
							 * eksende tutar. Önceden yazı satır yüksekliği
							 * farkı nedeniyle ikonun altında kayıyordu.
							 */}
							<Text
								numberOfLines={1}
								style={[
									styles.label,
									isActive && styles.labelActive,
								]}>
								{action.label}
							</Text>
						</View>
					</TVPressable>
				);
			})}
		</View>
	);
}

const styles = StyleSheet.create({
	bar: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		flexWrap: "nowrap",
		paddingTop: 14,
	},
	item: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		paddingVertical: 6,
		borderRadius: 8,
	},
	itemFocused: {
		backgroundColor: "rgba(255, 59, 48, 0.28)",
		transform: [{ scale: 1.06 }],
	},
	itemInner: {
		alignItems: "center",
		justifyContent: "center",
		gap: 4,
	},
	label: {
		color: "#FFFFFF",
		fontSize: 12,
		fontWeight: "500",
		textAlign: "center",
		lineHeight: 16,
	},
	labelActive: {
		color: "#FF6B60",
		fontWeight: "700",
	},
});