/**
 * Token Servisi — SecureStore
 *
 * Access token ve refresh token'ı güvenli depoda saklar.
 * storage.js'den bağımsız → döngüsel import önleme.
 *
 * iOS: Keychain | Android: Keystore | Web: localStorage fallback
 */

import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const ACCESS_TOKEN_KEY = "streampulse_access_token";
const REFRESH_TOKEN_KEY = "streampulse_refresh_token";

// Web fallback — SecureStore web'de mevcut değil
const isWeb = Platform.OS === "web";

async function setItem(key, value) {
	if (isWeb) {
		try {
			localStorage.setItem(key, value);
		} catch { }
		return;
	}
	await SecureStore.setItemAsync(key, value);
}

async function getItem(key) {
	if (isWeb) {
		try {
			return localStorage.getItem(key);
		} catch {
			return null;
		}
	}
	return await SecureStore.getItemAsync(key);
}

async function deleteItem(key) {
	if (isWeb) {
		try {
			localStorage.removeItem(key);
		} catch { }
		return;
	}
	await SecureStore.deleteItemAsync(key);
}

// ─── Public API ───────────────────────────────────────────────

/**
 * Access token'ı kaydeder.
 * @param {string} token
 */
export async function setAccessToken(token) {
	if (!token) return;
	await setItem(ACCESS_TOKEN_KEY, token);
}

/**
 * Access token'ı okur.
 * @returns {Promise<string|null>}
 */
export async function getAccessToken() {
	return await getItem(ACCESS_TOKEN_KEY);
}

/**
 * Refresh token'ı kaydeder.
 * @param {string} token
 */
export async function setRefreshToken(token) {
	if (!token) return;
	await setItem(REFRESH_TOKEN_KEY, token);
}

/**
 * Refresh token'ı okur.
 * @returns {Promise<string|null>}
 */
export async function getRefreshToken() {
	return await getItem(REFRESH_TOKEN_KEY);
}

/**
 * Her iki token'ı birden kaydeder.
 * @param {{ access_token: string, refresh_token: string }} tokens
 */
export async function saveTokens({ access_token, refresh_token }) {
	await Promise.all([
		setAccessToken(access_token),
		setRefreshToken(refresh_token),
	]);
}

/**
 * Tüm token'ları siler (çıkış).
 */
export async function clearTokens() {
	await Promise.all([
		deleteItem(ACCESS_TOKEN_KEY),
		deleteItem(REFRESH_TOKEN_KEY),
	]);
}

/**
 * Oturum var mı kontrolü (hızlı).
 * @returns {Promise<boolean>}
 */
export async function hasSession() {
	const token = await getAccessToken();
	return !!token;
}
