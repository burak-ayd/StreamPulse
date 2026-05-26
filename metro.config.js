const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

config.resolver.alias = {
	...config.resolver.alias,
	"@": path.resolve(__dirname, "src"),
	"@components": path.resolve(__dirname, "src/components"),
	"@screens": path.resolve(__dirname, "src/screens"),
	"@utils": path.resolve(__dirname, "src/utils"),
	"@assets": path.resolve(__dirname, "src/assets"),
	"@constants": path.resolve(__dirname, "src/constants"),
	"@navigation": path.resolve(__dirname, "src/navigation"),
	"@services": path.resolve(__dirname, "src/services"),
	"@store": path.resolve(__dirname, "src/store"),
	"@hooks": path.resolve(__dirname, "src/hooks"),
	"@theme": path.resolve(__dirname, "src/theme"),
	"@lib": path.resolve(__dirname, "src/lib"),
	"@context": path.resolve(__dirname, "src/context"),
};

config.watchFolders.push(path.resolve(__dirname));

module.exports = config;
