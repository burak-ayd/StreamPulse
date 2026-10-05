/**
 * Canlı TV servis katmanı.
 *
 * ## Neden `api.js` DEĞİL?
 *
 * Canlı TV backend'de film/dizi kazıyıcılarından (`Core/Plugin/*`, `PluginBase`)
 * tamamen ayrı bir alt sistemdir (`Core/Live/`). Canlı kanalın içerik sayfası
 * YOKTUR; `load_item()` / `load_links()` kazıma zinciri devreye girmez ve
 * `Core.Live` sözleşmesinde bir "ana sayfa" üyesi bulunmaz. Kanalın adresi M3U
 * listesinden doğrudan HLS olarak gelir.
 *
 * Bu yüzden burada `api.js`'in extractor akışına (`/api/extract`,
 * `/api/plugins/{name}/main-page`) hiç girmiyoruz: bu dosya yalnızca
 * `/api/live/*` uçlarını sarar. Alternatif düşünüldüydü — canlı TV'yi
 * `api.js`'e `fetchLiveChannels` gibi birkaç fonksiyon olarak eklemek — ama
 * (a) o dosya zaten film/dizi varsayımlarıyla yoğun, (b) kimlik doğrulama
 * gerektirmeyen bir alt sistemi token'lı akışın içine karıştırmak, (c) iki
 * uç ailesinin önbellek yaşam döngüsü farklı (aşağıya bak). Ayrı dosya bu
 * üç karışıklığı fiziksel olarak imkânsız kılar.
 *
 * ## Kimlik doğrulama
 *
 * `/api/live/*` uçlarında backend'de `Depends` YOKTUR (bkz.
 * `api/routes/live.py` → router tanımı). Bu yüzden burada `apiClient.js`'in
 * `authFetch`'i kullanılmaz: token yenileme zincirine girmek, kimliksiz bir
 * ucun 401'i yüzünden oturumla ilgili hiçbir iş çıkarırken kullanıcıyı
 * gereksiz yere logout'a düşürme riski doğurur.
 *
 * 503 (`retryable: true`) da oturumla ilgisi OLMAYAN bir hatadır: M3U kaynağı
 * bozulmuştur. Bu dosyada hiçbir hata yolunda token'a, oturuma veya
 * AsyncStorage'a dokunulmaz.
 */

import Constants from "expo-constants";
import { hlsDegilseNeden, hlsOynatilabilirMi } from "@/utils/hlsUrl";

/**
 * Taban URL — `api.js` ve `apiClient.js` ile BİREBİR AYNI kalıp.
 *
 * ⚠️ Neden kopyalandı, `apiClient.js`'den import edilmediği halde:
 *   1. `api.js` `API_BASE_URL`'u DIŞA AÇMAZ (satır 4 `const`, `export` yok) —
 *      yani oradan paylaşılacak bir sembol yok.
 *   2. `apiClient.js` `API_BASE_URL`'u export EDER ama o modülü içe
 *      aktarmak `token.js` → `expo-secure-store` zincirini de ayağa kaldırır.
 *      Kimlik doğrulaması gerektirmeyen bir alt sistem, oturum yönetiminin
 *      bağımlılık ağacına bağlanmamalıdır; üstelik canlı TV ekranı ilk açılışta
 *      SecureStore'a erişim olmadan da çalışabilmelidir.
 * Dört satırlık bir tekrardan kaçınmak bu bağımlılık zincirine zincirlemek
 * daha pahalıdır. Simge tek kaynaktan gelmeye devam eder: `app.config.js` →
 * `extra.API_URL`.
 */
const API_BASE_URL =
	Constants.expoConfig?.extra?.API_URL ??
	Constants.manifest?.extra?.API_URL ??
	"https://api.example.com";

/**
 * "Tüm Kanallar" sözde-kategorisi. Kategori listesinde `id: "tum"` olarak
 * geçer; sunucu `?category=` boş bırakıldığında da aynı şeyi varsayar
 * (`_TUM_ANAHTARLAR`). Sabit olarak dışa açıyoruz ki ekranlar bu string'i
 * elle yazmasın.
 */
export const CANLI_TV_KATEGORI_TUMU = "tum";

/**
 * Makine tarafı hata ayrımı.
 *
 * ⚠️ Bu ayrım `apiClient.js` → `getMe()`'nin yaptığı ayrımın aynısıdır:
 * çağıran "oturum öldü" ile "sunucuya ulaşılamadı" DEMELİDİR; `catch` ile
 * yutulup `null` dönmek bu ayrımı yok eder (bkz. `getMe` docstring'i).
 *
 *   - `network`    → fetch reddedildi (uçak modu, DNS, zaman aşımı). Yeniden
 *                    denenecek.
 *   - `server`     → 408/425/429/5xx. Yeniden denenecek. 503'te ayrıca
 *                    `retryable` + `retryAfterSec` gelir.
 *   - `notfound`   → 404, kanal yok.
 *   - `badrequest` → 400, BİLİNMEYEN KATEGORİ. Sözleşmede yoktu ama
 *                    eklenme sebebi: 400 kalıcı bir hatadır, "tekrar dene"
 *                    önermek anlamsızdır ve `server` ile birleştirilirse ekran
 *                    kullanıcıya çalışmayan bir yenileme sunar. Kategori
 *                    listesinden gelen bir id bu duruma ancak M3U yenilenmiş
 *                    ve istemci bayat listeyse düşer — bu yüzden ayrı
 *                    gösterilmeli.
 */
export const LIVE_ERROR_REASON = {
	NETWORK: "network",
	SERVER: "server",
	NOT_FOUND: "notfound",
	BAD_REQUEST: "badrequest",
};

// ─── Önbellek ────────────────────────────────────────────────
//
// Sunucu tarafı TTL'ler (`api/routes/live.py`): kategoriler 900 sn, kanal
// listesi 120 sn, arama 60 sn, `/sources` ÖNBELLEKSİZ.
//
// KURAL: istemci TTL'si, sunucunun kendi TTL'sinden DAHA KISA olmalıdır.
// Aksi halde sunucu tazelenmiş veriyi vermeye hazır olurken istemci belleğinde
// bayat cevap tutmaya devam eder ve kullanıcı oturum boyunca yenilemeyi
// HİÇBİR ZAMAN göremez. 900 sn'yi istemcide de tekrarlamak, bellekten
// kazanılan her şeyi kaybetmek demek.
//
// Yine de kategori "sabit 7 satır" olduğu için sunucunun 900 sn'sine yakın
// tutuyuz: 2 dakikada bir `/categories` isteği, 138 kanallı bir M3U için
// önemsiz; karşılığında kategori yenilenmesi (M3U'da yeni kanal) kullanıcı
// tarafında hissedilir hale gelir.
//
// `/sources` ve akış listeleri BİLİNÇLİ OLARAK ÖNBELLEKLENMEZ. Gerekçe
// backend'in kendi ifadesiyle aynı: "bayat bir yayın adresi = ölü oynatıcı"
// (`live.py` → `/channels/{id}` docstring'i). 90 saniye sonra kullanıcı
// "Oynat" dediğinde elimizdeki `.m3u8` token'ı çürümüş olur ve kullanıcı,
// taze bir adres alabilecekken, siyah ekranla karşılaşır.
//
// Arama TTL'si kanal TTL'sinden KISA tutuldu (`TTL_ARAMA_MS`), çünkü sorgu metni
// önbellek anahtarının parçasıdır: kullanıcı "t" → "tr" → "trt" yazarken
// her tuş bir kova açar. Uzun TTL bu kovaları gereksiz yere şişirir ve
// kullanıcı harf ekledikçe eski bir sonuç gösterir. Kategori listesi tek kova
// olduğu için uzun ömürlü olabilir; aramanın ömrü kısa olmalıdır.
const TTL_KATEGORI_MS = 120_000; // 2 dk  (sunucu 900 sn)
const TTL_KANAL_MS = 90_000; // 1,5 dk (sunucu 120 sn)
const TTL_ARAMA_MS = 45_000; // 45 sn

/**
 * Bellek içi önbellek — `api.js` → `apiCache` deseninin aynısı
 * (tek alan + `Map`), tek fark: burada TTL zaman damgası da saklanır, çünkü
 * canlı TV'de bayatlık FELAKET'tir (ölü yayın adresi) ve "bu veri ne kadar
 * eski?" sorusunun cevabı arayüze gösterilmelidir.
 *
 * Kanal anahtarı `${kategori}::${sorgu}` — arama sonucu ayrı kova, çünkü
 * "tüm kanallar" ile "trt" sonucu farklı listelerdir. Anahtar sadeleştirmesi
 * (trim + lowercase) yalnızca ÖNBELLEK ANAHTARI içindir; filtreleme
 * sunucuda yapılır (aşağıdaki `fetchLiveChannels` yorumu).
 */
const liveCache = {
	kategoriler: null, // { deger, zaman }
	kanallar: new Map(), // `${kategori}::${sorgu}` -> { deger, zaman }
};

/**
 * Önbellekten taze bir kayıt okur.
 * @returns {{ deger: any, zaman: number }|null}
 */
function tazeKayitOku(kayit, ttl) {
	if (!kayit) return null;
	// `Date.now()` yerine `performance.now()` DEĞİL: kayıtlar süreç içinde
	// tutulduğu için duvar saati yeterlidir ve ekranlar arası geçişte
	// sıfırlanma gibi yan etkileri yoktur.
	if (Date.now() - kayit.zaman >= ttl) return null;
	return kayit;
}

/**
 * Canlı TV önbelleğini temizler (`api.js` → `clearPluginCache` karşılığı).
 * Elle yenileme (`force: true`) tek bir isteği geçersiz kılar; bu ise tüm
 * listeleri düşürür — "kaynak bozuk, tekrar dene" akışında ve bir kanal
 * kaldırıldıktan sonra liste ekranına dönüldüğünde gerekir.
 */
export function clearLiveCache() {
	liveCache.kategoriler = null;
	liveCache.kanallar.clear();
}

// ─── Alt seviye istek yardımcısı ─────────────────────────────

/**
 * Tek bir `/api/live/*` isteğini yapar ve sonucu
 * `{ ok:true, status, data }` | `{ ok:false, status, reason, ... }`
 * biçimine indirger.
 *
 * ⚠️ Bütün hata sınıflandırması TEK yerde toplanır. Beş uçta aynı
 * `if (response.ok)` bloğunu tekrar etmek, 503'ün `retryable` bilgisini
 * unutan bir kopyayı kaçınılmaz kılardı — o kopyada ekran "yeniden dene"
 * yerine kalıcı hata gösterirdi.
 *
 * @param {string} yol - `/api/live/...` ile başlayan yol (sorgu dâhil)
 * @returns {Promise<object>}
 */
async function liveFetch(yol) {
	let response;
	try {
		// ⚠️ `Content-Type` GÖNDERİLMİYOR. `api.js` her GET'e
		// `Content-Type: application/json` ekliyor; bu doğru değil (GET'te
		// gövde yoktur, sunucu `Accept` bekler) ve canlı TV'de zararı da
		// yok. Burada yalnızca `Accept` gönderiyoruz.
		response = await fetch(`${API_BASE_URL}${yol}`, {
			headers: { Accept: "application/json" },
		});
	} catch (error) {
		// `fetch` reddi HER ZAMAN ağ katmanı demektir; oturumla ilgisi yoktur.
		console.warn(`[canlı-tv] Ağ hatası — ${yol}:`, error?.message);
		return { ok: false, status: 0, reason: LIVE_ERROR_REASON.NETWORK };
	}

	if (response.ok) {
		try {
			return { ok: true, status: response.status, data: await response.json() };
		} catch (error) {
			// 200 ama çözümlenemeyen gövde. `null`/boş liste dönmek "M3U bozuk"
			// ile "sunucu bozuk cevap verdi" ayrımını yok ederdi.
			console.warn(`[canlı-tv] Gövde çözümlenemedi — ${yol}:`, error?.message);
			return { ok: false, status: response.status, reason: LIVE_ERROR_REASON.SERVER };
		}
	}

	// Hata gövdesi: FastAPI `{"detail": ...}` sarmalayıcısı.
	// `detail` sözlük olabilir (503) veya metin (400/404).
	let detail = null;
	try {
		const govde = await response.json();
		detail = govde?.detail ?? govde ?? null;
	} catch {
		detail = null; // JSON olmayan hata gövdesi (HTML 502 sayfası gibi)
	}

	const mesaj =
		(typeof detail === "string" ? detail : detail?.mesaj) || null;

	if (response.status === 404) {
		console.warn(`[canlı-tv] Bulunamadı (404) — ${yol}:`, mesaj);
		return {
			ok: false,
			status: 404,
			reason: LIVE_ERROR_REASON.NOT_FOUND,
			detail: mesaj,
		};
	}

	if (response.status === 400) {
		console.warn(`[canlı-tv] Bilinmeyen kategori (400) — ${yol}:`, mesaj);
		return {
			ok: false,
			status: 400,
			reason: LIVE_ERROR_REASON.BAD_REQUEST,
			detail: mesaj,
		};
	}

	// 503 ve diğer 5xx / 429 / 408 → geçici. `Retry-After` başlığı sunucuda
	// `StarletteHTTPException` handler'ı üzerinden KORUNUR (`api/app.py` →
	// `headers=getattr(exc, "headers", None)`), bu yüzden burada okunabilir.
	const retryAfterSec = Number(response.headers?.get?.("Retry-After")) || null;
	console.warn(
		`[canlı-tv] Geçici hata (${response.status}) — ${yol}:`,
		mesaj || "(mesaj yok)",
	);
	return {
		ok: false,
		status: response.status,
		reason: LIVE_ERROR_REASON.SERVER,
		retryable: detail?.retryable !== false,
		retryAfterSec,
		detail: mesaj,
	};
}

// ─── Uçlar ──────────────────────────────────────────────────

/**
 * `GET /api/live/categories` — sabit kategori listesi + kanal sayaçları.
 *
 * Dönüş:
 *   `{ ok:true, kategori_sayisi, kanal_sayisi, kategoriler }`
 *   `{ ok:false, reason, status?, detail? }`
 *
 * ⚠️ `kanal_sayisi` kategori sayaçlarının TOPLAMI DEĞİLDİR. Backend'de
 * `id:"tum"` satırı da tüm kanalları sayar (`live.py` →
 * `get_categories` docstring'i), yani satırları toplarsak "138 + 138 = 276"
 * gibi bir sayı görünür. Doğrudan `kanal_sayisi` alanını okuyoruz.
 *
 * ⚠️ `order` alanına güvenerek sıralama YAPMIYORUZ: liste zaten `order`
 * göre geliyor ve sunucu sıralamayı sahipleniyor. İstemcide ikinci bir
 * sıralama, iki kaynaklı gerçek yaratırdı.
 *
 * @param {object} [parametre]
 * @param {boolean} [parametre.force=false] - Önbelleği atla (ve tazele)
 * @returns {Promise<object>}
 */
export async function fetchLiveCategories({ force = false } = {}) {
	if (!force) {
		const kayit = tazeKayitOku(liveCache.kategoriler, TTL_KATEGORI_MS);
		if (kayit) return kayit.deger;
	}

	const sonuc = await liveFetch("/api/live/categories");
	if (!sonuc.ok) return sonuc;

	/*
	 * `liveFetch` ham hali `{ ok, status, data }` döndürür. Burada DÜZ
	 * zarfı yayıyoruz — `fetchLiveChannel` / `fetchLiveStreams` /
	 * `fetchLiveSourcesStatus` zaten düz döndürüyor ve `player.jsx`
	 * akış listesini doğrudan `sonuc.streams` diye okuyor.
	 *
	 * Önceden bu iki liste fonksiyonu `data` altında bırakıyordu; ekranlar
	 * `data ?? sonuc` savunması sayesinde yine çalışıyordu, ama aynı
	 * modüldeki iki aile farklı çalışıyordu. Çağıranın her seferinde
	 * hangisini bekleyeceğini bilmesi gerekir; tek kural (düz) daha
	 * az hata üretir. JSDoc zaten düz şekli vaat ediyordu.
	 */
	const duz = { ok: true, status: sonuc.status, ...sonuc.data };
	const kategoriler = Array.isArray(duz.kategoriler) ? duz.kategoriler : [];

	// Boş liste ÖNBELLEĞE YAZILMAZ. 7 kategorilik sabit bir liste boş
	// dönüyorsa M3U okunamamıştır; 2 dakika boyunca boş liste göstermek
	// "M3U bozuk" ile "yenileniyor" ayrımının yok eder (api.js →
	// `fetchPlatformMainPage` içindeki aynı karar).
	if (kategoriler.length > 0) {
		liveCache.kategoriler = { deger: duz, zaman: Date.now() };
	}

	return duz;
}

/**
 * `GET /api/live/channels?category=&q=` — kanal listesi.
 *
 * Dönüş:
 *   `{ ok:true, category, query, total, channels }`
 *   `{ ok:false, reason, status?, detail? }`
 *
 * ## Arama SUNUCUDA yapılır — istemcide ikinci bir normalize YAZILMAZ.
 *
 * Backend `/channels` aramasını aksan ve büyük/küçük harf duyarsız yapar
 * (`_ara_metni`: NFKD ayrışımı + ASCII'ye düşürme + "ı"→"i", `live.py`
 * satır 250). İstemcide ikinci bir normalize yazarsak iki gerçek doğar:
 * sunucu "fenerbahçe" için 3 kanal dönerken istemci filtreyi de uygular ve
 * listede 1 kalanır — hangisinin doğru olduğunu kimse bilemez. Burada `q`
 * olduğu gibi `URLSearchParams`'e verilir; ekran yalnızca isteği tetikler.
 *
 * Önbellek anahtarındaki `trim().toLowerCase()` bir İKİLİK kaynağı DEĞİLDİR:
 * o sadece aynı isteğin iki yazımının aynı kovaya düşmesini sağlar, sonuç
 * üzerinde hiçbir işlem yapmaz.
 *
 * @param {object} [parametre]
 * @param {string} [parametre.category] - Kategori id'si (bkz. `CANLI_TV_KATEGORI_TUMU`)
 * @param {string} [parametre.q] - Sunucuya aynen iletilen arama metni
 * @param {boolean} [parametre.force=false]
 * @returns {Promise<object>}
 */
export async function fetchLiveChannels({
	category,
	q,
	force = false,
} = {}) {
	// `category` verilmezse sunucunun varsayılanı da "tum"; önbellek anahtarı
	// bu ikisini AYNI kovaya yazar, yoksa aynı liste iki yerde birden tutulur.
	const kategori = category ? String(category) : CANLI_TV_KATEGORI_TUMU;
	const sorgu = q ? String(q).trim() : "";

	const anahtar = `${kategori}::${sorgu.toLowerCase()}`;
	if (!force) {
		const kayit = tazeKayitOku(
			liveCache.kanallar.get(anahtar),
			sorgu ? TTL_ARAMA_MS : TTL_KANAL_MS,
		);
		if (kayit) return kayit.deger;
	}

	// Türkçe karakterli kategori id'leri (`muzik-eğlence`) burada
	// yüzde-kodlanır; sunucu `NFKD` ayrışımıyla hem `muzik-eğlence` hem
	// `muzik-eglence` yazımını aynı kategoriye çözer — istemci id'yi ham
	// göndermesi yeterli.
	const params = new URLSearchParams();
	params.set("category", kategori);
	if (sorgu) params.set("q", sorgu);

	const sonuc = await liveFetch(`/api/live/channels?${params.toString()}`);
	if (!sonuc.ok) return sonuc;

	// Düz zarf — `fetchLiveCategories` ile aynı gerekçe (oradaki yorum).
	const duz = { ok: true, status: sonuc.status, ...sonuc.data };
	const kanallar = Array.isArray(duz.channels) ? duz.channels : [];

	// Boş sonuç yalnızca ARAMADA önbelleğe yazılır: "trt" için 0 kanal
	// geçerli bir cevaptır. Kategori listesi 0 kanal döndürürse kaynak
	// bozuktur ve bir sonraki kaydırma denemesi yeniden denemelidir.
	if (kanallar.length > 0 || sorgu) {
		liveCache.kanallar.set(anahtar, { deger: duz, zaman: Date.now() });
	}

	return duz;
}

/**
 * `GET /api/live/channels/{id}` — tek kanal + akışları.
 *
 * Dönüş:
 *   `{ ok:true, channel, streams, total }`
 *   `{ ok:false, reason:"notfound" | ... , status?, detail? }`
 *
 * ⚠️ 404 için `null` DEĞİL, `reason: "notfound"` dönüyoruz. Brief'te
 * `| null` yazıyordu; `null` dönmek 404'ü "ağ yok" ile aynı göstergede
 * birleştirirdi ve kanal ekranı kullanıcıya "kanal silinmiş" yerine "bağlantı
 * sorunu" gösterirdi. `apiClient.js` → `getMe()` de aynı gerekçeyle `null`
 * yerine `{ ok:false, reason }` döndürür. Çağıran tek satırla ayırt eder:
 *
 *     const r = await fetchLiveChannel(id);
 *     if (r?.ok === false && r.reason === LIVE_ERROR_REASON.NOT_FOUND) ...
 *
 * @param {string} id - Stabil kanal slug'ı (ör. `trt-spor`); `tvg_id` DEĞİL
 * @returns {Promise<object>}
 */
export async function fetchLiveChannel(id) {
	// Kanal id'si slug'dır; `tvg_id` (`TRTSpor.tr`) kaynak M3U'ya özgüdür
	// ve büyük/küçük harf + nokta içerir — URL'de taşımaya güvenilmez.
	// `encodeURIComponent` yine de şart: bir kaynak "BeIN Sports 4K"
	// benzeri boşluklu bir slug üretirse istek bozulmasın.
	const kanalId = String(id ?? "").trim();
	if (!kanalId) {
		return {
			ok: false,
			status: 0,
			reason: LIVE_ERROR_REASON.BAD_REQUEST,
			detail: "Kanal id'si boş.",
		};
	}

	// ÖNBELLEK YOK. Akış adresleri (HLS token'ları) kısa ömürlüdür; bayat
	// bir `.m3u8` = ölü oynatıcı. "Refresh" düğmesi her zaman taze istek atar.
	const sonuc = await liveFetch(
		`/api/live/channels/${encodeURIComponent(kanalId)}`,
	);
	if (!sonuc.ok) return sonuc;

	return {
		ok: true,
		status: sonuc.status,
		channel: sonuc.data?.channel ?? null,
		streams: Array.isArray(sonuc.data?.streams) ? sonuc.data.streams : [],
		total: Number(sonuc.data?.total) || 0,
	};
}

/**
 * `GET /api/live/streams/{id}` — yalnızca adresler (oynatıcı için hafif).
 *
 * Dönüş:
 *   `{ ok:true, kanal_id, total, streams }`
 *   `{ ok:false, reason, status?, detail? }`
 *
 * Ne zaman `/channels/{id}` yerine: kanal zaten seçilmiş, ekranda logo/ad
 * gösterilecek ve yalnızca adresler gerekiyorsa. Aynı veriden daha küçük
 * gövde demektir. `LiveChannel` alanlarını taşımadığı için kanal kartı bu
 * cevaptan kurulamaz.
 *
 * ÖNBELLEK YOK — `fetchLiveChannel` ile aynı gerekçe.
 *
 * @param {string} id - Stabil kanal slug'ı
 * @returns {Promise<object>}
 */
export async function fetchLiveStreams(id) {
	const kanalId = String(id ?? "").trim();
	if (!kanalId) {
		return {
			ok: false,
			status: 0,
			reason: LIVE_ERROR_REASON.BAD_REQUEST,
			detail: "Kanal id'si boş.",
		};
	}

	const sonuc = await liveFetch(
		`/api/live/streams/${encodeURIComponent(kanalId)}`,
	);
	if (!sonuc.ok) return sonuc;

	return {
		ok: true,
		status: sonuc.status,
		kanal_id: sonuc.data?.kanal_id ?? kanalId,
		streams: Array.isArray(sonuc.data?.streams) ? sonuc.data.streams : [],
		total: Number(sonuc.data?.total) || 0,
	};
}

/**
 * `GET /api/live/sources` — M3U kaynak / önbellek tanı verisi.
 *
 * Yanıt (backend `live.py` → `get_sources`):
 *   `{ kategori_sayisi, kanal_sayisi, kaynak_sayisi, kaynaklar[], onbellek,
 *      kaynak_bilgisi? }`
 *
 * `kaynak_bilgisi` alanı, `Core.Live` henüz kaynak/istatistik üyesi
 * sunmadığında nedenini Türkçe metin olarak taşır. Yani bu alan
 * HESAPLANMAMIŞTIR; gelirse tanı metni olarak gösterilmelidir.
 *
 * ÖNBELLEK YOK ve olmamalı: bu ucun tek işlevi "kaynak şu an sağlıklı mı"
 * demek; bayat bir cevap tanı değerini yanlış gösterir. Backend de
 * önbelleklemiyor (TTL_KAYNAK yalnızca kategori listesi için).
 *
 * ⚠️ Tanı ucu olduğu için `503` YUTULMAZ: M3U gerçekten erişilemiyorsa
 * `kanal_sayisi: 0` dönmek "M3U bozuk" ile "henüz yüklenmedi" ayrımını
 * yapamaz (backend docstring'i, satır 776-780).
 *
 * @returns {Promise<object>}
 */
export async function fetchLiveSourcesStatus() {
	const sonuc = await liveFetch("/api/live/sources");
	if (!sonuc.ok) return sonuc;
	return { ok: true, status: sonuc.status, ...sonuc.data };
}

// ─── Oynatıcı dönüştürücüsü ─────────────────────────────────

/**
 * Bir `LiveStream` kaydını `VideoPlayer`'ın beklediği kaynak biçimine çevirir.
 *
 * `VideoPlayer.jsx` tam olarak şunları okuyor (satır 206-490):
 *   `sources[i].extractor`            → kaynak seçici etiketi (satır 214)
 *   `sources[i].result.url`           → oynatılacak adres (satır 394/396)
 *   `sources[i].result.headers`       → CDN'e gönderilecek başlıklar (397)
 *   `sources[i].result.referer`       → başlıklarda yoksa Referer'a yazılır (400)
 *   `sources[i].result.name`          → Oynatıcı üstü etiket (213)
 *   `sources[i].result.subtitles`     → harici altyazı listesi (225)
 *   `sources[i].result.type`          → "m3u8" | "mp4" (470)
 *
 * ## `extractor` alanına neden `kind` yazıyoruz?
 *
 * `VideoPlayer` bu alanı iki yerde kullanıyor: (a) `result.name` yoksa
 * kaynak adı olarak (214), (b) URL'den tür tahmini yaparken "close /
 * rapidvid / rapidrame / peacemaker" adlarını arıyor (429-468). Canlı TV'de
 * bu adların hiçbiri geçerli değil; önemli olan KONUMLAMA SIRA bilgisi:
 * `LiveStream.kind` (`primary` → `backup` → `alt`) oynatıcının ilk hangi
 * adresi deneyeceğini ve TrackSelectionModal'da listelenme sırasını belirler.
 * Etiket olarak `kind` yazmak ikisini tek alanda birleştirir.
 *
 * ## `referer` neden YOK?
 *
 * `LiveStream` modelinde `referer` alanı bulunmuyor (bkz.
 * `Core/Live/LiveModels.py` satır 254-295) — yani uydurmak zorundaydık.
 * Başlıklar zaten `User-Agent`/`Accept` taşıyor; `VideoPlayer` eksik
 * `User-Agent` için kendi varsayılanını (`DEFAULT_SUBTITLE_UA`) zaten
 * ekliyor. Uydurma `Referer` bazı CDN'lerde CORS/eşleşme hatası verirdi.
 *
 * ## `subtitles` neden `[]`?
 *
 * Canlı yayınlarda harici altyazı yok. `undefined` da çalışırdı
 * (`subtitles || []`, satır 225) ama AÇIK boş liste, oynatıcının altyazı
 * denetimini gereksiz yere göstermemesi için daha dürüst bir sözleşmedir.
 *
 * ## Oynatılamayan adresler neden `null` dönüyor?
 *
 * M3U listesi zaman zaman bir yayın adresi yerine WEB SAYFASI adresi
 * taşıyor (`youtube.com/watch?v=...`, çıplak `https://site/`, ölü proxy
 * adresi). Bunları oynatıcıya `type: "m3u8"` ile vermek ExoPlayer'da
 * `ERROR_CODE_PARSING_MANIFEST_MALFORMED` (23002) üretir ve "HLS sanılan
 * mp4" denemesi de onu kurtaramaz (`ERROR_CODE_PARSING_CONTAINER_UNSUPPORTED`
 * / 23003). Ölçüm ve gerekçe: `@/utils/hlsUrl` → `hlsOynatilabilirMi`.
 *
 * Oynatılamayan bir adresi burada elemek, iki boşuna ağ turu + ekranda
 * geliştirici hata metni yerine dürüst bir "yayın akışı alınamadı" demektir.
 * `toPlayerSources` bu `null`'ları eler; kanalın TÜM akışları elenirse
 * oynatılabilir kaynak sayısı 0 olur ve `player.jsx` boş listeyi zaten
 * "bu kanal için yayın akışı alınamadı" diye karşılar.
 *
 * @param {object} stream - `LiveStream` kaydı
 * @returns {{ extractor: string, result: object }|null} Adres HLS değilse
 *          `null` (elendi; çağıran taraf bunu SESSİZCE yutmamalı).
 */
export function toPlayerSource(stream) {
	const kaynak = stream || {};
	const tur = kaynak.kind || "primary";

	// Kanal etiketi log'da görünsün diye: oynatılamayan adresin HANGİ
	// kanalda olduğu, M3U'nun nereye düzeltileceğini söyler.
	const etiket = kaynak.label || tur;

	if (!hlsOynatilabilirMi(kaynak.url)) {
		console.warn(
			`[canlı-tv] Oynatılamayan akış elendi — ${etiket}: ` +
				`${hlsDegilseNeden(kaynak.url)} (${kaynak.url || "adres yok"})`,
		);
		return null;
	}

	return {
		// Oynatıcı, kaynak adını `result.name`'den okur; `|` ayracına göre
		// kırpılır (VideoPlayer 216-219). Etikette `|` YOK.
		extractor: tur,
		result: {
			url: kaynak.url || "",
			// `LiveStream.is_live` sabit `true`; yine de taşıyoruz çünkü
			// oynatıcı bunu ileride canlı arayüze (EPG/zaman çizelgesi) ve
			// `onEnd` davranışına bağlayacak.
			type: "m3u8",
			is_live: kaynak.is_live !== false,
			// `headers` kanal bazlıdır (bazı yayıncılar UA/Referer istiyor).
			// Kopyalıyoruz: `VideoPlayer` nesneyi MUTASYONSUZ okuyor ama
			// referans paylaşımı sonradan bir yerde silinirse React
			// karşılaştırması bozulur.
			headers: { ...(kaynak.headers || {}) },
			name: kaynak.label || "Canlı",
			// ⚠️ `is_hls: true` videoSource.type tahmininin güvenli tarafını
			// sabitler. VideoPlayer, URL'deki string kalıplarına bakarak HLS
			// anlamaya çalışıyor; yanlışlıkla "mp4" seçilirse oynatıcı HLS
			// playlist'ini progressive sanar. Bu alan tahminin güvenli tarafını
			// kilitler.
			//
			// (Eski yorum "canlı CDN'leri `.m3u8` dışında sonlanan adresler de
			// verir" diyordu; 152 akış üzerinde yapılan ölçüm bunu ÇÜRÜTTÜ —
			// `.m3u8` dışında sonlanan 3 adresin üçü de oynatılamaz web
			// sayfasıydı. Bkz. `@/utils/hlsUrl`.)
			is_hls: true,
			subtitles: [],
		},
	};
}

/**
 * Akış listesinin tamamını oynatıcı kaynaklarına çevirir.
 *
 * İki eleme katmanı vardır ve İKİSİ DE FARKLI ŞEYLER SİLer:
 *   1. `url` taşımayan kayıt        → sunucudan gelmeyen/eksik satır.
 *   2. `hlsOynatilabilirMi(url)`     → HLS olmayan adres (web sayfası).
 * Katman 1 eskiden vardı ve korunuyor; katman 2 `toPlayerSource`'ın
 * `null` dönmesiyle uygulanıyor. Katman 2 olmadan bir kanalın tek
 * akışı bir web sayfasıysa oynatıcı 23002/23003 hatası verir.
 *
 * ⚠️ Dönen dizi SIRA KORUNUR: `LiveStream[]` sırası `primary → backup →
 * alt` önceliğidir ve `liveStreamIndex` bu sırayı gösterir; eleme
 * yalnızca elenen öğelerin yerini boşaltabilir, kalanların sırasını
 * ASLA değiştirmez.
 *
 * @param {Array<object>} streams - `LiveStream[]`
 * @returns {Array<{ extractor: string, result: object }>}
 */
export function toPlayerSources(streams) {
	if (!Array.isArray(streams)) return [];
	return streams
		.filter((s) => Boolean(s?.url))
		.map((s) => toPlayerSource(s))
		.filter((s) => s !== null);
}

/**
 * Sunucunun döndürdüğü ham akış sayısı ile GERÇEKTEN oynatılabilir olan
 * arasındaki farkı **tek eleme geçişinden** çıkarır.
 *
 * ⚠️ Neden `toPlayerSources` DEĞİL DE ikisini birlikte? Bu fonksiyon
 * ayrıca `toPlayerSources`'ı çağırsaydı filtre iki kez çalışır ve her elenen
 * adres için `console.warn` İKİ KEZ basılırdı — teşhis logu gereksiz yere
 * gürültülü olurdu. Tek geçiş: `toPlayerSources` bir kez çağrılır, elenen
 * sayısı ham listeden çıkarılır.
 *
 * @param {Array<object>} hamAkislar - `LiveStream[]` (sunucudan gelen ham liste)
 * @returns {{ kaynaklar: Array, elenen: number }}
 */
export function oynatilabilirAkislaraCevir(hamAkislar) {
	const kaynaklar = toPlayerSources(hamAkislar);
	const ham = Array.isArray(hamAkislar) ? hamAkislar.length : 0;
	return { kaynaklar, elenen: ham - kaynaklar.length };
}

export default {
	CANLI_TV_KATEGORI_TUMU,
	LIVE_ERROR_REASON,
	fetchLiveCategories,
	fetchLiveChannels,
	fetchLiveChannel,
	fetchLiveStreams,
	fetchLiveSourcesStatus,
	toPlayerSource,
	toPlayerSources,
	oynatilabilirAkislaraCevir,
	clearLiveCache,
};
