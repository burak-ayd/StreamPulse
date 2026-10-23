/**
 * API İstemcisi — Token'lı fetch sarmalayıcı
 *
 * Özellikler:
 * - Her istekte Bearer JWT ekler
 * - 401 → otomatik refresh → tekrar dene (bir kez)
 * - Hata semantiği: 429 üstel geri çekilme, 5xx sessiz
 *
 * ⚠️ OTURUM KORUMA KURALI (SYNC_AUTH_PLAN.md §5.3):
 * "5xx → Yerel veri korunur, sessizce sonra dene."
 * Bu yüzden refresh'in başarısız olması oturumu ANLAMAZ; yalnızca 401/403
 * "refresh token artık geçerli değil" demektir ve oturumu kapatır. 429/5xx/ağ
 * hatası GEÇİCİDİR: token'lara dokunulmaz, `_onAuthExpired` çağrılmaz.
 *
 * Import zinciri: apiClient → token.js → SecureStore
 * storage.js'ye BAĞIMLILIK YOK (döngüsel import önleme)
 */

import Constants from "expo-constants";
import {
	clearTokens,
	getAccessToken,
	getRefreshToken,
	needsRefresh,
	saveTokens,
} from "./token";
import { authDiag, parmakIzi } from "@/utils/authDiagnostics";

const API_BASE_URL =
	Constants.expoConfig?.extra?.API_URL ??
	Constants.manifest?.extra?.API_URL ??
	"https://api.example.com";

// Auth event listener — AuthContext bu olayları dinler
let _onAuthExpired = null;

/**
 * Auth süresi dolduğunda çağrılacak callback'i ayarlar.
 * AuthContext tarafından çağrılır.
 */
export function setOnAuthExpired(callback) {
	_onAuthExpired = callback;
}

/**
 * Yenileme sonucunun üç durumu.
 *
 * - `refreshed` : 200 → yeni token'lar yazıldı, istek tekrar atılabilir.
 * - `terminal`  : YALNIZCA 401/403 → refresh token ölü, oturum kapatılır.
 * - `transient` : 408/425/429/5xx veya ağ hatası → token'lara dokunulmaz.
 *
 * @typedef {"refreshed"|"terminal"|"transient"} RefreshOutcome
 */
export const REFRESH_OUTCOME = {
	REFRESHED: "refreshed",
	TERMINAL: "terminal",
	TRANSIENT: "transient",
};

/**
 * Single-flight kilidi.
 *
 * ⚠️ NEDEN GEREKLİ: Sunucu refresh token'ı döndürür (rotasyon). Eşzamanlı 3
 * istek 401 alırsa hepsi AYNI refresh token'la paralel çağrı atarsa ilki yeni
 * token'ları yazar, ikincisi artık geçersiz olan ESKİ token'la gider, 401 alır
 * ve az önce yazılan yeni token'ları da silerdi → kullanıcı düşerdi.
 * Tek uçuş (single-flight) bunları tek çağrıya indirger.
 */
let _refreshPromise = null;

/** Geçici başarısızlıktan sonra tekrar denemeyi kısa süre kısıtlar. */
let _lastTransientRefreshAt = 0;
const TRANSIENT_RETRY_COOLDOWN_MS = 5_000;

/**
 * Bir 401/403 yanıtının yenileme sonucunu yanıt nesnesiyle eşleştirir.
 *
 * ⚠️ NEDEN GEREKLİ: Yenileme "terminal" olmadığında token hâlâ geçerli
 * olabilir (sunucu 5xx verdi, ağ yok, cooldown nedeniyle denemedi). Bu
 * durumda çağıran açısından görünen şey sadece bir `401` yanıtıdır. Eğer
 * çağıran "401 = token ölü" diye yorumlarsa (eski `getMe()` tam olarak bunu
 * yapıyordu) geçici bir hata kalıcı logout'a döner. `WeakMap` Response'a
 * dokunmaz, çağıranların görmediği bir eşleme yapar.
 *
 * @type {WeakMap<object, RefreshOutcome>}
 */
const _authOutcomes = new WeakMap();

/**
 * Bir `authFetch` yanıtı için yenileme sonucunu döndürür.
 * @param {Response} response
 * @returns {RefreshOutcome|null} Hiç yenileme denenmediyse null
 */
export function getAuthOutcome(response) {
	if (!response) return null;
	return _authOutcomes.get(response) ?? null;
}

/**
 * Oturumu kalıcı olarak kapatır: token'ları siler ve AuthContext'e bildirir.
 *
 * @param {string} [neden] - Neden terminal sonuc verildi (teşhis kaydına yazılır)
 * @returns {Promise<RefreshOutcome>} her zaman `terminal`
 */
async function terminateSession(neden = "bilinmiyor") {
	await clearTokens(`terminateSession: ${neden}`);
	_onAuthExpired?.();
	return REFRESH_OUTCOME.TERMINAL;
}

/**
 * Refresh çağrısının kendisi (tek uçuş kilidi OLMADAN).
 * @returns {Promise<RefreshOutcome>}
 */
async function performRefresh() {
	const refreshToken = await getRefreshToken();
	if (!refreshToken) {
		// Yenilenecek bir şey yok. Access token 401 vermişse oturum bitmiştir.
		//
		// ⚠️ TEŞHİS NOTU: Bu dal SUNUCYA HİÇ İSTEK ATMAZ. Yani bu yol
		// tetiklenirse sunucu logunda refresh kaydı görünmez — belirtinin
		// ilk ölçümünde loglar tam olarak bu yüzden sessizdi. Access token
		// VARKEN refresh token'ın tek başına kaybolması bu dalı tetikler.
		await authDiag.record("refresh", {
			sonuc: "terminal",
			neden: "refresh_token_yok",
			sunucuya_gitildi: false,
		});
		return await terminateSession("refresh token yok");
	}

	let response;
	try {
		response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ refresh_token: refreshToken }),
		});
	} catch (error) {
		// Ağ yok / zaman aşımı / bağlantı kesildi — GEÇİCİ.
		// Token'lara dokunmadan dön: uygulama 3 gün kapalı kalmışsa ilk istek
		// soğuk bağlantıyle gider ve burada kalıcı logout'a dönüşürdü.
		console.warn("Token yenileme ağ hatası:", error?.message);
		await authDiag.record("refresh", {
			sonuc: "transient",
			neden: "ag_hatasi",
			mesaj: String(error?.message ?? error),
		});
		return REFRESH_OUTCOME.TRANSIENT;
	}

	if (response.ok) {
		let data = null;
		try {
			data = await response.json();
		} catch {
			data = null;
		}

		if (data?.access_token) {
			// ⚠️ SUNUCU ROTASYONU UYGULAR: bu 200 geldiği anda `refreshToken`
			// ÖLDÜ. Yazma başarısız olursa ve istemci eski token'la bir daha
			// denerse `refresh_token_already_used` alır → terminal → kalıcı
			// logout. Bu yüzden hata YUTULMAZ: çağıran hatayı görüp yeniden
			// denemeye geçer. `saveTokens` içindeki `writeCritical` kritik
			// (refresh) yazmayı zaten bir kez tekrar dener; ikinci deneme de
			// düşerse buraya ulaşırız ve hatayı `refreshSession`'in catch'i
			// `transient` sayar — token'lara dokunmadan.
			await saveTokens({
				access_token: data.access_token,
				// Sunucu yeni refresh token döndürmezse mevcut olanı koru.
				refresh_token: data.refresh_token ?? refreshToken,
				expires_in: data.expires_in,
			});
			_lastTransientRefreshAt = 0;
			await authDiag.record("refresh", {
				sonuc: "refreshed",
				http: response.status,
				yeniRefreshDondur: Boolean(data.refresh_token),
				expiresInSn: data.expires_in ?? null,
				// Sunucuya sunulan token'ın parmak izi: bir sonraki
				// `hasSession` kaydıyla karşılaştırılınca "yazılan token
				// mı sunuldu, başka bir token mı?" sorusu cevaplanır.
				sunulanIzi: parmakIzi(refreshToken),
				yeniIzi: parmakIzi(data.refresh_token ?? refreshToken),
			});
			return REFRESH_OUTCOME.REFRESHED;
		}

		// 200 ama beklenen gövde yok — yenileme sayılmaz, oturum da atılmaz.
		console.warn("Token yenileme yanıtı beklenmedik gövde içeriyor.");
		await authDiag.record("refresh", {
			sonuc: "transient",
			neden: "gövde_yok",
			http: response.status,
		});
		return REFRESH_OUTCOME.TRANSIENT;
	}

	// ⚠️ Yalnızca 401/403 "bu refresh token artık geçerli değil" demektir.
	if (response.status === 401 || response.status === 403) {
		// Gövdeyi oku: GoTrue'nun HANGİ kodu döndüğü ayrımı sağlar.
		//   refresh_token_not_found      → oturum gerçekten ölmüş
		//   refresh_token_already_used   → rotasyon/yeniden kullanım
		//   validation_failed            → bozuk token
		// Sunucu logunda görülmeyen bir ayrım burada yakalanır.
		let govde = null;
		try {
			govde = await response.clone().json();
		} catch {
			try {
				govde = await response.text();
			} catch {
				govde = null;
			}
		}

		// 🔴 SİLME ÖNCESİ DEPOYU TEKRAR OKU.
		//
		// Single-flight kilidi YALNIZCA aynı JS bağlamında işe yarar
		// (`_refreshPromise`). Bizim 401 aldığımız sırada başka bir yenileme
		// dönmüş olabilir:
		//
		//   * modül iki kez yüklenmişse (farklı import yolu / Fast Refresh)
		//   * arka plan görevi ya da zamanlanmış iş kendi bağlamında yenilediyse
		//   * uygulama yeniden başlatıldı, `_refreshPromise` sıfırlandı
		//
		// Bu durumda bizim sunduğumuz token ESKİ, depodaki token YENİ
		// olur. GoTrue "already_used" der — ama oturum sağlamdır, sadece
		// rotasyon bizden önce tüketilmiştir. Şu anki davranış bu ayrımı
		// görmeden token'ları SİLİYOR ve kullanıcıyı düşürüyordu.
		const guncel = await getRefreshToken().catch(() => null);
		if (guncel && guncel !== refreshToken) {
			await authDiag.record("refresh", {
				sonuc: "refreshed",
				neden: "baska_yerde_yenilenmis",
				http: response.status,
				detay: govde?.detail ?? govde?.code ?? govde?.message ?? null,
				// Sunulan (eskimiş) token ile depodaki (taze) token'ın izleri.
				// Bu ikisi FARKLI olmalıdır; değilse teşhis kaydı yanlış yere
				// düşmüş demektir.
				sunulanIzi: parmakIzi(refreshToken),
				depodakiIzi: parmakIzi(guncel),
			});
			// Token'lar silinmez; `authFetch` isteği taze token ile tekrarlar.
			return REFRESH_OUTCOME.REFRESHED;
		}

		await authDiag.record("refresh", {
			sonuc: "terminal",
			neden: `http_${response.status}`,
			http: response.status,
			detay: govde?.detail ?? govde?.code ?? govde?.message ?? null,
			// Sunucunun reddettiği token'ın izi. `saveTokens`'ın yazdığı izle
			// AYNI değilse: yazılan token sunulmamış demektir (revert).
			// Buraya düşebilmek için yukarıdaki depoyu-tekrar-oku kontrolünden
			// geçmiş olmak gerekir: depoda başka bir token YANLIŞSA bu kayıt
			// hiç yazılmaz, onun yerine `baska_yerde_yenilenmis` yazılır.
			sunulanIzi: parmakIzi(refreshToken),
		});
		return await terminateSession(`sunucu ${response.status}`);
	}

	// 408/425/429/5xx ve beklenmedik diğer kodlar: geçici hata.
	console.warn(`Token yenileme geçici hata: ${response.status}`);
	await authDiag.record("refresh", {
		sonuc: "transient",
		neden: `http_${response.status}`,
		http: response.status,
	});
	return REFRESH_OUTCOME.TRANSIENT;
}

/**
 * Token yenileme — TEK SEFERLİK.
 *
 * Eşzamanlı çağrılar aynı uçuşu bekler; her biri ayrı istek atmaz.
 * @returns {Promise<RefreshOutcome>}
 */
function refreshSession() {
	if (_refreshPromise) return _refreshPromise;

	_refreshPromise = performRefresh()
		.catch((error) => {
			// Beklenmeyen hata (ör. SecureStore/JSON ayrıştırma) da oturumu
			// düşürmemeli: en kötü hali bir sonraki denemeye kalır.
			console.warn("Token yenileme hatası:", error?.message);
			return REFRESH_OUTCOME.TRANSIENT;
		})
		.then((outcome) => {
			if (outcome === REFRESH_OUTCOME.TRANSIENT) {
				_lastTransientRefreshAt = Date.now();
			}
			return outcome;
		})
		.finally(() => {
			_refreshPromise = null;
		});

	return _refreshPromise;
}

/**
 * Proaktif yenileme — istek atılmadan ÖNCE çağrılır.
 *
 * Uygulama 1 saatten uzun aradan sonra açıldığında her istek 401→refresh
 * zincirinden geçerdi. Burada süre yaklaşıksa tek bir yenileme yapılır ve tüm
 * istekler taze token ile çıkar. `needsRefresh()` süre bilinmiyorsa `false`
 * döner, dolayısıyla eski oturumlar zorlanmaz.
 *
 * Yenileme BAŞARISIZ olsa bile token'lara dokunulmaz; çağıran elindeki
 * (belki süresi dolmuş) token ile isteği atar, kullanıcı gereksiz yere
 * düşürülmez.
 */
async function ensureFreshToken() {
	try {
		if (!(await needsRefresh())) return;
		if (!(await getRefreshToken())) return;
		await refreshSession();
	} catch (error) {
		console.warn("Proaktif token yenileme atlandı:", error?.message);
	}
}

/**
 * Kimlik doğrulamalı fetch isteği.
 *
 * @param {string} path - URL yolu (örn: "/sync/push")
 * @param {RequestInit} options - fetch seçenekleri
 * @param {object} config - Ek yapılandırma
 * @param {boolean} config.skipAuth - Token ekleme (public endpoint)
 * @param {boolean} config.isRetry - İç kullanım: tekrar deneme bayrağı
 * @returns {Promise<Response>}
 */
export async function authFetch(path, options = {}, config = {}) {
	const { skipAuth = false, isRetry = false } = config;

	const url = path.startsWith("http") ? path : `${API_BASE_URL}${path}`;

	const headers = {
		"Content-Type": "application/json",
		...(options.headers || {}),
	};

	// Süre yaklaşıyorsa isteği atmadan önce tazele (tek uçuş sayesinde
	// eşzamanlı istekler tek çağrıda birleşir).
	if (!skipAuth && !isRetry) {
		await ensureFreshToken();
	}

	// Token ekle
	if (!skipAuth) {
		const accessToken = await getAccessToken();
		if (accessToken) {
			headers.Authorization = `Bearer ${accessToken}`;
		}
	}

	const response = await fetch(url, {
		...options,
		headers,
	});

	// 401 → refresh → tekrar dene (bir kez)
	if (response.status === 401 && !skipAuth && !isRetry) {
		// Az önce geçici bir hata aldıysak (ör. uygulama uçak modunda açıldı)
		// saniyeler içinde tekrar denemek 401 fırtınası üretir; bekle.
		const inCooldown =
			Date.now() - _lastTransientRefreshAt < TRANSIENT_RETRY_COOLDOWN_MS;

		if (!inCooldown) {
			const outcome = await refreshSession();

			if (outcome === REFRESH_OUTCOME.REFRESHED) {
				return authFetch(path, options, { ...config, isRetry: true });
			}

			// `terminal` → `performRefresh` zaten clearTokens() +
			//   `_onAuthExpired()` çağırdı; burada tekrar çağırmıyoruz.
			// `transient` → token'lara dokunulmadı; 401'i sessizce çağırana
			//   bırak (çağıran zaten hata durumunu işliyor), oturumu yok etme.
			_authOutcomes.set(response, outcome);
			return response;
		}

		// Cooldown: yenileme HİÇ denemedi. Sonucu da "geçici" olarak işaretle,
		// çağıran bunu "terminal" sanıp oturumu kapatmasın.
		_authOutcomes.set(response, REFRESH_OUTCOME.TRANSIENT);
	}

	return response;
}

// ─── Auth API'leri (public, token gerektirmez) ────────────────

/**
 * Kullanıcı kaydı
 * @param {{ email: string, password: string, username: string, display_name?: string }} data
 */
export async function signup(data) {
	const response = await authFetch(
		"/api/auth/signup",
		{
			method: "POST",
			body: JSON.stringify(data),
		},
		{ skipAuth: true },
	);

	const body = await response.json();

	if (!response.ok) {
		throw new AuthError(body.detail || "Kayıt başarısız.", response.status);
	}

	await saveTokens({
		access_token: body.access_token,
		refresh_token: body.refresh_token,
		expires_in: body.expires_in,
	});

	return body;
}

/**
 * Giriş
 * @param {{ email: string, password: string }} data
 */
export async function login(data) {
	const response = await authFetch(
		"/api/auth/login",
		{
			method: "POST",
			body: JSON.stringify(data),
		},
		{ skipAuth: true },
	);

	const body = await response.json();

	if (!response.ok) {
		throw new AuthError(body.detail || "Giriş başarısız.", response.status);
	}

	await saveTokens({
		access_token: body.access_token,
		refresh_token: body.refresh_token,
		expires_in: body.expires_in,
	});

	return body;
}

/**
 * Çıkış — sunucuya bildir + yerel token'ları sil
 */
export async function logout() {
	try {
		await authFetch("/api/auth/logout", { method: "POST" });
	} catch {
		// Sunucuya ulaşılamasa bile yerel çıkış yap
	}
	await clearTokens();
}

/**
 * Başarılı `200` gövdesinden kullanıcıyı ayıklar.
 * @returns {{ ok: true, user: object } | { ok: false, reason: "auth" }}
 */
function parseMeBody(data) {
	const user = data?.user || data;
	if (user?.id) return { ok: true, user };
	// 200 ama kullanıcı yok → kimlik doğrulanamaz
	return { ok: false, reason: "auth" };
}

/**
 * Mevcut kullanıcı bilgisi.
 *
 * ⚠️ Artık düz `object|null` DÖNDÜRMEZ. Çağıran "token geçersiz" ile
 * "sunucuya ulaşılamadı" ayrımını YAPABİLMELİDİR; aksi halde 3 gün sonra
 * açılan uygulamada geçici bir 5xx oturumu kalıcı olarak yok eder.
 *
 * @returns {Promise<{ ok: true, user: object }
 *                 | { ok: false, reason: "auth"|"server"|"network" }>}
 *   - `auth`    → refresh ucu 401/403 verdi, yani token GERÇEKTEN ölü.
 *   - `server`  → 5xx/429/408, ya da 401/403 ama yenileme denemesi
 *                 geçici hata ile sonuçlandı (ağ yok / sunucu çöktü).
 *                 Token'a dokunulmaz.
 *   - `network` → fetch reddedildi (uçak modu, zaman aşımı). Token'a dokunulmaz.
 */
/**
 * Kendi profilini günceller — `PUT /api/auth/me` (sunucu sözleşmesi:
 * gelen alanlar yazılır, gelmeyen/`None` gelen korunur).
 *
 * @param {{ username?: string, display_name?: string, avatar_url?: string,
 *   bio?: string, language?: string, is_private?: boolean, birth_date?: string }} fields
 * @returns {Promise<{ok: true, user: object, devices: object[]}|{ok: false, reason: string, detail?: string}>}
 */
export async function updateProfile(fields) {
	try {
		const response = await authFetch("/api/auth/me", {
			method: "PUT",
			body: JSON.stringify(fields ?? {}),
		});

		if (response.ok) {
			await authDiag.record("updateProfile", { sonuc: "ok", http: response.status });
			return parseMeBody(await response.json());
		}

		// 400/409: doğrulama / kullanıcı adı çakışması — detayı öne çıkar.
		if (response.status === 400 || response.status === 409) {
			let detail = null;
			try {
				const body = await response.clone().json();
				detail = body?.detail ?? body?.code ?? body?.message ?? null;
			} catch (_e) { /* gövde JSON değilse sessiz */ }
			await authDiag.record("updateProfile", { sonuc: "dogrulama", http: response.status });
			return { ok: false, reason: "validation", detail };
		}

		if (response.status === 401 || response.status === 403) {
			const terminal = getAuthOutcome(response) === REFRESH_OUTCOME.TERMINAL;
			await authDiag.record("updateProfile", {
				sonuc: terminal ? "auth" : "server",
				http: response.status,
				yenileme: getAuthOutcome(response) ?? "denenmedi",
			});
			return terminal
				? { ok: false, reason: "auth" }
				: { ok: false, reason: "server" };
		}

		await authDiag.record("updateProfile", { sonuc: "server", http: response.status });
		return { ok: false, reason: "server" };
	} catch (hata) {
		await authDiag.record("updateProfile", {
			sonuc: "network",
			mesaj: String(hata?.message ?? hata),
		});
		return { ok: false, reason: "network" };
	}
}

export async function getMe() {
	try {
		let response = await authFetch("/api/auth/me");

		if (response.ok) {
			await authDiag.record("getMe", { sonuc: "ok", http: response.status });
			return parseMeBody(await response.json());
		}

		// `authFetch` yalnızca 401'de yenileme dener. Sunucu süresi dolmuş
		// token için 403 dönüyorsa (yaygın yanlış yapılandırma — DOĞRULANACAK)
		// hiç yenileme denenmez ve oturum "çevrimdışı" sanılır. Bu yüzden
		// 403'te bir kez elle deneriz. Terminal olan YALNIZCA refresh ucunun
		// 401/403'üdür.
		if (response.status === 403 && getAuthOutcome(response) === null) {
			const outcome = await refreshSession();
			if (outcome === REFRESH_OUTCOME.REFRESHED) {
				response = await authFetch("/api/auth/me", {}, { isRetry: true });
				if (response.ok) {
					await authDiag.record("getMe", {
						sonuc: "ok",
						http: response.status,
						yol: "403_yenilendi",
					});
					return parseMeBody(await response.json());
				}
			}
			await authDiag.record("getMe", {
				sonuc: outcome === REFRESH_OUTCOME.TERMINAL ? "auth" : "server",
				http: response.status,
				yol: "403_manuel_yenileme",
				yenileme: outcome,
			});
			if (outcome === REFRESH_OUTCOME.TERMINAL) {
				return { ok: false, reason: "auth" };
			}
			return { ok: false, reason: "server" };
		}

		if (response.status === 401 || response.status === 403) {
			// 401/403 YALNIZCA yenileme terminal sonuc verdiyse "auth"tır.
			// Aksi halde (cooldown, 5xx, ağ hatası) token ölü DEMEK DEĞİLDİR
			// ve oturum korunur.
			const terminal =
				getAuthOutcome(response) === REFRESH_OUTCOME.TERMINAL;
			await authDiag.record("getMe", {
				sonuc: terminal ? "auth" : "server",
				http: response.status,
				yenileme: getAuthOutcome(response) ?? "denenmedi",
			});
			return terminal
				? { ok: false, reason: "auth" }
				: { ok: false, reason: "server" };
		}

		// 5xx / 429 / 408 ve beklenmedik kodlar: oturumu düşürmeden
		// çevrimdışı kullanıma izin ver (bilinçli muhafazakâr seçim).
		await authDiag.record("getMe", {
			sonuc: "server",
			http: response.status,
			yol: "diger_kod",
		});
		return { ok: false, reason: "server" };
	} catch (hata) {
		await authDiag.record("getMe", {
			sonuc: "network",
			mesaj: String(hata?.message ?? hata),
		});
		return { ok: false, reason: "network" };
	}
}

// ─── Hata sınıfı ─────────────────────────────────────────────

export class AuthError extends Error {
	constructor(message, statusCode) {
		super(message);
		this.name = "AuthError";
		this.statusCode = statusCode;
	}
}

export { API_BASE_URL };
