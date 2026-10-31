import { FontFamily, Palette } from "@/constants/theme";
import { useTvMetrics } from "@/utils/tvMetrics";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { formatRuntime, formatYear } from "@utils/formatters";
import { StyleSheet, Text, View } from "react-native";

/**
 * Başlığın altındaki tek satırlık künye: "2024 · 2 Sezon · 16+ · Aksiyon / Dram".
 * `content` bir film/dizi detay nesnesi; `genres` ekranda ayrıştırılmış tür
 * listesi (varsa `content.tagline`'a tercih edilir).
 */
export function buildMetaLine({ content, genres = [], seasonCount = 0 }) {
	const parts = [];

	const year = formatYear(content?.release_date);
	if (year !== "N/A") parts.push(year);

	if (seasonCount > 0) {
		parts.push(`${seasonCount} Sezon`);
	} else {
		const runtime = formatRuntime(content?.runtime_minutes);
		if (runtime !== "N/A") parts.push(runtime);
	}

	if (content?.age_rating) parts.push(content.age_rating);

	const turler = genres.length
		? genres
		: content?.tagline
			? [content.tagline]
			: [];
	if (turler.length) parts.push(turler.join(" / "));

	return parts.join(" · ");
}

/**
 * Puan hapı — yıldız + puan. "IMDb" etiketi YOK: puan kaynağı garanti
 * değil, yanıltıcı olurdu.
 */
export function RatingPill({ rating, size = 13 }) {
	const value =
		rating == null
			? null
			: typeof rating === "number"
				? rating.toFixed(1)
				: parseFloat(rating)
					? parseFloat(rating).toFixed(1)
					: null;

	if (!value) return null;

	return (
		<View
			style={[
				styles.ratingPill,
				{ paddingHorizontal: size - 3, paddingVertical: 4 },
			]}>
			<Ionicons name="star" size={size - 1} color={Palette.tertiary} />
			<Text
				style={[
					styles.ratingText,
					{ fontSize: size, color: Palette.tertiary },
				]}>
				{value}
			</Text>
		</View>
	);
}

/**
 * MetadataSection – başlığın altındaki ses/altyazı satırı.
 * Başlık ve künye artık hero'nun içinde (bkz. `HeroSection`); burada
 * tekrarlanmaz, ekranın üstünde gereksiz boşluk kalmaz.
 */
export default function MetadataSection({ content, audioOptions = [] }) {
	const { sp } = useTvMetrics();

	if (!content || audioOptions.length === 0) return null;

	return (
		<View style={[styles.container, { marginBottom: sp(12) }]}>
			<View style={styles.audioRow}>
				<Ionicons
					name="language-outline"
					size={sp(16)}
					color={Palette.secondary}
				/>
				<Text
					style={[styles.audioText, { fontSize: sp(12.5) }]}
					numberOfLines={2}>
					{audioOptions.join(" & ")} Mevcut
				</Text>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {},
	ratingPill: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		borderRadius: 999,
		backgroundColor: Palette.surfaceHigh,
	},
	ratingText: {
		fontFamily: FontFamily.bold,
	},
	audioRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
	},
	audioText: {
		flexShrink: 1,
		color: Palette.onSurfaceVariant,
		fontFamily: FontFamily.regular,
	},
});
