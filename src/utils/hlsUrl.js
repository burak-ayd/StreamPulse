/**
 * HLS manifest adresi tanıma — TEK KAYNAK
 *
 * ⚠️ BU DOSYA NEDEN VAR
 *
 * Canlı TV M3U listesi zaman zaman bir yayın adresi yerine bir WEB SAYFASI
 * adresi taşıyor. Bu adresler oynatıcıya `type: "m3u8"` ile verildiğinde
 * ExoPlayer HTML'yi playlist sanar ve şu hatayı basar:
 *
 *   ParserException: Input does not start with the #EXTM3U header.
 *   → ExoPlaybackException: ERROR_CODE_PARSING_MANIFEST_MALFORMED (23002)
 *
 * "HLS sanılan mp4" yönlendirmesi (23002 → mp4 denemesi) bu durumda da
 * kurtarmaz: HTML ne playlist'tir ne de medya konteyneri, ikinci denemede
 * `UnrecognizedInputFormatException` (23003) alırız. Yani iki hata, iki
 * boşuna ağ turu, sonra ekranda geliştirici hata metni.
 *
 * ── ÖLÇÜM (138 kanal / 152 akış, canlı sunucu) ────────────────────
 *
 *   `.m3u8` ile biten  : 149
 *   `.m3u8` OLMAYAN    :   3  → üçü de oynatılamaz:
 *       · mahsun-sports → `https://mahsunsports80.xyz/`            (HTML ana sayfa)
 *       · tele-1        → `https://www.youtube.com/watch?v=...`   (YouTube izleme sayfası)
 *       · show-tv(backup)→ `https://...workers.dev/?url=...`      (ölü DNS)
 *
 * Yani "`.m3u8` ile bitmeyen canlı akış" şu anda tanım gereği oynatılamaz
 * bir adres. Kural bu yüzden basit tutuldu: **`.m3u8`/`.m3u` ile bitmeyen
 * adresi oynatıcıya hiç vermiyoruz.**
 *
 * ── Neden izin listesi değil, gerekçeli gerekçe ───────────────────
 *
 * Sadece "şu desenleri reddet" (YouTube host'u, çıplak kök `/` gibi) daha
 * yumuşak görünür ama bir CDN'in HTML döndürmeye başlaması yeni bir host
 * olur ve kural sessizce delinir. Uzantı kuralı ise şu anda ÇALIŞAN 149
 * akışın tamamını kabul eder, ÇÖPÜ olan 3'ünü eler.
 *
 * ⚠️ Eğer backend ileride `.m3u8` SUFFIX'İ OLMAYAN geçerli bir canlı HLS
 * adresi üretirse (bazı CDN'ler `/hls/live/123` kullanır) bu kural onu
 * eleyecektir. Bu bir REGRESSION olacak, sessiz olmayacak: `toPlayerSources`
 * elediği adresi `console.warn` ile yazar ve kanal "yayın akışı alınamadı"
 * der. O durumda buraya o yeni kalıbı `HLS_SUFFIX_OLMAYAN_KABUL` olarak
 * eklemek gerekir — tahminle değil, ölçülen veriyle.
 */

/**
 * Sonda `.m3u8` / `.m3u` gövdesi. `?` ve `#` öncesinde kesilir:
 * `master.m3u8?token=abc` kabul, `playlist.m3u8.bak` reddedilir.
 */
const HLS_SUFFIX_RE = /\.m3u8?(?:[?#]|$)/i;

/**
 * Ölçümle doğrulanmış, suffi'siz kabul edilmesi gereken desenler.
 * Şu an BOŞ: 152 akışın hiçbiri için gerekmiyor. Liste boş bırakıldı
 * çünkü tahminle doldurulmuş bir "izin" listesi, olmayan bir kanıtı
 * varmış gibi gösterirdi.
 *
 * @type {string[]}
 */
const HLS_SUFFIX_OLMAYAN_KABUL = [];

/**
 * Bir adres oynatılabilir bir HLS manifesti olabilir mi?
 *
 * @param {unknown} url - `LiveStream.url` (veya benzeri bir ham adres)
 * @returns {boolean}
 */
export function hlsOynatilabilirMi(url) {
	if (typeof url !== "string") return false;

	const adres = url.trim();
	if (!adres) return false;

	// Yalnızca ağ üzerinden erişilebilen adresler oynatılabilir. `blob:` /
	// `data:` oynatıcı tarafından desteklenir ama canlı M3U'da üretilmez.
	if (!/^https?:\/\//i.test(adres)) return false;

	// Sorgu ve parça işaretini ayır: uzantı kontrolü yolun sonunda olmalı.
	const yol = adres.split(/[?#]/, 1)[0] ?? "";

	if (HLS_SUFFIX_OLMAYAN_KABUL.some((desen) => desen.test(yol))) return true;

	return HLS_SUFFIX_RE.test(adres);
}

/**
 * Reddedilen adres için insan-okunur gerekçe. Yalnızca LOG ve tanı
 * içindir; oynatıcı kararını `hlsOynatilabilirMi` verir.
 *
 * @param {unknown} url
 * @returns {string|null} Kabul ediliyorsa `null`
 */
export function hlsDegilseNeden(url) {
	if (hlsOynatilabilirMi(url)) return null;
	if (typeof url !== "string" || !url.trim()) return "adres boş";
	if (!/^https?:\/\//i.test(url.trim()))
		return "http(s) dışında bir şema (oynatıcı desteklemiyor)";
	return "HLS manifest uzantısı yok (web sayfası olabilir)";
}

export default {
	hlsOynatilabilirMi,
	hlsDegilseNeden,
};