import AppMenuList from "./AppMenuList";
import AppPeekMenu from "./AppPeekMenu";
import { useAppMenu } from "./AppMenuProvider";
import { LIST_LABELS, libraryMenuItems } from "./libraryItems";
import { useFeedback } from "@/components/feedback/AppFeedbackProvider";
import Image from "@/components/common/SmartImage";
import { FontFamily, Palette } from "@/constants/theme";
import { useDownload } from "@/context/DownloadContext";
import { useLibraryStatus } from "@/context/LibraryStatusContext";
import { fetchPluginDetail } from "@/services/api";
import { isSeriesContent, typeLabel } from "@/utils/mediaType";
import { setContentLibraryList, toggleFavorite } from "@/utils/storage";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useMemo, useRef, useState } from "react";
import { Share, StyleSheet, Text, View } from "react-native";

/**
 * İçerik peek menüsü.
 *
 * Eski `QuickPreviewModal`'ın işlevleri (oynat, detay, listeler, favori,
 * indir, fragman, paylaş, bildirim) tek menüye taşındı.
 *
 * Menü içeriği AÇILIRKEN kurulur (`ContentMenuBody` overlay içinde mount
 * olur); böylece her kart download/storage aboneliği tutmaz.
 *
 * TV: `open` merkezî paneli açar; telefon/tablette `PeekMenu` kartın
 * üzerinde açılır. İçerik (satırlar, önizleme) iki platformda aynıdır.
 */
export default function ContentPeekMenu({
	item,
	platformName,
	onPlay,
	onDetails,
	preview = true,
	children,
}) {
	const { open } = useAppMenu();
	const spec = useMemo(
		() => ({ item, platformName, onPlay, onDetails }),
		[item, platformName, onPlay, onDetails],
	);

	const trigger = useMemo(
		() => ({
			openMenu: () =>
				open({
					render: (props) => <ContentMenuBody spec={spec} {...props} />,
				}),
		}),
		[open, spec],
	);

	return (
		<AppPeekMenu
			preview={preview ? <ContentPreview spec={spec} /> : undefined}
			renderMenu={({ close }) => (
				<ContentMenuBody spec={spec} close={close} />
			)}>
			{children(trigger)}
		</AppPeekMenu>
	);
}

export function ContentMenuBody({ spec, close, autoFocus = false, width }) {
	const { item, platformName, onPlay, onDetails } = spec;
	const router = useRouter();
	const { toast } = useFeedback();
	const { requestDownload, getDownloadState, isDownloadPending, isDownloaded } =
		useDownload();
	const { statusOf, isFavorite } = useLibraryStatus();

	const [notificationOn, setNotificationOn] = useState(false);
		const fetchRef = useRef(null);

	const ensureDetail = async () => {
		if (fetchRef.current) return fetchRef.current;
		const targetPlatform = item?.plugin || platformName;
		if (!item?.url || !targetPlatform) return item;
		fetchRef.current = fetchPluginDetail(targetPlatform, item.url)
			.then((details) => {
				if (!details) return item;
				const merged = {
					...item,
					...details,
					title: details.title || item.title,
					poster:
						details.poster_url ||
						details.poster ||
						item.poster ||
						item.poster_url,
					description:
						details.description || details.overview || item.description,
					fragman_url: details.fragman_url || item.fragman_url,
				};
				return merged;
			})
			.catch(() => item);
		return fetchRef.current;
	};

	const id = item?.id || item?.url || item?.title;
	const series = isSeriesContent(item);
	const posterUri =
		item?.poster ||
		item?.poster_url ||
		item?.image ||
		item?.backdrop_url ||
		item?.thumbnail ||
		null;
	const title = item?.title || item?.name || "İçerik";
	const year =
		item?.year ||
		(item?.release_date ? String(item.release_date).slice(0, 4) : null);

	const downloadKey = useMemo(() => {
		if (!series || !item?.seasons) return { contentId: id };
		const seasonKey = Object.keys(item.seasons).sort(
			(a, b) => Number(a) - Number(b),
		)[0];
		const list = item.seasons[seasonKey] || [];
		const first = list.find((e) => e?.url) || list[0];
		return {
			contentId: id,
			seriesId: id,
			season: Number(seasonKey),
			episode: Number(first?.episode || first?.episode_number || 1),
		};
	}, [id, item, series]);

	const downloadState = getDownloadState(downloadKey);
	const downloadPending = isDownloadPending(downloadKey);
	const downloaded = isDownloaded(downloadKey);

	/* ── Eylemler ────────────────────────────────────────────── */

	const handleStatus = async (targetList) => {
		try {
			const result = await setContentLibraryList(
				item,
				targetList,
			);
			toast.info(
				result
					? `"${title}" → ${LIST_LABELS[result]}`
					: `"${title}" izleme listelerinden çıkarıldı.`,
			);
		} catch (e) {
			console.error("Liste güncellenemedi:", e);
		}
	};

	const handleFavorite = async () => {
		try {
			const isFav = await toggleFavorite({ ...item, id });
			toast.info(
				isFav
					? `"${title}" favorilere eklendi.`
					: `"${title}" favorilerden çıkarıldı.`,
			);
		} catch (e) {
			console.error("Favori değiştirilemedi:", e);
		}
	};

	const handlePlay = async () => {
		const detail = await ensureDetail();
		if (onPlay) {
			onPlay(detail);
			return;
		}
		let playUrl = detail.url;
		let subtitle = "";
		if (isSeriesContent(detail) && detail.seasons) {
			const seasonKey = Object.keys(detail.seasons)[0];
			const first = detail.seasons[seasonKey]?.[0];
			if (first?.url) {
				playUrl = first.url;
				subtitle = `${seasonKey}. Sezon 1. Bölüm`;
			}
		}
		if (!playUrl) {
			handleDetails();
			return;
		}
		router.push({
			pathname: "/(app)/player",
			params: {
				url: playUrl,
				title,
				subtitle,
				plugin: detail.plugin || platformName,
				movieId: id,
			},
		});
	};

	const handleDetails = async () => {
		const detail = await ensureDetail();
		if (onDetails) {
			onDetails(detail);
			return;
		}
		router.push({
			pathname: "/(app)/MovieDetails/[id]",
			params: {
				id: encodeURIComponent(detail.url || id),
				plugin: detail.plugin || platformName,
				movieData: JSON.stringify(detail),
			},
		});
	};

	const handleDownload = async () => {
		if (
			downloadPending ||
			downloadState?.status === "downloading" ||
			downloadState?.status === "queued"
		) {
			return;
		}
		const detail = await ensureDetail();
		const isSeries = isSeriesContent(detail);
		let episode = null;
		if (isSeries && detail.seasons) {
			const seasonKey = Object.keys(detail.seasons).sort(
				(a, b) => Number(a) - Number(b),
			)[0];
			const list = detail.seasons[seasonKey] || [];
			const first = list.find((e) => e?.url) || list[0];
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
			toast.info("İndirme için oynatılabilir bölüm bulunamadı.");
			return;
		}
		if (!detail.url && !episode?.url) {
			toast.info("İndirme için video bağlantısı bulunamadı.");
			return;
		}
		requestDownload({
			content: {
				id,
				url: detail.url,
				title,
				plugin: detail.plugin || platformName,
				poster_url: posterUri,
				seasons: detail.seasons,
			},
			episode,
		});
	};

	const handleTrailer = async () => {
		const detail = await ensureDetail();
		const url = detail.trailer_url || detail.fragman_url;
		if (!url) {
			toast.info("Bu içerik için fragman bağlantısı bulunamadı.");
			return;
		}
		try {
			await WebBrowser.openBrowserAsync(url);
		} catch (_e) {
			// tarayıcı açılamadıysa sessizce geç
		}
	};

	const handleShare = async () => {
		try {
			await Share.share({
				title,
				message: `StreamPulse'da "${title}" izle! ${item?.url || ""}`,
			});
		} catch (_e) {}
	};

	const handleNotification = () => {
		const next = !notificationOn;
		setNotificationOn(next);
		toast.info(
			next
				? `"${title}" için yeni bölüm bildirimleri açıldı.`
				: `"${title}" için yeni bölüm bildirimleri kapatıldı.`,
		);
	};

	/* ── Satırlar ────────────────────────────────────────────── */

	const status = statusOf(item);
	const favorite = isFavorite(item);

	const downloadValue = downloaded
		? "İndirildi"
		: downloadPending
			? "Aranıyor…"
			: downloadState?.status === "downloading" ||
				  downloadState?.status === "queued" ||
				  downloadState?.status === "merging"
				? `%${Math.round((downloadState.progress || 0) * 100)}`
				: downloadState?.status === "paused"
					? "Duraklatıldı"
					: downloadState?.status === "failed"
						? "Hata"
						: undefined;

	const items = [
		{
			key: "header",
			type: "header",
			title,
			subtitle: [
				year,
				typeLabel(item),
				`Durum: ${status ? LIST_LABELS[status] : "Listede değil"}`,
			]
				.filter(Boolean)
				.join(" · "),
			posterUri,
		},
		{
			key: "play",
			title: "Oynat",
			icon: "play",
			iconColor: Palette.onPrimaryContainer,
			iconBg: Palette.primaryContainer,
			onPress: handlePlay,
		},
		{
			key: "details",
			title: "Detay Sayfası",
			icon: "information-circle-outline",
			onPress: handleDetails,
		},
		...libraryMenuItems({
			status,
			isFavorite: favorite,
			onStatus: handleStatus,
			onFavorite: handleFavorite,
		}),
		{
			key: "download",
			title: series ? "Bölüm İndir" : "İndir",
			description: "Kaynak ve altyazı seçimiyle kuyruğa ekle",
			icon: downloaded ? "checkmark-done-outline" : "download-outline",
			iconColor: downloaded ? Palette.success : Palette.secondary,
			iconBg: downloaded
				? "rgba(16, 185, 129, 0.15)"
				: "rgba(76, 215, 246, 0.15)",
			value: downloadValue,
			valueColor: Palette.secondary,
			onPress: handleDownload,
		},
		{
			key: "trailer",
			title: "Fragman",
			icon: "film-outline",
			onPress: handleTrailer,
		},
		{
			key: "share",
			title: "Paylaş",
			icon: "share-social-outline",
			onPress: handleShare,
		},
		{
			key: "notification",
			title: notificationOn ? "Bildirimi Kapat" : "Bildirimi Aç",
			icon: notificationOn ? "notifications" : "notifications-outline",
			value: notificationOn ? "Açık" : undefined,
			onPress: handleNotification,
		},
	];

	return (
		<AppMenuList
			items={items}
			width={width}
			onItemPress={(pressed) => {
				close?.();
				pressed.onPress?.();
			}}
			autoFocusFirst={autoFocus}
		/>
	);
}

export function ContentPreview({ spec }) {
	const { item } = spec;
	const posterUri =
		item?.poster ||
		item?.poster_url ||
		item?.image ||
		item?.backdrop_url ||
		item?.thumbnail ||
		null;
	const title = item?.title || item?.name || "İçerik";
	const year =
		item?.year ||
		(item?.release_date ? String(item.release_date).slice(0, 4) : null);
	const synopsis =
		item?.description || item?.overview || item?.synopsis || "";

	return (
		<View style={styles.preview}>
			{posterUri ? (
				<Image
					source={{ uri: posterUri }}
					style={styles.previewPoster}
					contentFit="cover"
				/>
			) : null}
			<View style={styles.previewBody}>
				<Text style={styles.previewTitle} numberOfLines={2}>
					{title}
				</Text>
				<Text style={styles.previewMeta} numberOfLines={1}>
					{[year, typeLabel(item)].filter(Boolean).join(" · ")}
				</Text>
				{Boolean(synopsis) && (
					<Text style={styles.previewText} numberOfLines={3}>
						{synopsis}
					</Text>
				)}
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	preview: {
		width: 300,
		maxWidth: "100%",
		flexDirection: "row",
		gap: 12,
		padding: 12,
		borderRadius: 16,
		backgroundColor: Palette.surfaceLow,
		borderWidth: 1,
		borderColor: "rgba(229, 225, 228, 0.10)",
	},
	previewPoster: {
		width: 88,
		height: 130,
		borderRadius: 10,
		backgroundColor: Palette.surfaceHigh,
	},
	previewBody: {
		flex: 1,
		minWidth: 0,
	},
	previewTitle: {
		fontSize: 15,
		fontFamily: FontFamily.bold,
		color: Palette.onSurface,
	},
	previewMeta: {
		fontSize: 11,
		fontFamily: FontFamily.medium,
		color: Palette.secondary,
		marginTop: 3,
	},
	previewText: {
		fontSize: 10.5,
		lineHeight: 15,
		fontFamily: FontFamily.regular,
		color: Palette.onSurfaceVariant,
		marginTop: 6,
	},
});