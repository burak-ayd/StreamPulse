/**
 * Splash varyant çözümlemesi
 * ===========================
 *
 * Kurulu APK'nın paket adından, o build'in splash görselinin hangi klasöre
 * ait olduğunu söyler. Saf fonksiyon — React/RN/asset bağımlılığı yok; bu
 * sayede hem `SplashOverlay.jsx` hem de `scripts/verify-splash-variants.mjs`
 * **aynı** kararı verir ve test ile kod birbirinden ayrı düşmez.
 *
 * ⚠️ NEDEN PAKET ADINDAN: native splash görseli APK'ya `app.config.js`
 * tarafından DERLEME anında gömülür. JS katmanı ise aynı anda belirlenen
 * paket adını okur. İkisi aynı `APP_VARIANT`'tan türediği için ayrışamazlar.
 *
 *   tr.net.burakaydogan.streampulse.dev      → dev
 *   tr.net.burakaydogan.streampulse.preview  → preview
 *   tr.net.burakaydogan.streampulse          → release
 *
 * Ters yönde okumak (manifest/runtime config) güvenilmezdir: dev-client
 * çalışma anında Metro'nun servis ettiği manifest'i kullanır ve orada
 * `APP_VARIANT` verilmemişse release'a düşer. Geçmişte tam olarak bu
 * yüzden dev build'de önce DEV, sonra RELEASE splash görünüyordu.
 *
 * Bilinmeyen/okunamayan paket adı `release` döner. Bu bilinçli bir
 * güvenli varsayılandır; `__DEV__` altında `SplashOverlay` ayrıca uyarı
 * basar, sessizce yanlış marka göstermesin diye.
 *
 * @param {string|null|undefined} applicationId `expo-application` → applicationId
 * @returns {"dev"|"preview"|"release"} Varyant klasörü adı
 */
export function resolveSplashVariantDir(applicationId) {
	const id = applicationId ?? "";
	if (id.endsWith(".dev")) return "dev";
	if (id.endsWith(".preview")) return "preview";
	return "release";
}