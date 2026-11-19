/**
 * imageQuality.cardImageUri + kart poster hedefi — çalıştırılabilir kontrol.
 *
 *   node scripts/check-image-quality.mjs
 *
 * NetInfo import'u node'da çözülemediği için kaynak geçici bir .mjs'e
 * kopyalanırken yalnız o satır stub'lanır; geri kalan kod değişmez.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = fs.readFileSync(path.join(root, "src/utils/imageQuality.js"), "utf8");
const patched = src.replace(
	'import NetInfo from "@react-native-community/netinfo";',
	"const NetInfo = { addEventListener: () => () => {}, fetch: async () => ({}) };",
);
const tmp = path.join(os.tmpdir(), `imageQuality-${process.pid}.mjs`);
fs.writeFileSync(tmp, patched);

const { cardImageUri, POSTER_QUALITY_FACTOR } = await import(`file://${tmp}`);
fs.unlinkSync(tmp);

const tmdb = (size) => `https://image.tmdb.org/t/p/${size}/abc123.jpg`;

// 144dp kart, 2× yoğunluk → hedef 216 × 0.6 = 173 px
const rowTarget = 144 * 2 * POSTER_QUALITY_FACTOR;
assert.ok(rowTarget < 185, "satır hedefi w185'in altında olmalı");
assert.equal(cardImageUri(tmdb("w342"), rowTarget), tmdb("w185"));
assert.equal(cardImageUri(tmdb("w780"), rowTarget), tmdb("w185"));
assert.equal(cardImageUri(tmdb("w1280"), rowTarget), tmdb("w185"));

// Mevcut boyuttan BÜYÜĞE çıkılmaz (upscale yok).
assert.equal(cardImageUri(tmdb("w185"), rowTarget), tmdb("w185"));
assert.equal(cardImageUri(tmdb("w300"), 900), tmdb("w300"));

// hdfilmcehennemi @2x → 1x (satır hedefi < 400).
const hdfc = "https://www.hdfilmcehennemi.nl/images/list/poster/x@2x.webp";
assert.equal(cardImageUri(hdfc, rowTarget), hdfc.replace("@2x.", "."));

// Bilinmeyen CDN'e dokunulmaz.
const other = "https://cdn.example.com/p/1.jpg";
assert.equal(cardImageUri(other, rowTarget), other);

// Boş/bozuk girdi aynen döner.
assert.equal(cardImageUri("", rowTarget), "");
assert.equal(cardImageUri(null, rowTarget), null);

console.log(
	`OK — hedef ${Math.round(rowTarget)}px, w342→w185, @2x→1x, factor ${POSTER_QUALITY_FACTOR}`,
);