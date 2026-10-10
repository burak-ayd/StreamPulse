/**
 * APK güncelleme yapılandırması ve tekil yönetici örneği.
 *
 * REPO NEREDEN GELİYOR (öncelik sırasıyla):
 *   1. app.json / app.config.js → `expo.extra.apkUpdate.githubRepo`
 *   2. Build ortamı: EXPO_PUBLIC_GITHUB_REPO
 *   3. Hiçbiri yok → güncelleme KAPALI (hata değil, bilinçli devre dışı)
 *
 * Boş bırakılabilmesi önemli: depo henüz yayınlanmamış ya da özel bir
 * projeyse uygulama hâlâ açılmalı. Bu yüzden "repo yok" bir hata değil,
 * `disabled` durumudur.
 */
import Constants from "expo-constants";
import { ApkUpdateManager } from "@modules/apk-update/src";

const extra = Constants.expoConfig?.extra?.apkUpdate ?? {};

/** "owner/repo" ya da tam API URL'si olabilir; URL kısmını soyutla. */
function normalizeRepo(input) {
	if (typeof input !== "string") return null;
	const trimmed = input.trim().replace(/\/+$/, "");
	if (!trimmed) return null;
	const match = trimmed.match(/github\.com\/([^/]+\/[^/]+)/i);
	const slug = match ? match[1] : trimmed;
	return slug.includes("/") ? slug : null;
}

export const appUpdateConfig = {
	repo: normalizeRepo(
		extra.githubRepo ?? process.env.EXPO_PUBLIC_GITHUB_REPO ?? ""
	),
	/**
	 * Opsiyonel PAT — yalnızca saatlik 60 isteğin sınırını aşmak için.
	 * Üretimde uygulama içine gömülür; gömülürse bu bir sır, gömülmezse
	 * sadece limit (update kontrolü açılışta 1 kez olduğu için sorun değil).
	 */
	token: extra.githubToken ?? process.env.EXPO_PUBLIC_GITHUB_TOKEN ?? null,
	/** Dosya adında geçmesi beklenen ipucu (release asset seçimi). */
	assetHint: extra.assetHint ?? "streampulse",
	/** Native modül yoksa sürüm karşılaştırması için kullanılır. */
	fallbackVersion: Constants.expoConfig?.version ?? "0.0.0",
};

let manager = null;

/** Uygulama boyunca tek yönetici örneği (event listener sızıntısını önler). */
export function getUpdateManager() {
	if (!manager) {
		manager = new ApkUpdateManager(appUpdateConfig);
	}
	return manager;
}