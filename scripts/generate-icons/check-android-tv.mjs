/**
 * StreamPulse — Android TV prebuild denetimi
 * ------------------------------------------
 * `expo prebuild` sonrası android/ klasörünün GERÇEKTEN yeni banner/icon'u içerip içermediğini
 * ve manifest'in doğru drawable'a işaret edip etmediğini kontrol eder.
 *
 *   APP_VARIANT=release node scripts/generate-icons/check-android-tv.mjs            # android/ + build çıktısındaki APK'lar
 *   node scripts/generate-icons/check-android-tv.mjs --apk <dosya.apk | klasör>      # belirli APK(lar)
 *
 * Cihaza kurulu APK'yı da denetleyebilirsiniz (asıl kanıt budur):
 *   adb shell pm path <applicationId>   →   adb pull <yol> installed.apk   →   --apk installed.apk
 *
 * Sonuç, "eski banner" sorununun hangi aşamada olduğunu ayırır:
 *   - Burada ✗ varsa  → prebuild/config-plugin aşaması (android/ klasörü yanlış üretiliyor)
 *   - Burada hepsi ✓  → sorun build/kurulum/launcher önbelleği tarafında
 */

import sharp from "sharp";
import { readFile, readdir, access, stat } from "node:fs/promises";
import { inflateRawSync } from "node:zlib";
import { createHash } from "node:crypto";
import path from "node:path";

import { VARIANTS, VARIANT_ENV } from "./brand.mjs";

const ROOT = process.cwd();
const ANDROID = path.join(ROOT, "android");
const MAIN = path.join(ANDROID, "app", "src", "main");
const RES = path.join(MAIN, "res");

const variantKey = VARIANT_ENV[process.env.APP_VARIANT || "release"] ?? "release";
const SRC_DIR = path.join(ROOT, "assets", "icons", VARIANTS[variantKey].dir);

const ok = (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
const bad = (m) => (fails++, console.log(`  \x1b[31m✗\x1b[0m ${m}`));
const warn = (m) => console.log(`  \x1b[33m!\x1b[0m ${m}`);
let fails = 0;

const sha = (buf) => createHash("sha256").update(buf).digest("hex").slice(0, 12);
const exists = (p) => access(p).then(() => true, () => false);
const attr = (tag, name) => tag?.match(new RegExp(`${name}="([^"]*)"`))?.[1];

/** Piksel içeriği hash'i: PNG sıkıştırma/crunch baytları değiştirse de aynı görseli aynı hash'e indirger. */
async function pixelHash(buf) {
	const raw = await sharp(buf).removeAlpha().raw().toBuffer();
	return sha(raw);
}

/** Her varyantın tv-banner.png parmak izi → bir banner'ın hangi varyanta ait olduğunu söyler. */
async function variantFingerprints() {
	const map = new Map();
	for (const [key, v] of Object.entries(VARIANTS)) {
		try {
			const buf = await readFile(path.join(ROOT, "assets", "icons", v.dir, "tv-banner.png"));
			map.set(await pixelHash(buf), key);
		} catch {}
	}
	return map;
}

/** Bağımlılıksız minimal ZIP okuyucu (APK) — yalnızca stored/deflate. */
function readZipEntries(buf) {
	let eocd = -1;
	for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
		if (buf.readUInt32LE(i) === 0x06054b50) {
			eocd = i;
			break;
		}
	}
	if (eocd < 0) throw new Error("ZIP/APK değil (EOCD yok)");
	const count = buf.readUInt16LE(eocd + 10);
	let p = buf.readUInt32LE(eocd + 16);
	const entries = [];
	for (let i = 0; i < count; i++) {
		if (buf.readUInt32LE(p) !== 0x02014b50) break;
		const method = buf.readUInt16LE(p + 10);
		const csize = buf.readUInt32LE(p + 20);
		const nlen = buf.readUInt16LE(p + 28);
		const elen = buf.readUInt16LE(p + 30);
		const clen = buf.readUInt16LE(p + 32);
		const off = buf.readUInt32LE(p + 42);
		const name = buf.toString("utf8", p + 46, p + 46 + nlen);
		entries.push({ name, method, csize, off });
		p += 46 + nlen + elen + clen;
	}
	const read = (e) => {
		const n = buf.readUInt16LE(e.off + 26);
		const m = buf.readUInt16LE(e.off + 28);
		const data = buf.subarray(e.off + 30 + n + m, e.off + 30 + n + m + e.csize);
		return e.method === 0 ? data : inflateRawSync(data);
	};
	return { entries, read };
}

async function findApks(target) {
	const out = [];
	const walk = async (d) => {
		for (const e of await readdir(d, { withFileTypes: true }).catch(() => [])) {
			const f = path.join(d, e.name);
			if (e.isDirectory()) await walk(f);
			else if (e.name.endsWith(".apk")) out.push(f);
		}
	};
	const st = await stat(target).catch(() => null);
	if (!st) return out;
	if (st.isDirectory()) await walk(target);
	else out.push(target);
	return out;
}

async function checkApk(file, fps) {
	const buf = await readFile(file);
	const mtime = (await stat(file)).mtime.toLocaleString("tr-TR");
	console.log(`\n    ${path.relative(ROOT, file)}  (${(buf.length / 1048576).toFixed(1)} MB, değişme: ${mtime})`);
	const { entries, read } = readZipEntries(buf);
	let banners = 0;
	for (const e of entries) {
		if (!/^res\/.*\.png$/i.test(e.name)) continue;
		let data;
		try {
			data = read(e);
			const m = await sharp(data).metadata();
			if (m.width !== 320 || m.height !== 180) continue;
			banners++;
			const v = fps.get(await pixelHash(data));
			v === variantKey
				? ok(`${e.name}  320x180 → "${v}" banner'ı (güncel)`)
				: v
					? bad(`${e.name}  320x180 → "${v}" varyantının banner'ı (beklenen: "${variantKey}")`)
					: bad(`${e.name}  320x180 → şu anki hiçbir varyantla eşleşmiyor = ESKİ banner`);
		} catch {}
	}
	if (!banners) warn("APK içinde 320x180 PNG bulunamadı (banner pakete girmemiş olabilir)");
}

async function main() {
	console.log(`\n\x1b[1m── Android TV denetimi (varyant: ${variantKey}, kaynak: ${path.relative(ROOT, SRC_DIR)})\x1b[0m`);

	if (!(await exists(ANDROID))) {
		if (process.argv.includes("--apk")) return; // yalnızca APK denetimi isteniyor
		bad("android/ klasörü yok — önce prebuild çalıştırın");
		return;
	}

	// ---- 1) manifest
	console.log("\n\x1b[1mManifest\x1b[0m");
	const manifest = await readFile(path.join(MAIN, "AndroidManifest.xml"), "utf8");
	const appTag = manifest.match(/<application\b[^>]*>/)?.[0];
	const actTag = manifest.match(/<activity\b[^>]*MainActivity[^>]*>/)?.[0];
	const appBanner = attr(appTag, "android:banner");
	const appIcon = attr(appTag, "android:icon");
	const actBanner = attr(actTag, "android:banner");
	const actIcon = attr(actTag, "android:icon");

	console.log(`    <application> banner=${appBanner ?? "—"}  icon=${appIcon ?? "—"}`);
	console.log(`    <activity>    banner=${actBanner ?? "—"}  icon=${actIcon ?? "—"}`);

	appBanner === "@drawable/tv_banner"
		? ok("application android:banner → @drawable/tv_banner")
		: bad(`application android:banner "${appBanner}" — "@drawable/tv_banner" olmalı (başka bir plugin ezmiş olabilir)`);
	if (actBanner) bad(`MainActivity kendi banner'ını tanımlıyor (${actBanner}); launcher activity banner'ını tercih eder`);
	if (/notification_icon/.test(`${appBanner} ${appIcon} ${actBanner} ${actIcon}`))
		bad("manifest notification_icon'a (beyaz 96px siluet) işaret ediyor — banner/icon olarak kullanılmamalı");
	if (!/LEANBACK_LAUNCHER/.test(manifest)) bad("LEANBACK_LAUNCHER kategorisi yok — TV launcher uygulamayı listelemez");
	else ok("LEANBACK_LAUNCHER kategorisi var");

	// ---- 2) applicationId
	try {
		const gradle = await readFile(path.join(ANDROID, "app", "build.gradle"), "utf8");
		const id = gradle.match(/applicationId\s+['"]([^'"]+)['"]/)?.[1];
		console.log(`\n\x1b[1mapplicationId\x1b[0m\n    ${id}`);
		if (id && /[A-Z]/.test(id)) warn("applicationId'de büyük harf var — cihazda eski/farklı paket adıyla kurulu bir kopya olabilir");
	} catch {}

	// ---- 3) tv_banner dosyaları
	console.log("\n\x1b[1mtv_banner.png (res/)\x1b[0m");
	const srcBuf = await readFile(path.join(SRC_DIR, "tv-banner.png"));
	const fps = await variantFingerprints();
	const srcPixel = await pixelHash(srcBuf);
	const srcFile = path.join(SRC_DIR, "tv-banner.png");
	console.log(`    kaynak ${path.relative(ROOT, srcFile)}  (üretim: ${(await stat(srcFile)).mtime.toLocaleString("tr-TR")})`);

	const resDirs = (await readdir(RES)).filter((d) => d.startsWith("drawable"));
	let found = 0;
	for (const d of resDirs) {
		const files = (await readdir(path.join(RES, d))).filter((f) => /^tv_banner\./.test(f));
		for (const f of files) {
			found++;
			const buf = await readFile(path.join(RES, d, f));
			const meta = await sharp(buf).metadata();
			const h = await pixelHash(buf);
			const which = fps.get(h);
			h === srcPixel && meta.width === 320 && meta.height === 180
				? ok(`${d}/${f}  (${meta.width}x${meta.height}) = "${variantKey}" banner'ı`)
				: bad(
						`${d}/${f}  ${which ? `"${which}" varyantının banner'ı (beklenen "${variantKey}" — prebuild yanlış APP_VARIANT ile çalışmış)` : "ESKİ/bilinmeyen banner"}`,
					);
		}
	}
	if (!found) bad("res/ altında tv_banner.png yok — config-tv `androidTVBanner` işlenmemiş (isTV:true ve yol doğru mu?)");

	// ---- 4) tv_icon / ic_launcher
	console.log("\n\x1b[1mtv_icon / ic_launcher\x1b[0m");
	const iconPath = path.join(RES, "drawable", "tv_icon.png");
	if (await exists(iconPath)) {
		const m = await sharp(iconPath).metadata();
		m.width === m.height
			? ok(`drawable/tv_icon.png kare (${m.width}x${m.height})`)
			: bad(`drawable/tv_icon.png kare değil (${m.width}x${m.height}) — androidTVIcon kare bir görsele (icon.png) işaret etmeli`);
	} else warn("drawable/tv_icon.png yok");
	for (const d of (await readdir(RES)).filter((d) => d.startsWith("mipmap"))) {
		const fs = await readdir(path.join(RES, d));
		for (const base of ["ic_launcher", "ic_launcher_round"]) {
			const exts = fs.filter((f) => f.startsWith(`${base}.`)).map((f) => f.split(".").pop());
			if (exts.length > 1) bad(`${d}/${base} birden çok biçimde (${exts.join(", ")}) — duplicate resource / hangisinin seçileceği belirsiz`);
		}
	}

	// ---- 5) çakışan başka kaynaklar
	console.log("\n\x1b[1mÇakışma taraması\x1b[0m");
	const stray = [];
	for (const d of resDirs) {
		for (const f of await readdir(path.join(RES, d))) if (/banner/i.test(f) && !/^tv_banner\./.test(f)) stray.push(`${d}/${f}`);
	}
	stray.length ? warn(`başka banner dosyaları: ${stray.join(", ")}`) : ok("başka banner dosyası yok");
}

async function apkSection() {
	const i = process.argv.indexOf("--apk");
	const target = i > 0 ? process.argv[i + 1] : path.join(ANDROID, "app", "build", "outputs", "apk");
	const apks = await findApks(target ? path.resolve(target) : "");
	console.log("\n\x1b[1mAPK içeriği\x1b[0m");
	if (!apks.length) return warn(`APK bulunamadı (${target}) — --apk <dosya|klasör> verin`);
	const fps = await variantFingerprints();
	for (const f of apks) {
		try {
			await checkApk(f, fps);
		} catch (e) {
			bad(`${f}: ${e.message}`);
		}
	}
}

await main();
await apkSection();
const apkOnly = process.argv.includes("--apk");
console.log(
	fails === 0
		? `\n\x1b[32m${apkOnly ? "Bu APK güncel banner'ı içeriyor. Cihazda hâlâ eskisi görünüyorsa sorun kurulum/launcher önbelleğinde (kaldır → yeniden kur → TV'yi yeniden başlat)." : "android/ ve APK çıktıları güncel. Cihazda hâlâ eskisi görünüyorsa kurulu APK'yı çekip --apk ile denetleyin."}\x1b[0m`
		: `\n\x1b[31m${fails} sorun — yukarıdakilere bakın.\x1b[0m`,
);
process.exit(fails === 0 ? 0 : 1);
