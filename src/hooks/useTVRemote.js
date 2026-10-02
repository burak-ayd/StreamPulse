import { useEffect, useRef } from "react";
import { DeviceEventEmitter, Platform } from "react-native";

/**
 * useTVRemote
 * Android TV kumandasından gelen donanım tuş olaylarını (D-Pad, OK, Play/Pause, Rewind/FastForward)
 * güvenli bir şekilde dinleyen ve tek seferlik (ACTION_DOWN) tetikleyen kanca.
 *
 * @param {(eventType: string, event: object) => void} handler - Tuş olayı gerçekleştiğinde çalışacak fonksiyon
 * @param {boolean} enabled - Dinleyicinin aktif olup olmadığı (varsayılan: true)
 */
export function useTVRemote(handler, enabled = true) {
	const handlerRef = useRef(handler);
	handlerRef.current = handler;

	useEffect(() => {
		// Yalnızca TV ortamında ve aktifken çalış
		if (!Platform.isTV || !enabled) return;

		const subscription = DeviceEventEmitter.addListener(
			"onHWKeyEvent",
			(evt) => {
				// Android KeyEvent:
				// 0 = ACTION_DOWN
				// 1 = ACTION_UP
				// Çift tetiklenmeyi önlemek için yalnızca ACTION_DOWN (0) anında çağırıyoruz.
				if (evt && evt.eventType && evt.eventKeyAction === 0) {
					handlerRef.current?.(evt.eventType, evt);
				}
			},
		);

		return () => {
			subscription.remove();
		};
	}, [enabled]);
}

export default useTVRemote;
