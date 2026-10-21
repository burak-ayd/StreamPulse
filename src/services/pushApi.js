/**
 * Push API'si — Günlük Özet Push (sunucu Faz 5 sözleşmesi)
 *
 * Sunucu uçları (MovieAppNew `api/routes/push.py`):
 *   POST   /api/push/token → { ok, prefs }  cihaz token kaydı (upsert)
 *   DELETE /api/push/token?device_id= → idempotent cihaz silimi
 *   GET    /api/push/settings    → { enabled, saat, tz } (yoksa varsayılan)
 *   PUT    /api/push/settings    → { enabled, saat?, tz? } — boş alan KORUNUR
 *
 * Sunucu sözleşmesinin önemli köşeleri:
 * - `token` Expo biçimidir (`ExponentPushToken[...]` / `ExpoPushToken[...]`);
 *   `push_token` satırı (user_id, device_id) anahtarlıdır ve `token` TEKİLDİR.
 *   Aynı cihazda hesap değişirse sunucu token'ı YENİ hesaba YAZAR (önce
 *   satırları siler) — istemcinin fazla akıl yürütmesi gerekmez.
 * - Gönderim GÜNLÜK TEK özet: kullanıcı `push_prefs.saat`'indeki YEREL
 *   saatte (IANA `tz`), o gün damga basılmamış bildirimler CİHAZ BAŞINA
 *   1 mesajla gelir. `data` gövdesi: `{kind: "bildirim_ozeti", count, tmdb_ids}`.
 *
 * Kural (bildirimApi.js ile aynı): her fonksiyon hata FIRLATMAZ —
 * `null`/`{ok:false}` döner ve hatayı `console.warn` ile teşhisi yerde bırakır.
 *
 * ─── Cihaz kimliği ─────────────────────────────────────────
 * `device_id` SecureStore'da TAŞINMAZ bir rastgele etikettir: ilk kayıtta
 * üretilir, sonra saklanır. TV eşleştirmesindeki cihaz kaydıyla İLİŞKSİZDİR —
 * push satırı (kullanıcı, cihaz) çiftini üstten çözümlemeye çalışmaz.
 *
 * ─── Kapasite sınırları ────────────────────────────────────
 * - Web: expo-notifications push token üretmez → bu modül WEB'DE NO-OP.
 * - TV (Android TV): POST_NOTIFICATIONS bildirim çipi televizyonda anlamsız;
 *   Expo Push kullanıcısı telefon/tablet demektir → TV'de de NO-OP.
 */

import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { router } from "expo-router";
import { authFetch } from "./apiClient";
import { hasSession } from "./token";

const API_PREFIX = "/api/push";

/** Yerelde kalıcı cihaz etiketinin SecureStore anahtarı. */
const DEVICE_ID_KEY = "streampulse_push_device_id";

/** Sunucunun bilmediği durumda gösterilecek özet anı (sunucu varsayılanı). */
export const VARSAYILAN_SECENEKLER = { enabled: true, saat: 18, tz: "Europe/Istanbul" };

// ─── Ortam kapıları ─────────────────────────────────────────

/** Bu cihaz push konusunda katılır mı? (web / TV dışı) */
export function pushDestekliyor() {
	if (Platform.isTV) return false;
	return Platform.OS === "ios" || Platform.OS === "android";
}

/** Cihazın IANA saat dilimi; sunucu varsayılanıyla garanti biçimde döner. */
export function yerelSaatDilimi() {
	try {
		return Intl.DateTimeFormat().resolvedOptions().timeZone || VARSAYILAN_SECENEKLER.tz;
	} catch {
		return VARSAYILAN_SECENEKLER.tz;
	}
}

// ─── Cihaz kimliği ──────────────────────────────────────────

let _cihazIdCache = null;

function _yeniCihazId() {
	// Benzersizlik hedefli etiket: zaman + iki rastgele dilim. Kriptografik
	// iddia YOK — cihaz kimliği güvenlik kimliği değildir.
	const zaman = Date.now().toString(16).padStart(12, "0");
	const r1 = Math.random().toString(16).slice(2, 10).padEnd(8, "0");
	const r2 = Math.random().toString(16).slice(2, 6).padEnd(4, "0");
	return `sp-${zaman}-${r1}-${r2}`;
}

/**
 * Kalıcı cihaz etiketi — ilk çağrıda üretir, sonra SecureStore'dan okur.
 * @returns {Promise<string|null>} web/okuma hatasında null
 */
export async function cihazKimligi() {
	if (_cihazIdCache) return _cihazIdCache;
	try {
		const mevcut = await SecureStore.getItemAsync(DEVICE_ID_KEY);
		if (mevcut) {
			_cihazIdCache = mevcut;
			return mevcut;
		}
		const yeni = _yeniCihazId();
		await SecureStore.setItemAsync(DEVICE_ID_KEY, yeni);
		_cihazIdCache = yeni;
		return yeni;
	} catch (e) {
		console.warn("Cihaz kimliği üretilemedi:", e?.message);
		return null;
	}
}

// ─── Expo push token ────────────────────────────────────────

/**
 * Expo Push token'ını alır: izin iste, jetonu çöz.
 * @returns {Promise<{token: string, platform: string}|null>}
 */
async function _expoTokenAl() {
	try {
		const mevcut = await Notifications.getPermissionsAsync();
		const izin = mevcut?.granted ? mevcut : await Notifications.requestPermissionsAsync();
		if (!izin?.granted) {
			console.warn("Bildirim izni verilmedi — push kaydı atlandı.");
			return null;
		}
		const yanit = await Notifications.getDevicePushTokenAsync();
		const token = String(yanit?.data ?? "").trim();
		if (!token.startsWith("Expo")) {
			console.warn("Beklenmeyen push token biçimi:", token.slice(0, 10));
			return null;
		}
		return { token, platform: Platform.OS === "ios" ? "ios" : "android" };
	} catch (e) {
		console.warn("Expo push token alınamadı:", e?.message);
		return null;
	}
}

// ─── Kayıt / silme ──────────────────────────────────────────

let _kayitUcusu = null;

/**
 * Cihazı sunucuya yazar: Expo token + sabit cihaz etiketi + yerelde saat
 * dilimi. Giriş yoksa / ortam desteklemiyorsa sessizce pas geçer; ikinci
 * kayıt (upsert) zararsızdır ve `last_seen`'i tazeler.
 *
 * @returns {Promise<{ok: boolean, prefs: object|null, mesaj: string?}>}
 */
export async function cihazKaydiYaz() {
	if (!pushDestekliyor()) return { ok: false, mesaj: "Bu platform push desteklemiyor." };
	if (!(await hasSession())) return { ok: false, mesaj: "Hesap gerekli." };
	if (_kayitUcusu) return _kayitUcusu;

	_kayitUcusu = (async () => {
		try {
			const jeton = await _expoTokenAl();
			if (!jeton) return { ok: false, prefs: null, mesaj: "Jeton alınamadı." };
			const cihaz = await cihazKimligi();
			if (!cihaz) return { ok: false, prefs: null, mesaj: "Cihaz etiketi yok." };

			const res = await authFetch(`${API_PREFIX}/token`, {
				method: "POST",
				body: JSON.stringify({
					device_id: cihaz,
					token: jeton.token,
					platform: jeton.platform,
					tz: yerelSaatDilimi(),
				}),
			});
			if (!res.ok) {
				let mesaj = `Sunucu ${res.status}`;
				try {
					const govde = await res.json();
					mesaj = govde?.detail || mesaj;
				} catch (_e) {
					/* gövde yok */
				}
				console.warn("Push token kaydı başarısız:", mesaj);
				return { ok: false, prefs: null, mesaj };
			}
			return { ok: true, prefs: (await res.json())?.prefs ?? null };
		} catch (e) {
			console.warn("Push token kaydı hatası:", e?.message);
			return { ok: false, prefs: null, mesaj: "Sunucuya ulaşılamadı." };
		} finally {
			_kayitUcusu = null;
		}
	})();
	return _kayitUcusu;
}

/**
 * Cihaz push kaydını sunucudan siler (idempotent). Çıkışta çağırılır —
 * token'lar hâlâ geçerliyken çağırın, aksi hâlde istek 401'e düşer.
 * @returns {Promise<boolean>} sunucu 200 dönerse true
 */
export async function cihazKaydiSil() {
	if (!pushDestekliyor()) return false;
	// `hasSession` beklemek yerine deneyip çıkmak: exit yolunda oturum
	// zaten kapanmış olabilir; bir istek bedeli karşılığı sessizce geçilir.
	if (!(await hasSession())) return false;
	try {
		const cihaz = await cihazKimligi();
		if (!cihaz) return false;
		const res = await authFetch(
			`${API_PREFIX}/token?device_id=${encodeURIComponent(cihaz)}`,
			{ method: "DELETE" },
		);
		return res.ok;
	} catch (e) {
		console.warn("Push token silme hatası:", e?.message);
		return false;
	}
}

// ─── Özet tercihleri (settings) ─────────────────────────────

/**
 * Kullanıcının özet tercihini okur; giriş yoksa/hatada `null`.
 * @returns {Promise<{enabled: boolean, saat: number, tz: string}|null>}
 */
export async function pushTercihOku() {
	if (!pushDestekliyor() || !(await hasSession())) return null;
	try {
		const res = await authFetch(`${API_PREFIX}/settings`);
		if (!res.ok) return null;
		return await res.json();
	} catch (e) {
		console.warn("Push tercihi okuma hatası:", e?.message);
		return null;
	}
}

/**
 * Özet tercihini yazar. `saat`/`tz` verilmezse sunucu MEVCUT değeri
 * korur — sadece değişen alan gönderilir.
 *
 * @param {{enabled: boolean, saat?: number, tz?: string}} girdiler
 * @returns {Promise<{ok: true, data: object} | {ok: false, mesaj: string}>}
 */
export async function pushTercihYaz({ enabled, saat, tz } = {}) {
	if (!pushDestekliyor()) return { ok: false, mesaj: "Bu platform push desteklemiyor." };
	if (!(await hasSession())) return { ok: false, mesaj: "Bildirim özeti için hesap gerekli." };
	// Sunucu sözleşmesi: `enabled` her yazımda ŞART; `saat`/`tz` yalnız
	// değişen alan gönderilirse sunucu diğerini MEVCUT değeriyle korur.
	const govde = { enabled: Boolean(enabled) };
	const sayiSaat = Number(saat);
	if (saat != null && Number.isFinite(sayiSaat)) govde.saat = sayiSaat;
	if (tz) govde.tz = tz;
	try {
		const res = await authFetch(`${API_PREFIX}/settings`, {
			method: "PUT",
			body: JSON.stringify(govde),
		});
		if (!res.ok) {
			let mesaj = `Sunucu ${res.status}`;
			try {
				const govde = await res.json();
				mesaj = govde?.detail || mesaj;
			} catch (_e) {
				/* gövde yok */
			}
			return { ok: false, mesaj };
		}
		return { ok: true, data: await res.json() };
	} catch (e) {
		console.warn("Push tercihi yazım hatası:", e?.message);
		return { ok: false, mesaj: "Sunucuya ulaşılamadı." };
	}
}

// ─── Görsel yardımcılar ─────────────────────────────────────

/** "18" → "18:00" (ayar satırı dilinde). */
export function saatEtiketi(saat) {
	const n = Number(saat);
	if (!Number.isFinite(n) || n < 0 || n > 23) return "18:00";
	return `${String(n).padStart(2, "0")}:00`;
}

// ─── Uygulama içi özet davranışı + tap yönlendirme ───────────

// Uygulama ön plandayken özet push'u banner + liste + sesle gösterir;
// arka plan gösterimini işletim sistemi yürütür. Bu yapılandırıcı
// yalnızca ön planı kapsar (SDK 55+ alan adları).
if (Platform.OS !== "web") {
	Notifications.setNotificationHandler({
		handleNotification: async () => ({
			shouldShowBanner: true,
			shouldShowList: true,
			shouldPlaySound: true,
			shouldSetBadge: true,
		}),
	});
}

let _ilkTepkiIslandi = false;

/**
 * Push dokunmalarını gelen kutusuna bağlar. root `_layout` bir kez kurar:
 * - Soğuk açılış dokunuşu (bildirime dokunarak açılan uygulama) → kutu,
 * - Ön planda / arka plandaki dokunuş → kutu.
 * Temizlik: `useEffect(() => pushTepkisiBagla(), [])`.
 *
 * @returns {() => void} abonelikten çıkış
 */
export function pushTepkisiBagla() {
	if (!pushDestekliyor()) return () => {};
	let temiz = () => {};
	try {
		Notifications.getLastNotificationResponseAsync()
			.then((yanit) => {
				if (yanit && !_ilkTepkiIslandi) {
					_ilkTepkiIslandi = true;
					_dokunmayiYonlendir(yanit);
				}
			})
			.catch(() => {});

		const alt = Notifications.addNotificationResponseReceivedListener((yanit) => {
			if (!_ilkTepkiIslandi) {
				_ilkTepkiIslandi = true;
			}
			_dokunmayiYonlendir(yanit);
		});
		temiz = () => alt.remove();
	} catch (e) {
		console.warn("Push dokunma bağlayıcısı kurulamadı:", e?.message);
	}
	return temiz;
}

function _dokunmayiYonlendir(yanit) {
	try {
		const veri = yanit?.notification?.request?.content?.data ?? {};
		if (veri?.kind !== "bildirim_ozeti") return;
		router.push("/(app)/bildirimler");
	} catch (e) {
		console.warn("Push dokunma yönlendirme hatası:", e?.message);
	}
}

export default {
	VARSAYILAN_SECENEKLER,
	pushDestekliyor,
	yerelSaatDilimi,
	cihazKimligi,
	cihazKaydiYaz,
	cihazKaydiSil,
	pushTercihOku,
	pushTercihYaz,
	saatEtiketi,
	pushTepkisiBagla,
};
