// src/constants/theme.ts
import { Platform } from "react-native";

export const Colors = {
	light: {
		primary: "#E50914",
		bg: "#F8FAFC",
		cardBg: "#ffffff",
		surface: "#ffffff",
		surfaceBorder: "#E2E8F0",
		text: "#111827",
		textSecondary: "#64748b",
		border: "#E2E8F0",
	},
	dark: {
		primary: "#E50914",
		bg: "#0B0E14",
		cardBg: "#161B24",
		surface: "#161B24",
		surfaceBorder: "#232A36",
		text: "#ffffff",
		textSecondary: "#94a3b8",
		border: "#232A36",
	},
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

/**
 * Material 3 yüzey rampası — profil ekranı ve diğer "modern" ekranlar için.
 *
 * ⚠️ `Colors` içindeki `cardBg` / `text` / `textSecondary` eski ekranların
 * kullandığı yaklaşık değerlerdir ve **dokunulmamalıdır** (21 ekran onları
 * okuyor). Yeni tasarım dili M3 tonal rampasını kullanır; ekranlar
 * `colors.surfaceContainerHigh` gibi yeni anahtarları tercih etmelidir.
 *
 * Koyu değerler referans tasarımdan birebir alınmıştır. Açık değerler aynı
 * rampanın açık tonlarıdır (M3'in kuralı: koyu tema = koyu tonlar, açık tema =
 * açık tonlar).
 */
export const ColorsM3 = {
	light: {
		/** primary-container — StreamPulse kırmızısı. Ana vurgu rengi. */
		primaryContainer: "#E50914",
		onPrimaryContainer: "#FFFFFF",
		/** primary — M3'in "marka tonu" (tema tint'i) */
		primary: "#B3261E",
		onPrimary: "#FFFFFF",
		/** tertiary — camsı mavi. Süre,rozet ve ikincil vurgular. */
		tertiary: "#00687A",
		onTertiary: "#FFFFFF",
		/**
		 * Başarı / "senkronizasyon sağlıklı" durumu.
		 *
		 * ⚠️ Material 3'ün rol paletinde "success" diye bir renk YOKTUR; M3
		 * yalnızca primary/secondary/tertiary/error tanır. Bu yüzden burada
		 * uygulamanın zaten kullandığı değer (`#10B981`, eski profil ekranındaki
		 * syncCard) tek kaynak olarak buraya taşındı — böylece profil çerçevesi
		 * ile ayar sayfasındaki "Bağlı" rozeti aynı yeşili gösterir.
		 */
		success: "#059669",
		successSoft: "rgba(16,185,129,0.15)",

		surfaceLowest: "#FFFFFF",
		surfaceLow: "#F7F8FA",
		surface: "#F1F3F6",
		surfaceContainer: "#EBEDF1",
		surfaceContainerHigh: "#E3E5EA",
		surfaceContainerHighest: "#DBDDE3",

		onSurface: "#14161A",
		onSurfaceVariant: "#5A5F68",
		outline: "#8A8F99",
		outlineVariant: "#D5D8DE",
		error: "#BA1A1A",
		scrim: "rgba(0,0,0,0.4)",

		/**
		 * Yükleniyor iskeleti (CloudStream yaklaşımı).
		 *
		 * Düz, ANİMASYONSUZ bloklar. Shimmer/parlama yok: 1080p TV'de
		 * sürekli animasyonlu 40+ blok kare düşürüyor ve kullanıcıya
		 * "içerik geliyor" bilgisinden fazlasını veriyordu.
		 *
		 * `block` = poster/logo/hero gibi büyük yüzeyler,
		 * `line`  = başlık/metin çubukları (bir tık daha koyu).
		 */
		skeletonBlock: "#E9EBF0",
		skeletonLine: "#DCE0E7",
	},
	dark: {
		// ── Referans tasarımdan birebir ──
		primaryContainer: "#e50914",
		onPrimaryContainer: "#fff7f6",
		primary: "#ffb4aa",
		onPrimary: "#690003",
		tertiary: "#4cd7f6",
		onTertiary: "#003640",
		// Yeşil tonları koyu temada açıklaştırılır (kontrast).
		success: "#10b981",
		successSoft: "rgba(16,185,129,0.15)",

		surfaceLowest: "#0b0e14",
		surfaceLow: "#191c22",
		surface: "#10131a",
		surfaceContainer: "#1d2026",
		surfaceContainerHigh: "#272a31",
		surfaceContainerHighest: "#32353c",

		onSurface: "#e1e2eb",
		onSurfaceVariant: "#e9bcb6",
		outline: "#af8782",
		outlineVariant: "#5e3f3b",
		error: "#ffb4ab",
		scrim: "rgba(0,0,0,0.55)",

		// Bkz. light.skeletonBlock notu.
		skeletonBlock: "#1b1d24",
		skeletonLine: "#242730",
	},
} as const;

/** Ekran geneli yatay boşluk (referansta `px-margin` = 1rem). */
export const ScreenGutter = 16;

export const Fonts = Platform.select({
	ios: {
		/** iOS `UIFontDescriptorSystemDesignDefault` */
		sans: "system-ui",
		/** iOS `UIFontDescriptorSystemDesignSerif` */
		serif: "ui-serif",
		/** iOS `UIFontDescriptorSystemDesignRounded` */
		rounded: "ui-rounded",
		/** iOS `UIFontDescriptorSystemDesignMonospaced` */
		mono: "ui-monospace",
	},
	default: {
		sans: "normal",
		serif: "serif",
		rounded: "normal",
		mono: "monospace",
	},
	web: {
		sans: "var(--font-display)",
		serif: "var(--font-serif)",
		rounded: "var(--font-rounded)",
		mono: "var(--font-mono)",
	},
});

export const Spacing = {
	half: 2,
	one: 4,
	two: 8,
	three: 16,
	four: 24,
	five: 32,
	six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
