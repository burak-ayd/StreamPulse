/**
 * OTA güncelleme (expo-updates · custom server) yapılandırması.
 *
 * Native taraf (URL, kod imzası, runtimeVersion) build sırasında
 * app.config.js → `updates` bloğundan APK'ya gömülür. Bu modül yalnızca
 * JS tarafının ÇALIŞMA ZAMANI tercihlerini tutar.
 *
 * UX kararı (yalnızca-açılışta + açılış-penceresi modeli):
 *   - Güncelleme kontrolü YALNIZCA uygulama AÇILIŞINDA bir kez yapılır
 *     (src/hooks/useOtaUpdate.js). Uygulama açıkken başka kontrol ve
 *     reload YOK — kullanıcı aktif kullanırken hiçbir kesinti olmaz.
 *   - Güncelleme sessizce İNDİRİLİR; indirme AÇILIŞ PENCERESİ içinde
 *     (splash kapısının azami süresi) biterse reload ile AYNI açılışta
 *     uygulanır — kullanıcı splash'tayken olur biter. Pencere kaçarsa
 *     bir sonraki açılışta expo-updates kendisi devreye alır.
 *   - Bildirim tercihi AÇIKSA otomatik uygulama yerine "Şimdi yenile /
 *     Kapat" sorulur.
 *
 * Esin ve referans: AstorTest2 proje akışı; tercih cihaz-yerel, AsyncStorage.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Updates from "expo-updates";

/** Bildirim tercihi anahtarı (boolean → "1"/"0"). */
export const OTA_NOTIFY_KEY = "app_ota_notify";

/**
 * Açılış penceresinde kendiliğinden uygulanan (reload edilen) son manifest
 * id'si. Aynı sürüm için üst üste reload döngüsünü engelleyen guard'dır.
 */
export const OTA_STARTUP_APPLIED_KEY = "app_ota_startup_applied";

export const otaUpdateConfig = {
	/**
	 * Native config'in çözümlenip çözümlendiğini gösterir. Expo Go ve dev
	 * modunda Updates.isEnabled true olsa bile API'ler reddettiği için
	 * akış __DEV__ ile kesilir (hook tarafında).
	 */
	isConfigured:
		Boolean(Constants.expoConfig?.updates?.url) && Updates.isEnabled !== false,
};

/** Yeni sürüm indirildiğinde sorulup sorulmayacağı (varsayılan: sessiz). */
export async function getNotifyOnUpdate() {
	try {
		return (await AsyncStorage.getItem(OTA_NOTIFY_KEY)) === "1";
	} catch (error) {
		console.warn("OTA bildirim tercihi okunamadı:", error?.message);
		return false;
	}
}

export async function setNotifyOnUpdate(enabled) {
	try {
		await AsyncStorage.setItem(OTA_NOTIFY_KEY, enabled ? "1" : "0");
	} catch (error) {
		console.warn("OTA bildirim tercihi yazılamadı:", error?.message);
	}
}

/** Açılışta reload edilen son manifest id'sini okur (guard). */
export async function getStartupAppliedId() {
	try {
		return await AsyncStorage.getItem(OTA_STARTUP_APPLIED_KEY);
	} catch (error) {
		console.warn("OTA son uygulanan sürüm okunamadı:", error?.message);
		return null;
	}
}

/** Açılışta reload edilen manifest id'sini kaydeder (guard). */
export async function setStartupAppliedId(id) {
	try {
		await AsyncStorage.setItem(OTA_STARTUP_APPLIED_KEY, String(id));
	} catch (error) {
		console.warn("OTA son uygulanan sürüm yazılamadı:", error?.message);
	}
}
