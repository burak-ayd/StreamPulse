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
	AuthError,
} from "@/services/apiClient";
import { hasSession, clearTokens, saveTokens } from "@/services/token";
import { authDiag } from "@/utils/authDiagnostics";
import { getAuthUser, saveAuthUser, clearAuthUser } from "@/utils/storage";
import { setSyncOwner, resetSyncState } from "@/services/sync";
import { okunmamisSayisiGetir } from "@/services/bildirimApi";
import { cihazKaydiYaz, cihazKaydiSil } from "@/services/pushApi";

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
	adoptSession: async () => {},
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
				// `firtla: true` — SecureStore okunamazsa `hasSession` false dönerdi
				// ve kullanıcı "oturum yok" sanıp giriş ekranına düşerdi. Bu
				// dosyanın `catch` bloğu zaten oturumu düşürmeden çevrimdışı
				// yola düşüyor; okuma hatası oraya yönlendirilmelidir.
				const sessionExists = await hasSession({ firtla: true });
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
				// 🔴 `hasSession({ firtla: true })` SecureStore okuma hatasını
				// BURAYA düşürür. Bu kayıt, "oturum yok" ile "oturum
				// okunamadı" ayrımını tek bakışta görünür kılar: token'lar
				// silinmedi, sadece okunamadı. `clearTokens` kaydı OLMAYACAK.
				await authDiag.record("checkSession", {
					sonuc: "okuma_hatasi",
					tokenVar: null,
					mesaj: String(error?.message ?? error),
				});
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

	// ─── TV oturumunu devral ────────────────────────────
	//
	// TV cihaz akışı (RFC 8628, plan §4.1) token'ları TV ekranında açar ama
	// ZENGİNLEŞTİRİLMİŞ kimliği getirmez: sunucu `/api/auth/device/token`
	// yanıtında GoTrue oturumunu olduğu gibi döner (bkz.
	// `MovieAppNew/Core/Libs/DeviceAuth.py`). Devralma bu yüzden iki adımdır:
	//
	//   1. token'ları yaz → oturum bundan sonra VARDIR,
	//   2. `/me` ile profil görünümünü çek (kullanıcı adı, avatar, dil…).
	//
	// ⚠️ 2. adım GEÇİCİ hata verirse token'lar SİLİNMEZ (doktrin: 5xx/ağ →
	// yerel durum korunur) ama oturum "açık" da ilan EDİLMEZ: TV ekranı
	// hatayı gösterip yeniden dener. Token'lar depoda kaldığı için uygulama
	// yeniden başlatıldığında `checkSession` oturumu geri getirir — bu yol
	// olmasaydı geçici bir 5xx, az önce kurulmuş sağlam oturumu çöpe atardı.
	const adoptSession = useCallback(
		async ({ access_token, refresh_token, expires_in }) => {
			setStatus("loading");
			await saveTokens({ access_token, refresh_token, expires_in });

			const meResult = await apiGetMe();

			if (meResult.ok) {
				setUser(meResult.user);
				setSyncOwner(meResult.user?.id);
				saveAuthUser(meResult.user).catch(() => {});
				setStatus("authenticated");
				authDiag.record("adoptSession", { basarili: true });
				return meResult.user;
			}

			if (meResult.reason === "auth") {
				// Token GERÇEKTEN ölü: `apiClient` zaten temizledi ve
				// `_onAuthExpired` durumu düşürdü; burada yalnızca tutarlılık
				// için tekrar sıfırlanır ve ekrana gösterilebilir hata döner.
				authDiag.record("adoptSession", {
					basarili: false,
					neden: "token_oldu",
				});
				setUser(null);
				setStatus("unauthenticated");
				throw new AuthError(
					"TV oturumu doğrulanamadı. Lütfen TV'de yeni bir kod oluşturun.",
					401,
				);
			}

			authDiag.record("adoptSession", {
				basarili: false,
				neden: meResult.reason ?? "bilinmiyor",
			});
			setUser(null);
			setStatus("unauthenticated");
			throw new Error(
				"TV bağlandı ancak hesap bilgisi alınamadı. Bağlantınızı kontrol edip tekrar deneyin.",
			);
		},
		[],
	);

	// ─── Çıkış yap ──────────────────────────────────────
	const logout = useCallback(async () => {
		try {
			// Push kaydı silimi token'lar YAŞARKEN yapılır: apiLogout
			// token'ları temizler; ondan sonra gelen silme isteği
			// 401'e düşer. Sözleşme fonksiyonun fırlatmadığını söyler —
			// try yine de çıkışı push hatasına bağlamaz.
			await cihazKaydiSil();
		} catch (_e) {
			/* ulaşılamadıysa: satır sonraki kayıtta yeniden kazanılır */
		}
		try {
			await apiLogout();
		} finally {
			authDiag.record("logout", { kaynak: "kullanici_istegi" });
			// Damga silinmezse bir sonraki girişte (aynı veya farklı hesap)
			// istemci eski bir "son indirme" noktası bildirir ve sunucudaki veri
			// daha eski sayılır → boş kütüphane.
			resetSyncState();
			// Çıkışta simge rozeti de sıfırlanır: oturumsuz kullanıcıda
			// okunmamış sayısı 0 yayar, launcher rozeti boşalır.
			void okunmamisSayisiGetir({ force: true });
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

	// ─── Push token kaydı (Faz 5 istemci ara katmanı) ────
	//
	// TEK bağlama noktası: durum "authenticated" olduğu anda cihaz
	// kaydı yazılır; login/signup/adoptSession/checkSession/oturum
	// devamlarının BÜTÜNÜ bu efektle taşınır. Kayıt upsert'tir ve
	// idempotenttir — çift çağrı yalnızca `last_seen` tazeler.
	// Çıkış tarafı aşağıdaki `logout`'ta: silme isteği token'lar
	// geçerliyken giderek 401'e düşmez.
	useEffect(() => {
		if (status === "authenticated") {
			void cihazKaydiYaz();
		}
	}, [status]);

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
			adoptSession,
		}),
		[user, status, signup, login, logout, refreshUser, adoptSession],
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
			adoptSession: async () => {},
		};
	}
	return context;
}
