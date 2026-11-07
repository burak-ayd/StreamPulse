/**
 * ChannelCard — CANLI TV KANAL KARTI (TEK KAYNAK)
 *
 * `app/(app)/live.jsx` içindeki ızgara bu kartı render eder. Kart
 * iki yerden (telefon / TV) kullanıldığı için GENİŞLİK dışarıdan
 * verilir; kart kendi içinde sabit bir genişlik taşımaz.
 *
 * ── Tasarım ───────────────────────────────────────────────────────
 * Kart artık kare logo kutusu değil, 4:3 bir "yayın kutusu":
 *   • logo kutunun ortasında `contain` ile durur (logolar tutarsız
 *     boyutlarda ve şeffaf; kırpmak markayı bozar),
 *   • kanal adı kutunun ALTINDA, yarı saydam bir şeritte yaşar —
 *     ızgarada ayrı satır açmadan okunur ve kart yüksekliği sabit kalır,
 *   • abonelik rozeti sağ üstte küçük bir kilit hapı.
 *
 * ── TV odak ───────────────────────────────────────────────────────
 * Odakta ölçek/elevation DEĞİŞMEZ (bkz. `CategoryCard` notu: Android'de
 * elevation değişimi outline'u geçersiz kılar ve geçişleri takılır).
 * Kenarlık + hafif zemin aydınlanması aynı vurguyu bedavaya verir.
 */

import TVPressable from "@/components/common/TVPressable";
import { FontFamily, Palette } from "@/constants/theme";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import Image from "@/components/common/SmartImage";
import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

/** Abonelik rozeti sarısı — `library.jsx`'in yıldız rozetiyle aynı ton. */
const PAY_TV_YELLOW = Palette.tertiary;

/** Kilit ikonu koyu zeminde okunsun diye (rozetin zemini sarı). */
const PAY_TV_INK = Palette.surfaceLowest;

/**
 * Kart geometrisi — iskelet de bu sayıları okur.
 * `aspectRatio: 4/3` hem logoya yeterli alan bırakır hem de TV'de
 * 6 sütunda satır yüksekliğini makul tutar.
 */
export const CHANNEL_TILE_RADIUS = 14;
export const CHANNEL_TILE_ASPECT = 4 / 3;
export const CHANNEL_NAME_HEIGHT = 15;

function ChannelCard({ channel, onPress, width, onFocus, onBlur }) {
	/*
	 * Ölçüm tamamlanmadan (genişlik 0) kart render EDİLMEZ. `width: 0`
	 * bir stil olarak sessizce uygulanırsa kart görünmez ama yer kaplar;
	 * ilk karede "hiç kanal yok" yanılsaması üretir.
	 */
	if (!width || width <= 0) return null;

	const name = channel?.name || "Kanal";
	const logo = channel?.logo || null;
	const isPayTv = Boolean(channel?.is_paytv);

	return (
		<TVPressable
			style={{ width }}
			focusedStyle={styles.cardFocused}
			onPress={onPress}
			onFocus={onFocus}
			onBlur={onBlur}
			accessibilityLabel={
				isPayTv ? `${name}, abonelik gerektiren kanal` : name
			}>
			{({ focused }) => (
				<View style={[styles.tile, focused && styles.tileFocused]}>
					{logo ? (
						<Image
							source={{ uri: logo }}
							style={styles.logo}
							contentFit="contain"
							contentPosition="center"
							recyclingKey={channel.id}
							transition={0}
							cachePolicy="memory-disk"
						/>
					) : (
						/*
						 * Logo alanı boşsa TV ikonu koyulur; `logo` alanı
						 * backend'de opsiyonel görünüyor.
						 */
						<Ionicons
							name="tv-outline"
							size={26}
							color={Palette.onSurfaceVariant}
						/>
					)}

					{isPayTv ? (
						<View style={styles.payBadge} pointerEvents="none">
							<Ionicons
								name="lock-closed"
								size={9}
								color={PAY_TV_INK}
							/>
						</View>
					) : null}

					{/*
					 * Ad şeridi logonun ÜSTÜNE biner. Ayrı satır yerine
					 * bindirme: 138 kartlık ızgarada her kart için 15–18dp
					 * kazanç, tek ekranda bir satır daha fazla kanal demek.
					 */}
					<View style={styles.nameBar}>
						<View
							style={[
								styles.liveDot,
								focused && styles.liveDotFocused,
							]}
						/>
						<Text
							style={[
								styles.name,
								{
									color: focused
										? Palette.primary
										: Palette.onSurface,
								},
							]}
							numberOfLines={1}>
							{name}
						</Text>
					</View>
				</View>
			)}
		</TVPressable>
	);
}

/**
 * `memo`: 138 kartlık ızgara, üstteki arama kutusu yazıldığında da yeniden
 * render olur. Props'u değişmeyen kartlar atlanır — `ChannelCard`'ın
 * `width`'ı `useMemo` ile sabitlendiği için bu gerçekten tutarlı çalışır.
 */
export default memo(ChannelCard);

const styles = StyleSheet.create({
	tile: {
		width: "100%",
		aspectRatio: CHANNEL_TILE_ASPECT,
		borderRadius: CHANNEL_TILE_RADIUS,
		backgroundColor: Palette.surfaceLow,
		borderWidth: 2,
		borderColor: "transparent",
		overflow: "hidden",
		alignItems: "center",
		justifyContent: "center",
	},
	tileFocused: {
		borderColor: Palette.primary,
		backgroundColor: Palette.surface,
	},
	cardFocused: {
		// Odak kuralı: yalnız kenarlık (bkz. dosya başı).
	},
	logo: {
		width: "62%",
		height: "48%",
		marginBottom: 10,
	},
	nameBar: {
		position: "absolute",
		left: 0,
		right: 0,
		bottom: 0,
		flexDirection: "row",
		alignItems: "center",
		gap: 5,
		paddingHorizontal: 8,
		paddingVertical: 5,
		backgroundColor: "rgba(14,14,16,0.84)",
	},
	liveDot: {
		width: 5,
		height: 5,
		borderRadius: 3,
		backgroundColor: "#ff5b6e",
		flexShrink: 0,
	},
	liveDotFocused: {
		backgroundColor: Palette.primary,
	},
	name: {
		flex: 1,
		fontSize: 11,
		lineHeight: CHANNEL_NAME_HEIGHT,
		fontFamily: FontFamily.semiBold,
		letterSpacing: -0.1,
	},
	payBadge: {
		position: "absolute",
		top: 6,
		right: 6,
		minWidth: 16,
		height: 16,
		borderRadius: 8,
		paddingHorizontal: 3,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: PAY_TV_YELLOW,
	},
});
