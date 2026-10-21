/**
 * Bildirim API'si — Yeni Bölüm Bildirimi (sunucu Faz 2-3 sözleşmesi)
 *
 * Sunucu uçları (MovieAppNew `api/routes/bildirim.py`):
 *   GET  /api/notifications/settings?tmdb_id=  → tercih (yoksa varsayılan)
 *   GET  /api/notifications/settings-list      → { items: [...] } (tüm tercihler)
 *   PUT  /api/notifications/settings           → tercih yaz (upsert)
 *   GET  /api/notifications?before=&limit=     → gelen kutusu
 *   GET  /api/notifications/unread-count       → { count }
 *   POST /api/notifications/read               → { updated } (ids | all)
 *   DELETE /api/notifications/{id}             → { deleted } (yalnız sahibi)
 *
 * Kural: her fonksiyon hata FIRLATMAZ — arayüz her senaryoda etkisiz bir
 * değerle devam edebilsin diye null/boş/0 döndürür ve hatayı `console.warn`
 * ile teşhisi yerde bırakır.
 *
 * ─── Rozet ─────────────────────────────────────────────────────
 * Abone yüzeyleri (ana ekran kromundaki zil, gelen kutusu) cihaz başına
 * birden fazla örnek mountlanabildiğinden okunmamış sayı MODÜL
 * SEVİYESİNDE önbellekli: 60 sn TTL + uçuş dedupe; yeni okuma/silme
 * sonucun abonelere yayılır. Böylece beş örnek ortada sadece İSTEK üretir.
 * Sayı her değiştiğinde uygulama SİMGESİNİN launcher rozetine de yazılır
 * (`setBadgeCountAsync`): Android'de başlatıcı desteği değişkendir
 * (desteklemeyen başlatıcıda söz `false` ile sessizce döner);
 * destekleyen başlatıcıda (MIUI dahil) simge doğrudan okunmamış
 * adedi gösterir.
 *
 * ─── Başlık anımsatıcısı ────────────────────────────────────────
 * `notification.series_title` sunucuda BİLEREK NULL yazılır (tasarım
 * kararı): başlığı İSTEMCİ yerelde çözer. Dizi detay kartı açıldığında
 * `baslikHatirla(mediaKey, baslik)` yazar; gelen kutusu satırlarını bu
 * eşleşmeyle zenginleştirir. Senkronize EDİLMEZ (cihaza mahsus) — Faz 6'da
 * istenirse alan sunucuya taşınabilir.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { authFetch } from "./apiClient";
import { hasSession } from "./token";

const API_PREFIX = "/api/notifications";

/** `series_title`'ın yerel çözümü için AsyncStorage anahtarı. */
const BASLIK_ANI_KEY = "user_notification_titles";

/** Rozet önbelleğinin tazeliği — bunun altında ağ dokunulmaz. */
const ROZET_TTL_MS = 60_000;

/**
 * Dizi kimliğini kanonik `tmdb-tv-<id>` anahtarına indirger (sunucu
 * `media_keyi` ile aynı sözleşme). Sadece tam sayı kabul; tanınmayan
 * biçim null döner — istemci fazla akıl yürütmeyi reddeder.
 *
 * @param {string|number} tmdbId
 * @returns {string|null}
 */
export function mediaKimligi(tmdbId) {
	const s = String(tmdbId ?? "").trim();
	if (!/^\d+$/.test(s)) return null;
	return `tmdb-tv-${s}`;
}

// ─── Yerel başlık anımsatıcısı ────────────────────────────────

/**
 * (mediaKey → dizi başlığı) eşleşmesini yerelde anımsatır.
 * Aynı çifti tekrar yazmak zararsız; değişmediyse disk dokunulmaz.
 *
 * @param {string} mediaKey - Kanonik anahtar (mediaKimligi çıktısı)
 * @param {string} baslik
 * @returns {Promise<void>}
 */
export async function baslikHatirla(mediaKey, baslik) {
	if (!mediaKey || !baslik) return;
	try {
		const ham = await AsyncStorage.getItem(BASLIK_ANI_KEY);
		const hafiza = ham ? JSON.parse(ham) : {};
		if (hafiza[mediaKey] === baslik) return; // değişmedi → yazmaya gerek yok
		hafiza[mediaKey] = baslik;
		await AsyncStorage.setItem(BASLIK_ANI_KEY, JSON.stringify(hafiza));
	} catch (e) {
		console.warn("Başlık anımsatıcısı yazım hatası:", e?.message);
	}
}

/**
 * Anımsanan başlıkların tümü — gelen kutusu zenginleştirmesi için.
 * @returns {Promise<Record<string, string>>}
 */
export async function basliklariOku() {
	try {
		const ham = await AsyncStorage.getItem(BASLIK_ANI_KEY);
		return ham ? JSON.parse(ham) : {};
	} catch (e) {
		console.warn("Başlık anımsatıcısı okuma hatası:", e?.message);
		return {};
	}
}

// ─── Tercih (settings) ────────────────────────────────────────

/**
 * Tercihleri okur. Giriş yoksa / hata varsa `null` — çağıran varsayılan
 * davranışla devam eder (`{enabled: false, mode: "watched_source"}`).
 *
 * @param {string|number} tmdbId - Çıplak sayı ya da "tmdb-tv-N"
 * @returns {Promise<{tmdb_id: string, dizi_url: string|null,
 *                     enabled: boolean, mode: string,
 *                     watched_provider: string|null} | null>}
 */
export async function tercihOku(tmdbId) {
	const anahtar = mediaKimligi(tmdbId);
	if (!anahtar) return null;
	if (!(await hasSession())) return null;
	try {
		const res = await authFetch(
			`${API_PREFIX}/settings?tmdb_id=${encodeURIComponent(anahtar)}`,
		);
		if (!res.ok) return null;
		return await res.json();
	} catch (e) {
		console.warn("Bildirim tercihi okuma hatası:", e?.message);
		return null;
	}
}

/**
 * Kullanıcının TÜM bildirim tercihleri (`GET /settings-list`).
 *
 * Ayar ekranındaki "Takip Edilen Diziler" bölümü bu uçtan beslenir:
 * satırlar sunucuda EN YENİ güncellenen sıraya dizilmiş olarak gelir;
 * görünen başlıklar ÇAĞIRAN taraf tarafından `basliklariOku` eşleşmesiyle
 * çözülür (başlık sunucuda bilinçli saklanmaz — yerel karar).
 *
 * @returns {Promise<Array<{tmdb_id: string, enabled: boolean,
 *                     mode: string, watched_provider: string|null}>>}
 *          giriş yoksa / hatada boş dizi
 */
export async function bildirimTercihListesi() {
	if (!(await hasSession())) return [];
	try {
		const res = await authFetch(`${API_PREFIX}/settings-list`);
		if (!res.ok) {
			console.warn("Bildirim tercih listesi başarısız:", res.status);
			return [];
		}
		const govde = await res.json();
		return Array.isArray(govde?.items) ? govde.items : [];
	} catch (e) {
		console.warn("Bildirim tercih listesi hatası:", e?.message);
		return [];
	}
}

/**
 * Tercih yaz (upsert).
 *
 * Kurallar (sunucu sözleşmesi):
 * - `enabled=true` + mode `watched_source` → `watchedProvider` ŞART (400 döner).
 * - `watchedProvider` + `diziUrl` birlikte doluysa sunucu denetim çiftini
 *   `series_audit_state`'e BAĞLAR (all_sources modunda tohum işi budur).
 * - `tmdb_id` çıplak sayı gönderilebilir; sunucu kanonikleştirip döndürür.
 *
 * @param {{
 *   tmdbId: string|number, enabled: boolean,
 *   mode?: "watched_source"|"all_sources",
 *   watchedProvider?: string|null, diziUrl?: string|null,
 * }} girdiler
 * @returns {Promise<{ok: true, data: object} | {ok: false, mesaj: string}>}
 */
export async function tercihYaz({
	tmdbId,
	enabled,
	mode = "watched_source",
	watchedProvider = null,
	diziUrl = null,
}) {
	const anahtar = mediaKimligi(tmdbId);
	if (!anahtar) {
		return { ok: false, mesaj: "TMDB kimliği geçerli değil." };
	}
	if (!(await hasSession())) {
		return { ok: false, mesaj: "Bildirim için hesap gerekli." };
	}
	try {
		const res = await authFetch(`${API_PREFIX}/settings`, {
			method: "PUT",
			body: JSON.stringify({
				tmdb_id: anahtar,
				enabled,
				mode,
				// Her iki modda da güncel kaynak gönderilir: watched_source'ta
				// TERCİH kaynağı, all_sources'ta ise DENETİM çiftinin tohumu
				// (sunucu prefs'te provider'ı NULL'larken bağlantıyı kurar).
				watched_provider: watchedProvider ?? null,
				dizi_url: diziUrl ?? null,
			}),
		});
		if (!res.ok) {
			let mesaj = `Sunucu ${res.status}`;
			try {
				const govde = await res.json();
				mesaj = govde?.detail || mesaj;
			} catch (_e) {
				/* gövde yoksa üstteki mesaj kalır */
			}
			return { ok: false, mesaj };
		}
		return { ok: true, data: await res.json() };
	} catch (e) {
		console.warn("Bildirim tercihi yazım hatası:", e?.message);
		return { ok: false, mesaj: "Sunucuya ulaşılamadı." };
	}
}

// ─── Gelen kutusu ─────────────────────────────────────────────

/**
 * Gelen kutusu satırları.
 *
 * @param {{limit?: number, before?: string}} baglantilar
 * @returns {Promise<{satirlar: Array<object>, dahaVar: boolean}>}
 */
export async function gelenKutusuGetir({ limit = 50, before = null } = {}) {
	if (!(await hasSession())) return { satirlar: [], dahaVar: false };
	try {
		const soru = new URLSearchParams({ limit: String(limit) });
		if (before) soru.set("before", before);
		const res = await authFetch(`${API_PREFIX}?${soru.toString()}`);
		if (!res.ok) {
			console.warn("Gelen kutusu isteği başarısız:", res.status);
			return { satirlar: [], dahaVar: false };
		}
		const govde = await res.json();
		return {
			satirlar: Array.isArray(govde?.items) ? govde.items : [],
			dahaVar: Boolean(govde?.has_more),
		};
	} catch (e) {
		console.warn("Gelen kutusu hatası:", e?.message);
		return { satirlar: [], dahaVar: false };
	}
}

// ─── Rozet ────────────────────────────────────────────────────

let _rozet = { sayi: 0, zamanMs: 0 };
let _rozetBug = null;
const _rozetAboneler = new Set();

/**
 * Rozet değiştiğinde çağrılan abonelik — BottomNavigation her ekran için
 * ayrı örnek olabileceğinden, güncelleme abonelere YAYILIR.
 *
 * @param {(sayi: number) => void} fonk
 * @returns {() => void} abonelikten çıkış
 */
export function rozetAbone(fonk) {
	_rozetAboneler.add(fonk);
	return () => {
		_rozetAboneler.delete(fonk);
	};
}

function _rozetYay(sayi) {
	_rozet = { sayi, zamanMs: Date.now() };
	_simgeRozetYaz(sayi);
	for (const abone of _rozetAboneler) {
		try {
			abone(sayi);
		} catch (_e) {
			/* abone hatası rozeti engellemesin */
		}
	}
}

/**
 * Launcher rozeti: uygulama simgesi üzerindeki okunmamış sayısı.
 * Uygulama içi rozetin (zil) tamamlayıcısıdır — her değişimde TEK
 * yazım; başlatıcı desteklemiyorsa `false` çözülür ve sessizce
 * geçilir. TV'de simge rozeti anlamsızdır; web'de API yoktur.
 *
 * @param {number} sayi
 * @returns {void}
 */
function _simgeRozetYaz(sayi) {
	if (Platform.isTV) return;
	if (Platform.OS !== "android" && Platform.OS !== "ios") return;
	void Notifications.setBadgeCountAsync(sayi).catch((e) => {
		console.warn("Uygulama simge rozeti yazılamadı:", e?.message);
	});
}

/**
 * Okunmamış bildirim sayısı. 60 sn TTL'li önbellek; paralel çağrılar
 * TEK uçuşta birleşir. Giriş yoksa ya da istek başarısızsa ÖNCEKİ
 * değer korunur (rozet yalan söylemez).
 *
 * @param {{force?: boolean}} [bilgiler] - `force:true` önbelleği geçer
 * @returns {Promise<number>}
 */
export async function okunmamisSayisiGetir({ force = false } = {}) {
	if (!force && Date.now() - _rozet.zamanMs < ROZET_TTL_MS) {
		return _rozet.sayi;
	}
	if (_rozetBug) return _rozetBug;

	_rozetBug = (async () => {
		if (!(await hasSession())) {
			_rozetYay(0);
			return 0;
		}
		try {
			const res = await authFetch(`${API_PREFIX}/unread-count`);
			if (!res.ok) return _rozet.sayi;
			const govde = await res.json();
			const sayi = Number.isFinite(govde?.count) ? govde.count : _rozet.sayi;
			_rozetYay(sayi);
			return sayi;
		} catch (e) {
			console.warn("Okunmamış bildirim sayısı hatası:", e?.message);
			return _rozet.sayi;
		} finally {
			_rozetBug = null;
		}
	})();
	return _rozetBug;
}

// ─── Okundu damgası ───────────────────────────────────────────

/**
 * Satır(ları) okundu işaretle; başarıdan sonra rozeti TAZELER
 * (abone olanlar otomatik güncellenir).
 *
 * @param {number[]} idListesi
 * @returns {Promise<number|null>} güncellenen adet; hatada null
 */
export async function okunduIsaretle(idListesi) {
	if (!Array.isArray(idListesi) || idListesi.length === 0) return null;
	if (!(await hasSession())) return null;
	try {
		const res = await authFetch(`${API_PREFIX}/read`, {
			method: "POST",
			body: JSON.stringify({ ids: idListesi }),
		});
		if (!res.ok) {
			console.warn("Okundu işaretleme başarısız:", res.status);
			return null;
		}
		const govde = await res.json();
		void okunmamisSayisiGetir({ force: true });
		return Number.isFinite(govde?.updated) ? govde.updated : null;
	} catch (e) {
		console.warn("Okundu işaretleme hatası:", e?.message);
		return null;
	}
}

/**
 * Tümünü okundu işaretle. Yanıtın `updated` sayısı döndürülür; rozet tazelenir.
 * @returns {Promise<number|null>}
 */
export async function okunduTumunuIsaretle() {
	if (!(await hasSession())) return null;
	try {
		const res = await authFetch(`${API_PREFIX}/read`, {
			method: "POST",
			body: JSON.stringify({ all: true }),
		});
		if (!res.ok) {
			console.warn("Tümü-okundu işaretleme başarısız:", res.status);
			return null;
		}
		const govde = await res.json();
		void okunmamisSayisiGetir({ force: true });
		return Number.isFinite(govde?.updated) ? govde.updated : null;
	} catch (e) {
		console.warn("Tümü-okundu hatası:", e?.message);
		return null;
	}
}

// ─── Silme ───────────────────────────────────────────────────

/**
 * Tek bildirimi siler (`DELETE /api/notifications/{id}`). Başarıdan sonra
 * rozet TAZELENİR — okunmamış bir satır silindiyse rozet düşer.
 *
 * 404 özel bir durum değildir: satır başka cihazdan silinmiş olabilir;
 * çağıran taraf iyimser temizlik yapmışsa satır zaten ekranda yoktur.
 *
 * @param {number} id
 * @returns {Promise<boolean>} sunucu satırı sildiyse true
 */
export async function bildirimSil(id) {
	if (!Number.isFinite(id)) return false;
	if (!(await hasSession())) return false;
	try {
		const res = await authFetch(`${API_PREFIX}/${id}`, {
			method: "DELETE",
		});
		if (!res.ok) {
			console.warn("Bildirim silme başarısız:", res.status);
			return false;
		}
		void okunmamisSayisiGetir({ force: true });
		return true;
	} catch (e) {
		console.warn("Bildirim silme hatası:", e?.message);
		return false;
	}
}

// ─── Ortak biçim yardımcıları ─────────────────────────────────

/**
 * Türkçe göreli zaman ("12 dk önce", "3 sa önce", "5 gün önce", tarih).
 * Gelen kutusu ve kart ortak kullanıyor.
 *
 * @param {string|null} iso
 * @returns {string}
 */
export function goreceZaman(iso) {
	if (!iso) return "";
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return "";
	const sana = Date.now() - d.getTime();
	const sn = Math.floor(sana / 1000);
	if (sn < 60) return "şimdi";
	const dk = Math.floor(sn / 60);
	if (dk < 60) return `${dk} dk önce`;
	const sa = Math.floor(dk / 60);
	if (sa < 24) return `${sa} saat önce`;
	const gun = Math.floor(sa / 24);
	if (gun < 7) return `${gun} gün önce`;
	try {
		return d.toLocaleDateString([], { day: "numeric", month: "short" });
	} catch (_e) {
		return d.toISOString().slice(0, 10);
	}
}

export default {
	mediaKimligi,
	baslikHatirla,
	basliklariOku,
	tercihOku,
	tercihYaz,
	bildirimTercihListesi,
	gelenKutusuGetir,
	okunmamisSayisiGetir,
	rozetAbone,
	okunduIsaretle,
	okunduTumunuIsaretle,
	bildirimSil,
	goreceZaman,
};
