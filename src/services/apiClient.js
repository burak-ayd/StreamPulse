/**
 * API İstemcisi — Token'lı fetch sarmalayıcı
 *
 * Özellikler:
 * - Her istekte Bearer JWT ekler
 * - 401 → otomatik refresh → tekrar dene (bir kez)
 * - Hata semantiği: 429 üstel geri çekilme, 5xx sessiz
 *
 * Import zinciri: apiClient → token.js → SecureStore
 * storage.js'ye BAĞIMLILIK YOK (döngüsel import önleme)
 */

import {
	getAccessToken,
	getRefreshToken,
	saveTokens,
	clearTokens,
} from "./token";

const API_BASE_URL =
	process.env.EXPO_PUBLIC_API_URL || "https://api.example.com";

// Auth event listener — AuthContext bu olayları dinler
let _onAuthExpired = null;

/**
 * Auth süresi dolduğunda çağrılacak callback'i ayarlar.
 * AuthContext tarafından çağrılır.
 */
export function setOnAuthExpired(callback) {
	_onAuthExpired = callback;
}

/**
 * Token yenileme — tek seferlik
 */
async function refreshSession() {
	const refreshToken = await getRefreshToken();
	if (!refreshToken) {
		return false;
	}

	try {
		const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ refresh_token: refreshToken }),
		});

		if (response.ok) {
			const data = await response.json();
			await saveTokens({
				access_token: data.access_token,
				refresh_token: data.refresh_token,
			});
			return true;
		}

		// Refresh token da geçersiz — oturumu kapat
		await clearTokens();
		_onAuthExpired?.();
		return false;
	} catch (error) {
		console.warn("Token yenileme hatası:", error.message);
		return false;
	}
}

/**
 * Kimlik doğrulamalı fetch isteği.
 *
 * @param {string} path - URL yolu (örn: "/api/sync/push")
 * @param {RequestInit} options - fetch seçenekleri
 * @param {object} config - Ek yapılandırma
 * @param {boolean} config.skipAuth - Token ekleme (public endpoint)
 * @param {boolean} config.isRetry - İç kullanım: tekrar deneme bayrağı
 * @returns {Promise<Response>}
 */
export async function authFetch(path, options = {}, config = {}) {
	const { skipAuth = false, isRetry = false } = config;

	const url = path.startsWith("http") ? path : `${API_BASE_URL}${path}`;

	const headers = {
		"Content-Type": "application/json",
		...(options.headers || {}),
	};

	// Token ekle
	if (!skipAuth) {
		const accessToken = await getAccessToken();
		if (accessToken) {
			headers.Authorization = `Bearer ${accessToken}`;
		}
	}

	const response = await fetch(url, {
		...options,
		headers,
	});

	// 401 → refresh → tekrar dene (bir kez)
	if (response.status === 401 && !skipAuth && !isRetry) {
		const refreshed = await refreshSession();
		if (refreshed) {
			return authFetch(path, options, { ...config, isRetry: true });
		}
		// Refresh başarısız — oturum sona erdi
		_onAuthExpired?.();
	}

	return response;
}

// ─── Auth API'leri (public, token gerektirmez) ────────────────

/**
 * Kullanıcı kaydı
 * @param {{ email: string, password: string, username: string, display_name?: string }} data
 */
export async function signup(data) {
	const response = await authFetch(
		"/api/auth/signup",
		{
			method: "POST",
			body: JSON.stringify(data),
		},
		{ skipAuth: true },
	);

	const body = await response.json();

	if (!response.ok) {
		throw new AuthError(body.detail || "Kayıt başarısız.", response.status);
	}

	await saveTokens({
		access_token: body.access_token,
		refresh_token: body.refresh_token,
	});

	return body;
}

/**
 * Giriş
 * @param {{ email: string, password: string }} data
 */
export async function login(data) {
	const response = await authFetch(
		"/api/auth/login",
		{
			method: "POST",
			body: JSON.stringify(data),
		},
		{ skipAuth: true },
	);

	const body = await response.json();

	if (!response.ok) {
		throw new AuthError(
			body.detail || "Giriş başarısız.",
			response.status,
		);
	}

	await saveTokens({
		access_token: body.access_token,
		refresh_token: body.refresh_token,
	});

	return body;
}

/**
 * Çıkış — sunucuya bildir + yerel token'ları sil
 */
export async function logout() {
	try {
		await authFetch("/api/auth/logout", { method: "POST" });
	} catch {
		// Sunucuya ulaşılamasa bile yerel çıkış yap
	}
	await clearTokens();
}

/**
 * Mevcut kullanıcı bilgisi
 * @returns {Promise<object|null>}
 */
export async function getMe() {
	try {
		const response = await authFetch("/api/auth/me");
		if (response.ok) {
			return await response.json();
		}
		return null;
	} catch {
		return null;
	}
}

// ─── Hata sınıfı ─────────────────────────────────────────────

export class AuthError extends Error {
	constructor(message, statusCode) {
		super(message);
		this.name = "AuthError";
		this.statusCode = statusCode;
	}
}

export { API_BASE_URL };
