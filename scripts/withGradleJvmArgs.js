const { withGradleProperties } = require("@expo/config-plugins");

module.exports = function withGradleJvmArgs(config) {
	return withGradleProperties(config, (config) => {
		// gradle.properties içerisindeki org.gradle.jvmargs değerini bulup güncelliyoruz
		const jvmArgsItem = config.modResults.find(
			(item) =>
				item.type === "property" && item.key === "org.gradle.jvmargs",
		);

		if (jvmArgsItem) {
			jvmArgsItem.value = "-Xmx8192m -XX:MaxMetaspaceSize=2048m";
		} else {
			// Eğer daha önce yoksa listeye yeni bir property olarak ekliyoruz
			config.modResults.push({
				type: "property",
				key: "org.gradle.jvmargs",
				value: "-Xmx8192m -XX:MaxMetaspaceSize=2048m",
			});
		}

		return config;
	});
};
