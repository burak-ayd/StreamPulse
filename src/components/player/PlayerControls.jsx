import TVPressable from "@/components/common/TVPressable";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	PanResponder,
	Platform,
	StyleSheet,
	Text,
	View,
} from "react-native";

/** `mm:ss` / `hh:mm:ss` */
function fmt(seconds) {
	if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
	const total = Math.floor(seconds);
	const h = Math.floor(total / 3600);
	const m = Math.floor((total % 3600) / 60);
	const s = total % 60;
	const pad = (n) => (n < 10 ? `0${n}` : `${n}`);
	return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/**
 * Alt kontrol çubuğu: süre, ilerleme çubuğu.
 *
 * ⭐ Sorumluluk sınırı: bu bileşen YALNIZCA gösterir ve `onScrubMove` /
 * `onScrubEnd` ile haber verir. Seek'i kendisi UYGULAMAZ — çünkü seek
 * uygulaması `VideoPlayer`'ın `videoRef`'ine bağlıdır ve bu bileşen o
 * referansa sahip değildir. (Bileşen "hemen uygula" deseydi çubuk
 * sürüklenirken her karede seek'e giderdi; CloudStream'de de öyle bir
 * deneme var ve titreme yaratıyor.)
 *
 * ══ SORUN 6 — İLERLEME ÇUBUĞU TV'DE ODAKLANABİLİR ─════════════════
 *
 * Kullanıcı isteği:
 *   1. "HUD açıkken ileri geri sarma yapılmıyor" → `VideoPlayer`'ın
 *      `useTVRemote` elemanı artık `focusZone === "progress"` iken
 *      Sol/Sağ'ı sarmaya bağlıyor (bkz. `VideoPlayer` → `focusZoneRef`).
 *   2. "Progress bar seçilebilir olmalı, sarma buradan yapılmalı" →
 *      çubuk `TVPressable` ile sarılır; odaklanınca `onFocusZone("progress")`
 *      bildirilir, kumanda artık düğme gezdirmeye değil sarmaya gider.
 *   3. "HUD kapalıyken sarmada progress bar görünmeli" →
 *      `VideoPlayer`, HUD gizliyken Sol/Sağ'a `setShowControls(true)`
 *      çağırır; kontroller bu çubuğu da içerdiği için çubuk görünür olur.
 *
 * Dokunmatik cihazlarda `PanResponder` sürükleme AYNI kalır: TV'de
 * kırpma yok, dokunmatikte `TVPressable` şeffaftır.
 */
export default function PlayerControls({
	currentTime,
	duration,
	bufferRatio,
	isLive,
	showRemainingTime,
	onScrubStart,
	onScrubMove,
	onScrubEnd,
	onFocusZone,
}) {
	const trackWidthRef = useRef(1);
	const scrubRatioRef = useRef(null);
	const scrubStartRatioRef = useRef(0);
	// Sürükleme sırasında çubuğu/süreyi YEREL oran gösterir; gerçek seek
	// yalnızca parmak kalkınca yapılır (bkz. aşağıdaki not).
	const [scrubRatio, setScrubRatio] = useState(null);
	const [isProgressFocused, setIsProgressFocused] = useState(false);

	const clampRatio = useCallback((r) => Math.max(0, Math.min(1, r)), []);

	/*
	 * `PanResponder` `[]` ile memo'landığı için güncel değerler refle
	 * taşınır; aksi hâlde sürükleme ilk render'daki değerleri kullanır.
	 *
	 * ⚠️ Ref RENDER SIRASINDA güncellenmez, `useEffect` ile senkronlanır.
	 */
	const callbacksRef = useRef({ onScrubStart, onScrubMove, onScrubEnd });
	useEffect(() => {
		callbacksRef.current = { onScrubStart, onScrubMove, onScrubEnd };
	}, [onScrubStart, onScrubMove, onScrubEnd]);

	/*
	 * ⚠️ İSTENMEYEN ATLAMALARIN ÜÇ KÖK NEDENİ (kullanıcı şikâyeti):
	 *
	 *  1. `locationX` dokunulan ÇOCUĞA göre ölçülür. Baş parmağa
	 *     (14 px) basılınca x ≈ 7 geliyor ve oran ~0 olup video
	 *     BAŞA atlıyordu. Artık başlangıç oranı `locationX`'ten (çocuklar
	 *     `pointerEvents="none"` olduğu için hedef hep `trackWrap`), sonraki
	 *     hareketler `gesture.dx` ile BAŞLANGIÇTAN ölçülür.
	 *  2. `onPanResponderTerminate` `onScrubEnd(null)` çağırıyordu ve
	 *     `VideoPlayer` `null * duration = 0`'a SEEK ediyordu. Artık `null`
	 *     "iptal" demektir, seek yapılmaz.
	 *  3. Her harekette seek yapılıyordu; player eski konumu bildirince
	 *     çubuk geri zıplıyordu. Artık sürüklerken yalnızca önizleme
	 *     gösterilir, seek bırakınca TEK SEFER yapılır.
	 */
	const panResponder = useMemo(
		() =>
			// Ref'ler yalnızca geri çağırma fonksiyonlarının İÇİNDE okunur
			// (sürükleme sırasında), render'da değil.
			// eslint-disable-next-line react-hooks/refs
			PanResponder.create({
				onStartShouldSetPanResponder: () => !isLive,
				onMoveShouldSetPanResponder: () => !isLive,
				// Çubuk bir kez kazanılınca başka katman (jest yüzeyi,
				// Pressable) elinden alamasın; alırsa sürükleme iptal olur.
				onPanResponderTerminationRequest: () => false,
				onPanResponderGrant: (evt) => {
					if (isLive) return;
					const r = clampRatio(
						evt.nativeEvent.locationX / (trackWidthRef.current || 1),
					);
					scrubStartRatioRef.current = r;
					scrubRatioRef.current = r;
					setScrubRatio(r);
					callbacksRef.current.onScrubStart?.(r);
				},
				onPanResponderMove: (_evt, gesture) => {
					if (isLive) return;
					const r = clampRatio(
						scrubStartRatioRef.current +
							gesture.dx / (trackWidthRef.current || 1),
					);
					scrubRatioRef.current = r;
					setScrubRatio(r);
					callbacksRef.current.onScrubMove?.(r);
				},
				onPanResponderRelease: () => {
					const r = scrubRatioRef.current;
					scrubRatioRef.current = null;
					setScrubRatio(null);
					if (r !== null) callbacksRef.current.onScrubEnd?.(r);
				},
				onPanResponderTerminate: () => {
					scrubRatioRef.current = null;
					setScrubRatio(null);
					// `null` = iptal (seek YOK).
					callbacksRef.current.onScrubEnd?.(null);
				},
			}),
		[isLive, clampRatio],
	);

	const livePlayedRatio =
		duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;

	// Sürüklerken çubuk ve süre PARMAĞI izler (gerçek konumu değil).
	const isScrubbing = scrubRatio !== null;
	const playedRatio = isScrubbing ? scrubRatio : livePlayedRatio;

	// CloudStream'de ortada süre YOK; solda geçen, sağda toplam (veya
	// kalan) süre gösterilir.
	const displayTime = isScrubbing ? scrubRatio * duration : currentTime;

	/**
	 * Çubuk odaklandı → `VideoPlayer` "sol/sağ = sarmadır" moduna geçer.
	 *
	 * `setIsProgressFocused` yalnızca GÖRSEL geri bildirim için
	 * (baş parmak büyür); asıl karar `VideoPlayer`'ın `focusZoneRef`'inde.
	 */
	const handleProgressFocus = useCallback(() => {
		setIsProgressFocused(true);
		onFocusZone?.("progress");
	}, [setIsProgressFocused, onFocusZone]);

	const handleProgressBlur = useCallback(() => {
		setIsProgressFocused(false);
		onFocusZone?.(null);
	}, [setIsProgressFocused, onFocusZone]);

	/*
	 * Çubuğun kendisi. Sürükleme (`PanResponder`) YALNIZCA dokunmatik
	 * cihazlarda bağlanır: TV'de kumanda ile odaklanıp Sol/Sağ ile
	 * sarmak devrededir, sürükleme hem yok hem gereksizdir.
	 */
	const progressTrack = (
		<View
			style={styles.trackWrap}
			onLayout={(e) => {
				trackWidthRef.current = e.nativeEvent.layout.width || 1;
			}}
			{...(!isLive && !Platform.isTV ? panResponder.panHandlers : {})}>
			<View style={styles.track} pointerEvents="none">
				<View
					style={[styles.buffer, { width: `${bufferRatio * 100}%` }]}
				/>
				<View
					style={[styles.played, { width: `${playedRatio * 100}%` }]}
				/>
			</View>
			<View
				pointerEvents="none"
				style={[
					styles.thumb,
					{ left: `${playedRatio * 100}%` },
					(isProgressFocused || isScrubbing) && styles.thumbFocused,
				]}
			/>
		</View>
	);

	return (
		<View style={styles.bar} pointerEvents="box-none">
			{/* Zaman satırı */}
			<View style={styles.header} pointerEvents="box-none">
				{isLive ? (
					<View style={styles.liveBadge}>
						<View style={styles.liveDot} />
						<Text style={styles.liveText}>CANLI</Text>
					</View>
				) : (
					<Text style={styles.time}>{fmt(displayTime)}</Text>
				)}

				{!isLive ? (
					<Text style={styles.timeRight}>
						{showRemainingTime
							? `-${fmt(Math.max(0, duration - displayTime))}`
							: fmt(duration)}
					</Text>
				) : (
					<View />
				)}
			</View>

			{/*
			 * İlerleme çubuğu.
			 *
			 * Canlı yayında çubuk çizilmez (seek edilebilir aralık yoktur),
			 * dolayısıyla odaklanabilir de DEĞİLDİR — kumanda canlıda
			 * sarmaya çalışmasın.
			 */}
			{!isLive ? (
				<TVPressable
					style={styles.trackPressable}
					focusedStyle={styles.trackPressableFocused}
					cancelable={false}
					onFocus={handleProgressFocus}
					onBlur={handleProgressBlur}
					accessibilityRole="adjustable"
					accessibilityLabel={`İlerleme çubuğu, ${fmt(currentTime)} / ${fmt(duration)}`}
					accessibilityValue={{
						min: 0,
						max: duration,
						now: currentTime,
					}}>
					{progressTrack}
				</TVPressable>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	bar: {
		width: "100%",
	},
	header: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginBottom: 4,
		paddingHorizontal: 4,
	},
	time: {
		color: "#FFFFFF",
		fontSize: 15,
		fontWeight: "500",
		fontVariant: ["tabular-nums"],
	},
	timeRight: {
		color: "#FFFFFF",
		fontSize: 15,
		fontWeight: "500",
		fontVariant: ["tabular-nums"],
	},
	liveBadge: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		backgroundColor: "rgba(255, 59, 48, 0.2)",
		paddingHorizontal: 10,
		paddingVertical: 4,
		borderRadius: 8,
	},
	liveDot: {
		width: 7,
		height: 7,
		borderRadius: 4,
		backgroundColor: "#FF3B30",
	},
	liveText: {
		color: "#FF6B60",
		fontSize: 11,
		fontWeight: "800",
		letterSpacing: 0.6,
	},
	trackPressable: {
		borderRadius: 12,
		paddingVertical: 8,
		paddingHorizontal: 4,
	},
	trackPressableFocused: {
		backgroundColor: "rgba(255, 59, 48, 0.25)",
	},
	trackWrap: {
		height: 28,
		justifyContent: "center",
	},
	track: {
		height: 5,
		backgroundColor: "rgba(255, 255, 255, 0.25)",
		borderRadius: 2.5,
		overflow: "hidden",
		flexDirection: "row",
	},
	buffer: {
		height: "100%",
		backgroundColor: "rgba(255, 255, 255, 0.45)",
		position: "absolute",
		left: 0,
		top: 0,
	},
	played: {
		height: "100%",
		backgroundColor: "#FF3B30",
		position: "absolute",
		left: 0,
		top: 0,
	},
	thumb: {
		position: "absolute",
		width: 14,
		height: 14,
		borderRadius: 7,
		backgroundColor: "#FFFFFF",
		marginLeft: -7,
		shadowColor: "#000000",
		shadowOffset: { width: 0, height: 1 },
		shadowOpacity: 0.5,
		shadowRadius: 2,
		elevation: 3,
	},
	/*
	 * Odaklı baş parmak büyür — "hangi dakikadayım" sorusunun cevabı
	 * odak halkasından okunur. Ekran kenarına yapışmaz çünkü çubuk
	 * `paddingVertical` ile odak alanı büyütülmüştür.
	 */
	thumbFocused: {
		width: 20,
		height: 20,
		marginLeft: -10,
		borderWidth: 2,
		borderColor: "#FF3B30",
		shadowOpacity: 0.8,
		shadowRadius: 4,
		elevation: 6,
	},
});