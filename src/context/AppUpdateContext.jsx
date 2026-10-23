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
import { Alert } from "react-native";
import { appUpdateConfig, getUpdateManager } from "@/services/appUpdate";
import * as Updates from "expo-updates";
import Constants from "expo-constants";

const AppUpdateContext = createContext(null);

export function AppUpdateProvider({ children }) {
	const [stage, setStage] = useState("idle");
	const [release, setRelease] = useState(null);
	const [progress, setProgress] = useState(0);
	const [error, setError] = useState(null);
	const [statusMessage, setStatusMessage] = useState("");
	const [currentVersion, setCurrentVersion] = useState(() =>
		// OTA ile yüklenen sürüm manifestte gelir; yoksa app.json versiyonu.
		Updates.manifest?.extra?.expoClient?.version ||
		Constants.expoConfig?.version ||
		appUpdateConfig.fallbackVersion
	);
	const [sheetVisible, setSheetVisible] = useState(false);
	const [bannerVisible, setBannerVisible] = useState(false);
	/*
	 * `disabledReason` başlangıçta HESAPLANIR, effect içinde set edilmez:
	 * effect gövdesinde senkron setState, render → render zinciri kurar
	 * (react-hooks/set-state-in-effect). Değer her oturum sabittir; tek
	 * değişebilir hali `check()` sonucuyla "disabled" dönmesidir.
	 *
	 * ⚠️ TV'de özellik KAPALI DEĞİL. Önceden `Platform.isTV` ile
	 * kapatılmıştı; ama banner/modal artık kumanda (D-pad) ile
	 * çalışacak şekilde yapıldı ve TV kutu cihazlarında da sistem
	 * yükleyicisi bulunuyor. Kapatmak istersen buraya
	 * `Platform.isTV ? "TV'de desteklenmiyor." : ...` geri konabilir.
	 */
	const [disabledReason, setDisabledReason] = useState(() =>
		getUpdateManager().getAvailabilityReason()
	);

	const managerRef = useRef(null);

	// `check`in "güncel" mesajı güncel durum değerini okumalı; state'i
	// bağımlılığa almak `check`i her sürüm değişiminde yeniden kurar.
	const currentVersionRef = useRef(currentVersion);
	useEffect(() => {
		currentVersionRef.current = currentVersion;
	}, [currentVersion]);

	const check = useCallback(async ({ manual = false } = {}) => {
		const manager = managerRef.current;
		if (!manager) return;

		setStage("checking");
		setError(null);
		setProgress(0);
		setStatusMessage("");

		const result = await manager.checkForUpdate();

		// ⚠️ `result.currentVersion` NATİVE APK'nın versionName'idir; OTA ile
		// güncellenmiş bir JS, eski bir APK üstünde çalışıyorsa bu değer bayat
		// kalır (kullanıcı: ayarlarda v1.0.37 görünüyor, sürüm 1.0.46).
		// Gösterilen sürüm ÇALIŞAN JS'in sürümü olmalıdır — o da OTA
		// manifestindeki / app.json'daki sürümdür ve başlangıçta zaten
		// yazıldı. Native değeri EZMEZ.

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
						`Uygulamanız güncel (v${currentVersionRef.current}).`
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
	/*
	 * Modal kapanırken banner da kapatılır.
	 *
	 * ⚠️ Bug: bildirime dokunup modalı açan kullanıcı, güncelleme YAPMADAN
	 * kapatınca banner tekrar ekrana dönüyordu. Sebep: `bannerVisible` hâlâ
	 * true'ydu ve banner, modal açıkken render edilmediği için kapanışta
	 * "tekrar görünür" hale geliyordu.
	 *
	 * Modal banner'ın bilgisinin aynısını gösterdiği için geri getirmek
	 * bilgi kaybı değil; kullanıcı "gördüm, şimdi değil" dediğinde karşı
	 * çıkması gereken davranış bu.
	 */
	const closeSheet = useCallback(() => {
		setSheetVisible(false);
		setBannerVisible(false);
	}, []);
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