/**
 * Ekran hatırlama defteri — kaydırma konumu + filtre/sekme
 * ==========================================================
 *
 * SORUN 4 (GENEL): "Bir sayfadan geri tuşuna basıp geri geldiğimde
 * gittiğim konum ya da seçili filtre hatırlanmıyor, sayfanın en başına
 * atıyor."
 *
 * ⚠️ KÖK NEDEN `Slot` idi ve o yapısal olarak çözüldü
 * (`_layout.jsx` → `<Stack/>`): yığın ekranları mount durumunda tutar,
 * dolayısıyla geri dönüşte React ağacı yeniden kurulmaz.
 *
 * BU DOSYA o yapısal düzeltmenin YANINA konan güvenlik ağıdır. Stack
 * her durumda mount'u korur ama:
 *   • `router.replace()` çağrıları yığını temizleyebilir,
 *   • Android düşük bellekte ekranı serbest bırakabilir,
 *   • uygulama yeniden açıldığında hiçbir şey mount durumunda değildir.
 *
 * Bu durumlarda konum yine sıfırlanmasın diye kaydırma ofseti ve
 * filtre/sekme değerleri burada saklanır.
 *
 * ⚠️ DEVRİM İÇİ BELLEK (AsyncStorage DEĞİL). Bilerek: "uygulamayı
 * kapat, tekrar aç, aynı yerde başla" istenmiyor; sadece gezinme
 * sırasında koruma isteniyor. Kalıcı depolama her açılışta bayat
 * konumla açılma gibi ayrı bir sorun doğururdu.
 */

/** Ekran başına saklanan durum. */
const store = new Map();

/**
 * Bir ekranın hatırlanacak durumunu okur.
 * @param {string} key  ekran kimliği (ör. "home", "category:hdce")
 * @param {object} fallback  değer yoksa dönecek varsayılan
 */
export function recallScreenState(key, fallback = null) {
	return store.has(key) ? store.get(key) : fallback;
}

/**
 * Bir ekranın durumunu yazar.
 * @param {string} key
 * @param {object} patch  mevcut durumla birleştirilir
 */
export function rememberScreenState(key, patch) {
	const next = { ...(store.get(key) || {}), ...patch };
	store.set(key, next);
	return next;
}

/** Bir ekranın kaydırma ofsetini okur (varsayılan 0). */
export function recallScrollOffset(key) {
	return store.get(key)?.scrollOffset ?? 0;
}

/** Bir ekranın kaydırma ofsetini yazar. */
export function rememberScrollOffset(key, offset) {
	if (typeof offset !== "number" || !Number.isFinite(offset)) return;
	rememberScreenState(key, { scrollOffset: Math.max(0, offset) });
}

/** Geliştirme sırasında defteri boşaltmak için (hata ayıklama). */
export function clearScreenMemory() {
	store.clear();
}