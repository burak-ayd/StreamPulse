/**
 * Cihaz Yetkilendirme Servisi — TV'de Kod ve QR ile Oturum Açma
 *
 * RFC 8628 (OAuth 2.0 Device Authorization Grant) akışının İSTEMCİ tarafı:
 *
 *   TV      → requestDeviceCode()  → 6 haneli kod + QR verisi (kimliksiz)
 *   Telefon → approveDeviceCode()  → kodu onaylar (GİRİŞ YAPMIŞ olmalı)
 *   TV      → pollDeviceToken()    → `interval` sn'de bir; oturum gelince durur
 *
 * ⚠️ KARAR MANTIĞI BURADA DEĞİL. Yoklama hızı, süre dolumu ve "yeni kod iste"
 * kararı EKRANIN durumudur (geri sayım, kullanıcı düğmesi, görünürlük). Bu
 * servis yalnızca HTTP sonucunu `kind` alanına çevirir; böylece TV ekranı ile
 * derin bağlantı ekranı aynı davranışı paylaşır.
 *
 * ⚠️ `AuthError` KULLANILMAZ: bu hatalar oturumla ilgili değildir (kod
 * bulunamadı, kod çoktan onaylandı, süre doldu…). Karışırsa `apiClient`ın
 * oturum politikası (401 → yenile → düşür) ile cihaz politikası birbirine
 * girer ve "kod yanlış" gibi basit bir durum çıkışa dönüşebilir.
 */

import { authFetch } from "./apiClient";

/** Sunucunun ürettiği QR içeriğinin şeması (`qr_data` alanı). */
export const TV_ACTIVATE_SCHEME = "streampulse://tv-activate";

/**
 * Cihaz akışına özgü hata.
 *
 * `statusCode` ekranda ayrım için gereklidir: 429 → "biraz bekleyin",
 * 404 → "kodu kontrol edin", 410 → "yeni kod alın", 5xx → "tekrar deneyin".
 */
export class DeviceAuthError extends Error {
	constructor(message, statusCode) {
		super(message);
		this.name = "DeviceAuthError";
		this.statusCode = statusCode;
	}
}

/**
 * Yanıt gövdesini güvenle okur (boş/bozuk gövde hata sayılmaz).
 * @param {Response} response
 * @returns {Promise<object|null>}
 */
async function govdeOku(response) {
	try {
		return await response.json();
	} catch {
		return null;
	}
}

/**
 * `Retry-After` başlığını saniyeye çevirir.
 *
 * Başlık yoksa/bozuksa varsayılana düşülür: çağıran HER durumda beklenecek
 * bir sayı görmelidir, aksi halde 429 alan istemci saniyede bir yeniden
 * deneyip sınırı daha da kötüleştirir.
 *
 * @param {Response} response
 * @param {number} varsayilan
 * @returns {number}
 */
function beklemeSaniyesi(response, varsayilan) {
	const ham = Number(response.headers?.get?.("Retry-After"));
	return Number.isFinite(ham) && ham > 0 ? ham : varsayilan;
}

// ─── TV tarafı ───────────────────────────────────────────────

/**
 * TV için yeni bir eşleştirme kodu ister (kimlik GEREKMEZ).
 *
 * @param {{ device_id: string, device_name: string, platform: string, app_version: string }} cihaz
 *   `utils/deviceId.getDeviceInfo()` çıktısı — sunucudaki `DeviceInfo` ile aynı alanlar.
 * @returns {Promise<{
 *   device_code: string, user_code: string, user_code_display: string,
 *   qr_data: string, expires_in: number, interval: number,
 * }>}
 * @throws {DeviceAuthError} 429 → kod istekleri sınırı aşıldı
 */
export async function requestDeviceCode(cihaz) {
	const response = await authFetch(
		"/api/auth/device/code",
		{
			method: "POST",
			body: JSON.stringify(cihaz),
		},
		{ skipAuth: true },
	);

	const body = await govdeOku(response);

	if (!response.ok) {
		throw new DeviceAuthError(
			body?.detail || "TV kodu alınamadı. Lütfen tekrar deneyin.",
			response.status,
		);
	}

	return body;
}

/**
 * TV oturumunu yoklar (kimlik GEREKMEZ — gizli `device_code` yeter).
 *
 * Dönen `kind` değerleri ekranın durum makinesine BİREBİR karşılık gelir:
 *
 *   - `approved`  → oturum hazır (token'lar `tokens` içinde)
 *   - `pending`   → onay bekleniyor (`interval` sn sonra tekrar)
 *   - `throttled` → çok hızlı yoklandı (`retryAfter` sn bekle)
 *   - `expired`   → kodun süresi doldu (yeni kod iste)
 *   - `invalid`   → kod geçersiz/tüketilmiş (yeni kod iste)
 *   - `error`     → ağ/sunucu hatası; kod HÂLÂ geçerli olabilir (yoklama sürer)
 *
 * @param {string} deviceCode
 * @returns {Promise<{
 *   kind: "approved"|"pending"|"throttled"|"expired"|"invalid"|"error",
 *   tokens?: object, interval?: number, retryAfter?: number, message?: string,
 * }>}
 */
export async function pollDeviceToken(deviceCode) {
	let response;
	try {
		response = await authFetch(
			"/api/auth/device/token",
			{
				method: "POST",
				body: JSON.stringify({ device_code: deviceCode }),
			},
			{ skipAuth: true },
		);
	} catch (hata) {
		// Ağ kesintisi terminal DEĞİLDİR: kod sunucuda duruyor olabilir ve
		// TV'nin tek işi beklemek. Yoklama sürer (bkz. doktrin: 5xx/ağ →
		// yerel durum korunur, sessizce sonra dene).
		return {
			kind: "error",
			message: hata?.message || "Sunucuya ulaşılamadı.",
		};
	}

	const body = await govdeOku(response);

	if (response.status === 200 && body?.access_token) {
		return { kind: "approved", tokens: body };
	}
	if (response.status === 202) {
		const interval = Number(body?.interval);
		return { kind: "pending", interval: interval > 0 ? interval : 3 };
	}
	if (response.status === 410) {
		return {
			kind: "expired",
			message: body?.detail || "Kodun süresi doldu.",
		};
	}
	if (response.status === 429) {
		return {
			kind: "throttled",
			retryAfter: beklemeSaniyesi(response, 10),
			message: body?.detail || "Çok fazla deneme yapıldı.",
		};
	}
	if (response.status === 400) {
		return {
			kind: "invalid",
			message: body?.detail || "Kod geçersiz. TV'de yeni bir kod oluşturun.",
		};
	}

	return {
		kind: "error",
		message: body?.detail || "TV oturumu alınamadı.",
	};
}

// ─── Telefon tarafı ──────────────────────────────────────────

/**
 * Telefondan TV kodunu ONAYLAR (giriş yapmış kullanıcı ister).
 *
 * @param {string} userCode - Ham ya da biçimli kod (`K9X4M2` / `K9X-4M2`)
 * @returns {Promise<{ success: boolean, device_name?: string|null, message: string }>}
 * @throws {DeviceAuthError} 400/404/409/410/429 — mesaj Turkçe ve gösterilebilir
 */
export async function approveDeviceCode(userCode) {
	const response = await authFetch("/api/auth/device/verify", {
		method: "POST",
		body: JSON.stringify({ user_code: userCode }),
	});

	const body = await govdeOku(response);

	if (!response.ok) {
		const hata = new DeviceAuthError(
			body?.detail || "TV bağlanamadı. Lütfen tekrar deneyin.",
			response.status,
		);
		if (response.status === 429) {
			// Ekran "kaç saniye bekleyeyim" sorusunu cevaplayabilsin.
			hata.retryAfter = beklemeSaniyesi(response, 60);
		}
		throw hata;
	}

	return body;
}

// ─── Kod biçimlendirme yardımcıları ──────────────────────────

/**
 * Kullanıcının girdiği/QR'dan gelen kodu normalize eder: `k9x-4m2` → `K9X4M2`.
 *
 * ⚠️ Sunucu da normalize eder (`normalize_user_code`); buradaki kopya
 * GÖRSELDİR: kutucuklara yazılan ayırıcıları temizler ve "6 karakter" kontrolü
 * ağa çıkmadan yapılabilsin diye vardır. Tek doğruluk kaynağı sunucudur.
 *
 * @param {string} raw
 * @returns {string}
 */
export function normalizeActivationCode(raw) {
	return String(raw ?? "")
		.replace(/[\s\-_]/g, "")
		.toUpperCase();
}

/**
 * Derin bağlantı adresinden ya da düz metinden kodu ayıklar.
 *
 * İki giriş biçimi vardır:
 *   - `streampulse://tv-activate?code=K9X4M2` (QR içeriği)
 *   - `K9X-4M2` (kullanıcı elle yazdı)
 *
 * @param {string} raw
 * @returns {string} normalize edilmiş kod (boş olabilir)
 */
export function extractActivationCode(raw) {
	const metin = String(raw ?? "").trim();
	const eslesme = metin.match(/[?&]code=([^&\s]+)/i);
	if (!eslesme) return normalizeActivationCode(metin);
	let kod = eslesme[1];
	try {
		kod = decodeURIComponent(kod);
	} catch {
		// Bozuk yüzde kodlaması: ham değerle devam (sunucu zaten doğrular).
	}
	return normalizeActivationCode(kod);
}

/**
 * Ekranda gösterilecek biçim: `K9X4M2` → `K9X-4M2`.
 *
 * @param {string} code
 * @returns {string}
 */
export function formatActivationCode(code) {
	const temiz = normalizeActivationCode(code);
	if (temiz.length <= 3) return temiz;
	return `${temiz.slice(0, 3)}-${temiz.slice(3)}`;
}
