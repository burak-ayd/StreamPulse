/*
 * Yerel kalite-master dosyası için BENZERSİZ ad üretimi.
 *
 * Ayrı dosyada çünkü `expo-file-system` import etmiyor: node ile test
 * edilebiliyor. Kural: aynı adres ikinci kez kullanılmaz.
 *
 * Neden: sabit ad (`spd-quality-auto.m3u8`) iki içerikte aynı `file://`
 * yolunu veriyordu. Yeni içeriğin dosyası eskisinden kısa olduğunda
 * (çok sesli kaynak → tek sesli kaynak) eski içeriğin kuyruğu diskte
 * kalıp ExoPlayer tarafından ikinci varyant olarak okunabiliyordu —
 * ekranda başka içerik oynuyordu.
 */
let sayac = 0;
// Oturum kimliği: sayaç uygulama yeniden başlayınca sıfırlanır; rastgele
// önek sayesinde ad hiçbir zaman (önceki oturumlar dâhil) tekrar etmez.
const oturum = Math.random().toString(36).slice(2, 8);

/** Kaynak URL'sinden kısa, çakışmasız etiket (djb2). */
export function kaynakEtiketi(kaynakUrl) {
	let h = 5381;
	const s = String(kaynakUrl || "");
	for (let i = 0; i < s.length; i += 1) {
		h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
	}
	return h.toString(36);
}

/**
 * Bir sonraki kalite-master dosya adı: içeriğe özel + her çağrıda yeni.
 * @param {string} kaynakUrl oynatılan içeriğin master adresi
 * @returns {string} cache içindeki dosya adı
 */
export function kaliteMasterAdi(kaynakUrl) {
	sayac += 1;
	return `spd-q-${oturum}-${kaynakEtiketi(kaynakUrl)}-${sayac}.m3u8`;
}

/** Testler için: sayacı sıfırlar (üretim kodunda kullanılmaz). */
export function _sayaciSifirla() {
	sayac = 0;
}