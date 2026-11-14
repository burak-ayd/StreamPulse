import { File, Paths } from "expo-file-system";
import { kaliteMasterAdi } from "@/utils/localHlsName";

/**
 * Sabit kalite oynatma için YEREL master playlist yazar.
 *
 * Sorun: react-native-video v6'da HLS video varyantı seçim API'si YOK
 * (ses/altyazı seçilebilir, video kalitesi seçilemez) → ExoPlayer ABR ile
 * otomatik kalite seçer (önce düşük, sonra yüksek).
 *
 * Çözüm: seçilen video varyantı + ses rendition'ları içeren TEK varyantlı
 * bir master'ı yerel dosyaya yazıp onu oynatıyoruz. ExoPlayer tek varyant
 * gördüğü için kalite SABİT kalır, ses de korunur.
 *
 * ⚠️ TÜM ses parçaları yazılır (sadece seçili değil): kalite değişse bile
 * ses seçim listesi dolu kalır — aksi halde liste yalnız Türkçe'ye düşer.
 *
 * ⚠️ HER YAZIM YENİ BİR DOSYA ADI KULLANIR (bkz. `localHlsName`).
 * Önceden sabit addı (`spd-quality-auto.m3u8`): iki içerik aynı `file://`
 * yolunu paylaşıyordu ve yeni içeriğin dosyası eskisinden kısa olduğunda
 * eski içeriğin kuyruğu diskte kalabiliyordu — ExoPlayer onu ikinci bir
 * varyant olarak okuyup BAŞKA içeriği oynatabiliyordu.
 */

/**
 * @param {object} variant  {url, bandwidth, resolution, codecs, frameRate}
 * @param {Array} audioTracks  master'daki TÜM ses rendition'ları
 * @param {object|null} seciliSes  DEFAULT=YES işaretlenecek ses parçası
 * @param {string} kaynakUrl  içerik kimliği (dosya adı bundan üretilir)
 * @returns {Promise<string>} file:// URI
 */
export async function writeLocalMaster(
	variant,
	audioTracks = [],
	seciliSes = null,
	kaynakUrl = "",
) {
	const lines = ["#EXTM3U", "#EXT-X-VERSION:3"];
	for (const track of audioTracks) {
		if (!track?.url) continue;
		const attrs = [
			"TYPE=AUDIO",
			'GROUP-ID="audio0"',
			`NAME="${(track.name || "Ses").replace(/"/g, "'")}"`,
		];
		if (track.language) attrs.push(`LANGUAGE="${track.language}"`);
		const varsayilan = !seciliSes || seciliSes.url === track.url;
		attrs.push(`DEFAULT=${varsayilan ? "YES" : "NO"}`, "AUTOSELECT=YES");
		attrs.push(`URI="${track.url}"`);
		lines.push(`#EXT-X-MEDIA:${attrs.join(",")}`);
	}
	const streamAttrs = [`BANDWIDTH=${variant.bandwidth || 0}`];
	if (variant.resolution) streamAttrs.push(`RESOLUTION=${variant.resolution}`);
	if (variant.frameRate) streamAttrs.push(`FRAME-RATE=${variant.frameRate}`);
	if (variant.codecs) streamAttrs.push(`CODECS="${variant.codecs}"`);
	if (audioTracks.some((t) => t?.url)) streamAttrs.push('AUDIO="audio0"');
	lines.push(`#EXT-X-STREAM-INF:${streamAttrs.join(",")}`);
	lines.push(variant.url);

	const file = new File(Paths.cache, kaliteMasterAdi(kaynakUrl));
	/*
	 * `write` dosyayı sıfırdan yazar (truncate).
	 *
	 * ⚠️ `writableStream()` KULLANILMAZ: `FileMode.WriteOnly` ile açıyor ve
	 * Android tarafında `RandomAccessFile`+`"rw"` demek — TRUNCATE YOK
	 * (`FileSystemFileHandle.kt`, `rafMode`). O yolla yeni içerik eskisinden
	 * kısayken dosyanın kuyruğu diskte kalıyordu; ExoPlayer kalıntıyı ikinci
	 * varyant sanıp BAŞKA içeriği oynatabiliyordu (çok sesli kaynak → tek
	 * sesli kaynak geçişinde yaşanan "içerik karışması").
	 */
	await file.write(`${lines.join("\n")}\n`);
	return file.uri;
}