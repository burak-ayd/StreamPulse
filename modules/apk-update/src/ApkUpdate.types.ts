/**
 * Modülün JS tarafındaki tip sözleşmesi.
 *
 * Kotlin tarafı (`ApkUpdateModule.kt`) ile birebir eşleşir. Bir tarafı
 * değiştirirsen diğerini de güncelle — burada tip güvenliği sağlayan tek
 * şey bu dosya.
 */

/** Kotlin: EVENT_PROGRESS */
export type DownloadProgressEvent = {
	/** 0..100 */
	progress: number;
	bytesDownloaded: number;
	bytesTotal: number;
};

/** Kotlin: EVENT_DOWNLOAD_COMPLETE */
export type DownloadCompleteEvent = {
	/** "success" | "error" */
	status: string;
	message?: string;
	/** Kurulum için kullanılacak dosyanın tam yolu (başarıda). */
	path?: string;
};

/** Kotlin: EVENT_INSTALL_RESULT */
export type InstallResultEvent = {
	/**
	 * "install_started" | "permission_required" | "error"
	 *
	 * ⚠️ `install_started` YÜKLEME BAŞLADI demektir, BİTMEDİ demek
	 * değildir. Sistem yükleyicisi açılır ve kontrol uygulamadan çıkar.
	 */
	status: string;
	message?: string;
};

/** Kurulu uygulamanın sürüm bilgisi. */
export type VersionInfo = {
	versionName: string;
	versionCode: number;
};

export type GitHubReleaseAsset = {
	name: string;
	browser_download_url: string;
	size: number;
	content_type?: string;
};

export type GitHubRelease = {
	tag_name: string;
	name?: string | null;
	body?: string | null;
	draft?: boolean;
	prerelease?: boolean;
	published_at?: string;
	html_url?: string;
	assets: GitHubReleaseAsset[];
};

/** Uygulamanın kendisine gösterdiği, kullanıcıya hazır sürüm bilgisi. */
export type ReleaseInfo = {
	/** Etiketten normalize edilmiş sürüm: "v1.2.3" → "1.2.3" */
	version: string;
	/** Orijinal GitHub etiketi (loglama/uzak izleme için) */
	tag: string;
	notes: string;
	/** Bayt cinsinden ham boyut */
	size: number;
	/** MB cinsinden yuvarlanmış boyut (kullanıcıya gösterilir) */
	sizeMB: number;
	downloadUrl: string;
	publishedAt: string | null;
	htmlUrl: string | null;
};

/** `checkForUpdate()` her zaman bu şekilde döner — istisna atmaz. */
export type UpdateCheckResult =
	| { status: "update-available"; currentVersion: string; release: ReleaseInfo }
	| { status: "up-to-date"; currentVersion: string; latestVersion: string }
	/** Android dışı platform, native modül yok ya da repo tanımlı değil. */
	| { status: "disabled"; reason: string }
	| { status: "error"; message: string; currentVersion?: string };