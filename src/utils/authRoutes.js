/**
 * Giriş ekranı yönlendirmesi — TEK KAYNAK
 *
 * TV'de sanal klavyeyle e-posta/parola yazmak ızdıraptır (bkz. plan §4.1).
 * Bu yüzden TV'de VARSAYILAN giriş ekranı kumanda dostu KOD + QR ekranıdır;
 * e-posta ile giriş orada ikincil bir düğme olarak durur.
 *
 * Neden yardımcı: aynı karar ÜÇ yerde veriliyordu (ayarlar satırı,
 * senkronizasyon kartı, profil hesap eylemi). Kopyalanan bir `Platform.isTV`
 * kontrolü zamanla ayrışır: bir ekran TV'yi yeni akışa gönderirken diğeri
 * hâlâ e-posta formunu açardı.
 */

import { Platform } from "react-native";

/** TV'nin varsayılan giriş ekranı (kod + QR). */
export const TV_LOGIN_ROUTE = "/(auth)/tv-login";

/** Telefon/tablet giriş ekranı (e-posta + parola). */
export const LOGIN_ROUTE = "/(auth)/login";

/**
 * Cihaza göre giriş rotasını döner.
 * @returns {string}
 */
export function loginRoute() {
	return Platform.isTV ? TV_LOGIN_ROUTE : LOGIN_ROUTE;
}

/**
 * Giriş ekranını açar (üç çağrı noktası buradan geçer).
 * @param {{ push: (route: string) => void }} router - `expo-router` yönlendiricisi
 */
export function openLogin(router) {
	router.push(loginRoute());
}
