import { Ionicons } from "@react-native-vector-icons/ionicons";
import { StyleSheet, Text, View } from "react-native";

/**
 * Çift dokunma geri bildirimi — Netflix/YouTube tarzı yarı ekran göstergesi.
 *
 * ⚠️ KONUM (kullanıcı şikâyeti, sorun 1): gösterge ekranın ORTASINDA
 * değil, dokunulan YANDA durur. Ekranın ortası oynatıcının play/pause
 * düğmesinin olduğu yer; oraya bir "−10 sn" balonu binmesi hem
 * merkezi alanı kapatır hem de kullanıcıya "play'e mi bastım, sarmaya mı"
 * karışıklığı yaratır. Kenar konum, hangi bölgeye dokunulduğunu da
 * görsel olarak belli eder.
 */
export function DoubleTapFeedback({ info }) {
	if (!info) return null;
	const isRewind = info.type === "rewind";

	return (
		<View style={styles.container} pointerEvents="none">
			<View
				style={[
					styles.bubble,
					isRewind ? styles.bubbleLeft : styles.bubbleRight,
				]}>
				<View style={styles.bubbleCard}>
					<Ionicons
						name={
							isRewind
								? "play-back-circle-outline"
								: "play-forward-circle-outline"
						}
						size={40}
						color="#FFFFFF"
					/>
					<Text style={styles.label}>
						{isRewind ? `−${info.delta} sn` : `+${info.delta} sn`}
					</Text>
				</View>
			</View>
		</View>
	);
}

/**
 * Uzun basış hızlandırma göstergesi (CloudStream `player_speedup_button`).
 *
 * Bırakılınca kaybolur; oynatıcı `rate` prop'unu eski değerine döndürür.
 */
export function SpeedUpIndicator({ active, rate }) {
	if (!active) return null;
	return (
		<View style={styles.speedWrap} pointerEvents="none">
			<View style={styles.speedBubble}>
				<Ionicons name="flash" size={22} color="#FF3B30" />
				<Text style={styles.speedText}>{`${rate || 2}×`}</Text>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		...StyleSheet.absoluteFill,
		// HUD ile aynı seviye: her ikisi de kontrol katmanının üstünde.
		zIndex: 30,
	},
	/*
	 * ⚠️ KENAR YAPIŞTIRMA (video kanıtı): balon ekranın ORTASINA değil,
	 * fiziksel kenarına dayanır.
	 *
	 * HUD ile AYNI hata vardı ve AYNI şekilde çözüldü: `top: "50%"` +
	 * `translateY` ekranın gerçek yüksekliği doğru bilinmediğinde
	 * ortalama garantisi vermez (mutlak konumlandırılmış çocuk, ebeveyninin
	 * `alignItems: "center"` değerini devralmaz). Bunun yerine kenar
	 * çubuğu `top: 0` + `bottom: 0` ile tüm yüksekliği kaplar ve balon
	 * `justifyContent: "center"` ile ortalanır — yükseklik hesaba katılmaz.
	 */
	bubble: {
		position: "absolute",
		top: 0,
		bottom: 0,
		width: 104,
		justifyContent: "center",
		alignItems: "center",
	},
	bubbleLeft: {
		left: 0,
	},
	bubbleRight: {
		right: 0,
	},
	/*
	 * Gerçek görsel balon: `bubble` yalnızca konumlandırıcıdır, görünüm
	 * burada. Sabit genişlik ikon ile yazının birlikte ortalanmasını sağlar.
	 */
	bubbleCard: {
		width: 96,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "rgba(0, 0, 0, 0.62)",
		paddingVertical: 12,
		borderRadius: 48,
	},
	label: {
		color: "#FFFFFF",
		fontSize: 12,
		fontWeight: "700",
		marginTop: 2,
	},
	speedWrap: {
		position: "absolute",
		top: "12%",
		left: 0,
		right: 0,
		alignItems: "center",
		zIndex: 16,
	},
	speedBubble: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 6,
		backgroundColor: "rgba(0, 0, 0, 0.7)",
		paddingHorizontal: 16,
		paddingVertical: 8,
		borderRadius: 20,
		borderWidth: 1,
		borderColor: "rgba(255, 59, 48, 0.5)",
	},
	speedText: {
		color: "#FFFFFF",
		fontSize: 14,
		fontWeight: "800",
	},
});
