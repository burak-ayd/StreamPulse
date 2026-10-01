/**
 * AuthContext — Oturum Durumu
 *
 * Giriş zorunlu DEĞİL — senkronizasyon isteyenler için hesap oluşturulur.
 * PlayerSettingsContext.jsx kalıbını takip eder.
 *
 * Provider sırası (_layout.jsx):
 * ThemeProvider → AuthProvider → PlayerSettingsProvider → ...
 */

import React, {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
import {
	signup as apiSignup,
	login as apiLogin,
	logout as apiLogout,
	getMe as apiGetMe,
	setOnAuthExpired,
} from "@/services/apiClient";
import { hasSession, clearTokens } from "@/services/token";

/**
 * @typedef {object} AuthUser
 * @property {string} id
 * @property {string} email
 * @property {string} username
 * @property {string} display_name
 */

/**
 * @typedef {'idle' | 'loading' | 'authenticated' | 'unauthenticated'} AuthStatus
 */

const AuthContext = createContext({
	/** @type {AuthUser|null} */
	user: null,
	/** @type {AuthStatus} */
	status: "idle",
	/** @type {boolean} */
	isLoggedIn: false,
	/** @type {boolean} */
	isLoading: true,
	signup: async () => {},
	login: async () => {},
	logout: async () => {},
	refreshUser: async () => {},
});

export function AuthProvider({ children }) {
	const [user, setUser] = useState(null);
	const [status, setStatus] = useState("idle"); // idle | loading | authenticated | unauthenticated

	// ─── Auth süresi doldu callback ──────────────────────
	const handleAuthExpired = useCallback(() => {
		setUser(null);
		setStatus("unauthenticated");
	}, []);

	// ─── İlk yükleme — mevcut oturumu kontrol et ────────
	useEffect(() => {
		let isMounted = true;

		async function checkSession() {
			setStatus("loading");

			const sessionExists = await hasSession();
			if (!sessionExists) {
				if (isMounted) setStatus("unauthenticated");
				return;
			}

			// Token var — kullanıcı bilgisini çek
			try {
				const meData = await apiGetMe();
				if (isMounted) {
					if (meData?.user || meData?.id) {
						setUser(meData.user || meData);
						setStatus("authenticated");
					} else {
						// Token geçersiz olmuş
						await clearTokens();
						setStatus("unauthenticated");
					}
				}
			} catch {
				if (isMounted) {
					// Sunucuya ulaşılamıyor — oturumun var olduğunu varsay
					// (çevrimdışı kullanım: senkron yapılamaz ama UI'da giriş yapmış görünür)
					setStatus("unauthenticated");
				}
			}
		}

		// Auth expired callback'i kaydet
		setOnAuthExpired(handleAuthExpired);

		checkSession();

		return () => {
			isMounted = false;
		};
	}, [handleAuthExpired]);

	// ─── Kayıt ol ────────────────────────────────────────
	const signup = useCallback(
		async ({ email, password, username, display_name }) => {
			setStatus("loading");
			try {
				const result = await apiSignup({
					email,
					password,
					username,
					display_name,
				});
				setUser(result.user);
				setStatus("authenticated");
				return result;
			} catch (error) {
				setStatus("unauthenticated");
				throw error;
			}
		},
		[],
	);

	// ─── Giriş yap ──────────────────────────────────────
	const login = useCallback(async ({ email, password }) => {
		setStatus("loading");
		try {
			const result = await apiLogin({ email, password });
			setUser(result.user);
			setStatus("authenticated");
			return result;
		} catch (error) {
			setStatus("unauthenticated");
			throw error;
		}
	}, []);

	// ─── Çıkış yap ──────────────────────────────────────
	const logout = useCallback(async () => {
		try {
			await apiLogout();
		} finally {
			setUser(null);
			setStatus("unauthenticated");
		}
	}, []);

	// ─── Kullanıcı bilgisini yenile ─────────────────────
	const refreshUser = useCallback(async () => {
		try {
			const meData = await apiGetMe();
			if (meData?.user || meData?.id) {
				setUser(meData.user || meData);
				setStatus("authenticated");
			}
		} catch {
			// Sessiz başarısızlık — mevcut durum korunur
		}
	}, []);

	const value = useMemo(
		() => ({
			user,
			status,
			isLoggedIn: status === "authenticated",
			isLoading: status === "idle" || status === "loading",
			signup,
			login,
			logout,
			refreshUser,
		}),
		[user, status, signup, login, logout, refreshUser],
	);

	return (
		<AuthContext.Provider value={value}>{children}</AuthContext.Provider>
	);
}

/**
 * Auth hook'u.
 * Provider dışında çağrılırsa güvenli varsayılan döner.
 */
export function useAuth() {
	const context = useContext(AuthContext);
	if (!context) {
		return {
			user: null,
			status: "unauthenticated",
			isLoggedIn: false,
			isLoading: false,
			signup: async () => {},
			login: async () => {},
			logout: async () => {},
			refreshUser: async () => {},
		};
	}
	return context;
}
