import AppMenuList from "./AppMenuList";
import AppPeekMenu from "./AppPeekMenu";
import { useAppMenu } from "./AppMenuProvider";
import { LIST_LABELS, libraryMenuItems } from "./libraryItems";
import { useFeedback } from "@/components/feedback/AppFeedbackProvider";
import { useLibraryStatus } from "@/context/LibraryStatusContext";
import { setContentLibraryList, toggleFavorite } from "@/utils/storage";
import { useMemo } from "react";

/**
 * Kitaplık listesi + favori menüsü.
 *
 * Eski `ListSelectModal`'ın yerini alır. Aynı menü hem içerik kartlarının
 * üzerinde (telefon) hem merkezî TV panelinde açılır.
 *
 * @param {object} props
 * @param {object} props.item
 * @param {(status: string|null, isFavorite: boolean) => void} [props.onChanged]
 * @param {(trigger: {openMenu: () => void}) => React.ReactNode} props.children
 */
export default function LibraryPeekMenu({ item, onChanged, children }) {
	const { open } = useAppMenu();
	const spec = useMemo(() => ({ item, onChanged }), [item, onChanged]);
	const trigger = useMemo(
		() => ({
			openMenu: () => {
				if (!item) return;
				open({
					render: (props) => <LibraryMenuBody spec={spec} {...props} />,
				});
			},
		}),
		[open, spec, item],
	);

	return (
		<AppPeekMenu
			activateOn="tap"
			disabled={!item}
			renderMenu={({ close }) => (
				<LibraryMenuBody spec={spec} close={close} />
			)}>
			{children(trigger)}
		</AppPeekMenu>
	);
}

export function LibraryMenuBody({ spec, close, autoFocus = false, width }) {
	const { item, onChanged } = spec;
	const { toast } = useFeedback();
	const { statusOf, isFavorite } = useLibraryStatus();
	
	const status = statusOf(item);
	const favorite = isFavorite(item);

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
			onChanged?.(result, favorite);
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
			onChanged?.(status, isFav);
		} catch (e) {
			console.error("Favori değiştirilemedi:", e);
		}
	};

	const items = [
		{
			key: "header",
			type: "header",
			title: item?.title || item?.name || "İçerik",
			subtitle: [item?.year, `Durum: ${status ? LIST_LABELS[status] : "Listede değil"}`]
				.filter(Boolean)
				.join(" · "),
			posterUri:
				item?.poster ||
				item?.poster_url ||
				item?.image ||
				item?.backdrop_url ||
				null,
		},
		...libraryMenuItems({
			status,
			isFavorite: favorite,
			onStatus: handleStatus,
			onFavorite: handleFavorite,
		}),
	];

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