import React, { useMemo } from "react";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { StyleSheet, Text, View } from "react-native";
import TVPressable from "@/components/common/TVPressable";
import { FontFamily, Palette } from "@/constants/theme";

/**
 * Oynatıcı üst bilgi çubuğu (yeni tasarım).
 *
 * Sol: geri düğmesi. Yanında sola hizalı başlık bloğu — 1. satır içerik
 * başlığı + kalite rozeti, altında kaynak/çözünürlük ve codec satırları.
 * Sağ: `VideoPlayer`'ın verdiği ikon düğmeleri.
 *
 * Odak bölgesi: `onFocus` → `onFocusZone("top")`; kumanda bu bardayken
 * sol/sağ odak gezdirmeye gider, sarmaya değil.
 */
export default function PlayerTopBar({
	title,
	subtitle,
	sourceName,
	naturalSize,
	audioInfo,
	seriesLine,
	onClose,
	onAction,
	onFocusZone,
}) {
	// 1. satır: kaynak + çözünürlük
	const line1 = useMemo(() => {
		const res =
			naturalSize?.width && naturalSize?.height
				? `${naturalSize.width}×${naturalSize.height}`
				: null;
		if (sourceName && res) return `${sourceName} - ${res}`;
		return sourceName || res || "";
	}, [sourceName, naturalSize]);

	// 2. satır: codec · dil · kanal · ses codec'i
	const line2 = useMemo(() => {
		const parts = [];
		if (audioInfo?.videoCodec) parts.push(audioInfo.videoCodec);
		if (audioInfo?.language) parts.push(audioInfo.language);
		if (audioInfo?.channels) parts.push(audioInfo.channels);
		if (audioInfo?.audioCodec) parts.push(audioInfo.audioCodec);
		return parts.join(" · ");
	}, [audioInfo]);

	/*
	 * Ana satır: dizi/bölüm bilgisi varsa o, yoksa içerik başlığı, yoksa
	 * altyazı metni. (Başlık hiç çizilmiyordu — kullanıcı şikâyeti.)
	 */
	const mainLine = seriesLine || title || subtitle || "";

	const qualityBadge = useMemo(() => {
		const h = naturalSize?.height;
		if (!h) return null;
		if (h >= 2000) return "4K";
		if (h >= 1000) return "1080p";
		if (h >= 700) return "720p";
		return `${h}p`;
	}, [naturalSize]);

	return (
		<View style={styles.bar} pointerEvents="box-none">
			<TVPressable
				style={styles.backButton}
				focusedStyle={styles.backButtonFocused}
				cancelable={false}
				onFocus={() => onFocusZone?.("top")}
				onBlur={() => onFocusZone?.(null)}
				onPress={onClose}>
				<Ionicons name="chevron-back" size={22} color={Palette.onSurface} />
			</TVPressable>

			<View style={styles.titleBlock} pointerEvents="none">
				<View style={styles.mainRow}>
					{mainLine ? (
						<Text style={styles.mainLine} numberOfLines={1}>
							{mainLine}
						</Text>
					) : null}
					{qualityBadge ? (
						<View style={styles.badge}>
							<Text style={styles.badgeText}>{qualityBadge}</Text>
						</View>
					) : null}
				</View>
				{line1 ? (
					<Text style={styles.line} numberOfLines={1}>
						{line1}
					</Text>
				) : null}
				{line2 ? (
					<Text style={styles.line} numberOfLines={1}>
						{line2}
					</Text>
				) : null}
			</View>

			<View style={styles.actions} pointerEvents="box-none">
				{onAction ? onAction : null}
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	bar: {
		flexDirection: "row",
		alignItems: "center",
		minHeight: 52,
		gap: 10,
		paddingHorizontal: 8,
	},
	backButton: {
		width: 40,
		height: 40,
		flexShrink: 0,
		alignItems: "center",
		justifyContent: "center",
		borderRadius: 20,
		backgroundColor: "rgba(0, 0, 0, 0.45)",
		borderWidth: 2,
		borderColor: "transparent",
	},
	backButtonFocused: {
		borderColor: Palette.primary,
	},
	titleBlock: {
		flex: 1,
		minWidth: 0,
	},
	mainRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
	},
	mainLine: {
		color: Palette.onSurface,
		fontFamily: FontFamily.bold,
		fontSize: 16,
		letterSpacing: -0.2,
		flexShrink: 1,
	},
	badge: {
		paddingHorizontal: 6,
		paddingVertical: 1,
		borderRadius: 5,
		backgroundColor: "rgba(192, 193, 255, 0.18)",
	},
	badgeText: {
		color: Palette.primary,
		fontFamily: FontFamily.bold,
		fontSize: 9,
		letterSpacing: 0.4,
	},
	line: {
		color: Palette.onSurfaceVariant,
		fontFamily: FontFamily.medium,
		fontSize: 11,
		marginTop: 1,
	},
	actions: {
		flexDirection: "row",
		alignItems: "center",
		flexShrink: 0,
		gap: 8,
	},
});
