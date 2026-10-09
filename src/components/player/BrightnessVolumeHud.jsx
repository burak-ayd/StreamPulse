import { volumeIconLevel } from "@/utils/deviceControls";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { StyleSheet, Text, View } from "react-native";

/**
 * Parlaklık / ses HUD'u — CloudStream'in dikey sürükleme göstergesinin
 * karşılığı (sol: parlaklık, sağ: ses).
 *
 * ⚠️ KONUM (kullanıcı şikâyeti, sorun 1): gösterge ORTAYA değil
 * EKRANIN KENARLARINA yaslanır. CloudStream'de de gösterge kenardadır ve
 * ortada durması yanlış algı yaratır: "ekranın ortasında parlaklık
 * var" yerine "soluma basıyorum, oradaki gösterge benim kontrolüm"
 * izlenimi doğar. Aynı sebeple gösterge DİKEY (ortada değil) hizalıdır.
 *
 * ⚠️ İKON ADLARI: `sun-outline` ve `picture-in-picture-outline`
 * Ionicons'ta YOKTUR; verilmeleri "soru işareti" kutucuğu üretir
 * (kullanıcı şikâyeti, sorun 3 ve 4). Burada yalnızca glyphmap'te
 * DOĞRULANMIŞ adlar kullanılır.
 */
export default function BrightnessVolumeHud({ hud }) {
	if (!hud) return null;

	const isBrightness = hud.type === "brightness";
	const clamped = Math.min(1, hud.ratio);
	const extra = Math.max(0, Math.min(1, hud.ratio - 1));
	const percent = Math.round(hud.ratio * 100);

	// Glyphmap'te doğrulanmış adlar:
	//   parlaklık → sunny-outline (tek ikon; 7 kademeli güneş yerine)
	//   ses       → volume-mute-outline / volume-low-outline / volume-high-outline
	const iconName = isBrightness
		? "sunny-outline"
		: ["volume-mute-outline", "volume-low-outline", "volume-high-outline"][
				volumeIconLevel(clamped)
			];

	return (
		<View style={styles.container} pointerEvents="none">
			{/*
			 * ⚠️ HUD YERİ, JEST TARAFIYLA TERS.
			 *
			 *   JEST (parmak)        →  HUD (gösterge)
			 *   sol yarı  = SES      →  sağ taraf
			 *   sağ yarı  = PARLAKLIK→  sol taraf
			 *
			 * Bu, bilinçli bir eşleşmedir; `usePlayerGestures.js` içindeki
			 * `locationX < width / 2 ? "volume" : "brightness"` ile
			 * BİLEREK TERS çalışır. Parlaklık jesti sağdan yapılır ama
			 * gösterge solda çıkar (ve tersi).
			 *
			 * ⚠️ Bu satırı "hizalama sanıp" jest tarafıyla aynı yapma:
			 * kullanıcı bu eşleşmeyi bilinçli olarak istedi.
			 */}
			<View
				style={[
					styles.hud,
					isBrightness ? styles.hudLeft : styles.hudRight,
				]}>
				{/* Balon: kenar çubuğu içinde ortalanmış blok. */}
				<View style={styles.bubble}>
					<Ionicons name={iconName} size={24} color="#FFFFFF" />

					<View style={styles.barTrack}>
						<View
							style={[
								styles.barFill,
								{ height: `${clamped * 100}%` },
							]}
						/>
						{extra > 0 ? (
							<View
								style={[
									styles.barExtra,
									{ height: `${extra * 100}%` },
								]}
							/>
						) : null}
					</View>

					<Text style={styles.percentText}>
						{percent > 100 ? "MAX" : `${percent}`}
					</Text>
				</View>
			</View>

			{hud.locked ? (
				<View
					style={[
						styles.lockHint,
						isBrightness ? styles.hudLeftHint : styles.hudRightHint,
					]}>
					<Text style={styles.lockHintText}>
						Bırakıp tekrar sürükle
					</Text>
				</View>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	/*
	 * `zIndex: 15` — HUD, kontrol katmanının (`zIndex: 5`) ÜSTÜNDE olmalı.
	 * Videoda HUD'un arkasında kalan PiP/ayarlama düğmeleri "iç içe geçmiş"
	 * görünüyordu: HUD saydam kutu olduğu için alttaki ikonlar hala
	 * görünüyor. HUD en üstte ve kendi zemininde olduğunda bu biter.
	 */
	container: {
		...StyleSheet.absoluteFill,
		zIndex: 30,
	},
	/*
	 * ⚠️ KENAR YAPIŞTIRMA (kullanıcı şikâyeti, sorun 2):
	 * "HUD ikonları ekran ortasının sağında ve solunda çıkıyor, ekranın
	 * sağı ve solunda olması gerekiyor."
	 *
	 * Önceden `left/right: 28` + `marginTop: -90` vardı; bu, HUD'u ekranın
	 * kenarına DEĞİL, güvenli alanın (safe-area) içine yapıştırıyordu ve
	 * yatayda ortaya yakın duruyordu.
	 *
	 * Yeni yaklaşım: HUD bir TAM YÜKSEKLİK dikey şerit değil, **ekranın
	 * fiziksel kenarına yapışan** bir blok. Dikeyde tam ortada (`top: 50%`
	 * + `translateY`), yatayde `left: 0` / `right: 0` ile KENARDA.
	 * İç boşluk (`paddingHorizontal`) kenar ile balon arasındaki
	 * mesafedir; balonun kendisi kenara dayanır.
	 */
	/*
	 * Kenara yaslanmış HUD.
	 *
	 * ⚠️ ASİL KÖK NEDEN (video kanıtı): HUD, `VideoPlayer` kökündeki
	 * `styles.container` içinde duruyor ve o konteynerde
	 * `alignItems: "center"` var. Mutlak konumlandırılmış bir çocuk,
	 * ebeveyninin hizalama kurallarına GÖRÜ DEVRİM ALMAZ — `top: "50%"`
	 * + `translateY` kombinasyonu da yalnızca konteynerin gerçek
	 * yüksekliği doğru bilindiğinde ortalar. Ekran döndüğünde ya da
	 * katmanlar arasında geçiş yaparken bu yükseklik kayıyor ve HUD
	 * "ortada" ya da "yukarıda" kalıyordu (videoda ikisi de görüldü).
	 *
	 * ÇÖZÜM: yüzde yerine PİKSEL konum kullanıyoruz. HUD, kenar çubuğu
	 * genişliğinde bir DİKMEY-tüm-yükseklik kaplayan kutu olup içindeki
	 * balon `justifyContent: "center"` ile ortalanır. Yükseklik artık
	 * hiçbir hesaba bağlı değildir; ekran boyutundan bağımsız ve her
	 * zaman doğru konumdadır.
	 */
	hud: {
		position: "absolute",
		top: 0,
		bottom: 0,
		width: 104,
		justifyContent: "center",
		alignItems: "center",
	},
	/*
	 * Balon: kenar çubuğunun İÇİNDE, ortalanmış. `pointerEvents: none`
	 * kapsayıcı üzerinde olduğu için dokunmayı yine de engellemez.
	 */
	bubble: {
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		paddingVertical: 14,
		borderRadius: 18,
		backgroundColor: "rgba(20, 22, 28, 0.86)",
		borderWidth: 1,
		borderColor: "rgba(255, 255, 255, 0.10)",
	},
	hudLeft: {
		left: 0,
	},
	hudRight: {
		right: 0,
	},
	barTrack: {
		width: 5,
		height: 88,
		borderRadius: 3,
		backgroundColor: "rgba(255, 255, 255, 0.20)",
		overflow: "hidden",
		justifyContent: "flex-end",
	},
	barFill: {
		width: "100%",
		backgroundColor: "#FFFFFF",
	},
	barExtra: {
		width: "100%",
		backgroundColor: "#FF9F0A",
	},
	percentText: {
		color: "#FFFFFF",
		fontSize: 11,
		fontWeight: "700",
	},
	lockHint: {
		position: "absolute",
		bottom: "10%",
		backgroundColor: "rgba(0, 0, 0, 0.72)",
		paddingHorizontal: 12,
		paddingVertical: 6,
		borderRadius: 8,
	},
	hudLeftHint: {
		left: 16,
	},
	hudRightHint: {
		right: 16,
	},
	lockHintText: {
		color: "rgba(255, 255, 255, 0.85)",
		fontSize: 12,
	},
});
