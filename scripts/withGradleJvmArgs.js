const { withGradleProperties } = require("@expo/config-plugins");

module.exports = function withGradleJvmArgs(config) {
	return withGradleProperties(config, (config) => {
		const currentVariant = process.env.APP_VARIANT || "release";
		const isFastDevBuild = ["development", "preview"].includes(
			currentVariant,
		);

		const performanceProps = {
			"org.gradle.jvmargs":
				"-Xmx6144m -XX:MaxMetaspaceSize=1024m -XX:+UseParallelGC -XX:SoftRefLRUPolicyMSPerMB=0",
			"org.gradle.parallel": "true",
			"org.gradle.caching": "true",
			"org.gradle.vfs.watch": "true",
			"org.gradle.workers.max": "12",
			"kotlin.compiler.execution.strategy": "daemon",
			"kotlin.incremental": "true",
		};

		// Development ve preview derlemelerinde sadece arm64-v8a derleyerek süreyi kısaltıyoruz
		if (isFastDevBuild) {
			performanceProps["reactNativeArchitectures"] = "arm64-v8a";
		}

		Object.entries(performanceProps).forEach(([key, value]) => {
			const existingItem = config.modResults.find(
				(item) => item.type === "property" && item.key === key,
			);

			if (existingItem) {
				existingItem.value = value;
			} else {
				config.modResults.push({
					type: "property",
					key: key,
					value: value,
				});
			}
		});

		return config;
	});
};
