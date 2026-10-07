import React, { forwardRef, useEffect, useRef, useState } from "react";
import { DeviceEventEmitter, Platform, Pressable, StyleSheet } from "react-native";

/**
 * Android TV'de DPAD_CENTER (OK) tuşu, dokunmatik dokunmanın tersine
 * Pressability'nin uzun basma zamanlayıcısını hiç başlatmaz — Pressability
 * `onLongPress` touch sinyallerine bağlı. Bu projedeki RN TV build'inde
 * `enableKeyEvents()` varsayilan olarak false: View'ın `onKeyDown`/`onKeyUp`
 * JS prop'ları ATEŞLENMEZ. Kumandadan gelen tek güvenilir kanal
 * `DeviceEventEmitter` üzerindeki `onHWKeyEvent` device olayıdır
 * (DPAD_CENTER → eventType "select", eventKeyAction 0 = basıldığında,
 * 1 = bırakıldığında). Bu yüzden OK uzun basması TV'de bu kanal üzerinden
 * elle ölçülür. (Mevcut `hooks/useTVRemote.js` aynı mekanizmayı kullanıyor.)
 */

/** Basılı tutmanın uzun basma sayılması için süre (ms). */
const LONG_PRESS_DELAY_MS = 500;
/** Uzun basma açıldıktan sonra gelen click'i yutma penceresi (ms). */
const SUPPRESS_WINDOW_MS = 900;
/** KeyUp geldiğinde pencerenin ek olarak uzatılma payı (ms). */
const SUPPRESS_AFTER_KEYUP_MS = 200;

/**
 * Tüm TVPressable örneklerinde ortak. Uzun basma açıldığında, o tuşu
 * bırakmanın ürettiği `onClick`'i mümkünse yutmak için.
 * (Modal anında odak taşıyabilir; paylaşılan mühür bu güvenliği getiriyor.)
 */
let suppressPressUntil = 0;

/**
 * Bir TVPressable'ın dışında (örneğin düz `Pressable` backdrop) kalan
 * onPress'lerin de, uzun basış sonrası gelen tuşu-bırakış click'ini yutması
 * için ortak kontrol kapısı.
 */
export function isTVPressSuppressed() {
	return Platform.isTV && Date.now() < suppressPressUntil;
}

/**
 * TVPressable
 * Hem dokunmatik mobil cihazlarda hem de Android TV'de kumanda (D-Pad) ile
 * uyumlu çalışan evrensel buton bileşeni.
 *
 * ⚠️ YALNIZCA `default` olarak dışa açılır.
 *
 * Bu bileşen `export const TVPressable` VE `export default TVPressable`
 * olarak İKİ KEZ dışa açıldığı için `import/no-named-as-default` kuralı,
 * dosyayı default olarak import eden 38 dosyanın HEPSİNDE aynı uyarıyı
 * üretiyordu. Projede tek bir import biçimi kullanıldığı için isimli
 * export kaldırıldı: `import TVPressable from "..."` artık uyarısız.
 * (Dışa açılan tek isimli export `isTVPressSuppressed`, o korunuyor.)
 */
const TVPressable = forwardRef(function TVPressable(
	{
		style,
		focusedStyle,
		pressedStyle,
		children,
		autoFocus = false,
		disabled = false,
		onFocus,
		onBlur,
		onPress,
		onLongPress,
		nextFocusUp,
		nextFocusDown,
		nextFocusLeft,
		nextFocusRight,
		...props
	},
	ref,
) {
	const [isFocused, setIsFocused] = useState(false);
	const isTV = Platform.isTV;

	const longPressTimerRef = useRef(null);
	const keyHeldRef = useRef(false);
	const longPressFiredRef = useRef(false);
	const isFocusedRef = useRef(false);
	const onLongPressRef = useRef(onLongPress);
	onLongPressRef.current = onLongPress;

	const clearLongPressTimer = () => {
		if (longPressTimerRef.current != null) {
			clearTimeout(longPressTimerRef.current);
			longPressTimerRef.current = null;
		}
	};

	// OK tuşu basma/bırakma olaylarını "select" (eventKeyAction 0/1) olarak
	// dinler. enableKeyEvents() false olduğu için View onKeyDown/onKeyUp yerine
	// bu device olayı kanalı kullanılır.
	useEffect(() => {
		if (!isTV) return;
		const subscription = DeviceEventEmitter.addListener(
			"onHWKeyEvent",
			(evt) => {
				if (!evt || evt.eventType !== "select") return;

				if (evt.eventKeyAction === 0) {
					// Yalnızca odaktaki buton cevap versin; basılı tutmada
					// gelen auto-repeat ACTION_DOWN'larını yoksay.
					if (!isFocusedRef.current || keyHeldRef.current) return;
					keyHeldRef.current = true;
					longPressFiredRef.current = false;
					clearLongPressTimer();
					longPressTimerRef.current = setTimeout(() => {
						longPressTimerRef.current = null;
						longPressFiredRef.current = true;
						suppressPressUntil = Date.now() + SUPPRESS_WINDOW_MS;
						onLongPressRef.current?.(evt);
					}, LONG_PRESS_DELAY_MS);
				} else if (evt.eventKeyAction === 1) {
					keyHeldRef.current = false;
					clearLongPressTimer();
					if (longPressFiredRef.current) {
						longPressFiredRef.current = false;
						suppressPressUntil = Math.max(
							suppressPressUntil,
							Date.now() + SUPPRESS_AFTER_KEYUP_MS,
						);
					}
				}
			},
		);
		return () => subscription.remove();
	}, [isTV]);

	const handlePress = (e) => {
		if (Date.now() < suppressPressUntil) {
			return;
		}
		onPress?.(e);
	};

	return (
		<Pressable
			ref={ref}
			focusable={!disabled}
			hasTVPreferredFocus={isTV && autoFocus}
			disabled={disabled}
			nextFocusUp={nextFocusUp}
			nextFocusDown={nextFocusDown}
			nextFocusLeft={nextFocusLeft}
			nextFocusRight={nextFocusRight}
			onFocus={(e) => {
				isFocusedRef.current = true;
				setIsFocused(true);
				onFocus?.(e);
			}}
			onBlur={(e) => {
				isFocusedRef.current = false;
				keyHeldRef.current = false;
				clearLongPressTimer();
				setIsFocused(false);
				onBlur?.(e);
			}}
			onPress={handlePress}
			onLongPress={onLongPress}
			style={({ pressed }) => {
				const resolvedStyle =
					typeof style === "function"
						? style({ pressed, focused: isFocused })
						: style;

				return [
					resolvedStyle,
					isTV && isFocused && (focusedStyle || styles.defaultFocused),
					pressed && (pressedStyle || styles.defaultPressed),
				];
			}}
			{...props}>
			{({ pressed }) =>
				typeof children === "function"
					? children({ focused: isFocused, pressed })
					: children
			}
		</Pressable>
	);
});

export default TVPressable;

const styles = StyleSheet.create({
	defaultFocused: {
		borderColor: "#E50914",
		borderWidth: 2,
		transform: [{ scale: 1.05 }],
	},
	defaultPressed: {
		opacity: 0.85,
		transform: [{ scale: 0.98 }],
	},
});
