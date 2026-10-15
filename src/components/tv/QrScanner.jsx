/**
 * QR Tarayıcı — yalnızca kamerası OLAN cihazlarda çalışır.
 *
 * ⚠️ `expo-camera` ÜST SEVİYE IMPORT EDİLMEZ.
 *
 * Neden: TV paketinde (Android TV / tvOS) kamera donanımı yoktur; bazı
 * hedeflerde native modül de pakete hiç girmez. `expo-camera` modülü
 * yüklenirken `requireNativeModule("ExpoCamera")` çağırır ve modül yoksa bu
 * ÇOK ERKEN — import sırasında — patlar. Metro tüm rotaları pakete kattığı
 * için `tv-connect` ekranı üzerinden bu modül TV paketine de girer; o yüzden
 * modül TENBEL (yalnızca `Platform.isTV === false` iken) yüklenir.
 *
 * Kanca kuralı: kamera var/yok kararı PLATFORM BAŞINA SABİTTİR, bu yüzden
 * `KameraGorunumu` içindeki kancalar koşulsuzdur ve sıra hiç değişmez.
 */

import TVPressable from "@/components/common/TVPressable";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import React from "react";
import {
	ActivityIndicator,
	Platform,
	StyleSheet,
	Text,
	View,
} from "react-native";

let _kamera;

/**
 * `expo-camera` modülünü (bir kez) yükler.
 * @returns {object|null} modül, ya da yüklenemedi/yok ise null
 */
function kameraModulu() {
	if (_kamera !== undefined) return _kamera;
	try {
		_kamera = require("expo-camera");
	} catch (hata) {
		console.warn("[tv] expo-camera yüklenemedi:", hata?.message);
		_kamera = null;
	}
	return _kamera;
}

/**
 * Bu cihazda QR tarama kullanılabilir mi?
 *
 * TV'de kısa devre yapar ve modülü HİÇ yüklemez.
 * @returns {boolean}
 */
export function kameraKullanilabilir() {
	if (Platform.isTV) return false;
	return Boolean(kameraModulu()?.CameraView);
}

/**
 * Kamera izni + görüntüsü. Yalnızca modül yüklüyse çizilir.
 */
function KameraGorunumu({ kamera, onKodOkundu }) {
	const { CameraView, useCameraPermissions } = kamera;
	const [izin, izinIste] = useCameraPermissions();

	// ⚠️ TEK OKUMA: `onBarcodeScanned` saniyede birkaç kez tetiklenir.
	// Kilit olmasaydı aynı kod art arda onaylanır; ikinci istek 409/429 alır ve
	// kullanıcı "az önce başarılı oldu" ekranının üstüne hata görürdü.
	const kilit = React.useRef(false);
	const okundu = React.useCallback(
		({ data }) => {
			if (kilit.current) return;
			kilit.current = true;
			onKodOkundu?.(data);
		},
		[onKodOkundu],
	);

	if (!izin) {
		return (
			<View style={styles.merkez}>
				<ActivityIndicator color="#38bdf8" />
			</View>
		);
	}

	if (!izin.granted) {
		return (
			<View style={styles.merkez}>
				<Ionicons name="camera-outline" size={42} color="#64748b" />
				<Text style={styles.bilgi}>
					QR kodu okutabilmek için kamera izni gerekir.
				</Text>
				<TVPressable
					style={styles.izinDugmesi}
					focusedStyle={styles.izinDugmesiOdak}
					onPress={izinIste}
					activeOpacity={0.8}>
					<Text style={styles.izinDugmesiMetni}>Kamera İzni Ver</Text>
				</TVPressable>
			</View>
		);
	}

	return (
		<View style={styles.cerceve}>
			<CameraView
				style={StyleSheet.absoluteFill}
				facing="back"
				barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
				onBarcodeScanned={okundu}
			/>
			{/* Nişangâh: QR'ı çerçeveye ortalama konusunda yol gösterir. */}
			<View style={styles.nisangah} pointerEvents="none" />
		</View>
	);
}

/**
 * QR tarayıcı.
 *
 * @param {object} props
 * @param {(veri: string) => void} props.onKodOkundu - QR içeriği (ham `qr_data`)
 */
export default function QrScanner({ onKodOkundu }) {
	const kamera = Platform.isTV ? null : kameraModulu();

	if (!kamera?.CameraView) {
		// Kamerasız/kamerası desteklenmeyen cihaz: sekme zaten gizlenir, bu
		// görünüm yalnızca güvenlik ağıdır.
		return (
			<View style={styles.merkez}>
				<Ionicons name="camera-outline" size={42} color="#64748b" />
				<Text style={styles.bilgi}>
					Bu cihazda kamera yok. Kodu elle girebilirsiniz.
				</Text>
			</View>
		);
	}

	return <KameraGorunumu kamera={kamera} onKodOkundu={onKodOkundu} />;
}

const styles = StyleSheet.create({
	merkez: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		gap: 12,
		paddingHorizontal: 24,
	},
	bilgi: {
		color: "#94a3b8",
		fontSize: 14,
		textAlign: "center",
		lineHeight: 20,
	},
	izinDugmesi: {
		backgroundColor: "#38bdf8",
		borderRadius: 12,
		paddingHorizontal: 20,
		paddingVertical: 12,
		marginTop: 4,
	},
	izinDugmesiOdak: {
		borderWidth: 2,
		borderColor: "#FFFFFF",
	},
	izinDugmesiMetni: {
		color: "#fff",
		fontWeight: "700",
		fontSize: 15,
	},
	cerceve: {
		flex: 1,
		overflow: "hidden",
		borderRadius: 18,
		backgroundColor: "#000",
	},
	nisangah: {
		position: "absolute",
		top: "18%",
		left: "18%",
		right: "18%",
		bottom: "18%",
		borderWidth: 3,
		borderColor: "rgba(56, 189, 248, 0.9)",
		borderRadius: 16,
	},
});
