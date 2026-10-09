import { Image } from "expo-image";
import React, { useCallback, useEffect, useRef } from "react";
import { reportImageLoad, smartImageUri } from "@/utils/imageQuality";

/**
 * ── SmartImage ────────────────────────────────────────────────
 *
 * `expo-image`'ın sarmalayıcısı. İki iş yapar:
 *
 *  1. **URL'i kaliteye göre yeniden yazar.** TMDB boyut kodu URL'e
 *     gömülü olduğu için düşük çözünürlük isteği YALNIZCA adresi
 *     değiştirerek mümkündür.
 *  2. **Gerçek yükleme süresini ölçer** ve `reportImageLoad` ile
 *     uyarlanabilir kalite motorunu besler.
 *
 * ⚠️ NEDEN AYRI BİLEŞEN:
 * `Image` 18 dosyada doğrudan kullanılıyordu. Her birine tek tek
 * `onLoad`/`onError` eklemek yerine tek bir sarmalayıcı yeterlidir:
 * bu bileşen `Image` ile aynı props'u kabul eder.
 *
 * ⚠️ `onLoadStart` ZAMANI:
 * `expo-image`'ın `onLoad` verisindeki alanlar zaman damgası DEĞİLDİR,
 * bu yüzden süre `Date.now()` farkıyla burada ölçülür. Süre isteğin
 * ATILDIĞI andan `onLoad`/`onError` çağrıldığı ana kadar geçen
 * süredir; ağ gecikmesini içerir, işlemci süresini içermez.
 *
 * React Compiler'ın saflık kuralı (`react-hooks/purity`) render'da
 * `Date.now()` çağrılmasını reddeder; ölçüm bu yüzden OLAY geri
 * çağırmalarının içindedir, render'da değil.
 */

/** Bu kadar süre geçerse yükleme başarısız sayılır. */
const TIMEOUT_MS = 12000;

export default function SmartImage({
	source,
	onLoadStart,
	onLoad,
	onError,
	timeout = TIMEOUT_MS,
	...rest
}) {
	const startedAtRef = useRef(0);
	const timerRef = useRef(null);

	// `onError` tetikleyip zamanlayıcıyı temizleyen tek giriş noktası.
	const finish = useCallback((event, ok) => {
		if (timerRef.current) {
			clearTimeout(timerRef.current);
			timerRef.current = null;
		}
		const ms = startedAtRef.current ? Date.now() - startedAtRef.current : 0;
		reportImageLoad(ms, ok);
		if (ok) onLoad?.(event);
		else onError?.(event);
	}, [onLoad, onError]);

	const handleLoadStart = useCallback(
		(event) => {
			startedAtRef.current = Date.now();
			/*
			 * Zaman aşımı: `onLoad`/`onError` hiç gelmezse (bağlantı
			 * kopuk, sunucu cevap vermiyor) kalite motoru hiç ölçüm
			 * alamaz ve modu değiştiremez. Sessiz kalan bu durum
			 * "resimler hiç yüklenmiyor" şikâyetinin kaynağıdır.
			 */
			if (timerRef.current) clearTimeout(timerRef.current);
			timerRef.current = setTimeout(() => finish(undefined, false), timeout);
			onLoadStart?.(event);
		},
		[finish, onLoadStart, timeout],
	);

	// Bileşen unmount olurken zamanlayıcı kalmasın.
	useEffect(() => {
		return () => {
			if (timerRef.current) clearTimeout(timerRef.current);
		};
	}, []);

	const uri = typeof source === "object" ? source?.uri : undefined;

	/*
	 * Kalite düştüğünde `smartImageUri` FARKLI bir URL döner; `expo-image`
	 * `source` değişince yeni istek atar. Yani ağ yavaşladığında kendiliğinden
	 * küçük görsele, düzeldiğinde yüksek çözünürlüğe geçer — ek kod
	 * gerekmez. React bileşeni `key` ile yeniden kurulur; CDN cache'i
	 * aynı URL'de kalıcı olsa bile yeni istek atılır.
	 */
	const finalSource =
		uri && typeof source === "object"
			? { ...source, uri: smartImageUri(uri) }
			: source;

	return (
		<Image
			{...rest}
			key={typeof finalSource === "object" ? finalSource?.uri : undefined}
			source={finalSource}
			onLoadStart={handleLoadStart}
			onLoad={(e) => finish(e, true)}
			onError={(e) => finish(e, false)}
		/>
	);
}