/**
 * StreamPulse - Splash Varyant Doğrulaması
 * ------------------------------------------
 * "Her build varyantı kendi splash'ini kullanmalı" kuralını, cihaz
 * olmadan doğrular.
 *
 *   node scripts/verify-splash-variants.mjs
 *
 * Her `APP_VARIANT` girdisi için `app.config.js`'i fiilen çalıştırır ve şu
 * zinciri sınar:
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
 * Kapsam neden sadece üç varyant değil: `app.config.js` içindeki
 * `VARIANT_DIR` `dev` ve `production` takma adlarını da kabul ediyordu, ama
 * paket adı yalnızca "development"/"preview" değerlerine bakıyordu. Bu yüzden
 * `APP_VARIANT=dev` → native "dev" görseli + "…streampulse" paket adı üretiyor,
 * JS katmanı da paket adından "release" çözüyordu: aynı hatanın ikinci kapısı.
 * Aşağıdaki tablo bu yüzden takma adları ve harf büyüklüğünü de kapsar.
 *
 * Çıkış kodu 1 ise en az bir girdi native ile JS katmanı arasında ayrışıyor
 * demektir.
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

/**
 * `APP_VARIANT` girdileri ve bu girdinin düşmesi gereken klasör.
 * `env: null` → değişken tanımsız.
 */
const CASES = [
	{ env: null, dir: "release", label: "(tanimsiz)" },
	{ env: "development", dir: "dev", label: "development" },
	{ env: "dev", dir: "dev", label: "dev (takma ad)" },
	{ env: "preview", dir: "preview", label: "preview" },
	{ env: "release", dir: "release", label: "release" },
	{ env: "production", dir: "release", label: "production (takma ad)" },
	{ env: "  Development  ", dir: "dev", label: "bosluklu + buyuk harf" },
	{ env: "PREVIEW", dir: "preview", label: "buyuk harf" },
	{ env: "bilinmeyen", dir: "release", label: "bilinmeyen deger" },
];

/** JS katmanının (SplashOverlay) require ettiği dosya biçimi. */
const jsAsset = (dir) => `./assets/icons/${dir}/splash-icon.png`;

const failures = [];
const rows = [];

/** @param {string} message */
function fail(message) {
	failures.push(message);
}

for (const testCase of CASES) {
	if (testCase.env === null) delete process.env.APP_VARIANT;
	else process.env.APP_VARIANT = testCase.env;

	const config = appConfig({ config: baseConfig.expo ?? baseConfig });

	// Native katmanın gömüleceği görsel: expo-splash-screen plugin girdisi.
	const splashPlugin = config.plugins.find(
		(p) => Array.isArray(p) && p[0] === "expo-splash-screen",
	);
	const nativeAsset = splashPlugin?.[1]?.image;
	const packageId = config.android?.package;

	if (!nativeAsset) {
		fail(`${testCase.label}: expo-splash-screen plugin girdisi bulunamadı`);
		continue;
	}
	if (!packageId) {
		fail(`${testCase.label}: android.package tanımlı değil`);
		continue;
	}

	/*
	 * Native asset'in klasörü, `app.config.js`'in beklenen varyantı seçip
	 * seçmediğini gösterir. Bu kontrol olmadan, hem native hem JS katmanı
	 * yanlış varyanta birlikte düşse test yine geçerdi.
	 */
	const nativeDir = nativeAsset.replace("./assets/icons/", "").replace(
		"/splash-icon.png",
		"",
	);
	if (nativeDir !== testCase.dir) {
		fail(
			`${testCase.label}: native splash "${nativeDir}" klasöründen geliyor, ` +
				`"${testCase.dir}" bekleniyordu`,
		);
	}

	// JS katmanının paket adından seçtiği görsel.
	const dir = resolveSplashVariantDir(packageId);
	const chosenAsset = jsAsset(dir);

	const match = chosenAsset === nativeAsset;
	rows.push({
		label: testCase.label,
		packageId,
		dir,
		nativeAsset,
		chosenAsset,
		match,
	});

	if (!match) {
		fail(
			`${testCase.label}: JS katmanı "${chosenAsset}" seçti, native splash ise ` +
				`"${nativeAsset}" — paket adı "${packageId}"`,
		);
	}

	// Klasörde gerçekten dosya var mı (yoksa build sessizce bozuk çıkar).
	try {
		await readFile(path.join(ROOT, chosenAsset));
	} catch {
		fail(`${testCase.label}: splash görseli diskte yok → ${chosenAsset}`);
	}
}

/*
 * Üç gerçek varyant birbirinden ayrı olmalı; hepsi aynı dosyaya bakıyorsa
 * "her varyant kendi splash'ini kullanır" kuralı sahte geçer.
 */
const canonical = new Set(
	CASES.filter((c) => ["development", "preview", "release"].includes(c.env)).map(
		(c) => c.dir,
	),
);
if (canonical.size !== 3) {
	fail(
		`development/preview/release ayrı klasörlere düşmüyor: ` +
			`${[...canonical].join(", ")}`,
	);
}

const pad = (v, n) => String(v).padEnd(n);
const fails = rows.filter((r) => !r.match).length;
console.log("Splash varyant doğrulaması");
console.log("-".repeat(78));
for (const r of rows) {
	console.log(
		`  ${r.match ? "OK  " : "FAIL"}  ${pad(r.label, 28)} ` +
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

console.log(
	`${rows.length} girdinin tamamı JS katmanı ile native splash aynı görseli kullanıyor ` +
		`(${fails} uyuşmazlık).`,
);
