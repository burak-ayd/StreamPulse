import { Palette } from "@/constants/theme";

export const LIST_LABELS = {
	watching: "İzleniyor",
	planned: "Planlandı",
	completed: "Tamamlandı",
};

const LIST_ROWS = [
	{
		key: "watching",
		title: "İzleniyor",
		description: "Kaldığın yerden devam et",
		icon: "play-circle-outline",
		color: Palette.secondary,
	},
	{
		key: "planned",
		title: "Planlandı",
		description: "Daha sonra izlemek üzere kaydet",
		icon: "bookmark-outline",
		color: Palette.primary,
	},
	{
		key: "completed",
		title: "Tamamlandı",
		description: "Bitirdiklerine ekle",
		icon: "checkmark-circle-outline",
		color: Palette.success,
	},
];

/**
 * Kitaplık durumu + favori menü satırları.
 *
 * Durum satırında etiket ve güncel değer YAN YANA, tek satırda durur
 * (`type: "info"`); altındaki üç satır hedef listeyi seçer.
 */
export function libraryMenuItems({
	status = null,
	isFavorite = false,
	onStatus,
	onFavorite,
	onRemove,
	removeLabel = "Kitaplıktan Kaldır",
}) {
	const items = [
		{
			key: "status-info",
			type: "info",
			title: "Durum",
			value: status ? LIST_LABELS[status] : "Listede değil",
			valueColor: status ? Palette.secondary : Palette.outline,
		},
		{ key: "status-label", type: "label", title: "LİSTEYE TAŞI" },
		...LIST_ROWS.map((row) => ({
			key: row.key,
			title: row.title,
			description: row.description,
			icon: row.icon,
			iconColor: row.color,
			iconBg: `${row.color}1f`,
			selected: status === row.key,
			onPress: () => onStatus?.(row.key),
		})),
		{
			key: "favorite",
			title: isFavorite ? "Favorilerden Çıkar" : "Favorilere Ekle",
			icon: isFavorite ? "heart" : "heart-outline",
			iconColor: Palette.error,
			iconBg: "rgba(255, 180, 171, 0.14)",
			value: isFavorite ? "Favori" : undefined,
			valueColor: Palette.error,
			onPress: () => onFavorite?.(),
		},
	];

	if (onRemove) {
		items.push({
			key: "remove",
			title: removeLabel,
			icon: "trash-outline",
			destructive: true,
			onPress: onRemove,
		});
	}

	return items;
}