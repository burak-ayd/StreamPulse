/**
 * ChannelCard — CANLI TV KANAL KARTI (TEK KAYNAK)
 *
 * `app/(app)/live.jsx` içindeki ızgara bu kartı render eder. Kart
 * iki yerden (telefon 3 sütun / TV 10 sütun) kullanıldığı için GENİŞLİK
 * dışarıdan verilir; kart kendi içinde sabit bir genişlik taşımaz. Aksi
 * hâlde TV'de kart yine telefon genişliğinde kalır ve 10 sütun boşa
 * yer kaplardı.
 *
 * ── Neden `ColorsM3.dark` SABİT ──────────────────────────────────
 * `useThemeContext().m3` yerine doğrudan koyu palet okunuyor. Gerekçe:
 * canlı TV bir "video öncesi" yüzeyi — kullanıcı burada izlemek üzere
 * açılıyor ve uygulamanın geri kalanı her ne temada ise oradan bağımsız
 * tutarlı kalmalı. Ek olarak kart `memo` ve saf bir görsel bileşen:
 * tema bağlamına bağlanırsa her tema değişiminde 138 kartın tamamı
 * yeniden render olur. (Eski `Colors.*` paletine de dokunulmadı; 21 ekran
 * onu okuyor.)
 *
 * ── Logo kutusu ───────────────────────────────────────────────────
 * Logolar `raw.githubusercontent.com` üzerinde ve BOYUTLARI TUTARSIZ
 * (ölçülen: 7–18 KB, "kareye yakın" ama hepsi aynı değil). Bu yüzden:
 *   • kutu `aspectRatio: 1` ile SABİT — `contentFit` olmadan kırılır,
 *   • `contentFit: "contain"` — kırpma yok, boşluk kalsın,
 *   • arka plan `surfaceContainerHigh` — yükleme/eksik logo boşluğu
 *     koyu bir leke değil, yüzey gibi görünür.
 *
 * ── `recyclingKey` ────────────────────────────────────────────────
 * Sanallaştırılmış ızgarada kartlar geri dönüşüm havuzundan geçerken
 * Android'de yanlış görselin bir sonraki karta taşınmasını bu anahtar
 * engeller. `transition={0}`: logolar neredeyse hiç değişmiyor, her kart
 * için crossfade animasyonu decode kuyruğunu boşuna dolduruyor.
 *
 * ── TV odak ───────────────────────────────────────────────────────
 * Odakta elevation/gölge değişmiyor (bkz. `CategoryCard` notu:
 * Android'de elevation değişimi outline'u geçersiz kılar ve geçişleri
 * takılır). Kenarlık + ölçek aynı vurguyu bedavaya veriyor.
 */

import TVPressable from "@/components/common/TVPressable";
import { ColorsM3 } from "@/constants/theme";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import Image from "@/components/common/SmartImage";
import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

/** Sabit koyu palet — gerekçe dosya başında. */
const c = ColorsM3.dark;

/**
 * Abonelik rozeti sarısı.
 * `library.jsx`'in yıldız rozetiyle aynı ton: kullanıcı "sarı = bilgi/uyarı"
 * bağını uygulamadan öğrenmiş oluyor, yeni bir renk tanımlamaya gerek yok.
 */
const PAY_TV_YELLOW = "#F5C518";

/** Kilit ikonu koyu zeminde okunsun diye (rozetin zemini sarı). */
const PAY_TV_INK = "#1a1200";

/**
 * Bu genişliğin altındaki kartlarda punto küçülür.
 *
 * Gerekçe: TV'de kart ~76–100px genişliğe düşüyor (10 sütun). 13px punto
 * orada kanal adını iki satıra böler ve isim kırpılır. Eşik 110px; bu
 * değerin altına düşen tek senaryo TV ızgarası, üstü telefon/tablet.
 */
const COMPACT_UNDER = 110;

/**
 * Kanal kartı geometrisinin SAYILARI — iskelet de gerçek kart da bunları
 * okur. Kaynak: `styles.logoBox` / `styles.name` / `styles.nameCompact`.
 */
export const CHANNEL_LOGO_RADIUS = 12;
export const CHANNEL_NAME_HEIGHT = 17; // lineHeight
export const CHANNEL_NAME_MARGIN_TOP = 6;
export const CHANNEL_NAME_COMPACT_HEIGHT = 13;
export const CHANNEL_NAME_COMPACT_MARGIN_TOP = 5;

function ChannelCard({ channel, onPress, width }) {
	/*
	 * Ölçüm tamamlanmadan (genişlik 0) kart render EDİLMEZ. `width: 0`
	 * bir stil olarak sessizce uygulanırsa kart görünmez ama yer kaplar;
	 * ilk karede "hiç kanal yok" yanılsığı üretir.
	 */
	if (!width || width <= 0) return null;

	const name = channel?.name || "Kanal";
	const logo = channel?.logo || null;
	const isPayTv = Boolean(channel?.is_paytv);
	const compact = width < COMPACT_UNDER;

	return (
		<TVPressable
			style={[styles.card, { width }]}
			focusedStyle={styles.cardFocused}
			onPress={onPress}
			accessibilityLabel={
				isPayTv ? `${name}, abonelik gerektiren kanal` : name
			}>
			{({ focused }) => (
				<View>
					<View
						style={[
							styles.logoBox,
							{ backgroundColor: c.surfaceContainerHigh },
							focused && { borderColor: c.primaryContainer },
						]}>
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
							 * Logo alanı boşsa kareye TV ikonu koyulur; `logo`
							 * alanı backend'de opsiyonel görünüyor ve 138
							 * kanalın hepsinde dolu olduğu garanti değil.
							 */
							<View style={styles.logoFallback}>
								<Ionicons
									name="tv-outline"
									size={compact ? 18 : 26}
									color={c.onSurfaceVariant}
								/>
							</View>
						)}

						{isPayTv ? (
							/*
							 * Rozet LOGO'NUN ÜSTÜNE binmiyor, ayrı satıra
							 * gitmiyor: 76px geniş bir kartta ayrı rozet satırı
							 * kartın yarısını yer. Üst-sağ köşede kilit ikonu
							 * hemen görünüyor.
							 */
							<View style={styles.payBadge} pointerEvents="none">
								<Ionicons
									name="lock-closed"
									size={compact ? 8 : 10}
									color={PAY_TV_INK}
								/>
							</View>
						) : null}
					</View>

					<Text
						style={[
							styles.name,
							compact && styles.nameCompact,
							{
								color: focused
									? c.primaryContainer
									: c.onSurface,
							},
						]}
						numberOfLines={2}>
						{name}
					</Text>
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
	card: {
		// genişlik dışarıdan verilir
	},
	cardFocused: {
		// zIndex kaldırıldı: kardeş sıralamasını değiştirmek odak başına ayrı
		// bir commit demek. Ölçek + ızgaradaki boşluk kartı komşusunun
		// altına sokmaz, görsel olarak da yeterince belirgin.
		transform: [{ scale: 1.07 }],
	},
	logoBox: {
		width: "100%",
		// Kare kutu: logolar kareye yakın ama tutarsız; sabit kutu + `contain`
		// ızgaranın satır yüksekliğini sabit tutar.
		aspectRatio: 1,
		borderRadius: CHANNEL_LOGO_RADIUS,
		overflow: "hidden",
		borderWidth: 2,
		borderColor: "transparent",
	},
	logo: {
		width: "100%",
		height: "100%",
	},
	logoFallback: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
	},
	payBadge: {
		position: "absolute",
		top: 4,
		right: 4,
		minWidth: 16,
		height: 16,
		borderRadius: 8,
		paddingHorizontal: 3,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: PAY_TV_YELLOW,
	},
	name: {
		fontSize: 13,
		lineHeight: CHANNEL_NAME_HEIGHT,
		fontWeight: "600",
		marginTop: CHANNEL_NAME_MARGIN_TOP,
		letterSpacing: -0.1,
	},
	nameCompact: {
		fontSize: 10,
		lineHeight: CHANNEL_NAME_COMPACT_HEIGHT,
		fontWeight: "500",
		marginTop: CHANNEL_NAME_COMPACT_MARGIN_TOP,
	},
});