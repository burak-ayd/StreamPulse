/**
 * Oynatma hatası sınıflandırma — TEK KAYNAK
 *
 * ⚠️ BU DOSYA NEDEN VAR
 *
 * `react-native-video` v6, Android'de hatayı şu satırla iletir
 * (`ReactExoplayerView.java`, `onPlayerError`):
 *
 *     String errorCode = "2" + e.errorCode;
 *
 * Yani **gerçek Media3 kodunun başına "2" ekleniyor**. Bu, uygulamadaki
 * her `"23002"` karşılaştırmasını ölü kılar:
 *
 *   ERROR_CODE_PARSING_MANIFEST_MALFORMED = 23002  →  gönderilen: "223002"
 *   ERROR_CODE_PARSING_CONTAINER_UNSUPPORTED = 23003 → gönderilen: "223003"
 *   ERROR_CODE_IO_BAD_HTTP_STATUS           = 2000  →  gönderilen: "22000"
 *
 * Canlı TV'de ölçülen tablo: beIN 1-5 / CBC / SportsTV / İdman → **403**,
 * NBA TV → **404**. Bunlar `ERROR_CODE_IO_BAD_HTTP_STATUS` (22000) olarak
 * gelir ve eski kodda `errorCode?.startsWith("2")` kontrolüne düşer. O kontrol
 * tesadüfen **her** hatada doğru (çünkü hepsi "2" ile başlıyor), yani
 * otomatik kaynak değiştirme çalışır ama **nedeni** yanlış anlaşılır ve
 * kullanıcı ekranda ham `ExoPlaybackException` metni görür.
 *
 * ── Bu modül ne yapar? ──
 *
 *   1. `normalizeErrorCode` — "223002" / 23002 / "2000" → **23002**
 *   2. `classifyPlaybackError` — hata türü + **bu kaynak ölü mü** + **geçici mi**
 *   3. `describePlaybackError` — kullanıcıya gösterilecek Türkçe metin
 *
 * Tasarım kararı: "bu hata hangi kaynaktan geldi" bilgisi **kaynak bazında**
 * tutulur (`seenSourceErrorsRef`), çünkü aynı hata iki farklı yerde tamamen
 * farklı karar gerektirir:
 *
 *   · HTTP 403/404 → bu KAYNAK ölü → sıradakine geç, sonunda "başka kaynak yok"
 *   · Ağ zaman aşımı → sunucu geçici → AYNI kaynağı kısa süre sonra bir kez daha dene
 */

/** Gerçek Media3 hata kodları (ExoPlayer `PlaybackException`). */
const KOD = {
	IO_BAD_HTTP_STATUS: 2000,
	IO_NETWORK_CONNECTION_FAILED: 2001,
	IO_NETWORK_CONNECTION_TIMEOUT: 2002,
	IO_NO_PERMISSION: 2003,
	IO_BAD_POSITION: 2004,
	IO_READ_POSITION_OUT_OF_RANGE: 2005,
	IO_UNSPECIFIED: 2006,
	PARSE_CONTAINER_MALFORMED: 2007,
	PARSE_MANIFEST_MALFORMED: 23002,
	PARSE_CONTAINER_UNSUPPORTED: 23003,
	PARSE_CONTAINER_EXCEEDS_MAX_FILE_SIZE: 23004,
	DECODER_INIT_FAILED: 4001,
	DECODING_FAILED: 4002,
	DECODING_FORMAT_EXCEEDS_CAPABILITIES: 4003,
	DECODING_FORMAT_UNSUPPORTED: 4004,
	PLAYER_ERROR: 1000,
};

/**
 * `errorCode`'u gerçek Media3 koduna çevirir.
 *
 * @param {unknown} raw - `"223002"`, `23002`, `"22000"` … hepsini kabul eder
 * @returns {number|null} Gerçek kod ya da çözülemezse `null`
 */
export function normalizeErrorCode(raw) {
	if (raw === null || raw === undefined) return null;
	if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;

	const metin = String(raw).trim();
	if (!metin) return null;
	const sayi = Number(metin);
	if (!Number.isFinite(sayi)) return null;

	// Media3 kodları 4 haneli (2000, 4001) veya 5 hanelidir (23002).
	// Kütüphane başına "2" eklediği için GELEN değer 5 ya da 6 hanedir:
	//
	//   "22000"  = "2" + 2000   (4 haneli kod, önekli)
	//   "223002" = "2" + 23002  (5 haneli kod, önekli)
	//   "23002"  = ham kod (bazı platformlar öneksiz gönderir)
	//
	// Ayırt etme kuralı: ham 5 haneli kod DAIMA "23"/"24" ile başlar
	// (23xxx = parse, 24xxx = DRM). Önekli 4 haneli kod ise "22" ile başlar.
	// Bu yüzden uzunluğa BAKARAK soyuyoruz:
	if (metin.length === 6 && metin.startsWith("2")) {
		return Number(metin.slice(1)); // 223002 → 23002
	}
	if (metin.length === 5 && metin.startsWith("22")) {
		return Number(metin.slice(1)); // 22000 → 2000
	}
	return sayi; // zaten ham kod
}

/**
 * `errorString` içindeki Media3 **hata adından** kodu geri çözer.
 *
 * ⚠️ Neden bu öncelikli? Kütüphane `errorCode`'u `"2" + kod` olarak
 * iletiyor ve bu, belirsizlik yaratıyor: `4001` → `"24001"`, ham
 * `24002` → `"24002"`. İkisi de 5 karakter ve aynı önekle başlıyor.
 * Sayısal soyma hangisinin doğru olduğunu bilemez.
 *
 * Oysa `errorString` **her zaman** şu biçimde gelir
 * (`ReactExoplayerView.java`):
 *
 *     "ExoPlaybackException: " + PlaybackException.getErrorCodeName(e.errorCode)
 *
 * Yani hata ADI güvenilirdir. Ad → kod eşlemesi belirsizliğin üstündedir.
 *
 * @param {string} errorString
 * @returns {number|null}
 */
export function kodAdindan(errorString) {
	const metin = String(errorString || "");
	const AD_KOD = [
		["ERROR_CODE_PARSE_CONTAINER_EXCEEDS_MAX_FILE_SIZE", KOD.PARSE_CONTAINER_EXCEEDS_MAX_FILE_SIZE],
		["ERROR_CODE_PARSING_CONTAINER_EXCEEDS_MAX_FILE_SIZE", KOD.PARSE_CONTAINER_EXCEEDS_MAX_FILE_SIZE],
		["ERROR_CODE_PARSE_CONTAINER_UNSUPPORTED", KOD.PARSE_CONTAINER_UNSUPPORTED],
		["ERROR_CODE_PARSING_CONTAINER_UNSUPPORTED", KOD.PARSE_CONTAINER_UNSUPPORTED],
		["ERROR_CODE_PARSE_CONTAINER_MALFORMED", KOD.PARSE_CONTAINER_MALFORMED],
		["ERROR_CODE_PARSING_CONTAINER_MALFORMED", KOD.PARSE_CONTAINER_MALFORMED],
		["ERROR_CODE_PARSING_MANIFEST_MALFORMED", KOD.PARSE_MANIFEST_MALFORMED],
		["ERROR_CODE_PARSE_MANIFEST_MALFORMED", KOD.PARSE_MANIFEST_MALFORMED],
		["ERROR_CODE_IO_NETWORK_CONNECTION_TIMEOUT", KOD.IO_NETWORK_CONNECTION_TIMEOUT],
		["ERROR_CODE_IO_NETWORK_CONNECTION_FAILED", KOD.IO_NETWORK_CONNECTION_FAILED],
		["ERROR_CODE_IO_BAD_HTTP_STATUS", KOD.IO_BAD_HTTP_STATUS],
		["ERROR_CODE_IO_NO_PERMISSION", KOD.IO_NO_PERMISSION],
		["ERROR_CODE_IO_UNSPECIFIED", KOD.IO_UNSPECIFIED],
		["ERROR_CODE_DECODER_INIT_FAILED", KOD.DECODER_INIT_FAILED],
		["ERROR_CODE_DECODING_FORMAT_UNSUPPORTED", KOD.DECODING_FORMAT_UNSUPPORTED],
		["ERROR_CODE_DECODING_FORMAT_EXCEEDS_CAPABILITIES", KOD.DECODING_FORMAT_EXCEEDS_CAPABILITIES],
		["ERROR_CODE_DECODING_FAILED", KOD.DECODING_FAILED],
	];
	// Uzun adlar önce aranır: `..._EXCEEDS_MAX_FILE_SIZE`, `..._UNSUPPORTED`
	// gibi adlar birbirinin SONUNU içerir; kısa olan önce gelirse yanlış eşleşir.
	for (const [ad, kod] of AD_KOD) {
		if (metin.includes(ad)) return kod;
	}
	if (metin.includes("ERROR_CODE_DRM_")) return -1; // DRM ailesi
	return null;
}

/**
 * Hata kodunu **tek güvenilir kaynaktan** çözer.
 *
 * @param {object} error
 * @returns {number|null}
 */
export function hataKodu(error) {
	const e = error?.error || error || {};
	const adKodu = kodAdindan(e.errorString) ?? kodAdindan(e.errorException);
	if (adKodu !== null && adKodu !== -1) return adKodu;
	if (e.errorStackTrace) {
		const yigindan = kodAdindan(e.errorStackTrace);
		if (yigindan !== null && yigindan !== -1) return yigindan;
	}
	return normalizeErrorCode(e.errorCode);
}

/**
 * Hata sınıflandırması.
 *
 * @param {object} error - `VideoPlayer.onError` payload'ı
 * @returns {{
 *   code: number|null,
 *   kind: "http-status"|"network"|"manifest"|"container"|"decoder"|"permission"|"drm"|"bilinmeyen",
 *   sourceDead: boolean,
 *   transient: boolean,
 *   retryableWithTypeFlip: boolean,
 * }}
 */
export function classifyPlaybackError(error) {
	const e = error?.error || error || {};
	const code = hataKodu(error);
	const tur = e.errorString || e.errorException || e.errorStackTrace || "";
	const metin = String(tur);
	const adaGore = (ad) => metin.includes(ad);

	if (code === KOD.PARSE_MANIFEST_MALFORMED || adaGore("MANIFEST_MALFORMED")) {
		return {
			code,
			kind: "manifest",
			sourceDead: true,
			// Biçim hatası: aynı adres ters türle bir kez denenebilir
			// (HLS sanılan MP4 / MP4 sanılan HLS).
			transient: false,
			retryableWithTypeFlip: true,
		};
	}
	if (
		code === KOD.PARSE_CONTAINER_UNSUPPORTED ||
		code === KOD.PARSE_CONTAINER_MALFORMED ||
		code === KOD.PARSE_CONTAINER_EXCEEDS_MAX_FILE_SIZE ||
		adaGore("PARSING_CONTAINER") ||
		adaGore("UnrecognizedInputFormatException")
	) {
		return {
			code,
			kind: "container",
			sourceDead: true,
			transient: false,
			retryableWithTypeFlip: true,
		};
	}
	if (code === KOD.IO_BAD_HTTP_STATUS || adaGore("BAD_HTTP_STATUS")) {
		// 404/410 kaynak tamamen gitmiştir; 403 coğrafi kısıt olabilir.
		// İkisi de bu KAYNAK için ölü sayılır (bu cihazda oynamıyor),
		// ama mesaj farklıdır (aşağıya bak).
		return {
			code,
			kind: "http-status",
			sourceDead: true,
			// 5xx sunucu kaynaklı geçici olabilir; aynı kaynak bir kez
			// daha denenebilir. Ancak HTTP durum kodu payload'da YOK;
			// bu yüzden her HTTP hatası "ölü kaynak" sayılır ve sıradakine
			// geçilir. (Gereksiz tekrar, ölü yayını uzatmaktan iyidir.)
			transient: false,
			retryableWithTypeFlip: false,
		};
	}
	if (
		code === KOD.IO_NETWORK_CONNECTION_TIMEOUT ||
		adaGore("NETWORK_CONNECTION_TIMEOUT")
	) {
		return {
			code,
			kind: "network",
			sourceDead: false,
			transient: true,
			retryableWithTypeFlip: false,
		};
	}
	if (
		code === KOD.IO_NETWORK_CONNECTION_FAILED ||
		code === KOD.IO_UNSPECIFIED ||
		adaGore("NETWORK_CONNECTION_FAILED")
	) {
		return {
			code,
			kind: "network",
			sourceDead: false,
			transient: true,
			retryableWithTypeFlip: false,
		};
	}
	if (code === KOD.IO_NO_PERMISSION || adaGore("NO_PERMISSION")) {
		return {
			code,
			kind: "permission",
			sourceDead: true,
			transient: false,
			retryableWithTypeFlip: false,
		};
	}
	if (adaGore("DRM_")) {
		return { code, kind: "drm", sourceDead: true, transient: false, retryableWithTypeFlip: false };
	}
	if (
		(code !== null && code >= 4001 && code <= 4004) ||
		adaGore("ERROR_CODE_DECOD") ||
		adaGore("DecoderInitializationException")
	) {
		return {
			code,
			kind: "decoder",
			sourceDead: true,
			transient: false,
			// Cihaz bu kodlamayı çözemiyor olabilir; başka kaynak denemeye değer.
			retryableWithTypeFlip: false,
		};
	}
	return {
		code,
		kind: "bilinmeyen",
		sourceDead: true,
		transient: false,
		retryableWithTypeFlip: false,
	};
}

/**
 * Kullanıcıya gösterilecek Türkçe açıklama.
 *
 * @param {object} error
 * @param {{ sourceLabel?: string, hasAlternatives?: boolean }} [baglam]
 * @returns {string}
 */
export function describePlaybackError(error, baglam = {}) {
	const sinif = classifyPlaybackError(error);
	const kaynak = baglam.sourceLabel ? ` "${baglam.sourceLabel}"` : "";
	const alternatif = baglam.hasAlternatives;

	const ortak = "Bir kaynak açılamadı.";

	switch (sinif.kind) {
		case "http-status":
			// En sık görülen durum. Kullanıcıya "senin cihazın bozuk" değil,
			// "yayın kaynağı erişimi reddetti" demek gerekir: çözüm başka kaynak.
			return (
				`${ortak}${kaynak} yayın sunucusu tarafından engellendi (HTTP hatası). ` +
				"Bazı kanallar coğrafi olarak kısıtlıdır ya da kaynak adresi " +
				"güncellenmemiş olabilir." +
				(alternatif ? " Diğer kaynaklar denendi." : " Başka kaynak yok.")
			);
		case "network":
			return (
				`${ortak}${kaynak} yayına bağlanılamadı (ağ hatası). ` +
				"İnternet bağlantını kontrol et veya kaynağı değiştir."
			);
		case "manifest":
		case "container":
			return (
				`${ortak}${kaynak} yayın listesi okunamadı. ` +
				"Kaynak geçersiz veya türü değişmiş olabilir."
			);
		case "permission":
			return `${ortak}${kaynak} için izin reddedildi (HTTP erişim hatası).`;
		case "decoder":
			return `${ortak}${kaynak} bu cihazda çözümlenemedi (video kodeksi).`;
		case "drm":
			return `${ortak}${kaynak} korumalı yayın açılamadı.`;
		default:
			return error?.error?.errorString || ortak;
	}
}

/**
 * Bu hata "başka bir kaynak denemeye değer" mi?
 *
 * @param {object} error
 * @returns {boolean}
 */
export function sonrakiKaynagaGecmeli(error) {
	return classifyPlaybackError(error).sourceDead;
}

export default {
	KOD,
	normalizeErrorCode,
	kodAdindan,
	hataKodu,
	classifyPlaybackError,
	describePlaybackError,
	sonrakiKaynagaGecmeli,
};