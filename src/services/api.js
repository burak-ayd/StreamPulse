import { getCategoryVisibilitySettings } from "@/utils/storage";
import Constants from "expo-constants";

const API_BASE_URL =
	Constants.expoConfig?.extra?.API_URL ??
	Constants.manifest?.extra?.API_URL ??
	"https://api.example.com";
console.log(Constants.expoConfig?.extra?.API_URL);
// Default fallback platforms list
export const DEFAULT_PLATFORMS = [
	{
		id: "1",
		name: "Netflix",
		website: "netflix.com",
		is_active: true,
	},
	{
		id: "2",
		name: "Amazon Prime Video",
		website: "primevideo.com",
		is_active: true,
	},
	{
		id: "3",
		name: "Disney+",
		website: "disneyplus.com",
		is_active: true,
	},
	{
		id: "4",
		name: "BluTV",
		website: "blutv.com",
		is_active: true,
	},
	{
		id: "5",
		name: "Apple TV+",
		website: "tv.apple.com",
		is_active: true,
	},
	{
		id: "6",
		name: "Exxen",
		website: "exxen.com",
		is_active: true,
	},
];

// Fallback content details dictionary
const FALLBACK_CONTENT_DETAILS = {
	"1e70a60f-e5fc-45d9-aa19-a987062faec6": {
		id: "1e70a60f-e5fc-45d9-aa19-a987062faec6",
		title: "Interstellar",
		original_title: "Interstellar",
		tagline: "İnsanlığın sonu Dünya olmayacak.",
		overview:
			"İnsanlığın son günlerinde, eski bir NASA pilotu olan Cooper ve bir grup araştırmacı, insanlığın hayatta kalmasını sağlayacak yeni bir gezegen bulmak amacıyla bir solucan deliğinden geçerek bilinmeyen bir galaksiye doğru yolculuğa çıkar.",
		poster_url:
			"https://images.unsplash.com/photo-1534447677768-be436bb09401?w=800&auto=format&fit=crop&q=60",
		backdrop_url:
			"https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?w=1200&auto=format&fit=crop&q=60",
		rating: 8.7,
		vote_count: 1850000,
		runtime_minutes: 169,
		release_date: "2014-11-07",
		country: "ABD",
		age_rating: "13+",
		content_type: "movie",
		status: "Released",
		director: "Christopher Nolan",
		production_co: "Paramount Pictures, Warner Bros., Syncopy",
		language: "en",
		cast_members: [
			"Matthew McConaughey",
			"Anne Hathaway",
			"Jessica Chastain",
			"Michael Caine",
		],
		trailer_url: "https://www.youtube.com/watch?v=zSWdZVtXT7E",
	},
};

// In-memory cache store to prevent repeated API calls
const apiCache = {
	platforms: null,
	categories: new Map(), // platformName -> categories list
	randomHero: new Map(), // platformName -> hero contents
	categoryContents: new Map(), // `${platformName}::${categoryURL}` -> contents array
	pluginDetails: new Map(), // `${pluginName}::${url}` -> detail
};

/**
 * Synchronous cache getters
 */
export function getCachedPlatforms() {
	return apiCache.platforms;
}

export function getCachedCategories(platformName) {
	if (!platformName) return null;
	return apiCache.categories.get(platformName) || null;
}

export function getCachedHeroMovie(platformName) {
	if (!platformName) return null;
	return apiCache.randomHero.get(platformName) || null;
}

export function getCachedCategoryMovies(platformName, categoryURL) {
	if (!platformName || !categoryURL) return null;
	const key = `${platformName}::${categoryURL}`;
	return apiCache.categoryContents.get(key) || null;
}

/**
 * Cache invalidation
 */
export function clearPluginCache(pluginName) {
	if (pluginName) {
		apiCache.categories.delete(pluginName);
		apiCache.randomHero.delete(pluginName);
		for (const key of Array.from(apiCache.categoryContents.keys())) {
			if (key.startsWith(`${pluginName}::`)) {
				apiCache.categoryContents.delete(key);
			}
		}
	} else {
		apiCache.platforms = null;
		apiCache.categories.clear();
		apiCache.randomHero.clear();
		apiCache.categoryContents.clear();
		apiCache.pluginDetails.clear();
	}
}

/**
 * Fetch plugin content detail
 */
export async function fetchPluginDetail(pluginName, url, force = false) {
	const cacheKey = `${pluginName}::${url}`;
	if (!force && apiCache.pluginDetails.has(cacheKey)) {
		return apiCache.pluginDetails.get(cacheKey);
	}

	try {
		const response = await fetch(
			`${API_BASE_URL}/api/plugins/${pluginName}/detail?url=${encodeURIComponent(url)}`,
			{
				headers: { "Content-Type": "application/json" },
			},
		);
		if (response.ok) {
			const data = await response.json();
			const result = data?.detail || data;
			apiCache.pluginDetails.set(cacheKey, result);
			return result;
		}
	} catch (error) {
		console.warn("API plugin detail request failed:", error.message);
	}

	return null;
}

/**
 * Fetch Platform Main Page
 */
export async function fetchPlatformMainPage(
	platformName,
	categoryURL,
	force = false,
) {
	const cacheKey = `${platformName}::${categoryURL}`;
	if (!force && apiCache.categoryContents.has(cacheKey)) {
		return apiCache.categoryContents.get(cacheKey);
	}

	try {
		const response = await fetch(
			`${API_BASE_URL}/api/plugins/${platformName}/main-page?url=${encodeURIComponent(categoryURL)}`,
			{
				headers: { "Content-Type": "application/json" },
			},
		);
		if (response.ok) {
			const data = await response.json();
			const result = Array.isArray(data)
				? data
				: data?.results || data?.data || [];
			apiCache.categoryContents.set(cacheKey, result);
			return result;
		}
	} catch (error) {
		console.warn(
			"API platform main page request failed, using fallback:",
			error.message,
		);
	}

	return [];
}

/**
 * Fetch Platform Categories
 * @param {string} platformName
 * @param {boolean} force - Force cache refresh
 * @param {boolean} includeHidden - If true, returns all categories without filtering hidden ones
 */
export async function fetchPlatformCategories(
	platformName,
	force = false,
	includeHidden = false,
) {
	let rawData = null;

	if (!force && apiCache.categories.has(platformName)) {
		rawData = apiCache.categories.get(platformName);
	} else {
		try {
			const response = await fetch(
				`${API_BASE_URL}/api/plugins/${platformName}/categories`,
				{
					headers: { "Content-Type": "application/json" },
				},
			);
			if (response.ok) {
				rawData = await response.json();
				apiCache.categories.set(platformName, rawData);
			}
		} catch (error) {
			console.warn(
				"API platform categories request failed, using fallback:",
				error.message,
			);
		}
	}

	if (!rawData) {
		return [];
	}

	if (includeHidden) {
		return rawData;
	}

	try {
		const visibilityMap = await getCategoryVisibilitySettings(platformName);
		if (!visibilityMap || Object.keys(visibilityMap).length === 0) {
			return rawData;
		}

		const isCatVisible = (cat) => {
			const key = cat?.name || cat?.title || cat?.url || cat?.id;
			return !key || visibilityMap[key] !== false;
		};

		if (Array.isArray(rawData)) {
			return rawData.filter(isCatVisible);
		}
		if (rawData?.categories && Array.isArray(rawData.categories)) {
			return {
				...rawData,
				categories: rawData.categories.filter(isCatVisible),
			};
		}
	} catch (filterError) {
		console.warn("Kategori görünürlük filtresi hatası:", filterError);
	}

	return rawData;
}

/**
 * Fetch streaming platforms
 */
export async function fetchPlatforms(force = false) {
	if (!force && apiCache.platforms) {
		return apiCache.platforms;
	}

	try {
		let response = await fetch(`${API_BASE_URL}/api/plugins`, {
			headers: { "Content-Type": "application/json" },
		});
		if (!response.ok) {
			response = await fetch(`${API_BASE_URL}/api/plugins`, {
				headers: { "Content-Type": "application/json" },
			});
		}
		if (response.ok) {
			const data = await response.json();
			const plugins = Array.isArray(data) ? data : data?.plugins;
			if (Array.isArray(plugins) && plugins.length > 0) {
				const formatted = plugins.map((p, idx) => ({
					...p,
					id: p.id || p.name || String(idx + 1),
				}));
				apiCache.platforms = formatted;
				return formatted;
			}
		}
	} catch (error) {
		console.warn(
			"API platforms request failed, using fallback:",
			error.message,
		);
	}

	return DEFAULT_PLATFORMS;
}

/**
 * Fetch random contents
 */
export async function fetchRandomContents(
	platformName,
	count = 1,
	force = false,
) {
	if (!force && apiCache.randomHero.has(platformName)) {
		return apiCache.randomHero.get(platformName);
	}

	try {
		const response = await fetch(
			`${API_BASE_URL}/api/plugins/${platformName}/random?count=${count}`,
			{
				headers: { "Content-Type": "application/json" },
			},
		);
		if (response.ok) {
			const data = await response.json();
			const contents = Array.isArray(data) ? data : data?.results;
			if (Array.isArray(contents) && contents.length > 0) {
				apiCache.randomHero.set(platformName, contents);
				return contents;
			}
		}
	} catch (error) {
		console.warn(
			"API random contents request failed, using fallback:",
			error.message,
		);
	}

	return [];
}

/**
 * Fetch plugin health / circuit-breaker status.
 *
 * Backend bu hafif ucu periyodik kontrol için açık tutuyor: devrede eklenti
 * yoksa cevap yüz baytın altında (ölçüldü: 65 bayt). `/api/plugins` ile
 * farkı, ÖNBELLEKLENMEMESİ — devre durumu çalışma zamanında değişiyor.
 *
 * @returns {Promise<{kullanim_disi: Array, kullanim_disi_sayisi: number, toplam_eklenti: number}>}
 */
export async function fetchPluginStatus() {
	try {
		const response = await fetch(`${API_BASE_URL}/api/plugins/status`, {
			headers: { "Content-Type": "application/json" },
		});
		if (response.ok) {
			return await response.json();
		}
	} catch (error) {
		// Yoklama arızası sessizce geçilir: kullanıcıyı rahatsız etmemeli,
		// sıradaki tur yeniden deneyecek.
		console.warn("API plugin status request failed:", error?.message);
	}
	return null;
}

/**
 * "Kullanım dışı" durumunu platform listesine uygular.
 *
 * `kullanim_disi` yalnızca ŞU AN devrede olanları içerir — düzeltilmiş
 * kaynakları içermez. Bu yüzden liste "mutlak durum" olarak değil, "şu an
 * devrede olan küme" olarak yorumlanmalıdır:
 *
 *   - Kümede olan kaynak  → `devrede: true`, `kullanilabilir: false`
 *   - Kümede olmayan kaynak → `devrede: false`, `kullanilabilir: true`
 *
 * Bu ikinci madde kritik. Boş küme geldiğinde liste DOKUNULMAZSA, daha önce
 * işaretlenen kaynak kendiliğinden iyileştiğinde kartı hâlâ "Kullanım dışı"
 * rozetiyle ve tıklanamaz gösterir; kullanıcı uygulamayı yeniden başlatana
 * kadar kaynak seçilemez. (Bu hata canlı testte gerçekten yaşandı.)
 *
 * Gereksiz render'ı önlemek için: hiçbir kaydın durumu değişmiyorsa AYNI
 * referans döner.
 *
 * @param {Array} platformList - Mevcut liste (dönüşmez, yerinde güncellenir)
 * @param {Array} kullanimDisi - Backend'in döndürdüğü `durum.kullanim_disi`
 * @returns {Array} - Uygulanmış liste (değişmediyse AYNI referans)
 */
export function applyDisabledPlugins(platformList, kullanimDisi) {
	if (!Array.isArray(platformList) || platformList.length === 0) {
		return platformList;
	}

	// Boş küme GEÇERLİDİR ve "artık devrede olan yok" demektir.
	const devreliKayitlar = Array.isArray(kullanimDisi) ? kullanimDisi : [];
	const devredeAdlar = new Set(
		devreliKayitlar.map((k) => k?.eklenti || k?.ad).filter(Boolean),
	);
	const mesajHaritasi = new Map(
		devreliKayitlar.map((k) => [k?.eklenti || k?.ad, k]),
	);

	let degisti = false;
	const sonuc = platformList.map((p) => {
		const ad = p?.name || p?.id;

		if (devredeAdlar.has(ad)) {
			const kayit = mesajHaritasi.get(ad);
			const mesaj =
				kayit?.mesaj || p.durum_mesaji || "Şu anda kullanım dışı.";
			const sonHata = kayit?.son_hata || p.son_hata;
			// Zaten doğru durumdaysa yeni nesne üretme.
			if (
				p.devrede === true &&
				p.kullanilabilir === false &&
				p.durum_mesaji === mesaj &&
				(p.son_hata ?? null) === (sonHata ?? null)
			) {
				return p;
			}
			degisti = true;
			return {
				...p,
				devrede: true,
				kullanilabilir: false,
				durum_mesaji: mesaj,
				son_hata: sonHata,
			};
		}

		// Kümede değil → devrede değildir. Önceki rozeti TEMİZLE.
		const temizMi =
			!p.devrede && p.kullanilabilir !== false && !p.durum_mesaji;
		if (temizMi) return p;
		degisti = true;
		return {
			...p,
			devrede: false,
			kullanilabilir: true,
			durum_mesaji: null,
		};
	});

	return degisti ? sonuc : platformList;
}

/**
 * Fetch content details
 */
export async function fetchContentDetails(contentId) {
	try {
		if (FALLBACK_CONTENT_DETAILS[contentId]) {
			return FALLBACK_CONTENT_DETAILS[contentId];
		}
	} catch (error) {
		console.warn("API fetchContentDetails error:", error.message);
	}
	return null;
}

/**
 * Fetch related content
 */
export async function fetchRelatedContent(contentType, currentId) {
	// Şu anda backend'de spesifik related endpoint'i yoksa boş liste dön
	return [];
}

/**
 * Search content in all plugins
 *
 * ⚠️ DÖNÜŞ DEĞİŞTİ: artık `{ results, durum }` döner.
 *
 * Backend, yalnızca bir kaynak çöktüğünde gövdeye `durum` alanı ekler:
 *   { total, results, durum: { tam, kismi, mesaj, kullanim_disi: [...] } }
 *
 * Bu alan UI'da "şu kaynak kullanım dışı" bildirimi için gerekliydi ve
 * daha önce sessizce düşürülüyordu — kullanıcı "sonuçlar neden az" sorusunun
 * cevabını alamıyordu.
 *
 * @returns {Promise<{results: Array, durum: object|null}>}
 */
export async function searchContent(query) {
	try {
		const response = await fetch(
			`${API_BASE_URL}/api/search?q=${encodeURIComponent(query)}`,
			{
				headers: { "Content-Type": "application/json" },
			},
		);
		if (response.ok) {
			const data = await response.json();
			const contents = Array.isArray(data) ? data : data?.results;
			if (Array.isArray(contents)) {
				return { results: contents, durum: data?.durum ?? null };
			}
		}
	} catch (error) {
		console.warn("API searchContent error:", error.message);
	}
	return { results: [], durum: null };
}

/**
 * Search content in a specific plugin
 *
 * Tek eklenti aramasıdır; backend bütün-kaynak `durum` alanını üretmez.
 * Yine de döndürdüğümüz şekil `searchContent` ile aynı olsun ki çağıran taraf
 * tek bir veri yapısı beklesin.
 *
 * @returns {Promise<{results: Array, durum: object|null}>}
 */
export async function searchPluginContent(pluginName, query) {
	try {
		const response = await fetch(
			`${API_BASE_URL}/api/plugins/${encodeURIComponent(pluginName)}/search?q=${encodeURIComponent(query)}`,
			{
				headers: { "Content-Type": "application/json" },
			},
		);
		if (response.ok) {
			const data = await response.json();
			const contents = Array.isArray(data) ? data : data?.results;
			if (Array.isArray(contents)) {
				return { results: contents, durum: data?.durum ?? null };
			}
		}
	} catch (error) {
		console.warn("API searchPluginContent error:", error.message);
	}
	return { results: [], durum: null };
}

/**
 * Extract video stream sources from target URL
 * @param {string} url - Target movie or series/episode URL
 * @returns {Promise<Array>} Array of extractor results: [{ extractor, result: { name, url, referer, headers, subtitles } }]
 */
export async function extractVideoSources(url) {
	try {
		const response = await fetch(`${API_BASE_URL}/api/extract`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ url }),
		});
		if (response.ok) {
			const data = await response.json();
			if (Array.isArray(data)) {
				return data.map((item) => {
					const streamUrl = item?.result?.url || "";
					const isHls =
						item?.result?.is_hls === true ||
						item?.result?.type === "m3u8" ||
						item?.result?.type === "hls" ||
						streamUrl.includes(".m3u8") ||
						streamUrl.includes("/hls/") ||
						streamUrl.includes("/hls2/") ||
						streamUrl.includes(".urlset") ||
						streamUrl.includes("master.txt") ||
						streamUrl.includes("sublist") ||
						streamUrl.includes("/q/") ||
						streamUrl.includes("molystream") ||
						streamUrl.includes("cdnimage") ||
						item?.extractor?.toLowerCase()?.includes("close") ||
						item?.extractor?.toLowerCase()?.includes("rapidrame") ||
						item?.extractor?.toLowerCase()?.includes("rapidvid");

					return {
						...item,
						result: {
							...item.result,
							is_hls: isHls ? true : item?.result?.is_hls,
							type: isHls ? "m3u8" : item?.result?.type || "mp4",
						},
					};
				});
			}
		} else {
			console.warn("API extract failed with status:", response.status);
		}
	} catch (error) {
		console.warn("API extractVideoSources error:", error.message);
	}
	return [];
}

export default {
	fetchPlatforms,
	fetchPlatformMainPage,
	fetchPlatformCategories,
	fetchRandomContents,
	fetchPluginDetail,
	fetchPluginStatus,
	applyDisabledPlugins,
	fetchContentDetails,
	fetchRelatedContent,
	searchContent,
	searchPluginContent,
	extractVideoSources,
	getCachedPlatforms,
	getCachedCategories,
	getCachedHeroMovie,
	getCachedCategoryMovies,
	clearPluginCache,
};
