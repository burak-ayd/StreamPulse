module.exports = function (api) {
	api.cache(true);
	return {
		presets: ["babel-preset-expo"],
		plugins: [
			[
				"module-resolver",
				{
					root: ["./"],
					alias: {
						"@": "./src",
						"@components": "./src/components",
						"@lib": "./src/lib",
						"@assets": "./src/assets",
						"@constants": "./src/constants",
						"@hooks": "./src/hooks",
						"@navigation": "./src/navigation",
						"@screens": "./src/screens",
						"@store": "./src/store",
						"@theme": "./src/theme",
						"@utils": "./src/utils",
						"@context": "./src/context",
					},
				},
			],
		],
	};
};
