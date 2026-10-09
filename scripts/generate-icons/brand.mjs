/**
 * StreamPulse — Brand Definition (single source of truth)
 * ---------------------------------
 * "Neon Play" konsepti: koyu lacivert zemin, neon kırmızı yuvarlatılmış play üçgeni,
 * camgöbeği nabız noktası. Üç varyant (release / preview / dev) yalnızca aksan rengi
 * ve zemin tonuyla ayrışır — marka şekli her zaman birebir aynı kalır.
 *
 * Tüm içerik Android adaptive icon güvenli dairesinin (108dp içinde 66dp ≈ %66) içinde
 * çizilir; bu sayede tek tasarım hem iOS kare maskeye hem Android adaptive maskeley'e uyar.
 */

const SIZE = 1024;
const CX = SIZE / 2;
const CY = SIZE / 2;

// ---------------------------------------------------------------- accent system
export const VARIANTS = {
	release: {
		name: "Stream Pulse",
		label: null,
		accent: "#22D3EE",
		accentSoft: [34, 211, 238, 0.16],
		bgTop: "#1B2434",
		bgBottom: "#06080D",
		dir: "release",
	},
	preview: {
		name: "Stream Pulse",
		label: "PREVIEW",
		accent: "#A78BFA",
		accentSoft: [167, 139, 250, 0.16],
		bgTop: "#1F1B36",
		bgBottom: "#08060D",
		dir: "preview",
	},
	dev: {
		name: "Stream Pulse",
		label: "DEV",
		accent: "#FFB020",
		accentSoft: [255, 176, 32, 0.16],
		bgTop: "#231E14",
		bgBottom: "#0B0804",
		dir: "dev",
	},
};

export const VARIANT_ENV = { development: "dev", dev: "dev", preview: "preview", release: "release", production: "release" };

// ---------------------------------------------------------------- geometry
/** Play üçgeni. stroke-linejoin:round + kalın stroke → yuvarlatılmış köşeler. */
const TRI = [
	[248, 240],
	[248, 784],
	[792, 512],
];
const TRI_STROKE = 72;
/** Görsel bbox = 616px (1024'ün %60) → güvenli daire (676px) içinde. */
const DOT = { cx: 676, cy: 292, r: 54 };

const TRI_PATH = TRI.map((p) => p.join(",")).join(" ");

// ---------------------------------------------------------------- svg helpers
function polar(cx, cy, r, deg) {
	const a = (deg * Math.PI) / 180;
	return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}
function arc(cx, cy, r, a0, a1, steps = 96) {
	const pts = [];
	for (let i = 0; i <= steps; i++) {
		const t = a0 + ((a1 - a0) * i) / steps;
		pts.push(polar(cx, cy, r, t).map((v) => v.toFixed(2)).join(" "));
	}
	return "M " + pts.join(" L ");
}
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Marka için gradient + filter tanımları (her render'da tekrar edilir — id'ler prefix'li çakışmaz). */
export function markGradDefs(id) {
	return `
    <linearGradient id="${id}-tri" x1="0.2" y1="0" x2="0.85" y2="1">
      <stop offset="0" stop-color="#FFF1F3"/>
      <stop offset="0.38" stop-color="#FF5C6C"/>
      <stop offset="1" stop-color="#FF2D55"/>
    </linearGradient>
    <linearGradient id="${id}-sheen" x1="0" y1="0" x2="0.25" y2="1">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.75"/>
      <stop offset="0.6" stop-color="#FFFFFF" stop-opacity="0.05"/>
      <stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
    </linearGradient>
    <filter id="${id}-b1" x="-70%" y="-70%" width="240%" height="240%"><feGaussianBlur stdDeviation="22"/></filter>
    <filter id="${id}-b2" x="-90%" y="-90%" width="280%" height="280%"><feGaussianBlur stdDeviation="58"/></filter>
    <filter id="${id}-b3" x="-70%" y="-70%" width="240%" height="240%"><feGaussianBlur stdDeviation="12"/></filter>`;
}

// ---------------------------------------------------------------- mark group
/**
 * Sadece markayı çizer (arka plan YOK) — 1024 koordinat sisteminde.
 * adaptive foreground, monochrome, tv* ve splash bu grubu kullanır.
 */
export function markGroup(id, { glow = true, mono = false } = {}) {
	const tri = mono
		? `<polygon points="${TRI_PATH}" fill="#FFFFFF"/>`
		: `<polygon points="${TRI_PATH}" fill="url(#${id}-tri)" stroke="url(#${id}-tri)" stroke-width="${TRI_STROKE}" stroke-linejoin="round" stroke-linecap="round"/>`;
	const sheen = mono
		? ""
		: `<path d="${TRI_PATH} Z" fill="url(#${id}-sheen)" opacity="0.55"/>`;
	const dot = mono ? `<circle cx="${DOT.cx}" cy="${DOT.cy}" r="${DOT.r}" fill="#FFFFFF"/>` : dotSvg(id);
	const glows = glow && !mono ? bloomSvg(id) : "";
	return `${glows}
    <g>${tri}${sheen}</g>
    ${dot}`;
}

function dotSvg(id) {
	const v = CURRENT;
	return `<!-- nabız noktası -->
    <g filter="url(#${id}-b3)" opacity="0.75"><circle cx="${DOT.cx}" cy="${DOT.cy}" r="${DOT.r - 4}" fill="${v.accent}"/></g>
    <circle cx="${DOT.cx}" cy="${DOT.cy}" r="${DOT.r}" fill="${v.accent}"/>
    <circle cx="${DOT.cx - 16}" cy="${DOT.cy - 18}" r="19" fill="#FFFFFF" opacity="0.3"/>`;
}

function bloomSvg(id) {
	return `<!-- dış bloom: küçük boyutta şekli bozmaması için kasıtlı olarak zayıf -->
    <g filter="url(#${id}-b2)" opacity="0.34">
      <polygon points="${TRI_PATH}" fill="url(#${id}-tri)" stroke="url(#${id}-tri)" stroke-width="${TRI_STROKE}" stroke-linejoin="round"/>
    </g>
    <g filter="url(#${id}-b1)" opacity="0.5">
      <polygon points="${TRI_PATH}" fill="url(#${id}-tri)" stroke="url(#${id}-tri)" stroke-width="${TRI_STROKE}" stroke-linejoin="round"/>
    </g>`;
}

// ---------------------------------------------------------------- backgrounds
export function backgroundGroup(id) {
	const v = CURRENT;
	return `
  <defs>
    <linearGradient id="${id}-bg" x1="0" y1="0" x2="0.9" y2="1">
      <stop offset="0" stop-color="${v.bgTop}"/>
      <stop offset="1" stop-color="${v.bgBottom}"/>
    </linearGradient>
    <radialGradient id="${id}-halo" cx="0.5" cy="0.22" r="0.85">
      <stop offset="0" stop-color="${v.accent}" stop-opacity="0.11"/>
      <stop offset="1" stop-color="${v.accent}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect x="0" y="0" width="${SIZE}" height="${SIZE}" fill="url(#${id}-bg)"/>
  <rect x="0" y="0" width="${SIZE}" height="${SIZE}" fill="url(#${id}-halo)"/>`;
}

/** Kenar iç çizgisi — iOS maskesinin hemen içinde kalan ince ışık hattı. */
export function innerStroke(id) {
	return `<rect x="4" y="4" width="${SIZE - 8}" height="${SIZE - 8}" rx="220" fill="none" stroke="#FFFFFF" stroke-opacity="0.10" stroke-width="3"/>`;
}

// ---------------------------------------------------------------- masters
/** iOS / temel master: tam kare, opak, köşe maskesi YOK (işletim sistemi uygular). */
export function masterSvg(id) {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  ${backgroundGroup(id)}
  ${markGradDefs(id)}
  ${markGroup(id, { glow: true })}
  ${innerStroke(id)}
</svg>`;
}

/** Android adaptive foreground: şeffaf zemin, sadece marka, güvenli daire içinde. */
export function adaptiveForegroundSvg(id) {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  ${markGradDefs(id)}
  ${markGroup(id, { glow: true })}
</svg>`;
}

/** Android adaptive background: opak degrade zemin. */
export function adaptiveBackgroundSvg(id) {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  ${backgroundGroup(id)}
</svg>`;
}

/** Android 13+ themed/monochrome icon: beyaz siluet, şeffaf zemin, glow yok. */
export function monochromeSvg(id) {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  ${markGradDefs(id)}
  ${markGroup(id, { glow: false, mono: true })}
</svg>`;
}

/**
 * Splash: şeffaf zemin üzerinde marka + wordmark.
 * expo-splash-screen plugin'i `imageWidth` ile bu kareyi ortalar; backgroundColor senin koyu rengin.
 */
export function splashSvg(id) {
	const v = CURRENT;
	const markScale = 0.58;
	const markCy = 392;
	const label = v.label
		? `<text x="${CX}" y="872" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="54" font-weight="700"
           letter-spacing="10" fill="${v.accent}" text-anchor="middle">${esc(v.label)}</text>`
		: "";
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  ${markGradDefs(id)}
  <g transform="translate(${CX} ${markCy}) scale(${markScale}) translate(${-CX} ${-CY})">
    ${markGroup(id, { glow: true })}
  </g>
  <text x="${CX}" y="730" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="112" font-weight="800"
        letter-spacing="14" fill="#EAF0FA" text-anchor="middle">STREAM PULSE</text>
  <rect x="${CX - 130}" y="772" width="260" height="6" rx="3" fill="${v.accent}" opacity="0.9"/>
  ${label}
</svg>`;
}

/**
 * Compact / küçük boyut (favicon): düz zemin + minimal glow.
 * 16-32px'te neon bloom şekle yem oluyor; bu varyant kasıtlı olarak "sertleştirilmiş".
 */
export function compactSvg(id) {
	const v = CURRENT;
	const s = 1.1; // küçük boyutta marka daha büyük görünmeli
	return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="${id}-cbg" x1="0" y1="0" x2="0.9" y2="1">
      <stop offset="0" stop-color="#111823"/>
      <stop offset="1" stop-color="#05070B"/>
    </linearGradient>
    <linearGradient id="${id}-tri" x1="0.2" y1="0" x2="0.85" y2="1">
      <stop offset="0" stop-color="#FFF1F3"/>
      <stop offset="0.38" stop-color="#FF5C6C"/>
      <stop offset="1" stop-color="#FF2D55"/>
    </linearGradient>
    <filter id="${id}-cf" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="6"/></filter>
  </defs>
  <rect x="0" y="0" width="512" height="512" fill="url(#${id}-cbg)"/>
  <g transform="translate(256 256) scale(${s / 2}) translate(-512 -512)">
    <g filter="url(#${id}-cf)" opacity="0.28">
      <polygon points="${TRI_PATH}" fill="url(#${id}-tri)" stroke="url(#${id}-tri)" stroke-width="${TRI_STROKE}" stroke-linejoin="round"/>
    </g>
    <polygon points="${TRI_PATH}" fill="url(#${id}-tri)" stroke="url(#${id}-tri)" stroke-width="${TRI_STROKE}" stroke-linejoin="round"/>
    <circle cx="${DOT.cx}" cy="${DOT.cy}" r="${DOT.r}" fill="${v.accent}"/>
  </g>
</svg>`;
}

/** Bildirim ikonu: tam beyaz, şeffaf zemin, 96x96 (expo-notifications plugin standardı). */
export function notificationSvg(id) {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
  <g transform="translate(48 48) scale(0.09375) translate(-512 -512)">
    <polygon points="${TRI_PATH}" fill="#FFFFFF"/>
    <circle cx="${DOT.cx}" cy="${DOT.cy}" r="${DOT.r}" fill="#FFFFFF"/>
  </g>
</svg>`;
}

// ---------------------------------------------------------------- TV / banner
/**
 * tvOS / Android TV asset'ları: tam kaplama koyu zemin + ortalanmış marka.
 * `w`/`h` oranına göre marka ölçeklenir, böylece squash olmaz.
 */
export function tvSvg(id, w, h, { showName = false } = {}) {
	const v = CURRENT;
	const s = Math.min(w, h) / SIZE;
	const cx = w / 2;
	const cy = h / 2 + (showName ? -24 : 0);
	const name = showName
		? `<text x="${cx}" y="${h - 44}" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="${Math.round(Math.min(w, h) * 0.11)}"
              font-weight="800" letter-spacing="${Math.round(Math.min(w, h) * 0.02)}" fill="#EAF0FA" text-anchor="middle">STREAM PULSE</text>`
		: "";
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="${id}-tbg" x1="0" y1="0" x2="0.9" y2="1">
      <stop offset="0" stop-color="${v.bgTop}"/>
      <stop offset="1" stop-color="${v.bgBottom}"/>
    </linearGradient>
    <radialGradient id="${id}-th" cx="0.5" cy="0.5" r="0.7">
      <stop offset="0" stop-color="${v.accent}" stop-opacity="0.10"/>
      <stop offset="1" stop-color="${v.accent}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect x="0" y="0" width="${w}" height="${h}" fill="url(#${id}-tbg)"/>
  <rect x="0" y="0" width="${w}" height="${h}" fill="url(#${id}-th)"/>
  <g transform="translate(${cx} ${cy}) scale(${s}) translate(${-CX} ${-CY})">
    ${markGroup(id, { glow: true })}
  </g>
  ${name}
</svg>`;
}

// ---------------------------------------------------------------- RUNTIME LINK
// brand.mjs "CURRENT" üzerinden tek seferlik aktif varyant alır; generate.mjs bunu set eder.
export let CURRENT = VARIANTS.release;
export function setVariant(key) {
	if (!VARIANTS[key]) throw new Error(`Bilinmeyen varyant: ${key} (${Object.keys(VARIANTS).join(", ")})`);
	CURRENT = VARIANTS[key];
	return CURRENT;
}

// ---------------------------------------------------------------- exports for callers
export const GEO = { SIZE, TRI, TRI_STROKE, DOT, arc, polar };
