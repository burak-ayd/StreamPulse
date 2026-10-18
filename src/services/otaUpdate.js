/**
 * OTA güncelleme (expo-updates · custom server) yapılandırması.
 *
 * Native taraf (URL, kod imzası, runtimeVersion) build sırasında
 * app.config.js → `updates` bloğundan APK'ya gömülür. Bu modül yalnızca
 * JS tarafının ÇALIŞMA ZAMANI tercihlerini tutar.
 *
 * UX kararı (sessiz-uygulama modeli):
 *   - Kontrol açılışta ve ön plana dönüşte sessizce yapılır
 *     (src/hooks/useOtaUpdate.js), kullanıcı hiçbir şey görmez.
 *   - Güncelleme sessizce İNDİRİLİR. Kullanıcı uygulama ARKA PLANA
 *     geçtiğinde (güvenli ekranda ise) JS sessizce yeniden yüklenir;
 *     uygulamaya bir sonraki dönüşünde yeni sürüm zaten aktiftir.
 *     Ötelenemezse (oynatıcı/indirme/form açık vb.) bir sonraki tam
 *     açılışta otomatik devreye girer.
 *   - Tercih AÇIKSA "Şimdi yenile" sorusu çıkar, kullanıcı istemezse
 *     aynı sessiz döngüye düşer (arka plan / sonraki açılış).
 *
 * Esin ve referans: AstorTest2 proje akışı; tercih cihaz-yerel, AsyncStorage.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Updates from "expo-updates";

/** Bildirim tercihi anahtarı (boolean → "1"/"0"). */
export const OTA_NOTIFY_KEY = "app_ota_notify";

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
