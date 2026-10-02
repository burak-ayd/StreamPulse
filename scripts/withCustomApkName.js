const { withAppBuildGradle } = require("@expo/config-plugins");

module.exports = function withCustomApkName(config) {
	const slug = config.slug || "app";

	return withAppBuildGradle(config, (config) => {
		if (config.modResults.language === "groovy") {
			const renamingScript = `
// --- Expo Custom APK Naming Plugin Başlangıcı ---
android.applicationVariants.all { variant ->
    variant.outputs.all { output ->
        def appSlug = "${slug}"
        
        // Versiyonu app.json yerine doğrudan Gradle'ın derleme anındaki versiyonundan okuyoruz (Otomatik artışlar yakalanır)
        def appVersion = variant.versionName ?: "${config.version || "1.0.0"}"
        
        def buildTypeName = variant.buildType.name 
        
        def abiName = output.getFilter(com.android.build.OutputFile.ABI)
        if (abiName == null) {
            abiName = "universal"
        }

        output.outputFileName = "\${appSlug}-\${appVersion}-\${buildTypeName}-\${abiName}.apk"
    }
}
// --- Expo Custom APK Naming Plugin Sonu ---
`;

			// Eski script varsa temizle, yenisini ekle
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
