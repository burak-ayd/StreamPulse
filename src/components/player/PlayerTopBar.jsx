import React, { useMemo } from "react";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { StyleSheet, Text, View } from "react-native";
import TVPressable from "@/components/common/TVPressable";

/**
 * CloudStream tarzı üst bilgi çubuğu.
 *
 * ⭐ GÖRÜNÜM KAYNAĞI (kullanıcı ekran görüntüsü):
 *
 *   ← (geri)          FourPichive - 1920×1080
 *                      AVC · Türkçe · Stereo · AAC
 *                      MobLand "S1:B1" - 1. Bölüm
 *
 * Yani: GERİ düğmesi solda, başlık **ortada ve 3 satırlık** bir bilgi
 * bloğu. Kaynak adı, çözünürlük, codec/dil/kanal, dizi-bölüm bilgisi
 * ayrı satırlarda ve ikincisi/üçüncüsü kalın (bold).
 *
 * ⚠️ Neden ayrı bileşen: üst bar bilgi metni + geri düğmesi + (opsiyonel)
 * eylem alanı taşıyor. `VideoPlayer`'ın orkestrasyon dosyasında üçüncü
 * bir katman daha açmak okunabilirliği bozuyordu.
 */
export default function PlayerTopBar({
	title,
	subtitle,
	sourceName,
	naturalSize,
	audioInfo,
	seriesLine,
	onClose,
	onAction,
}) {
	// 1. satır: kaynak + çözünürlük
	const line1 = useMemo(() => {
		const res =
			naturalSize?.width && naturalSize?.height
				? `${naturalSize.width}×${naturalSize.height}`
				: null;
		if (sourceName && res) return `${sourceName} - ${res}`;
		return sourceName || res || "";
	}, [sourceName, naturalSize]);

	// 2. satır: codec · dil · kanal · ses codec'i
	const line2 = useMemo(() => {
		const parts = [];
		if (audioInfo?.videoCodec) parts.push(audioInfo.videoCodec);
		if (audioInfo?.language) parts.push(audioInfo.language);
		if (audioInfo?.channels) parts.push(audioInfo.channels);
		if (audioInfo?.audioCodec) parts.push(audioInfo.audioCodec);
		return parts.join(" · ");
	}, [audioInfo]);

	/*
	 * 3. satır: İÇERİK BAŞLIĞI.
	 *
	 * ⚠️ KULLANICI ŞİKÂYETİ (video kanıtı): "izlenen içeriğin başlığı
	 * gözükmüyor". Önceden bu satırda yalnızca `seriesLine` veya
	 * `subtitle` vardı; düz bir filmde ikisi de boş olduğu için başlık
	 * HİÇ ÇİZİLMİYORDU ve üstte sadece kaynak adı kalıyordu.
	 *
	 * Öncelik sırası:
	 *   1. `seriesLine` — dizi/bölüm bilgisi varsa (CloudStream: "S1:B1 - 1. Bölüm")
	 *   2. `title`      — içerik adı (film/dizi adı)
	 *   3. `subtitle`   — yedek
	 *
	 * `title` boşsa hiç satır çizilmez (ekran gereksiz yere dolmaz).
	 */
	const line3 = seriesLine || title || subtitle || "";

	const hasInfo = Boolean(line1 || line2 || line3);

	return (
		<View style={styles.bar} pointerEvents="box-none">
			<TVPressable
				style={styles.backButton}
				focusedStyle={styles.backButtonFocused}
				cancelable={false}
				onPress={onClose}>
				<Ionicons name="chevron-back" size={28} color="#FFFFFF" />
			</TVPressable>

			{/*
			 * Başlık bloğu `flex: 1` ve `textAlign: "center"` ile EKRANIN
			 * ORTASINDA durur; geri düğmesi `position: "absolute"` ile
			 * çıkarıldığı için başlık alanı gerçekten ortalanır (aksi hâlde
			 * geri düğmesi kadar kayardı).
			 */}
			<View style={styles.titleBlock} pointerEvents="none">
				{line1 ? (
					<Text style={styles.line} numberOfLines={1}>
						{line1}
					</Text>
				) : null}
				{line2 ? (
					<Text style={styles.lineBold} numberOfLines={1}>
						{line2}
					</Text>
				) : null}
				{line3 ? (
					<Text style={styles.lineBold} numberOfLines={1}>
						{line3}
					</Text>
				) : null}
			</View>

			{/* Sağ aksiyon alanı (ikon düğmeleri) */}
			<View style={styles.actions} pointerEvents="box-none">
				{onAction ? onAction : null}
			</View>

			{!hasInfo ? null : null}
		</View>
	);
}

const styles = StyleSheet.create({
	bar: {
		flexDirection: "row",
		alignItems: "flex-start",
		minHeight: 56,
	},
	/*
	 * ⚠️ İKONLARIN ÜST ÜSTE BİNMESİ (video kanıtı).
	 *
	 * `titleBlock` `flex: 1` olduğu için mevcut boşluğun TAMAMINI alır ve
	 * kardeşleri (geri düğmesi, aksiyon ikonları) sıkıştırır. React Native
	 * `flexShrink` varsayılanı 0 olsa da, `flex: 1` = `flexGrow:1 +
	 * flexShrink:1 + flexBasis:0%` demektir; yani başlık alanı ASLA küçülmez
	 * ve kardeşlerini ezer. Sonuç: sağdaki ikonlar üst üste biniyor ve
	 * aralarındaki `gap` görünmez oluyor.
	 *
	 * Çözüm: esnetilmeyen alanlara `flexShrink: 0` veriyoruz. Başlık
	 * alanı kalan boşluğu alır (ve `minWidth: 0` ile taşmayı önler).
	 */
	backButton: {
		width: 44,
		height: 44,
		flexShrink: 0,
		alignItems: "center",
		justifyContent: "center",
		borderRadius: 22,
	},
	backButtonFocused: {
		backgroundColor: "rgba(255, 59, 48, 0.35)",
		transform: [{ scale: 1.1 }],
	},
	titleBlock: {
		flex: 1,
		// `minWidth: 0` olmadan uzun metin, kardeş ikonları yine ezer
		// (React Native'de flex çocuklarının varsayılan `minWidth: auto`
		// davranışı).
		minWidth: 0,
		alignItems: "center",
		paddingTop: 2,
	},
	line: {
		color: "#FFFFFF",
		fontSize: 15,
		fontWeight: "500",
		textAlign: "center",
	},
	lineBold: {
		color: "#FFFFFF",
		fontSize: 15,
		fontWeight: "700",
		textAlign: "center",
		marginTop: 2,
	},
	actions: {
		flexDirection: "row",
		alignItems: "center",
		// ⚠️ `flexShrink: 0` şart: başlık alanı `flex: 1` olduğu için
		// aksi halde bu alan sıkışır ve ikonlar üst üste biner.
		flexShrink: 0,
		gap: 8,
		marginLeft: 8,
	},
});