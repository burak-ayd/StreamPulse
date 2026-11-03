import { FontFamily, Palette } from "@/constants/theme";
import { useFeedback } from "@/components/feedback/AppFeedbackProvider";
import TVPressable, {
	isTVPressSuppressed,
} from "@/components/common/TVPressable";
import ListSelectModal from "@/components/modal/ListSelectModal";
import { useDownload } from "@/context/DownloadContext";
import { fetchPluginDetail } from "@/services/api";
import { isSeriesContent, typeLabel } from "@/utils/mediaType";
import {
	getContentLibraryStatus,
	setContentLibraryList,
	toggleFavorite,
} from "@/utils/storage";
import { useTvMetrics } from "@/utils/tvMetrics";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import Image from "@/components/common/SmartImage";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useState } from "react";
import {
	BackHandler,
	Modal,
	Pressable,
	ScrollView,
	Share,
	StyleSheet,
	Text,
	Vibration,
	View,
} from "react-native";

const STATUS_CHIPS = [
	{ key: "watching", label: "İzleniyor", color: Palette.primary },
	{ key: "planned", label: "Planlandı", color: Palette.secondary },
	{ key: "completed", label: "Tamamlandı", color: Palette.secondary },
];

export default function QuickPreviewModal({
	visible,
	movie,
	platformName,
	onClose,
	onPlayPress,
	onDetailsPress,
}) {
	const { toast } = useFeedback();
	const router = useRouter();

	/**
	 * TV: bu modal bir ALT SAYFA olarak tasarlanmıştı — ekranın altına
	 * yapışan, %88 yüksekliğinde, içinde 96×144 poster ve telefon punto
	 * metinler bulunan bir panel. 1080p TV'de ekranın üst üçte biri
	 * boşa gidiyor, geri kalanı da 3 metreden okunmuyordu.
	 *
	 * TV'de ortalanmış, sabit genişlikli bir DİYALOG olur; telefon ve
	 * tablette davranış ve ölçüler BİREBİR aynı kalır (`isTV ? … : …`).
	 */
	const { isTV, sp, focusScale, height, width: windowWidth } = useTvMetrics();
	const { requestDownload } = useDownload();

	const [enrichedMovie, setEnrichedMovie] = useState(movie || null);
	const [isFav, setIsFav] = useState(false);
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
		} catch (_e) {
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
					setActiveStatus(status.currentList);
				}
			} catch (e) {
				console.warn("Durum kontrolü hatası:", e);
			}
		}

		/*
		 * Arka planda detayları zenginleştir.
		 *
		 * ⚠️ Burada eskiden bir `loadingDetails` durumu vardı ve
		 * `setLoadingDetails(true/false)` çağrılıyordu — ama DÜZENİN HİÇBİR
		 * YERİNDE okunmuyordu. Yani spinner gösterecek bir yol yoktu,
		 * sadece iki gereksiz render tetikleniyordu. Durum kaldırıldı;
		 * zenginleştirme çalışmaya devam ediyor, `setEnrichedMovie` aynı
		 * zamanda render'ı zaten tetikliyor.
		 */
		async function enrichData() {
			const targetPlatform = movie.plugin || platformName;
			if (!targetPlatform || !movie.url) return;

			try {
				const details = await fetchPluginDetail(
					targetPlatform,
					movie.url,
				);
				if (isMounted && details) {
					setEnrichedMovie((prev) => ({
						...prev,
						...details,
						title: details.title || prev.title,
						poster:
							details.poster_url || details.poster || prev.poster,
						rating:
							details.rating != null
								? details.rating
								: prev.rating,
						description:
							details.description ||
							details.overview ||
							prev.description,
						year: details.year || details.release_date || prev.year,
						content_type:
							details.content_type ||
							(details.is_series ? "series" : "movie") ||
							prev.content_type,
						fragman_url: details.fragman_url || prev.fragman_url,
					}));
				}
			} catch (e) {
				console.warn("Modal detay zenginleştirme hatası:", e);
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
		currentItem.backdrop_url || currentItem.backdrop || posterUri;

	const title = currentItem.title || currentItem.name || "İçerik";
	const rating =
		currentItem.rating != null
			? typeof currentItem.rating === "number"
				? currentItem.rating.toFixed(1)
				: parseFloat(currentItem.rating)
					? parseFloat(currentItem.rating).toFixed(1)
					: currentItem.rating
			: "8.4";

	// Tek kaynak: `utils/mediaType.js` (bkz. o dosyanın başlığı).
	const isSeries = isSeriesContent(currentItem);
	const typeBadgeText = typeLabel(currentItem);
	const yearText =
		currentItem.year ||
		(currentItem.release_date
			? currentItem.release_date.split("-")[0]
			: null) ||
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
		toast.info(isNotificationOn
				? `"${title}" için yeni bölüm bildirimleri kapatıldı.`
				: `"${title}" için yeni bölüm bildirimleri açıldı. Yeni bölümler yayınlandığında haberdar edileceksiniz.`);
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
			} catch (_e) {
				setShowTrailerPreview(true);
			}
		} else {
			setShowTrailerPreview((prev) => !prev);
		}
	};


	/**
	 * İndirme: merkezi akış (DownloadContext.requestDownload).
	 * Dizide ilk oynatılabilir bölüm hedeflenir; film doğrudan içerik.
	 */
	const handleDownload = () => {
		const content = {
			id: currentItem.id || currentItem.url || movieId,
			url: currentItem.url,
			title,
			plugin: currentItem.plugin || platformName,
			poster_url: currentItem.poster || currentItem.poster_url,
			seasons: currentItem.seasons,
		};

		let episode = null;
		if (isSeries && currentItem.seasons) {
			const seasonKey = Object.keys(currentItem.seasons).sort((a, b) => Number(a) - Number(b))[0];
			const epList = currentItem.seasons[seasonKey] || [];
			const first = epList.find((e) => e?.url) || epList[0];
			if (first?.url) {
				episode = {
					season: Number(seasonKey),
					episode: Number(first.episode || first.episode_number || 1),
					episodeTitle: first.title || null,
					url: first.url,
				};
			}
		}

		if (isSeries && !episode) {
			toast.info("İndirme için oynatılabilir bölüm bağlantısı bulunamadı.");
			return;
		}
		if (!content.url) {
			toast.info("İndirme için video bağlantısı bulunamadı.");
			return;
		}

		requestDownload({ content, episode });
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

	/**
	 * TV: DİYALOG — TEK EKRANDA, KAYDIRMA YOK.
	 *
	 * Sorun: panelde alt alta 6 blok vardı (başlık/rozet, özet, durum
	 * çipleri, aksiyon grid'i, kırmızı CTA, alt hızlı eylemler) ve
	 * hepsi tek sütunda dizildiği için 1080p'de içerik panele sığmıyor,
	 * kullanıcı kaydırmak zorunda kalıyordu. TV kumandasında d-pad ile
	 * kaydırma ayrıca zahmetli: odak çerçevesi kaybolunca nerede olduğunu
	 * bilmek zor.
	 *
	 * Çözüm YATAY YERLEŞİM: tek sütun yerine iki kolon. Görsel olan her
	 * şey (poster / fragman önizlemesi + özet) sola, metin ve eylemler
	 * sağa. 1080p'de sağ kolonun ≈700dp'sine 6 blok rahat sığar; dikey
	 * scroll hiç oluşmaz.
	 *
	 * Ekran yüksekliği sınırı ikinci bir güvenlik ağı: içerik bir
	 * platformun çok uzun açıklamasıyla taşarsa `ScrollView` devreye
	 * girer ve kullanıcı yine de içeriğin sonuna ulaşabilir.
	 */
	const tvDialogMaxHeight = isTV
		? Math.max(sp(360), height - 2 * sp(24))
		: undefined;

	/**
	 * Panel genişliği: iki kolonun rahat çalışması için ekranın ~%76'sı.
	 * @media dar TV'lerde `sp(24)` kenar payıyla sınırlanır.
	 */
	const tvPanelMaxWidth = isTV
		? Math.min(sp(700), windowWidth - 2 * sp(24))
		: undefined;

	/**
	 * TELEFON dalı (width < 600, ~360–430dp): dikey stack bottom-sheet.
	 *
	 * Sorun: eski yapıda `previewHeaderRow` row + poster 140 + gap 18 +
	 * padding 16×2 → detay kolonu sadece ~200dp kalıyordu (390-32-140-18).
	 * Başlık eziliyor, "Daha fazla bilgi" ve 3. chip kesiliyor, 4 hızlı
	 * eylem ~50dp'ye sıkışıyordu.
	 *
	 * Çözüm (sadece `isPhone`): poster+başlık üstte kompakt header, özet
	 * ve TÜM eylemler ScrollView'un doğrudan çocuğu olarak tam genişlikte
	 * (~358dp @390). TV ve tablet dallarına HİÇ dokunulmaz.
	 */
	const isPhone = !isTV && windowWidth < 600;
	const phonePosterW = Math.min(112, windowWidth * 0.28);
	const phonePosterH = phonePosterW * 1.5;
	// Dar telefonda (<380) "Değiştirmek için dokunun" başlıkla aynı satıra
	// sığmaz — gizle, taşmayı önle. Tablet/TV davranışı aynı kalır.
	const showStatusSubText = isPhone ? windowWidth >= 380 : !isTV;

	/* ── Ortak bloklar: telefon + tablet aynı handler'ları kullanır ── */

	const renderStatusSection = (phone = false) => (
		<View
			style={[
				styles.statusSection,
				{
					marginTop: isTV ? 0 : phone ? sp(14) : sp(18),
					paddingTop: isTV ? 0 : phone ? sp(12) : sp(14),
				},
			]}>
			<View style={styles.statusSectionHeader}>
				<Text style={[styles.statusSectionTitle, { fontSize: sp(12) }]}>
					DURUMU GÜNCELLE
				</Text>
				{showStatusSubText ? (
					<Text style={styles.statusSectionSub}>
						Değiştirmek için dokunun
					</Text>
				) : null}
			</View>

			<ScrollView
				horizontal
				showsHorizontalScrollIndicator={false}
				contentContainerStyle={[
					styles.statusChipsScroll,
					{
						gap: sp(8),
						...(phone ? { paddingRight: sp(16) } : null),
					},
				]}>
				{STATUS_CHIPS.map((chip) => {
					const isActive = activeStatus === chip.key;
					return (
						<TVPressable
							key={chip.key}
							style={[
								styles.statusChip,
								{
									paddingHorizontal: sp(14),
									paddingVertical: sp(9),
									borderRadius: sp(20),
									gap: sp(6),
									...(phone
										? {
												minHeight: sp(40),
												justifyContent: "center",
											}
										: null),
								},
								isActive && styles.statusChipActive,
							]}
							focusedStyle={{
								borderWidth: 2,
								borderColor: Palette.primary,
								backgroundColor: "rgba(229, 9, 20, 0.2)",
								transform: [{ scale: focusScale }],
							}}
							onPress={() => handleStatusSelect(chip.key)}
							activeOpacity={0.8}>
							{isActive && (
								<Ionicons
									name="checkmark"
									size={sp(15)}
									color={Palette.onSurface}
								/>
							)}
							<Text
								style={[
									styles.statusChipText,
									{ fontSize: sp(12.5) },
									isActive && styles.statusChipTextActive,
								]}
								numberOfLines={phone ? 1 : undefined}>
								{chip.label}
							</Text>
						</TVPressable>
					);
				})}
			</ScrollView>
		</View>
	);

	const renderActionGrid = (phone = false) => (
		<View
			style={[
				styles.actionButtonsGrid,
				{
					gap: phone ? sp(10) : sp(12),
					marginTop: isTV ? 0 : phone ? sp(12) : sp(16),
				},
			]}>
			{/* Listeme Ekle / Liste Seçim Butonu */}
			<TVPressable
				style={[
					styles.actionBtnSecondary,
					{
						height: isTV ? sp(46) : phone ? sp(48) : sp(50),
						gap: sp(8),
						borderRadius: sp(14),
					},
					activeStatus && styles.actionBtnInList,
				]}
				focusedStyle={{
					borderWidth: 2,
					borderColor: Palette.primary,
					transform: [{ scale: focusScale }],
				}}
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
					size={phone ? sp(18) : sp(20)}
					color={
						activeStatus === "watching"
							? Palette.primary
							: activeStatus === "planned"
								? Palette.secondary
								: activeStatus === "completed"
									? "#10B981"
									: Palette.onSurface
					}
				/>
				<Text
					style={[
						styles.actionBtnSecondaryText,
						{
							fontSize: sp(13.5),
							...(phone ? { flexShrink: 1 } : null),
						},
					]}
					numberOfLines={phone ? 1 : undefined}>
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
				style={[
					styles.actionBtnPrimary,
					{
						height: isTV ? sp(46) : phone ? sp(48) : sp(50),
						gap: sp(8),
						borderRadius: sp(14),
					},
				]}
				focusedStyle={{
					borderWidth: 2,
					borderColor: Palette.primary,
					transform: [{ scale: focusScale }],
				}}
				onPress={handleNavigateDetails}
				activeOpacity={0.85}>
				<Ionicons
					name="open-outline"
					size={phone ? sp(18) : sp(19)}
					color="#000000"
				/>
				<Text
					style={[
						styles.actionBtnPrimaryText,
						{
							fontSize: sp(13.5),
							...(phone ? { flexShrink: 1 } : null),
						},
					]}
					numberOfLines={phone ? 1 : undefined}>
					Daha fazla bilgi
				</Text>
			</TVPressable>
		</View>
	);

	const renderCtaButton = (phone = false) => (
		<TVPressable
			autoFocus={true}
			style={[
				styles.prominentCtaButton,
				{
					height: isTV || phone ? sp(52) : sp(54),
					gap: sp(10),
					borderRadius: sp(14),
					marginTop: isTV ? 0 : sp(12),
				},
			]}
			focusedStyle={{
				borderWidth: 2,
				borderColor: Palette.onSurface,
				backgroundColor: Palette.primaryContainer,
				transform: [{ scale: focusScale }],
			}}
			onPress={handlePlay}
			activeOpacity={0.85}>
			<Ionicons name="play" size={sp(21)} color={Palette.onPrimaryContainer} />
			<Text style={[styles.prominentCtaText, { fontSize: sp(15) }]}>
				{isSeries ? "1. Bölümü Başlat" : "Oynat"}
			</Text>
		</TVPressable>
	);

	const renderQuickActions = (phone = false) => {
		const quickItems = [
			{
				key: "trailer",
				icon: "videocam-outline",
				label: "Fragman",
				onPress: handleTrailerClick,
			},
			{
				key: "download",
				icon: "download-outline",
				label: "İndir",
				onPress: handleDownload,
			},
			{
				key: "share",
				icon: "share-social-outline",
				label: "Paylaş",
				onPress: handleShare,
			},
			{
				key: "details",
				icon: "information-circle-outline",
				label: "Detaylar",
				onPress: handleNavigateDetails,
			},
		];
		return (
			<View
				style={[
					styles.quickSubActionsRow,
					{
						marginTop: isTV ? 0 : phone ? sp(12) : sp(14),
						paddingTop: isTV ? sp(10) : sp(12),
					},
				]}>
				{quickItems.map((item) => (
					<TVPressable
						key={item.key}
						style={[
							styles.subActionItem,
							{
								gap: sp(6),
								paddingHorizontal: phone ? sp(4) : sp(12),
								paddingVertical: sp(6),
								borderRadius: sp(10),
								...(phone
									? { flex: 1, alignItems: "center" }
									: null),
							},
						]}
						focusedStyle={{
							backgroundColor: "rgba(229, 9, 20, 0.15)",
							transform: [{ scale: focusScale }],
						}}
						onPress={item.onPress}
						activeOpacity={0.75}>
						<Ionicons
							name={item.icon}
							size={phone ? sp(22) : sp(21)}
							color={Palette.onSurface}
						/>
						<Text
							style={[
								styles.subActionLabel,
								{
									fontSize: phone ? sp(11.5) : sp(12),
									...(phone ? { textAlign: "center" } : null),
								},
							]}
							numberOfLines={phone ? 1 : undefined}>
							{item.label}
						</Text>
					</TVPressable>
				))}
			</View>
		);
	};

	/* Telefon üst bloğu: kompakt header (küçük poster + başlık kolonu) +
	 * tam genişlikte özet. Alt bloklar ScrollView'un doğrudan çocuğu olur. */
	const renderPhoneTop = () => (
		<>
			<View style={[styles.previewHeaderRow, { gap: sp(12) }]}>
				<TVPressable
					style={[
						styles.posterWrapper,
						{
							width: phonePosterW,
							height: phonePosterH,
							borderRadius: sp(12),
						},
					]}
					focusedStyle={{
						borderWidth: 2,
						borderColor: Palette.primary,
						transform: [{ scale: focusScale + 0.04 }],
					}}
					activeOpacity={0.9}
					onPress={handleTrailerClick}>
					<Image
						source={{ uri: posterUri }}
						style={styles.posterImage}
						contentFit="cover"
						transition={200}
					/>
					<View
						style={[
							styles.posterTopBadge,
							{
								top: sp(8),
								left: sp(8),
								paddingHorizontal: sp(6),
								paddingVertical: sp(3),
								borderRadius: sp(4),
							},
						]}>
						<Text
							style={[
								styles.posterTopBadgeText,
								{ fontSize: sp(9) },
							]}>
							TOP 10
						</Text>
					</View>
					<View
						style={[
							styles.posterHdBadge,
							{
								bottom: sp(8),
								right: sp(8),
								paddingHorizontal: sp(5),
								paddingVertical: sp(2),
								borderRadius: sp(4),
							},
						]}>
						<Text
							style={[styles.posterHdText, { fontSize: sp(9) }]}>
							HD
						</Text>
					</View>
				</TVPressable>

				<View style={[styles.detailsColumn, { paddingTop: 0 }]}>
					<View
						style={[
							styles.titleRow,
							{ marginBottom: sp(6), gap: sp(8) },
						]}>
						<Text
							style={[styles.movieTitle, { fontSize: sp(19) }]}
							numberOfLines={2}>
							{title}
						</Text>
						<View
							style={[styles.headerIconActions, { gap: sp(8) }]}>
							<TVPressable
								style={[
									styles.iconCircleBtn,
									{
										width: sp(36),
										height: sp(36),
										borderRadius: sp(18),
									},
								]}
								focusedStyle={{
									borderWidth: 2,
									borderColor: Palette.primary,
									backgroundColor: "rgba(229, 9, 20, 0.2)",
									transform: [{ scale: focusScale }],
								}}
								onPress={handleToggleNotification}
								activeOpacity={0.75}>
								<Ionicons
									name={
										isNotificationOn
											? "notifications"
											: "notifications-outline"
									}
									size={sp(19)}
									color={
										isNotificationOn ? Palette.primary : Palette.onSurface
									}
								/>
							</TVPressable>
							<TVPressable
								style={[
									styles.iconCircleBtn,
									{
										width: sp(36),
										height: sp(36),
										borderRadius: sp(18),
									},
								]}
								focusedStyle={{
									borderWidth: 2,
									borderColor: Palette.primary,
									backgroundColor: "rgba(229, 9, 20, 0.2)",
									transform: [{ scale: focusScale }],
								}}
								onPress={handleToggleFavorite}
								activeOpacity={0.75}>
								<Ionicons
									name={isFav ? "heart" : "heart-outline"}
									size={sp(19)}
									color={isFav ? Palette.primary : Palette.onSurface}
								/>
							</TVPressable>
						</View>
					</View>

					<View
						style={[
							styles.metaBadgesRow,
							{ marginBottom: 0, gap: sp(6) },
						]}>
						<View
							style={[
								styles.typeBadge,
								{
									paddingHorizontal: sp(9),
									paddingVertical: sp(3),
									borderRadius: sp(6),
								},
							]}>
							<Text
								style={[
									styles.typeBadgeText,
									{ fontSize: sp(11) },
								]}>
								{typeBadgeText}
							</Text>
						</View>
						<Text
							style={[styles.metaYearText, { fontSize: sp(12) }]}>
							{yearText}
						</Text>
						<Text style={[styles.metaDot, { fontSize: sp(11) }]}>
							•
						</Text>
						<View style={styles.ratingBox}>
							<Ionicons
								name="star"
								size={sp(14)}
								color="#F5C518"
							/>
							<Text
								style={[
									styles.ratingText,
									{ fontSize: sp(12) },
								]}>
								{rating}
							</Text>
						</View>
						<Text style={[styles.metaDot, { fontSize: sp(11) }]}>
							•
						</Text>
						<View style={styles.hdrBadge}>
							<Text
								style={[styles.hdrText, { fontSize: sp(10) }]}>
								4K HDR
							</Text>
						</View>
					</View>
				</View>
			</View>

			<Text
				style={[
					styles.synopsisText,
					{
						fontSize: sp(13.5),
						lineHeight: sp(20),
						marginTop: sp(12),
					},
				]}
				numberOfLines={4}>
				{synopsis}
			</Text>
		</>
	);

	/* Telefon alt blokları: ScrollView'un doğrudan çocukları (tam genişlik). */
	const renderPhoneBottom = () => (
		<>
			{renderStatusSection(true)}
			{renderActionGrid(true)}
			{renderCtaButton(true)}
			{renderQuickActions(true)}
		</>
	);

	return (
		<Modal
			visible={visible}
			transparent
			animationType="fade"
			statusBarTranslucent
			onRequestClose={onClose}>
			<Pressable
				style={[
					styles.backdropOverlay,
					isTV && {
						justifyContent: "center",
						alignItems: "center",
						paddingHorizontal: sp(40),
						paddingVertical: sp(24),
					},
				]}
				onPress={() => {
					if (isTVPressSuppressed()) return;
					onClose?.();
				}}>
				<Pressable
					style={[
						styles.sheetContainer,
						isTV && {
							// TV: alt yapışmak yerine ortalanmış, iki kolonlu panel.
							maxWidth: tvPanelMaxWidth,
							width: "100%",
							maxHeight: tvDialogMaxHeight,
							borderTopLeftRadius: sp(22),
							borderTopRightRadius: sp(22),
							borderTopWidth: 0,
							borderWidth: 1,
							borderColor: "rgba(255, 255, 255, 0.14)",
							paddingTop: 0,
							backgroundColor: Palette.surfaceLow,
							shadowOpacity: 0.75,
						},
						// Telefon: daha uzun bottom-sheet, tam yuvarlak üst köşeler.
						isPhone && {
							maxHeight: "92%",
							borderTopLeftRadius: 24,
							borderTopRightRadius: 24,
						},
					]}
					onPress={(e) => e.stopPropagation()}>
					{/* 1. Üst Tutamaç (Drag Handle) — telefonda sürükleme
					    göstergesi, TV'de anlamsız. */}
					{!isTV ? <View style={styles.dragHandle} /> : null}
					{/* Telefon: backdrop'a dokunmak zor — sağ üstte kapatma (X). */}
					{isPhone ? (
						<TVPressable
							onPress={onClose}
							style={styles.phoneCloseBtn}
							focusedStyle={{
								borderWidth: 2,
								borderColor: Palette.primary,
								transform: [{ scale: focusScale }],
							}}
							activeOpacity={0.75}>
							<Ionicons
								name="close"
								size={sp(18)}
								color={Palette.onSurface}
							/>
						</TVPressable>
					) : null}

					{/* 2. Toast Bildirim Banner'ı (Screen 2) */}
					{toastInfo && (
						<View
							style={[
								styles.toastBanner,
								{
									marginHorizontal: isTV ? sp(22) : 16,
									marginBottom: sp(12),
									paddingHorizontal: sp(14),
									paddingVertical: sp(10),
									borderRadius: sp(12),
								},
							]}>
							<View style={[styles.toastLeft, { gap: sp(8) }]}>
								<Ionicons
									name="checkmark-circle"
									size={sp(18)}
									color="#10B981"
								/>
								<Text
									style={[
										styles.toastText,
										{ fontSize: sp(13) },
									]}
									numberOfLines={1}>
									{toastInfo.text}
								</Text>
							</View>
							<TVPressable
								onPress={handleUndoToast}
								style={styles.undoButton}
								focusedStyle={{
									borderWidth: 2,
									borderColor: Palette.onSurface,
									borderRadius: sp(8),
									transform: [{ scale: focusScale }],
								}}
								activeOpacity={0.7}>
								<Text
									style={[
										styles.undoButtonText,
										{ fontSize: sp(13) },
									]}>
									Geri Al
								</Text>
							</TVPressable>
						</View>
					)}

					<ScrollView
						showsVerticalScrollIndicator={false}
						bounces={false}
						scrollEnabled={!isTV}
						contentContainerStyle={[
							styles.scrollContent,
							{
								paddingHorizontal: isTV ? sp(24) : 16,
								paddingBottom: isTV ? sp(24) : 24,
								paddingTop: isTV ? sp(22) : 0,
							},
						]}>
						{/* 3. Fragman / Video Önizleme Durumu (Screen 3) */}
						{showTrailerPreview ? (
							<View
								style={[
									styles.trailerPreviewBox,
									{
										/*
										 * TV'de poster ve fragman önizlemesi aynı
										 * işlevi görüyor (içeriğin "medya" görünümü),
										 * üst üste binmelerine gerek yok. Açıkken
										 * önizleme kutusu posterin yerini alır ve
										 * özet metni altında kalır — böylece açık
										 * durumda da panel tek ekrana sığar.
										 */
										height: isTV
											? sp(260)
											: isPhone
												? 200
												: 180,
										borderRadius: sp(16),
										marginBottom: sp(18),
									},
								]}>
								<Image
									source={{ uri: backdropUri }}
									style={styles.trailerBackdrop}
									contentFit="cover"
								/>
								<View
									style={[
										styles.trailerOverlay,
										{ padding: sp(14) },
									]}>
									{/* Canlı Gösterge Rozeti */}
									<View style={styles.trailerTopRow}>
										<View style={styles.liveBadge}>
											<View style={styles.liveDot} />
											<Text
												style={[
													styles.liveBadgeText,
													{ fontSize: sp(11) },
												]}>
												Fragman Oynatılıyor
											</Text>
										</View>
										<View style={styles.top10Badge}>
											<Text
												style={[
													styles.top10Text,
													{ fontSize: sp(10) },
												]}>
												TOP 10
											</Text>
										</View>
									</View>

									{/* Ortada Oynat/Durdur */}
									<TVPressable
										style={[
											styles.centerPlayBtn,
											{
												width: sp(60),
												height: sp(60),
												borderRadius: sp(30),
											},
										]}
										focusedStyle={{
											borderWidth: 2,
											borderColor: Palette.onSurface,
											backgroundColor: Palette.primaryContainer,
											transform: [
												{ scale: focusScale + 0.08 },
											],
										}}
										onPress={handleTrailerClick}
										activeOpacity={0.85}>
										<Ionicons
											name="play"
											size={sp(30)}
											color={Palette.onSurface}
										/>
									</TVPressable>

									{/* Alt İlerleme Çubuğu ve Ses */}
									<View style={styles.trailerBottomBar}>
										<View
											style={[
												styles.trailerProgressContainer,
												{ gap: sp(8) },
											]}>
											<View
												style={
													styles.trailerProgressBar
												}>
												<View
													style={
														styles.trailerProgressFill
													}
												/>
											</View>
											<Text
												style={[
													styles.trailerTimeText,
													{ fontSize: sp(11) },
												]}>
												0:14 / 1:45
											</Text>
										</View>
										<TVPressable
											onPress={() =>
												setIsMuted((m) => !m)
											}
											style={styles.muteButton}
											focusedStyle={{
												borderWidth: 2,
												borderColor: Palette.onSurface,
												borderRadius: sp(20),
												transform: [
													{ scale: focusScale },
												],
											}}>
											<Ionicons
												name={
													isMuted
														? "volume-mute-outline"
														: "volume-high-outline"
												}
												size={sp(20)}
												color={Palette.onSurface}
											/>
										</TVPressable>
									</View>
								</View>
							</View>
						) : null}

						{/*
						 * 4. Başlık bölümü — TV + TABLET iki kolonlu (dokunma).
						 *
						 * TV: SOL kolon = poster (+ özet), SAĞ kolon = başlık,
						 * rozetler ve TÜM eylemler. Telefonda bunun yerine
						 * dikey stack kullanılır (renderPhoneTop/Bottom) — dar
						 * kolonda (~200dp) ezilme olmasın diye.
						 */}
						{isPhone ? renderPhoneTop() : null}
						{!isPhone ? (
							<View
								style={[
									styles.previewHeaderRow,
									{ gap: sp(18) },
								]}>
								{/* ── SOL KOLON ── */}
								<View
									style={[
										isTV
											? styles.tvLeftColumn
											: styles.posterSlot,
										{ gap: sp(12) },
									]}>
									{/* Sol Afiş (Poster) */}
									<TVPressable
										style={[
											styles.posterWrapper,
											{
												width: sp(140),
												height: sp(210),
												borderRadius: sp(14),
											},
										]}
										focusedStyle={{
											borderWidth: 2,
											borderColor: Palette.primary,
											transform: [
												{ scale: focusScale + 0.04 },
											],
										}}
										activeOpacity={0.9}
										onPress={handleTrailerClick}>
										<Image
											source={{ uri: posterUri }}
											style={styles.posterImage}
											contentFit="cover"
											transition={200}
										/>
										{/* Top 10 Rozeti */}
										<View
											style={[
												styles.posterTopBadge,
												{
													top: sp(8),
													left: sp(8),
													paddingHorizontal: sp(6),
													paddingVertical: sp(3),
													borderRadius: sp(4),
												},
											]}>
											<Text
												style={[
													styles.posterTopBadgeText,
													{ fontSize: sp(9) },
												]}>
												TOP 10
											</Text>
										</View>
										{/* HD Rozeti */}
										<View
											style={[
												styles.posterHdBadge,
												{
													bottom: sp(8),
													right: sp(8),
													paddingHorizontal: sp(5),
													paddingVertical: sp(2),
													borderRadius: sp(4),
												},
											]}>
											<Text
												style={[
													styles.posterHdText,
													{ fontSize: sp(9) },
												]}>
												HD
											</Text>
										</View>
									</TVPressable>

									{/*
									 * TV: özet posterin ALTINDA, sol kolonda.
									 * Sağ kolonda posterle yan yana satır uzunluğu
									 * daralıp başlığı 2–3 satıra bölüyordu.
									 */}
									{isTV ? (
										<Text
											style={[
												styles.synopsisText,
												{
													fontSize: sp(12.5),
													lineHeight: sp(17),
												},
											]}
											numberOfLines={4}>
											{synopsis}
										</Text>
									) : null}
								</View>

								{/* ── SAĞ KOLON: başlık, rozetler, TÜM eylemler ── */}
								<View
									style={[
										styles.detailsColumn,
										/**
										 * TV'de altı blok (durum çipleri, aksiyon
										 * grid'i, CTA, alt eylemler…) bu sütunda alt
										 * alta diziliyor. `gap` TEK boşluk kaynağı:
										 * blokların kendi `marginTop`ları TV'de
										 * sıfırlanır. Aksi halde her blok kendi
										 * boşluğunu ekleyip paneli ekranın
										 * dışına taşıyordu — kullanıcı kaydırmak
										 * zorunda kalıyordu.
										 */
										isTV && { gap: sp(10) },
									]}>
									{/* Başlık & Hızlı İkonlar */}
									<View
										style={[
											styles.titleRow,
											{
												marginBottom: isTV ? 0 : sp(8),
												gap: sp(8),
											},
										]}>
										<Text
											style={[
												styles.movieTitle,
												{
													fontSize: sp(
														isTV ? 20 : 22,
													),
												},
											]}
											numberOfLines={2}>
											{title}
										</Text>
										<View
											style={[
												styles.headerIconActions,
												{ gap: sp(8) },
											]}>
											{/* Bildirim Çanı */}
											<TVPressable
												style={[
													styles.iconCircleBtn,
													{
														width: sp(38),
														height: sp(38),
														borderRadius: sp(19),
													},
												]}
												focusedStyle={{
													borderWidth: 2,
													borderColor: Palette.primary,
													backgroundColor:
														"rgba(229, 9, 20, 0.2)",
													transform: [
														{ scale: focusScale },
													],
												}}
												onPress={
													handleToggleNotification
												}
												activeOpacity={0.75}>
												<Ionicons
													name={
														isNotificationOn
															? "notifications"
															: "notifications-outline"
													}
													size={sp(20)}
													color={
														isNotificationOn
															? Palette.primary
															: Palette.onSurface
													}
												/>
											</TVPressable>
											{/* Favori Kalp */}
											<TVPressable
												style={[
													styles.iconCircleBtn,
													{
														width: sp(38),
														height: sp(38),
														borderRadius: sp(19),
													},
												]}
												focusedStyle={{
													borderWidth: 2,
													borderColor: Palette.primary,
													backgroundColor:
														"rgba(229, 9, 20, 0.2)",
													transform: [
														{ scale: focusScale },
													],
												}}
												onPress={handleToggleFavorite}
												activeOpacity={0.75}>
												<Ionicons
													name={
														isFav
															? "heart"
															: "heart-outline"
													}
													size={sp(21)}
													color={
														isFav
															? Palette.primary
															: Palette.onSurface
													}
												/>
											</TVPressable>
										</View>
									</View>

									{/* Rozetler ve Puanlar */}
									<View
										style={[
											styles.metaBadgesRow,
											{
												marginBottom: isTV ? 0 : sp(10),
												gap: sp(8),
											},
										]}>
										<View
											style={[
												styles.typeBadge,
												{
													paddingHorizontal: sp(9),
													paddingVertical: sp(3),
													borderRadius: sp(6),
												},
											]}>
											<Text
												style={[
													styles.typeBadgeText,
													{ fontSize: sp(11) },
												]}>
												{typeBadgeText}
											</Text>
										</View>
										<Text
											style={[
												styles.metaYearText,
												{ fontSize: sp(12) },
											]}>
											{yearText}
										</Text>
										<Text
											style={[
												styles.metaDot,
												{ fontSize: sp(11) },
											]}>
											•
										</Text>
										<View style={styles.ratingBox}>
											<Ionicons
												name="star"
												size={sp(14)}
												color="#F5C518"
											/>
											<Text
												style={[
													styles.ratingText,
													{ fontSize: sp(12) },
												]}>
												{rating}
											</Text>
										</View>
										<Text
											style={[
												styles.metaDot,
												{ fontSize: sp(11) },
											]}>
											•
										</Text>
										<View style={styles.hdrBadge}>
											<Text
												style={[
													styles.hdrText,
													{ fontSize: sp(10) },
												]}>
												4K HDR
											</Text>
										</View>
									</View>

									{/* Sinopsis — TV'de sol kolonda (poster altı), telefonda burada */}
									{!isTV ? (
										<Text
											style={[
												styles.synopsisText,
												{
													fontSize: sp(13.5),
													lineHeight: sp(19),
												},
											]}
											numberOfLines={3}>
											{synopsis}
										</Text>
									) : null}

									{/* 5. DURUMU GÜNCELLE Çip Seçici (Screen 2) */}
									{renderStatusSection(false)}

									{/* 6. Ana Eylem Butonları Izgarası (Screen 1 & 2) */}
									{renderActionGrid(false)}

									{/* 7. Büyük Kırmızı CTA (Hemen İzle) */}
									{renderCtaButton(false)}

									{/* 8. Alt Hızlı Eylemler (İndir, Paylaş, Fragman, Detaylar) */}
									{renderQuickActions(false)}
								</View>
							</View>
						) : null}
						{/* 4b. TELEFON alt blokları: tam genişlikte status/grid/CTA/quick */}
						{isPhone ? renderPhoneBottom() : null}

						{/* Home Bar Indicator Spacer — telefonda var, TV'de anlamsız. */}
						{!isTV ? (
							<View style={styles.homeIndicatorBar} />
						) : null}
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
		backgroundColor: Palette.surfaceLow,
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
	/* Telefon sağ-üst kapatma (X) — dragHandle ortada kalır, çakışmaz. */
	phoneCloseBtn: {
		position: "absolute",
		top: 10,
		right: 12,
		width: 36,
		height: 36,
		borderRadius: 18,
		backgroundColor: "rgba(255, 255, 255, 0.1)",
		borderWidth: 1,
		borderColor: "rgba(255, 255, 255, 0.15)",
		justifyContent: "center",
		alignItems: "center",
		zIndex: 10,
	},

	/* Toast Banner (Screen 2) */
	toastBanner: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		backgroundColor: "rgba(16, 185, 129, 0.14)",
		borderWidth: 1,
		borderColor: "rgba(16, 185, 129, 0.35)",
	},
	toastLeft: {
		flexDirection: "row",
		alignItems: "center",
		flex: 1,
	},
	toastText: {
		color: "#10B981",
		fontFamily: FontFamily.semiBold,
		flex: 1,
	},
	undoButton: {
		paddingHorizontal: 6,
		paddingVertical: 4,
	},
	undoButtonText: {
		color: Palette.onSurface,
		fontFamily: FontFamily.bold,
	},

	scrollContent: {},

	/* Fragman / Video Önizleme Box (Screen 3) */
	trailerPreviewBox: {
		width: "100%",
		overflow: "hidden",
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
		...StyleSheet.absoluteFill,
		backgroundColor: "rgba(0, 0, 0, 0.45)",
		justifyContent: "space-between",
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
		backgroundColor: Palette.onSurface,
	},
	liveBadgeText: {
		color: Palette.onSurface,
		fontFamily: FontFamily.bold,
	},
	top10Badge: {
		backgroundColor: "rgba(0, 0, 0, 0.7)",
		borderWidth: 1,
		borderColor: Palette.primary,
		paddingHorizontal: 6,
		paddingVertical: 2,
		borderRadius: 4,
	},
	top10Text: {
		color: Palette.primary,
		fontFamily: FontFamily.bold,
	},
	centerPlayBtn: {
		borderWidth: 1.5,
		borderColor: "rgba(255, 255, 255, 0.4)",
		backgroundColor: "rgba(0, 0, 0, 0.65)",
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
		backgroundColor: Palette.primaryContainer,
		borderRadius: 1.5,
	},
	trailerTimeText: {
		color: Palette.onSurface,
		fontFamily: FontFamily.semiBold,
	},
	muteButton: {
		padding: 4,
	},

	/* Header Row (Screen 1 & 2) */
	previewHeaderRow: {
		flexDirection: "row",
		alignItems: "flex-start",
	},

	/**
	 * TV sol kolonu: poster + özet.
	 *
	 * Poster + özet dikeyde ≈310dp, sağ kolon ≈350dp. İki kolon da
	 * panelin azami yüksekliğinin (1080p'de ≈482dp) altında kalır, dolayısıyla
	 * dikey scroll hiç oluşmaz. `flex: 0.8` / `flex: 1.2` oranı sağ
	 * kolona eylemler için daha fazla yer bırakır.
	 */
	tvLeftColumn: {
		flex: 0.8,
	},
	/** Telefonda sarmalayıcı şeffaf — poster eski genişlikte kalır. */
	posterSlot: {},
	posterWrapper: {
		overflow: "hidden",
		backgroundColor: Palette.surfaceLow,
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
		backgroundColor: Palette.primaryContainer,
	},
	posterTopBadgeText: {
		color: Palette.onPrimaryContainer,
		fontFamily: FontFamily.bold,
		letterSpacing: 0.3,
	},
	posterHdBadge: {
		position: "absolute",
		backgroundColor: "rgba(0, 0, 0, 0.8)",
		borderWidth: 1,
		borderColor: "rgba(255, 255, 255, 0.2)",
	},
	posterHdText: {
		color: Palette.onSurface,
		fontFamily: FontFamily.bold,
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
	},
	movieTitle: {
		flex: 1,
		fontFamily: FontFamily.bold,
		color: Palette.onSurface,
		letterSpacing: -0.3,
	},
	headerIconActions: {
		flexDirection: "row",
		alignItems: "center",
	},
	iconCircleBtn: {
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
	},
	typeBadge: {
		backgroundColor: "#1F2533",
		borderWidth: 1,
		borderColor: "rgba(255, 255, 255, 0.08)",
	},
	typeBadgeText: {
		color: Palette.onSurface,
		fontFamily: FontFamily.bold,
	},
	metaYearText: {
		color: Palette.onSurfaceVariant,
		fontFamily: FontFamily.semiBold,
	},
	metaDot: {
		color: Palette.outline,
	},
	ratingBox: {
		flexDirection: "row",
		alignItems: "center",
		gap: 3,
	},
	ratingText: {
		color: "#F5C518",
		fontFamily: FontFamily.bold,
	},
	hdrBadge: {
		borderWidth: 1,
		borderColor: "rgba(255, 255, 255, 0.2)",
		paddingHorizontal: 4,
		paddingVertical: 1,
		borderRadius: 3,
	},
	hdrText: {
		color: Palette.onSurfaceVariant,
		fontFamily: FontFamily.bold,
	},

	synopsisText: {
		color: Palette.onSurfaceVariant,
	},

	/* Durumu Güncelle Section (Screen 2) */
	statusSection: {
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
		fontFamily: FontFamily.bold,
		color: Palette.onSurfaceVariant,
		letterSpacing: 0.6,
	},
	statusSectionSub: {
		fontSize: 10,
		color: Palette.outline,
	},
	statusChipsScroll: {
		paddingVertical: 2,
	},
	statusChip: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: Palette.surfaceLow,
		borderWidth: 1,
		borderColor: "rgba(255, 255, 255, 0.08)",
	},
	statusChipActive: {
		backgroundColor: Palette.primaryContainer,
		borderColor: Palette.primary,
	},
	statusChipText: {
		color: Palette.onSurface,
		fontFamily: FontFamily.semiBold,
	},
	statusChipTextActive: {
		color: Palette.onPrimaryContainer,
		fontFamily: FontFamily.bold,
	},

	/* Eylem Butonları (Grid) */
	actionButtonsGrid: {
		flexDirection: "row",
	},
	actionBtnSecondary: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "#1E2535",
		borderWidth: 1,
		borderColor: "rgba(255, 255, 255, 0.08)",
	},
	actionBtnInList: {
		borderColor: "rgba(16, 185, 129, 0.4)",
		backgroundColor: "rgba(16, 185, 129, 0.1)",
	},
	actionBtnSecondaryText: {
		fontFamily: FontFamily.bold,
		color: Palette.onSurface,
	},
	actionBtnPrimary: {
		flex: 1.25,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: Palette.onSurface,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.3,
		shadowRadius: 4,
		elevation: 3,
	},
	actionBtnPrimaryText: {
		fontFamily: FontFamily.bold,
		color: "#000000",
	},

	/* Prominent CTA */
	prominentCtaButton: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: Palette.primaryContainer,
		shadowColor: Palette.primary,
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.35,
		shadowRadius: 8,
		elevation: 5,
	},
	prominentCtaText: {
		color: Palette.onPrimaryContainer,
		fontFamily: FontFamily.bold,
		letterSpacing: 0.2,
	},

	/* Quick Sub-actions Row */
	quickSubActionsRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-around",
		borderTopWidth: 1,
		borderTopColor: "rgba(255, 255, 255, 0.06)",
	},
	subActionItem: {
		alignItems: "center",
	},
	subActionLabel: {
		fontFamily: FontFamily.semiBold,
		color: Palette.onSurfaceVariant,
	},

	homeIndicatorBar: {
		width: 120,
		height: 4,
		borderRadius: 2,
		backgroundColor: "rgba(255, 255, 255, 0.2)",
		alignSelf: "center",
		marginTop: 16,
	},
});
