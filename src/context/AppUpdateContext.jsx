/**
 * APK güncelleme durumu için uygulama geneli sağlayıcı.
 *
 * Neden ayrı context? Üç ayrı yer (root banner, ayarlar satırı, modal)
 * aynı durumu okuyor. Her biri kendi `useState` tutsaydı kontrol 3 kez
 * çalışır, ilerleme çubukları birbirinden kopardı. Tek doğruluk kaynağı
 * burasıdır; `getUpdateManager()` da tekil örnek döndürür.
 *
 * UX kararı: kontrol AÇILIŞTA otomatik çalışır ama kullanıcıyı
 * BLOKLAMAZ. Güncelleme varsa banner çıkar; kullanıcı istediğinde modalı
 * açar. AstorTest2'deki "güncelleme varsa uygulama açılmaz" davranışı
 * kullanıcıyı offline olduğunda kilitlemesi diye özellikle seçilmedi.
 */
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { Alert, Platform } from "react-native";
import { appUpdateConfig, getUpdateManager } from "@/services/appUpdate";

const AppUpdateContext = createContext(null);

export function AppUpdateProvider({ children }) {
	const [stage, setStage] = useState("idle");
	const [release, setRelease] = useState(null);
	const [progress, setProgress] = useState(0);
	const [error, setError] = useState(null);
	const [statusMessage, setStatusMessage] = useState("");
	const [currentVersion, setCurrentVersion] = useState(
		appUpdateConfig.fallbackVersion
	);
	const [sheetVisible, setSheetVisible] = useState(false);
	const [bannerVisible, setBannerVisible] = useState(false);
	/*
	 * `disabledReason` başlangıçta HESAPLANIR, effect içinde set edilmez:
	 * effect gövdesinde senkron setState, render → render zinciri kurar
	 * (react-hooks/set-state-in-effect). Değer her oturum sabittir; tek
	 * değişebilir hali `check()` sonucuyla "disabled" dönmesidir.
	 */
	const [disabledReason, setDisabledReason] = useState(() =>
		Platform.isTV === true
			? "TV sürümünde APK güncellemesi desteklenmiyor."
			: getUpdateManager().getAvailabilityReason()
	);

	const managerRef = useRef(null);

	const check = useCallback(async ({ manual = false } = {}) => {
		const manager = managerRef.current;
		if (!manager) return;

		setStage("checking");
		setError(null);
		setProgress(0);
		setStatusMessage("");

		const result = await manager.checkForUpdate();

		if (result.currentVersion) setCurrentVersion(result.currentVersion);

		switch (result.status) {
			case "update-available":
				setRelease(result.release);
				setStage("available");
				setBannerVisible(true);
				// Otomatik kontrollerde modalı zorlamıyoruz; yalnızca
				// kullanıcı "kontrol et" dediğinde açılır.
				if (manual) setSheetVisible(true);
				break;

			case "up-to-date":
				setRelease(null);
				setBannerVisible(false);
				setStage("idle");
				if (manual) {
					setSheetVisible(true);
					setStatusMessage(
						`Uygulamanız güncel (v${result.currentVersion}).`
					);
				}
				break;

			case "disabled":
				setDisabledReason(result.reason);
				setStage("idle");
				if (manual) setSheetVisible(true);
				break;

			default:
				setError(result.message);
				setStage("error");
				if (manual) setSheetVisible(true);
				break;
		}
	}, []);

	// Kurulum izni akışı — Android 8+ için "bilinmeyen kaynaklar".
	const requestPermission = useCallback(() => {
		Alert.alert(
			"Yükleme izni gerekli",
			"Güncellemeyi yükleyebilmek için bu uygulamaya “bilinmeyen kaynaklardan yükleme” izni verilmelidir.",
			[
				{ text: "Vazgeç", style: "cancel" },
				{
					text: "Ayarları aç",
					onPress: () => managerRef.current?.requestInstallPermission(),
				},
			]
		);
	}, []);

	useEffect(() => {
		const manager = getUpdateManager();
		managerRef.current = manager;

		manager.setCallbacks({
			onStageChange: (next, message) => {
				setStage(next);
				if (message) setStatusMessage(message);
			},
			onProgress: (value) => setProgress(value),
			onError: (message) => setError(message),
			onInstallStarted: () => {
				Alert.alert(
					"Kurulum başlatıldı",
					"Sistem yükleyicisi açıldı. Yeni sürümü yükledikten sonra uygulama otomatik yenilenecek.",
					[{ text: "Tamam" }]
				);
			},
			onPermissionRequired: requestPermission,
		});

		// Neden senkron setState YOK: `disabledReason` zaten useState
		// başlatıcısında hesaplandı; burada yalnızca kontrolü başlatıyoruz
		// ve "disabled" sonucu `check()` içinde ASENKRON olarak geliyor.
		const reason = manager.getAvailabilityReason();
		if (!reason) {
			// Her uygulama açılışında kontrol (kullanıcı tercihi).
			check({ manual: false });
		}

		return () => {
			manager.cleanup();
		};
	}, [check, requestPermission]);

	const install = useCallback(async () => {
		const manager = managerRef.current;
		if (!manager || !release) return;
		setError(null);
		await manager.downloadAndInstall(release);
	}, [release]);

	const cancelDownload = useCallback(async () => {
		await managerRef.current?.cancelDownload();
		setProgress(0);
	}, []);

	const openSheet = useCallback(() => setSheetVisible(true), []);
	const closeSheet = useCallback(() => setSheetVisible(false), []);
	const dismissBanner = useCallback(() => setBannerVisible(false), []);

	const value = useMemo(
		() => ({
			// durum
			stage,
			release,
			progress,
			error,
			statusMessage,
			currentVersion,
			sheetVisible,
			bannerVisible,
			disabledReason,
			// eylemler
			check,
			install,
			cancelDownload,
			openSheet,
			closeSheet,
			dismissBanner,
			// türetilmiş bayraklar
			isChecking: stage === "checking",
			isBusy: stage === "downloading" || stage === "installing",
			hasUpdate: stage === "available" || stage === "downloading",
		}),
		[
			stage,
			release,
			progress,
			error,
			statusMessage,
			currentVersion,
			sheetVisible,
			bannerVisible,
			disabledReason,
			check,
			install,
			cancelDownload,
			openSheet,
			closeSheet,
			dismissBanner,
		]
	);

	return (
		<AppUpdateContext.Provider value={value}>
			{children}
		</AppUpdateContext.Provider>
	);
}

/**
 * Güncelleme bağlamı. Provider dışında çağrılırsa sessizce yedek değer
 * döner — banner gibi "her ekranda render edilen" bileşenler, provider
 * henüz mount olmamışsa uygulamayı patlatmamalı.
 */
export function useAppUpdate() {
	const context = useContext(AppUpdateContext);
	return (
		context ?? {
			stage: "idle",
			release: null,
			progress: 0,
			error: null,
			statusMessage: "",
			currentVersion: appUpdateConfig.fallbackVersion,
			sheetVisible: false,
			bannerVisible: false,
			disabledReason: null,
			check: async () => {},
			install: async () => {},
			cancelDownload: async () => {},
			openSheet: () => {},
			closeSheet: () => {},
			dismissBanner: () => {},
			isChecking: false,
			isBusy: false,
			hasUpdate: false,
		}
	);
}