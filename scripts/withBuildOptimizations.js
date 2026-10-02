const { withAppBuildGradle } = require("@expo/config-plugins");

module.exports = function withBuildOptimizations(config) {
	return withAppBuildGradle(config, (config) => {
		if (config.modResults.language === "groovy") {
			let contents = config.modResults.contents;

			// Eski bloğu temizle
			contents = contents.replace(
				/\/\/ --- Expo Build Optimizations Start ---[\s\S]*?\/\/ --- Expo Build Optimizations End ---\n?/g,
				"",
			);

			const optimizationBlock = `
// --- Expo Build Optimizations Start ---
android {
    
    packagingOptions {
        jniLibs {
            useLegacyPackaging = false
            keepDebugSymbols.clear()
        }
        resources {
            excludes += [
                "META-INF/*.version",
                "META-INF/DEPENDENCIES",
                "META-INF/LICENSE*",
                "META-INF/NOTICE*",
                "META-INF/INDEX.LIST"
            ]
        }
    }
}
// --- Expo Build Optimizations End ---
`;
			contents += `\n${optimizationBlock}`;
			config.modResults.contents = contents;
		}
		return config;
	});
};
