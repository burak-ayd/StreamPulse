/**
 * StreamPulse - Splash Varyant Doğrulaması
 * ------------------------------------------
 * "Her build varyantı kendi splash'ini kullanmalı" kuralını, cihaz
 * olmadan doğrular.
 *
 *   node scripts/verify-splash-variants.mjs
 *
 * Her varyant için `app.config.js`'i fiilen çalıştırır ve şu zinciri sınar:
 *
 *   APP_VARIANT ──► android.package ──► resolveSplashVariantDir()
 *                 ──► JS katmanının seçtiği görsel
 *                 ──► native splash görseli
 *
 * Zincirin son iki halkası **her zaman eşit olmak zorunda**. Ayrışırsa
 * açılışta iki farklı marka üst üste biner — dev build'de yaşanan da
 * tam olarak buydu: native katman DEV, JS katmanı RELEASE çiziyordu.
 *
 * Karar `src/components/splash/variant.js` → `resolveSplashVariantDir()`
 * içinden gelir; `SplashOverlay.jsx` de aynı fonksiyonu kullanır. Yani
 * burada kopyalanan bir kural yok, sapma olursa test gerçekten kırılır.
 *
 * Çıkış kodu 1 ise en az bir varyant native ile JS katmanı arasında
 * ayrışıyor demektir.
 */

import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

import appConfig from "../app.config.js";
import { resolveSplashVariantDir } from "../src/components/splash/variant.js";

/*
 * app.json bir ESM dosyası olarak import edilirken `with { type: "json" }`
 * özniteliği gerekiyor; repo eslint ayarı bu sözdizimini çözümleyemiyor
 * (bkz. scripts/generate-icons/verify.mjs). Burada require ile okuyup
 * projeye yeni bir parse hatası eklemiyoruz.
 */
const baseConfig = createRequire(import.meta.url)("../app.json");

const ROOT = process.cwd();
const VARIANTS = ["development", "preview", "release"];

/** JS katmanının (SplashOverlay) require ettiği dosya biçimi. */
const jsAsset = (dir) => `./assets/icons/${dir}/splash-icon.png`;

const failures = [];
const rows = [];

/** @param {string} message */
function fail(message) {
	failures.push(message);
}

for (const variant of VARIANTS) {
	process.env.APP_VARIANT = variant;
	const config = appConfig({ config: baseConfig.expo ?? baseConfig });

	// Native katmanın gömüleceği görsel: expo-splash-screen plugin girdisi.
	const splashPlugin = config.plugins.find(
		(p) => Array.isArray(p) && p[0] === "expo-splash-screen",
	);
	const nativeAsset = splashPlugin?.[1]?.image;
	const packageId = config.android?.package;

	if (!nativeAsset) {
		fail(`${variant}: expo-splash-screen plugin girdisi bulunamadı`);
		continue;
	}
	if (!packageId) {
		fail(`${variant}: android.package tanımlı değil`);
		continue;
	}

	// JS katmanının paket adından seçtiği görsel.
	const dir = resolveSplashVariantDir(packageId);
	const chosenAsset = jsAsset(dir);

	const match = chosenAsset === nativeAsset;
	rows.push({
		variant,
		packageId,
		dir,
		nativeAsset,
		chosenAsset,
		match,
	});

	if (!match) {
		fail(
			`${variant}: JS katmanı "${chosenAsset}" seçti, native splash ise ` +
				`"${nativeAsset}" — paket adı "${packageId}"`,
		);
	}

	// Klasörde gerçekten dosya var mı (yoksa build sessizce bozuk çıkar).
	try {
		await readFile(path.join(ROOT, chosenAsset));
	} catch {
		fail(`${variant}: splash görseli diskte yok → ${chosenAsset}`);
	}
}

// Varyantlar birbirinden ayrı olmalı; hepsi aynı dosyaya bakıyorsa
// "her varyant kendi splash'ini kullanır" kuralı sahte geçer.
const dirs = new Set(rows.map((r) => r.dir));
if (rows.length === VARIANTS.length && dirs.size !== VARIANTS.length) {
	fail(
		`varyantlar ayrışmıyor, tümü "${[...dirs].join(", ")}" klasörüne bakıyor`,
	);
}

const pad = (v, n) => String(v).padEnd(n);
console.log("Splash varyant doğrulaması");
console.log("-".repeat(78));
for (const r of rows) {
	console.log(
		`  ${r.match ? "OK  " : "FAIL"}  ${pad(r.variant, 12)} ` +
			`${pad(r.packageId, 44)} → ${r.dir}`,
	);
	if (!r.match) {
		console.log(`          JS  : ${r.chosenAsset}`);
		console.log(`          APK : ${r.nativeAsset}`);
	}
}
console.log("-".repeat(78));

if (failures.length) {
	for (const f of failures) console.error(`HATA: ${f}`);
	process.exit(1);
}

console.log(`${rows.length} varyantın tamamı JS katmanı ile native splash aynı görseli kullanıyor.`);