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
	CONTINUE_WATCHING: "user_continue_watching",
	PLUGIN_VISIBILITY: "streampulse_plugin_visibility",
	CATEGORY_VISIBILITY: "streampulse_category_visibility",
	WATCHLIST: "user_watchlist",
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
 * İzleme geçmişinden (tamamlananlardan) içerik siler
 */
export async function removeFromWatchHistory(target) {
	try {
		if (!target) return [];
		const targetId = typeof target === "object" ? (target.id || target.url) : target;
		const targetUrl = typeof target === "object" ? target.url : null;
		const history = await getWatchHistory();
		const updated = history.filter((item) => {
			if (targetId && (item.id === targetId || item.url === targetId)) return false;
			if (targetUrl && (item.id === targetUrl || item.url === targetUrl)) return false;
			if (typeof target === "object" && target.title && item.title && target.title === item.title) return false;
			return true;
		});
		await AsyncStorage.setItem(
			STORAGE_KEYS.WATCH_HISTORY,
			JSON.stringify(updated),
		);
		return updated;
	} catch (error) {
		console.error("İzleme geçmişinden silinirken hata:", error);
		return [];
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

/**
 * Kaldığın yerden devam et listesini getirir (en son izlenen üstte)
 */
export async function getContinueWatching() {
	try {
		const data = await AsyncStorage.getItem(STORAGE_KEYS.CONTINUE_WATCHING);
		if (!data) return [];
		const list = JSON.parse(data);
		if (!Array.isArray(list)) return [];
		return list.sort(
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
 * - progress >= 0.90 ise tamamlandı sayıp listeden kaldırır
 * - Aksi halde en başa ekler veya günceller (en fazla 50 kayıt)
 */
export async function saveContinueWatching(item) {
	try {
		if (!item || !item.id) return [];

		// Threshold kontrolü: 10 saniyeden az izlendiyse kaydetme
		if ((item.currentTime || 0) < 10) {
			return await getContinueWatching();
		}

		const duration = item.duration || 0;
		const progress =
			duration > 0 ? item.currentTime / duration : item.progress || 0;

		// %90 veya daha fazlası izlendiyse tamamlandı kabul et ve listeden kaldır
		if (progress >= 0.9) {
			return await removeContinueWatching(item.id);
		}

		const currentList = await getContinueWatching();
		const filtered = currentList.filter((i) => i.id !== item.id);

		const updatedItem = {
			...item,
			progress,
			updatedAt: new Date().toISOString(),
		};

		const newList = [updatedItem, ...filtered].slice(0, 50);
		await AsyncStorage.setItem(
			STORAGE_KEYS.CONTINUE_WATCHING,
			JSON.stringify(newList),
		);
		return newList;
	} catch (error) {
		console.error("Kaldığın yerden devam et kaydedilirken hata:", error);
		return [];
	}
}

/**
 * İçeriği devam et listesinden siler
 */
export async function removeContinueWatching(target) {
	try {
		if (!target) return [];
		const targetId = typeof target === "object" ? (target.id || target.url) : target;
		const targetUrl = typeof target === "object" ? target.url : null;
		const currentList = await getContinueWatching();
		const updated = currentList.filter((i) => {
			if (targetId && (i.id === targetId || i.url === targetId)) return false;
			if (targetUrl && (i.id === targetUrl || i.url === targetUrl)) return false;
			return true;
		});
		await AsyncStorage.setItem(
			STORAGE_KEYS.CONTINUE_WATCHING,
			JSON.stringify(updated),
		);
		return updated;
	} catch (error) {
		console.error("Kaldığın yerden devam et silinirken hata:", error);
		return [];
	}
}

/**
 * Bölüm tamamlandığında sonraki bölümü listeye otomatik ekler
 */
export async function markEpisodeComplete(
	seriesId,
	season,
	episode,
	nextEpisode,
	currentItem = {},
) {
	try {
		// Önce mevcut bölümü listeden kaldır
		if (currentItem?.id) {
			await removeContinueWatching(currentItem.id);
		}

		// Eğer sonraki bölüm varsa devam et listesine 0 saniye ile ekle
		if (nextEpisode && (nextEpisode.id || nextEpisode.url)) {
			const nextItem = {
				id: nextEpisode.id || `${seriesId || "series"}_s${nextEpisode.season || season}_e${nextEpisode.episode || (episode ? episode + 1 : 1)}`,
				title: currentItem.seriesTitle || currentItem.title || "Dizi",
				poster: nextEpisode.poster || currentItem.poster,
				type: "episode",
				currentTime: 0,
				duration: nextEpisode.duration || 0,
				progress: 0,
				seriesId: seriesId || currentItem.seriesId,
				seriesTitle: currentItem.seriesTitle || currentItem.title,
				season: nextEpisode.season || season,
				episode: nextEpisode.episode || (episode ? episode + 1 : 1),
				episodeTitle: nextEpisode.title || nextEpisode.episodeTitle || `Bölüm ${nextEpisode.episode || (episode ? episode + 1 : 1)}`,
				url: nextEpisode.url || currentItem.url,
				updatedAt: new Date().toISOString(),
			};

			const currentList = await getContinueWatching();
			const filtered = currentList.filter((i) => i.id !== nextItem.id);
			const newList = [nextItem, ...filtered].slice(0, 50);
			await AsyncStorage.setItem(
				STORAGE_KEYS.CONTINUE_WATCHING,
				JSON.stringify(newList),
			);
			return newList;
		}
		return await getContinueWatching();
	} catch (error) {
		console.error("markEpisodeComplete hata:", error);
		return [];
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
		return updatedSettings;
	} catch (error) {
		console.error("Eklenti görünürlüğü kaydedilirken hata:", error);
		throw error;
	}
}

/**
 * Tüm eklentilerin görünürlük haritasını topluca kaydeder
 */
export async function setAllPluginsVisibility(visibilityMap) {
	try {
		await AsyncStorage.setItem(
			STORAGE_KEYS.PLUGIN_VISIBILITY,
			JSON.stringify(visibilityMap || {}),
		);
		return visibilityMap;
	} catch (error) {
		console.error("Tüm eklenti görünürlüğü kaydedilirken hata:", error);
		throw error;
	}
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
	try {
		if (!pluginName || !categoryKey) return {};
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
		return updatedPluginSettings;
	} catch (error) {
		console.error("Kategori görünürlüğü kaydedilirken hata:", error);
		throw error;
	}
}

/**
 * Bir eklentiye ait tüm kategorilerin görünürlük haritasını topluca günceller ve kaydeder.
 */
export async function setPluginCategoriesVisibility(pluginName, categoryMap) {
	try {
		if (!pluginName) return {};
		const allSettings = await getCategoryVisibilitySettings();
		const updatedAllSettings = {
			...allSettings,
			[pluginName]: categoryMap || {},
		};

		await AsyncStorage.setItem(
			STORAGE_KEYS.CATEGORY_VISIBILITY,
			JSON.stringify(updatedAllSettings),
		);
		return updatedAllSettings[pluginName];
	} catch (error) {
		console.error(
			"Eklenti kategori görünürlükleri topluca kaydedilirken hata:",
			error,
		);
		throw error;
	}
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
 * Kitaplık / İzleme Listesi (Listem) öğelerini getirir
 */
export async function getWatchlist() {
	try {
		const data = await AsyncStorage.getItem(STORAGE_KEYS.WATCHLIST);
		return data ? JSON.parse(data) : [];
	} catch (error) {
		console.error("Kitaplık listesi okunurken hata:", error);
		return [];
	}
}

/**
 * İçeriği kitaplığa (Listem) ekler veya çıkarır (toggle)
 */
export async function toggleWatchlist(item) {
	try {
		if (!item || (!item.id && !item.url)) return false;
		const itemId = item.id || item.url;
		const list = await getWatchlist();
		const exists = list.some((i) => (i.id || i.url) === itemId);
		let updated;
		if (exists) {
			updated = list.filter((i) => (i.id || i.url) !== itemId);
		} else {
			updated = [{ ...item, id: itemId }, ...list];
		}
		await AsyncStorage.setItem(
			STORAGE_KEYS.WATCHLIST,
			JSON.stringify(updated),
		);
		return !exists;
	} catch (error) {
		console.error("Kitaplık listesi güncellenirken hata:", error);
		throw error;
	}
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
		const [watchingList, plannedList, historyList, favList] =
			await Promise.all([
				getContinueWatching(),
				getWatchlist(),
				getWatchHistory(),
				getFavorites(),
			]);

		const inWatching = watchingList.some(
			(i) => i.id === itemId || i.url === itemId,
		);
		const inPlanned = plannedList.some(
			(i) => i.id === itemId || i.url === itemId,
		);
		const inCompleted = historyList.some(
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

		return { inWatching, inPlanned, inCompleted, isFav, currentList };
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

		// 1. Önce mevcut izleme listelerinden temizle
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
			removeFromWatchHistory(itemId),
		]);

		// 2. Hedef listeye ekle
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
	getFavorites,
	toggleFavorite,
	isFavorite,
	getWatchHistory,
	addToWatchHistory,
	removeFromWatchHistory,
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
	isInWatchlist,
	getContentLibraryStatus,
	setContentLibraryList,
};
