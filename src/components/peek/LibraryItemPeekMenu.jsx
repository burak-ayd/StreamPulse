import AppMenuList from "./AppMenuList";
import AppPeekMenu from "./AppPeekMenu";
import { useAppMenu } from "./AppMenuProvider";
import { LIST_LABELS, libraryMenuItems } from "./libraryItems";
import { useFeedback } from "@/components/feedback/AppFeedbackProvider";
import { useLibraryStatus } from "@/context/LibraryStatusContext";
import { setContentLibraryList, toggleFavorite } from "@/utils/storage";
import { Share } from "react-native";
import { useMemo } from "react";

/**
 * Kitaplık kartı eylem menüsü (`LibraryItemActionModal`'ın yerini alır).
 *
 * Detay, listeyi değiştir, paylaş, kaldır + durum/favori satırları.
 * Telefonda kartın "⋯" düğmesinin üzerinde, TV'de merkezî panelde açılır.
 */
export default function LibraryItemPeekMenu({
	item,
	onDetails,
	onRemove,
	activeTab,
	children,
}) {
	const { open } = useAppMenu();
	const spec = useMemo(
		() => ({ item, onDetails, onRemove, activeTab }),
		[item, onDetails, onRemove, activeTab],
	);
	const trigger = useMemo(
		() => ({
			openMenu: () =>
				open({
					render: (props) => (
						<LibraryItemMenuBody spec={spec} {...props} />
					),
				}),
		}),
		[open, spec],
	);

	return (
		<AppPeekMenu
			activateOn="tap"
			disabled={!item}
			renderMenu={({ close }) => (
				<LibraryItemMenuBody spec={spec} close={close} />
			)}>
			{children(trigger)}
		</AppPeekMenu>
	);
}

export function LibraryItemMenuBody({ spec, close, autoFocus, width }) {
	const { item, onDetails, onRemove, activeTab } = spec;
	const { toast } = useFeedback();
	const { statusOf, isFavorite } = useLibraryStatus();
	
	const status = statusOf(item);
	const favorite = isFavorite(item);

	const tabLabels = {
		watching: "İzleniyor Listesinde",
		completed: "Tamamlananlar Listesinde",
		planned: "Planlananlar Listesinde",
		favorites: "Favoriler Listesinde",
	};

	const handleStatus = async (targetList) => {
		try {
			const result = await setContentLibraryList(
				item,
				targetList,
			);
			toast.info(
				result
					? `"${item?.title || "İçerik"}" → ${LIST_LABELS[result]}`
					: `"${item?.title || "İçerik"}" izleme listelerinden çıkarıldı.`,
			);
		} catch (e) {
			console.error("Liste güncellenemedi:", e);
		}
	};

	const handleFavorite = async () => {
		try {
			const isFav = await toggleFavorite({ ...item });
			toast.info(
				isFav
					? `"${item?.title || "İçerik"}" favorilere eklendi.`
					: `"${item?.title || "İçerik"}" favorilerden çıkarıldı.`,
			);
		} catch (e) {
			console.error("Favori değiştirilemedi:", e);
		}
	};

	const handleShare = async () => {
		try {
			await Share.share({
				title: item?.title || "StreamPulse",
				message: `StreamPulse'da "${item?.title}" izle! ${item?.url || ""}`,
			});
		} catch (_e) {}
	};

	const items = [
		{
			key: "header",
			type: "header",
			title: item?.title || "İçerik",
			subtitle: [
				tabLabels[activeTab] || "Kitaplıkta",
				status ? `Durum: ${LIST_LABELS[status]}` : null,
			]
				.filter(Boolean)
				.join(" · "),
			posterUri:
				item?.poster ||
				item?.poster_url ||
				item?.image ||
				item?.backdrop_url ||
				null,
		},
		{
			key: "details",
			title: "Detay Sayfasına Git",
			description: "Oyuncular, bölümler ve fragman",
			icon: "information-circle-outline",
			onPress: () => onDetails?.(),
		},
		...libraryMenuItems({
			status,
			isFavorite: favorite,
			onStatus: handleStatus,
			onFavorite: handleFavorite,
		}),
		{
			key: "share",
			title: "Paylaş",
			icon: "share-social-outline",
			onPress: handleShare,
		},
	];

	if (onRemove) {
		items.push({
			key: "remove",
			title: "Kitaplıktan Kaldır",
			icon: "trash-outline",
			destructive: true,
			onPress: () => onRemove(),
		});
	}

	return (
		<AppMenuList
			items={items}
			width={width}
			autoFocusFirst={autoFocus}
			onItemPress={(pressed) => {
				close?.();
				pressed.onPress?.();
			}}
		/>
	);
}