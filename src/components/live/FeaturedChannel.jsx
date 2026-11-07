/**
 * FeaturedChannel — Canlı TV'nin "öne çıkan yayın" kartı
 *
 * Izgaranın ilk kanalını büyük bir vitrin kartında gösterir. Amaç yalnız
 * süs değil: ekran açıldığında kullanıcı 138 küçük logonun arasında
 * kaybolmadan tek bir yayına odaklanır ve kumandada ilk OK anlamlı bir
 * hedefe gider.
 *
 * ── Neden logo arka plan değil ────────────────────────────────────
 * Kanal verisinde backdrop yok; logolar ise şeffaf ve tutarsız
 * boyutlarda. Logoyu arka plana germek markaları bozar. Bu yüzden zemin
 * sabit bir marka gradyanı, logo ise kendi kutusunda `contain`.
 *
 * Metin/ölçüler `useTvMetrics().sp()` ile TV'de büyür.
 */
import Image from "@/components/common/SmartImage";
import TVPressable from "@/components/common/TVPressable";
import { FontFamily, Palette } from "@/constants/theme";
import { useTvMetrics } from "@/utils/tvMetrics";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, Text, View } from "react-native";

export default function FeaturedChannel({ channel, categoryName, onPress }) {
	const { isTV, sp } = useTvMetrics();
	if (!channel) return null;

	const isPayTv = Boolean(channel.is_paytv);

	return (
		<TVPressable
			onPress={onPress}
			style={[styles.card, { height: isTV ? sp(146) : 168 }]}
			focusedStyle={styles.cardFocused}
			accessibilityLabel={`${channel.name}, canlı yayın${
				isPayTv ? ", abonelik gerektirir" : ""
			}`}>
			{({ focused }) => (
				<LinearGradient
					colors={
						focused
							? ["#332c52", "#1b1a20"]
							: ["#2a2440", "#1b1a20"]
					}
					start={{ x: 0, y: 0 }}
					end={{ x: 1, y: 0.9 }}
					style={styles.gradient}>
					<View style={styles.textBlock}>
						<View style={styles.liveRow}>
							<View style={styles.liveDot} />
							<Text style={[styles.eyebrow, { fontSize: sp(10) }]}>
								ŞİMDİ CANLI
							</Text>
							{isPayTv ? (
								<View style={styles.payPill}>
									<Ionicons
										name="lock-closed"
										size={9}
										color={Palette.surfaceLowest}
									/>
									<Text style={styles.payText}>ABONELİK</Text>
								</View>
							) : null}
						</View>

						<Text
							style={[styles.name, { fontSize: sp(23) }]}
							numberOfLines={2}>
							{channel.name || "Kanal"}
						</Text>

						{categoryName ? (
							<Text
								style={[styles.meta, { fontSize: sp(12) }]}
								numberOfLines={1}>
								{categoryName}
							</Text>
						) : null}

						<View style={styles.cta}>
							<Ionicons
								name="play"
								size={sp(13)}
								color={Palette.onPrimaryContainer}
								style={styles.ctaIcon}
							/>
							<Text style={[styles.ctaText, { fontSize: sp(12) }]}>
								Kanalı Aç
							</Text>
						</View>
					</View>

					<View style={styles.logoWrap}>
						<View
							style={[
								styles.logoBox,
								{
									width: isTV ? sp(96) : 96,
									height: isTV ? sp(96) : 96,
									borderRadius: sp(18),
								},
							]}>
							{channel.logo ? (
								<Image
									source={{ uri: channel.logo }}
									style={styles.logo}
									contentFit="contain"
									contentPosition="center"
									transition={0}
									cachePolicy="memory-disk"
								/>
							) : (
								<Ionicons
									name="tv-outline"
									size={sp(34)}
									color={Palette.onSurfaceVariant}
								/>
							)}
						</View>
					</View>
				</LinearGradient>
			)}
		</TVPressable>
	);
}

const styles = StyleSheet.create({
	card: {
		borderRadius: 18,
		borderWidth: 2,
		borderColor: "transparent",
		overflow: "hidden",
	},
	cardFocused: {
		borderColor: Palette.primary,
	},
	gradient: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: 20,
		paddingVertical: 14,
		gap: 16,
	},
	textBlock: {
		flex: 1,
		minWidth: 0,
		alignItems: "flex-start",
	},
	liveRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
	},
	liveDot: {
		width: 6,
		height: 6,
		borderRadius: 3,
		backgroundColor: "#ff5b6e",
	},
	eyebrow: {
		color: Palette.onSurfaceVariant,
		fontFamily: FontFamily.bold,
		letterSpacing: 1.2,
	},
	payPill: {
		flexDirection: "row",
		alignItems: "center",
		gap: 3,
		marginLeft: 4,
		paddingHorizontal: 7,
		paddingVertical: 2,
		borderRadius: 999,
		backgroundColor: Palette.tertiary,
	},
	payText: {
		color: Palette.surfaceLowest,
		fontFamily: FontFamily.bold,
		fontSize: 8,
		letterSpacing: 0.4,
	},
	name: {
		marginTop: 6,
		color: Palette.onSurface,
		fontFamily: FontFamily.bold,
		letterSpacing: -0.4,
		lineHeight: 30,
	},
	meta: {
		marginTop: 2,
		color: Palette.onSurfaceVariant,
		fontFamily: FontFamily.medium,
	},
	cta: {
		marginTop: 10,
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		paddingHorizontal: 14,
		paddingVertical: 7,
		borderRadius: 999,
		backgroundColor: Palette.primaryContainer,
	},
	ctaIcon: {
		marginLeft: 1,
	},
	ctaText: {
		color: Palette.onPrimaryContainer,
		fontFamily: FontFamily.bold,
	},
	logoWrap: {
		alignItems: "center",
		justifyContent: "center",
	},
	logoBox: {
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "rgba(229,225,228,0.06)",
		borderWidth: 1,
		borderColor: "rgba(229,225,228,0.10)",
	},
	logo: {
		width: "78%",
		height: "78%",
	},
});
