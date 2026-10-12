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
 * Splash kilidinin güvenli daireye sığdırma ölçeği.
 *
 * ⚠️ NEDEN VAR — Android 12+ (API 31) native splash ikonu ÇEMBER maskeye
 * alır: ikon alanının iç 2/3'ü (yarıçap = 1024/3 ≈ 341px) görünür, dışı
 * KIRPILIR. Bu kilit daha önce tuvalin neredeyse tamamını kaplıyordu
 * (wordmark 36..989, yarıçap ≈ 524px) → telefonda/tablette native splash
 * "REAM PULS" olarak görünüyordu.
 *
 * TV'de aynı PNG maskesiz çizildiği için (native splash hiç açılmaz)
 * kırpılmıyor — yani sorun yalnızca native splash katmanındaydı.
 *
 * Ölçek `markGroup`, wordmark, alt çizgi ve varyant etiketinin TAMAMINI
 * merkez etrafında aynı oranda küçültür: tasarımın oranları birebir korunur,
 * yalnızca güvenli alana oturur. Değer, tuvalde ölçülen en dış içerik
 * yarıçapı (~524px) ile güvenli yarıçapın (341px) oranıdır; 0.63 seçildi
 * ki kenarda birkaç px pay kalsın (yuvarlama/yinelenme payı).
 */
const SPLASH_SAFE_SCALE = 0.63;

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
  <g transform="translate(${CX} ${CY}) scale(${SPLASH_SAFE_SCALE}) translate(${-CX} ${-CY})">
    <g transform="translate(${CX} ${markCy}) scale(${markScale}) translate(${-CX} ${-CY})">
      ${markGroup(id, { glow: true })}
    </g>
    <text x="${CX}" y="730" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="112" font-weight="800"
          letter-spacing="14" fill="#EAF0FA" text-anchor="middle">STREAM PULSE</text>
    <rect x="${CX - 130}" y="772" width="260" height="6" rx="3" fill="${v.accent}" opacity="0.9"/>
    ${label}
  </g>
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
    ${markGradDefs(id)}
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

/**
 * Android TV banner (320x180): yatay kilit — solda marka, sağda iki satır wordmark.
 * Android TV launcher banner'ın altına uygulama adı YAZMAZ; bu yüzden isim banner'ın içinde olmalı.
 * Dev/preview varyantlarda etiket (DEV / PREVIEW) wordmark'ın altına yazılır.
 * Kenarlardan en az ~%8 boşluk bırakılır (launcher focus çerçevesi/overscan kırpmasına karşı).
 */
export function bannerSvg(id, w = 320, h = 180) {
	const v = CURRENT;
	const MARK_BOX = 616; // markanın 1024 sistemindeki görsel kutusu (212..828)
	const markPx = Math.round(h * 0.58); // ~104px
	const s = markPx / MARK_BOX;
	const gap = Math.round(h * 0.09);
	const fs = Math.round(h * 0.165); // wordmark punto
	const ls = Math.round(fs * 0.12);
	// Wordmark genişliği fontlara göre değişir; en kötü durum ~0.78em/harf kabul edilip blok ortalanır.
	const textW = Math.round(6 * (fs * 0.72 + ls));
	const total = markPx + gap + textW;
	const x0 = Math.round((w - total) / 2);
	// 1024 sistemindeki (520,512) marka merkezini kutunun ortasına oturt
	const mcx = x0 + markPx / 2;
	const mcy = h / 2;
	const tx = x0 + markPx + gap;
	const hasLabel = Boolean(v.label);
	const line1 = Math.round(h / 2 - (hasLabel ? fs * 0.55 : fs * 0.15));
	const line2 = line1 + Math.round(fs * 1.12);
	const labelY = line2 + Math.round(fs * 0.95);
	const font = 'font-family="Segoe UI, Helvetica, Arial, sans-serif" font-weight="800"';
	const label = hasLabel
		? `<text x="${tx}" y="${labelY}" ${font} font-size="${Math.round(fs * 0.62)}" letter-spacing="${Math.round(fs * 0.16)}" fill="${v.accent}">${esc(v.label)}</text>`
		: `<rect x="${tx}" y="${line2 + Math.round(fs * 0.4)}" width="${Math.round(fs * 2.2)}" height="${Math.max(2, Math.round(h * 0.014))}" rx="1" fill="${v.accent}" opacity="0.9"/>`;
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    ${markGradDefs(id)}
    <linearGradient id="${id}-bnbg" x1="0" y1="0" x2="0.9" y2="1">
      <stop offset="0" stop-color="${v.bgTop}"/>
      <stop offset="1" stop-color="${v.bgBottom}"/>
    </linearGradient>
    <radialGradient id="${id}-bnh" cx="0.3" cy="0.5" r="0.75">
      <stop offset="0" stop-color="${v.accent}" stop-opacity="0.13"/>
      <stop offset="1" stop-color="${v.accent}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect x="0" y="0" width="${w}" height="${h}" fill="url(#${id}-bnbg)"/>
  <rect x="0" y="0" width="${w}" height="${h}" fill="url(#${id}-bnh)"/>
  <g transform="translate(${mcx} ${mcy}) scale(${s}) translate(-520 -512)">
    ${markGroup(id, { glow: true })}
  </g>
  <text x="${tx}" y="${line1}" ${font} font-size="${fs}" letter-spacing="${ls}" fill="#EAF0FA">STREAM</text>
  <text x="${tx}" y="${line2}" ${font} font-size="${fs}" letter-spacing="${ls}" fill="#EAF0FA">PULSE</text>
  ${label}
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
