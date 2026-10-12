/**
 * StreamPulse — Brand Asset Generator
 * -----------------------------------
 * `brand.mjs` içindeki "Neon Play" tasarımını üç varyant (release / preview / dev) için
 * gereken TÜM ikon, splash, favicon, bildirim ve TV asset'larını üretir.
 *
 *   node scripts/generate-icons/generate.mjs                  # tüm varyantlar
 *   node scripts/generate-icons/generate.mjs release          # tek varyant
 *
 * Çıktı: assets/icons/<variant>/...
 * Manifest: assets/icons/manifest.json
 */

import sharp from "sharp";
import { mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";

import {
	VARIANTS,
	setVariant,
	masterSvg,
	adaptiveForegroundSvg,
	adaptiveBackgroundSvg,
	monochromeSvg,
	splashSvg,
	compactSvg,
	notificationSvg,
	tvSvg,
	bannerSvg,
} from "./brand.mjs";

const ROOT = process.cwd();
const ICONS_ROOT = path.join(ROOT, "assets", "icons");
const MANIFEST = path.join(ICONS_ROOT, "manifest.json");

// ------------------------------------------------------------------ outputs
/** [dosya adı, svg üretici, hedef genişlik, hedef yükseklik, opak mı?] */
function outputList() {
	return [
		// iOS / temel master — tam kare, opak, maskesiz
		{ file: "icon.png", svg: masterSvg, w: 1024, h: 1024, opaque: true },
		// Android adaptive icon üçlüsü
		{ file: "icon-adaptive-foreground.png", svg: adaptiveForegroundSvg, w: 1024, h: 1024 },
		{ file: "icon-adaptive-background.png", svg: adaptiveBackgroundSvg, w: 1024, h: 1024, opaque: true },
		{ file: "icon-adaptive-monochrome.png", svg: monochromeSvg, w: 1024, h: 1024 },
		// Splash — şeffaf zemin; plugin `imageWidth` ile ölçekler, background color konfigden gelir
		{ file: "splash-icon.png", svg: splashSvg, w: 1024, h: 1024 },
		// Bildirim — tam beyaz, şeffaf, 96x96 (expo-notifications standardı)
		{ file: "notification-icon.png", svg: notificationSvg, w: 96, h: 96 },
	];
}

/** tvOS / Android TV: [dosya adı, genişlik, yükseklik, wordmark göster] */
function tvList() {
	return [
		["tv-icon.png", 1280, 768, true],
		["tv-icon-small.png", 400, 240, false],
		["tv-icon-small-2x.png", 800, 480, true],
		["tv-topshelf.png", 1920, 720, true],
		["tv-topshelf-2x.png", 3840, 1440, true],
		["tv-topshelf-wide.png", 2320, 720, true],
		["tv-topshelf-wide-2x.png", 4640, 1440, true],
		["tv-banner.png", 320, 180, false],
	];
}

// ------------------------------------------------------------------ helpers
async function render(svg, file, { w, h, opaque = false } = {}) {
	// Not: `density` bilinçli olarak verilmiyor — SVG width/height zaten piksel boyut,
	// density vermek librsvg'yi devasa ara boyuta ölçekler ve boşuna bellek yer.
	let pipeline = sharp(Buffer.from(svg));
	pipeline = pipeline.resize(w, h, { fit: "fill" });
	if (opaque) pipeline = pipeline.flatten({ background: { r: 6, g: 8, b: 13 } });
	const buf = await pipeline.png({ compressionLevel: 9, palette: false }).toBuffer();
	await writeFile(file, buf);
	const meta = await sharp(buf).metadata();
	return { bytes: buf.length, width: meta.width, height: meta.height, alpha: meta.hasAlpha };
}

/** <16px'te neon bloom şekli bozduğu için favicon ayrı üretilir (compactSvg). */
async function renderFavicons(dir, id) {
	const svg = compactSvg(id);
	// favicon.png = kanonik 48px (app.json/web.favicon bunu gösterir)
	const sizes = [
		[48, "favicon.png"],
		[48, "favicon-48.png"],
		[32, "favicon-32.png"],
		[16, "favicon-16.png"],
	];
	const files = {};

	for (const [s, file] of sizes) {
		const abs = path.join(dir, file);
		await sharp(Buffer.from(svg), { limitInputPixels: false })
			.resize(s, s, { fit: "cover", kernel: "lanczos3" })
			.png({ compressionLevel: 9 })
			.toFile(abs);
		files[file] = path.relative(ICONS_ROOT, abs).replace(/\\/g, "/");
	}

	// favicon.ico — 16/32/48 PNG gömülü tek dosya (tarayıcıların tercih ettiği format)
	const icoSources = [
		["favicon-48.png", 48],
		["favicon-32.png", 32],
		["favicon-16.png", 16],
	];
	const icoBuffers = await Promise.all(icoSources.map(([f]) => sharp(path.join(dir, f)).png().toBuffer()));
	const count = icoBuffers.length;
	const header = Buffer.alloc(6);
	header.writeUInt16LE(0, 0);
	header.writeUInt16LE(1, 2);
	header.writeUInt16LE(count, 4);
	let offset = 6 + 16 * count;
	const entries = [];
	const bodies = [];
	icoBuffers.forEach((data, i) => {
		const size = icoSources[i][1];
		const e = Buffer.alloc(16);
		e.writeUInt8(size, 0);
		e.writeUInt8(size, 1);
		e.writeUInt8(0, 2);
		e.writeUInt8(0, 3);
		e.writeUInt16LE(1, 4);
		e.writeUInt16LE(32, 6);
		e.writeUInt32LE(data.length, 8);
		e.writeUInt32LE(offset, 12);
		entries.push(e);
		bodies.push(data);
		offset += data.length;
	});
	const icoPath = path.join(dir, "favicon.ico");
	await writeFile(icoPath, Buffer.concat([header, ...entries, ...bodies]));
	files["favicon.ico"] = path.relative(ICONS_ROOT, icoPath).replace(/\\/g, "/");
	return files;
}

// ------------------------------------------------------------------ main
async function generateVariant(key) {
	const v = setVariant(key);
	const dir = path.join(ICONS_ROOT, v.dir);
	await mkdir(dir, { recursive: true });

	const id = v.dir; // svg id prefix — dosya başına çakışmaz
	const manifest = {};

	for (const o of outputList()) {
		const file = path.join(dir, o.file);
		const info = await render(o.svg(id), file, { w: o.w, h: o.h, opaque: o.opaque });
		manifest[o.file] = {
			width: info.width,
			height: info.height,
			alpha: info.alpha,
			bytes: info.bytes,
		};
		if (o.opaque && info.alpha) {
			throw new Error(`${v.dir}/${o.file} opak olmalı (alpha kanalı var) — iOS App Store bunu reddeder`);
		}
	}

	Object.assign(manifest, await renderFavicons(dir, id));

	for (const [file, w, h, showName] of tvList()) {
		const f = path.join(dir, file);
		// Android TV banner'ı yatay kilit (marka + wordmark) olarak ayrı üretilir
		const svg = file === "tv-banner.png" ? bannerSvg(id, w, h) : tvSvg(id, w, h, { showName });
		const info = await render(svg, f, { w, h, opaque: true });
		manifest[file] = { width: info.width, height: info.height, alpha: info.alpha, bytes: info.bytes };
	}

	return manifest;
}

async function main() {
	const args = process.argv.slice(2).filter((a) => !a.startsWith("-"));
	const keys = args.length ? args : Object.keys(VARIANTS);
	for (const k of keys) {
		if (!VARIANTS[k]) throw new Error(`Bilinmeyen varyant "${k}". Geçerli: ${Object.keys(VARIANTS).join(", ")}`);
	}

	await mkdir(ICONS_ROOT, { recursive: true });
	const out = {};
	for (const k of keys) {
		const t = Date.now();
		out[k] = await generateVariant(k);
		const total = Object.values(out[k]).reduce((s, m) => s + (typeof m === "object" ? m.bytes : 0), 0);
		console.log(
			`[icons] ${k.padEnd(8)} → ${Object.keys(out[k]).length} dosya, ${total.toLocaleString("de-DE")} bayt (${Date.now() - t}ms)`,
		);
	}
	await writeFile(MANIFEST, `${JSON.stringify({ generatedAt: new Date().toISOString(), variants: out }, null, 2)}\n`);
	console.log(`[icons] manifest → ${path.relative(ROOT, MANIFEST)}`);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
