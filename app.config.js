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
				return ["expo-notifications", {
					icon: p.notification,
					color: opts.color ?? NOTIFICATION_COLOR,
				}];

			case "expo-splash-screen":
				return ["expo-splash-screen", {
					backgroundColor: opts.backgroundColor ?? SPLASH_BG,
					image: p.splash,
					imageWidth: opts.imageWidth ?? SPLASH_WIDTH,
				}];

			case "@react-native-tvos/config-tv":
				return ["@react-native-tvos/config-tv", {
					...opts,
					androidTVBanner: p.tvBanner,
					androidTVIcon: p.icon,
					appleTVImages: p.tv,
				}];

			default:
				return entry;
		}
	});

export default ({ config }) => {
	const APP_VARIANT = process.env.APP_VARIANT || "release";
	const dir = VARIANT_DIR[APP_VARIANT] ?? VARIANT_DIR.release;
	const p = iconPaths(dir);

	const IS_DEV = APP_VARIANT === "development";
	const IS_PREVIEW = APP_VARIANT === "preview";

	const getAppId = () => {
		if (IS_DEV) return "tr.net.burakaydogan.streampulse.dev";
		if (IS_PREVIEW) return "tr.net.burakaydogan.streampulse.preview";
		return "tr.net.burakaydogan.streampulse";
	};

	const getAppName = () => {
		if (IS_DEV) return "Stream Pulse (Dev)";
		if (IS_PREVIEW) return "Stream Pulse (Preview)";
		return "Stream Pulse";
	};

	return {
		...config,
		owner: "darkpuye",
		name: getAppName(),
		runtimeVersion: "1",
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
		},
	};
};
