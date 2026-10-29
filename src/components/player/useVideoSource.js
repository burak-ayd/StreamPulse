import { useCallback, useMemo, useState } from "react";
import { DEFAULT_SUBTITLE_UA } from "./useSubtitles";

/**
 * ── `useVideoSource` ──────────────────────────────────────────
 *
 * Kaynak seçimi, HLS/MP4 tür algılama ve biçim hatası kurtarma.
 *
 * ⚠️ Bu mantık neden ayrı: `videoSource` `useMemo` içinde 60 satırlık bir
 * EŞLEME tablosudur (`isExplicitProgressive` / `isExplicitHls`). Render
 * sırasında hesaplanması doğru, ama dosyada kalması `VideoPlayer`'ın en
 * yoğun bloğuydu ve okunabilirliği bozuyordu.
 *
 * ⚠️ TÜR ALGILAMA (`type`) kritik: HLS sanılan MP4 → ExoPlayer 23002
 * ("Input does not start with the #EXTM3U header"), MP4 sanılan HLS → 23003
 * ("UnrecognizedInputFormatException"). `overrideType` bu iki durum arasında
 * tek bir geçiş sağlar; `formatRetryRef` aynı hatada iki kez denemeyi engeller.
 */
export default function useVideoSource({
	sources,
	activeSourceIndex,
	currentSourceData,
	onFormatOverride,
	// Sabit kalite seçimi: seçilen varyant için yazılan yerel master URI'si.
	urlOverride = null,
}) {
	const [overrideType, setOverrideType] = useState(null);
	const [formatRetryRef, setFormatRetryRef] = useState(false);

	const videoSource = useMemo(() => {
		if (!currentSourceData?.result?.url) return null;

		// Kalite seçimi aktifse yerel master oynatılır (tek varyant → sabit kalite).
		const streamUrl = urlOverride || currentSourceData.result.url;
		const headers = { ...(currentSourceData.result.headers || {}) };

		if (currentSourceData.result.referer && !headers.Referer) {
			headers.Referer = currentSourceData.result.referer;
		}
		// Altyazı veya video CDN'leri User-Agent olmadan 403 dönebilir.
		if (!headers["User-Agent"]) {
			headers["User-Agent"] = DEFAULT_SUBTITLE_UA;
		}
		// react-native-video yalnızca string Cookie kabul eder.
		if (headers.Cookie && typeof headers.Cookie === "object") {
			headers.Cookie = Object.entries(headers.Cookie)
				.map(([k, v]) => `${k}=${v}`)
				.join("; ");
		}

		// `overrideType` öncegelir: hata kurtarma bu değeri yazar.
		if (overrideType !== null) return { uri: streamUrl, headers, type: overrideType };
		const isExplicitProgressive =
			/\.(mp4|mkv|webm|avi|flv|mov)(\?.*)?$/i.test(streamUrl) ||
			streamUrl.includes("googlevideo.com") ||
			streamUrl.includes("videoplayback") ||
			/[?&]mime=video%2f(mp4|webm)/i.test(streamUrl) ||
			/[?&]mime=video\/(mp4|webm)/i.test(streamUrl) ||
			currentSourceData?.result?.type === "mp4" ||
			currentSourceData?.result?.is_hls === false ||
			currentSourceData?.extractor?.toLowerCase()?.includes("peacemaker") ||
			currentSourceData?.result?.name?.toLowerCase()?.includes("peacemaker");

		const isExplicitHls =
			streamUrl.includes(".m3u8") ||
			streamUrl.includes("/q/") ||
			streamUrl.includes("molystream") ||
			streamUrl.includes("/hls/") ||
			streamUrl.includes("/hls2/") ||
			streamUrl.includes(".urlset") ||
			streamUrl.includes("master.txt") ||
			streamUrl.includes("sublist") ||
			streamUrl.includes(".txt") ||
			streamUrl.includes("cdnimage") ||
			streamUrl.includes("/m2/") ||
			streamUrl.includes("/mm/") ||
			streamUrl.includes("/ms/") ||
			streamUrl.includes("/mo/") ||
			currentSourceData?.extractor?.toLowerCase()?.includes("close") ||
			currentSourceData?.result?.name?.toLowerCase()?.includes("close") ||
			currentSourceData?.extractor?.toLowerCase()?.includes("rapidvid") ||
			currentSourceData?.result?.name?.toLowerCase()?.includes("rapidvid") ||
			currentSourceData?.extractor?.toLowerCase()?.includes("rapidrame") ||
			currentSourceData?.result?.name?.toLowerCase()?.includes("rapidrame") ||
			currentSourceData?.result?.is_hls === true ||
			currentSourceData?.result?.type === "m3u8" ||
			currentSourceData?.result?.type === "hls";

		let type = undefined;
		if (isExplicitHls) type = "m3u8";
		else if (isExplicitProgressive) type = "mp4";

		// Harici altyazılar buraya verilmiyor — bkz. `useSubtitles` başlığı.
		return { uri: streamUrl, headers, type };
	}, [currentSourceData, overrideType, urlOverride]);

	/** Biçim hatası sonrası ters türle tekrar dene. */
	const toggleOverrideType = useCallback(() => {
		if (formatRetryRef) return false;
		setFormatRetryRef(true);
		const next = videoSource?.type === "m3u8" ? "mp4" : "m3u8";
		setOverrideType(next);
		onFormatOverride?.();
		return true;
	}, [formatRetryRef, videoSource?.type, onFormatOverride]);

	const resetOverride = () => {
		setFormatRetryRef(false);
		setOverrideType(null);
	};

	const key = videoSource
		? `${videoSource.uri}_${videoSource.type || "auto"}_${overrideType || "none"}`
		: "none";

	return {
		videoSource,
		overrideType,
		formatRetryRef,
		toggleOverrideType,
		resetOverride,
		videoKey: key,
		sourceCount: sources?.length || 0,
		activeSourceIndex,
	};
}