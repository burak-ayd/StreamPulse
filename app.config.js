// app.config.js
//
// Tüm ikon/splash/favicon/TV asset'ı seçimi APP_VARIANT'a göre burada yapılır.
// Asset'lar scripts/generate-icons/generate.mjs ile üretilir (assets/icons/<release|preview|dev>/).
//
//   APP_VARIANT=development  → assets/icons/dev/*
//   APP_VARIANT=preview      → assets/icons/preview/*
//   (yok / production)       → assets/icons/release/*
//
// Yeni bir konsept üretmek için: node scripts/generate-icons/generate.mjs
// Değişiklik sonrası: bunx expo prebuild --clean && rebuild.

const VARIANT_DIR = {
	development: "dev",
	dev: "dev",
	preview: "preview",
	release: "release",
	production: "release",
};

const SPLASH_BG = "#0B0E14";
const NOTIFICATION_COLOR = "#FF3D5E";
const SPLASH_WIDTH = 260;

const iconPaths = (dir) => ({
	icon: `./assets/icons/${dir}/icon.png`,
	favicon: `./assets/icons/${dir}/favicon.png`,
	splash: `./assets/icons/${dir}/splash-icon.png`,
	notification: `./assets/icons/${dir}/notification-icon.png`,
	adaptiveForeground: `./assets/icons/${dir}/icon-adaptive-foreground.png`,
	adaptiveBackground: `./assets/icons/${dir}/icon-adaptive-background.png`,
	adaptiveMonochrome: `./assets/icons/${dir}/icon-adaptive-monochrome.png`,
	tvIcon: `./assets/icons/${dir}/icon.png`,
	tvBanner: `./assets/icons/${dir}/tv-banner.png`,
	tv: {
		icon: `./assets/icons/${dir}/tv-icon.png`,
		iconSmall: `./assets/icons/${dir}/tv-icon-small.png`,
		iconSmall2x: `./assets/icons/${dir}/tv-icon-small-2x.png`,
		topShelf: `./assets/icons/${dir}/tv-topshelf.png`,
		topShelf2x: `./assets/icons/${dir}/tv-topshelf-2x.png`,
		topShelfWide: `./assets/icons/${dir}/tv-topshelf-wide.png`,
		topShelfWide2x: `./assets/icons/${dir}/tv-topshelf-wide-2x.png`,
	},
});

/**
 * app.json'daki plugin listesini varyanta göre yamalar.
 * Plugin'ler hem düz string ("expo-notifications") hem dizi (["expo-notifications", {...}])
 * olarak gelebilir — ikisi de ad üzerinden normalize edilir.
 * app.json'da tanımlı renk/genişlik gibi ayarlar korunur, sadece yollar varyanta göre değişir.
 */
const patchPlugins = (plugins, p) =>
	(plugins ?? []).map((entry) => {
		const name = Array.isArray(entry) ? entry[0] : entry;
		const opts = Array.isArray(entry) && entry[1] ? entry[1] : {};

		switch (name) {
			case "expo-notifications":
				return [
					"expo-notifications",
					{
						icon: p.notification,
						color: opts.color ?? NOTIFICATION_COLOR,
					},
				];

			case "expo-splash-screen":
				return [
					"expo-splash-screen",
					{
						backgroundColor: opts.backgroundColor ?? SPLASH_BG,
						image: p.splash,
						imageWidth: opts.imageWidth ?? SPLASH_WIDTH,
					},
				];

			case "@react-native-tvos/config-tv":
				return [
					"@react-native-tvos/config-tv",
					{
						...opts,
						androidTVBanner: p.tvBanner,
						androidTVIcon: p.tvIcon,
						appleTVImages: p.tv,
					},
				];

			default:
				return entry;
		}
	});

export default ({ config }) => {
	/*
	 * Normalize edilir: `VARIANT_DIR` anahtarları küçük harf olduğu için
	 * "Development" gibi bir değer sessizce release'a düşerdi.
	 */
	const APP_VARIANT = (process.env.APP_VARIANT || "release")
		.trim()
		.toLowerCase();
	const dir = VARIANT_DIR[APP_VARIANT] ?? VARIANT_DIR.release;
	const p = iconPaths(dir);

	/*
	 * TEK KARAR NOKTASI (⚠️ kritik).
	 *
	 * Hem native asset'lerin klasörü (`p`, yani `dir`) hem paket adı **aynı
	 * `dir` değerinden** türetilir. İkisi ayrı ayrı hesaplanırsa, `VARIANT_DIR`
	 * içinde karşılığı olan ama buradaki koşul listesine takılmayan bir değer
	 * şu ölümcül karışımı üretir:
	 *
	 *   APP_VARIANT=dev → native splash = "dev", paket adı = "…streampulse"
	 *
	 * Açılışta JS katmanı paket adından varyantı çözer (bkz.
	 * src/components/splash/variant.js) ve "release" görselini çizer; native
	 * katman ise "dev" görselini. Sonuç: önce dev, sonra release splash —
	 * yani bu işin başlangıcındaki hata. `dir`'ı tek kaynak yapmak bunu
	 * yapısal olarak imkânsız kılar.
	 */
	const APP_ID = {
		dev: "tr.net.burakaydogan.streampulse.dev",
		preview: "tr.net.burakaydogan.streampulse.preview",
		release: "tr.net.burakaydogan.streampulse",
	};

	const APP_NAME = {
		dev: "Stream Pulse (Dev)",
		preview: "Stream Pulse (Preview)",
		release: "Stream Pulse",
	};

	const getAppId = () => APP_ID[dir];
	const getAppName = () => APP_NAME[dir];

	return {
		...config,
		owner: "darkpuye",
		name: getAppName(),

		/*
		 * ── OTA (expo-updates · custom server) ─────────────────────
		 *
		 * runtimeVersion = appVersion politikası: sürüm numarası her APK
		 * derlemesinde bump-version.js ile arttığı için runtimeVersion da
		 * otomatik artar. JS-only değişiklikte sürüm DEĞİŞMEZ → sunucudaki
		 * güncelleme aynı runtime'a düşer → APK yeniden derlemeye gerek
		 * kalmadan OTA ile gider. Native/gradle/plugin değişikliği →
		 * sürüm ARTMAK ZORUNDA (APK derlemesi her şeye bağlı bulundu).
		 *
		 * Sunucu: AstorTest2'de kullanılan custom Expo Updates protokol
		 * sunucusu (ota.burakaydogan.tk/manifest). İstekler
		 * `expo-app-id` (StreamPulse'a özgü kayıt) ve `expo-channel-name`
		 * başlığıyla gider; kanal APP_VARIANT'tan türetilir.
		 *
		 * checkAutomatically ON_ERROR_RECOVERY: açılışta bekleme YOK;
		 * kontrol manuel olarak JS tarafında (src/hooks/useOtaUpdate.js)
		 * açılış + foreground'da yapılır. fallbackToCacheTimeout=0 →
		 * embedded bundle anında başlar, güncelleme arka planda iner.
		 *
		 * Kod imzası: sunucu manifest'i private key ile imzalar; APK'ya
		 * gömülü `certs/certificate.pem` (public) doğrular. İmza tutmazsa
		 * güncelleme REDDEDİLİR. certs/*.pem .gitignore'da (makine-lokal,
		 * AstorTest2 ile aynı tutum); sunucunun imza anahtarı ile bu
		 * sertifikaların EŞLEŞMESİ gerekir. disableCodeSigning bilgisi:
		 * DISABLE_CODE_SIGNING=1 ile test amaçlı kapatılabilir.
		 */
		runtimeVersion: { policy: "appVersion" },
		updates: {
			url: "https://ota.burakaydogan.tk/manifest",
			codeSigningMetadata:
				process.env.DISABLE_CODE_SIGNING === "1"
					? undefined
					: { keyid: "main", alg: "rsa-v1_5-sha256" },
			codeSigningCertificate:
				process.env.DISABLE_CODE_SIGNING === "1"
					? undefined
					: "./certs/certificate.pem",
			enabled: true,
			checkAutomatically: "ON_ERROR_RECOVERY",
			fallbackToCacheTimeout: 0,
			requestHeaders: {
				"expo-channel-name": dir,
				"expo-app-id": "46297b13-b95e-43b4-90da-cebab8f8741a",
			},
		},

		icon: p.icon,

		ios: {
			...config.ios,
			bundleIdentifier: getAppId(),
			icon: p.icon,
		},

		android: {
			...config.android,
			package: getAppId(),
			adaptiveIcon: {
				backgroundColor: SPLASH_BG,
				foregroundImage: p.adaptiveForeground,
				backgroundImage: p.adaptiveBackground,
				monochromeImage: p.adaptiveMonochrome,
			},
		},

		web: {
			...config.web,
			favicon: p.favicon,
		},

		plugins: patchPlugins(config.plugins, p),

		extra: {
			...config.extra,
			eas: {
				projectId: "6e7b0adb-396f-4d06-b66d-bea82406c890",
			},
			variant: APP_VARIANT,
			iconVariant: dir,
			API_URL: "https://movieapi.burakaydogan.net.tr",
			/*
			 * APK güncelleme (modules/apk-update).
			 *
			 * Repo: burak-ayd/StreamPulse (public). Değeri build ortamından
			 * gelen EXPO_PUBLIC_GITHUB_REPO her zaman ETER; aşağıdaki
			 * değer yalnızca ortam değişkeni tanımlı değilken kullanılır.
			 *
			 * Boş da bırakılabilir: o zaman güncelleme kapalıdır ve uygulama
			 * yine açılır. Repo yayınlanmadan önce çalışmaya devam etmeli.
			 */
			apkUpdate: {
				githubRepo:
					process.env.EXPO_PUBLIC_GITHUB_REPO ||
					"burak-ayd/StreamPulse",
				githubToken: process.env.EXPO_PUBLIC_GITHUB_TOKEN ?? "",
				assetHint: "streampulse",
			},
		},
	};
};
