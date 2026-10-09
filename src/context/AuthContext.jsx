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
import { authDiag } from "@/utils/authDiagnostics";
import { getAuthUser, saveAuthUser, clearAuthUser } from "@/utils/storage";
import { setSyncOwner, resetSyncState } from "@/services/sync";

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
	// Yalnızca TERMINAL bir auth hatasında tetiklenir (apiClient yalnızca
	// 401/403'ta çağırır). Geçici hata (5xx, uçak modu) oturumu düşürmez.
	const handleAuthExpired = useCallback(() => {
		authDiag.record("authExpired", { kaynak: "apiClient.terminateSession" });
		setUser(null);
		setStatus("unauthenticated");
		// Kimlik de artık geçersiz; çevrimdışı yedeğin kullanmasın
		clearAuthUser().catch(() => {});
	}, []);

	// ─── İlk yükleme — mevcut oturumu kontrol et ────────
	useEffect(() => {
		let isMounted = true;

		/**
		 * Sunucuya ulaşılamadı: token'lar korunur, son girişte saklanan
		 * kimlikle çevrimdışı kullanım sürdürülür. Kimlik de yoksa giriş
		 * ekranına düşülür — ama token'lar YİNE silinmez.
		 */
		async function applyCachedSession() {
			const cachedUser = await getAuthUser();
			if (!isMounted) return;

			if (cachedUser?.id) {
				setUser(cachedUser);
				setSyncOwner(cachedUser.id);
				setStatus("authenticated");
				await authDiag.record("checkSession", {
					sonuc: "cevrimdisi_yedek",
					kimlikVar: true,
				});
			} else {
				setUser(null);
				setStatus("unauthenticated");
				await authDiag.record("checkSession", {
					sonuc: "kimlik_yok",
					kimlikVar: false,
				});
			}
		}

		async function checkSession() {
			setStatus("loading");

			try {
				const sessionExists = await hasSession();
				if (!sessionExists) {
					// ⚠️ TEŞHİS KAYDI: Sunucuya HİÇ istek atılmadan burada
					// karar veriliyor. Sunucu logunda bu dalın izi YOKTUR —
					// belirtinin ilk ölçümünde loglar tam olarak bu yüzden
					// sessizdi. `hasSession()` içine yazılan kayıt, SecureStore'da
					// ne olduğunu (access/refresh varlığı) söyler.
					await authDiag.record("checkSession", {
						sonuc: "token_yok",
						tokenVar: false,
					});
					if (isMounted) setStatus("unauthenticated");
					return;
				}

				// Token var — kullanıcı bilgisini çek
				const meResult = await apiGetMe();
				if (!isMounted) return;

				// 1) Doğrulandı
				if (meResult.ok) {
					const meUser = meResult.user;
					setUser(meUser);
					setSyncOwner(meUser?.id);
					saveAuthUser(meUser).catch(() => {});
					setStatus("authenticated");
					await authDiag.record("checkSession", { sonuc: "dogrulandi" });
					return;
				}

				// 2) Token GERÇEKTEN geçersiz (401/403) → oturumu kapat
				if (meResult.reason === "auth") {
					await authDiag.record("checkSession", {
						sonuc: "token_oldu",
						tokenVar: true,
					});
					await clearTokens("checkSession: getMe reason=auth");
					await clearAuthUser();
					if (isMounted) {
						setUser(null);
						setStatus("unauthenticated");
					}
					return;
				}

				// 3) `reason: "network" | "server"` → sunucuya ULAŞILAMADI.
				//    Token'lar SİLİNMEZ: sunucu sözleşmesi 5xx'te "yerel veri
				//    korunur, sessizce sonra dene" der (SYNC_AUTH_PLAN.md §5.3).
				await applyCachedSession();
			} catch (error) {
				// Beklenmedik hata (güvenli depo/ayrıştırma) — muhafazakâr:
				// oturumu düşürmeden çevrimdışı yola düş.
				console.warn("Oturum kontrolü hatası:", error?.message);
				await applyCachedSession();
			}
		}

		// Auth expired callback'i kaydet
		setOnAuthExpired(handleAuthExpired);

		checkSession();

		return () => {
			isMounted = false;
			// StrictMode/remount'ta bayat callback birikmesin
			setOnAuthExpired(null);
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
				// Delta damgası hesaba bağlıdır; sahibi bildir
				setSyncOwner(result.user?.id);
				saveAuthUser(result.user).catch(() => {});
				setStatus("authenticated");
				authDiag.record("signup", { basarili: true });
				return result;
			} catch (error) {
				setUser(null);
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
			setSyncOwner(result.user?.id);
			saveAuthUser(result.user).catch(() => {});
			setStatus("authenticated");
			authDiag.record("login", { basarili: true });
			return result;
		} catch (error) {
			setUser(null);
			setStatus("unauthenticated");
			throw error;
		}
	}, []);

	// ─── Çıkış yap ──────────────────────────────────────
	const logout = useCallback(async () => {
		try {
			await apiLogout();
		} finally {
			authDiag.record("logout", { kaynak: "kullanici_istegi" });
			// Damga silinmezse bir sonraki girişte (aynı veya farklı hesap)
			// istemci eski bir "son indirme" noktası bildirir ve sunucudaki veri
			// daha eski sayılır → boş kütüphane.
			resetSyncState();
			// Saklanan kimlik de silinir: çıkışta kimse tanınmamalı
			clearAuthUser().catch(() => {});
			setUser(null);
			setStatus("unauthenticated");
		}
	}, []);

	// ─── Kullanıcı bilgisini yenile ─────────────────────
	const refreshUser = useCallback(async () => {
		const meResult = await apiGetMe();
		// Yalnızca doğrulandığında güncelle; 5xx/ağ hatası mevcut (veya
		// çevrimdışı) oturumu BOZMAMALIDIR.
		if (meResult.ok) {
			setUser(meResult.user);
			setSyncOwner(meResult.user?.id);
			saveAuthUser(meResult.user).catch(() => {});
			setStatus("authenticated");
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
