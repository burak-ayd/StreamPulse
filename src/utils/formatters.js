/**
 * Format runtime in minutes to "Xs XXdk" format
 * @param {number} minutes - Runtime in minutes
 * @returns {string} Formatted runtime (e.g., "2s 46dk")
 */
export function formatRuntime(minutes) {
	if (!minutes || minutes <= 0) return "N/A";

	const hours = Math.floor(minutes / 60);
	const mins = minutes % 60;

	if (hours === 0) return `${mins}dk`;
	if (mins === 0) return `${hours}s`;

	return `${hours}s ${mins}dk`;
}

/**
 * Extract year from date string
 * @param {string} dateString - ISO date string
 * @returns {string} Year (e.g., "2024")
 */
export function formatYear(dateString) {
	if (!dateString) return "N/A";

	try {
		return new Date(dateString).getFullYear().toString();
	} catch {
		return "N/A";
	}
}

/**
 * Format rating to one decimal place
 * @param {number} rating - Rating value (0-10)
 * @returns {string} Formatted rating (e.g., "8.6")
 */
export function formatRating(rating) {
	if (rating === null || rating === undefined) return "N/A";
	return rating.toFixed(1);
}

/**
 * Format vote count with K suffix for thousands
 * @param {number} count - Vote count
 * @returns {string} Formatted count (e.g., "1.2K")
 */
export function formatVoteCount(count) {
	if (!count || count === 0) return "0";

	if (count >= 1000000) {
		return `${(count / 1000000).toFixed(1)}M`;
	}

	if (count >= 1000) {
		return `${(count / 1000).toFixed(1)}K`;
	}

	return count.toString();
}

/**
 * Format status to Turkish
 * @param {string} status - Status value
 * @returns {string} Turkish status
 */
export function formatStatus(status) {
	const statusMap = {
		"rumored": "Söylenti",
		"pre-production": "Ön Yapım",
		"in-production": "Yapım Aşamasında",
		"post-production": "Post Prodüksiyon",
		"released": "Yayında",
		"canceled": "İptal Edildi",
		"ended": "Bitti",
		"returning-series": "Devam Ediyor",
		"pilot": "Pilot",
	};

	return statusMap[status] || status;
}

/**
 * Format content type to Turkish
 * @param {string} contentType - 'movie' or 'series'
 * @returns {string} Turkish content type
 */
export function formatContentType(contentType) {
	return contentType === "movie" ? "Film" : "Dizi";
}

/**
 * Get country flag emoji
 * @param {string} country - Country name or ISO code (e.g. "ABD", "US", "Türkiye", "TR")
 * @returns {string} Flag emoji or empty string
 */
export function getCountryFlag(country) {
	if (!country || typeof country !== "string") return "";

	const clean = country.trim();
	const lower = clean.toLowerCase();

	const countryToCode = {
		"abd": "US",
		"usa": "US",
		"us": "US",
		"amerika": "US",
		"amerika birleşik devletleri": "US",
		"türkiye": "TR",
		"turkey": "TR",
		"tr": "TR",
		"ingiltere": "GB",
		"ingıltere": "GB",
		"birleşik krallık": "GB",
		"uk": "GB",
		"gb": "GB",
		"fransa": "FR",
		"france": "FR",
		"fr": "FR",
		"almanya": "DE",
		"germany": "DE",
		"de": "DE",
		"italya": "IT",
		"italy": "IT",
		"it": "IT",
		"ispanya": "ES",
		"spain": "ES",
		"es": "ES",
		"japonya": "JP",
		"japan": "JP",
		"jp": "JP",
		"güney kore": "KR",
		"kore": "KR",
		"korea": "KR",
		"kr": "KR",
		"kanada": "CA",
		"canada": "CA",
		"ca": "CA",
		"rusya": "RU",
		"russia": "RU",
		"ru": "RU",
		"hindistan": "IN",
		"india": "IN",
		"in": "IN",
		"avustralya": "AU",
		"australia": "AU",
		"au": "AU",
		"çin": "CN",
		"china": "CN",
		"cn": "CN",
	};

	const isoCode =
		countryToCode[lower] ||
		(clean.length === 2 ? clean.toUpperCase() : null);

	if (isoCode && isoCode.length === 2) {
		const codePoints = isoCode
			.split("")
			.map((char) => 127397 + char.charCodeAt(0));
		return String.fromCodePoint(...codePoints);
	}

	return "";
}

/**
 * Format language information for display in compact badges (e.g. movie cards)
 * @param {string|string[]|object} rawLang - Raw language value from API
 * @returns {string|null} Formatted compact language string or null
 */
export function formatLanguageBadge(rawLang) {
	if (!rawLang) return null;

	let text = "";
	if (Array.isArray(rawLang)) {
		if (rawLang.length === 0) return null;
		const strList = rawLang
			.map((item) =>
				typeof item === "string"
					? item
					: item?.name || item?.language || item?.title || "",
			)
			.filter(Boolean);
		text = strList.join(" ");
	} else if (typeof rawLang === "object") {
		text =
			rawLang.name ||
			rawLang.language ||
			rawLang.title ||
			rawLang.code ||
			"";
	} else {
		text = String(rawLang);
	}

	text = text.trim();
	if (!text) return null;

	const lower = text.toLowerCase();

	// Check common Turkish scraper / streaming patterns
	const hasDub = lower.includes("dublaj") || lower.includes("dub");
	const hasSub =
		lower.includes("altyazı") ||
		lower.includes("altyazi") ||
		lower.includes("sub");

	if (hasDub && hasSub) {
		return "DUB • ALT";
	}
	if (hasDub) {
		return "DUBLAJ";
	}
	if (hasSub) {
		return "ALTYAZI";
	}
	if (lower === "dual" || lower.includes("dual")) {
		return "DUAL";
	}
	if (
		lower.includes("orijinal") ||
		lower.includes("original") ||
		lower === "orj"
	) {
		return "ORJ";
	}

	// Single language codes or names
	if (
		lower === "tr" ||
		lower === "tur" ||
		lower === "türkçe" ||
		lower === "turkish"
	) {
		return "TR";
	}
	if (
		lower === "en" ||
		lower === "eng" ||
		lower === "ingilizce" ||
		lower === "english"
	) {
		return "EN";
	}
	if (
		lower === "de" ||
		lower === "ger" ||
		lower === "almanca" ||
		lower === "german"
	) {
		return "DE";
	}
	if (
		lower === "fr" ||
		lower === "fra" ||
		lower === "fransızca" ||
		lower === "french"
	) {
		return "FR";
	}
	if (
		lower === "es" ||
		lower === "spa" ||
		lower === "ispanyolca" ||
		lower === "spanish"
	) {
		return "ES";
	}
	if (
		lower === "ja" ||
		lower === "jpn" ||
		lower === "japonca" ||
		lower === "japanese"
	) {
		return "JA";
	}
	if (
		lower === "ko" ||
		lower === "kor" ||
		lower === "korece" ||
		lower === "korean"
	) {
		return "KO";
	}

	if (lower.includes("yabancı") || lower.includes("yabanci")) {
		return "YABANCI";
	}
	if (lower.includes("yerli")) {
		return "YERLİ";
	}
	if (lower.includes("anime")) {
		return "ANİME";
	}
	if (lower.includes("belgesel")) {
		return "BELGESEL";
	}

	// Short code like "tr-tr", "en-us"
	if (text.length <= 5) {
		return text.toUpperCase();
	}

	const firstWord = text.split(/[\s•\-_/]+/)[0];
	if (firstWord && firstWord.length <= 8) {
		return firstWord.toUpperCase();
	}

	return text.substring(0, 8).toUpperCase();
}

/**
 * Format language for banner / detailed view
 * @param {string|string[]|object} rawLang
 * @returns {string|null}
 */
export function formatLanguageDetailed(rawLang) {
	if (!rawLang) return null;

	let text = "";
	if (Array.isArray(rawLang)) {
		if (rawLang.length === 0) return null;
		const strList = rawLang
			.map((item) =>
				typeof item === "string"
					? item
					: item?.name || item?.language || item?.title || "",
			)
			.filter(Boolean);
		text = strList.join(" & ");
	} else if (typeof rawLang === "object") {
		text =
			rawLang.name ||
			rawLang.language ||
			rawLang.title ||
			rawLang.code ||
			"";
	} else {
		text = String(rawLang);
	}

	text = text.trim();
	if (!text) return null;

	const lower = text.toLowerCase();

	if (
		(lower.includes("dublaj") || lower.includes("dub")) &&
		(lower.includes("altyazı") || lower.includes("altyazi") || lower.includes("sub"))
	) {
		return "Dublaj & Altyazılı";
	}
	if (lower.includes("dublaj") || lower === "dub") {
		return "Türkçe Dublaj";
	}
	if (
		lower.includes("altyazı") ||
		lower.includes("altyazi") ||
		lower === "altyazi" ||
		lower === "altyazı" ||
		lower === "sub"
	) {
		return "Türkçe Altyazılı";
	}
	if (lower === "dual") return "Dual (Dublaj/Altyazı)";
	if (lower.includes("orijinal") || lower.includes("original")) return "Orijinal Dil";
	if (lower.includes("yabancı") || lower.includes("yabanci")) return "Yabancı";
	if (lower.includes("yerli")) return "Yerli";

	if (lower === "tr" || lower === "tur") return "Türkçe";
	if (lower === "en" || lower === "eng") return "İngilizce";
	if (lower === "de" || lower === "ger") return "Almanca";
	if (lower === "fr" || lower === "fra") return "Fransızca";
	if (lower === "es" || lower === "spa") return "İspanyolca";
	if (lower === "ja" || lower === "jpn") return "Japonca";
	if (lower === "ko" || lower === "kor") return "Korece";

	return text;
}
