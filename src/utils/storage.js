import AsyncStorage from "@react-native-async-storage/async-storage";
import { notifyStorageChange } from "./storageListener";
import { getDeviceId } from "./deviceId";
import { now as getHlcNow } from "./hlc";
import { filterPayload, capList, SIZE_CAPS } from "./fieldWhitelist";
import { canonicalType } from "./mediaType";
import { resolveSearchDoc } from "./merge/documents";

export const STORAGE_KEYS = {
	USER_PROFILE: "user_profile",
	// Oturumun KİMLİĞİ (id/e-posta/username), içerik DEĞİL.
	// Sunucuya ulaşılamadan açılan uygulamada "giriş yapmış" görünmek için
	// son başarılı girişte yazılır. Token'lar gibi OTURUM verisidir, bu yüzden
	// `clearAllUserData()` tarafından TEMİZLENMEZ (aşağıdaki yoruma bak).
	AUTH_USER: "user_auth",
	FAVORITES: "user_favorites",
	WATCH_HISTORY: "user_watch_history",
	SETTINGS: "app_settings",
	SEARCH_HISTORY: "user_search_history",
	PLAYER_SETTINGS: "app_player_settings",
	SELECTED_PLATFORM: "user_selected_platform",
	DOWNLOADS: "streampulse_downloads_list",
	CONTINUE_WATCHING: "user_continue_watching",
	PLUGIN_VISIBILITY: "streampulse_plugin_visibility",
	CATEGORY_VISIBILITY: "streampulse_category_visibility",
	WATCHLIST: "user_watchlist",
	SERIES_TOTAL_EPISODES: "streampulse_series_total_episodes",
	// Kitaplıktan kaldırılan (gizlenen) içerikler.
	//
	// ⚠️ SADECE cihaz-yereldir ve İÇERİK VERİSİ DEĞİLDİR: "kaldırma" bir
	// görünürlük tercihidir. İzleme geçmişi, tamamlanan bölümler ve ilerleme
	// bu işlemden ETKİLENMEZ (kullanıcı: "kitaplıktan kaldırılınca tamamlandı
	// bilgisi sıfırlanıyor, veriler silinmemeli"). Gizleme yalnızca
	// "Tamamlandı" sekmesinin görünümünü filtreler; kullanıcı içeriği
	// herhangi bir listeye eklediğinde kayıt otomatik kaldırılır.
	LIBRARY_HIDDEN: "user_library_hidden",

	// ── Senkronizasyum durumu ──────────────────────────────────
	// ⚠️ Bunlar KULLANICI VERİSİ DEĞİLDİR; cihaz geneli durumdur. Yine de
	// kullanıcı verisiyle birlikte temizlenmelidir, çünkü damga (`LAST_SYNCED_AT`)
	// o kullanıcının verisinin hangi noktaya kadar indiğini belirtir. Silinmezse
	// "verileri temizle → tekrar giriş yap" akışında istemci sunucudan daha yeni
	// bir damga bildirir, sunucudaki satırların hepsi eski sayılır ve
	// `updated_at > since` hiçbir şey döndürmez → kullanıcı boş bir kütüphane görür.
	LAST_SYNCED_AT: "streampulse_last_synced_at",
	PENDING_SYNC_COUNT: "streampulse_pending_sync_count",
	SYNC_OWNER: "streampulse_sync_owner",
	// Belge (document) senkronizasyon meta verisi:
	//   `{ grup: { hlc, deviceId, sig } }`
	// `hlc` = belgenin sunucuda bilinen son damgası, `sig` = son gönderilen/çekilen
	// içeriğin imzası. ⚠️ Kullanıcı verisi DEĞİLDİR ama hesap bağımlıdır: başka
	// hesaba geçince temizlenmeli (bkz. `setSyncOwner`), çünkü yanlış hesabın
	// damgasıyla "değişmemiş" sanılan bir belge yeni hesabın verisini ezer.
	DOC_SYNC_META: "streampulse_sync_doc_meta",
};

// Sıralı yazma kuyruğu — read-modify-write yarış koşullarını önler
const _mutationQueues = new Map();

export async function mutate(key, fn) {
	const current = _mutationQueues.get(key) || Promise.resolve();
	const next = current
		.then(async () => {
			return await fn();
		})
		.catch((err) => {
			console.warn(`mutate error for [${key}]:`, err);
			throw err;
		});
	_mutationQueues.set(key, next);
	return next;
}

/**
 * Kullanıcı verilerini temizler.
 * Oturum tokenları, cihaz kimliği ve şema sürümünü KORUR.
 *
 * `AUTH_USER` de korunur: o bir içerik değil, oturumun kimliğidir. "Verileri
 * Temizle" yapan kullanıcı hesabını silmek istemiyor; hesabı silmek istese
 * açık çıkış yapardı. Böylece temizlikten sonra uçak modunda açılışta kullanıcı
 * yine tanınır, sonraki çevrimiçi açılışta `getMe()` ile tazelenir.
 */
export async function clearAllUserData() {
	const userKeys = [
		STORAGE_KEYS.USER_PROFILE,
		STORAGE_KEYS.FAVORITES,
		STORAGE_KEYS.WATCH_HISTORY,
		STORAGE_KEYS.SETTINGS,
		STORAGE_KEYS.SEARCH_HISTORY,
		STORAGE_KEYS.PLAYER_SETTINGS,
		STORAGE_KEYS.SELECTED_PLATFORM,
		STORAGE_KEYS.DOWNLOADS,
		STORAGE_KEYS.CONTINUE_WATCHING,
		STORAGE_KEYS.PLUGIN_VISIBILITY,
		STORAGE_KEYS.CATEGORY_VISIBILITY,
		STORAGE_KEYS.WATCHLIST,
		STORAGE_KEYS.SERIES_TOTAL_EPISODES,
		STORAGE_KEYS.LIBRARY_HIDDEN,
		// Senkronizasyon durumu da temizlenmeli. Damga kalırsa sunucudaki veri
		// "daha eski" sayılır ve bir sonraki girişte hiçbir şey çekilmez.
		STORAGE_KEYS.LAST_SYNCED_AT,
		STORAGE_KEYS.PENDING_SYNC_COUNT,
		STORAGE_KEYS.SYNC_OWNER,
		STORAGE_KEYS.DOC_SYNC_META,
	];
	try {
		await AsyncStorage.multiRemove(userKeys);
		userKeys.forEach((k) => notifyStorageChange(k, null));
		return true;
	} catch (error) {
		console.error("clearAllUserData hatası:", error);
		throw error;
	}
}

export const NONE_PLATFORM = {
	id: "none",
	name: "None",
	displayName: "None (Hiçbiri)",
	description: "Sadece indirilen içerikleri gösterir",
	is_offline: true,
};

/**
 * Canlı TV varış noktası.
 *
 * ⚠️ NEDEN `NONE_PLATFORM`'un ALTINDA VE AYRI BİR SABİT?
 *
 * 1. `NONE_PLATFORM` zaten platform listesinin dışında duran, ÖZEL davranışa
 *    sahip bir ayrıcalıktır: `is_offline: true` taşır ve `index.jsx:198`'de
 *    `platform.id === "none"` diye dallanarak içerik akışı yerine indirilenler
 *    ekranını açar. Canlı TV de tam olarak bu sınıftadır — ikisi de "bir
 *    eklenti değil, uygulamanın kendi veri kaynağı". Bu yüzden ikisini aynı
 *    `is_offline` bayrağıyla birleştirmek, ekranın bu ayrımı yapamamasına
 *    yol açardı; ayrı sabitler hem okunur hem de ileride biri silinirse diğeri
 *    etkilenmez.
 *
 * 2. `is_live` ayrımı ZORUNLUDUR, lüks değildir. Bu kart bir film/dizi
 *    içerik kaynağı DEĞİLDİR; ayrı bir varış noktasıdır. `index.jsx`'in
 *    "seçili platform → `/api/plugins/{name}/main-page`" akışı bir içerik
 *    kaynağı bekler, ama `canli-tv` ne bir `PluginBase` eklentisidir ne de
 *    `/api/plugins/{name}/categories` ucu vardır. `is_live: true` olmadan bu
 *    kart seçildiğinde uygulama var olmayan bir eklentiye gider ve boş ekran
 *    ya da 404 alır.
 *
 * ⚠️ `is_live` yüzünden bu kart `saveSelectedPlatform` ile KALICI SEÇİM
 * YAPILMAZ. Kalıcı seçim, uygulama yeniden açıldığında `index.jsx`'in
 * otomatik olarak `/api/plugins/{name}/main-page` çağırdığı akışın girdisidir
 * ve canlı TV o akışın dışındadır. Bu yüzden `PlatformList` bu kartı
 * navigasyona çevirmelidir (bkz. `router.push("/live")`), `saveSelectedPlatform`
 * çağırmadan. `is_live` alanı, çağıran tarafın bu ayrımı "destekliyor mu"
 * diye bakacağı kalıcı sözleşmedir.
 *
 * Kanal/kategori sayıları (`description`) sabit yazılmıştır: bunlar ekran
 * açılışında `/api/live/categories` ucundan gelir ve kart etiketi, liste
 * daha önce çekilmeden önce gösterilmek zorundadır. Sayılar M3U yenilendiğinde
 * değişebilir; ekran elindeki `fetchLiveCategories()` sonucunu varsa
 * `description` alanını ondan tazelemekten sorumludur.
 */
export const LIVE_TV_PLATFORM = {
	id: "canli-tv",
	name: "Canlı TV",
	displayName: "Canlı TV",
	description: "138 canlı kanal · 7 kategori",
	is_live: true,
	is_offline: false,
	language: "tr",
};

export const DEFAULT_PLAYER_SETTINGS = {
	// Video oynatıcı ayarları
	seekDuration: 10, // 5, 10, 15, 30, 60 sn
	defaultResizeMode: "contain", // 'contain' | 'cover' | 'stretch'
	autoPlay: true,
	controlsTimeout: 4, // 3, 4, 5, 8 sn
	defaultOrientation: "landscape", // 'landscape' | 'sensor'
	autoResume: true,

	// ── Jest/Hareket ayarları ──────────────────────────────────
	// Çift dokunma seek'i (Netflix/YouTube davranışı)
	doubleTapSeek: true,
	// Çift dokunmanın ORTA bölgesi play/pause yapsın (±%15)
	doubleTapPause: true,
	// Yatay sürükleme ile seek
	swipeSeek: true,
	// Dikey sürükleme: sol yarı parlaklık, sağ yarı ses
	verticalSwipe: true,
	// %100 üstü parlaklık/ses (CloudStream'deki "iki aşamalı" jest)
	extraBrightness: false,
	extraVolume: false,
	// Uzun basış ile 2x hızlandırma
	longPressSpeedUp: true,
	longPressSpeedUpDelay: 500, // ms
	longPressSpeedRate: 2,
	// Pinch zoom + pan
	pinchZoom: true,

	// ── Oynatma ayarları ───────────────────────────────────────
	// Oynatma hızı: 0.25 / 0.5 / 0.75 / 1 / 1.25 / 1.5 / 1.75 / 2
	playbackSpeed: 1,
	// Sonraki bölümü otomatik oynat
	autoPlayNextEpisode: true,
	// Kalan süreyi göster (true) / geçen süreyi (false)
	showRemainingTime: false,

	// ── Sistem entegrasyonu ────────────────────────────────────
	// Picture-in-Picture
	pictureInPicture: true,
	// Arka planda çalmaya devam et
	playInBackground: true,

	// Altyazı görünüm ayarları
	subtitleFontSize: 16, // 14, 16, 20, 24
	subtitleTextColor: "#FFFFFF", // '#FFFFFF', '#FFD600', '#00E676', '#00E5FF'
	subtitleBgColor: "semi-black", // 'semi-black', 'solid-black', 'transparent', 'blur'
	subtitleTextShadow: true,
	defaultSubtitleLanguage: "tr", // 'tr', 'en', 'off'
};

/** Player ayarlarında sunulabilecek değer aralıkları (ayarlar ekranı için). */
export const PLAYER_SETTING_OPTIONS = {
	seekDuration: [5, 10, 15, 30, 60],
	controlsTimeout: [3, 4, 5, 8],
	resizeModes: ["contain", "cover", "stretch"],
	playbackSpeeds: [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2],
	subtitleFontSizes: [14, 16, 20, 24],
};

const DEFAULT_PROFILE = {
	username: "misafir",
	displayName: "Misafir Kullanıcı",
	email: "",
	avatarUrl: "",
	bio: "",
	language: "Türkçe",
	isPrivate: false,
	birthDate: "",
};

/**
 * Kullanıcı profil bilgilerini AsyncStorage'dan okur
 */
export async function getUserProfile() {
	try {
		const data = await AsyncStorage.getItem(STORAGE_KEYS.USER_PROFILE);
		if (data) {
			return { ...DEFAULT_PROFILE, ...JSON.parse(data) };
		}
		// İlk çalıştırmada varsayılan profili kaydet ve dön
		await AsyncStorage.setItem(
			STORAGE_KEYS.USER_PROFILE,
			JSON.stringify(DEFAULT_PROFILE),
		);
		return DEFAULT_PROFILE;
	} catch (error) {
		console.error("Profil okunurken hata:", error);
		return DEFAULT_PROFILE;
	}
}

/**
 * Kullanıcı profil bilgilerini AsyncStorage'a kaydeder
 */
export async function saveUserProfile(profileUpdates) {
	return mutate(STORAGE_KEYS.USER_PROFILE, async () => {
		try {
			const currentProfile = await getUserProfile();
			const updatedProfile = {
				...currentProfile,
				...profileUpdates,
				updatedAt: new Date().toISOString(),
			};
			await AsyncStorage.setItem(
				STORAGE_KEYS.USER_PROFILE,
				JSON.stringify(updatedProfile),
			);
			notifyStorageChange(STORAGE_KEYS.USER_PROFILE, updatedProfile);
			return updatedProfile;
		} catch (error) {
			console.error("Profil kaydedilirken hata:", error);
			throw error;
		}
	});
}

/**
 * Son girişte doğrulanan oturum kullanıcısını okur.
 *
 * Ne zaman kullanılır: açılışta `/api/auth/me` ULAŞILAMADIĞINDA (uçak modu,
 * 5xx, zaman aşımı). Token'lar silinmez; oturum "giriş yapmış" sayılır ve
 * kullanıcı arayüzü bu kimlikle açılır. Sunucu sözleşmesi gereği 5xx'de
 * "yerel veri korunur" (SYNC_AUTH_PLAN.md §5.3).
 *
 * @returns {Promise<object|null>} { id, email, username, display_name, ... }
 */
export async function getAuthUser() {
	try {
		const raw = await AsyncStorage.getItem(STORAGE_KEYS.AUTH_USER);
		if (!raw) return null;
		const parsed = JSON.parse(raw);
		// id yoksa kimlik doğrulanamaz → çevrimdışı kullanım gösterilmez
		return parsed?.id ? parsed : null;
	} catch (error) {
		console.error("Oturum kullanıcısı okunurken hata:", error);
		return null;
	}
}

/**
 * Doğrulanmış oturum kullanıcısını saklar (giriş/kayıt/`getMe` başarısında).
 * @param {object|null} user
 */
export async function saveAuthUser(user) {
	return mutate(STORAGE_KEYS.AUTH_USER, async () => {
		try {
			if (!user?.id) {
				await AsyncStorage.removeItem(STORAGE_KEYS.AUTH_USER);
				notifyStorageChange(STORAGE_KEYS.AUTH_USER, null);
				return null;
			}
			// Sadece kimlik alanları — profil içeriği `user_profile`'da durur
			const identity = {
				id: user.id,
				email: user.email ?? "",
				username: user.username ?? "",
				display_name: user.display_name ?? "",
				avatar_url: user.avatar_url ?? "",
			};
			await AsyncStorage.setItem(
				STORAGE_KEYS.AUTH_USER,
				JSON.stringify(identity),
			);
			notifyStorageChange(STORAGE_KEYS.AUTH_USER, identity);
			return identity;
		} catch (error) {
			console.error("Oturum kullanıcısı kaydedilirken hata:", error);
			throw error;
		}
	});
}

/**
 * Saklanan oturum kullanıcısını siler (çıkış / terminal auth hatası).
 */
export async function clearAuthUser() {
	return await saveAuthUser(null);
}

/**
 * Favori filmleri/içerikleri getirir (silinmemiş olanlar)
 */
export async function getFavorites() {
	try {
		const data = await AsyncStorage.getItem(STORAGE_KEYS.FAVORITES);
		if (!data) return [];
		const list = JSON.parse(data);
		return Array.isArray(list) ? list.filter((item) => !item._deleted) : [];
	} catch (error) {
		console.error("Favoriler okunurken hata:", error);
		return [];
	}
}

/**
 * Bir içeriği favorilere ekler veya favorilerden çıkarır (toggle).
 * Tombstone desteği ile senkronizasyona uygundur.
 *
 * ⚠️ `type` ALANI BURADA NORMALLEŞTİRİLİR — kalıcı garanti noktası.
 *
 * Favoriye eklemenin beş ayrı çağrı yolu var (MovieDetails, QuickPreviewModal,
 * ListSelectModal, library, …) ve hepsi farklı ölçüde veri taşıyor: kimisi
 * `type: "series"` veriyor, kimisi yalnızca backend'in `media_type: "Dizi"`
 * alanını, kimisi hiçbir ipucu vermiyor. Normalleştirmeyi çağrılara
 * bırakırsak bir yerde unutulur ve dizi "Film" olarak kaydedilir
 * (profil ekranında "Diziler (0)" çıkan bu yüzden).
 *
 * Bu yüzden `type`, KAYDEDİLMEK ÜZERİNE her zaman `utils/mediaType.js`
 * tarafından yeniden hesaplanır. `type` senkronizasyonda taşınan kanonik
 * alandır (`LIBRARY_FIELDS`), yani kayıt anında doğru yazılır.
 */
export async function toggleFavorite(movie) {
	return mutate(STORAGE_KEYS.FAVORITES, async () => {
		try {
			const data = await AsyncStorage.getItem(STORAGE_KEYS.FAVORITES);
			const all = data ? JSON.parse(data) : [];
			const deviceId = await getDeviceId();
			const hlc = getHlcNow();
			const movieId = movie.id || movie.url;

			// Kanonik tür — bkz. fonksiyon başındaki not.
			const kanonikMovie = { ...movie, type: canonicalType(movie) };

			const existingIndex = all.findIndex((item) => (item.id || item.url) === movieId);
			let updated;
			let isNowFav = false;

			if (existingIndex !== -1) {
				const existing = all[existingIndex];
				if (existing._deleted) {
					isNowFav = true;
					const revived = {
						...existing,
						...filterPayload(kanonikMovie),
						_hlc: hlc,
						_deviceId: deviceId,
						_deleted: false,
						updatedAt: new Date().toISOString(),
					};
					updated = [revived, ...all.filter((_, idx) => idx !== existingIndex)];
				} else {
					isNowFav = false;
					const tombstone = {
						...existing,
						_hlc: hlc,
						_deviceId: deviceId,
						_deleted: true,
						updatedAt: new Date().toISOString(),
					};
					updated = [tombstone, ...all.filter((_, idx) => idx !== existingIndex)];
				}
			} else {
				isNowFav = true;
				const newItem = {
					...filterPayload(kanonikMovie),
					id: movieId,
					_hlc: hlc,
					_deviceId: deviceId,
					_deleted: false,
					updatedAt: new Date().toISOString(),
				};
				updated = [newItem, ...all];
			}

			const capped = capList(updated, SIZE_CAPS.favorites || 500);
			await AsyncStorage.setItem(
				STORAGE_KEYS.FAVORITES,
				JSON.stringify(capped),
			);
			const activeFavs = capped.filter((i) => !i._deleted);
			notifyStorageChange(STORAGE_KEYS.FAVORITES, activeFavs);
			return isNowFav;
		} catch (error) {
			console.error("Favori güncellenirken hata:", error);
			throw error;
		}
	});
}

/**
 * Bir içeriğin favorilerde olup olmadığını sorgular
 */
export async function isFavorite(movieId) {
	try {
		const favorites = await getFavorites();
		return favorites.some((item) => (item.id || item.url) === movieId);
	} catch (error) {
		console.error("Favori durumu kontrol edilirken hata:", error);
		return false;
	}
}

/**
 * İzleme geçmişini getirir
 */
export async function getWatchHistory() {
	try {
		const data = await AsyncStorage.getItem(STORAGE_KEYS.WATCH_HISTORY);
		if (!data) return [];
		const list = JSON.parse(data);
		return Array.isArray(list) ? list.filter((i) => !i._deleted) : [];
	} catch (error) {
		console.error("İzleme geçmişi okunurken hata:", error);
		return [];
	}
}

/**
 * İzleme geçmişine içerik ekler
 */
export async function addToWatchHistory(movie) {
	return mutate(STORAGE_KEYS.WATCH_HISTORY, async () => {
		try {
			if (!movie) return [];
			const raw = await AsyncStorage.getItem(STORAGE_KEYS.WATCH_HISTORY);
			const history = raw ? JSON.parse(raw) : [];
			const isMovieEpisode =
				movie.type === "episode" || Boolean(movie.season && movie.episode);

			const deviceId = await getDeviceId();
			const hlc = getHlcNow();

			const finalMovie = {
				...filterPayload(movie),
				id:
					isMovieEpisode && movie.season && movie.episode
						? movie.id && movie.id !== movie.seriesId
							? movie.id
							: `${movie.seriesId || movie.seriesTitle || "series"}_s${movie.season}_e${movie.episode}`
						: movie.id || movie.url,
				watchedAt: new Date().toISOString(),
				_hlc: hlc,
				_deviceId: deviceId,
				_deleted: false,
			};

			const movieId = finalMovie.id || finalMovie.url;

			const filtered = history.filter((item) => {
				const isItemEpisode =
					item.type === "episode" || Boolean(item.season && item.episode);

				if (isMovieEpisode && isItemEpisode) {
					const sameSeries =
						(finalMovie.seriesId &&
							item.seriesId &&
							finalMovie.seriesId === item.seriesId) ||
						(finalMovie.seriesTitle &&
							item.seriesTitle &&
							finalMovie.seriesTitle.toLowerCase().trim() ===
								item.seriesTitle.toLowerCase().trim());

					if (
						sameSeries &&
						Number(item.season) === Number(finalMovie.season) &&
						Number(item.episode) === Number(finalMovie.episode)
					) {
						return false;
					}

					if (finalMovie.url && item.url && finalMovie.url === item.url) {
						return false;
					}

					if (movieId && item.id && movieId === item.id) {
						return false;
					}

					return true;
				}

				if (isMovieEpisode !== isItemEpisode) {
				/*
				 * ⚠️ Aynı içeriğin İKİ kaydı (çift satır hatası).
				 *
				 * `player.jsx` izleme geçmişine kaynaklar yüklenirken
				 * yazar. O anda `seriesInfo` henüz gelmemiş olabiliyor;
				 * bu yüzden ilk kayıt `season`/`episode` ALMADAN yazılır.
				 * Bölüm bittiğinde `markEpisodeComplete` aynı bölümü
				 * `season`/`episode` İLE yeniden yazar.
				 *
				 * Eski davranış burada `return true` (koru) ile iki kaydı
				 * AYIRIYORDU: biri "bölümlü", biri "bölümsüz" sayıldığı
				 * için hiç eşleşme yapılmıyordu. Sonuç: aynı bölüm
				 * listede iki kez görünüyor ve React "two children with
				 * the same key" hatası veriyordu.
				 *
				 * Düzeltme: tip uyuşmasa bile aynı `id`/`url` varsa
				 * tekilleştirilir.
				 */
				if (movieId && item.id === movieId) return false;
				if (finalMovie.url && item.url && finalMovie.url === item.url)
					return false;
				if (movieId && item.url === movieId) return false;
				if (finalMovie.url && item.id === finalMovie.url) return false;
				return true;
			}

				const itemId = item.id || item.url;
				if (movieId && itemId === movieId) return false;
				if (finalMovie.url && item.url === finalMovie.url) return false;
				return true;
			});

			const updated = [finalMovie, ...filtered].slice(0, SIZE_CAPS.watch_history || 50);
			await AsyncStorage.setItem(
				STORAGE_KEYS.WATCH_HISTORY,
				JSON.stringify(updated),
			);
			notifyStorageChange(STORAGE_KEYS.WATCH_HISTORY, updated.filter((i) => !i._deleted));

			// Tamamlandığı için Planlanan listesinden temizle
			if (finalMovie.isCompleted) {
				await removeFromWatchlist(finalMovie);
			}

			return updated;
		} catch (error) {
			console.error("İzleme geçmişi güncellenirken hata:", error);
			throw error;
		}
	});
}

/**
 * İzleme geçmişinden (tamamlananlardan) içerik siler
 */
export async function removeFromWatchHistory(target) {
	return mutate(STORAGE_KEYS.WATCH_HISTORY, async () => {
		try {
			if (!target) return [];
			const targetId = typeof target === "object" ? (target.id || target.url) : target;
			const targetUrl = typeof target === "object" ? target.url : null;
			const targetSeriesId = typeof target === "object" ? (target.seriesId || target.id) : null;
			const targetTitle = typeof target === "object" ? (target.seriesTitle || target.title)?.toLowerCase().trim() : null;

			const raw = await AsyncStorage.getItem(STORAGE_KEYS.WATCH_HISTORY);
			const history = raw ? JSON.parse(raw) : [];
			const deviceId = await getDeviceId();
			const hlc = getHlcNow();

			const updated = history.map((item) => {
				const isMatch =
					(targetId && (item.id === targetId || item.url === targetId)) ||
					(targetUrl && (item.id === targetUrl || item.url === targetUrl)) ||
					(targetSeriesId && (item.seriesId === targetSeriesId || item.id === targetSeriesId)) ||
					(targetTitle && (item.seriesTitle?.toLowerCase().trim() === targetTitle || item.title?.toLowerCase().trim() === targetTitle));

				if (isMatch) {
					return {
						...item,
						_hlc: hlc,
						_deviceId: deviceId,
						_deleted: true,
					};
				}
				return item;
			});

			await AsyncStorage.setItem(
				STORAGE_KEYS.WATCH_HISTORY,
				JSON.stringify(updated),
			);
			const activeHistory = updated.filter((i) => !i._deleted);
			notifyStorageChange(STORAGE_KEYS.WATCH_HISTORY, activeHistory);
			return activeHistory;
		} catch (error) {
			console.error("İzleme geçmişinden silinirken hata:", error);
			return [];
		}
	});
}

/**
 * İzleme geçmişinin TAMAMINI temizler (profil → "Geçmişi Temizle").
 *
 * ⚠️ Neden ayrı fonksiyon: `removeFromWatchHistory` tek kaydı siler ve
 * `_deleted` tombstone'ı yazar. Tüm listeyi boşaltmak için N kez çağırmak
 * (a) N defa mutate + N bildirim demek, (b) her adımda ayrı HQL yazmak,
 * (c) kullanıcı 50 kayıt varsa 50 turda gezmek anlamına gelirdi.
 *
 * Tek seferde tombstone'lanır: kullanıcının diğer cihazlarındaki kayıtlar da
 * silinir (aksi halde bir sonraki pull onları geri getirirdi).
 *
 * @returns {Promise<Array>} Temizlenmiş (boş) aktif liste
 */
export async function clearWatchHistory() {
	return mutate(STORAGE_KEYS.WATCH_HISTORY, async () => {
		try {
			const raw = await AsyncStorage.getItem(STORAGE_KEYS.WATCH_HISTORY);
			const history = raw ? JSON.parse(raw) : [];
			if (!Array.isArray(history) || history.length === 0) return [];

			const deviceId = await getDeviceId();
			const hlc = getHlcNow();

			// Zaten silinmiş olanlara yeni HLC yazmayız: `_deleted` kayıtlar
			// zaten tombstonedir, yeniden damgalamak gereksiz bildirim üretir.
			const updated = history.map((item) =>
				item._deleted
					? item
					: { ...item, _hlc: hlc, _deviceId: deviceId, _deleted: true },
			);

			await AsyncStorage.setItem(
				STORAGE_KEYS.WATCH_HISTORY,
				JSON.stringify(updated),
			);
			notifyStorageChange(STORAGE_KEYS.WATCH_HISTORY, []);
			return [];
		} catch (error) {
			console.error("İzleme geçmişi temizlenirken hata:", error);
			return [];
		}
	});
}

/**
 * Bölüm kaydı için kararlı anahtar üretir: "s{sezon}_e{bölüm}".
 *
 * ⚠️ NEDEN GEREKLİ: "Tamamlanan" sekmesindeki sayaç, izleme geçmişindeki
 * bölüm kayıtlarını bu anahtarla TEKİLLEŞTİRİR. Eski/kirli kayıtlarda
 * `season`/`episode` alanları eksik olabildiği için anahtar yalnızca
 * alanlara güvenemez; önce alanlar, sonra id/url içindeki `_s1_e2` kalıbı
 * denenir. (Kullanıcı: "Tamamlanan dizi bölümleri yanlış hesaplanıyor".)
 */
export function getEpisodeKey(item) {
	if (!item) return "";
	const s = Number(item.season);
	const e = Number(item.episode);
	if (Number.isFinite(s) && Number.isFinite(e) && s > 0 && e > 0) {
		return `s${s}_e${e}`;
	}
	const source = String(item.url || item.id || "");
	const fromId = source.match(/_s(\d+)_e(\d+)/i);
	if (fromId) return `s${Number(fromId[1])}_e${Number(fromId[2])}`;
	return source;
}

/**
 * Kitaplıktan kaldırılan (gizlenen) içerikleri getirir.
 *
 * Cihaz-yerel görünürlük listesidir; senkronize EDİLMEZ ve içerik verisi
 * içermez — yalnızca "bu içerik kitaplık sekmelerinde gösterilmesin" der.
 */
export async function getHiddenLibraryItems() {
	try {
		const data = await AsyncStorage.getItem(STORAGE_KEYS.LIBRARY_HIDDEN);
		if (!data) return [];
		const list = JSON.parse(data);
		return Array.isArray(list) ? list : [];
	} catch (error) {
		console.error("Gizlenen kitaplık kayıtları okunurken hata:", error);
		return [];
	}
}

/**
 * Gizleme kaydı ile içeriğin eşleşip eşleşmediğini belirler.
 * id/url kümesi kesişir ya da normalize başlıklar eşitse eşleşir.
 */
function hiddenMatches(hiddenRecord, item) {
	if (!hiddenRecord || !item) return false;

	const recordIds = [hiddenRecord.id, hiddenRecord.url]
		.filter(Boolean)
		.map(String);
	const itemIds = [item.id, item.url, item.seriesId, item.seriesUrl]
		.filter(Boolean)
		.map(String);
	if (recordIds.some((x) => itemIds.includes(x))) return true;

	const recordTitle = (hiddenRecord.title || "")
		.toString()
		.toLowerCase()
		.trim();
	if (!recordTitle) return false;
	const itemTitles = [item.title, item.seriesTitle]
		.filter(Boolean)
		.map((t) => t.toString().toLowerCase().trim());
	return itemTitles.includes(recordTitle);
}

/**
 * İçeriği kitaplık görünümünden gizler ("kitaplıktan kaldır").
 *
 * ⚠️ İzleme geçmişi/tamamlanma verisine DOKUNMAZ; yalnızca görünürlüğü
 * değiştirir. Aynı içerik yeniden bir listeye eklendiğinde
 * `unhideLibraryItem` kaydı kaldırır.
 */
export async function hideLibraryItem(item) {
	return mutate(STORAGE_KEYS.LIBRARY_HIDDEN, async () => {
		try {
			if (!item) return await getHiddenLibraryItems();

			const list = await getHiddenLibraryItems();
			const itemId = String(item.seriesId || item.id || item.url || "");
			const itemUrl = String(item.seriesUrl || item.url || item.id || "");
			const title = (item.seriesTitle || item.title || "")
				.toString()
				.toLowerCase()
				.trim();

			const record = {
				id: itemId || itemUrl,
				url: itemUrl || undefined,
				title: title || undefined,
				type: item.type || (item.season ? "episode" : undefined),
				hiddenAt: new Date().toISOString(),
			};

			const filtered = list.filter((h) => !hiddenMatches(h, item));
			const updated = [record, ...filtered].slice(0, 500);
			await AsyncStorage.setItem(
				STORAGE_KEYS.LIBRARY_HIDDEN,
				JSON.stringify(updated),
			);
			notifyStorageChange(STORAGE_KEYS.LIBRARY_HIDDEN, updated);
			return updated;
		} catch (error) {
			console.error("Kitaplıktan gizleme hatası:", error);
			return [];
		}
	});
}

/**
 * Gizleme kaydını kaldırır (içerik yeniden bir listeye eklendiğinde).
 */
export async function unhideLibraryItem(item) {
	return mutate(STORAGE_KEYS.LIBRARY_HIDDEN, async () => {
		try {
			if (!item) return await getHiddenLibraryItems();
			const list = await getHiddenLibraryItems();
			const filtered = list.filter((h) => !hiddenMatches(h, item));
			if (filtered.length === list.length) return list;
			await AsyncStorage.setItem(
				STORAGE_KEYS.LIBRARY_HIDDEN,
				JSON.stringify(filtered),
			);
			notifyStorageChange(STORAGE_KEYS.LIBRARY_HIDDEN, filtered);
			return filtered;
		} catch (error) {
			console.error("Gizleme kaydı kaldırılırken hata:", error);
			return [];
		}
	});
}

/**
 * Verilen gizleme listesine göre içeriğin gizli olup olmadığını döner.
 */
export function isLibraryHidden(hiddenList, item) {
	if (!Array.isArray(hiddenList) || !item) return false;
	return hiddenList.some((h) => hiddenMatches(h, item));
}

/**
 * Arama geçmişi belgesini ham hâliyle okur (normalize etmez).
 *
 * ⚠️ Bu fonksiyon `mutate()` içinden çağrılmak üzere vardır: iç içe `mutate`
 * çağrısı kuyruğu kilitler (`getSearchHistory` → `mutate` → tekrar
 * `getSearchHistory`). Yazma fonksiyonları bu yüzden ham okumayı kullanır.
 * @returns {Promise<unknown>} v2 belge, v1 dizi veya null
 */
async function readSearchHistoryDocRaw() {
	try {
		const data = await AsyncStorage.getItem(STORAGE_KEYS.SEARCH_HISTORY);
		return data ? JSON.parse(data) : null;
	} catch (error) {
		console.error("Arama geçmişi okunurken hata:", error);
		return null;
	}
}

/** İki kayıt listesi (q + time) birebir aynı mı? */
function isSameSearchEntries(a, b) {
	if (!Array.isArray(a) || !Array.isArray(b)) return false;
	if (a.length !== b.length) return false;
	return a.every((entry, index) => {
		const other = b[index];
		return (
			entry &&
			other &&
			typeof entry === "object" &&
			typeof other === "object" &&
			entry.q === other.q &&
			Number(entry.time) === Number(other.time)
		);
	});
}

/**
 * Disk üzerindeki belge, çözümlenmiş (resolved) belgeyle aynı mı?
 *
 * ⚠️ `JSON.stringify` karşılaştırması KULLANILMAZ: sunucu JSONB anahtarları
 * yeniden sıralayabilir. Sıralama farkı "değişti" sanılıp her pull'da yazma
 * ve push tetiklenirdi.
 */
function isSameSearchDoc(stored, resolved) {
	if (!stored || typeof stored !== "object" || Array.isArray(stored)) return false;
	if (!resolved) return false;
	if (Number(stored.clearedAt || 0) !== Number(resolved.clearedAt || 0)) return false;
	return (
		isSameSearchEntries(stored.items, resolved.items) &&
		isSameSearchEntries(stored.deleted, resolved.deleted)
	);
}

/**
 * Arama geçmişini getirir (görünen liste: en yeni önce) ve belgeyi kalıcı
 * olarak tutarlı hâle getirir.
 *
 * Her kayıt `{ q, time }`; `time` = sorgunun bu hesapta en son arandığı an.
 * Disk/sunucudaki belge `{ items, deleted, clearedAt }` taşır (bkz.
 * `merge/documents.js`): silme bilgisi ve "tümünü temizle" damgası olmadan
 * başka cihazdan gelen kopya silinen aramayı geri getiriyordu.
 *
 * Eski sürümün yazdığı düz metin liste de kabul edilir; ilk okumada
 * damgalanıp diske yazılır, böylece sunucuya da damgalı hâli gider.
 *
 * @returns {Promise<Array<{q: string, time: number}>>}
 */
export async function getSearchHistory() {
	try {
		const raw = await readSearchHistoryDocRaw();
		const resolved = resolveSearchDoc(raw);

		if (isSameSearchDoc(raw, resolved)) return resolved.items;

		// Kilit altında yeniden oku: bu arada bir arama eklenmiş olabilir.
		return await mutate(STORAGE_KEYS.SEARCH_HISTORY, async () => {
			const current = await readSearchHistoryDocRaw();
			const doc = resolveSearchDoc(current);
			if (!isSameSearchDoc(current, doc)) {
				await AsyncStorage.setItem(
					STORAGE_KEYS.SEARCH_HISTORY,
					JSON.stringify(doc),
				);
				notifyStorageChange(STORAGE_KEYS.SEARCH_HISTORY, doc);
			}
			return doc.items;
		});
	} catch (error) {
		console.error("Arama geçmişi okunurken hata:", error);
		return [];
	}
}

/**
 * Arama geçmişine yeni sorgu ekler (en fazla 20 adet)
 *
 * Sorguya ŞU AN damgası verilir; liste damgaya göre sıralanır. Aynı sorgu
 * daha önce silinmişse silme kaydı kaldırılır (yeni arama silmeden yenidir).
 */
export async function addToSearchHistory(query) {
	return mutate(STORAGE_KEYS.SEARCH_HISTORY, async () => {
		try {
			if (!query || !query.trim()) return [];
			const trimmed = query.trim();
			const key = trimmed.toLowerCase();
			const doc = resolveSearchDoc(await readSearchHistoryDocRaw());

			const updated = {
				...doc,
				items: capList(
					[
						{ q: trimmed, time: Date.now() },
						...doc.items.filter((item) => item.q.toLowerCase() !== key),
					],
					SIZE_CAPS.search_history || 20,
				),
				deleted: doc.deleted.filter((entry) => entry.q.toLowerCase() !== key),
			};

			await AsyncStorage.setItem(
				STORAGE_KEYS.SEARCH_HISTORY,
				JSON.stringify(updated),
			);
			notifyStorageChange(STORAGE_KEYS.SEARCH_HISTORY, updated);
			return updated.items;
		} catch (error) {
			console.error("Arama geçmişi kaydedilirken hata:", error);
			return [];
		}
	});
}

/**
 * Arama geçmişinden tek bir sorguyu siler.
 *
 * ⚠️ Öğeyi listeden çıkarmak YETMEZ: o öğe öteki cihazın listesinde durduğu
 * sürece bir sonraki birleştirmede geri gelir (kullanıcı bildirimi: "sildiğim
 * arama tekrar geliyor"). Bu yüzden silme, damgalı bir SİLME KAYDI olarak da
 * yazılır; birleştirme silme kaydını kaydı bastırır.
 */
export async function removeFromSearchHistory(query) {
	return mutate(STORAGE_KEYS.SEARCH_HISTORY, async () => {
		try {
			const trimmed = String(query || "").trim();
			if (!trimmed) return [];
			const key = trimmed.toLowerCase();
			const doc = resolveSearchDoc(await readSearchHistoryDocRaw());

			const updated = {
				...doc,
				items: doc.items.filter((item) => item.q.toLowerCase() !== key),
				deleted: capList(
					[
						{ q: trimmed, time: Date.now() },
						...doc.deleted.filter((entry) => entry.q.toLowerCase() !== key),
					],
					SIZE_CAPS.search_history_deleted || 50,
				),
			};

			await AsyncStorage.setItem(
				STORAGE_KEYS.SEARCH_HISTORY,
				JSON.stringify(updated),
			);
			notifyStorageChange(STORAGE_KEYS.SEARCH_HISTORY, updated);
			return updated.items;
		} catch (error) {
			console.error("Arama geçmişinden silinirken hata:", error);
			return [];
		}
	});
}

/**
 * Arama geçmişini temizler
 */
export async function clearSearchHistory() {
	return mutate(STORAGE_KEYS.SEARCH_HISTORY, async () => {
		try {
			// ⚠️ `removeItem` KULLANILMAZ. Anahtarı silersek
			// `collectLocalPushData()` grubu "diskte yok" diye ATLAR, boş liste
			// sunucuya hiç gitmez ve bir sonraki pull'da SİLİNEN ARAMALAR
			// hesaptan geri gelir.
			//
			// ⚠️ Boş DİZİ de YETMEZ: birleştirme boş listeyi "hiç kayıt yok"
			// sayıp sunucudaki/öteki cihazdaki kayıtları geri getiriyordu
			// (kullanıcı: "bir cihazda sildiğim aramalar diğer cihazı açınca
			// geri geliyor"). Temizleme, TÜM kayıtları düşüren bir damga
			// (`clearedAt`) olarak taşınır; öteki cihazlar da bu damgayı alır.
			const cleared = resolveSearchDoc({
				items: [],
				deleted: [],
				clearedAt: Date.now(),
			});
			await AsyncStorage.setItem(
				STORAGE_KEYS.SEARCH_HISTORY,
				JSON.stringify(cleared),
			);
			notifyStorageChange(STORAGE_KEYS.SEARCH_HISTORY, cleared);
			return [];
		} catch (error) {
			console.error("Arama geçmişi temizlenirken hata:", error);
			return [];
		}
	});
}

/**
 * Video oynatıcı ve altyazı ayarlarını getirir
 */
export async function getPlayerSettings() {
	try {
		const data = await AsyncStorage.getItem(STORAGE_KEYS.PLAYER_SETTINGS);
		if (data) {
			return { ...DEFAULT_PLAYER_SETTINGS, ...JSON.parse(data) };
		}

		// İlk okumada varsayılanları DİSKE YAZ.
		//
		// Yazmazsak `collectLocalPushData()` bu anahtarı bulamaz, push boş
		// gider ve hesapta hiçbir oynatıcı ayarı olmaz. Kullanıcı hiçbir ayara
		// dokunmamış olsa bile hesapta bir taban değer bulunmalıdır; aksi halde
		// yeni bir cihazda ayarlar "hiç tanımsız" olarak görünür.
		await AsyncStorage.setItem(
			STORAGE_KEYS.PLAYER_SETTINGS,
			JSON.stringify(DEFAULT_PLAYER_SETTINGS),
		);
		return DEFAULT_PLAYER_SETTINGS;
	} catch (error) {
		console.error("Player ayarları okunurken hata:", error);
		return DEFAULT_PLAYER_SETTINGS;
	}
}

/**
 * Video oynatıcı ve altyazı ayarlarını günceller
 */
export async function savePlayerSettings(updates) {
	return mutate(STORAGE_KEYS.PLAYER_SETTINGS, async () => {
		try {
			const current = await getPlayerSettings();
			const updated = {
				...current,
				...updates,
			};
			await AsyncStorage.setItem(
				STORAGE_KEYS.PLAYER_SETTINGS,
				JSON.stringify(updated),
			);
			notifyStorageChange(STORAGE_KEYS.PLAYER_SETTINGS, updated);
			return updated;
		} catch (error) {
			console.error("Player ayarları kaydedilirken hata:", error);
			throw error;
		}
	});
}

/**
 * Video oynatıcı ayarlarını varsayılana sıfırlar
 */
export async function resetPlayerSettings() {
	return mutate(STORAGE_KEYS.PLAYER_SETTINGS, async () => {
		try {
			await AsyncStorage.setItem(
				STORAGE_KEYS.PLAYER_SETTINGS,
				JSON.stringify(DEFAULT_PLAYER_SETTINGS),
			);
			notifyStorageChange(STORAGE_KEYS.PLAYER_SETTINGS, DEFAULT_PLAYER_SETTINGS);
			return DEFAULT_PLAYER_SETTINGS;
		} catch (error) {
			console.error("Player ayarları sıfırlanırken hata:", error);
			return DEFAULT_PLAYER_SETTINGS;
		}
	});
}

/**
 * Son seçilen platform/eklenti bilgisini getirir
 */
export async function getSelectedPlatform() {
	try {
		const data = await AsyncStorage.getItem(STORAGE_KEYS.SELECTED_PLATFORM);
		return data ? JSON.parse(data) : null;
	} catch (error) {
		console.error("Seçili platform okunurken hata:", error);
		return null;
	}
}

/**
 * Seçilen platform/eklentiyi kaydeder
 */
export async function saveSelectedPlatform(platform) {
	return mutate(STORAGE_KEYS.SELECTED_PLATFORM, async () => {
		try {
			if (!platform) {
				await AsyncStorage.removeItem(STORAGE_KEYS.SELECTED_PLATFORM);
				notifyStorageChange(STORAGE_KEYS.SELECTED_PLATFORM, null);
				return null;
			}
			await AsyncStorage.setItem(
				STORAGE_KEYS.SELECTED_PLATFORM,
				JSON.stringify(platform),
			);
			notifyStorageChange(STORAGE_KEYS.SELECTED_PLATFORM, platform);
			return platform;
		} catch (error) {
			console.error("Seçili platform kaydedilirken hata:", error);
			throw error;
		}
	});
}

/**
 * İndirilen içerikleri getirir
 */
export async function getDownloads() {
	try {
		const data = await AsyncStorage.getItem(STORAGE_KEYS.DOWNLOADS);
		return data ? JSON.parse(data) : [];
	} catch (error) {
		console.error("İndirilenler okunurken hata:", error);
		return [];
	}
}

/**
 * İndirilen içeriği kaydeder/günceller (en fazla 200 adet)
 */
export async function saveDownloadItem(item) {
	return mutate(STORAGE_KEYS.DOWNLOADS, async () => {
		try {
			const list = await getDownloads();
			const filtered = list.filter((i) => i.id !== item.id);
			const updated = [item, ...filtered].slice(0, SIZE_CAPS.downloads || 200);
			await AsyncStorage.setItem(
				STORAGE_KEYS.DOWNLOADS,
				JSON.stringify(updated),
			);
			notifyStorageChange(STORAGE_KEYS.DOWNLOADS, updated);
			return updated;
		} catch (error) {
			console.error("İndirme kaydedilirken hata:", error);
			throw error;
		}
	});
}

/**
 * İndirilen içeriği siler
 */
export async function deleteDownloadItem(itemId) {
	return mutate(STORAGE_KEYS.DOWNLOADS, async () => {
		try {
			const list = await getDownloads();
			const updated = list.filter((i) => i.id !== itemId);
			await AsyncStorage.setItem(
				STORAGE_KEYS.DOWNLOADS,
				JSON.stringify(updated),
			);
			notifyStorageChange(STORAGE_KEYS.DOWNLOADS, updated);
			return updated;
		} catch (error) {
			console.error("İndirme silinirken hata:", error);
			throw error;
		}
	});
}

/**
 * Kaldığın yerden devam et listesini getirir (en son izlenen üstte)
 */
export async function getContinueWatching() {
	try {
		const data = await AsyncStorage.getItem(STORAGE_KEYS.CONTINUE_WATCHING);
		if (!data) return [];
		const list = JSON.parse(data);
		if (!Array.isArray(list)) return [];
		return list
			.filter((i) => !i._deleted)
			.sort(
				(a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0),
			);
	} catch (error) {
		console.error("Kaldığın yerden devam et listesi okunurken hata:", error);
		return [];
	}
}

/**
 * Kaldığın yerden devam et verisini kaydeder
 * - currentTime < 10 ise threshold altı olduğu için kaydetmez
 * - `completed === true` ise listeden kaldırır (tamamlama kararı
 *   `useWatchProgress`'e aittir; burada YENİDEN karar verilmez)
 * - Aksi halde en başa ekler veya günceller (en fazla 50 kayıt)
 *
 * ⚠️ ESKİ DAVRANIŞ BURADA `progress >= 0.9` idi ve kaydı SİLİYORDU.
 * Bu, oynatıcının "izlenen süre" kontrolünü DEĞERSİZ kılıyordu: içerik
 * tamamlanmamış olsa bile %90'a gelen kayıt listeden kayboluyordu ve
 * kullanıcı "kaldığın yerden devam et" listesinde kaybolmuş içerik görüyordu
 * (kullanıcı şikâyeti: "bazen kaldığın yeri doğru kaydetmiyor").
 *
 * YENİ KURAL: bu fonksiyon SADECE KAYDETME yapar. Tamamlama kararı tek
 * yerden (`useWatchProgress.genuinelyWatched`) gelir ve `completed` bayrağı
 * ile bildirilir. İki katmanın kendi eşiği olması, tutarsızlığın kaynağıydı.
 */
export async function saveContinueWatching(item) {
	return mutate(STORAGE_KEYS.CONTINUE_WATCHING, async () => {
		try {
			if (!item || !item.id) return [];

			// Threshold kontrolü: 10 saniyeden az izlendiyse kaydetme
			if ((item.currentTime || 0) < 10) {
				return await getContinueWatching();
			}

			// Açıkça "tamamlandı" bildirildiyse listeden kaldır.
			if (item.completed === true) {
				return await removeContinueWatching(item.id);
			}

			const duration = item.duration || 0;
			const progress =
				duration > 0 ? item.currentTime / duration : item.progress || 0;

			const raw = await AsyncStorage.getItem(STORAGE_KEYS.CONTINUE_WATCHING);
			const currentList = raw ? JSON.parse(raw) : [];
			const filtered = currentList.filter((i) => i.id !== item.id && i.url !== item.id);

			const deviceId = await getDeviceId();
			const hlc = getHlcNow();

			const updatedItem = {
				...filterPayload(item),
				id: item.id,
				progress,
				_hlc: hlc,
				_deviceId: deviceId,
				_deleted: false,
				updatedAt: new Date().toISOString(),
			};

			const newList = [updatedItem, ...filtered].slice(0, SIZE_CAPS.continue_watching || 50);
			await AsyncStorage.setItem(
				STORAGE_KEYS.CONTINUE_WATCHING,
				JSON.stringify(newList),
			);
			notifyStorageChange(STORAGE_KEYS.CONTINUE_WATCHING, newList.filter((i) => !i._deleted));

			// İzlenmeye başlandığı için Planlanan (Watchlist) listesinden otomatik kaldır
			await removeFromWatchlist(item);

			return newList.filter((i) => !i._deleted);
		} catch (error) {
			console.error("Kaldığın yerden devam et kaydedilirken hata:", error);
			return [];
		}
	});
}

/**
 * İçeriği devam et listesinden siler (tombstone desteği ile)
 */
export async function removeContinueWatching(target) {
	return mutate(STORAGE_KEYS.CONTINUE_WATCHING, async () => {
		try {
			if (!target) return [];
			const targetId = typeof target === "object" ? (target.id || target.url) : target;
			const targetUrl = typeof target === "object" ? target.url : null;
			const raw = await AsyncStorage.getItem(STORAGE_KEYS.CONTINUE_WATCHING);
			const currentList = raw ? JSON.parse(raw) : [];

			const deviceId = await getDeviceId();
			const hlc = getHlcNow();

			const updated = currentList.map((i) => {
				const isMatch =
					(targetId && (i.id === targetId || i.url === targetId)) ||
					(targetUrl && (i.id === targetUrl || i.url === targetUrl));
				if (isMatch) {
					return {
						...i,
						_hlc: hlc,
						_deviceId: deviceId,
						_deleted: true,
					};
				}
				return i;
			});

			await AsyncStorage.setItem(
				STORAGE_KEYS.CONTINUE_WATCHING,
				JSON.stringify(updated),
			);
			const activeList = updated.filter((i) => !i._deleted);
			notifyStorageChange(STORAGE_KEYS.CONTINUE_WATCHING, activeList);
			return activeList;
		} catch (error) {
			console.error("Kaldığın yerden devam et silinirken hata:", error);
			return [];
		}
	});
}

/**
 * Kayıtlı dizi toplam bölüm sayıları haritasını döndürür
 */
export async function getSeriesTotalEpisodesMap() {
	try {
		const data = await AsyncStorage.getItem(STORAGE_KEYS.SERIES_TOTAL_EPISODES);
		return data ? JSON.parse(data) : {};
	} catch (_error) {
		return {};
	}
}

/**
 * Belirli bir dizi için toplam bölüm sayısını kaydeder
 */
export async function saveSeriesTotalEpisodes(seriesKey, totalCount) {
	try {
		if (!seriesKey || !totalCount || Number(totalCount) <= 0) return;
		const map = await getSeriesTotalEpisodesMap();
		const key = String(seriesKey).toLowerCase().trim();
		map[key] = Number(totalCount);
		await AsyncStorage.setItem(
			STORAGE_KEYS.SERIES_TOTAL_EPISODES,
			JSON.stringify(map),
		);
	} catch (error) {
		console.error("saveSeriesTotalEpisodes hata:", error);
	}
}

/**
 * Belirli bir dizinin toplam bölüm sayısını getirir
 */
export async function getSeriesTotalEpisodes(seriesKey) {
	try {
		if (!seriesKey) return 0;
		const map = await getSeriesTotalEpisodesMap();
		const key = String(seriesKey).toLowerCase().trim();
		return map[key] || 0;
	} catch (_error) {
		return 0;
	}
}

/**
 * Bölüm tamamlandığında:
 * 1. Tamamlanan bölümü WATCH_HISTORY'e kaydeder
 * 2. Devam et listesinden mevcut bölümü siler
 * 3. Eğer sonraki bölüm varsa devam et listesine 0 saniye ile ekler
 */
export async function markEpisodeComplete(
	seriesId,
	season,
	episode,
	nextEpisode,
	currentItem = {},
) {
	try {
		const sNum = Number(season) || season;
		const epNum = Number(episode) || episode;
		const epKey = `s${sNum}_e${epNum}`;

		// 1. Önce mevcut bölümü devam et listesinden kaldır
		if (currentItem?.id) {
			await removeContinueWatching(currentItem.id);
		}
		if (currentItem?.url) {
			await removeContinueWatching(currentItem.url);
		}
		if (seriesId) {
			await removeContinueWatching(`${seriesId}_${epKey}`);
		}

		// Episode unique id: Kesinlikle dizi id'si olmamalıdır!
		const epUniqueId =
			currentItem?.id &&
			currentItem.id !== seriesId &&
			currentItem.id !== currentItem.seriesId
				? currentItem.id
				: currentItem?.url ||
					`${seriesId || currentItem?.seriesId || "series"}_${epKey}`;

		const totalEpCount =
			currentItem.totalEpisodes ||
			currentItem.totalEpisodesCount ||
			(await getSeriesTotalEpisodes(seriesId || currentItem.seriesTitle)) ||
			undefined;

		// 2. Tamamlanan bölümü WATCH_HISTORY'e ekle
		const completedEpisodeItem = {
			id: epUniqueId,
			title: currentItem.seriesTitle || currentItem.title || "Dizi",
			seriesTitle: currentItem.seriesTitle || currentItem.title || "Dizi",
			seriesId: seriesId || currentItem.seriesId,
			seriesUrl: currentItem.seriesUrl,
			plugin: currentItem.plugin,
			season: sNum,
			episode: epNum,
			episodeTitle: currentItem.episodeTitle || `Bölüm ${epNum}`,
			poster: currentItem.poster,
			url: currentItem.url,
			type: "episode",
			isCompleted: true,
			progress: 1.0,
			totalEpisodes: totalEpCount,
			watchedAt: new Date().toISOString(),
		};
		await addToWatchHistory(completedEpisodeItem);

		// Dizi veya bölüm Planlanan (Watchlist) listesinde kalmışsa oradan temizle
		await removeFromWatchlist(currentItem);
		if (seriesId) await removeFromWatchlist(seriesId);

		if (totalEpCount && (seriesId || currentItem.seriesTitle)) {
			await saveSeriesTotalEpisodes(
				seriesId || currentItem.seriesTitle,
				totalEpCount,
			);
		}

		// 3. Sonraki bölümü tespit et (eğer nextEpisode gelmediyse veya url'i yoksa eklentiden otomatik çek)
		let targetNextEpisode = nextEpisode;
		if (
			(!targetNextEpisode ||
				(!targetNextEpisode.url && !targetNextEpisode.id)) &&
			(currentItem?.seriesUrl || currentItem?.url || seriesId)
		) {
			const sUrl =
				currentItem.seriesUrl ||
				(String(seriesId).startsWith("http") ? seriesId : null) ||
				(String(currentItem.url).includes("/dizi/")
					? currentItem.url
					: null);
			const pName =
				currentItem.plugin ||
				(await getSelectedPlatform())?.name ||
				"hdfilmcehennemi";

			if (sUrl && pName) {
				try {
					const { fetchPluginDetail } = await import(
						"@/services/api"
					);
					const detail = await fetchPluginDetail(pName, sUrl);
					const seasons = detail?.seasons;
					if (seasons && typeof seasons === "object") {
						const currEpList =
							seasons[String(sNum)] || seasons[sNum] || [];
						if (Array.isArray(currEpList)) {
							const idx = currEpList.findIndex(
								(e) =>
									Number(e.episode || e.episode_number) ===
									epNum,
							);
							if (idx !== -1 && idx + 1 < currEpList.length) {
								const nextObj = currEpList[idx + 1];
								targetNextEpisode = {
									id: nextObj.id || nextObj.url,
									url: nextObj.url,
									title: nextObj.title,
									season: sNum,
									episode: Number(
										nextObj.episode ||
											nextObj.episode_number ||
											epNum + 1,
									),
									poster:
										nextObj.poster || currentItem.poster,
								};
							} else {
								const nextSeasonKey = String(sNum + 1);
								const nextSeasonList = seasons[nextSeasonKey];
								if (
									Array.isArray(nextSeasonList) &&
									nextSeasonList.length > 0
								) {
									const nextObj = nextSeasonList[0];
									targetNextEpisode = {
										id: nextObj.id || nextObj.url,
										url: nextObj.url,
										title: nextObj.title,
										season: sNum + 1,
										episode: Number(
											nextObj.episode ||
												nextObj.episode_number ||
												1,
										),
										poster:
											nextObj.poster ||
											currentItem.poster,
									};
								}
							}
						}
					}
				} catch (fetchErr) {
					console.warn(
						"markEpisodeComplete otomatik sonraki bölüm hatası:",
						fetchErr,
					);
				}
			}
		}

		// 4. Eğer sonraki bölüm varsa devam et listesine 0 saniye ile ekle
		if (
			targetNextEpisode &&
			(targetNextEpisode.id || targetNextEpisode.url)
		) {
			const nextS = Number(targetNextEpisode.season || season);
			const nextE = Number(
				targetNextEpisode.episode || (epNum ? epNum + 1 : 1),
			);
			const nextItem = {
				id:
					targetNextEpisode.id ||
					targetNextEpisode.url ||
					`${seriesId || currentItem?.seriesId || "series"}_s${nextS}_e${nextE}`,
				title: currentItem.seriesTitle || currentItem.title || "Dizi",
				poster: targetNextEpisode.poster || currentItem.poster,
				type: "episode",
				currentTime: 0,
				duration: targetNextEpisode.duration || 0,
				progress: 0,
				seriesId: seriesId || currentItem.seriesId,
				seriesTitle: currentItem.seriesTitle || currentItem.title,
				seriesUrl: currentItem.seriesUrl,
				plugin: currentItem.plugin,
				season: nextS,
				episode: nextE,
				episodeTitle:
					targetNextEpisode.title ||
					targetNextEpisode.episodeTitle ||
					`Bölüm ${nextE}`,
				url: targetNextEpisode.url,
				totalEpisodes: totalEpCount,
				updatedAt: new Date().toISOString(),
			};

			/*
			 * ⚠️ SORUN 10 — `mutate` ATLANIYORDU.
			 *
			 * Bu blok `AsyncStorage.setItem` ile DOĞRUDAN yazıyordu.
			 * Oysa aynı anahtarın (`CONTINUE_WATCHING`) tüm diğer
			 * yazmaları `mutate` kuyruğundan geçiyor. Aradaki fark
			 * sonucu DEĞİŞTİRİR:
			 *
			 *   1. YARIŞ: yukarıdaki `fetchPluginDetail` ağ çağrısı
			 *      saniyeler sürebilir. O sırada `handleProgress` çalışıp
			 *      `saveContinueWatching` yazar. Bu blok, o yazmadan
			 *      ÖNCE okuduğu bayat listeyi üzerine yazar → kullanıcının
			 *      o anki ilerlemesi ve yeni bölüm kaydı SİLİNİR. Bu,
			 *      "yeni bölüm kaldığın yerden devam et'e otomatik gelmiyor"
			 *      şikâyetinin kaynağıdır.
			 *
			 *   2. SENKRON METADATA KAYBI: `getContinueWatching` `_deleted`
			 *      kayıtları filtreler; doğrudan `setItem` ile geri yazmak
			 *      diskte hâlâ duran silinmiş kayıtları FİZİKSEL olarak da
			 *      siler ve kalan kayıtların `_hlc` / `_deviceId`
			 *      (senkron işaretleri) alanlarını düşürür.
			 *
			 * Çözüm: yazma `mutate` içine alınır ve mevcut kayıtların
			 * senkron alanları korunur.
			 */
			return await mutate(STORAGE_KEYS.CONTINUE_WATCHING, async () => {
				const raw = await AsyncStorage.getItem(
					STORAGE_KEYS.CONTINUE_WATCHING,
				);
				const stored = raw ? JSON.parse(raw) : [];
				const visible = Array.isArray(stored) ? stored : [];

				const deviceId = await getDeviceId();
				const hlc = getHlcNow();

				// Yeni bölüm: senkron işaretleriyle birlikte yazılır.
				const newItem = {
					...nextItem,
					_hlc: hlc,
					_deviceId: deviceId,
					_deleted: false,
				};

				const filtered = visible.filter(
					(i) => i.id !== nextItem.id && i.url !== nextItem.url,
				);
				const newList = [newItem, ...filtered].slice(
					0,
					SIZE_CAPS.continue_watching || 50,
				);
				await AsyncStorage.setItem(
					STORAGE_KEYS.CONTINUE_WATCHING,
					JSON.stringify(newList),
				);
				notifyStorageChange(
					STORAGE_KEYS.CONTINUE_WATCHING,
					newList.filter((i) => !i._deleted),
				);
				return newList;
			});
		}

		return await getContinueWatching();
	} catch (error) {
		console.error("markEpisodeComplete hata:", error);
		return [];
	}
}

/**
 * İçeriği (film veya diziyi) doğrudan tamamlandı olarak işaretler ve geçmişe ekler
 */
export async function markContentCompleted(item) {
	try {
		if (!item) return;
		const itemId = item.id || item.url;
		if (itemId) {
			await removeContinueWatching(itemId);
		}
		if (item.url) {
			await removeContinueWatching(item.url);
		}
		const completedItem = {
			...item,
			id: itemId,
			isCompleted: true,
			progress: 1.0,
			watchedAt: new Date().toISOString(),
		};
		await addToWatchHistory(completedItem);
		return completedItem;
	} catch (error) {
		console.error("markContentCompleted hata:", error);
	}
}

/**
 * "Kaldığın yerden devam et" kaydını eşik kontrolünü ATLAYARAK yazar.
 *
 * `saveContinueWatching` 10 saniye eşiği yüzünden 0. saniyeyi kaydetmez;
 * `markEpisodeComplete` de aynı nedenle doğrudan `mutate` kullanır
 * (bkz. SORUN 10 yorumu). Bu yardımcı aynı kalıbı yeniden kullanılabilir
 * hale getirir.
 */
async function seedContinueWatching(item) {
	return mutate(STORAGE_KEYS.CONTINUE_WATCHING, async () => {
		const raw = await AsyncStorage.getItem(STORAGE_KEYS.CONTINUE_WATCHING);
		const stored = raw ? JSON.parse(raw) : [];
		const visible = Array.isArray(stored) ? stored : [];

		const deviceId = await getDeviceId();
		const hlc = getHlcNow();

		const newItem = {
			...filterPayload(item),
			id: item.id,
			currentTime: item.currentTime || 0,
			progress: item.progress || 0,
			updatedAt: new Date().toISOString(),
			_hlc: hlc,
			_deviceId: deviceId,
			_deleted: false,
		};

		const filtered = visible.filter(
			(i) => i.id !== newItem.id && i.url !== newItem.id,
		);
		const newList = [newItem, ...filtered].slice(
			0,
			SIZE_CAPS.continue_watching || 50,
		);
		await AsyncStorage.setItem(
			STORAGE_KEYS.CONTINUE_WATCHING,
			JSON.stringify(newList),
		);
		notifyStorageChange(
			STORAGE_KEYS.CONTINUE_WATCHING,
			newList.filter((i) => !i._deleted),
		);
		return newList;
	});
}

/**
 * Bölüm(ler)i manuel olarak "İzlendi" işaretler (sezon/kısmi seçim).
 *
 * - Her bölüm için izleme geçmişine `isCompleted` kaydı yazar (hesaba
 *   senkronlanır, cihazlar arası taşınır),
 * - Bu bölümler "Kaldığın yerden devam et" listesinden çıkarılır,
 * - `options.nextEpisode` verilirse ve dizinin devam kaydı işaretlenen
 *   bölümlerden birindeyse, devam kaydı sonraki bölüme taşınır
 *   (`markEpisodeComplete` ile aynı davranış).
 *
 * ⚠️ Kitaplık gizleme kaydına DOKUNMAZ: gizleme kullanıcının açık liste
 * tercihidir (bkz. `hideLibraryItem`); yalnızca bir listeye yeniden
 * ekleme (`setContentLibraryList`) kaldırır.
 *
 * @param {Object} content - Dizi detay objesi (id/url/title/poster/plugin)
 * @param {Array<{season:number|string, episode:number|string, title?:string, url?:string, id?:string, poster?:string}>} marks
 * @param {{nextEpisode?: Object}} [options]
 * @returns {Promise<number>} İşaretlenen bölüm sayısı
 */
export async function markEpisodesWatched(content, marks = [], options = {}) {
	const list = (marks || []).filter((m) => m && m.episode != null);
	if (!list.length) return 0;

	const seriesId = content?.id || content?.url || content?.seriesId;
	const seriesTitle = content?.title || content?.seriesTitle || "Dizi";
	const plugin = content?.plugin;
	const poster = content?.poster_url || content?.poster || content?.image;

	// Devam kaydı düzeltmesi için işaretlemeden ÖNCEki durum gerekir
	// (işaretlenen bölüm aşağıda devam listesinden çıkarılacağı için).
	const continueBefore = await getContinueWatching();

	let applied = 0;
	for (const m of list) {
		const sNum = Number(m.season) || m.season || 1;
		const epNum = Number(m.episode) || m.episode;
		const epKey = `s${sNum}_e${epNum}`;

		const entry = {
			id:
				m.id && m.id !== seriesId
					? m.id
					: m.url || `${seriesId || seriesTitle}_${epKey}`,
			title: seriesTitle,
			seriesTitle,
			seriesId,
			plugin,
			season: sNum,
			episode: epNum,
			episodeTitle: m.title || `Bölüm ${epNum}`,
			poster: m.poster || poster,
			url: m.url,
			type: "episode",
			isCompleted: true,
			progress: 1.0,
			watchedAt: new Date().toISOString(),
		};
		await addToWatchHistory(entry);

		// Bu bölüm "devam et"te duruyorsa çıkar (id ve url birlikte denenir).
		if (m.url || m.id) {
			await removeContinueWatching({ id: m.id || m.url, url: m.url });
		}
		applied += 1;
	}

	// Devam kaydı işaretlenen bölümlerden birindeyse sonraki bölüme taşı.
	try {
		const titleLower = (seriesTitle || "").toLowerCase().trim();
		const current = continueBefore.find((i) => {
			if (seriesId && (i.seriesId === seriesId || i.id === seriesId))
				return true;
			const t = (i.seriesTitle || i.title || "").toLowerCase().trim();
			return Boolean(titleLower && t === titleLower);
		});
		const currentIsMarked =
			current &&
			list.some(
				(m) =>
					Number(m.season) === Number(current.season) &&
					Number(m.episode) === Number(current.episode),
			);

		// Dizi listeye "İzleniyor" olarak eklendiğinde (bölüm oynatılmadan)
		// devam kaydı episodesuz yazılır. Kullanıcı bölümleri izlendi
		// işaretlediğinde bu kayıt ilerlemez ve devam kartı "1. dakika"
		// göstermeye devam eder. Kayıt episodesuzsa da sonraki bölüme
		// taşınmalı — aksi halde işaretlemeye rağmen devam işaretçisi
		// eski yerde kalır.
		const currentIsEpisodeLess =
			Boolean(current) &&
			current.season == null &&
			current.episode == null &&
			!currentIsMarked;

		if (current && (currentIsMarked || currentIsEpisodeLess)) {
			const currentTarget = current.id || current.url;
			const next = options?.nextEpisode;
			// Tohum planı yoksa episodesuz kayıt KORUNUR — devam
			// işaretçisi kaybolmasın. İşaretli bölüm kaydı işaretleme
			// sonrası anlamsızdır, tohum planı olmasa da çıkarılır.
			const shouldRemove =
				currentTarget && (currentIsMarked || Boolean(next));
			if (shouldRemove) {
				await removeContinueWatching(currentTarget);
			}
			if (next && (next.url || next.id)) {
				await seedContinueWatching({
					type: "episode",
					id: next.id || next.url,
					title: seriesTitle,
					poster: next.poster || poster,
					plugin,
					seriesId,
					seriesTitle,
					season: next.season,
					episode: next.episode,
					episodeTitle: next.title || `Bölüm ${next.episode}`,
					url: next.url,
					currentTime: 0,
					progress: 0,
				});
			}
		}
	} catch (error) {
		console.warn("Devam kaydı güncellenirken hata:", error);
	}

	return applied;
}

/**
 * Bölüm(ler)in "İzlendi" işaretini kaldırır.
 *
 * Yalnızca işaret kümesindeki bölümleri tombstone'lar (senkron uyumlu):
 * eşleşme sırası; sezon+bölüm numarası, url, id. Ayrıca dizi seviyesindeki
 * "tamamlandı" beyanı da düşürülür — aksi halde kitaplık "N/N" göstermeye
 * devam ederdi (§ gruplama `seriesLevelCompleted`).
 *
 * ⚠️ Seriye ait DİĞER bölümlerin işaretleri korunur (kullanıcı yalnızca
 * seçtiği bölümleri kaldırır).
 *
 * @returns {Promise<Array>} Tombstone sonrası aktif izleme geçmişi
 */
export async function unmarkEpisodesWatched(content, marks = []) {
	const list = (marks || []).filter((m) => m && m.episode != null);
	if (!list.length) return await getWatchHistory();

	return mutate(STORAGE_KEYS.WATCH_HISTORY, async () => {
		try {
			const raw = await AsyncStorage.getItem(STORAGE_KEYS.WATCH_HISTORY);
			const history = raw ? JSON.parse(raw) : [];
			if (!Array.isArray(history) || history.length === 0) return [];

			const seriesId = content?.id || content?.url || content?.seriesId;
			const titleLower = (content?.title || content?.seriesTitle || "")
				.toLowerCase()
				.trim();

			// İşaret kümesi: `s_e` anahtarı + url + id
			const wantedKeys = new Set();
			list.forEach((m) => {
				const s = Number(m.season);
				const e = Number(m.episode);
				if (Number.isFinite(s) && Number.isFinite(e)) {
					wantedKeys.add(`s${s}_e${e}`);
				}
				if (m.url) wantedKeys.add(`url:${m.url}`);
				if (m.id) wantedKeys.add(`id:${m.id}`);
			});

			const deviceId = await getDeviceId();
			const hlc = getHlcNow();
			let changed = 0;

			const updated = history.map((item) => {
				if (!item || item._deleted) return item;

				const matchesSeries =
					(seriesId &&
						(item.seriesId === seriesId || item.id === seriesId)) ||
					(titleLower &&
						(item.seriesTitle || "").toLowerCase().trim() ===
							titleLower) ||
					(titleLower &&
						(item.title || "").toLowerCase().trim() === titleLower);
				if (!matchesSeries) return item;

				const isEpisode =
					item.type === "episode" ||
					Boolean(item.season && item.episode);

				if (!isEpisode) {
					// Dizi seviyesi "tamamlandı" beyanı bölüm işareti
					// kaldırılınca geçersizdir; film kayıtlarına dokunulmaz.
					if (item.type === "series") {
						changed += 1;
						return {
							...item,
							_hlc: hlc,
							_deviceId: deviceId,
							_deleted: true,
						};
					}
					return item;
				}

				const s = Number(item.season);
				const e = Number(item.episode);
				const hits =
					(Number.isFinite(s) &&
						Number.isFinite(e) &&
						wantedKeys.has(`s${s}_e${e}`)) ||
					(item.url && wantedKeys.has(`url:${item.url}`)) ||
					(item.id && wantedKeys.has(`id:${item.id}`));
				if (!hits) return item;

				changed += 1;
				return {
					...item,
					_hlc: hlc,
					_deviceId: deviceId,
					_deleted: true,
				};
			});

			if (changed > 0) {
				await AsyncStorage.setItem(
					STORAGE_KEYS.WATCH_HISTORY,
					JSON.stringify(updated),
				);
				notifyStorageChange(
					STORAGE_KEYS.WATCH_HISTORY,
					updated.filter((i) => !i._deleted),
				);
			}
			return updated.filter((i) => !i._deleted);
		} catch (error) {
			console.error("Bölüm 'izlendi' işareti kaldırılırken hata:", error);
			return [];
		}
	});
}

/**
 * Bir filmin veya dizinin genel izleme durumunu (kaldığı yer, süre veya tamamlandı bilgisi) döndürür
 * @param {Object} content - Film veya Dizi detay objesi
 * @returns {Promise<{status: 'not_started'|'in_progress'|'completed', ...}>}
 */
export async function getContentWatchProgress(content) {
	try {
		if (!content) return { status: "not_started" };
		const contentId = content.id;
		const contentUrl = content.url;
		const contentTitle = (content.title || content.name || "").toLowerCase().trim();
		const isSeries = Boolean(
			content.content_type === "series" ||
			content.is_series ||
			content.seasons ||
			content.episodes
		);

		const [continueList, watchHistory] = await Promise.all([
			getContinueWatching(),
			getWatchHistory(),
		]);

		if (isSeries) {
			// 1. Dizi için devam eden bölüm var mı kontrol et
			const continueEpisode = continueList.find((item) => {
				if (item.seriesId && (item.seriesId === contentId || item.seriesId === contentUrl)) return true;
				if (item.id && (item.id === contentId || item.id === contentUrl)) return true;
				if (contentTitle && item.seriesTitle && item.seriesTitle.toLowerCase().trim() === contentTitle) return true;
				if (contentTitle && item.title && item.title.toLowerCase().trim() === contentTitle) return true;
				return false;
			});

			if (continueEpisode) {
				return {
					status: "in_progress",
					continueItem: continueEpisode,
					season: continueEpisode.season,
					episode: continueEpisode.episode,
					episodeTitle: continueEpisode.episodeTitle,
					currentTime: continueEpisode.currentTime || 0,
					duration: continueEpisode.duration || 0,
					progress: continueEpisode.progress || 0,
					url: continueEpisode.url,
					updatedAt: continueEpisode.updatedAt || continueEpisode.watchedAt,
				};
			}

			// 2. Tamamlanan bölümleri topla
			const completedEpisodes = watchHistory.filter((item) => {
				const isComp = item.isCompleted || (item.progress && item.progress >= 0.9);
				if (!isComp) return false;
				const matches =
					(contentId && (item.seriesId === contentId || item.id === contentId)) ||
					(contentUrl && (item.seriesId === contentUrl || item.url === contentUrl)) ||
					(contentTitle && item.seriesTitle && item.seriesTitle.toLowerCase().trim() === contentTitle) ||
					(contentTitle && item.title && item.title.toLowerCase().trim() === contentTitle && item.type === "episode");
				return Boolean(matches);
			});

			if (completedEpisodes.length > 0) {
				// Toplam bölüm sayısını hesapla
				let totalEp = 0;
				if (content?.seasons && typeof content.seasons === "object" && !Array.isArray(content.seasons)) {
					totalEp = Object.values(content.seasons).reduce(
						(acc, list) => acc + (Array.isArray(list) ? list.length : 0),
						0,
					);
				}
				if (!totalEp && completedEpisodes[0]?.totalEpisodes) {
					totalEp = completedEpisodes[0].totalEpisodes;
				}

				// Eğer tüm bölümler bittiyse -> completed
				if (totalEp > 0 && completedEpisodes.length >= totalEp) {
					return {
						status: "completed",
						completedCount: completedEpisodes.length,
						totalEpisodes: totalEp,
						progress: 1.0,
					};
				}

				// Henüz tümü bitmedi ama tamamlanan bölümler var -> in_progress (son izlenen bölüm bilgisi)
				const latestWatched = [...completedEpisodes].sort(
					(a, b) =>
						new Date(b.watchedAt || 0).getTime() -
						new Date(a.watchedAt || 0).getTime(),
				)[0];

				return {
					status: "in_progress",
					hasCompletedEpisodes: true,
					completedCount: completedEpisodes.length,
					totalEpisodes: totalEp,
					season: latestWatched?.season,
					episode: latestWatched?.episode,
					episodeTitle: latestWatched?.episodeTitle,
					url: latestWatched?.url,
					currentTime: 0,
					progress: totalEp > 0 ? completedEpisodes.length / totalEp : 0,
				};
			}

			return { status: "not_started" };
		} else {
			// Film için
			const continueMovie = continueList.find((item) => {
				if (contentId && (item.id === contentId || item.url === contentId)) return true;
				if (contentUrl && (item.id === contentUrl || item.url === contentUrl)) return true;
				if (contentTitle && item.title && item.title.toLowerCase().trim() === contentTitle) return true;
				return false;
			});

			if (continueMovie && (continueMovie.currentTime || 0) >= 10) {
				return {
					status: "in_progress",
					continueItem: continueMovie,
					currentTime: continueMovie.currentTime,
					duration: continueMovie.duration,
					progress: continueMovie.progress,
					url: continueMovie.url,
					updatedAt: continueMovie.updatedAt || continueMovie.watchedAt,
				};
			}

			const completedMovie = watchHistory.find((item) => {
				const isComp = item.isCompleted || (item.progress && item.progress >= 0.9);
				if (!isComp) return false;
				if (contentId && (item.id === contentId || item.url === contentId)) return true;
				if (contentUrl && (item.id === contentUrl || item.url === contentUrl)) return true;
				if (contentTitle && item.title && item.title.toLowerCase().trim() === contentTitle) return true;
				return false;
			});

			if (completedMovie) {
				return {
					status: "completed",
					completedItem: completedMovie,
					progress: 1.0,
					duration: completedMovie.duration || 0,
					updatedAt: completedMovie.watchedAt || completedMovie.updatedAt,
				};
			}

			return { status: "not_started" };
		}
	} catch (e) {
		console.error("getContentWatchProgress error:", e);
		return { status: "not_started" };
	}
}

/**
 * Belirli bir dizinin tüm bölümleri için izleme/tamamlanma haritasını getirir
 * @param {string} seriesId - Dizi ID veya URL
 * @param {string} seriesTitle - Dizi Adı
 * @returns {Promise<Object>} { [urlOrKey]: { status: 'completed'|'in_progress', currentTime, duration, progress } }
 */
export async function getSeriesEpisodesProgress(seriesId, seriesTitle) {
	try {
		const [continueList, watchHistory] = await Promise.all([
			getContinueWatching(),
			getWatchHistory(),
		]);

		const titleLower = (seriesTitle || "").toLowerCase().trim();
		const result = {};

		// 1. Tamamlanan bölümler (Watch History)
		watchHistory.forEach((item) => {
			const matchesSeries =
				(seriesId && (item.seriesId === seriesId || item.id === seriesId)) ||
				(titleLower && item.seriesTitle?.toLowerCase().trim() === titleLower) ||
				(titleLower && item.title?.toLowerCase().trim() === titleLower);

			if (matchesSeries && (item.isCompleted || (item.progress && item.progress >= 0.9))) {
				const info = {
					status: "completed",
					progress: 1.0,
					duration: item.duration || 0,
				};
				if (item.url) {
					result[item.url] = info;
				}
				if (item.season && item.episode) {
					result[`s${item.season}_e${item.episode}`] = info;
				}
				if (item.id) {
					result[item.id] = info;
				}
			}
		});

		// 2. Devam eden bölümler (Continue Watching) - en güncel durumu yansıtır
		continueList.forEach((item) => {
			const matchesSeries =
				(seriesId && (item.seriesId === seriesId || item.id === seriesId)) ||
				(titleLower && item.seriesTitle?.toLowerCase().trim() === titleLower) ||
				(titleLower && item.title?.toLowerCase().trim() === titleLower);

			if (matchesSeries) {
				const info = {
					status: "in_progress",
					currentTime: item.currentTime || 0,
					duration: item.duration || 0,
					progress: item.progress || 0,
				};
				if (item.url) {
					result[item.url] = info;
				}
				if (item.season && item.episode) {
					result[`s${item.season}_e${item.episode}`] = info;
				}
				if (item.id) {
					result[item.id] = info;
				}
			}
		});

		return result;
	} catch (e) {
		console.error("getSeriesEpisodesProgress error:", e);
		return {};
	}
}

/**
 * Eklenti görünürlük ayarlarını getirir (örn: { "DiziBox": true, "Dizilla": false })
 * Bir eklenti bu objede yoksa varsayılan olarak true (görünür) kabul edilir.
 */
export async function getPluginVisibilitySettings() {
	try {
		const data = await AsyncStorage.getItem(STORAGE_KEYS.PLUGIN_VISIBILITY);
		return data ? JSON.parse(data) : {};
	} catch (error) {
		console.error("Eklenti görünürlük ayarları okunurken hata:", error);
		return {};
	}
}

/**
 * Tek bir eklentinin görünürlük durumunu günceller ve kaydeder
 */
export async function savePluginVisibility(pluginName, isVisible) {
	return mutate(STORAGE_KEYS.PLUGIN_VISIBILITY, async () => {
		try {
			const currentSettings = await getPluginVisibilitySettings();
			const updatedSettings = {
				...currentSettings,
				[pluginName]: Boolean(isVisible),
			};
			await AsyncStorage.setItem(
				STORAGE_KEYS.PLUGIN_VISIBILITY,
				JSON.stringify(updatedSettings),
			);
			// Görünürlük global bir tercihtir; bildirim olmadan push tetiklenmez
			// ve değişiklik yalnızca bu cihazda kalır.
			notifyStorageChange(STORAGE_KEYS.PLUGIN_VISIBILITY, updatedSettings);
			return updatedSettings;
		} catch (error) {
			console.error("Eklenti görünürlüğü kaydedilirken hata:", error);
			throw error;
		}
	});
}

/**
 * Tüm eklentilerin görünürlük haritasını topluca kaydeder
 */
export async function setAllPluginsVisibility(visibilityMap) {
	return mutate(STORAGE_KEYS.PLUGIN_VISIBILITY, async () => {
		try {
			const map = visibilityMap || {};
			await AsyncStorage.setItem(
				STORAGE_KEYS.PLUGIN_VISIBILITY,
				JSON.stringify(map),
			);
			notifyStorageChange(STORAGE_KEYS.PLUGIN_VISIBILITY, map);
			return map;
		} catch (error) {
			console.error("Tüm eklenti görünürlüğü kaydedilirken hata:", error);
			throw error;
		}
	});
}

/**
 * Belirli bir eklentinin görünür olup olmadığını kontrol eder
 */
export async function isPluginVisible(pluginName) {
	try {
		const settings = await getPluginVisibilitySettings();
		if (pluginName in settings) {
			return Boolean(settings[pluginName]);
		}
		return true; // Varsayılan: Görünür
	} catch (error) {
		console.error("Eklenti görünürlüğü kontrol edilirken hata:", error);
		return true;
	}
}

/**
 * Kategori görünürlük ayarlarını getirir.
 * - pluginName verilirse: o eklentiye ait { "KategoriAdı": boolean } objesini döner.
 * - pluginName verilmezse: tüm eklentilerin kategori görünürlük objesini döner ({ [pluginName]: { [categoryKey]: boolean } }).
 */
export async function getCategoryVisibilitySettings(pluginName = null) {
	try {
		const data = await AsyncStorage.getItem(STORAGE_KEYS.CATEGORY_VISIBILITY);
		const parsed = data ? JSON.parse(data) : {};
		if (pluginName) {
			return parsed[pluginName] || {};
		}
		return parsed;
	} catch (error) {
		console.error("Kategori görünürlük ayarları okunurken hata:", error);
		return pluginName ? {} : {};
	}
}

/**
 * Belirli bir eklentinin tek bir kategorisinin görünürlük durumunu günceller ve kaydeder.
 */
export async function saveCategoryVisibility(pluginName, categoryKey, isVisible) {
	if (!pluginName || !categoryKey) return {};
	return mutate(STORAGE_KEYS.CATEGORY_VISIBILITY, async () => {
		try {
			const allSettings = await getCategoryVisibilitySettings();
			const pluginSettings = allSettings[pluginName] || {};

			const updatedPluginSettings = {
				...pluginSettings,
				[categoryKey]: Boolean(isVisible),
			};

			const updatedAllSettings = {
				...allSettings,
				[pluginName]: updatedPluginSettings,
			};

			await AsyncStorage.setItem(
				STORAGE_KEYS.CATEGORY_VISIBILITY,
				JSON.stringify(updatedAllSettings),
			);
			notifyStorageChange(STORAGE_KEYS.CATEGORY_VISIBILITY, updatedAllSettings);
			return updatedPluginSettings;
		} catch (error) {
			console.error("Kategori görünürlüğü kaydedilirken hata:", error);
			throw error;
		}
	});
}

/**
 * Bir eklentiye ait tüm kategorilerin görünürlük haritasını topluca günceller ve kaydeder.
 */
export async function setPluginCategoriesVisibility(pluginName, categoryMap) {
	if (!pluginName) return {};
	return mutate(STORAGE_KEYS.CATEGORY_VISIBILITY, async () => {
		try {
			const allSettings = await getCategoryVisibilitySettings();
			const updatedAllSettings = {
				...allSettings,
				[pluginName]: categoryMap || {},
			};

			await AsyncStorage.setItem(
				STORAGE_KEYS.CATEGORY_VISIBILITY,
				JSON.stringify(updatedAllSettings),
			);
			notifyStorageChange(
				STORAGE_KEYS.CATEGORY_VISIBILITY,
				updatedAllSettings,
			);
			return updatedAllSettings[pluginName];
		} catch (error) {
			console.error(
				"Eklenti kategori görünürlükleri topluca kaydedilirken hata:",
				error,
			);
			throw error;
		}
	});
}

/**
 * Belirli bir eklentinin belirli bir kategorisinin görünür olup olmadığını kontrol eder.
 * Varsayılan: true (görünür)
 */
export async function isCategoryVisible(pluginName, categoryKey) {
	try {
		if (!pluginName || !categoryKey) return true;
		const settings = await getCategoryVisibilitySettings(pluginName);
		if (categoryKey in settings) {
			return Boolean(settings[categoryKey]);
		}
		return true; // Varsayılan: Görünür
	} catch (error) {
		console.error("Kategori görünürlüğü kontrol edilirken hata:", error);
		return true;
	}
}

/**
 * Kitaplık / İzleme Listesi (Listem) öğelerini getirir (silinmemiş olanlar)
 */
export async function getWatchlist() {
	try {
		const data = await AsyncStorage.getItem(STORAGE_KEYS.WATCHLIST);
		if (!data) return [];
		const list = JSON.parse(data);
		return Array.isArray(list) ? list.filter((i) => !i._deleted) : [];
	} catch (error) {
		console.error("Kitaplık listesi okunurken hata:", error);
		return [];
	}
}

/**
 * İçeriği kitaplığa (Listem) ekler veya çıkarır (toggle)
 * Tombstone desteği ve boyut kapağı ile.
 */
export async function toggleWatchlist(item) {
	return mutate(STORAGE_KEYS.WATCHLIST, async () => {
		try {
			if (!item || (!item.id && !item.url)) return false;
			const itemId = item.id || item.url;
			const raw = await AsyncStorage.getItem(STORAGE_KEYS.WATCHLIST);
			const all = raw ? JSON.parse(raw) : [];
			const deviceId = await getDeviceId();
			const hlc = getHlcNow();

			const existingIndex = all.findIndex((i) => (i.id || i.url) === itemId);
			let updated;
			let isInList = false;

			if (existingIndex !== -1) {
				const existing = all[existingIndex];
				if (existing._deleted) {
					isInList = true;
					const revived = {
						...existing,
						...filterPayload(item),
						id: itemId,
						_hlc: hlc,
						_deviceId: deviceId,
						_deleted: false,
						updatedAt: new Date().toISOString(),
					};
					updated = [revived, ...all.filter((_, idx) => idx !== existingIndex)];
				} else {
					isInList = false;
					const tombstone = {
						...existing,
						_hlc: hlc,
						_deviceId: deviceId,
						_deleted: true,
						updatedAt: new Date().toISOString(),
					};
					updated = [tombstone, ...all.filter((_, idx) => idx !== existingIndex)];
				}
			} else {
				isInList = true;
				const newItem = {
					...filterPayload(item),
					id: itemId,
					_hlc: hlc,
					_deviceId: deviceId,
					_deleted: false,
					updatedAt: new Date().toISOString(),
				};
				updated = [newItem, ...all];
			}

			const capped = capList(updated, SIZE_CAPS.watchlist || 100);
			await AsyncStorage.setItem(
				STORAGE_KEYS.WATCHLIST,
				JSON.stringify(capped),
			);
			const activeList = capped.filter((i) => !i._deleted);
			notifyStorageChange(STORAGE_KEYS.WATCHLIST, activeList);
			return isInList;
		} catch (error) {
			console.error("Kitaplık listesi güncellenirken hata:", error);
			throw error;
		}
	});
}

/**
 * İçeriği kitaplıktan (Listem / Planlanan) kaldırır (tombstone)
 */
export async function removeFromWatchlist(target) {
	return mutate(STORAGE_KEYS.WATCHLIST, async () => {
		try {
			if (!target) return [];
			const targetId =
				typeof target === "object" ? target.id || target.url : target;
			const targetUrl =
				typeof target === "object" ? target.url || target.seriesUrl : null;
			const targetSeriesId =
				typeof target === "object" ? target.seriesId : null;
			const targetSeriesUrl =
				typeof target === "object" ? target.seriesUrl : null;
			const targetTitle =
				typeof target === "object"
					? target.seriesTitle || target.title
					: null;

			const raw = await AsyncStorage.getItem(STORAGE_KEYS.WATCHLIST);
			const list = raw ? JSON.parse(raw) : [];
			const deviceId = await getDeviceId();
			const hlc = getHlcNow();

			const updated = list.map((i) => {
				const itemId = i.id || i.url;
				const itemUrl = i.url || i.seriesUrl;
				const itemTitle = i.title || i.seriesTitle;

				const isMatch =
					(targetId && (itemId === targetId || itemUrl === targetId)) ||
					(targetUrl && (itemId === targetUrl || itemUrl === targetUrl)) ||
					(targetSeriesId && (itemId === targetSeriesId || itemUrl === targetSeriesId)) ||
					(targetSeriesUrl && (itemId === targetSeriesUrl || itemUrl === targetSeriesUrl)) ||
					(targetTitle && itemTitle && targetTitle.trim().toLowerCase() === itemTitle.trim().toLowerCase());

				if (isMatch) {
					return {
						...i,
						_hlc: hlc,
						_deviceId: deviceId,
						_deleted: true,
					};
				}
				return i;
			});

			await AsyncStorage.setItem(
				STORAGE_KEYS.WATCHLIST,
				JSON.stringify(updated),
			);
			const activeList = updated.filter((i) => !i._deleted);
			notifyStorageChange(STORAGE_KEYS.WATCHLIST, activeList);
			return activeList;
		} catch (error) {
			console.error("Kitaplıktan kaldırılırken hata:", error);
			return [];
		}
	});
}

/**
 * İçeriğin kitaplıkta (Listem) olup olmadığını sorgular
 */
export async function isInWatchlist(itemId) {
	try {
		if (!itemId) return false;
		const list = await getWatchlist();
		return list.some((i) => (i.id || i.url) === itemId);
	} catch (error) {
		console.error("Kitaplık sorgulanırken hata:", error);
		return false;
	}
}

/**
 * Bir içeriğin kitaplık durumunu (izleniyor, planlandı, tamamlandı, favori) topluca döner
 */
export async function getContentLibraryStatus(itemId) {
	try {
		if (!itemId) {
			return {
				inWatching: false,
				inPlanned: false,
				inCompleted: false,
				isFav: false,
				currentList: null,
			};
		}
		const [watchingList, plannedList, historyList, favList, hiddenList] =
			await Promise.all([
				getContinueWatching(),
				getWatchlist(),
				getWatchHistory(),
				getFavorites(),
				getHiddenLibraryItems(),
			]);

		const inWatching = watchingList.some(
			(i) => i.id === itemId || i.url === itemId,
		);
		const inPlanned = plannedList.some(
			(i) => i.id === itemId || i.url === itemId,
		);
		// Kaldırılan (gizlenen) içerik "Tamamlandı" sayılmaz — izlenme
		// verisi korunur ama kitaplık görünümünde yoktur.
		const isHidden = hiddenList.some((h) => {
			const ids = [h.id, h.url].filter(Boolean).map(String);
			return ids.includes(String(itemId));
		});
		const inCompleted =
			!isHidden &&
			historyList.some(
				(i) =>
					(i.id === itemId || i.url === itemId) &&
					(i.isCompleted || (i.progress && i.progress >= 0.9)),
			);
		const isFav = favList.some(
			(i) => i.id === itemId || i.url === itemId,
		);

		let currentList = null;
		if (inWatching) currentList = "watching";
		else if (inPlanned) currentList = "planned";
		else if (inCompleted) currentList = "completed";

		return { inWatching, inPlanned, inCompleted, isFav, isHidden, currentList };
	} catch (error) {
		console.error("getContentLibraryStatus hata:", error);
		return {
			inWatching: false,
			inPlanned: false,
			inCompleted: false,
			isFav: false,
			currentList: null,
		};
	}
}

/**
 * İçeriği belirli bir listeye atar veya tüm izleme listelerinden çıkarır
 * targetList: 'watching' | 'planned' | 'completed' | null | 'remove'
 */
export async function setContentLibraryList(movie, targetList) {
	try {
		if (!movie) return null;
		const itemId = movie.id || movie.url;
		if (!itemId) return null;

		// 1. Önce mevcut izleme listelerinden temizle.
		//
		// ⚠️ İZLEME GEÇMİŞİ BURADAN TEMİZLENMEZ (eski davranış
		// `removeFromWatchHistory(itemId)` çağırıyordu). Kullanıcı geri
		// bildirimi: "kitaplıktan kaldırılınca tamamlandı bilgisi
		// sıfırlanıyor. Veriler sıfırlanmadan silinmemeli." İzlenme bilgisi
		// (tamamlanan bölümler, ilerleme) kitaplık üyeliğinden bağımsızdır
		// ve hesaba senkronlanır; kaldırma yalnızca GÖRÜNÜRLÜĞÜ değiştirir
		// (bkz. `hideLibraryItem`).
		await Promise.all([
			removeContinueWatching(itemId),
			(async () => {
				const wl = await getWatchlist();
				const filtered = wl.filter((i) => (i.id || i.url) !== itemId);
				await AsyncStorage.setItem(
					STORAGE_KEYS.WATCHLIST,
					JSON.stringify(filtered),
				);
			})(),
		]);

		// 2. Görünürlük kaydı: listeye ekleme gizlemeyi kaldırır,
		//    kaldırma yalnızca gizler — veri SİLİNMEZ.
		const isAddTarget =
			targetList === "watching" ||
			targetList === "planned" ||
			targetList === "completed";
		if (isAddTarget) {
			await unhideLibraryItem(movie);
		} else {
			await hideLibraryItem(movie);
			return null; // kaldırıldı
		}

		// 3. Hedef listeye ekle
		if (targetList === "watching") {
			await saveContinueWatching({
				...movie,
				id: itemId,
				progress: movie.progress || 0.1,
				currentTime: movie.currentTime || 10,
				duration: movie.duration || 100,
			});
			return "watching";
		} else if (targetList === "planned") {
			const wl = await getWatchlist();
			const updated = [
				{ ...movie, id: itemId },
				...wl.filter((i) => (i.id || i.url) !== itemId),
			];
			await AsyncStorage.setItem(
				STORAGE_KEYS.WATCHLIST,
				JSON.stringify(updated),
			);
			return "planned";
		} else if (targetList === "completed") {
			await addToWatchHistory({
				...movie,
				id: itemId,
				isCompleted: true,
				progress: 1.0,
			});
			return "completed";
		}

		return null; // kaldırıldı
	} catch (error) {
		console.error("setContentLibraryList hata:", error);
		throw error;
	}
}

export default {
	getUserProfile,
	saveUserProfile,
	getAuthUser,
	saveAuthUser,
	clearAuthUser,
	getFavorites,
	toggleFavorite,
	isFavorite,
	getWatchHistory,
	addToWatchHistory,
	removeFromWatchHistory,
	clearWatchHistory,
	getSearchHistory,
	addToSearchHistory,
	removeFromSearchHistory,
	clearSearchHistory,
	getPlayerSettings,
	savePlayerSettings,
	resetPlayerSettings,
	DEFAULT_PLAYER_SETTINGS,
	getSelectedPlatform,
	saveSelectedPlatform,
	getDownloads,
	saveDownloadItem,
	deleteDownloadItem,
	getContinueWatching,
	saveContinueWatching,
	removeContinueWatching,
	markEpisodeComplete,
	NONE_PLATFORM,
	LIVE_TV_PLATFORM,
	getPluginVisibilitySettings,
	savePluginVisibility,
	setAllPluginsVisibility,
	isPluginVisible,
	getCategoryVisibilitySettings,
	saveCategoryVisibility,
	setPluginCategoriesVisibility,
	isCategoryVisible,
	getWatchlist,
	toggleWatchlist,
	removeFromWatchlist,
	isInWatchlist,
	getHiddenLibraryItems,
	hideLibraryItem,
	unhideLibraryItem,
	isLibraryHidden,
	getEpisodeKey,
	markEpisodesWatched,
	unmarkEpisodesWatched,
	getContentLibraryStatus,
	setContentLibraryList,
	markContentCompleted,
	getContentWatchProgress,
	getSeriesEpisodesProgress,
	getSeriesTotalEpisodesMap,
	saveSeriesTotalEpisodes,
	getSeriesTotalEpisodes,
	clearAllUserData,
	resolvePluginName,
	STORAGE_KEYS,
	mutate,
};

/**
 * Bir içerik nesnesinden veya URL'sinden ait olduğu eklenti (plugin) adını belirler
 * @param {Object} item
 * @returns {string|null}
 */
export function resolvePluginName(item) {
	if (!item) return null;
	if (item.plugin && typeof item.plugin === "string") return item.plugin;
	const rawUrl =
		item.url ||
		item.seriesUrl ||
		(typeof item.id === "string" ? item.id : "");
	if (rawUrl) {
		const lower = rawUrl.toLowerCase();
		if (lower.includes("dizibox")) return "dizibox";
		if (lower.includes("hdfilmcehennemi")) return "hdfilmcehennemi";
		if (lower.includes("filmmodu")) return "filmmodu";
		if (lower.includes("dizipal")) return "dizipal";
		if (lower.includes("sezonlukdizi")) return "sezonlukdizi";
		if (lower.includes("diziyou")) return "diziyou";
		if (lower.includes("sinefy")) return "sinefy";
		if (lower.includes("fullhdfilmizlesene")) return "fullhdfilmizlesene";
		try {
			const full = lower.startsWith("http") ? lower : `https://${lower}`;
			const host = new URL(full).hostname.replace(/^www\./, "");
			const parts = host.split(".");
			if (parts.length > 0 && parts[0] && parts[0].length > 2) {
				return parts[0];
			}
		} catch {}
	}
	return null;
}
