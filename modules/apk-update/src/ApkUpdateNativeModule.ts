/**
 * Native modülün JS köprüsü.
 *
 * ⚠️ `requireOptionalNativeModule` (zorunlu olan `requireNativeModule`
 * DEĞİL) kullanıyoruz: modül yalnızca Android'de var, iOS/web'de ve
 * native modülün derlenmediği ortamlarda (ör. Expo Go) `requireNativeModule`
 * THROW eder ve uygulama açılışta çöker. Burada `null` dönüp çağıran
 * tarafın bunu "özellik yok" olarak ele almasını sağlıyoruz.
 */
import { requireOptionalNativeModule } from "expo-modules-core";
import type { EventSubscription } from "expo-modules-core";
import type {
	DownloadCompleteEvent,
	DownloadProgressEvent,
	InstallResultEvent,
	VersionInfo,
} from "./ApkUpdate.types";

export interface ApkUpdateNativeModule {
	getCurrentVersion(): Promise<VersionInfo>;
	checkInstallPermission(): Promise<boolean>;
	requestInstallPermission(): void;
	downloadAndInstall(downloadUrl: string, fileName: string): Promise<number>;
	cancelDownload(): Promise<boolean>;

	addListener(
		eventName: "onDownloadProgress",
		listener: (event: DownloadProgressEvent) => void
	): EventSubscription;
	addListener(
		eventName: "onDownloadComplete",
		listener: (event: DownloadCompleteEvent) => void
	): EventSubscription;
	addListener(
		eventName: "onInstallResult",
		listener: (event: InstallResultEvent) => void
	): EventSubscription;
}

const nativeModule =
	requireOptionalNativeModule<ApkUpdateNativeModule>("StreamPulseApkUpdate");

/** Native modül gerçekten derlenmiş ve bağlanmış mı? */
export const isApkUpdateAvailable = nativeModule != null;

export default nativeModule;