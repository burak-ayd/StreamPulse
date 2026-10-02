// app.config.js
const IS_DEV = process.env.APP_VARIANT === "development";
const IS_PREVIEW = process.env.APP_VARIANT === "preview";

const getAppId = () => {
	if (IS_DEV) return "tr.net.burakaydogan.streampulse.dev";
	if (IS_PREVIEW) return "tr.net.burakaydogan.streampulse.preview";
	return "tr.net.burakaydogan.streampulse";
};

const getAppName = () => {
	if (IS_DEV) return "StreamPulse (Dev)";
	if (IS_PREVIEW) return "StreamPulse (Preview)";
	return "StreamPulse";
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
		variant: process.env.APP_VARIANT || "production",
		API_URL: IS_DEV
			? "https://movieapi.burakaydogan.net.tr"
			: IS_PREVIEW
				? "http://192.168.1.21:8000"
				: "http://192.168.1.21:8000",
	},
});
