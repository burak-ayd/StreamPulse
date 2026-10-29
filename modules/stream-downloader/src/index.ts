/**
 * `modules/stream-downloader` - native HLS/MP4 indirme motoru.
 *
 * JS sarmalayıcı Task 10'da `src/services/streamDownloader.js` içinde yazılır;
 * bu dosya yalnızca tip çıkışını hazırlar.
 */
export type StreamDownloaderStatus =
	| "queued"
	| "downloading"
	| "merging"
	| "paused"
	| "completed"
	| "failed";
