/**
 * StreamPulse — Icon Pipeline Verification
 * ---------------------------------------
 * app.config.js'in her varyant için ürettiği config'i çalıştırır ve referans verilen
 * TÜM asset dosyalarının gerçekten var olduğunu + beklenen boyutta olduğunu doğrular.
 *
 *   node scripts/generate-icons/verify.mjs
 *
 * Çıkış kodu 1 ise en az bir asset eksik/yanlış → build kırılır.
 */

import sharp from "sharp";
import { access } from "node:fs/promises";
import path from "node:path";

import appConfig from "../../app.config.js";
import baseConfig from "../../app.json" with { type: "json" };

const ROOT = process.cwd();
const VARIANTS = ["development", "preview", "release"];
/** generate.mjs'in ürettiği, geçerli varyant klasörleri */
const REGISTRY = { release: 1, preview: 1, dev: 1 };

/** [config yolu, etiket] — varieden bağımsız kontroller */
const EXPECT = [
	["icon", "master icon", { w: 1024, h: 1024, opaque: true }],
	["ios.icon", "iOS icon", { w: 1024, h: 1024, opaque: true }],
	["android.adaptiveIcon.foregroundImage", "adaptive foreground", { w: 1024, h: 1024 }],
	["android.adaptiveIcon.backgroundImage", "adaptive background", { w: 1024, h: 1024, opaque: true }],
	["android.adaptiveIcon.monochromeImage", "adaptive monochrome", { w: 1024, h: 1024 }],
	["web.favicon", "favicon", { w: 48, h: 48 }],
];

const PLUGIN_EXPECT = [
	["expo-splash-screen", "image", "splash", { w: 1024 }],
	["expo-notifications", "icon", "notification", { w: 96, h: 96 }],
	["@react-native-tvos/config-tv", "androidTVBanner", "tv banner", { w: 320, h: 180, opaque: true }],
	["@react-native-tvos/config-tv", "androidTVIcon", "tv icon", { w: 1024, opaque: true }],
	["@react-native-tvos/config-tv", "appleTVImages.icon", "tvOS icon", { w: 1280, h: 768, opaque: true }],
	["@react-native-tvos/config-tv", "appleTVImages.iconSmall2x", "tvOS icon small 2x", { w: 800, h: 480, opaque: true }],
	["@react-native-tvos/config-tv", "appleTVImages.topShelf2x", "tvOS top shelf 2x", { w: 3840, h: 1440, opaque: true }],
	["@react-native-tvos/config-tv", "appleTVImages.topShelfWide2x", "tvOS top shelf wide 2x", { w: 4640, h: 1440, opaque: true }],
];

const dig = (obj, p) => p.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);
const ok = (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
const bad = (m) => console.log(`  \x1b[31m✗\x1b[0m ${m}`);

async function checkAsset(relPath, expect, label) {
	const abs = path.join(ROOT, relPath.replace(/^\.\//, ""));
	try {
		await access(abs);
	} catch {
		bad(`${label}: EKSİK → ${relPath}`);
		return false;
	}
	if (!expect) {
		ok(`${label}: ${relPath}`);
		return true;
	}
	const meta = await sharp(abs).metadata();
	const problems = [];
	if (expect.w && meta.width !== expect.w) problems.push(`genişlik ${meta.width} ≠ ${expect.w}`);
	if (expect.h && meta.height !== expect.h) problems.push(`yükseklik ${meta.height} ≠ ${expect.h}`);
	if (expect.opaque && meta.hasAlpha) problems.push("alpha kanalı var (iOS App Store reddeder)");
	if (problems.length) {
		bad(`${label}: ${relPath} → ${problems.join(", ")}`);
		return false;
	}
	ok(`${label}: ${relPath} (${meta.width}x${meta.height}${expect.opaque ? ", opak" : ""})`);
	return true;
}

async function verifyVariant(variant) {
	const env = process.env.APP_VARIANT;
	process.env.APP_VARIANT = variant;
	const cfg = appConfig({ config: structuredClone(baseConfig.expo) });
	process.env.APP_VARIANT = env;

	console.log(`\n\x1b[1m── APP_VARIANT=${variant}\x1b[0m`);
	if (cfg?.extra?.iconVariant === undefined) {
		bad("config çözümlenemedi");
		return 0;
	}
	let pass = 0;
	let fail = 0;

	for (const [p, label, expect] of EXPECT) {
		const rel = dig(cfg, p);
		if (typeof rel !== "string") {
			bad(`${label}: config'te yok (${p})`);
			fail++;
			continue;
		}
		(await checkAsset(rel, expect, label)) ? pass++ : fail++;
	}

	// ikon varyant klasörü config'te işaretlenmiş ve disk'te de mevcut olmalı
	const variantDir = dig(cfg, "extra.iconVariant");
	if (variantDir && REGISTRY[variantDir] === undefined) {
		bad(`extra.iconVariant "${variantDir}" bilinmeyen bir varyant klasörü`);
		fail++;
	} else if (variantDir) {
		ok(`extra.iconVariant: ${variantDir}`);
		pass++;
	}

	for (const [plugin, key, label, expect] of PLUGIN_EXPECT) {
		const entry = (cfg.plugins ?? []).find((e) => (Array.isArray(e) ? e[0] : e) === plugin);
		const rel = entry && dig(Array.isArray(entry) ? entry[1] : {}, key);
		if (typeof rel !== "string") {
			bad(`${label}: "${plugin}" plugin'inde "${key}" yok`);
			fail++;
			continue;
		}
		(await checkAsset(rel, expect, label)) ? pass++ : fail++;
	}

	return pass + fail ? { pass, fail } : { pass: 0, fail: 0 };
}

const totals = { pass: 0, fail: 0 };
for (const v of VARIANTS) {
	const r = await verifyVariant(v);
	totals.pass += r.pass;
	totals.fail += r.fail;
}

console.log(
	`\n\x1b[1m${totals.fail === 0 ? "\x1b[32mTÜM KONTROLLER GEÇTİ\x1b[0m" : "\x1b[31mHATALAR VAR\x1b[0m"} — ${totals.pass} geçti, ${totals.fail} başarısız\x1b[0m`,
);
process.exit(totals.fail === 0 ? 0 : 1);
