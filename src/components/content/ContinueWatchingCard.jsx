import TVPressable from "@/components/common/TVPressable";
import { FontFamily, Palette } from "@/constants/theme";
import { resolvePluginName } from "@/utils/storage";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import Image from "@/components/common/SmartImage";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

/**
 * "İzlemeye Devam Et" kartı — 16:9 yatay küçük resim.
 *
 * Sabit genişlik dışa açılır: satır (`ContinueWatchingSection`) `getItemLayout`
 * adımını buradan türetir, iskelet de aynı sayıyı okur.
 */
export const CONTINUE_CARD_WIDTH = 256;
const THUMB_HEIGHT = CONTINUE_CARD_WIDTH * (9 / 16);

export default function ContinueWatchingCard({
	item,
	onPress,
	onLongPress,
	onRemove,
	/** Odak geri bildirimi — satırı ekranın ortasına taşımak için (sorun 5). */
	onFocus,
}) {
	if (!item) return null;

	const progressPercent = Math.min(
		100,
		Math.max(
			0,
			Math.round(
				(item.progress !== undefined
					? item.progress
					: item.duration > 0
						? item.currentTime / item.duration
						: 0) * 100,
			),
		),
	);

	const posterUri =
		item.poster ||
		item.poster_url ||
		item.backdrop ||
		item.backdrop_url ||
		item.image ||
		item.thumbnail ||
		"https://images.unsplash.com/photo-1534447677768-be436bb09401?w=800&auto=format&fit=crop&q=60";

	const isEpisode =
		item.type === "episode" || Boolean(item.season || item.episode);

	/**
	 * Başlık satırı: dizi adı. Alt satır: "S. Sezon E. Bölüm · X dk kaldı".
	 * Bölüm adı burada gösterilmez (yalnızca detay sayfasında).
	 */
	const seriesTitle = item.seriesTitle || item.title || "İçerik";
	const episodeLabel =
		isEpisode && item.season && item.episode
			? `${item.season}. Sezon ${item.episode}. Bölüm`
			: "";

	const remainingMin =
		item.duration > 0
			? Math.max(
					0,
					Math.round((item.duration - (item.currentTime || 0)) / 60),
				)
			: 0;
	const subtitle = [episodeLabel, remainingMin > 0 ? `${remainingMin} dk kaldı` : ""]
		.filter(Boolean)
		.join(" · ");

	const pluginName = resolvePluginName(item);

	return (
		<TVPressable
			style={styles.card}
			focusedStyle={styles.cardFocused}
			onPress={() => onPress?.(item)}
			onLongPress={() => onLongPress?.(item)}
			onFocus={onFocus}>
			{({ focused }) => (
				<View>
					<View
						style={[
							styles.thumbnailWrapper,
							focused && styles.thumbnailWrapperFocused,
						]}>
						<Image
							source={{ uri: posterUri }}
							style={styles.thumbnail}
							contentFit="cover"
							recyclingKey={posterUri}
							transition={0}
							cachePolicy="memory-disk"
						/>

						<View style={styles.overlay} />

						{pluginName ? (
							<View style={styles.pluginBadge}>
								<Text style={styles.pluginBadgeText} numberOfLines={1}>
									{pluginName}
								</Text>
							</View>
						) : null}

						<View style={styles.playButtonCircle}>
							<Ionicons
								name="play"
								size={20}
								color={Palette.primary}
								style={{ marginLeft: 2 }}
							/>
						</View>

						{onRemove && (
							<TouchableOpacity
								style={styles.removeButton}
								onPress={(e) => {
									e.stopPropagation();
									onRemove(item.id);
								}}
								hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
								activeOpacity={0.7}>
								<Ionicons
									name="close"
									size={14}
									color={Palette.onSurface}
								/>
							</TouchableOpacity>
						)}

						<View style={styles.progressBarBackground}>
							<View
								style={[
									styles.progressBarFill,
									{ width: `${progressPercent}%` },
								]}
							/>
						</View>
					</View>

					<View style={styles.infoContainer}>
						<View style={styles.titleRow}>
							<Text style={styles.title} numberOfLines={1}>
								{seriesTitle}
							</Text>
							<Text style={styles.percent}>%{progressPercent}</Text>
						</View>
						<Text style={styles.subtitle} numberOfLines={1}>
							{subtitle || " "}
						</Text>
					</View>
				</View>
			)}
		</TVPressable>
	);
}

const styles = StyleSheet.create({
	card: {
		width: CONTINUE_CARD_WIDTH,
		borderRadius: 12,
		backgroundColor: Palette.surfaceLow,
		overflow: "hidden",
	},
	cardFocused: {
		// Ölçek, satırdaki boşluk sayesinde komşunun altına girmiyor.
		transform: [{ scale: 1.04 }],
	},
	thumbnailWrapper: {
		width: CONTINUE_CARD_WIDTH,
		height: THUMB_HEIGHT,
		overflow: "hidden",
		position: "relative",
		backgroundColor: Palette.surfaceHighest,
	},
	thumbnailWrapperFocused: {
		// TV performans: odak anında elevation/shadow değiştirilmez.
		backgroundColor: Palette.surfaceBright,
	},
	thumbnail: {
		width: "100%",
		height: "100%",
	},
	overlay: {
		...StyleSheet.absoluteFill,
		backgroundColor: "rgba(14, 14, 16, 0.3)",
	},
	playButtonCircle: {
		position: "absolute",
		top: "50%",
		left: "50%",
		transform: [{ translateX: -20 }, { translateY: -20 }],
		width: 40,
		height: 40,
		borderRadius: 20,
		backgroundColor: "rgba(19, 19, 21, 0.9)",
		justifyContent: "center",
		alignItems: "center",
	},
	removeButton: {
		position: "absolute",
		top: 8,
		right: 8,
		width: 24,
		height: 24,
		borderRadius: 12,
		backgroundColor: "rgba(19, 19, 21, 0.85)",
		justifyContent: "center",
		alignItems: "center",
	},
	pluginBadge: {
		position: "absolute",
		top: 8,
		left: 8,
		maxWidth: "60%",
		backgroundColor: "rgba(32, 31, 33, 0.9)",
		paddingHorizontal: 6,
		paddingVertical: 2,
		borderRadius: 4,
	},
	pluginBadgeText: {
		color: Palette.secondary,
		fontFamily: FontFamily.semiBold,
		fontSize: 9,
		letterSpacing: 0.3,
		textTransform: "uppercase",
	},
	progressBarBackground: {
		position: "absolute",
		bottom: 0,
		left: 0,
		right: 0,
		height: 4,
		backgroundColor: Palette.surfaceHighest,
	},
	progressBarFill: {
		height: "100%",
		backgroundColor: Palette.primaryContainer,
	},
	infoContainer: {
		padding: 12,
		gap: 2,
	},
	titleRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
	},
	title: {
		flex: 1,
		color: Palette.onSurface,
		fontFamily: FontFamily.semiBold,
		fontSize: 14,
		lineHeight: 20,
		letterSpacing: -0.2,
	},
	percent: {
		color: Palette.primary,
		fontFamily: FontFamily.semiBold,
		fontSize: 12,
	},
	subtitle: {
		color: Palette.onSurfaceVariant,
		fontFamily: FontFamily.regular,
		fontSize: 12,
		lineHeight: 16,
	},
});
