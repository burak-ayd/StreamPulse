/**
 * Profil Ekranı — Küçük Görsel Atomlar
 *
 * ⚠️ Bu dosyadaki HER rozet "veri yoksa render edilmez" kuralına uyar.
 * Bkz. `src/utils/profileFormat.js` başındaki veri gerçekliği notu:
 * puan / tür / kalite / dublaj alanları veri modelinde YOKTUR.
 * `RatingBadge` ve `QualityBadge` ileride bu alanlar eklendiğinde
 * otomatik olarak görünmeye başlayacak şekilde yazıldı.
 *
 * Tüm renkler `useThemeContext().m3` üzerinden gelir; ekran kodu renk
 * sabitlemez ve açık tema otomatik çalışır.
 */

import { useThemeContext } from "@/context/ThemeContext";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { StyleSheet, Text, View } from "react-native";

/**
 * Kalite rozeti — "4K UHD", "Dolby Atmos", "TR Dublaj".
 *
 * @param {{quality?: string, dub?: string, style?: object, tone?: "tertiary"|"neutral"}} props
 */
export function QualityBadge({ quality, dub, style, tone = "tertiary" }) {
	const { m3 } = useThemeContext();
	const color = tone === "tertiary" ? m3.tertiary : m3.onSurfaceVariant;

	return (
		<>
			{quality ? (
				<View
					style={[
						styles.chip,
						{ backgroundColor: m3.surfaceContainerHighest },
						style,
					]}>
					<Text style={[styles.chipText, { color }]}>{quality}</Text>
				</View>
			) : null}
			{dub ? (
				<View
					style={[
						styles.chip,
						{ backgroundColor: m3.surfaceContainerHighest },
						style,
					]}>
					<Text style={[styles.chipText, { color }]}>{dub}</Text>
				</View>
			) : null}
		</>
	);
}

/**
 * Puan rozeti — ★ 8.9.
 *
 * Şu an `item.rating` alanı olmadığı için pratikte hiç görünmez. Alan
 * eklendiğinde tasarımdaki görünümü birebir verecek.
 *
 * @param {{rating?: number|string, style?: object}} props
 */
export function RatingBadge({ rating, style }) {
	const { m3 } = useThemeContext();

	if (rating === undefined || rating === null || rating === "") return null;

	return (
		<View
			style={[
				styles.ratingPill,
				{ backgroundColor: "rgba(11,14,20,0.85)" },
				style,
			]}>
			<Ionicons name="star" size={13} color="#e5a916" />
			<Text style={[styles.ratingText, { color: m3.onSurface }]}>
				{rating}
			</Text>
		</View>
	);
}

/** "Yeni Bölüm" rozeti — `item.isNewEpisode` alanı yoksa render edilmez. */
export function NewEpisodeBadge({ isNew, style }) {
	const { m3 } = useThemeContext();
	if (!isNew) return null;

	return (
		<View
			style={[
				styles.chip,
				{ backgroundColor: m3.primaryContainer },
				style,
			]}>
			<Text style={[styles.chipText, { color: m3.onPrimaryContainer }]}>
				Yeni Bölüm
			</Text>
		</View>
	);
}

/** Eklenti adı rozeti — mevcut `plugin` alanından gelir. */
export function PluginBadge({ plugin, style }) {
	const { m3 } = useThemeContext();
	if (!plugin) return null;

	return (
		<View
			style={[
				styles.pluginPill,
				{ backgroundColor: "rgba(11,14,20,0.82)" },
				style,
			]}>
			<Text style={[styles.pluginText, { color: m3.tertiary }]}>
				{plugin}
			</Text>
		</View>
	);
}

/** Ayraç noktası — meta satırında "Film • 2023" arası. */
export function Dot({ color }) {
	return <View style={[styles.dot, { backgroundColor: color }]} />;
}

/**
 * Boş durum.
 * @param {{icon?: string, title: string, subtitle?: string}} props
 */
export function EmptyState({ icon = "file-tray-outline", title, subtitle }) {
	const { m3 } = useThemeContext();

	return (
		<View style={styles.empty}>
			<View
				style={[
					styles.emptyIcon,
					{ backgroundColor: m3.surfaceContainer },
				]}>
				<Ionicons name={icon} size={26} color={m3.onSurfaceVariant} />
			</View>
			<Text style={[styles.emptyTitle, { color: m3.onSurface }]}>
				{title}
			</Text>
			{subtitle ? (
				<Text style={[styles.emptySubtitle, { color: m3.onSurfaceVariant }]}>
					{subtitle}
				</Text>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	chip: {
		borderRadius: 6,
		paddingHorizontal: 6,
		paddingVertical: 2,
		alignSelf: "flex-start",
	},
	chipText: {
		fontSize: 10,
		lineHeight: 12,
		fontWeight: "700",
		letterSpacing: 0.2,
	},
	ratingPill: {
		flexDirection: "row",
		alignItems: "center",
		gap: 3,
		paddingHorizontal: 6,
		paddingVertical: 2,
		borderRadius: 6,
	},
	ratingText: {
		fontSize: 10,
		lineHeight: 12,
		fontWeight: "700",
	},
	pluginPill: {
		paddingHorizontal: 6,
		paddingVertical: 2,
		borderRadius: 4,
		maxWidth: "85%",
	},
	pluginText: {
		fontSize: 9,
		lineHeight: 12,
		fontWeight: "700",
		letterSpacing: 0.3,
	},
	dot: {
		width: 3,
		height: 3,
		borderRadius: 2,
	},
	empty: {
		alignItems: "center",
		justifyContent: "center",
		paddingVertical: 48,
		gap: 10,
	},
	emptyIcon: {
		width: 56,
		height: 56,
		borderRadius: 28,
		alignItems: "center",
		justifyContent: "center",
	},
	emptyTitle: {
		fontSize: 15,
		lineHeight: 20,
		fontWeight: "600",
		textAlign: "center",
	},
	emptySubtitle: {
		fontSize: 13,
		lineHeight: 18,
		textAlign: "center",
		paddingHorizontal: 32,
	},
});
