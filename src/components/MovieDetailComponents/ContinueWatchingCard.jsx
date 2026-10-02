import TVPressable from "@/components/common/TVPressable";
import { useThemeContext } from "@/context/ThemeContext";
import { formatTime } from "@/utils/formatters";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import {
	Animated,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from "react-native";

const MONTHS_TR = [
	"Oca",
	"Şub",
	"Mar",
	"Nis",
	"May",
	"Haz",
	"Tem",
	"Ağu",
	"Eyl",
	"Eki",
	"Kas",
	"Ara",
];

/**
 * Format relative / Turkish date for last watched
 */
function formatLastWatchedDate(dateString) {
	if (!dateString) return null;
	try {
		const d = new Date(dateString);
		if (isNaN(d.getTime())) return null;
		const now = new Date();

		const isToday =
			d.getFullYear() === now.getFullYear() &&
			d.getMonth() === now.getMonth() &&
			d.getDate() === now.getDate();

		const yesterday = new Date(now);
		yesterday.setDate(yesterday.getDate() - 1);
		const isYesterday =
			d.getFullYear() === yesterday.getFullYear() &&
			d.getMonth() === yesterday.getMonth() &&
			d.getDate() === yesterday.getDate();

		const hours = d.getHours().toString().padStart(2, "0");
		const minutes = d.getMinutes().toString().padStart(2, "0");
		const timeStr = `${hours}:${minutes}`;

		if (isToday) return `Son: Bugün ${timeStr}`;
		if (isYesterday) return `Son: Dün ${timeStr}`;

		return `Son: ${d.getDate()} ${MONTHS_TR[d.getMonth()]} ${timeStr}`;
	} catch {
		return null;
	}
}

/**
 * ContinueWatchingCard – Kaldığın Yerden Devam Et Kartı
 *
 * Kaynak tasarım (stitch_unified_cinema_ui_redesigna):
 * - Sol üstte yanıp sönen kırmızı nokta + "KALDIĞIN YERDEN" başlığı
 * - Sağ üstte "%X Tamamlandı" rozeti
 * - Sol ortada dairesel oynatma halkası & ikon
 * - Ortada bölüm / içerik başlığı ve "Kalan: Xs Ydk • Z. dakika" bilgisi
 * - Sağ ortada kırmızı oval "Devam Et" butonu
 * - Altta gradient ilerleme çubuğu ve parlak beyaz gösterge noktası
 * - En altta 3 sütunlu süre bilgileri ("XX:XX izlendi", "Son: Dün 17:48", "Toplam: XX:XX:XX")
 */
export default function ContinueWatchingCard({
	content,
	watchProgress,
	isSeries = false,
	onPress,
}) {
	const { theme } = useThemeContext();

	// Pulsing animation for the active indicator dot
	const [pulseAnim] = useState(() => new Animated.Value(1));
	const [opacityAnim] = useState(() => new Animated.Value(0.8));

	useEffect(() => {
		const anim = Animated.loop(
			Animated.parallel([
				Animated.sequence([
					Animated.timing(pulseAnim, {
						toValue: 2.2,
						duration: 1400,
						useNativeDriver: true,
					}),
					Animated.timing(pulseAnim, {
						toValue: 1,
						duration: 0,
						useNativeDriver: true,
					}),
				]),
				Animated.sequence([
					Animated.timing(opacityAnim, {
						toValue: 0,
						duration: 1400,
						useNativeDriver: true,
					}),
					Animated.timing(opacityAnim, {
						toValue: 0.8,
						duration: 0,
						useNativeDriver: true,
					}),
				]),
			]),
		);
		anim.start();
		return () => anim.stop();
	}, [pulseAnim, opacityAnim]);

	// Süre ve ilerleme hesaplamaları
	const currentTime = watchProgress?.currentTime || 0;
	const duration =
		watchProgress?.duration && watchProgress.duration > 0
			? watchProgress.duration
			: content?.runtime_minutes && content.runtime_minutes > 0
				? content.runtime_minutes * 60
				: 0;

	let progressPercent = 12;
	if (duration > 0) {
		const pct = Math.round((currentTime / duration) * 100);
		progressPercent = Math.min(100, Math.max(1, pct));
	} else if (watchProgress?.progress) {
		progressPercent = Math.min(
			100,
			Math.max(1, Math.round(watchProgress.progress * 100)),
		);
	}

	// Kalan süre ve geçerli dakika
	const currentMinute = Math.max(1, Math.floor(currentTime / 60));
	let subtitleText = `${currentMinute}. dakika izlendi`;
	if (duration > 0 && duration > currentTime) {
		const remainingSecs = Math.max(0, duration - currentTime);
		const remHours = Math.floor(remainingSecs / 3600);
		const remMins = Math.floor((remainingSecs % 3600) / 60);
		const remFormatted =
			remHours > 0
				? `${remHours}s ${remMins}dk`
				: `${Math.max(1, remMins)}dk`;
		subtitleText = `Kalan: ${remFormatted} • ${currentMinute}. dakika`;
	}

	// Başlık
	let titleText = content?.title || "Kaldığın Yerden Devam et";
	if (isSeries && watchProgress?.season && watchProgress?.episode) {
		const epTitle = watchProgress.episodeTitle
			? ` - ${watchProgress.episodeTitle}`
			: "";
		titleText = `${watchProgress.season}. Sezon ${watchProgress.episode}. Bölüm${epTitle}`;
	}

	// Son izleme tarihi
	const rawDate =
		watchProgress?.updatedAt ||
		watchProgress?.continueItem?.updatedAt ||
		watchProgress?.continueItem?.watchedAt ||
		watchProgress?.watchedAt;
	const lastWatchedText =
		formatLastWatchedDate(rawDate) ||
		(duration > 0
			? `Kalan: ${Math.max(1, Math.round((duration - currentTime) / 60))} dk`
			: "Devam Eden");

	const isDark = theme === "dark";

	return (
		<TVPressable
			autoFocus={true}
			activeOpacity={0.92}
			onPress={onPress}
			style={({ focused }) => [
				styles.cardContainer,
				focused && styles.cardContainerFocused,
			]}>
			<LinearGradient
				colors={
					isDark
						? ["#161B26", "#11151E", "#0A0D13"]
						: ["#ffffff", "#f8fafc", "#f1f5f9"]
				}
				start={{ x: 0, y: 0 }}
				end={{ x: 1, y: 1 }}
				style={[
					styles.gradientCard,
					{
						borderColor: isDark
							? "rgba(255, 255, 255, 0.1)"
							: "rgba(0, 0, 0, 0.08)",
					},
				]}>
				{/* Köşe ambiyans parıltıları */}
				{/* <View style={styles.ambientGlowRight} />
				<View style={styles.ambientGlowLeft} /> */}

				{/* 1. ÜST BAŞLIK & ROZET SATIRI */}
				<View style={styles.headerRow}>
					<View style={styles.headerLeft}>
						<View style={styles.pulsingDotContainer}>
							<Animated.View
								style={[
									styles.pulsingRing,
									{
										transform: [{ scale: pulseAnim }],
										opacity: opacityAnim,
									},
								]}
							/>
							<View style={styles.solidDot} />
						</View>
						<Text
							style={[
								styles.headerLabel,
								{ color: isDark ? "#cbd5e1" : "#475569" },
							]}>
							KALDIĞIN YERDEN Devam et
						</Text>
					</View>

					<View style={styles.percentBadge}>
						<Text style={styles.percentBadgeText}>
							%{progressPercent} Tamamlandı
						</Text>
					</View>
				</View>

				{/* 2. ORTA İÇERİK & DEVAM ET CTA SATIRI */}
				<View style={styles.middleRow}>
					<View style={styles.middleLeft}>
						{/* Dairesel Oynat Göstergesi */}
						<View
							style={[
								styles.playCircleWrapper,
								{
									backgroundColor: isDark
										? "rgba(255, 255, 255, 0.05)"
										: "rgba(0, 0, 0, 0.04)",
									borderColor: isDark
										? "rgba(255, 255, 255, 0.1)"
										: "rgba(0, 0, 0, 0.08)",
								},
							]}>
							<View style={styles.circularArcTrack}>
								<Ionicons
									name="play"
									size={18}
									color="#E50914"
									style={styles.playIconOffset}
								/>
							</View>
						</View>

						{/* Başlık ve Süre Detayı */}
						<View style={styles.titleInfo}>
							<Text
								style={[
									styles.contentTitle,
									{ color: isDark ? "#ffffff" : "#0f172a" },
								]}
								numberOfLines={1}>
								{titleText}
							</Text>
							<Text
								style={[
									styles.contentSubtitle,
									{ color: isDark ? "#94a3b8" : "#64748b" },
								]}
								numberOfLines={1}>
								{subtitleText}
							</Text>
						</View>
					</View>

					{/* Devam Et Butonu */}
					<View style={styles.continueButton}>
						<Ionicons name="play" size={14} color="#ffffff" />
						<Text style={styles.continueButtonText}>Devam Et</Text>
					</View>
				</View>

				{/* 3. ALT İLERLEME ÇUBUĞU & SÜRE İSTATİSTİKLERİ */}
				<View
					style={[
						styles.bottomSection,
						{
							borderTopColor: isDark
								? "rgba(255, 255, 255, 0.06)"
								: "rgba(0, 0, 0, 0.06)",
						},
					]}>
					{/* İlerleme Çubuğu Track */}
					<View
						style={[
							styles.progressTrack,
							{
								backgroundColor: isDark
									? "rgba(255, 255, 255, 0.12)"
									: "rgba(0, 0, 0, 0.08)",
							},
						]}>
						<LinearGradient
							colors={["#E50914", "#ff3b47"]}
							start={{ x: 0, y: 0.5 }}
							end={{ x: 1, y: 0.5 }}
							style={[
								styles.progressFill,
								{
									width: `${Math.min(100, Math.max(4, progressPercent))}%`,
								},
							]}>
							{/* Gösterge Noktası */}
							<View style={styles.progressThumb} />
						</LinearGradient>
					</View>

					{/* 3 Sütunlu Süre Göstergeleri */}
					<View style={styles.timeStatsRow}>
						<Text
							style={[
								styles.timeStatLeft,
								{ color: isDark ? "#94a3b8" : "#64748b" },
							]}>
							{formatTime(currentTime)} izlendi
						</Text>
						<Text
							style={[
								styles.timeStatCenter,
								{ color: isDark ? "#64748b" : "#94a3b8" },
							]}>
							{lastWatchedText}
						</Text>
						<Text
							style={[
								styles.timeStatRight,
								{ color: isDark ? "#94a3b8" : "#64748b" },
							]}>
							{duration > 0
								? `Toplam: ${formatTime(duration)}`
								: ""}
						</Text>
					</View>
				</View>
			</LinearGradient>
		</TVPressable>
	);
}

const styles = StyleSheet.create({
	cardContainer: {
		marginBottom: 16,
		borderRadius: 20,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 6 },
		shadowOpacity: 0.25,
		shadowRadius: 14,
		elevation: 6,
	},
	cardContainerFocused: {
		transform: [{ scale: 1.02 }],
		borderWidth: 2,
		borderColor: "#E50914",
		shadowColor: "#E50914",
		shadowOpacity: 0.8,
		shadowRadius: 14,
		elevation: 8,
	},
	gradientCard: {
		borderRadius: 20,
		borderWidth: 1,
		padding: 16,
		overflow: "hidden",
		position: "relative",
	},
	ambientGlowRight: {
		position: "absolute",
		top: -24,
		right: -24,
		width: 110,
		height: 110,
		borderRadius: 55,
		backgroundColor: "rgba(229, 9, 20, 0.12)",
	},
	ambientGlowLeft: {
		position: "absolute",
		bottom: -24,
		left: -24,
		width: 90,
		height: 90,
		borderRadius: 45,
		backgroundColor: "rgba(229, 9, 20, 0.08)",
	},

	/* Üst Başlık & Rozet */
	headerRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginBottom: 14,
	},
	headerLeft: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
	},
	pulsingDotContainer: {
		width: 14,
		height: 14,
		alignItems: "center",
		justifyContent: "center",
		position: "relative",
	},
	pulsingRing: {
		position: "absolute",
		width: 10,
		height: 10,
		borderRadius: 5,
		backgroundColor: "#E50914",
	},
	solidDot: {
		width: 7,
		height: 7,
		borderRadius: 3.5,
		backgroundColor: "#E50914",
	},
	headerLabel: {
		fontSize: 11,
		fontWeight: "800",
		letterSpacing: 0.8,
		textTransform: "uppercase",
	},
	percentBadge: {
		paddingHorizontal: 9,
		paddingVertical: 3,
		borderRadius: 20,
		backgroundColor: "rgba(229, 9, 20, 0.14)",
		borderWidth: 1,
		borderColor: "rgba(229, 9, 20, 0.3)",
	},
	percentBadgeText: {
		color: "#E50914",
		fontSize: 10.5,
		fontWeight: "800",
		letterSpacing: 0.2,
	},

	/* Orta İçerik & Devam Butonu */
	middleRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 12,
		marginBottom: 14,
	},
	middleLeft: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		flex: 1,
		minWidth: 0,
	},
	playCircleWrapper: {
		width: 46,
		height: 46,
		borderRadius: 14,
		borderWidth: 1,
		alignItems: "center",
		justifyContent: "center",
		flexShrink: 0,
	},
	circularArcTrack: {
		width: 38,
		height: 38,
		borderRadius: 19,
		borderWidth: 2,
		borderColor: "#E50914",
		borderTopColor: "#E50914",
		borderRightColor: "#E50914",
		alignItems: "center",
		justifyContent: "center",
	},
	playIconOffset: {
		marginLeft: 2,
	},
	titleInfo: {
		flex: 1,
		minWidth: 0,
	},
	contentTitle: {
		fontSize: 14,
		fontWeight: "700",
		letterSpacing: -0.2,
	},
	contentSubtitle: {
		fontSize: 11.5,
		fontWeight: "500",
		marginTop: 3,
	},
	continueButton: {
		backgroundColor: "#E50914",
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		paddingVertical: 9,
		paddingHorizontal: 16,
		borderRadius: 22,
		flexShrink: 0,
		shadowColor: "#E50914",
		shadowOffset: { width: 0, height: 3 },
		shadowOpacity: 0.4,
		shadowRadius: 8,
		elevation: 5,
	},
	continueButtonText: {
		color: "#ffffff",
		fontSize: 12,
		fontWeight: "800",
		letterSpacing: 0.2,
	},

	/* Alt İlerleme Çubuğu & İstatistikler */
	bottomSection: {
		paddingTop: 10,
		borderTopWidth: 1,
	},
	progressTrack: {
		width: "100%",
		height: 5,
		borderRadius: 3,
		overflow: "visible",
		position: "relative",
	},
	progressFill: {
		height: "100%",
		borderRadius: 3,
		position: "relative",
	},
	progressThumb: {
		position: "absolute",
		right: -3,
		top: -1.5,
		width: 8,
		height: 8,
		borderRadius: 4,
		backgroundColor: "#ffffff",
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 1 },
		shadowOpacity: 0.4,
		shadowRadius: 2,
		elevation: 2,
	},
	timeStatsRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginTop: 7,
		paddingHorizontal: 1,
	},
	timeStatLeft: {
		fontSize: 10,
		fontWeight: "600",
		letterSpacing: -0.1,
	},
	timeStatCenter: {
		fontSize: 10,
		fontWeight: "500",
		letterSpacing: -0.1,
	},
	timeStatRight: {
		fontSize: 10,
		fontWeight: "600",
		letterSpacing: -0.1,
	},
});
