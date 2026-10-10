/**
 * `modules/apk-update` — GitHub Releases üzerinden APK güncelleme.
 *
 * Kullanım:
 *   import { ApkUpdateManager } from "@modules/apk-update/src";
 *   const manager = new ApkUpdateManager({ repo: "owner/name" });
 *   const result = await manager.checkForUpdate();
 *
 * React tarafında hazır sarmalayıcı: `@/context/AppUpdateContext`.
 */
export { default as ApkUpdateManager, compareVersions, formatReleaseNotes, pickApkAsset } from "./ApkUpdateManager";
export type {
	ApkUpdateManagerOptions,
	UpdateManagerCallbacks,
	UpdateStage,
} from "./ApkUpdateManager";

export {
	default as NativeApkUpdate,
	isApkUpdateAvailable,
} from "./ApkUpdateNativeModule";
export type { ApkUpdateNativeModule } from "./ApkUpdateNativeModule";

export type {
	DownloadCompleteEvent,
	DownloadProgressEvent,
	GitHubRelease,
	GitHubReleaseAsset,
	InstallResultEvent,
	ReleaseInfo,
	UpdateCheckResult,
	VersionInfo,
} from "./ApkUpdate.types";