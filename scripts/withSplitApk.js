const { withAppBuildGradle } = require("@expo/config-plugins");

module.exports = function withSplitApk(config) {
	return withAppBuildGradle(config, (config) => {
		if (config.modResults.language === "groovy") {
			let contents = config.modResults.contents;

			const currentVariant = process.env.APP_VARIANT || "release";
			const isProdOrRelease = ["production", "release"].includes(
				currentVariant,
			);

			if (
				contents.includes(
					"enableSeparateBuildPerCPUArchitecture = false",
				)
			) {
				contents = contents.replace(
					/def enableSeparateBuildPerCPUArchitecture = false/,
					`def enableSeparateBuildPerCPUArchitecture = ${isProdOrRelease}`,
				);
			} else if (contents.includes("splits {")) {
				contents = contents.replace(
					/splits\s*\{[\s\S]*?abi\s*\{[\s\S]*?\}[\s\S]*?\}/,
					`splits {
        abi {
            enable ${isProdOrRelease}
            reset()
            include "arm64-v8a"
            universalApk false
        }
    }`,
				);
			} else if (isProdOrRelease) {
				contents = contents.replace(
					/android\s*\{/,
					`android {
    splits {
        abi {
            enable true
            reset()
            include  "arm64-v8a"
            universalApk false
        }
    }`,
				);
			}

			config.modResults.contents = contents;
		}
		return config;
	});
};
