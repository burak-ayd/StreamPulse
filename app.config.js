// app.config.js
const IS_DEV = process.env.APP_VARIANT === "development";
const IS_PREVIEW = process.env.APP_VARIANT === "preview";

const getAppId = () => {
	if (IS_DEV) return "tr.net.burakaydogan.streampulse.dev";
	if (IS_PREVIEW) return "tr.net.burakaydogan.streampulse.preview";
	return "tr.net.burakaydogan.streampulse";
};

const getAppName = () => {
	if (IS_DEV) return "Stream Pulse (Dev)";
	if (IS_PREVIEW) return "Stream Pulse (Preview)";
	return "Stream Pulse";
};

export default ({ config }) => ({
	...config,
	owner: "darkpuye",
	name: getAppName(),
	runtimeVersion: "1",
	ios: {
		...config.ios,
		bundleIdentifier: getAppId(),
	},
	android: {
		...config.android,
		package: getAppId(),
	},
	extra: {
		...config.extra,
		eas: {
			projectId: "6e7b0adb-396f-4d06-b66d-bea82406c890",
		},
		variant: process.env.APP_VARIANT || "release",
		API_URL: IS_DEV
			? "https://movieapi.burakaydogan.net.tr"
			: IS_PREVIEW
				? "https://movieapi.burakaydogan.net.tr"
				: "https://movieapi.burakaydogan.net.tr",
	},
});
