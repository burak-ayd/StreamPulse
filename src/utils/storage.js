import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEYS = {
	USER_PROFILE: "user_profile",
	FAVORITES: "user_favorites",
	WATCH_HISTORY: "user_watch_history",
	SETTINGS: "app_settings",
	SEARCH_HISTORY: "user_search_history",
	PLAYER_SETTINGS: "app_player_settings",
	SELECTED_PLATFORM: "user_selected_platform",
	DOWNLOADS: "streampulse_downloads_list",
};

export const NONE_PLATFORM = {
	id: "none",
	name: "None",
	displayName: "None (Hiçbiri)",
	description: "Sadece indirilen içerikleri gösterir",
	is_offline: true,
};

export const DEFAULT_PLAYER_SETTINGS = {
	// Video oynatıcı ayarları
	seekDuration: 10, // 5, 10, 15, 30 sn
	defaultResizeMode: "contain", // 'contain' | 'cover'
	autoPlay: true,
	controlsTimeout: 4, // 3, 4, 5, 8 sn
	defaultOrientation: "landscape", // 'landscape' | 'sensor'
	autoResume: true,

	// Altyazı görünüm ayarları
	subtitleFontSize: 16, // 14, 16, 20, 24
	subtitleTextColor: "#FFFFFF", // '#FFFFFF', '#FFD600', '#00E676', '#00E5FF'
	subtitleBgColor: "semi-black", // 'semi-black', 'solid-black', 'transparent', 'blur'
	subtitleTextShadow: true,
	defaultSubtitleLanguage: "tr", // 'tr', 'en', 'off'
};

const DEFAULT_PROFILE = {
	username: "sinemasever",
	displayName: "Sinema Sever",
	email: "kullanici@cineverse.com",
	avatarUrl: "",
	bio: "Film ve dizi tutkunu. Sinema dünyasındaki en son yapımları keşfediyorum.",
	language: "Türkçe",
	isPrivate: false,
	birthDate: "1995-05-15",
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
		return updatedProfile;
	} catch (error) {
		console.error("Profil kaydedilirken hata:", error);
		throw error;
	}
}

/**
 * Favori filmleri/içerikleri getirir
 */
export async function getFavorites() {
	try {
		const data = await AsyncStorage.getItem(STORAGE_KEYS.FAVORITES);
		return data ? JSON.parse(data) : [];
	} catch (error) {
		console.error("Favoriler okunurken hata:", error);
		return [];
	}
}

/**
 * Bir içeriği favorilere ekler veya favorilerden çıkarır (toggle)
 */
export async function toggleFavorite(movie) {
	try {
		const favorites = await getFavorites();
		const exists = favorites.some((item) => item.id === movie.id);
		let updated;
		if (exists) {
			updated = favorites.filter((item) => item.id !== movie.id);
		} else {
			updated = [movie, ...favorites];
		}
		await AsyncStorage.setItem(
			STORAGE_KEYS.FAVORITES,
			JSON.stringify(updated),
		);
		return !exists;
	} catch (error) {
		console.error("Favori güncellenirken hata:", error);
		throw error;
	}
}

/**
 * Bir içeriğin favorilerde olup olmadığını sorgular
 */
export async function isFavorite(movieId) {
	try {
		const favorites = await getFavorites();
		return favorites.some((item) => item.id === movieId);
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
		return data ? JSON.parse(data) : [];
	} catch (error) {
		console.error("İzleme geçmişi okunurken hata:", error);
		return [];
	}
}

/**
 * İzleme geçmişine içerik ekler
 */
export async function addToWatchHistory(movie) {
	try {
		const history = await getWatchHistory();
		// Varsa eskiyi çıkarıp en başa ekleyelim
		const filtered = history.filter((item) => item.id !== movie.id);
		const updated = [
			{ ...movie, watchedAt: new Date().toISOString() },
			...filtered,
		];
		await AsyncStorage.setItem(
			STORAGE_KEYS.WATCH_HISTORY,
			JSON.stringify(updated.slice(0, 50)), // En fazla 50 kayıt
		);
		return updated;
	} catch (error) {
		console.error("İzleme geçmişi güncellenirken hata:", error);
		throw error;
	}
}

/**
 * Arama geçmişini getirir
 */
export async function getSearchHistory() {
	try {
		const data = await AsyncStorage.getItem(STORAGE_KEYS.SEARCH_HISTORY);
		return data ? JSON.parse(data) : [];
	} catch (error) {
		console.error("Arama geçmişi okunurken hata:", error);
		return [];
	}
}

/**
 * Arama geçmişine yeni sorgu ekler (en fazla 20 adet)
 */
export async function addToSearchHistory(query) {
	try {
		if (!query || !query.trim()) return [];
		const trimmed = query.trim();
		const history = await getSearchHistory();
		const filtered = history.filter(
			(item) => item.toLowerCase() !== trimmed.toLowerCase(),
		);
		const updated = [trimmed, ...filtered].slice(0, 20);
		await AsyncStorage.setItem(
			STORAGE_KEYS.SEARCH_HISTORY,
			JSON.stringify(updated),
		);
		return updated;
	} catch (error) {
		console.error("Arama geçmişi kaydedilirken hata:", error);
		return [];
	}
}

/**
 * Arama geçmişinden tek bir sorguyu siler
 */
export async function removeFromSearchHistory(query) {
	try {
		const history = await getSearchHistory();
		const updated = history.filter(
			(item) => item.toLowerCase() !== query.toLowerCase(),
		);
		await AsyncStorage.setItem(
			STORAGE_KEYS.SEARCH_HISTORY,
			JSON.stringify(updated),
		);
		return updated;
	} catch (error) {
		console.error("Arama geçmişinden silinirken hata:", error);
		return [];
	}
}

/**
 * Arama geçmişini temizler
 */
export async function clearSearchHistory() {
	try {
		await AsyncStorage.removeItem(STORAGE_KEYS.SEARCH_HISTORY);
		return [];
	} catch (error) {
		console.error("Arama geçmişi temizlenirken hata:", error);
		return [];
	}
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
		return updated;
	} catch (error) {
		console.error("Player ayarları kaydedilirken hata:", error);
		throw error;
	}
}

/**
 * Video oynatıcı ayarlarını varsayılana sıfırlar
 */
export async function resetPlayerSettings() {
	try {
		await AsyncStorage.setItem(
			STORAGE_KEYS.PLAYER_SETTINGS,
			JSON.stringify(DEFAULT_PLAYER_SETTINGS),
		);
		return DEFAULT_PLAYER_SETTINGS;
	} catch (error) {
		console.error("Player ayarları sıfırlanırken hata:", error);
		return DEFAULT_PLAYER_SETTINGS;
	}
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
	try {
		if (!platform) {
			await AsyncStorage.removeItem(STORAGE_KEYS.SELECTED_PLATFORM);
			return null;
		}
		await AsyncStorage.setItem(
			STORAGE_KEYS.SELECTED_PLATFORM,
			JSON.stringify(platform),
		);
		return platform;
	} catch (error) {
		console.error("Seçili platform kaydedilirken hata:", error);
		throw error;
	}
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
 * İndirilen içeriği kaydeder/günceller
 */
export async function saveDownloadItem(item) {
	try {
		const list = await getDownloads();
		const filtered = list.filter((i) => i.id !== item.id);
		const updated = [item, ...filtered];
		await AsyncStorage.setItem(
			STORAGE_KEYS.DOWNLOADS,
			JSON.stringify(updated),
		);
		return updated;
	} catch (error) {
		console.error("İndirme kaydedilirken hata:", error);
		throw error;
	}
}

/**
 * İndirilen içeriği siler
 */
export async function deleteDownloadItem(itemId) {
	try {
		const list = await getDownloads();
		const updated = list.filter((i) => i.id !== itemId);
		await AsyncStorage.setItem(
			STORAGE_KEYS.DOWNLOADS,
			JSON.stringify(updated),
		);
		return updated;
	} catch (error) {
		console.error("İndirme silinirken hata:", error);
		throw error;
	}
}

export default {
	getUserProfile,
	saveUserProfile,
	getFavorites,
	toggleFavorite,
	isFavorite,
	getWatchHistory,
	addToWatchHistory,
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
	NONE_PLATFORM,
};
