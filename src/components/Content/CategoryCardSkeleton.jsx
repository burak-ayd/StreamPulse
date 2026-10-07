/**
 * CategoryCardSkeleton — CategoryCard'ın YÜKLENİYOR hali
 * =====================================================
 *
 * ⚠️ BU DOSYA NEDEN VAR
 *
 * Eskiden kategori satırları yüklenirken ortada dönen bir
 * `ActivityIndicator` gösteriliyordu. O an ekranın geometrisi kart
 * satırından TAMAMEN farklıydı: 140px'lik ince bir şerit. İçerik
 * gelince şerit kaybolup yerine ~230px'lik başlık + kart dizisi
 * geliyordu. Kullanıcı "sayfa zıpladı" diye algılıyor — aslında
 * uygulama iki farklı düzen çiziyordu.
 *
 * Bu iskelet, `CategoryCard`'ın geometrisini doğrudan onun sabitlerinden
 * okur (`CARD_POSTER_RATIO`, `CARD_TITLE_HEIGHT`…). Aynı sayıları
 * kullandığı için içerik geldiğinde bloklar birebir yerine oturur.
 *
 * `variant` gerçek kartla aynı sözleşmeyi paylaşır:
 *   • "row"  → ana sayfa yatay satırı (sabit 124dp, yıl satırı yok)
 *   • "grid" → kategori sayfası ızgarası (genişlik dışarıdan, yıl var)
 */

import {
	CARD_POSTER_RADIUS,
	CARD_POSTER_RATIO,
	CARD_TITLE_HEIGHT,
	CARD_TITLE_MARGIN_TOP,
	CARD_YEAR_HEIGHT,
	CARD_YEAR_MARGIN_TOP,
	ROW_CARD_WIDTH,
} from "@/components/content/CategoryCard";
import { SkeletonBlock, SkeletonLine } from "@/components/common/Skeleton";
import { memo } from "react";
import { StyleSheet, View } from "react-native";

function CategoryCardSkeleton({
	variant = "row",
	width,
	count = 1,
	/** Kartlar arası boşluk — çağıranın kendi `gap` değeriyle aynı olmalı. */
	gap = 0,
}) {
	const isRow = variant === "row";
	const cardWidth = isRow ? ROW_CARD_WIDTH : width;

	const cards = Array.from({ length: Math.max(1, count) });

	return (
		<View style={[styles.row, { gap }]} pointerEvents="none">
			{cards.map((_, index) => (
				<View
					key={index}
					style={[styles.card, { width: isRow ? ROW_CARD_WIDTH : cardWidth }]}>
					<SkeletonBlock
						width="100%"
						aspectRatio={CARD_POSTER_RATIO}
						radius={CARD_POSTER_RADIUS}
					/>
					<SkeletonLine
						width="82%"
						height={CARD_TITLE_HEIGHT - 4}
						style={{ marginTop: CARD_TITLE_MARGIN_TOP }}
					/>
					{isRow ? null : (
						<SkeletonLine
							width="42%"
							height={CARD_YEAR_HEIGHT - 4}
							style={{ marginTop: CARD_YEAR_MARGIN_TOP }}
						/>
					)}
				</View>
			))}
		</View>
	);
}

export default memo(CategoryCardSkeleton);

const styles = StyleSheet.create({
	/** `count` kartı yan yana dizmek için satır. */
	row: {
		flexDirection: "row",
	},
	card: {},
});