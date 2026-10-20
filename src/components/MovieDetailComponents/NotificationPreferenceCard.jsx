/**
 * Bildirim Tercih Kartı — Dizi Detay Ekranı
 *
 * Sunucu Faz 2-3 `settings` sözleşmesine bağlı bileşik kart:
 *   - Aç/kapa → `PUT /api/notifications/settings` (upsert).
 *   - Mod seçimi: "Bu kaynak" (`watched_source`) / "Tüm kaynaklar"
 *     (`all_sources`). Kart her yazımda detay sayfasının KENDİ
 *     kaynağını `watched_provider` olarak gönderir; bu sayede sunucu
 *     `series_audit_state` çiftini (provider + dizi_url) bağlar —
 *     all_sources modunda da denetim tohumu budur.
 *   - Tercih zaten başka kaynakta açıysa "Bu kaynağa geç" ipucu çıkar;
 *     izlediğin kaynağı buradan güncelleyebilirsin (denetim çifti yeni
 *     kaynağa taşınır; eski bağlantı sunucuda kalır, zararı yok).
 *
 * Kart YALNIZCA dizi + `tmdb_id` + `dizi_url` üçü birden varken çizilir;
 * zenginleştirici tmdb eşleşmemişse (ya da içerik filmse) kart sessizce
 * olmamayı seçer — boş uğraş ve yanlış kimlik almaz.
 */

import TVPressable from "@/components/common/TVPressable";
import { useThemeContext } from "@/context/ThemeContext";
import {
	baslikHatirla,
	mediaKimligi,
	tercihOku,
	tercihYaz,
} from "@/services/bildirimApi";
import { useTvMetrics } from "@/utils/tvMetrics";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import React, { useEffect, useMemo, useState } from "react";
import {
	Alert,
	StyleSheet,
	Switch,
	Text,
	View,
} from "react-native";

/**
 * Kart alt yazısı — durum makinesi ne düşünüyorsa onu yazar (yanlış vaat
 * yok): kapalıyken ne olacağını, açıkken hangi kaynağın tarandığını
 * ya da tüm kaynaklar modunu açıkça belirtir.
 */
function durumCumlesi(tercih, kaynakAdi) {
	if (!tercih || !tercih.enabled) {
		return `Açıldığında ${kaynakAdi || "takip ettiğin kaynak"} yeni bölüm çıktığında bildirim düşer.`;
	}
	if (tercih.mode === "all_sources") {
		return "Dizi taranan herhangi bir kaynakta yeni bölüm çıktığında bildirilir.";
	}
	const kaynak = tercih?.watched_provider || kaynakAdi;
	return kaynak
		? `${kaynak} yeni bölüm çıktığında bildirilir.`
		: "Takip ettiğin kaynakta yeni bölüm çıktığında bildirilir.";
}

export default function NotificationPreferenceCard({
	tmdbId,
	diziUrl,
	kaynakAdi,
	diziBasligi,
}) {
	const { colors } = useThemeContext();
	const { isTV, sp } = useTvMetrics();

	const anahtar = useMemo(() => mediaKimligi(tmdbId), [tmdbId]);

	const [tercih, setTercih] = useState(null);
	const [yukleniyor, setYukleniyor] = useState(true);
	const [islemVar, setIslemVar] = useState(false);

	useEffect(() => {
		// istemci etkisi: SADECE async geri aramada setState — senkron
		// reset yoktur; parametre değişirse üst bileşen `key` verip bu
		// kartı taze mountla baştan kurar (React'in önerdiği düzen).
		let canli = true;
		// Başlık anımsatıcısı tercih DURUMUNDAN BAĞIMSIZ yazar: bugün
		// bildirim vermeyen dizi bile yarın bildirirse başlığını biliriz.
		if (anahtar && diziBasligi) {
			void baslikHatirla(anahtar, diziBasligi);
		}
		tercihOku(anahtar)
			.then((satir) => {
				if (canli) setTercih(satir);
			})
			.finally(() => {
				if (canli) setYukleniyor(false);
			});
		return () => {
			canli = false;
		};
	}, [anahtar, diziBasligi]);

	const aktif = Boolean(tercih?.enabled);

	/**
	 * Ortak yazım: her çağrı İSTEMCİNİN mevcut kaynak/url çiftini taşır —
	 * sunucunun denetim çifti bağlayabilmesi için ikisi de şart.
	 */
	const yaz = async (degisiklikler) => {
		if (islemVar) return;
		setIslemVar(true);
		try {
			const cevap = await tercihYaz({
				tmdbId: anahtar,
				enabled: degisiklikler.enabled,
				mode: degisiklikler.mode || tercih?.mode || "watched_source",
				watchedProvider: kaynakAdi || tercih?.watched_provider || null,
				diziUrl: diziUrl || tercih?.dizi_url || null,
			});
			if (!cevap.ok) {
				Alert.alert(
					"Bildirim ayarı alınamadı",
					cevap.mesaj || "Sunucuya ulaşılamadı.",
				);
				return;
			}
			setTercih(cevap.data);
		} finally {
			setIslemVar(false);
		}
	};

	if (!anahtar || !diziUrl) {
		// Dizi değil ya da tmdb eşleşmemiş — kart tamamen sessiz.
		return null;
	}

	const baskaKaynaktaAcik = Boolean(
		aktif &&
			tercih?.mode === "watched_source" &&
			tercih?.watched_provider &&
			kaynakAdi &&
			tercih.watched_provider !== kaynakAdi,
	);

	const cipsTaban = (secili) => [
		{
			borderRadius: sp(10),
			paddingHorizontal: sp(11),
			paddingVertical: sp(6),
			borderWidth: 1,
			borderColor: secili ? "#E50914" : colors.border,
			backgroundColor: secili ? "rgba(229, 9, 20, 0.13)" : "transparent",
		},
	];
	const cipsYazi = (secili) => ({
		color: secili ? "#E50914" : colors.textSecondary,
		fontSize: sp(12.5),
		fontWeight: "600",
	});

	const buKaynakSecili = tercih?.mode !== "all_sources";

	return (
		<View
			style={[
				styles.kagit,
				{
					backgroundColor: colors.cardBg,
					borderColor: colors.border,
					borderRadius: sp(14),
					padding: sp(13),
					marginBottom: sp(16),
					gap: sp(9),
				},
			]}>
			{/* Ana satır — tümü aç/kapa (TV odak hedefi de bu) */}
			<TVPressable
				onPress={() => yaz({ enabled: !aktif })}
				disabled={islemVar || yukleniyor}
				focusedStyle={styles.anaSatirOdak}
				style={styles.anaSatir}
				accessibilityLabel="Yeni bölüm bildirimi aç veya kapat">
				<View
					style={[
						styles.simgeKutu,
						{
							width: sp(38),
							height: sp(38),
							borderRadius: sp(12),
							backgroundColor: aktif
								? "rgba(229, 9, 20, 0.13)"
								: "rgba(142, 142, 147, 0.12)",
						},
					]}>
					<Ionicons
						name={aktif ? "notifications" : "notifications-outline"}
						size={sp(19)}
						color={aktif ? "#E50914" : "#8E8E93"}
					/>
				</View>
				<View style={styles.metinler}>
					<Text
						style={[
							styles.baslikText,
							{ color: colors.text, fontSize: sp(isTV ? 15.5 : 14) },
						]}>
						Yeni bölüm bildirimi
					</Text>
					<Text
						style={[
							styles.altText,
							{
								color: colors.textSecondary,
								fontSize: sp(isTV ? 13 : 11.5),
							},
						]}
						numberOfLines={2}>
						{yukleniyor || islemVar
							? "Tercih yükleniyor…"
							: durumCumlesi(tercih, kaynakAdi)}
					</Text>
				</View>
				{/* Anahtar SALT görsel; dokunuş TVPressable'da toplar */}
				<View pointerEvents="none">
					<Switch
						value={aktif}
						trackColor={{ true: "#E50914", false: "#3A3A3C" }}
						thumbColor="#ffffff"
						disabled={yukleniyor || islemVar}
					/>
				</View>
			</TVPressable>

			{/* Mod cipsleri — yalnızca açıkken */}
			{aktif && (
				<View style={[styles.cipsSatiri, { gap: sp(8) }]}>
					<TVPressable
						onPress={() =>
							!buKaynakSecili && yaz({ enabled: true, mode: "watched_source" })
						}
						disabled={islemVar}
						focusedStyle={{ opacity: 0.85 }}
						style={[styles.cip, cipsTaban(buKaynakSecili)]}>
						<Text style={cipsYazi(buKaynakSecili)}>Bu kaynak</Text>
					</TVPressable>
					<TVPressable
						onPress={() =>
							buKaynakSecili && yaz({ enabled: true, mode: "all_sources" })
						}
						disabled={islemVar}
						focusedStyle={{ opacity: 0.85 }}
						style={[styles.cip, cipsTaban(!buKaynakSecili)]}>
						<Text style={cipsYazi(!buKaynakSecili)}>
							Tüm kaynaklar
						</Text>
					</TVPressable>
				</View>
			)}

			{/* İzlediğin kaynak kartınkinden farklıysa: tek dokunuş günceller */}
			{baskaKaynaktaAcik && (
				<TVPressable
					onPress={() => yaz({ enabled: true })}
					disabled={islemVar}
					focusedStyle={{ opacity: 0.8 }}
					style={styles.ipucuBtn}>
					<Text
						style={{
							color: "#E50914",
							fontSize: sp(12.5),
							fontWeight: "600",
						}}>
						İzlediğin kaynağı {kaynakAdi} yap →
					</Text>
				</TVPressable>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	kagit: {
		borderWidth: 1,
	},
	anaSatir: {
		flexDirection: "row",
		alignItems: "center",
		gap: 11,
	},
	anaSatirOdak: {
		backgroundColor: "rgba(229, 9, 20, 0.08)",
		borderRadius: 10,
	},
	simgeKutu: {
		alignItems: "center",
		justifyContent: "center",
	},
	metinler: {
		flex: 1,
		gap: 2,
	},
	baslikText: {
		fontWeight: "700",
	},
	altText: {},
	cipsSatiri: {
		flexDirection: "row",
		alignItems: "center",
		paddingLeft: 3,
	},
	cip: {},
	ipucuBtn: {
		paddingLeft: 3,
		paddingVertical: 2,
	},
});
