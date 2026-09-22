import {
	FEATURED_MOVIES,
	POPULAR_MOVIES,
	RECOMMENDED_MOVIES,
} from "@constants/data";

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
 * Fetch content details by id
 */
export async function fetchContentDetails(contentId) {
	try {
		const response = await fetch(`${API_BASE_URL}/contents/${contentId}`, {
			headers: { "Content-Type": "application/json" },
		});
		if (response.ok) {
			const data = await response.json();
			return data;
		}
	} catch (error) {
		console.warn(
			"API request failed, checking fallback data:",
			error.message,
		);
	}

	// Fallback to local data
	if (FALLBACK_CONTENT_DETAILS[contentId]) {
		return FALLBACK_CONTENT_DETAILS[contentId];
	}

	// Check featured and popular movies
	const found = [
		...FEATURED_MOVIES,
		...POPULAR_MOVIES,
		...RECOMMENDED_MOVIES,
	].find((m) => String(m.id) === String(contentId));

	if (found) {
		return {
			id: found.id,
			title: found.title,
			original_title: found.title,
			tagline: found.description || "Harika bir yapım",
			overview: found.description || `${found.title} filmi özeti.`,
			poster_url: found.poster || found.image,
			backdrop_url: found.poster || found.image,
			rating:
				typeof found.rating === "number"
					? found.rating
					: parseFloat(found.rating) || 8.0,
			vote_count: 50000,
			runtime_minutes: 145,
			release_date: "2024-01-01",
			country: "ABD",
			age_rating: "16+",
			content_type: "movie",
			status: "Released",
			director: "Yönetmen Bilgisi",
			production_co: "Yapım Şirketi",
			language: "tr",
			cast_members: ["Başrol 1", "Başrol 2", "Başrol 3"],
			trailer_url: "https://www.youtube.com",
		};
	}

	// Default template if id not found anywhere
	return {
		id: contentId,
		title: "Film Detayı",
		original_title: "Film Detayı",
		tagline: "Harika bir yapım",
		overview: "Bu içerik hakkında detaylı bilgi yakında eklenecektir.",
		poster_url:
			"https://images.unsplash.com/photo-1534447677768-be436bb09401?w=800&auto=format&fit=crop&q=60",
		backdrop_url:
			"https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?w=1200&auto=format&fit=crop&q=60",
		rating: 8.0,
		vote_count: 10000,
		runtime_minutes: 120,
		release_date: "2024-01-01",
		country: "TR",
		age_rating: "13+",
		content_type: "movie",
		status: "Released",
		director: "Yönetmen",
		production_co: "Stüdyo",
		language: "tr",
		cast_members: ["Oyuncu 1", "Oyuncu 2"],
		trailer_url: "https://www.youtube.com",
	};
}

/**
 * Fetch related contents
 */
export async function fetchRelatedContent(contentType, currentId) {
	try {
		const response = await fetch(
			`${API_BASE_URL}/contents/related?content_type=${encodeURIComponent(
				contentType,
			)}&current_id=${encodeURIComponent(currentId)}`,
			{ headers: { "Content-Type": "application/json" } },
		);
		if (response.ok) {
			return await response.json();
		}
	} catch (error) {
		console.warn(
			"API related content request failed, using fallback:",
			error.message,
		);
	}

	// Fallback to constants
	return POPULAR_MOVIES.filter(
		(item) => String(item.id) !== String(currentId),
	).map((item) => ({
		id: item.id,
		title: item.title,
		poster_url: item.image,
		rating: parseFloat(item.rating) || 8.0,
		content_type: contentType || "movie",
	}));
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

export default {
	fetchContentDetails,
	fetchRelatedContent,
	fetchPlatforms,
	DEFAULT_PLATFORMS,
};
