// withTVArch.js
const { withGradleProperties } = require("@expo/config-plugins");

module.exports = function withTVArch(config) {
	return withGradleProperties(config, (modConfig) => {
		const key = "reactNativeArchitectures";
		// TV Box (armeabi-v7a) ve standart mobil cihazlar (arm64-v8a)
		const value = "armeabi-v7a,arm64-v8a";

		const existing = modConfig.modResults.find(
			(item) => item.type === "property" && item.key === key,
		);

		if (existing) {
			existing.value = value;
		} else {
			modConfig.modResults.push({
				type: "property",
				key: key,
				value: value,
			});
		}

		return modConfig;
	});
};
