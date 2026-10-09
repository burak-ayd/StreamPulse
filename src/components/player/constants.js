/**
 * Player jest sabitleri — CloudStream (Media3) referans değerlerinden alınmıştır.
 *
 * ⚠️ BU DOSYA TEK KAYNAKTIR: hem `usePlayerGestures` hem de ayarlar ekranı
 * buradan okur. Sayılar bir yerde kopyalanıp diğerinde değişirse iki yol
 * ayrışır ve "eşik neden farklı davranıyor" hatası başlar.
 */

/** Çift dokunma penceresi (ms). CloudStream: DOUBLE_TAP_MINIMUM_TIME_BETWEEN = 200 */
export const DOUBLE_TAP_WINDOW_MS = 280;

/** Bir dokunuşun "basılı sayılmaması" için üst sınır (ms). CloudStream: 200 */
export const MAX_TAP_HOLD_MS = 200;

/**
 * Çift dokunmada ortada play/pause bölgesinin genişliği (ekran oranı).
 * CloudStream: DOUBLE_TAP_PAUSE_PERCENTAGE = 0.15 (±%15)
 */
export const DOUBLE_TAP_PAUSE_ZONE = 0.15;

/** Yatay sürükleme ile seek'i tetiklemek için gereken minimum hareket (oran). */
export const MIN_SWIPE_RATIO = 0.02;

/** Dikey sürükleme (parlaklık/ses) için gereken minimum hareket (oran). */
export const MIN_VERTICAL_SWIPE_RATIO = 0.02;

/**
 * Sürükleme duyarlılığı çarpanı.
 * CloudStream'de `diffX * 2.0 / width` → ekranı bir kez tam sürüklemek
 * toplam süreyi 2 katına çıkar. Aynı "aşırı hassas" hissi koruyoruz.
 */
export const SWIPE_MULTIPLIER = 2.0;

/**
 * Seek'i uygulamak için gereken minimum fark (saniye).
 * CloudStream: MINIMUM_SEEK_TIME = 7000ms → 7 sn
 */
export const MIN_SEEK_DELTA_SEC = 7;

/**
 * Yatay sürükleme eşlemesi KUADRATİKTİR (CloudStream: diffX * diffX).
 *
 * ⚠️ Doğrusal yapılırsa başlangıçta çok hızlı, kenarlarda çok yavaş
 * hissedilir ve YouTube/Netflix "hissinden" uzaklaşır. Katsayı 0.85, tam
 * ekran sürüklemenin sürenin ~%85'ini kat etmesini sağlar; karesi alınarak
 * başlangıç yavaşlatılır, kenar hızlandırılır.
 */
export const SEEK_CURVE = 0.85;

/** Zoom sınırları. CloudStream: MINIMUM_ZOOM 0.95, MAXIMUM_ZOOM 4.0 */
export const MIN_ZOOM = 0.95;
export const MAX_ZOOM = 4.0;

/**
 * %100'e otomatik geri dönüş eşiği (zoom).
 * CloudStream: ZOOM_SNAP_SENSITIVITY = 0.07
 */
export const ZOOM_SNAP = 0.07;

/** Uzun basış hızlandırma tetikleme süresi (ms). CloudStream: 500 */
export const LONG_PRESS_DELAY_MS = 500;

/** Jest geri bildirimi görünürlük süresi (ms). CloudStream gösterge ~700-1500 */
export const GESTURE_FEEDBACK_MS = 700;

/** Parlaklık/ses HUD'unun kaybolma gecikmesi (ms). CloudStream: 1500 */
export const HUD_HIDE_DELAY_MS = 1200;

/**
 * Parlaklık tabanı. CloudStream bunu 0.004 ile sınırlar; 0 bazı cihazlarda
 * sistem geçersiz kılma (override) modunu tetikler ve ince ayar bozulur.
 */
export const MIN_BRIGHTNESS = 0.004;

/** Oynatma hızı sınırları (CloudStream speed_dialog: 0.1 – 2.0) */
export const MIN_PLAYBACK_RATE = 0.25;
export const MAX_PLAYBACK_RATE = 2.0;

/** Kullanıcıya sunulan hazır hız listesi */
export const PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

/** Resize modları — react-native-video v6 `resizeMode` değerleriyle birebir */
export const RESIZE_MODES = ["contain", "cover", "stretch"];

/** Kullanıcıya gösterilen resize modu etiketleri */
export const RESIZE_MODE_LABELS = {
	contain: "Sığdır",
	cover: "Doldur",
	stretch: "Ger",
};

/** Kullanıcıya gösterilen resize modu ikonları */
export const RESIZE_MODE_ICONS = {
	contain: "expand-outline",
	cover: "contract-outline",
	stretch: "resize-outline",
};