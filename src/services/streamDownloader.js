/*
 * streamDownloader — native `StreamPulseStreamDownloader` modülünün JS sarmalayıcısı.
 * Modül yoksa (eski APK) `isAvailable()` false döner; diğer fonksiyonlar
 * STREAM_DOWNLOADER_UNAVAILABLE promise'i reddeder.
 */
import { requireOptionalNativeModule } from "expo-modules-core";

const native = requireOptionalNativeModule("StreamPulseStreamDownloader");

export const UNAVAILABLE_ERROR = "STREAM_DOWNLOADER_UNAVAILABLE";

export function isAvailable() {
	return Boolean(native);
}

function bridge() {
	if (!native) throw new Error(UNAVAILABLE_ERROR);
	return native;
}

/** Kuyruğa ekler; id döner. `spec` alanları ham JS nesnesidir. */
export function enqueue(spec) {
	return bridge().enqueue(spec);
}

export function pause(id) {
	return bridge().pause(id);
}

export function resume(id) {
	return bridge().resume(id);
}

export function cancel(id) {
	return bridge().cancel(id);
}

export function setMaxConcurrent(n) {
	return bridge().setMaxConcurrent(n);
}

export function exportDownload(id) {
	return bridge().export(id);
}

export function remove(id) {
	return bridge().remove(id);
}

/** {items: [...]} yerine düz dizi döner. */
export async function getState() {
	return bridge().getState();
}

/**
 * Durum değişikliklerini dinler (≈1 Hz ilerleme dahil).
 * @returns {() => void} abonelikten çıkma fonksiyonu
 */
export function onStateChanged(callback) {
	if (!native) return () => {};
	const sub = native.addListener("onStateChanged", (event) => {
		try {
			callback(Array.isArray(event?.items) ? event.items : []);
		} catch (e) {
			console.warn("onStateChanged dinleyici hatası:", e);
		}
	});
	return () => sub.remove();
}
