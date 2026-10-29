/**
 * Şema Sürümleme ve Uyumluluk
 *
 * AsyncStorage'daki veri şemasının sürümünü yönetir.
 * İleri uyumluluk: bilinmeyen alanları korur.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

export const CURRENT_SCHEMA_VERSION = 3;
export const SCHEMA_VERSION_KEY = "streampulse_schema_version";

/**
 * Mevcut depolanan şema sürümünü döner (yoksa 1 = eski format)
 * @returns {Promise<number>}
 */
export async function getSchemaVersion() {
	try {
		const val = await AsyncStorage.getItem(SCHEMA_VERSION_KEY);
		return val ? parseInt(val, 10) : 1;
	} catch {
		return 1;
	}
}

/**
 * Şema sürümünü günceller
 * @param {number} version
 * @returns {Promise<void>}
 */
export async function setSchemaVersion(version = CURRENT_SCHEMA_VERSION) {
	try {
		await AsyncStorage.setItem(SCHEMA_VERSION_KEY, String(version));
	} catch (error) {
		console.warn("Şema sürümü kaydedilemedi:", error);
	}
}

/**
 * İleri uyumluluk için: nesnede tanınmayan alanları korur.
 * @param {object} base - Mevcut veya varsayılan nesne
 * @param {object} incoming - Gelen nesne
 * @returns {object}
 */
export function preserveUnknownFields(base, incoming) {
	if (!incoming || typeof incoming !== "object") return base || {};
	return {
		...(base || {}),
		...incoming,
	};
}
