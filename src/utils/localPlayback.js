/*
 * Yerel indirme oynatma yardımcıları.
 *
 * ⚠️ İndirmeler CİHAZA ÖZELDİR. Bir film telefonda indirildiyse diğer cihaz
 * o dosyaya erişemez; "kaldığın yerden devam et" kaydı buluta giderken
 * yanında taşınan `file://` yolu taşınmamalı, oynatmadan önce de dosyanın
 * gerçekten durduğu doğrulanmalıdır. Aksi halde silinmiş/başka cihaza ait
 * bir yolla oynatıcı açılır ve ExoPlayer hata verir.
 */

/** http(s) dışındaki her adres (file://, content://, /data/...) yereldir. */
export function isLocalMediaUrl(url) {
	return typeof url === "string" && url.length > 0 && !/^https?:/i.test(url);
}

/**
 * Yerel oynatma yolu diskte duruyor mu?
 *
 * Doğrulanamayan yollarda `true` döner: kontrolün kendisi oynatmayı
 * engellememeli (bkz. `MediaStore` content:// yolları).
 */
export async function localMediaExists(url) {
	if (!isLocalMediaUrl(url)) return true;
	try {
		const { File } = await import("expo-file-system");
		return new File(url).exists;
	} catch {
		return true;
	}
}
