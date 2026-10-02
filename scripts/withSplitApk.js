const { withAppBuildGradle } = require("@expo/config-plugins");

module.exports = function withSplitApk(config) {
	return withAppBuildGradle(config, (config) => {
		if (config.modResults.language === "groovy") {
			let contents = config.modResults.contents;

			// 1. Eski usul satır varsa true yap
			if (
				contents.includes(
					"enableSeparateBuildPerCPUArchitecture = false",
				)
			) {
				contents = contents.replace(
					/def enableSeparateBuildPerCPUArchitecture = false/,
					"def enableSeparateBuildPerCPUArchitecture = true",
				);
			}
			// 2. Eğer o satır yoksa, gradle dosyasındaki 'splits' bloğunu bulup mimari ayrıştırmayı zorla aktif et
			else if (contents.includes("splits {")) {
				contents = contents.replace(
					/splits\s*\{/,
					`splits {
    abi {
        enable true
        reset()
        include "armeabi-v7a", "arm64-v8a", "x86", "x86_64"
        universalApk true
    }`,
				);
			} else {
				// Eğer hiçbiri yoksa android { bloğunun içine splits ekle
				contents = contents.replace(
					/android\s*\{/,
					`android {
    splits {
        abi {
            enable true
            reset()
            include "armeabi-v7a", "arm64-v8a", "x86", "x86_64"
            universalApk true
        }
    }`,
				);
			}

			config.modResults.contents = contents;
		}
		return config;
	});
};
