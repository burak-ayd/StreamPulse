/**
 * GitHub Releases üzerinden APK güncelleme yöneticisi (headless).
 *
 * ⚠️ Bu dosya BİLEREK UI içermez. AstorTest2'deki sürümün aksine burada
 * `Alert.alert(...)` yok; yönetici yalnızca callback'ler tetikler ve
 * sonuç döndürür. Alert'i yöneticinin içine gömmenin bedeli, bu modülü
 * kullanan her ekranın aynı diyaloğa mahkûm olması ve test edilememesiydi.
 * Karar verme (kullanıcıya sorulsun mu?) React tarafına aittir.
 *
 * Akış:
 *   checkForUpdate()  → GitHub'ı sor, sürümü karşılaştır, güncelleme varsa bildir
 *   downloadAndInstall() → izni denetle, indirmeyi başlat, ilerlemeyi yayınla
 */
import { Platform } from "react-native";
import NativeApkUpdate, {
	isApkUpdateAvailable,
} from "./ApkUpdateNativeModule";
import type { ApkUpdateNativeModule } from "./ApkUpdateNativeModule";
import type { EventSubscription } from "expo-modules-core";
import type {
	DownloadCompleteEvent,
	DownloadProgressEvent,
	GitHubRelease,
	GitHubReleaseAsset,
	InstallResultEvent,
	ReleaseInfo,
	UpdateCheckResult,
	VersionInfo,
} from "./ApkUpdate.types";

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_NOTE_LINES = 12;
const APK_EXTENSION = ".apk";
const DEBUG_HINT = /debug|unsigned|test/i;

/** Yöneticinin bulunduğu aşama — UI buna göre metin/ikon değiştirir. */
export type UpdateStage =
	| "idle"
	| "checking"
	| "available"
	| "downloading"
	| "installing"
	| "done"
	| "error";

export type UpdateManagerCallbacks = {
	onStageChange?: (stage: UpdateStage, message?: string) => void;
	/** 0..100 — indirme oranı. */
	onProgress?: (progress: number) => void;
	onError?: (message: string) => void;
	/** Sistem yükleyicisi açıldı. Uygulama kapanabilir. */
	onInstallStarted?: () => void;
	/** Android 8+ için "bilinmeyen kaynak" izni gerekiyor. */
	onPermissionRequired?: () => void;
};

export type ApkUpdateManagerOptions = {
	/** "owner/repo" biçiminde. Boş ise güncelleme kapalıdır. */
	repo?: string | null;
	/**
	 * Opsiyonel GitHub PAT. Token, saatlik 60 isteğin sınırından
	 * (rate limit) kurtulur. Kullanıcı token'ını uygulamaya gömmez;
	 * sunucu/derleme ortamından beslenmesi gerekir.
	 */
	token?: string | null;
	/** APK dosyasını release içinden seçerken kullanılan ipucu. */
	assetHint?: string;
	/** Native modül yoksa (web/Expo Go) sürüm bilgisi için kullanılır. */
	fallbackVersion?: string;
};

export function compareVersions(a: string, b: string): number {
	const parse = (value: string) => {
		const clean = String(value ?? "").trim().replace(/^v/i, "");
		const [core, prerelease = ""] = clean.split("-");
		const parts = core
			.split(".")
			.map((part) => Number.parseInt(part, 10))
			.map((num) => (Number.isFinite(num) ? num : 0));
		while (parts.length < 3) parts.push(0);
		return { parts, prerelease };
	};

	const left = parse(a);
	const right = parse(b);

	for (let i = 0; i < 3; i++) {
		if (left.parts[i] > right.parts[i]) return 1;
		if (left.parts[i] < right.parts[i]) return -1;
	}

	// Aynı çekirdek sürüm: sürüm öncesi (rc/beta) kararlı sürümden küçüktür.
	if (left.prerelease && !right.prerelease) return -1;
	if (!left.prerelease && right.prerelease) return 1;
	if (left.prerelease !== right.prerelease) {
		return left.prerelease > right.prerelease ? 1 : -1;
	}
	return 0;
}

/** GitHub release gövdesini tek ekrana sığan düz metne çevirir. */
export function formatReleaseNotes(body?: string | null): string {
	if (typeof body !== "string" || body.trim().length === 0) {
		return "Sürüm notu bulunmuyor.";
	}
	const lines = body
		.replace(/\r\n/g, "\n")
		.replace(/<!--[\s\S]*?-->/g, "")
		.replace(/^#{1,6}\s*/gm, "")
		.replace(/\*\*/g, "")
		.replace(/`/g, "")
		.replace(/^\s*[-*+]\s+/gm, "• ")
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0);

	return lines.slice(0, MAX_NOTE_LINES).join("\n");
}

/**
 * Release içinden kurulabilir APK'yı seçer.
 *
 * ⚠️ SIRALAMA ÖNEMLİ. Bu proje `withSplitApk.js` ile release derlemesini
 * ABI'ye göre böler; release'e birden fazla APK yüklenir:
 *
 *   StreamPulse-1.0.13-release-armeabi-v7a.apk
 *   StreamPulse-1.0.13-release-arm64-v8a.apk
 *   StreamPulse-1.0.13-release-universal.apk
 *
 * Üçü de aynı "ipucu"na uyar. "İlk eşleşmeyi al" mantığı hangisinin
 * sırada olduğuna bağlı olarak arm64 seçebilir ve 32 bit cihazda
 * kurulum `INSTALL_FAILED_NO_MATCHING_ABIS` ile patlar. Bu yüzden:
 *
 *   1. cihazın ABI'sine tam uyum (tercih sırası `Build.SUPPORTED_ABIS`)
 *   2. `universal` APK — her cihazda çalışır
 *   3. ipucu / "release" içeren APK
 *   4. ne varsa
 *
 * `debug` / `unsigned` / `test` içeren APK'lar her zaman elenir: bunlar
 * kullanıcının telefonuna kurulamaz.
 */
export function pickApkAsset(
	assets: GitHubReleaseAsset[] = [],
	options: { hint?: string; abis?: string[] } | string = {}
): GitHubReleaseAsset | null {
	const opts: { hint?: string; abis?: string[] } =
		typeof options === "string" ? { hint: options } : options ?? {};

	const apks = (assets ?? []).filter((asset) =>
		asset?.name?.toLowerCase().endsWith(APK_EXTENSION)
	);
	if (apks.length === 0) return null;

	const withoutDebug = apks.filter((asset) => !DEBUG_HINT.test(asset.name));
	const pool = withoutDebug.length > 0 ? withoutDebug : apks;
	const lower = (asset: GitHubReleaseAsset) => asset.name.toLowerCase();

	for (const abi of opts.abis ?? []) {
		// `-${abi}` ile eşleştir: sürüm numarası ya da kelime eşleşmesin.
		const hit = pool.find((asset) => lower(asset).includes(`-${abi.toLowerCase()}`));
		if (hit) return hit;
	}

	const universal = pool.find((asset) => /universal/.test(lower(asset)));
	if (universal) return universal;

	if (opts.hint) {
		const hinted = pool.find((asset) =>
			lower(asset).includes(opts.hint!.toLowerCase())
		);
		if (hinted) return hinted;
	}

	return pool.find((asset) => /release/i.test(asset.name)) ?? pool[0];
}

export class ApkUpdateManager {
	private progressSubscription: EventSubscription | null = null;
	private completeSubscription: EventSubscription | null = null;
	private installSubscription: EventSubscription | null = null;
	private stage: UpdateStage = "idle";
	private repo: string | null;
	private readonly token: string | null;
	private readonly assetHint: string;
	private readonly fallbackVersion: string;
	private callbacks: UpdateManagerCallbacks = {};
	private supportedAbis: string[] | null = null;

	constructor(options: ApkUpdateManagerOptions = {}, callbacks: UpdateManagerCallbacks = {}) {
		this.repo = options.repo ?? null;
		this.token = options.token ?? null;
		this.assetHint = options.assetHint ?? "streampulse";
		this.fallbackVersion = options.fallbackVersion ?? "0.0.0";
		this.callbacks = callbacks;
	}

	setCallbacks(callbacks: UpdateManagerCallbacks) {
		this.callbacks = callbacks;
	}

	/** Repo sonradan (örn. ayarlardan) değiştirilebilsin. */
	setRepo(repo: string | null) {
		this.repo = repo ?? null;
	}

	getRepo(): string | null {
		return this.repo;
	}

	getStage(): UpdateStage {
		return this.stage;
	}

	private setStage(stage: UpdateStage, message?: string) {
		this.stage = stage;
		this.callbacks.onStageChange?.(stage, message);
	}

	/**
	 * `isApkUpdateAvailable` doğrulandıktan SONRA çağrılmalı.
	 *
	 * Tip susturmak yerine burada gerçek bir koruma var: `requireOptionalNativeModule`
	 * web'de/iOS'ta null döndürdüğü için, yanlışlıkla çağrıldığında sessizce
	 * "olmayan bir modüle" erişmek yerine anlaşılır bir hata fırlatır.
	 */
	private requireNative(): ApkUpdateNativeModule {
		if (!NativeApkUpdate) {
			throw new Error(
				"StreamPulseApkUpdate native modülü yok. Expo Go değil, native build gerekir."
			);
		}
		return NativeApkUpdate;
	}

	/** Bu ortamda APK güncellemesi çalışır mı? (Android + native modül + repo) */
	getAvailabilityReason(): string | null {
		if (Platform.OS !== "android") {
			return "Güncelleme yalnızca Android'de çalışır.";
		}
		if (!isApkUpdateAvailable) {
			return "Güncelleme modülü bu çalıştırmada yok (native build gerekli).";
		}
		if (!this.repo) {
			return "GitHub deposu tanımlı değil (EXPO_PUBLIC_GITHUB_REPO).";
		}
		return null;
	}

	/** Kurulu sürüm — native modülden, yoksa fallback değerden. */
	async getCurrentVersion(): Promise<VersionInfo> {
		if (isApkUpdateAvailable) {
			try {
				return await this.requireNative().getCurrentVersion();
			} catch (error) {
				console.warn("[apk-update] Sürüm okunamadı:", error);
			}
		}
		return { versionName: this.fallbackVersion, versionCode: 0 };
	}

	/**
	 * Cihazın ABI listesi (sonuç belleğe alınır — sabit bir değer).
	 * Split APK'lar arasından doğru olanı seçmek için gerekir.
	 */
	private async getSupportedAbis(): Promise<string[]> {
		if (this.supportedAbis) return this.supportedAbis;
		try {
			const abis = await this.requireNative().getSupportedAbis();
			this.supportedAbis = Array.isArray(abis) ? abis : [];
		} catch (error) {
			console.warn("[apk-update] ABI listesi okunamadı:", error);
			this.supportedAbis = [];
		}
		return this.supportedAbis ?? [];
	}

	/**
	 * GitHub'ı sorgular ve sürümü karşılaştırır.
	 * Hata DURUMUNDA THROW ETMEZ — sonucu döndürür; çağıran taraf
	 * (React) kullanıcıya ne gösterileceğine kendisi karar verir.
	 */
	async checkForUpdate(): Promise<UpdateCheckResult> {
		const unavailable = this.getAvailabilityReason();
		if (unavailable) {
			return { status: "disabled", reason: unavailable };
		}

		this.setStage("checking");

		const { versionName: currentVersion } = await this.getCurrentVersion();
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

		try {
			const response = await fetch(
				`https://api.github.com/repos/${this.repo}/releases/latest`,
				{
					headers: {
						Accept: "application/vnd.github+json",
						"X-GitHub-Api-Version": "2022-11-28",
						"User-Agent": "StreamPulse-App",
						...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
					},
					signal: controller.signal,
				}
			);

			if (response.status === 403 || response.status === 429) {
				const message = "GitHub istek sınırına takıldı. Biraz sonra tekrar deneyin.";
				this.setStage("error", message);
				this.callbacks.onError?.(message);
				return { status: "error", message, currentVersion };
			}
			if (response.status === 404) {
				const message = "Depo bulunamadı veya henüz yayınlanmış sürüm yok.";
				this.setStage("error", message);
				this.callbacks.onError?.(message);
				return { status: "error", message, currentVersion };
			}
			if (!response.ok) {
				const message = `GitHub yanıtı: ${response.status}`;
				this.setStage("error", message);
				this.callbacks.onError?.(message);
				return { status: "error", message, currentVersion };
			}

			const release = (await response.json()) as GitHubRelease;
			const latestVersion = release?.tag_name ?? "";
			if (!latestVersion) {
				const message = "Sürüm etiketi okunamadı.";
				this.setStage("error", message);
				return { status: "error", message, currentVersion };
			}

			if (compareVersions(latestVersion, currentVersion) <= 0) {
				this.setStage("idle");
				return {
					status: "up-to-date",
					currentVersion,
					latestVersion,
				};
			}

			const abis = await this.getSupportedAbis();
			const asset = pickApkAsset(release.assets, {
				hint: this.assetHint,
				abis,
			});
			if (!asset) {
				const message = "Bu sürümde kurulabilir APK bulunamadı.";
				this.setStage("error", message);
				this.callbacks.onError?.(message);
				return { status: "error", message, currentVersion };
			}

			const info: ReleaseInfo = {
				version: latestVersion.replace(/^v/i, ""),
				tag: latestVersion,
				notes: formatReleaseNotes(release.body),
				size: asset.size ?? 0,
				sizeMB: Math.max(1, Math.round((asset.size ?? 0) / (1024 * 1024))),
				downloadUrl: asset.browser_download_url,
				publishedAt: release.published_at ?? null,
				htmlUrl: release.html_url ?? null,
			};

			this.setStage("available");
			return { status: "update-available", currentVersion, release: info };
		} catch (error) {
			const isAbort = (error as Error)?.name === "AbortError";
			const message = isAbort
				? "Güncelleme kontrolü zaman aşımına uğradı."
				: `Güncelleme kontrolü başarısız: ${
						(error as Error)?.message ?? "bilinmeyen hata"
					}`;
			this.setStage("error", message);
			this.callbacks.onError?.(message);
			return { status: "error", message, currentVersion };
		} finally {
			clearTimeout(timeout);
		}
	}

	/** Android 8+ için "bilinmeyen kaynaklardan yükleme" izni var mı? */
	async hasInstallPermission(): Promise<boolean> {
		if (!isApkUpdateAvailable) return false;
		try {
			return await this.requireNative().checkInstallPermission();
		} catch (error) {
			console.warn("[apk-update] İzin kontrolü başarısız:", error);
			return false;
		}
	}

	/** Kullanıcıyı ilgili sistem ayar ekranına yönlendirir. */
	requestInstallPermission() {
		if (!NativeApkUpdate) return;
		NativeApkUpdate.requestInstallPermission();
	}

	/**
	 * APK'yı indirir ve sistem yükleyicisini başlatır.
	 * İzin yoksa indirme BAŞLATMAZ, `onPermissionRequired` tetikler.
	 */
	async downloadAndInstall(release: ReleaseInfo): Promise<boolean> {
		if (!isApkUpdateAvailable) {
			const message = "Güncelleme modülü bu çalıştırmada yok.";
			this.setStage("error", message);
			this.callbacks.onError?.(message);
			return false;
		}

		if (!(await this.hasInstallPermission())) {
			this.setStage("idle");
			this.callbacks.onPermissionRequired?.();
			return false;
		}

		this.attachListeners();
		this.setStage("downloading");
		this.callbacks.onProgress?.(0);

		try {
			await this.requireNative().downloadAndInstall(
				release.downloadUrl,
				`StreamPulse-${release.version}.apk`
			);
			return true;
		} catch (error) {
			this.detachListeners();
			const message = `İndirme başlatılamadı: ${
				(error as Error)?.message ?? "bilinmeyen hata"
			}`;
			this.setStage("error", message);
			this.callbacks.onError?.(message);
			return false;
		}
	}

	async cancelDownload(): Promise<void> {
		try {
			if (NativeApkUpdate) await NativeApkUpdate.cancelDownload();
		} catch (error) {
			console.warn("[apk-update] İptal başarısız:", error);
		}
		this.detachListeners();
		this.setStage("idle");
	}

	cleanup() {
		this.detachListeners();
	}

	// ────────────────────────────── event'ler ──────────────────────────────

	private attachListeners() {
		this.detachListeners();
		if (!isApkUpdateAvailable) return;
		const native = this.requireNative();

		this.progressSubscription = native.addListener(
			"onDownloadProgress",
			(event: DownloadProgressEvent) => {
				const progress = Math.max(0, Math.min(100, event?.progress ?? 0));
				this.callbacks.onProgress?.(progress);
			}
		);

		this.completeSubscription = native.addListener(
			"onDownloadComplete",
			(event: DownloadCompleteEvent) => {
				if (event?.status !== "success") {
					this.callbacks.onError?.(
						event?.message ?? "APK indirilemedi."
					);
					this.setStage("error", event?.message);
				}
			}
		);

		this.installSubscription = native.addListener(
			"onInstallResult",
			(event: InstallResultEvent) => {
				if (event?.status === "install_started") {
					this.setStage("done");
					this.callbacks.onInstallStarted?.();
				} else if (event?.status === "permission_required") {
					this.setStage("idle");
					this.callbacks.onPermissionRequired?.();
				} else if (event?.status === "error") {
					this.callbacks.onError?.(event?.message ?? "Kurulum başlatılamadı.");
					this.setStage("error", event?.message);
				}
			}
		);
	}

	private detachListeners() {
		this.progressSubscription?.remove();
		this.completeSubscription?.remove();
		this.installSubscription?.remove();
		this.progressSubscription = null;
		this.completeSubscription = null;
		this.installSubscription = null;
	}
}

export default ApkUpdateManager;