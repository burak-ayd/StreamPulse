/**
 * TV ölçümleri — TEK KAYNAK
 * =========================
 *
 * TV'de (10 feet UI) tasarımın iki kuralı var ve ikisi de telefonla
 * çelişir:
 *
 *   1. **Ölçek (mütevazı).** Kumandayla 3 metre öteden okunacak her şey
 *      telefon ölçüsünden biraz büyük olmalı — AMA "büyük" burada tuhaftır.
 *      Uygulamanın zaten iyi görünen ekranları (arama, kitaplık, ayarlar)
 *      15–18dp satır yüksekliği ve telefon puntolarıyla çalışıyor; 1080p
 *      TV'de 1.5× çarpanı bunların 1.5 katına (paragraf puntosu 24–36dp)
 *      çıkarıyor, ekranı bir "dev ekran" gibi gösteriyor. Ölçek bu yüzden
 *      1080p'de yalnızca **1.2**: telefon ölçüsünün hafif üstünde, ama
 *      uygulamanın geri kalanıyla aynı yoğunlukta.
 *
 *   2. **Satır uzunluğu.** 1920px genişliğinde bir paragraf 200 karakterlik
 *      tek satıra yayılır; gözü sürekli satır sonuna kaydırmak zorunda kalır.
 *      Bu yüzden TV'de metin blokları `textMaxWidth` ile sınırlandırılır.
 *
 *   3. **Yayılma.** Kısıt bir "ortala ve kenarlara boşluk bırak" işlemi
 *      DEĞİL. Ekranın %90'ı kullanılıyor; kalan pay eşit değil, kenarlar
 *      nefes payı. Daha dar bir sütun (%78) TV'de masaüstü web sayfası
 *      gibi "ortada kalmış" görünüyordu.
 *
 * Ana sayfa (`HeroBanner`) ve kategori sayfası (`category.jsx`) bu kuralları
 * KENDİ ölçümleriyle zaten uyguluyordu; geri kalan ekranlar uygulamıyordu.
 * Buradaki `useTvMetrics` onların kazandığı düzeni tüm ekranlara yayılan
 * tek yardımcıdır.
 *
 * `scale` sabit bir sihirli sayı DEĞİL, ekranın kısa kenarından türetilir:
 * 1080p TV (540dp) → 1.2, 720p TV (360dp) → 1.05 (alt sınır).
 */

import { Platform, useWindowDimensions } from "react-native";

/** Kısa kenar referansı: 450dp → 1.2 ham ölçek (1080p TV). */
const SHORT_SIDE_REFERENCE = 450;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

/**
 * TV ölçek çarpanı. Non-TV'de her zaman 1.
 * @returns {number} 1 (telefon/tablet) … ~1.2 (1080p TV) … 1.45 (üst sınır)
 */
export function computeTvScale(width, height) {
	if (!Platform.isTV) return 1;
	const shortSide = Math.min(width, height);
	const raw = shortSide / SHORT_SIDE_REFERENCE;
	return clamp(Math.round(raw * 100) / 100, 1.05, 1.45);
}

/**
 * Ekran ölçüleri kancası.
 *
 * @returns {{
 *   isTV: boolean,
 *   scale: number,
 *   width: number,
 *   height: number,
 *   sp: (n: number) => number,
 *   gutter: number,
 *   contentMaxWidth: number | undefined,
 *   textMaxWidth: number | undefined,
 *   focusScale: number,
 * }}
 */
export function useTvMetrics() {
	const { width, height } = useWindowDimensions();
	const isTV = Platform.isTV;
	const scale = computeTvScale(width, height);

	/** Ölçeklenmiş tam sayı (punto, ikon, yükseklik, genişlik…). */
	const sp = (n) => (typeof n === "number" ? Math.round(n * scale) : n);

	/** Ekran kenar payı. Telefonda 0 — mevcut yerleşim bozulmaz. */
	const gutter = isTV ? sp(14) : 0;

	/**
	 * İçerik sütununun azami genişliği — ekranın %90'ı.
	 *
	 * ⚠️ Burada `sp()` KULLANILMAZ; sınır ekranın kendi oranıdır. Ölçekle
	 * çarpılmış bir tavan ekranı aşıp kısıtlamayı işlevsiz bırakıyordu.
	 * Yüzde oranı her çözünürlükte aynı görsel payı verir.
	 */
	const contentMaxWidth = isTV
		? Math.min(width - 2 * gutter, width * 0.9)
		: undefined;

	/**
	 * Metin bloğunun azami genişliği — ekranın %62'si.
	 *
	 * Bir paragrafın satır uzunluğu ~60-70 karakterde rahat okunur.
	 * 1080p'de ≈595dp, sp(16)=19dp puntoda rahat okunur.
	 */
	const textMaxWidth = isTV
		? Math.min(contentMaxWidth ?? width, width * 0.62)
		: undefined;

	/** Odak ölçeği — TV'de biraz daha belirgin olsun. */
	const focusScale = isTV ? 1.08 : 1;

	return {
		isTV,
		scale,
		width,
		height,
		sp,
		gutter,
		contentMaxWidth,
		textMaxWidth,
		focusScale,
	};
}

export default useTvMetrics;
