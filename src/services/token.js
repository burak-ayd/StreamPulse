/**
 * Token Servisi — SecureStore
 *
 * Access token ve refresh token'ı güvenli depoda saklar.
 * storage.js'den bağımsız → döngüsel import önleme.
 *
 * iOS: Keychain | Android: Keystore | Web: localStorage fallback
 *
 * ⚠️ Keychain'de tek bir kayıt ~2048 baytla sınırlıdır. Bu yüzden token'ların
 * yanına metadata EKLENMEZ; access token'ın bitiş zamanı ayrı ve çok küçük bir
 * kayıtta (`streampulse_session_expiry`) tutulur.
 *
 * Süre bilgisi iki kaynaktan gelir:
 * 1. Sunucunun `expires_in` (saniye) alanı — tercih edilen,
 * 2. JWT'nin `exp` claim'i — sunucu alanı göndermezse.
 * İkisi de yoksa süre BİLİNMEZ sayılır ve `needsRefresh()` `false` döner:
 * eski oturumlarda her açılışta agresif yenileme yapmamak bilinçli tercihtir.
 */

import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { authDiag } from "@/utils/authDiagnostics";

const ACCESS_TOKEN_KEY = "streampulse_access_token";
const REFRESH_TOKEN_KEY = "streampulse_refresh_token";
const SESSION_EXPIRY_KEY = "streampulse_session_expiry";

// Web fallback — SecureStore web'de mevcut değil
const isWeb = Platform.OS === "web";

async function setItem(key, value) {
	if (isWeb) {
		try {
			localStorage.setItem(key, value);
		} catch { }
		return;
	}
	await SecureStore.setItemAsync(key, value);
}

async function getItem(key) {
	if (isWeb) {
		try {
			return localStorage.getItem(key);
		} catch {
			return null;
		}
	}
	return await SecureStore.getItemAsync(key);
}

async function deleteItem(key) {
	if (isWeb) {
		try {
			localStorage.removeItem(key);
		} catch { }
		return;
	}
	await SecureStore.deleteItemAsync(key);
}

// ─── JWT okuma yardımcıları (yalnızca OKUMA) ────────────────────
//
// ⚠️ Buradaki çözümleme GÜVENLİK AMAÇLI DEĞİLDİR, sadece süre tahmini içindir.
// İmza doğrulaması sunucunun işidir; istemci imzayı doğrulamaz, yalnızca okur.

const BASE64_ALPHABET =
	"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/**
 * base64url çözümler. Hermes'ta `atob` mevcutsa o kullanılır; yoksa elle
 * çözümleyiciye düşülür (atob her platformda garanti değil).
 * @param {string} input
 * @returns {string}
 */
function base64UrlDecode(input) {
	const normalized = String(input).replace(/-/g, "+").replace(/_/g, "/");

	if (typeof atob === "function") {
		return atob(normalized);
	}

	// Manuel çözümleyici: 6 bit'lik grupları 8 bit'lik bayta çevirir.
	let output = "";
	let buffer = 0;
	let bits = 0;
	for (let i = 0; i < normalized.length; i++) {
		const value = BASE64_ALPHABET.indexOf(normalized[i]);
		if (value === -1) continue; // '=' dolgusu ve boşluk
		buffer = (buffer << 6) | value;
		bits += 6;
		if (bits >= 8) {
			bits -= 8;
			output += String.fromCharCode((buffer >> bits) & 0xff);
		}
	}

	// Latin-1 bayt dizisi → UTF-8 metin (Türkçe karakterler dahil)
	try {
		return decodeURIComponent(
			output
				.split("")
				.map((c) => `%${`00${c.charCodeAt(0).toString(16)}`.slice(-2)}`)
				.join(""),
		);
	} catch {
		return output;
	}
}

/**
 * JWT'nin `exp` claim'ini okur (İMZA DOĞRULANMAZ).
 * @param {string} token
 * @returns {number|null} ms cinsinden bitiş zamanı, yoksa null
 */
export function decodeJwtExpiryMs(token) {
	if (!token || typeof token !== "string") return null;
	const parts = token.split(".");
	if (parts.length !== 3) return null;
	try {
		const payload = JSON.parse(base64UrlDecode(parts[1]));
		const exp = Number(payload?.exp);
		if (!Number.isFinite(exp) || exp <= 0) return null;
		return exp * 1000;
	} catch {
		return null;
	}
}

// Süre belleği — her istekte SecureStore'a (native köprüye) gitmemek için.
// Token'ları yalnızca BU modül yazdığı için (login/refresh/logout dahil)
// bellek tutarlı kalır.
let _expiryCache = null;
let _expiryLoaded = false;

// ─── Public API ───────────────────────────────────────────────

/**
 * Access token'ı kaydeder.
 * @param {string} token
 */
export async function setAccessToken(token) {
	if (!token) return;
	await setItem(ACCESS_TOKEN_KEY, token);
}

/**
 * Access token'ı okur.
 * @returns {Promise<string|null>}
 */
export async function getAccessToken() {
	return await getItem(ACCESS_TOKEN_KEY);
}

/**
 * Refresh token'ı kaydeder.
 * @param {string} token
 */
export async function setRefreshToken(token) {
	if (!token) return;
	await setItem(REFRESH_TOKEN_KEY, token);
}

/**
 * Refresh token'ı okur.
 * @returns {Promise<string|null>}
 */
export async function getRefreshToken() {
	return await getItem(REFRESH_TOKEN_KEY);
}

/**
 * Her iki token'ı birden kaydeder ve access token'ın bitiş zamanını saklar.
 *
 * @param {object} tokens
 * @param {string} tokens.access_token
 * @param {string} [tokens.refresh_token] - Sunucu yeni refresh token döndürmezse korunur
 * @param {number} [tokens.expires_in] - Saniye. Yoksa JWT `exp`'i okunur.
 */
export async function saveTokens({ access_token, refresh_token, expires_in } = {}) {
	const writes = [];
	if (access_token) writes.push(setAccessToken(access_token));
	if (refresh_token) writes.push(setRefreshToken(refresh_token));

	// Bitiş zamanı: sunucunun `expires_in` değeri önceliklidir; yoksa JWT'den okunur.
	let expiryMs = null;
	const seconds = Number(expires_in);
	if (Number.isFinite(seconds) && seconds > 0) {
		expiryMs = Date.now() + seconds * 1000;
	} else if (access_token) {
		expiryMs = decodeJwtExpiryMs(access_token);
	}

	// null → kayıt silinir, `needsRefresh()` false kalır
	writes.push(saveSessionExpiry(expiryMs));

	// ⚠️ Yazma sonucunu ÖLÇÜM (`:hasSession()` defteri).
	// SecureStore yazması sessizce başarısız olursa (Android keystore
	// hataları, dolu cihaz) burada hata fırlatır; `Promise.all` reddedilir
	// ve çağıran bunu "geçici hata" sanıp yeniden dener. Ama token'ın
	// yarısı yazılmış olabilir — o yarım durum kalıcı logout'un en olası
	// sebebidir. Bu kayıt onu görünür kılar.
	try {
		await Promise.all(writes);
		await authDiag.record("saveTokens", {
			accessYazildi: Boolean(access_token),
			refreshYazildi: Boolean(refresh_token),
			expiryYazildi: Boolean(expiryMs),
			expiresInSn: Number.isFinite(seconds) && seconds > 0 ? seconds : null,
		});
	} catch (hata) {
		// Yazma hatasını teşhise yaz, sonra YUTMA: çağıran bunu zaten
		// "geçici hata" olarak ele alıyor (yeniden denenir).
		await authDiag.record("saveTokens", {
			HATA: true,
			mesaj: String(hata?.message ?? hata),
			accessYazildi: Boolean(access_token),
			refreshYazildi: Boolean(refresh_token),
		});
		throw hata;
	}
}

/**
 * Access token'ın bitiş zamanını ayrı bir kayıtta saklar.
 * @param {number|null} timestampMs - null/geçersizse kayıt silinir
 */
export async function saveSessionExpiry(timestampMs) {
	if (!Number.isFinite(timestampMs) || timestampMs <= 0) {
		_expiryCache = null;
		_expiryLoaded = true;
		await deleteItem(SESSION_EXPIRY_KEY);
		return;
	}
	const value = Math.floor(timestampMs);
	_expiryCache = value;
	_expiryLoaded = true;
	await setItem(SESSION_EXPIRY_KEY, String(value));
}

/**
 * Access token'ın bitiş zamanını okur.
 * @returns {Promise<number|null>} ms cinsinden zaman damgası, yoksa null
 */
export async function getAccessTokenExpiry() {
	if (_expiryLoaded) return _expiryCache;
	const raw = await getItem(SESSION_EXPIRY_KEY);
	const parsed = Number(raw);
	_expiryCache = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
	_expiryLoaded = true;
	return _expiryCache;
}

/**
 * Access token'ın yenilenmesi gerekiyor mu?
 *
 * Süre BİLİNMİYORSA `false` döner: eski oturumlarda (expiry kaydı yok) her
 * açılışta zorunlu refresh üretmek, "3 gün sonra açıldı → kalıcı logout"
 * hatasının kaynağıydı. Süre ancak sunucudan gelmişse agresif davranılır.
 *
 * @param {number} [skewMs] - Ağ gecikmesi payı
 * @returns {Promise<boolean>}
 */
export async function needsRefresh(skewMs = 60_000) {
	const expiry = await getAccessTokenExpiry();
	if (!expiry) return false;
	return expiry - skewMs <= Date.now();
}

/**
 * Tüm token'ları siler (çıkış).
 *
 * @param {string} [neden] - Neden silindiğini teşhis kaydına yazar
 */
export async function clearTokens(neden = "bilinmiyor") {
	// ⚠️ Silmeden ÖNCE ölç: teşhis için "varlık" bilgisi gerekiyor ve
	// temizlikten sonra öğrenilemez.
	const [a, r] = await Promise.all([
		getAccessToken().catch(() => null),
		getRefreshToken().catch(() => null),
	]);
	await authDiag.record("clearTokens", {
		neden,
		accessVardi: Boolean(a),
		refreshVardi: Boolean(r),
	});

	_expiryCache = null;
	_expiryLoaded = true;
	await Promise.all([
		deleteItem(ACCESS_TOKEN_KEY),
		deleteItem(REFRESH_TOKEN_KEY),
		deleteItem(SESSION_EXPIRY_KEY),
	]);
}

/**
 * Oturum var mı kontrolü (hızlı).
 *
 * Access token silinmiş ama refresh token geçerliyse oturum HÂLÂ vardır:
 * gereksiz yere login ekranına düşmemek için ikisi de aranır.
 *
 * ⚠️ TEŞHİS: Sonuç burada bile kaydedilir. "Uygulama açıldı ve oturum yok"
 * belirtisinin en önemli ayrımı budur — sunucuya hiç istek atılmadan bu
 * noktada karar veriliyorsa logda 401/refresh IZİ OLMAZ (belirtinin ilk
 * ölçümünde tam olarak bu görüldü).
 *
 * @returns {Promise<boolean>}
 */
export async function hasSession() {
	const [access, refresh] = await Promise.all([
		getAccessToken().catch(() => null),
		getRefreshToken().catch(() => null),
	]);

	const sonuc = Boolean(access || refresh);
	await authDiag.record("hasSession", {
		sonuc,
		accessVardi: Boolean(access),
		refreshVardi: Boolean(refresh),
		// Uzunluklar token DEĞERİNİ ele vermez; yalnızca boş/kırpılmış
		// ayırt etmek için kullanılır.
		accessUzunluk: access?.length ?? 0,
		refreshUzunluk: refresh?.length ?? 0,
	});
	return sonuc;
}
