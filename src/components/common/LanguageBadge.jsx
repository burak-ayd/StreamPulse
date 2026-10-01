import { useLanguageDisplay } from "@/context/LanguageDisplayContext";
import { formatLanguageBadge, formatLanguageDetailed } from "@/utils/formatters";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

/**
 * Reusable Closed Caption (CC) Box
 */
function CCBadge({ size = "small" }) {
	const isSmall = size === "small";
	return (
		<View style={[styles.ccBox, isSmall && styles.ccBoxSmall]}>
			<Text style={[styles.ccText, isSmall && styles.ccTextSmall]}>CC</Text>
		</View>
	);
}

/**
 * LanguageBadge Component
 * Supports 3 modes from user settings:
 * 1. "icon": Only icons (🇹🇷 [CC] or [CC] or 🇹🇷)
 * 2. "icon_text": Icons + Text (🇹🇷 [CC] Dublaj & Altyazılı)
 * 3. "text": Only Text (Dublaj & Altyazılı / DUB • ALT)
 */
export default function LanguageBadge({
	language,
	size = "small", // "small" for cards, "normal" for HeroBanner
	mode: overrideMode,
	style,
	textStyle,
}) {
	const { languageDisplayMode } = useLanguageDisplay();
	const activeMode = overrideMode || languageDisplayMode || "icon";

	if (!language) return null;

	const isSmall = size === "small";

	// Convert raw language to string
	let rawStr = "";
	if (Array.isArray(language)) {
		rawStr = language
			.map((item) =>
				typeof item === "string"
					? item
					: item?.name || item?.language || item?.title || "",
			)
			.filter(Boolean)
			.join(" ");
	} else if (typeof language === "object") {
		rawStr =
			language.name ||
			language.language ||
			language.title ||
			language.code ||
			"";
	} else {
		rawStr = String(language);
	}

	const trimmed = rawStr.trim();
	if (!trimmed) return null;

	const lower = trimmed.toLowerCase();

	const hasDub = lower.includes("dublaj") || lower.includes("dub");
	const hasSub =
		lower.includes("altyazı") ||
		lower.includes("altyazi") ||
		lower === "altyazi" ||
		lower === "altyazı" ||
		lower.includes("sub");
	const isDual = lower.includes("dual");

	// Determine country flag if applicable
	let flag = null;
	if (
		hasDub ||
		isDual ||
		lower.includes("türk") ||
		lower === "tr" ||
		lower === "tur"
	) {
		flag = "🇹🇷";
	} else if (
		lower.includes("ingiliz") ||
		lower.includes("english") ||
		lower === "en" ||
		lower === "eng"
	) {
		flag = "🇬🇧";
	} else if (
		lower.includes("alman") ||
		lower.includes("german") ||
		lower === "de"
	) {
		flag = "🇩🇪";
	} else if (
		lower.includes("fransız") ||
		lower.includes("french") ||
		lower === "fr"
	) {
		flag = "🇫🇷";
	} else if (
		lower.includes("japon") ||
		lower.includes("japanese") ||
		lower === "ja"
	) {
		flag = "🇯🇵";
	} else if (
		lower.includes("kore") ||
		lower.includes("korean") ||
		lower === "ko"
	) {
		flag = "🇰🇷";
	}

	const showCC = hasSub || isDual;
	const showFlag = Boolean(flag) && (hasDub || isDual || (!hasSub && !hasDub));
	const showGlobe = !showFlag && !showCC;

	// Formatted text
	const badgeText = isSmall
		? formatLanguageBadge(language)
		: formatLanguageDetailed(language);

	return (
		<View
			style={[
				styles.container,
				isSmall ? styles.containerSmall : styles.containerNormal,
				style,
			]}>
			{/* ICON SECTION */}
			{activeMode !== "text" && (
				<View style={styles.iconRow}>
					{showFlag && (
						<Text style={isSmall ? styles.flagSmall : styles.flagNormal}>
							{flag}
						</Text>
					)}
					{showCC && <CCBadge size={size} />}
					{showGlobe && (
						<Ionicons
							name="globe-outline"
							size={isSmall ? 9 : 12}
							color="#93C5FD"
						/>
					)}
				</View>
			)}

			{/* TEXT SECTION */}
			{activeMode !== "icon" && Boolean(badgeText) && (
				<Text
					style={[
						styles.text,
						isSmall ? styles.textSmall : styles.textNormal,
						textStyle,
					]}
					numberOfLines={1}>
					{badgeText}
				</Text>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: "rgba(13, 17, 23, 0.88)",
		borderWidth: 1,
		borderColor: "rgba(59, 130, 246, 0.35)",
	},
	containerSmall: {
		paddingHorizontal: 4.5,
		paddingVertical: 2,
		borderRadius: 6,
		gap: 3.5,
		maxWidth: 85,
	},
	containerNormal: {
		paddingHorizontal: 9,
		paddingVertical: 3,
		borderRadius: 12,
		gap: 5.5,
		maxWidth: 240,
	},
	iconRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 3.5,
	},
	flagSmall: {
		fontSize: 10,
		lineHeight: 12,
	},
	flagNormal: {
		fontSize: 13,
		lineHeight: 15,
	},
	ccBox: {
		backgroundColor: "#374151",
		borderRadius: 3,
		paddingHorizontal: 3,
		paddingVertical: 0.5,
		borderWidth: 0.6,
		borderColor: "rgba(255, 255, 255, 0.28)",
		justifyContent: "center",
		alignItems: "center",
	},
	ccBoxSmall: {
		paddingHorizontal: 2.5,
		paddingVertical: 0.5,
		borderRadius: 2.5,
	},
	ccText: {
		color: "#E5E7EB",
		fontSize: 9,
		fontWeight: "900",
		letterSpacing: -0.3,
		lineHeight: 11,
	},
	ccTextSmall: {
		fontSize: 7.5,
		lineHeight: 9,
		fontWeight: "800",
	},
	text: {
		color: "#93C5FD",
		fontWeight: "600",
	},
	textSmall: {
		fontSize: 8.5,
		fontWeight: "700",
		letterSpacing: 0.2,
	},
	textNormal: {
		fontSize: 11,
		fontWeight: "600",
		letterSpacing: 0.2,
	},
});
