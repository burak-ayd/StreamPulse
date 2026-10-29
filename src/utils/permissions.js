/*
 * İzinler — cihaz tarafı (madde 3). Satır hesabı saf `permissionRows.js`
 * 'te; burada yalnızca durum okuma/isteme var. Ek bağımlılık yok — RN
 * çekirdeği `PermissionsAndroid` + native modülün pil optimizasyonu
 * fonksiyonları kullanılır.
 */
import { PermissionsAndroid, Platform } from "react-native";

import {
	isAvailable as nativeAvailable,
	isIgnoringBatteryOptimizations,
	requestIgnoreBatteryOptimizations,
} from "@/services/streamDownloader";
import { getUpdateManager } from "@/services/appUpdate";

export { buildPermissionRows, PERMISSION_LABELS } from "./permissionRows";

const androidSdk = () =>
	Platform.OS === "android" ? Number(Platform.Version) : 0;

/**
 * Tüm izin durumlarını okur: { sdk, statuses, native }.
 */
export async function getPermissionStatuses() {
	const sdk = androidSdk();
	const statuses = {};
	const P = PermissionsAndroid.PERMISSIONS;

	const check = async (key, permission) => {
		try {
			statuses[key] = (await PermissionsAndroid.check(permission))
				? "granted"
				: "denied";
		} catch {
			statuses[key] = "denied";
		}
	};

	if (sdk >= 33) await check("notifications", P.POST_NOTIFICATIONS);
	// Depolama: kullanıcı isteğiyle her sürümde satır + istek. API 33+ üzerinde
	// medya izinleri (görsel/video) istenir; MediaStore yazımı izinsiz de çalışır.
	if (sdk >= 33) {
		await check("storage", P.READ_MEDIA_IMAGES);
	} else {
		await check("storage", P.WRITE_EXTERNAL_STORAGE);
	}
	await check("camera", P.CAMERA);
	if (sdk >= 33) await check("mediaImages", P.READ_MEDIA_IMAGES);

	if (nativeAvailable()) {
		try {
			statuses.batteryOptimization = isIgnoringBatteryOptimizations()
				? "granted"
				: "denied";
		} catch {
			statuses.batteryOptimization = "denied";
		}
	}

	try {
		statuses.installPackages = (await getUpdateManager().hasInstallPermission())
			? "granted"
			: "denied";
	} catch {
		statuses.installPackages = "denied";
	}

	return { sdk, statuses, native: nativeAvailable() };
}

/**
 * Tek bir izni ister; yeni durumu döner. Kalıcı reddedilen izinde
 * "denied" döner — UI "Ayarları aç" gösterir (Linking.openSettings).
 */
export async function requestPermission(key) {
	const sdk = androidSdk();
	const P = PermissionsAndroid.PERMISSIONS;
	let result = "denied";
	switch (key) {
		case "notifications":
			if (sdk >= 33 && Platform.OS === "android") {
				result = await PermissionsAndroid.request(P.POST_NOTIFICATIONS);
			}
			break;
		case "storage":
			if (sdk >= 33 && Platform.OS === "android") {
				// Medya izinleri: görsel + video (iki ayrı pencere olabilir).
				const img = await PermissionsAndroid.request(P.READ_MEDIA_IMAGES);
				if (img === "granted") {
					await PermissionsAndroid.request(P.READ_MEDIA_VIDEO);
				}
				result = img;
			} else {
				result = await PermissionsAndroid.request(P.WRITE_EXTERNAL_STORAGE);
			}
			break;
		case "camera":
			result = await PermissionsAndroid.request(P.CAMERA);
			break;
		case "mediaImages":
			result = await PermissionsAndroid.request(P.READ_MEDIA_IMAGES);
			break;
		case "batteryOptimization":
			if (nativeAvailable()) {
				// İstem penceresini her tap'te aç; okuma hata verirse de pencere
				// görülmüş olur (Task 16: sessiz catch pencereyi yutuyordu).
				try {
					requestIgnoreBatteryOptimizations();
				} catch (e) {
					console.warn("Pil istemi açılamadı:", e?.message);
				}
				try {
					result = isIgnoringBatteryOptimizations() ? "granted" : "denied";
				} catch {
					result = "denied";
				}
			}
			break;
		case "installPackages":
			try {
				getUpdateManager().requestInstallPermission();
			} catch (e) {
				console.warn("Yükleme izni açılamadı:", e?.message);
			}
			result = "denied"; // ekran geri dönünce refresh ile yeniden okunur
			break;
		default:
			break;
	}
	return result;
}
