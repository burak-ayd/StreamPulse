const { withAppBuildGradle } = require("@expo/config-plugins");

module.exports = function withCustomApkName(config) {
	const slug = config.slug || "app";
	const appVariant = process.env.APP_VARIANT || "release";

	// Split kapalıyken tek mimari derlenen varyantlarda arm64-v8a, aksi halde universal etiketi
	const fallbackArch = ["development", "preview"].includes(appVariant)
		? "arm64-v8a"
		: "universal";

	return withAppBuildGradle(config, (config) => {
		if (config.modResults.language === "groovy") {
			const renamingScript = `
// --- Expo Custom APK Naming Plugin Başlangıcı ---
android.applicationVariants.all { variant ->
    variant.outputs.all { output ->
        def appSlug = "${slug}"
        def appVariant = "${appVariant}"
        def appVersion = variant.versionName ?: "${config.version || "1.0.0"}"
        
        def abiName = output.getFilter(com.android.build.OutputFile.ABI)
        if (abiName == null) {
            abiName = "${fallbackArch}"
        }

        output.outputFileName = "\${appSlug}-\${appVersion}-\${appVariant}-\${abiName}.apk"
    }
}
// --- Expo Custom APK Naming Plugin Sonu ---
`;

			if (
				config.modResults.contents.includes(
					"Expo Custom APK Naming Plugin",
				)
			) {
				config.modResults.contents = config.modResults.contents.replace(
					/\/\/ --- Expo Custom APK Naming Plugin Başlangıcı ---[\s\S]*?\/\/ --- Expo Custom APK Naming Plugin Sonu ---/,
					renamingScript.trim(),
				);
			} else {
				config.modResults.contents += `\n${renamingScript}`;
			}
		}
		return config;
	});
};
