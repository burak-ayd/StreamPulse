/**
 * Format runtime in minutes to "Xs XXdk" format
 * @param {number} minutes - Runtime in minutes
 * @returns {string} Formatted runtime (e.g., "2s 46dk")
 */
export function formatRuntime(minutes) {
  if (!minutes || minutes <= 0) return 'N/A';
  
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
  if (!dateString) return 'N/A';
  
  try {
    return new Date(dateString).getFullYear().toString();
  } catch {
    return 'N/A';
  }
}

/**
 * Format rating to one decimal place
 * @param {number} rating - Rating value (0-10)
 * @returns {string} Formatted rating (e.g., "8.6")
 */
export function formatRating(rating) {
  if (rating === null || rating === undefined) return 'N/A';
  return rating.toFixed(1);
}

/**
 * Format vote count with K suffix for thousands
 * @param {number} count - Vote count
 * @returns {string} Formatted count (e.g., "1.2K")
 */
export function formatVoteCount(count) {
  if (!count || count === 0) return '0';
  
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
    'rumored': 'Söylenti',
    'pre-production': 'Ön Yapım',
    'in-production': 'Yapım Aşamasında',
    'post-production': 'Post Prodüksiyon',
    'released': 'Yayında',
    'canceled': 'İptal Edildi',
    'ended': 'Bitti',
    'returning-series': 'Devam Ediyor',
    'pilot': 'Pilot'
  };
  
  return statusMap[status] || status;
}

/**
 * Format content type to Turkish
 * @param {string} contentType - 'movie' or 'series'
 * @returns {string} Turkish content type
 */
export function formatContentType(contentType) {
  return contentType === 'movie' ? 'Film' : 'Dizi';
}

/**
 * Get country flag emoji
 * @param {string} country - Country name or ISO code (e.g. "ABD", "US", "Türkiye", "TR")
 * @returns {string} Flag emoji or empty string
 */
export function getCountryFlag(country) {
  if (!country || typeof country !== 'string') return '';

  const clean = country.trim();
  const lower = clean.toLowerCase();

  const countryToCode = {
    'abd': 'US',
    'usa': 'US',
    'us': 'US',
    'amerika': 'US',
    'amerika birleşik devletleri': 'US',
    'türkiye': 'TR',
    'turkey': 'TR',
    'tr': 'TR',
    'ingiltere': 'GB',
    'ingıltere': 'GB',
    'birleşik krallık': 'GB',
    'uk': 'GB',
    'gb': 'GB',
    'fransa': 'FR',
    'france': 'FR',
    'fr': 'FR',
    'almanya': 'DE',
    'germany': 'DE',
    'de': 'DE',
    'italya': 'IT',
    'italy': 'IT',
    'it': 'IT',
    'ispanya': 'ES',
    'spain': 'ES',
    'es': 'ES',
    'japonya': 'JP',
    'japan': 'JP',
    'jp': 'JP',
    'güney kore': 'KR',
    'kore': 'KR',
    'korea': 'KR',
    'kr': 'KR',
    'kanada': 'CA',
    'canada': 'CA',
    'ca': 'CA',
    'rusya': 'RU',
    'russia': 'RU',
    'ru': 'RU',
    'hindistan': 'IN',
    'india': 'IN',
    'in': 'IN',
    'avustralya': 'AU',
    'australia': 'AU',
    'au': 'AU',
    'çin': 'CN',
    'china': 'CN',
    'cn': 'CN',
  };

  const isoCode = countryToCode[lower] || (clean.length === 2 ? clean.toUpperCase() : null);

  if (isoCode && isoCode.length === 2) {
    const codePoints = isoCode
      .split('')
      .map(char => 127397 + char.charCodeAt(0));
    return String.fromCodePoint(...codePoints);
  }

  return '';
}
