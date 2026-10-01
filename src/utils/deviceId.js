/**
 * Kalıcı Cihaz Kimliği
 *
 * UUID + cihaz adı üretir, AsyncStorage'da saklar.
 * Cihaz adı kullanıcı tarafından düzenlenebilir.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Device from "expo-device";
import { Platform } from "react-native";

const DEVICE_ID_KEY = "streampulse_device_id";
const DEVICE_NAME_KEY = "streampulse_device_name";

/**
 * Basit UUID v4 üreteci (crypto olmadan)
 */
function generateUUID() {
	return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
		const r = (Math.random() * 16) | 0;
		const v = c === "x" ? r : (r & 0x3) | 0x8;
		return v.toString(16);
	});
}

/**
 * Varsayılan cihaz adı oluşturur.
 * expo-device'den model adını alır, yoksa platform bazlı fallback.
 */
function getDefaultDeviceName() {
	const modelName = Device.modelName;
	const brand = Device.brand;

	if (modelName) {
		return brand ? `${brand} ${modelName}` : modelName;
	}

	switch (Platform.OS) {
		case "ios":
			return "iPhone";
		case "android":
			return "Android Cihaz";
		case "web":
			return "Web Tarayıcı";
		default:
			return "Bilinmeyen Cihaz";
	}
}

/**
 * Platform bilgisini döndürür.
 * @returns {'ios' | 'android' | 'web'}
 */
export function getDevicePlatform() {
	return Platform.OS;
}

/**
 * Kalıcı cihaz UUID'sini döndürür.
 * İlk çağrıda üretir ve AsyncStorage'a yazar.
 * @returns {Promise<string>}
 */
export async function getDeviceId() {
	try {
		let deviceId = await AsyncStorage.getItem(DEVICE_ID_KEY);
		if (!deviceId) {
			deviceId = generateUUID();
			await AsyncStorage.setItem(DEVICE_ID_KEY, deviceId);
		}
		return deviceId;
	} catch (error) {
		console.error("Cihaz ID okunurken hata:", error);
		// Hata durumunda geçici UUID döndür (uygulama yeniden başlatılırsa değişir)
		return generateUUID();
	}
}

/**
 * Cihaz adını döndürür.
 * @returns {Promise<string>}
 */
export async function getDeviceName() {
	try {
		let name = await AsyncStorage.getItem(DEVICE_NAME_KEY);
		if (!name) {
			name = getDefaultDeviceName();
			await AsyncStorage.setItem(DEVICE_NAME_KEY, name);
		}
		return name;
	} catch (error) {
		console.error("Cihaz adı okunurken hata:", error);
		return getDefaultDeviceName();
	}
}

/**
 * Cihaz adını günceller (kullanıcı düzenlemesi).
 * @param {string} newName
 * @returns {Promise<void>}
 */
export async function setDeviceName(newName) {
	if (!newName || typeof newName !== "string") {
		throw new Error("Cihaz adı boş olamaz.");
	}
	await AsyncStorage.setItem(DEVICE_NAME_KEY, newName.trim());
}

/**
 * Tüm cihaz bilgilerini döndürür.
 * API sözleşmesi formatında: { device_id, device_name, platform, app_version }
 * @returns {Promise<object>}
 */
export async function getDeviceInfo() {
	const [deviceId, deviceName] = await Promise.all([
		getDeviceId(),
		getDeviceName(),
	]);

	return {
		device_id: deviceId,
		device_name: deviceName,
		platform: getDevicePlatform(),
		app_version: "1.0.0", // TODO: Constants.expoConfig?.version
	};
}
