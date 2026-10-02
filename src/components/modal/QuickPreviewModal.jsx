import TVPressable from "@/components/common/TVPressable";
import ListSelectModal from "@/components/modal/ListSelectModal";
import { fetchPluginDetail } from "@/services/api";
import {
	getContentLibraryStatus,
	setContentLibraryList,
	toggleFavorite,
} from "@/utils/storage";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React, { useCallback, useEffect, useState } from "react";
import {
	ActivityIndicator,
	Alert,
	BackHandler,
	Dimensions,
	Modal,
	Pressable,
	ScrollView,
	Share,
	StyleSheet,
	Text,
	TouchableOpacity,
	Vibration,
	View,
} from "react-native";

const { width } = Dimensions.get("window");

const STATUS_CHIPS = [
	{ key: "watching", label: "İzleniyor", color: "#E50914" },
	{ key: "planned", label: "Planlandı", color: "#38bdf8" },
	{ key: "completed", label: "Tamamlandı", color: "#10b981" },
];

export default function QuickPreviewModal({
	visible,
	movie,
	platformName,
	onClose,
	onPlayPress,
	onDetailsPress,
}) {
	const router = useRouter();

	const [enrichedMovie, setEnrichedMovie] = useState(movie || null);
	const [loadingDetails, setLoadingDetails] = useState(false);
	const [isFav, setIsFav] = useState(false);
	const [inList, setInList] = useState(false);
	const [activeStatus, setActiveStatus] = useState("watching");
	const [toastInfo, setToastInfo] = useState(null); // { text, prevStatus }
	const [isNotificationOn, setIsNotificationOn] = useState(false);
	const [showTrailerPreview, setShowTrailerPreview] = useState(false);
	const [isMuted, setIsMuted] = useState(true);
	const [isListSelectVisible, setIsListSelectVisible] = useState(false);

	const movieId = movie?.id || movie?.url || movie?.title;

	useEffect(() => {
		if (!visible) return;
		const onBackPress = () => {
			if (isListSelectVisible) {
				setIsListSelectVisible(false);
				return true;
			}
			onClose?.();
			return true;
		};
		const sub = BackHandler.addEventListener(
			"hardwareBackPress",
			onBackPress,
		);
		return () => sub.remove();
	}, [visible, isListSelectVisible, onClose]);

	// Modal açıldığında ilk durumu ve detayları yükle
	useEffect(() => {
		if (!visible || !movie) {
			setToastInfo(null);
			setShowTrailerPreview(false);
			return;
		}

		// Dokunsal geri bildirim
		try {
			Vibration.vibrate(40);
		} catch (e) {
			// sessizce geç
		}

		setEnrichedMovie(movie);

		let isMounted = true;

		// Favori ve liste durumlarını sorgula
		async function checkStates() {
			try {
				const status = await getContentLibraryStatus(movieId);
				if (isMounted) {
					setIsFav(status.isFav);
					setInList(status.inPlanned);
					setActiveStatus(status.currentList);
				}
			} catch (e) {
				console.warn("Durum kontrolü hatası:", e);
			}
		}

		// Arka planda detayları zenginleştir
		async function enrichData() {
			const targetPlatform = movie.plugin || platformName;
			if (!targetPlatform || !movie.url) return;

			try {
				setLoadingDetails(true);
				const details = await fetchPluginDetail(targetPlatform, movie.url);
				if (isMounted && details) {
					setEnrichedMovie((prev) => ({
						...prev,
						...details,
						title: details.title || prev.title,
						poster: details.poster_url || details.poster || prev.poster,
						rating: details.rating != null ? details.rating : prev.rating,
						description: details.description || details.overview || prev.description,
						year: details.year || details.release_date || prev.year,
						content_type: details.content_type || (details.is_series ? "series" : "movie") || prev.content_type,
						fragman_url: details.fragman_url || prev.fragman_url,
					}));
				}
			} catch (e) {
				console.warn("Modal detay zenginleştirme hatası:", e);
			} finally {
				if (isMounted) setLoadingDetails(false);
			}
		}

		checkStates();
		enrichData();

		return () => {
			isMounted = false;
		};
	}, [visible, movie, platformName, movieId]);

	if (!visible || !movie) return null;

	const currentItem = enrichedMovie || movie;

	const posterUri =
		currentItem.poster ||
		currentItem.poster_url ||
		currentItem.image ||
		currentItem.backdrop_url ||
		currentItem.thumbnail ||
		"https://images.unsplash.com/photo-1534447677768-be436bb09401?w=800&auto=format&fit=crop&q=60";

	const backdropUri =
		currentItem.backdrop_url ||
		currentItem.backdrop ||
		posterUri;

	const title = currentItem.title || currentItem.name || "İçerik";
	const rating =
		currentItem.rating != null
			? typeof currentItem.rating === "number"
				? currentItem.rating.toFixed(1)
				: parseFloat(currentItem.rating)
					? parseFloat(currentItem.rating).toFixed(1)
					: currentItem.rating
			: "8.4";

	const isSeries =
		currentItem.is_series === true ||
		currentItem.content_type === "series" ||
		currentItem.type === "series" ||
		Boolean(currentItem.season || currentItem.episode || currentItem.seasons);

	const typeBadgeText = isSeries ? "Dizi" : "Film";
	const yearText =
		currentItem.year ||
		(currentItem.release_date ? currentItem.release_date.split("-")[0] : null) ||
		"2026";

	const synopsis =
		currentItem.description ||
		currentItem.overview ||
		currentItem.synopsis ||
		"Bu yapım hakkında henüz detaylı açıklama eklenmemiş. Detaylar sayfasına giderek oyuncu kadrosu, fragman ve bölümleri görüntüleyebilirsiniz.";

	// Durum değiştirme (Status Chips)
	const handleStatusSelect = async (statusKey) => {
		const prev = activeStatus;
		const selectedChip = STATUS_CHIPS.find((c) => c.key === statusKey);
		const label = selectedChip ? selectedChip.label : statusKey;

		try {
			const res = await setContentLibraryList(currentItem, statusKey);
			setActiveStatus(res);
			setInList(res === "planned");

			setToastInfo({
				text: `Kitaplığınıza eklendi ("${label}" listesi)`,
				prevStatus: prev,
			});
		} catch (e) {
			console.error("Durum güncellenirken hata:", e);
		}
	};

	// Geri Al işlemi
	const handleUndoToast = async () => {
		if (toastInfo?.prevStatus) {
			await setContentLibraryList(currentItem, toastInfo.prevStatus);
			setActiveStatus(toastInfo.prevStatus);
			setInList(toastInfo.prevStatus === "planned");
		}
		setToastInfo(null);
	};

	// Favori Değiştir
	const handleToggleFavorite = async () => {
		try {
			const res = await toggleFavorite({ ...currentItem, id: movieId });
			setIsFav(res);
		} catch (e) {
			console.error("Favori toggle hata:", e);
		}
	};

	// Listeme Ekle / Liste Seçim Modalı Aç (Hangi listeye ekleneceğini sorar)
	const handleToggleList = () => {
		setIsListSelectVisible(true);
	};

	// Bildirim Butonu
	const handleToggleNotification = () => {
		setIsNotificationOn((prev) => !prev);
		Alert.alert(
			isNotificationOn ? "Bildirimler Kapatıldı" : "Bildirimler Açıldı",
			isNotificationOn
				? `"${title}" için yeni bölüm bildirimleri kapatıldı.`
				: `"${title}" için yeni bölüm bildirimleri açıldı. Yeni bölümler yayınlandığında haberdar edileceksiniz.`,
		);
	};

	// Paylaşım
	const handleShare = async () => {
		try {
			await Share.share({
				title,
				message: `StreamPulse'da "${title}" izle! ${currentItem.url || ""}`,
			});
		} catch (e) {
			console.error("Paylaşım hatası:", e);
		}
	};

	// Fragman Önizleme
	const handleTrailerClick = async () => {
		if (currentItem.fragman_url) {
			try {
				await WebBrowser.openBrowserAsync(currentItem.fragman_url);
			} catch (e) {
				setShowTrailerPreview(true);
			}
		} else {
			setShowTrailerPreview((prev) => !prev);
		}
	};

	// Oynatıcıyı Başlat
	const handlePlay = () => {
		onClose();
		if (onPlayPress) {
			onPlayPress(currentItem);
			return;
		}

		let playUrl = currentItem.url;
		let playSubtitle = "";

		if (isSeries && currentItem.seasons) {
			const firstSeasonKey = Object.keys(currentItem.seasons)[0];
			const firstEp = currentItem.seasons[firstSeasonKey]?.[0];
			if (firstEp?.url) {
				playUrl = firstEp.url;
				playSubtitle = `${firstSeasonKey}. Sezon 1. Bölüm`;
			}
		}

		if (!playUrl) {
			// Detay sayfasına yönlendir
			handleNavigateDetails();
			return;
		}

		router.push({
			pathname: "/(app)/player",
			params: {
				url: playUrl,
				title,
				subtitle: playSubtitle,
				plugin: currentItem.plugin || platformName,
				movieId,
			},
		});
	};

	// Detaylara Git
	const handleNavigateDetails = () => {
		onClose();
		if (onDetailsPress) {
			onDetailsPress(currentItem);
			return;
		}

		const id = encodeURIComponent(currentItem.url || movieId);
		router.push({
			pathname: "/(app)/MovieDetails/[id]",
			params: {
				id,
				plugin: currentItem.plugin || platformName,
				movieData: JSON.stringify(currentItem),
			},
		});
	};

	return (
		<Modal
			visible={visible}
			transparent
			animationType="fade"
			statusBarTranslucent
			onRequestClose={onClose}>
			<Pressable style={styles.backdropOverlay} onPress={onClose}>
				<Pressable style={styles.sheetContainer} onPress={(e) => e.stopPropagation()}>
					{/* 1. Üst Tutamaç (Drag Handle) */}
					<View style={styles.dragHandle} />

					{/* 2. Toast Bildirim Banner'ı (Screen 2) */}
					{toastInfo && (
						<View style={styles.toastBanner}>
							<View style={styles.toastLeft}>
								<Ionicons
									name="checkmark-circle"
									size={16}
									color="#10B981"
								/>
								<Text style={styles.toastText} numberOfLines={1}>
									{toastInfo.text}
								</Text>
							</View>
							<TVPressable
								onPress={handleUndoToast}
								style={styles.undoButton}
								focusedStyle={styles.btnFocused}
								activeOpacity={0.7}>
								<Text style={styles.undoButtonText}>Geri Al</Text>
							</TVPressable>
						</View>
					)}

					<ScrollView
						showsVerticalScrollIndicator={false}
						bounces={false}
						contentContainerStyle={styles.scrollContent}>
						{/* 3. Fragman / Video Önizleme Durumu (Screen 3) */}
						{showTrailerPreview ? (
							<View style={styles.trailerPreviewBox}>
								<Image
									source={{ uri: backdropUri }}
									style={styles.trailerBackdrop}
									contentFit="cover"
								/>
								<View style={styles.trailerOverlay}>
									{/* Canlı Gösterge Rozeti */}
									<View style={styles.trailerTopRow}>
										<View style={styles.liveBadge}>
											<View style={styles.liveDot} />
											<Text style={styles.liveBadgeText}>
												Fragman Oynatılıyor
											</Text>
										</View>
										<View style={styles.top10Badge}>
											<Text style={styles.top10Text}>TOP 10</Text>
										</View>
									</View>

									{/* Ortada Oynat/Durdur */}
									<TVPressable
										style={styles.centerPlayBtn}
										focusedStyle={styles.centerPlayBtnFocused}
										onPress={handleTrailerClick}
										activeOpacity={0.85}>
										<Ionicons
											name="play"
											size={28}
											color="#ffffff"
										/>
									</TVPressable>

									{/* Alt İlerleme Çubuğu ve Ses */}
									<View style={styles.trailerBottomBar}>
										<View style={styles.trailerProgressContainer}>
											<View style={styles.trailerProgressBar}>
												<View style={styles.trailerProgressFill} />
											</View>
											<Text style={styles.trailerTimeText}>0:14 / 1:45</Text>
										</View>
										<TVPressable
											onPress={() => setIsMuted((m) => !m)}
											style={styles.muteButton}
											focusedStyle={styles.iconCircleBtnFocused}>
											<Ionicons
												name={isMuted ? "volume-mute-outline" : "volume-high-outline"}
												size={18}
												color="#ffffff"
											/>
										</TVPressable>
									</View>
								</View>
							</View>
						) : null}

						{/* 4. Ana Önizleme Başlığı: Poster + Meta Detaylar (Screen 1 & 2) */}
						<View style={styles.previewHeaderRow}>
							{/* Sol Afiş (Poster) */}
							<TVPressable
								style={styles.posterWrapper}
								focusedStyle={styles.posterWrapperFocused}
								activeOpacity={0.9}
								onPress={handleTrailerClick}>
								<Image
									source={{ uri: posterUri }}
									style={styles.posterImage}
									contentFit="cover"
									transition={200}
								/>
								{/* Top 10 Rozeti */}
								<View style={styles.posterTopBadge}>
									<Text style={styles.posterTopBadgeText}>TOP 10</Text>
								</View>
								{/* HD Rozeti */}
								<View style={styles.posterHdBadge}>
									<Text style={styles.posterHdText}>HD</Text>
								</View>
							</TVPressable>

							{/* Sağ Sütun: Başlık, İkonlar, Meta & Özet */}
							<View style={styles.detailsColumn}>
								{/* Başlık & Hızlı İkonlar */}
								<View style={styles.titleRow}>
									<Text style={styles.movieTitle} numberOfLines={1}>
										{title}
									</Text>
									<View style={styles.headerIconActions}>
										{/* Bildirim Çanı */}
										<TVPressable
											style={styles.iconCircleBtn}
											focusedStyle={styles.iconCircleBtnFocused}
											onPress={handleToggleNotification}
											activeOpacity={0.75}>
											<Ionicons
												name={
													isNotificationOn
														? "notifications"
														: "notifications-outline"
												}
												size={18}
												color={
													isNotificationOn
														? "#E50914"
														: "#cbd5e1"
												}
											/>
										</TVPressable>
										{/* Favori Kalp */}
										<TVPressable
											style={styles.iconCircleBtn}
											focusedStyle={styles.iconCircleBtnFocused}
											onPress={handleToggleFavorite}
											activeOpacity={0.75}>
											<Ionicons
												name={isFav ? "heart" : "heart-outline"}
												size={19}
												color={isFav ? "#E50914" : "#cbd5e1"}
											/>
										</TVPressable>
									</View>
								</View>

								{/* Rozetler ve Puanlar */}
								<View style={styles.metaBadgesRow}>
									<View style={styles.typeBadge}>
										<Text style={styles.typeBadgeText}>
											{typeBadgeText}
										</Text>
									</View>
									<Text style={styles.metaYearText}>{yearText}</Text>
									<Text style={styles.metaDot}>•</Text>
									<View style={styles.ratingBox}>
										<Ionicons
											name="star"
											size={12}
											color="#F5C518"
										/>
										<Text style={styles.ratingText}>{rating}</Text>
									</View>
									<Text style={styles.metaDot}>•</Text>
									<View style={styles.hdrBadge}>
										<Text style={styles.hdrText}>4K HDR</Text>
									</View>
								</View>

								{/* Sinopsis Açıklaması */}
								<Text style={styles.synopsisText} numberOfLines={3}>
									{synopsis}
								</Text>
							</View>
						</View>

						{/* 5. DURUMU GÜNCELLE Çip Seçici (Screen 2) */}
						<View style={styles.statusSection}>
							<View style={styles.statusSectionHeader}>
								<Text style={styles.statusSectionTitle}>
									DURUMU GÜNCELLE
								</Text>
								<Text style={styles.statusSectionSub}>
									Değiştirmek için dokunun
								</Text>
							</View>

							<ScrollView
								horizontal
								showsHorizontalScrollIndicator={false}
								contentContainerStyle={styles.statusChipsScroll}>
								{STATUS_CHIPS.map((chip) => {
									const isActive = activeStatus === chip.key;
									return (
										<TVPressable
											key={chip.key}
											style={[
												styles.statusChip,
												isActive && styles.statusChipActive,
											]}
											focusedStyle={styles.statusChipFocused}
											onPress={() => handleStatusSelect(chip.key)}
											activeOpacity={0.8}>
											{isActive && (
												<Ionicons
													name="checkmark"
													size={14}
													color="#ffffff"
												/>
											)}
											<Text
												style={[
													styles.statusChipText,
													isActive && styles.statusChipTextActive,
												]}>
												{chip.label}
											</Text>
										</TVPressable>
									);
								})}
							</ScrollView>
						</View>

						{/* 6. Ana Eylem Butonları Izgarası (Screen 1 & 2) */}
						<View style={styles.actionButtonsGrid}>
							{/* Listeme Ekle / Liste Seçim Butonu */}
							<TVPressable
								style={[
									styles.actionBtnSecondary,
									activeStatus && styles.actionBtnInList,
								]}
								focusedStyle={styles.actionBtnFocused}
								onPress={handleToggleList}
								activeOpacity={0.85}>
								<Ionicons
									name={
										activeStatus === "watching"
											? "play-circle"
											: activeStatus === "planned"
												? "bookmark"
												: activeStatus === "completed"
													? "checkmark-circle"
													: "add"
									}
									size={18}
									color={
										activeStatus === "watching"
											? "#E50914"
											: activeStatus === "planned"
												? "#38bdf8"
												: activeStatus === "completed"
													? "#10B981"
													: "#ffffff"
									}
								/>
								<Text style={styles.actionBtnSecondaryText}>
									{activeStatus === "watching"
										? "İzleniyor"
										: activeStatus === "planned"
											? "Planlandı"
											: activeStatus === "completed"
												? "Tamamlandı"
												: "Listeme Ekle"}
								</Text>
							</TVPressable>

							{/* Daha Fazla Bilgi Butonu */}
							<TVPressable
								style={styles.actionBtnPrimary}
								focusedStyle={styles.actionBtnFocused}
								onPress={handleNavigateDetails}
								activeOpacity={0.85}>
								<Ionicons
									name="open-outline"
									size={17}
									color="#000000"
								/>
								<Text style={styles.actionBtnPrimaryText}>
									Daha fazla bilgi
								</Text>
							</TVPressable>
						</View>

						{/* 7. Büyük Kırmızı CTA (Hemen İzle) */}
						<TVPressable
							autoFocus={true}
							style={styles.prominentCtaButton}
							focusedStyle={styles.prominentCtaFocused}
							onPress={handlePlay}
							activeOpacity={0.85}>
							<Ionicons name="play" size={18} color="#ffffff" />
							<Text style={styles.prominentCtaText}>
								{isSeries ? "Bölüm 1'i Başlat" : "Hemen Şimdi İzle"}
							</Text>
						</TVPressable>

						{/* 8. Alt Hızlı Eylemler (İndir, Paylaş, Fragman, Detaylar) */}
						<View style={styles.quickSubActionsRow}>
							<TVPressable
								style={styles.subActionItem}
								focusedStyle={styles.subActionItemFocused}
								onPress={handleTrailerClick}
								activeOpacity={0.75}>
								<Ionicons
									name="videocam-outline"
									size={18}
									color="#cbd5e1"
								/>
								<Text style={styles.subActionLabel}>Fragman</Text>
							</TVPressable>

							<TVPressable
								style={styles.subActionItem}
								focusedStyle={styles.subActionItemFocused}
								onPress={() =>
									Alert.alert(
										"İndirme",
										`"${title}" indirme kuyruğuna ekleniyor...`,
									)
								}
								activeOpacity={0.75}>
								<Ionicons
									name="download-outline"
									size={18}
									color="#cbd5e1"
								/>
								<Text style={styles.subActionLabel}>İndir</Text>
							</TVPressable>

							<TVPressable
								style={styles.subActionItem}
								focusedStyle={styles.subActionItemFocused}
								onPress={handleShare}
								activeOpacity={0.75}>
								<Ionicons
									name="share-social-outline"
									size={18}
									color="#cbd5e1"
								/>
								<Text style={styles.subActionLabel}>Paylaş</Text>
							</TVPressable>

							<TVPressable
								style={styles.subActionItem}
								focusedStyle={styles.subActionItemFocused}
								onPress={handleNavigateDetails}
								activeOpacity={0.75}>
								<Ionicons
									name="information-circle-outline"
									size={18}
									color="#cbd5e1"
								/>
								<Text style={styles.subActionLabel}>Detaylar</Text>
							</TVPressable>
						</View>

						{/* Home Bar Indicator Spacer */}
						<View style={styles.homeIndicatorBar} />
					</ScrollView>
				</Pressable>
			</Pressable>

			{/* Liste Seçim Modalı */}
			<ListSelectModal
				visible={isListSelectVisible}
				movie={currentItem}
				onClose={() => setIsListSelectVisible(false)}
				onStatusChanged={(newStatus, newFav) => {
					setActiveStatus(newStatus);
					setInList(newStatus === "planned");
					if (newFav !== undefined) setIsFav(newFav);
				}}
			/>
		</Modal>
	);
}

const styles = StyleSheet.create({
	backdropOverlay: {
		flex: 1,
		backgroundColor: "rgba(0, 0, 0, 0.75)",
		justifyContent: "flex-end",
	},
	sheetContainer: {
		backgroundColor: "#121620",
		borderTopLeftRadius: 26,
		borderTopRightRadius: 26,
		borderTopWidth: 1,
		borderTopColor: "rgba(255, 255, 255, 0.12)",
		maxHeight: "88%",
		paddingTop: 10,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: -8 },
		shadowOpacity: 0.6,
		shadowRadius: 16,
		elevation: 20,
	},
	dragHandle: {
		width: 40,
		height: 4,
		borderRadius: 2,
		backgroundColor: "rgba(255, 255, 255, 0.25)",
		alignSelf: "center",
		marginBottom: 10,
	},

	/* Toast Banner (Screen 2) */
	toastBanner: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		backgroundColor: "rgba(16, 185, 129, 0.14)",
		borderWidth: 1,
		borderColor: "rgba(16, 185, 129, 0.35)",
		borderRadius: 12,
		marginHorizontal: 16,
		marginBottom: 12,
		paddingHorizontal: 12,
		paddingVertical: 9,
	},
	toastLeft: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		flex: 1,
	},
	toastText: {
		color: "#10B981",
		fontSize: 12,
		fontWeight: "600",
		flex: 1,
	},
	undoButton: {
		paddingHorizontal: 6,
		paddingVertical: 2,
	},
	undoButtonText: {
		color: "#cbd5e1",
		fontSize: 12,
		fontWeight: "700",
	},

	scrollContent: {
		paddingHorizontal: 16,
		paddingBottom: 24,
	},

	/* Fragman / Video Önizleme Box (Screen 3) */
	trailerPreviewBox: {
		width: "100%",
		height: 180,
		borderRadius: 16,
		overflow: "hidden",
		marginBottom: 16,
		backgroundColor: "#0B0E14",
		position: "relative",
		borderWidth: 1,
		borderColor: "rgba(255, 255, 255, 0.1)",
	},
	trailerBackdrop: {
		width: "100%",
		height: "100%",
	},
	trailerOverlay: {
		...StyleSheet.absoluteFillObject,
		backgroundColor: "rgba(0, 0, 0, 0.45)",
		justifyContent: "space-between",
		padding: 12,
	},
	trailerTopRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
	liveBadge: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		backgroundColor: "rgba(229, 9, 20, 0.9)",
		paddingHorizontal: 8,
		paddingVertical: 3,
		borderRadius: 6,
	},
	liveDot: {
		width: 6,
		height: 6,
		borderRadius: 3,
		backgroundColor: "#ffffff",
	},
	liveBadgeText: {
		color: "#ffffff",
		fontSize: 10,
		fontWeight: "700",
	},
	top10Badge: {
		backgroundColor: "rgba(0, 0, 0, 0.7)",
		borderWidth: 1,
		borderColor: "#E50914",
		paddingHorizontal: 6,
		paddingVertical: 2,
		borderRadius: 4,
	},
	top10Text: {
		color: "#E50914",
		fontSize: 9,
		fontWeight: "800",
	},
	centerPlayBtn: {
		width: 52,
		height: 52,
		borderRadius: 26,
		backgroundColor: "rgba(0, 0, 0, 0.65)",
		borderWidth: 1.5,
		borderColor: "rgba(255, 255, 255, 0.4)",
		justifyContent: "center",
		alignItems: "center",
		alignSelf: "center",
	},
	trailerBottomBar: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 12,
	},
	trailerProgressContainer: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
	},
	trailerProgressBar: {
		flex: 1,
		height: 3,
		backgroundColor: "rgba(255, 255, 255, 0.3)",
		borderRadius: 1.5,
	},
	trailerProgressFill: {
		width: "25%",
		height: "100%",
		backgroundColor: "#E50914",
		borderRadius: 1.5,
	},
	trailerTimeText: {
		color: "#cbd5e1",
		fontSize: 10,
		fontWeight: "600",
	},
	muteButton: {
		padding: 4,
	},

	/* Header Row (Screen 1 & 2) */
	previewHeaderRow: {
		flexDirection: "row",
		gap: 14,
		alignItems: "flex-start",
	},
	posterWrapper: {
		width: 96,
		height: 144,
		borderRadius: 12,
		overflow: "hidden",
		backgroundColor: "#161B24",
		borderWidth: 1,
		borderColor: "rgba(255, 255, 255, 0.15)",
		position: "relative",
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.5,
		shadowRadius: 6,
		elevation: 5,
	},
	posterImage: {
		width: "100%",
		height: "100%",
	},
	posterTopBadge: {
		position: "absolute",
		top: 6,
		left: 6,
		backgroundColor: "#E50914",
		paddingHorizontal: 5,
		paddingVertical: 2,
		borderRadius: 3,
	},
	posterTopBadgeText: {
		color: "#ffffff",
		fontSize: 8,
		fontWeight: "800",
		letterSpacing: 0.3,
	},
	posterHdBadge: {
		position: "absolute",
		bottom: 6,
		right: 6,
		backgroundColor: "rgba(0, 0, 0, 0.8)",
		borderWidth: 1,
		borderColor: "rgba(255, 255, 255, 0.2)",
		paddingHorizontal: 4,
		paddingVertical: 1,
		borderRadius: 3,
	},
	posterHdText: {
		color: "#cbd5e1",
		fontSize: 8,
		fontWeight: "700",
	},

	/* Details Column */
	detailsColumn: {
		flex: 1,
		paddingTop: 2,
	},
	titleRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginBottom: 6,
		gap: 8,
	},
	movieTitle: {
		flex: 1,
		fontSize: 17,
		fontWeight: "800",
		color: "#ffffff",
		letterSpacing: -0.3,
	},
	headerIconActions: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
	},
	iconCircleBtn: {
		width: 32,
		height: 32,
		borderRadius: 16,
		backgroundColor: "#1A202E",
		borderWidth: 1,
		borderColor: "rgba(255, 255, 255, 0.08)",
		justifyContent: "center",
		alignItems: "center",
	},

	/* Badges */
	metaBadgesRow: {
		flexDirection: "row",
		alignItems: "center",
		flexWrap: "wrap",
		gap: 6,
		marginBottom: 8,
	},
	typeBadge: {
		backgroundColor: "#1F2533",
		borderWidth: 1,
		borderColor: "rgba(255, 255, 255, 0.08)",
		paddingHorizontal: 7,
		paddingVertical: 2,
		borderRadius: 5,
	},
	typeBadgeText: {
		color: "#e2e8f0",
		fontSize: 10,
		fontWeight: "700",
	},
	metaYearText: {
		color: "#94a3b8",
		fontSize: 11,
		fontWeight: "600",
	},
	metaDot: {
		color: "#64748b",
		fontSize: 10,
	},
	ratingBox: {
		flexDirection: "row",
		alignItems: "center",
		gap: 3,
	},
	ratingText: {
		color: "#F5C518",
		fontSize: 11,
		fontWeight: "800",
	},
	hdrBadge: {
		borderWidth: 1,
		borderColor: "rgba(255, 255, 255, 0.2)",
		paddingHorizontal: 4,
		paddingVertical: 1,
		borderRadius: 3,
	},
	hdrText: {
		color: "#94a3b8",
		fontSize: 9,
		fontWeight: "700",
	},

	synopsisText: {
		fontSize: 11.5,
		color: "#94a3b8",
		lineHeight: 16,
	},

	/* Durumu Güncelle Section (Screen 2) */
	statusSection: {
		marginTop: 16,
		paddingTop: 12,
		borderTopWidth: 1,
		borderTopColor: "rgba(255, 255, 255, 0.08)",
	},
	statusSectionHeader: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginBottom: 8,
	},
	statusSectionTitle: {
		fontSize: 11,
		fontWeight: "800",
		color: "#94a3b8",
		letterSpacing: 0.6,
	},
	statusSectionSub: {
		fontSize: 10,
		color: "#64748b",
	},
	statusChipsScroll: {
		gap: 8,
		paddingVertical: 2,
	},
	statusChip: {
		flexDirection: "row",
		alignItems: "center",
		gap: 5,
		backgroundColor: "#1A202D",
		borderWidth: 1,
		borderColor: "rgba(255, 255, 255, 0.08)",
		paddingHorizontal: 12,
		paddingVertical: 7,
		borderRadius: 18,
	},
	statusChipActive: {
		backgroundColor: "#E50914",
		borderColor: "#E50914",
		shadowColor: "#E50914",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.4,
		shadowRadius: 6,
		elevation: 4,
	},
	statusChipText: {
		fontSize: 11,
		fontWeight: "600",
		color: "#cbd5e1",
	},
	statusChipTextActive: {
		color: "#ffffff",
		fontWeight: "700",
	},

	/* Eylem Butonları (Grid) */
	actionButtonsGrid: {
		flexDirection: "row",
		gap: 10,
		marginTop: 14,
	},
	actionBtnSecondary: {
		flex: 1,
		height: 44,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 6,
		backgroundColor: "#1E2535",
		borderWidth: 1,
		borderColor: "rgba(255, 255, 255, 0.08)",
		borderRadius: 12,
	},
	actionBtnInList: {
		borderColor: "rgba(16, 185, 129, 0.4)",
		backgroundColor: "rgba(16, 185, 129, 0.1)",
	},
	actionBtnSecondaryText: {
		fontSize: 12,
		fontWeight: "700",
		color: "#ffffff",
	},
	actionBtnPrimary: {
		flex: 1.25,
		height: 44,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 6,
		backgroundColor: "#ffffff",
		borderRadius: 12,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.3,
		shadowRadius: 4,
		elevation: 3,
	},
	actionBtnPrimaryText: {
		fontSize: 12,
		fontWeight: "800",
		color: "#000000",
	},

	/* Prominent CTA */
	prominentCtaButton: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		backgroundColor: "#E50914",
		height: 46,
		borderRadius: 14,
		marginTop: 10,
		shadowColor: "#E50914",
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.35,
		shadowRadius: 8,
		elevation: 5,
	},
	prominentCtaText: {
		color: "#ffffff",
		fontSize: 13,
		fontWeight: "800",
		letterSpacing: 0.2,
	},

	/* Quick Sub-actions Row */
	quickSubActionsRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-around",
		marginTop: 12,
		paddingTop: 10,
		borderTopWidth: 1,
		borderTopColor: "rgba(255, 255, 255, 0.06)",
	},
	subActionItem: {
		alignItems: "center",
		gap: 4,
		paddingHorizontal: 8,
		paddingVertical: 4,
	},
	subActionLabel: {
		fontSize: 10,
		fontWeight: "600",
		color: "#94a3b8",
	},

	homeIndicatorBar: {
		width: 120,
		height: 4,
		borderRadius: 2,
		backgroundColor: "rgba(255, 255, 255, 0.2)",
		alignSelf: "center",
		marginTop: 16,
	},
	btnFocused: {
		borderWidth: 1.5,
		borderColor: "#FFFFFF",
		transform: [{ scale: 1.05 }],
	},
	centerPlayBtnFocused: {
		borderWidth: 2,
		borderColor: "#FFFFFF",
		backgroundColor: "#b20710",
		transform: [{ scale: 1.15 }],
	},
	posterWrapperFocused: {
		borderWidth: 2,
		borderColor: "#E50914",
		transform: [{ scale: 1.04 }],
	},
	iconCircleBtnFocused: {
		borderWidth: 1.5,
		borderColor: "#E50914",
		backgroundColor: "rgba(229, 9, 20, 0.2)",
		transform: [{ scale: 1.1 }],
	},
	statusChipFocused: {
		borderWidth: 1.5,
		borderColor: "#E50914",
		backgroundColor: "rgba(229, 9, 20, 0.2)",
		transform: [{ scale: 1.06 }],
	},
	actionBtnFocused: {
		borderWidth: 2,
		borderColor: "#E50914",
		transform: [{ scale: 1.03 }],
	},
	prominentCtaFocused: {
		borderWidth: 2,
		borderColor: "#FFFFFF",
		backgroundColor: "#b20710",
		transform: [{ scale: 1.03 }],
	},
	subActionItemFocused: {
		backgroundColor: "rgba(229, 9, 20, 0.15)",
		borderRadius: 8,
		transform: [{ scale: 1.08 }],
	},
});
