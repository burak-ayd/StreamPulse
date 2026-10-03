import LanguageBadge from "@/components/common/LanguageBadge";
import TVPressable from "@/components/common/TVPressable";
import { resolvePluginName } from "@/utils/storage";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

function formatTime(seconds) {
	if (!seconds || isNaN(seconds) || seconds < 0) return "00:00";
	const totalSecs = Math.floor(seconds);
	const hrs = Math.floor(totalSecs / 3600);
	const mins = Math.floor((totalSecs % 3600) / 60);
	const secs = totalSecs % 60;

	if (hrs > 0) {
		return `${hrs}:${mins < 10 ? "0" : ""}${mins}:${secs < 10 ? "0" : ""}${secs}`;
	}
	return `${mins < 10 ? "0" : ""}${mins}:${secs < 10 ? "0" : ""}${secs}`;
}

export default function ContinueWatchingCard({ item, onPress, onLongPress, onRemove }) {
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

	const movieRawLang =
		item.language ||
		item.languages ||
		item.lang ||
		item.audio ||
		item.subtitles;

	return (
		<TVPressable
			style={[styles.card]}
			focusedStyle={styles.cardFocused}
			onPress={() => onPress?.(item)}
			onLongPress={() => onLongPress?.(item)}>
			{({ focused }) => (
				<View>
					{/* Thumbnail Wrapper */}
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

				{/* Subtle Dark Gradient Overlay */}
				<View style={styles.overlay} />

				{/* Top Left Badges */}
				<View style={styles.topBadgesContainer}>
					{movieRawLang ? (
						<LanguageBadge
							language={movieRawLang}
							size="small"
						/>
					) : null}
					{resolvePluginName(item) ? (
						<View style={styles.pluginBadge}>
							<Text style={styles.pluginBadgeText} numberOfLines={1}>
								{resolvePluginName(item)}
							</Text>
						</View>
					) : null}
				</View>

				{/* Play Button Icon */}
				<View style={styles.playButtonCircle}>
					<Ionicons
						name="play"
						size={16}
						color="#FFFFFF"
						style={{ marginLeft: 2 }}
					/>
				</View>

				{/* Top Right Quick Remove Option */}
				{onRemove && (
					<TouchableOpacity
						style={styles.removeButton}
						onPress={(e) => {
							e.stopPropagation();
							onRemove(item.id);
						}}
						hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
						activeOpacity={0.7}>
						<Ionicons name="close" size={13} color="#FFFFFF" />
					</TouchableOpacity>
				)}

				{/* Bottom Time Badge */}
				<View style={styles.timeBadge}>
					<Text style={styles.timeText}>
						{formatTime(item.currentTime)}
						{item.duration > 0 && ` / ${formatTime(item.duration)}`}
					</Text>
				</View>

				{/* Progress Bar */}
				<View style={styles.progressBarBackground}>
					<View
						style={[
							styles.progressBarFill,
							{ width: `${progressPercent}%` },
						]}
					/>
				</View>
			</View>

			{/* Info Block */}
			<View style={styles.infoContainer}>
				<Text style={styles.title} numberOfLines={1}>
					{item.title}
				</Text>

				{isEpisode && (
					<Text style={styles.episodeInfo} numberOfLines={1}>
						{item.season ? `S${item.season}` : ""}
						{item.episode ? ` Bölüm ${item.episode}` : ""}
						{item.episodeTitle ? ` • ${item.episodeTitle}` : ""}
					</Text>
				)}
			</View>
				</View>
			)}
		</TVPressable>
	);
}

const styles = StyleSheet.create({
	card: {
		marginRight: 4,
		width: 124,
	},
	cardFocused: {
		// zIndex kaldırıldı (odak başına kardeş sıralaması değişimi = ek commit).
		transform: [{ scale: 1.06 }],
	},
	thumbnailWrapper: {
		width: 124,
		height: 182,
		borderRadius: 4,
		overflow: "hidden",
		position: "relative",
		backgroundColor: "#161922",
		borderWidth: 2,
		borderColor: "rgba(255, 255, 255, 0.08)",
	},
	thumbnailWrapperFocused: {
		// TV performans: odak anında elevation/shadow değiştirilmez (bkz.
		// MovieCategorySection) — border + arka plan aynı vurguyu bedavaya verir.
		borderColor: "#FF3B30",
		backgroundColor: "#2a1216",
	},
	thumbnail: {
		width: "100%",
		height: "100%",
		borderRadius: 4,
		overflow: "hidden",
	},
	overlay: {
		...StyleSheet.absoluteFill,
		backgroundColor: "rgba(0, 0, 0, 0.28)",
	},
	playButtonCircle: {
		position: "absolute",
		top: "50%",
		left: "50%",
		transform: [{ translateX: -16 }, { translateY: -16 }],
		width: 32,
		height: 32,
		borderRadius: 16,
		backgroundColor: "rgba(15, 18, 26, 0.72)",
		borderWidth: 1.5,
		borderColor: "rgba(255, 255, 255, 0.35)",
		justifyContent: "center",
		alignItems: "center",
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.4,
		shadowRadius: 4,
		elevation: 3,
	},
	removeButton: {
		position: "absolute",
		top: 6,
		right: 6,
		width: 22,
		height: 22,
		borderRadius: 11,
		backgroundColor: "rgba(0, 0, 0, 0.65)",
		justifyContent: "center",
		alignItems: "center",
	},
	topBadgesContainer: {
		position: "absolute",
		top: 6,
		left: 6,
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		maxWidth: "70%",
	},
	pluginBadge: {
		backgroundColor: "rgba(15, 23, 42, 0.82)",
		paddingHorizontal: 5,
		paddingVertical: 1.5,
		borderRadius: 3,
		borderWidth: 0.5,
		borderColor: "rgba(255, 255, 255, 0.2)",
	},
	pluginBadgeText: {
		color: "#38bdf8",
		fontSize: 8.5,
		fontWeight: "700",
		textTransform: "uppercase",
		letterSpacing: 0.3,
	},
	timeBadge: {
		position: "absolute",
		bottom: 8,
		right: 8,
		backgroundColor: "rgba(0, 0, 0, 0.75)",
		paddingHorizontal: 6,
		paddingVertical: 2,
		borderRadius: 5,
	},
	timeText: {
		color: "#E5E7EB",
		fontSize: 10,
		fontWeight: "600",
		letterSpacing: 0.2,
	},
	progressBarBackground: {
		position: "absolute",
		bottom: 0,
		left: 0,
		right: 0,
		height: 3.5,
		backgroundColor: "rgba(255, 255, 255, 0.2)",
	},
	progressBarFill: {
		height: "100%",
		backgroundColor: "#FF3B30",
		borderTopRightRadius: 2,
		borderBottomRightRadius: 2,
	},
	infoContainer: {
		marginTop: 8,
		paddingHorizontal: 2,
	},
	title: {
		color: "#FFFFFF",
		fontSize: 13,
		fontWeight: "700",
		letterSpacing: -0.2,
	},
	episodeInfo: {
		color: "#9CA3AF",
		fontSize: 11,
		fontWeight: "500",
		marginTop: 2,
	},
});
