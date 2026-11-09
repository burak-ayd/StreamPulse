/**
 * ── subtitle-style ────────────────────────────────────────────
 *
 * Gömülü (container içi) altyazıların görünümünü uygulama ayarlarına
 * göre boyar. `react-native-video` gömülü altyazıları ExoPlayer'ın
 * `SubtitleView`'ında çizer ve renk/arka planı sistem stili belirler;
 * native modül (bkz. android/…/SubtitleStyleModule.kt) o görünümü
 * bulup `CaptionStyleCompat` uygular.
 *
 * ⚠️ Bu modül Android'e özeldir. Diğer platformlarda `applySubtitleStyle`
 * sessizce `false` döner.
 */
import { requireOptionalNativeModule } from "expo-modules-core";

const SubtitleStyle = requireOptionalNativeModule("SubtitleStyle");

export type NativeSubtitleStyle = {
	/** Metin rengi (#RRGGBB / #AARRGGBB). */
	color?: string;
	/** Arka plan rengi (#AARRGGBB; saydam için #00000000). */
	backgroundColor?: string;
	/** Kontur rengi (#AARRGGBB). */
	edgeColor?: string;
	/** Kontur/gölge açık mı. */
	textShadow?: boolean;
	/** Yazı boyutu (sp). */
	fontSize?: number;
	/** 0..1 görünürlük. */
	opacity?: number;
};

/**
 * Stili oynatıcıdaki gömülü altyazı görünümüne uygular.
 *
 * @returns {boolean} true → çağrı kabul edildi (görünüm henüz yoksa da
 *   modül bir sonraki çağrıda uygular). Modül yoksa false.
 */
export function applySubtitleStyle(style: NativeSubtitleStyle): boolean {
	if (!SubtitleStyle) return false;
	try {
		return Boolean(SubtitleStyle.apply(style));
	} catch {
		return false;
	}
}
