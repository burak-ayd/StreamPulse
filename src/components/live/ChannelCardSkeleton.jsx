/**
 * ChannelCardSkeleton — ChannelCard'ın YÜKLENİYOR hali
 * =====================================================
 *
 * Canlı TV ekranı 138 kanal gösteriyor ve liste çoğu zaman önbellek
 * olmadan açılıyor. Ortadaki "Kanallar yükleniyor…" spinner'ı ekranı
 * boş bırakıyor, sonra 138 kart bir anda doluyordu.
 *
 * Bu iskelet ızgaranın gerçek ölçülerini kullanır:
 *   • sütun sayısı ve kart genişliği → `live.jsx`'in `sutunSayisi` /
 *     `kartGenisligi` hesabından gelir (burada yalnızca `width` alınır),
 *   • kutu oranı/yuvarlaklığı → `CHANNEL_LOGO_RADIUS`,
 *   • kanal adı yüksekliği → `CHANNEL_NAME_*`.
 *
 * ⚠️ Canlı TV'nin paleti SABİT koyu (bkz. `ChannelCard` dosya başı),
 * bu yüzden tema bağlamına bağlanmaz — `FIXED_DARK_SKELETON` kullanılır.
 */

import {
	CHANNEL_LOGO_RADIUS,
	CHANNEL_NAME_COMPACT_HEIGHT,
	CHANNEL_NAME_COMPACT_MARGIN_TOP,
	CHANNEL_NAME_HEIGHT,
	CHANNEL_NAME_MARGIN_TOP,
} from "@/components/live/ChannelCard";
import {
	FIXED_DARK_SKELETON,
	SkeletonBlock,
	SkeletonLine,
} from "@/components/common/Skeleton";
import { memo } from "react";
import { StyleSheet, View } from "react-native";

/** `COMPACT_UNDER` ile aynı eşik — 110dp altı punto küçülür. */
const COMPACT_UNDER = 110;

function ChannelCardSkeleton({ width }) {
	if (!width || width <= 0) return null;

	const compact = width < COMPACT_UNDER;
	const nameHeight = compact
		? CHANNEL_NAME_COMPACT_HEIGHT
		: CHANNEL_NAME_HEIGHT;
	const nameMarginTop = compact
		? CHANNEL_NAME_COMPACT_MARGIN_TOP
		: CHANNEL_NAME_MARGIN_TOP;

	return (
		<View style={[styles.card, { width }]} pointerEvents="none">
			{/* Logo kutusu: `aspectRatio: 1` → kare. */}
			<SkeletonBlock
				width="100%"
				aspectRatio={1}
				radius={CHANNEL_LOGO_RADIUS}
				color={FIXED_DARK_SKELETON.block}
			/>

			{/*
			 * Kanal adı 1–2 satır olabilir; ızgara yüksekliği bu yüzden
			 * değişebiliyor. İskelet TEK satır yüksekliğinde — çoğu kanal
			 * adı tek satıra sığar ve satır yüksekliği zaten sabit kaldığı
			 * için (logo kutusu kare) kayma olmuyor.
			 */}
			<SkeletonLine
				width="86%"
				height={Math.max(8, nameHeight - 4)}
				color={FIXED_DARK_SKELETON.line}
				style={{ marginTop: nameMarginTop }}
			/>
		</View>
	);
}

export default memo(ChannelCardSkeleton);

const styles = StyleSheet.create({
	card: {},
});