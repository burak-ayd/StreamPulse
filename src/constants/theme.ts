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
