/**
 * StreamPulse — Icon Preview Sheet
 * Üretilmiş varyantları (release / preview / dev) çoklu boyutta yan yana gösterir.
 *   node scripts/generate-icons/preview.mjs
 */
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { VARIANTS } from "./brand.mjs";

const ROOT = process.cwd();
const ICONS_ROOT = path.join(ROOT, "assets", "icons");
const OUT = path.join(ROOT, "assets", "generated", "preview");

const SIZES = [16, 24, 32, 48, 64, 96, 160, 256];
const ROWS = ["release", "preview", "dev"];

const LABEL_W = 232;
const CELL = 300;
const PAD = 24;

async function main() {
	const dirs = [];
	for (const r of ROWS) {
		const dir = path.join(ICONS_ROOT, VARIANTS[r].dir);
		const f = path.join(dir, "icon.png");
		await sharp(f).metadata(); // yoksa hata
		dirs.push({ key: r, name: VARIANTS[r].dir, file: f });
	}

	await mkdir(OUT, { recursive: true });

	const rowH = 256 + 76;
	const sheetW = LABEL_W + SIZES.length * CELL + PAD * 2;
	const sheetH = 78 + ROWS.length * rowH + PAD * 2;

	const layers = [
		{
			input: await textSvg(sheetW, 66, 30, "#7D8BA1", (i) => `${SIZES[i]}`),
			top: 16,
			left: LABEL_W + PAD,
		},
	];

	for (let r = 0; r < dirs.length; r++) {
		const d = dirs[r];
		const y = 74 + r * rowH;
		layers.push({
			input: await textSvgRaw(LABEL_W, rowH, 34, "#E6EDF7", "end", `${d.name}`),
			top: y,
			left: PAD,
		});

		const src = await sharp(d.file).png().toBuffer();
		for (let i = 0; i < SIZES.length; i++) {
			const s = SIZES[i];
			layers.push({
				input: await sharp(src).resize(s, s, { kernel: "lanczos3" }).png().toBuffer(),
				top: y + (rowH - s) / 2,
				left: LABEL_W + PAD + i * CELL + (CELL - s) / 2,
			});
		}
	}

	const sheet = await sharp({
		create: { width: sheetW, height: sheetH, channels: 4, background: "#0B0E14" },
	})
		.composite(layers)
		.png()
		.toBuffer();
	await writeFile(path.join(OUT, "preview.png"), sheet);
	console.log(`[preview] ${path.relative(ROOT, path.join(OUT, "preview.png"))} (${sheetW}x${sheetH})`);

	// Splash (koyu zemin üzerinde)
	const splashDark = await sharp({
		create: { width: 1024, height: 1024, channels: 4, background: "#0B0E14" },
	})
		.composite([{ input: await sharp(path.join(ICONS_ROOT, "preview", "splash-icon.png")).png().toBuffer() }])
		.png()
		.toBuffer();
	await writeFile(path.join(OUT, "splash-preview.png"), splashDark);
	console.log(`[preview] ${path.relative(ROOT, path.join(OUT, "splash-preview.png"))}`);
}

function textSvg(w, h, fs, fill, fn) {
	const t = fn(0);
	return Buffer.from(
		`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><text x="0" y="${fs}" font-family="Segoe UI, Arial" font-size="${fs}" fill="${fill}">${t}</text></svg>`,
	);
}
function textSvgRaw(w, h, fs, fill, anchor, label) {
	return Buffer.from(
		`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><text x="${anchor === "end" ? w - 24 : 24}" y="${h / 2 + 12}" text-anchor="${anchor}" font-family="Segoe UI, Arial" font-size="${fs}" font-weight="700" fill="${fill}">${label}</text></svg>`,
	);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
