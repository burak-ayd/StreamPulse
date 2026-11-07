/**
 * ChannelCardSkeleton — ChannelCard'ın YÜKLENİYOR hali
 * =====================================================
 *
 * Canlı TV ekranı 138 kanal gösteriyor ve liste çoğu zaman önbellek
 * olmadan açılıyor. Bu iskelet ızgaranın gerçek ölçülerini kullanır:
 *   • sütun sayısı ve kart genişliği → `live.jsx`'in hesabından gelir,
 *   • kutu oranı/yuvarlaklığı → `ChannelCard` sabitleri.
 *
 * ⚠️ Palet SABİT koyu (bkz. `ChannelCard` dosya başı), bu yüzden tema
 * bağlamına bağlanmaz — `FIXED_DARK_SKELETON` kullanılır.
 */

import {
	CHANNEL_NAME_HEIGHT,
	CHANNEL_TILE_ASPECT,
	CHANNEL_TILE_RADIUS,
} from "@/components/live/ChannelCard";
import {
	FIXED_DARK_SKELETON,
	SkeletonBlock,
	SkeletonLine,
} from "@/components/common/Skeleton";
import { memo } from "react";
import { StyleSheet, View } from "react-native";

function ChannelCardSkeleton({ width }) {
	if (!width || width <= 0) return null;

	return (
		<View style={[styles.card, { width }]} pointerEvents="none">
			<SkeletonBlock
				width="100%"
				radius={CHANNEL_TILE_RADIUS}
				color={FIXED_DARK_SKELETON.block}
				style={{ aspectRatio: CHANNEL_TILE_ASPECT }}
			/>
			{/* Kart adı şeridinin karşılığı — ayrı satır değil, bindirme. */}
			<View style={styles.nameBar}>
				<SkeletonLine
					width="64%"
					height={Math.max(8, CHANNEL_NAME_HEIGHT - 5)}
					color={FIXED_DARK_SKELETON.line}
				/>
			</View>
		</View>
	);
}

export default memo(ChannelCardSkeleton);

const styles = StyleSheet.create({
	card: {},
	nameBar: {
		position: "absolute",
		left: 8,
		right: 8,
		bottom: 7,
	},
});
