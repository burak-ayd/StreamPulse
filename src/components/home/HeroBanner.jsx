import LanguageBadge from "@/components/common/LanguageBadge";
import RozetNokta from "@/components/common/RozetNokta";
import TVPressable from "@/components/common/TVPressable";
import {
	SkeletonBlock,
	SkeletonLine,
	useSkeletonColors,
} from "@/components/common/Skeleton";
import { FontFamily, Palette } from "@/constants/theme";
import { isTabletSize, useNavLayout } from "@/hooks/useNavLayout";
import { useTvMetrics } from "@/utils/tvMetrics";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import Image from "@/components/common/SmartImage";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { okunmamisSayisiGetir, rozetAbone } from "@/services/bildirimApi";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * Hero — görsel her cihazda TEK biçimde kullanılır: metin görselin ÜZERİNE
 * bindirilir. Telefonda görsel kenardan kenara (full-bleed), tablet ve TV'de
 * 16dp kenar payı + 16dp köşe yarıçapı olan bir kart içinde gösterilir.
 *
 * Yükseklik ekran yüksekliğinden türetilir (sabit dp değil): telefonda 460,
 * tablette 520, TV'de ekranın %66'sı tavanına kadar.
 */
export default function HeroBanner({
	movie,
	platform,
	isInList,
	userAvatarUrl,
	onPlayPress,
	onToggleList,
	/** Detay sayfası — oynatmanın yanında ayrı bir "Bilgi" düğmesi. */
	onInfoPress,
	onPlatformPress,
	onSearchPress,
	onProfilePress,
	/**
	 * Bildirim zili — profil simgesinin hemen yanında. Alt menü
	 * çubuğundan taşındı; ana ekran gelen kutusuna yönlenir.
	 */
	onNotificationsPress,
	/**
	 * İskelet modu — `movie` henüz yokken. Hero kendi geometrisini çizer ki
	 * içerik gelince ekran zıplamasın.
	 */
	skeleton = false,
}) {
	const insets = useSafeAreaInsets();
	const { width: winW, height: winH } = useWindowDimensions();
	const { isSideRail } = useNavLayout();
	const { isTV, sp } = useTvMetrics();
	const skeletonColors = useSkeletonColors();

	/*
	 * Okunmamış bildirim sayacı — zilin rozet değeri. Serviste modül
	 * önbelleği + abonelik var; gelen kutusu ile rozet ağ verisini TEK
	 * tazelenmede paylaşır.
	 */
	const [rozet, setRozet] = useState(0);
	useEffect(() => {
		const cik = rozetAbone(setRozet);
		let canli = true;
		okunmamisSayisiGetir().then((sayi) => {
			if (canli) setRozet(sayi);
		});
		return () => {
			canli = false;
			cik();
		};
	}, []);

	const title = movie?.title || "StreamPulse";
	const rawGenres = movie?.category || movie?.genres;
	const genres =
		(Array.isArray(rawGenres) ? rawGenres.join(" • ") : rawGenres) ||
		(movie?.release_date
			? `${movie.release_date} • Film`
			: "Aksiyon • Macera • Bilim Kurgu");
	const description =
		movie?.description || movie?.overview || movie?.plot || "";
	const movieRawLang =
		movie?.language ||
		movie?.languages ||
		movie?.lang ||
		movie?.audio ||
		movie?.subtitles;

	const backdropUri = movie?.backdrop_url || movie?.backdrop || null;
	const posterUri =
		movie?.poster ||
		movie?.poster_url ||
		movie?.image ||
		backdropUri ||
		"https://images.unsplash.com/photo-1534447677768-be436bb09401?w=800&auto=format&fit=crop&q=60";
	const hasBackdrop = skeleton ? true : !!backdropUri;

	/* Tablet ve TV'de görsel kart içinde; telefonda kenardan kenara. */
	const carded = isSideRail || isTabletSize(winW, winH);
	const heroH = Math.round(
		isTV
			? winH * 0.66
			: Math.min(winH * 0.66, carded ? 520 : 460),
	);
	const pad = carded ? 24 : 16;
	const heroRadius = carded ? 16 : 0;
	/*
	 * Uzun başlıklar: tasarımda başlık kırpılmıyor (line-clamp yok). Sabit
	 * yükseklikli hero'da 4+ satıra taşmaması için 24 karakterden uzun
	 * başlıklarda punto küçültülür, satır sınırı 3'e çıkar.
	 */
	const uzunBaslik = title.length > 24;
	const titleSize = sp(
		carded ? (uzunBaslik ? 32 : 40) : uzunBaslik ? 26 : 32,
	);
	const textMaxWidth = carded ? Math.round(winW * 0.6) : undefined;

	const renderHeader = () => (
		<View
			style={[
				styles.header,
				{ paddingTop: insets.top + 8, paddingHorizontal: 16 },
			]}>
			<View style={styles.headerSide}>
				{carded ? (
					<TVPressable
						style={styles.searchPill}
						focusedStyle={styles.focusRing}
						onPress={onSearchPress}
						accessibilityLabel="Ara">
						<Ionicons
							name="search"
							size={18}
							color={Palette.onSurfaceVariant}
						/>
						<Text style={styles.searchPillText} numberOfLines={1}>
							Hızlı arama yap...
						</Text>
					</TVPressable>
				) : (
					<TVPressable
						style={styles.headerButton}
						focusedStyle={styles.focusRing}
						onPress={onSearchPress}
						accessibilityLabel="Ara">
						<Ionicons
							name="search"
							size={20}
							color={Palette.onSurfaceVariant}
						/>
					</TVPressable>
				)}
			</View>

			{platform && (
				<TVPressable
					style={styles.platformPill}
					focusedStyle={styles.focusRing}
					onPress={onPlatformPress}>
					{platform.favicon ? (
						<Image
							source={{ uri: platform.favicon }}
							style={styles.platformLogo}
							contentFit="contain"
						/>
					) : (
						<View style={styles.platformDot} />
					)}
					<Text style={styles.platformText} numberOfLines={1}>
						{platform.name}
					</Text>
					<Ionicons
						name="chevron-down"
						size={16}
						color={Palette.onSurfaceVariant}
					/>
				</TVPressable>
			)}

			{/* Sağ uç: zil + (ray yoksa) profil simgesi. Ray düzeninde
			    profil düğmesi gezinme rayında yaşıyor. */}
			<View style={[styles.headerSide, styles.headerRight]}>
				<TVPressable
					style={styles.headerButton}
					focusedStyle={styles.focusRing}
					onPress={onNotificationsPress}
					accessibilityLabel="Bildirimler">
					{() => (
						<View>
							<Ionicons
								name="notifications-outline"
								size={20}
								color={Palette.onSurfaceVariant}
							/>
							<RozetNokta deger={rozet} />
						</View>
					)}
				</TVPressable>

				{!isSideRail && (
					<TVPressable
						style={styles.profileButton}
						focusedStyle={styles.focusRing}
						onPress={onProfilePress}
						accessibilityLabel="Profil">
						{userAvatarUrl ? (
							<Image
								source={{ uri: userAvatarUrl }}
								style={styles.avatarImage}
								contentFit="cover"
							/>
						) : (
							<Ionicons
								name="person"
								size={18}
								color={Palette.onPrimary}
							/>
						)}
					</TVPressable>
				)}
			</View>
		</View>
	);

	const renderContent = () => {
		if (skeleton) {
			return (
				<View style={[styles.content, { padding: pad }]} pointerEvents="none">
					<View style={styles.metaRow}>
						<SkeletonLine width={120} height={12} />
					</View>
					<SkeletonLine
						width={Math.min(textMaxWidth ?? 260, 240)}
						height={Math.round(titleSize * 0.72)}
						radius={8}
						style={{ marginTop: 8 }}
					/>
					<SkeletonLine width={180} height={12} style={{ marginTop: 12 }} />
					<View style={styles.buttonsRow}>
						<SkeletonBlock
							width="100%"
							height={sp(48)}
							radius={sp(24)}
							style={{ flex: 1, maxWidth: sp(360) }}
						/>
						<SkeletonBlock
							width={130}
							height={sp(48)}
							radius={sp(24)}
						/>
						<SkeletonBlock
							width={sp(48)}
							height={sp(48)}
							radius={sp(24)}
						/>
					</View>
				</View>
			);
		}

		return (
			<View style={[styles.content, { padding: pad }]}>
				<View style={styles.metaRow}>
					{movieRawLang ? (
						<LanguageBadge
							language={movieRawLang}
							size="small"
							style={styles.langBadge}
							textStyle={styles.langBadgeText}
						/>
					) : null}
					<Text style={styles.metaText} numberOfLines={1}>
						{genres}
					</Text>
				</View>

				<Text
					style={[
						styles.title,
						{
							fontSize: titleSize,
							lineHeight: Math.round(titleSize * 1.1),
							maxWidth: textMaxWidth,
						},
					]}
					numberOfLines={3}>
					{title}
				</Text>

				{description ? (
					<Text
						style={[styles.description, { maxWidth: textMaxWidth }]}
						numberOfLines={2}>
						{description}
					</Text>
				) : null}

				<View style={styles.buttonsRow}>
					<TVPressable
						autoFocus={!skeleton}
						style={styles.playButton}
						focusedStyle={styles.playButtonFocused}
						onPress={onPlayPress}>
						<Ionicons
							name="play"
							size={20}
							color={Palette.onPrimaryContainer}
							style={{ marginLeft: 2 }}
						/>
						<Text style={styles.playButtonText}>Oynat</Text>
					</TVPressable>

					<TVPressable
						style={styles.listButton}
						focusedStyle={styles.listButtonFocused}
						onPress={onToggleList}>
						<Ionicons
							name={isInList ? "checkmark" : "bookmark-outline"}
							size={20}
							color={Palette.onSurface}
						/>
						<Text style={styles.listButtonText}>
							{isInList ? "Listede" : "Listem"}
						</Text>
					</TVPressable>

					{onInfoPress ? (
						<TVPressable
							style={styles.infoButton}
							focusedStyle={styles.infoButtonFocused}
							onPress={onInfoPress}
							accessibilityLabel="Detay">
							<Ionicons
								name="information-circle-outline"
								size={22}
								color={Palette.onSurface}
							/>
						</TVPressable>
					) : null}
				</View>
			</View>
		);
	};

	return (
		<View style={styles.section}>
			{renderHeader()}

			<View
				style={[
					styles.hero,
					{
						height: heroH,
						marginHorizontal: carded ? 16 : 0,
						borderRadius: heroRadius,
					},
				]}>
				{skeleton ? (
					<View
						style={[
							styles.media,
							{
								backgroundColor: skeletonColors.block,
								borderRadius: heroRadius,
							},
						]}
					/>
				) : (
					<Image
						source={{ uri: hasBackdrop ? backdropUri : posterUri }}
						style={styles.media}
						contentFit="cover"
						contentPosition="center"
						recyclingKey={hasBackdrop ? backdropUri : posterUri}
						transition={0}
						cachePolicy="memory-disk"
					/>
				)}

				{!skeleton && (
					<LinearGradient
						colors={[
							"transparent",
							"rgba(19,19,21,0.55)",
							"rgba(19,19,21,0.90)",
							Palette.background,
						]}
						locations={[0.15, 0.45, 0.72, 1]}
						style={styles.scrim}
					/>
				)}

				{renderContent()}
			</View>

			<View style={{ height: 8 }} />
		</View>
	);
}

const styles = StyleSheet.create({
	section: {
		width: "100%",
	},
	header: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		paddingBottom: 12,
	},
	headerSide: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
	},
	headerRight: {
		justifyContent: "flex-end",
		gap: 8,
	},
	headerButton: {
		width: 40,
		height: 40,
		borderRadius: 20,
		backgroundColor: Palette.surface,
		alignItems: "center",
		justifyContent: "center",
		borderWidth: 2,
		borderColor: "transparent",
	},
	searchPill: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		height: 40,
		paddingHorizontal: 14,
		borderRadius: 20,
		backgroundColor: Palette.surface,
		borderWidth: 2,
		borderColor: "transparent",
		flexShrink: 1,
	},
	searchPillText: {
		color: Palette.onSurfaceVariant,
		fontFamily: FontFamily.regular,
		fontSize: 13,
	},
	platformPill: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		height: 36,
		paddingHorizontal: 12,
		borderRadius: 18,
		backgroundColor: Palette.surfaceHigh,
		borderWidth: 2,
		borderColor: "transparent",
		flexShrink: 1,
	},
	platformLogo: {
		width: 16,
		height: 16,
		borderRadius: 4,
	},
	platformDot: {
		width: 8,
		height: 8,
		borderRadius: 4,
		backgroundColor: "#E50914",
	},
	platformText: {
		color: Palette.onSurface,
		fontFamily: FontFamily.semiBold,
		fontSize: 13,
		flexShrink: 1,
	},
	profileButton: {
		width: 36,
		height: 36,
		borderRadius: 18,
		backgroundColor: Palette.primary,
		alignItems: "center",
		justifyContent: "center",
		overflow: "hidden",
		borderWidth: 2,
		borderColor: "transparent",
	},
	avatarImage: {
		width: "100%",
		height: "100%",
	},
	focusRing: {
		borderColor: Palette.primary,
	},
	hero: {
		overflow: "hidden",
		backgroundColor: Palette.surfaceLowest,
	},
	media: {
		width: "100%",
		height: "100%",
	},
	scrim: {
		position: "absolute",
		left: 0,
		right: 0,
		bottom: 0,
		height: "92%",
	},
	content: {
		position: "absolute",
		left: 0,
		right: 0,
		bottom: 0,
	},
	metaRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
	},
	langBadge: {
		backgroundColor: Palette.surfaceHighest,
		borderWidth: 0,
		paddingHorizontal: 6,
		paddingVertical: 2,
		borderRadius: 4,
	},
	langBadgeText: {
		color: Palette.secondary,
	},
	metaText: {
		color: Palette.onSurfaceVariant,
		fontFamily: FontFamily.medium,
		fontSize: 12,
		flexShrink: 1,
	},
	title: {
		color: Palette.onSurface,
		fontFamily: FontFamily.bold,
		letterSpacing: -0.5,
		marginTop: 8,
		textShadowColor: "rgba(0, 0, 0, 0.55)",
		textShadowOffset: { width: 0, height: 1 },
		textShadowRadius: 6,
	},
	description: {
		color: Palette.onSurfaceVariant,
		fontFamily: FontFamily.regular,
		fontSize: 14,
		lineHeight: 20,
		marginTop: 8,
		textShadowColor: "rgba(0, 0, 0, 0.45)",
		textShadowOffset: { width: 0, height: 1 },
		textShadowRadius: 4,
	},
	buttonsRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		marginTop: 16,
	},
	playButton: {
		flex: 1,
		maxWidth: 360,
		height: 48,
		borderRadius: 24,
		backgroundColor: Palette.primaryContainer,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		borderWidth: 2,
		borderColor: "transparent",
	},
	playButtonFocused: {
		borderColor: Palette.primary,
	},
	playButtonText: {
		color: Palette.onPrimaryContainer,
		fontFamily: FontFamily.semiBold,
		fontSize: 15,
	},
	listButton: {
		height: 48,
		paddingHorizontal: 20,
		borderRadius: 24,
		backgroundColor: Palette.surfaceHigh,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		borderWidth: 2,
		borderColor: "transparent",
	},
	listButtonFocused: {
		borderColor: Palette.primary,
	},
	listButtonText: {
		color: Palette.onSurface,
		fontFamily: FontFamily.semiBold,
		fontSize: 15,
	},
	infoButton: {
		width: 48,
		height: 48,
		borderRadius: 24,
		backgroundColor: Palette.surfaceHigh,
		alignItems: "center",
		justifyContent: "center",
		borderWidth: 2,
		borderColor: "transparent",
	},
	infoButtonFocused: {
		borderColor: Palette.primary,
	},
});
