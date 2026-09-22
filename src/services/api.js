const API_BASE_URL =
	process.env.EXPO_PUBLIC_API_URL || "https://api.example.com";
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

/**
 * Fetch plugin content detail
 */
export async function fetchPluginDetail(pluginName, url) {
	try {
		const response = await fetch(
			`${API_BASE_URL}/plugins/${pluginName}/detail?url=${encodeURIComponent(url)}`,
			{
				headers: { "Content-Type": "application/json" },
			},
		);
		if (response.ok) {
			const data = await response.json();
			return data?.detail || data;
		}
	} catch (error) {
		console.warn("API plugin detail request failed:", error.message);
	}

	return null;
}

/**
 * Fetch Platform Main Page
 */
export async function fetchPlatformMainPage(platformName, categoryURL) {
	try {
		const response = await fetch(
			`${API_BASE_URL}/plugins/${platformName}/main-page?url=${encodeURIComponent(categoryURL)}`,
			{
				headers: { "Content-Type": "application/json" },
			},
		);
		if (response.ok) {
			return await response.json();
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
 */
export async function fetchPlatformCategories(platformName) {
	try {
		const response = await fetch(
			`${API_BASE_URL}/plugins/${platformName}/categories`,
			{
				headers: { "Content-Type": "application/json" },
			},
		);
		if (response.ok) {
			return await response.json();
		}
	} catch (error) {
		console.warn(
			"API platform categories request failed, using fallback:",
			error.message,
		);
	}

	return [];
}

/**
 * Fetch streaming platforms
 */
export async function fetchPlatforms() {
	try {
		const response = await fetch(`${API_BASE_URL}/plugins`, {
			headers: { "Content-Type": "application/json" },
		});
		if (response.ok) {
			const data = await response.json();
			const plugins = Array.isArray(data) ? data : data?.plugins;
			if (Array.isArray(plugins) && plugins.length > 0) return plugins;
		}
	} catch (error) {
		console.warn(
			"API platforms request failed, using fallback:",
			error.message,
		);
	}

	return [];
}

/**
 * Fetch random contents
 */
export async function fetchRandomContents(platformName, count = 1) {
	try {
		const response = await fetch(
			`${API_BASE_URL}/plugins/${platformName}/random?count=${count}`,
			{
				headers: { "Content-Type": "application/json" },
			},
		);
		if (response.ok) {
			const data = await response.json();
			const contents = Array.isArray(data) ? data : data?.results;
			if (Array.isArray(contents) && contents.length > 0) return contents;
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
	try {
		// Şu anda backend'de spesifik related endpoint'i yoksa boş liste dön
		return [];
	} catch (error) {
		console.warn("API fetchRelatedContent error:", error.message);
	}
	return [];
}

/**
 * Search content
 */
export async function searchContent(query) {
	try {
		const response = await fetch(
			`${API_BASE_URL}/search?q=${encodeURIComponent(query)}`,
			{
				headers: { "Content-Type": "application/json" },
			},
		);
		if (response.ok) {
			const data = await response.json();
			const contents = Array.isArray(data) ? data : data?.results;
			if (Array.isArray(contents)) return contents;
		}
	} catch (error) {
		console.warn("API searchContent error:", error.message);
	}
	return [];
}

export default {
	fetchPlatforms,
	fetchPlatformMainPage,
	fetchPlatformCategories,
	fetchRandomContents,
	fetchPluginDetail,
	fetchContentDetails,
	fetchRelatedContent,
	searchContent,
};
