// withSplitApk.js
const { withAppBuildGradle } = require("@expo/config-plugins");

/**
 * TEK DÜZENLEME NOKTASI — hangi varyant hangi APK'ları üretsin.
 *
 * abis:      üretilecek ABI APK'ları. [] → split kapalı, tek APK.
 *            Örn. hepsi için: ["armeabi-v7a", "arm64-v8a", "x86", "x86_64"]
 * universal: ABI'siz ek APK üretilsin mi.
 *
 * "production" APP_VARIANT'ı release sayılır (app.config.js ile aynı eşleme).
 */
const SPLIT_APK = {
	// x86_64 YALNIZ development'ta: emülatör dev build'i bu ABI olmadan
	// kurulamaz (APK'da libreactnative.so bulunmaz → açılışta SoLoader çöker).
	development: { abis: ["armeabi-v7a", "arm64-v8a", "x86_64"], universal: true },
	preview: { abis: ["armeabi-v7a", "arm64-v8a"], universal: true },
	release: { abis: ["armeabi-v7a", "arm64-v8a"], universal: true },
};

const splitConfigFor = (variant) => {
	const key = (variant || process.env.APP_VARIANT || "release")
		.trim()
		.toLowerCase();
	const configured = SPLIT_APK[key === "production" ? "release" : key];
	return {
		abis: configured?.abis ?? [],
		universal: configured?.universal === true,
	};
};

const splitEnabledFor = (variant) => splitConfigFor(variant).abis.length > 0;

const splitsBlock = ({ abis, universal }) => {
	const enabled = abis.length > 0;
	const include = abis.length
		? `\n            include ${abis.map((abi) => `"${abi}"`).join(", ")}`
		: "";

	return `splits {
        abi {
            enable ${enabled}
            reset()${include}
            universalApk ${enabled && universal}
        }
    }`;
};

module.exports = function withSplitApk(config) {
	const splitConfig = splitConfigFor();

	return withAppBuildGradle(config, (config) => {
		if (config.modResults.language !== "groovy") return config;

		let contents = config.modResults.contents;

		if (contents.includes("splits {")) {
			contents = contents.replace(
				/splits\s*\{[\s\S]*?abi\s*\{[\s\S]*?\}[\s\S]*?\}/,
				splitsBlock(splitConfig),
			);
		} else if (splitEnabledFor()) {
			contents = contents.replace(
				/android\s*\{/,
				`android {\n    ${splitsBlock(splitConfig)}`,
			);
		}

		config.modResults.contents = contents;
		return config;
	});
};

module.exports.splitEnabledFor = splitEnabledFor;
module.exports.splitConfigFor = splitConfigFor;
