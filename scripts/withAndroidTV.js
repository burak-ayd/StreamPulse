// withAndroidTV.js
const { withAndroidManifest } = require("@expo/config-plugins");

module.exports = function withAndroidTV(config) {
	return withAndroidManifest(config, (modConfig) => {
		const manifest = modConfig.modResults.manifest;
		const application = manifest.application[0];
		const mainActivity = application.activity.find((a) =>
			a["intent-filter"]?.some((filter) =>
				filter.action?.some(
					(act) =>
						act.$["android:name"] === "android.intent.action.MAIN",
				),
			),
		);

		// 1. Donanım özellikleri (Her iki cihaz için opsiyonel)
		if (!manifest["uses-feature"]) manifest["uses-feature"] = [];

		const features = [
			{
				$: {
					"android:name": "android.hardware.touchscreen",
					"android:required": "false",
				},
			},
			{
				$: {
					"android:name": "android.software.leanback",
					"android:required": "false",
				},
			},
		];

		features.forEach((feat) => {
			const exists = manifest["uses-feature"].some(
				(f) => f.$?.["android:name"] === feat.$["android:name"],
			);
			if (!exists) manifest["uses-feature"].push(feat);
		});

		// 2. Hem Telefon (LAUNCHER) hem TV (LEANBACK_LAUNCHER) Kategorilerini Ekle
		if (mainActivity && mainActivity["intent-filter"]) {
			const mainFilter = mainActivity["intent-filter"].find((f) =>
				f.action?.some(
					(a) => a.$["android:name"] === "android.intent.action.MAIN",
				),
			);

			if (mainFilter) {
				if (!mainFilter.category) mainFilter.category = [];

				const categories = [
					"android.intent.category.LAUNCHER", // Telefon & Tablet için
					"android.intent.category.LEANBACK_LAUNCHER", // Android TV için
				];

				categories.forEach((catName) => {
					const exists = mainFilter.category.some(
						(c) => c.$?.["android:name"] === catName,
					);
					if (!exists) {
						mainFilter.category.push({
							$: { "android:name": catName },
						});
					}
				});
			}
		}

		return modConfig;
	});
};
