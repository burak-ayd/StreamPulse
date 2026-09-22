import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEYS = {
	USER_PROFILE: "user_profile",
	FAVORITES: "user_favorites",
	WATCH_HISTORY: "user_watch_history",
	SETTINGS: "app_settings",
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

export default {
	getUserProfile,
	saveUserProfile,
	getFavorites,
	toggleFavorite,
	isFavorite,
	getWatchHistory,
	addToWatchHistory,
};
