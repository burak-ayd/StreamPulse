/**
 * Profil Ekranı — Biçimlendirme Yardımcıları
 *
 * ⚠️ VERİ GERÇEKLİĞİ KURALI
 *
 * Bu ekranın referans tasarımında puan (★ 8.9), tür (Biyografi), kalite
 * (4K UHD / IMAX / Dolby Atmos) ve dublaj (TR Dublaj) rozetleri var. Bu
 * alanların HİÇBİRİ `fieldWhitelist.js` → `LIBRARY_FIELDS` içinde yok, yani
 * senkronizasyonla da taşınmıyor ve sunucudan da gelmeyecek.
 *
 * Burada yalnızca GERÇEKTEN var olan alanlardan metin üretiyoruz. Olmayan
 * veri için uydurma değer döndürmüyoruz; rozet bileşenleri veri yoksa
 * `null` render ediyor. Böylece ekran mock'ta doğru görünür, uygulamada
 * yalan söylemez ve veri modeli genişlediğinde rozetler kendiliğinden
 * belirir.
 *
 * Kullanılabilir alanlar:
 *   id, url, title, poster, type, plugin, year, season, episode,
 *   seriesId, seriesTitle, episodeTitle, currentTime, duration,
 *   progress, watchedAt, isCompleted, updatedAt
 *
 * Dizi/Film tespiti bu dosyada değil, `utils/mediaType.js`'dedir.
 */

import { isSeriesContent, typeLabel } from "@/utils/mediaType";

const MINUTE = 60;
const HOUR = 3600;

/**
 * İçeriğin gerçekten dizi/sezon bazlı olup olmadığı.
 *
 * ⚠️ Bu artık kendi mantığı YOK: tek kaynak `utils/mediaType.js`
 * (`isSeriesContent`). Projede bu soru beş dosyada beş farklı zincirle
 * cevaplandığı için favorilerde "Dizi" içerikleri "Film" olarak
 * sınıflandırılıyordu; bkz. `mediaType.js` başındaki açıklama.
 *
 * @param {object} item
 * @returns {boolean}
 */
export function isSeries(item) {
	return isSeriesContent(item);
}

/** Tür etiketini tekil olarak döndürür: dizi → "Dizi", aksi → "Film". */
export function contentTypeLabel(item) {
	return typeLabel(item);
}

/**
 * "2s 44dk" / "1sa 12dk" / "44dk" — süreyi kısa biçimde yazar.
 * @param {number} seconds
 * @returns {string}
 */
export function formatDurationShort(seconds) {
	const total = Math.max(0, Math.floor(Number(seconds) || 0));
	if (!total) return "";

	const hours = Math.floor(total / HOUR);
	const minutes = Math.floor((total % HOUR) / MINUTE);

	if (hours && minutes) return `${hours}sa ${minutes}dk`;
	if (hours) return `${hours}sa`;
	return `${minutes}dk`;
}

/**
 * Kalan süre metni: "24 dk kaldı", "1 sa 12 dk kaldı".
 * Süre bilinmiyorsa boş döner (rozet boş yerde "0 dk kaldı" yazmaz).
 *
 * @param {object} item
 * @returns {string}
 */
export function formatTimeLeft(item) {
	const duration = Number(item?.duration) || 0;
	const current = Number(item?.currentTime) || 0;
	if (!duration || duration <= 0) return "";

	const remaining = duration - current;
	if (remaining <= 0) return "";

	return `${formatDurationShort(remaining)} kaldı`;
}

/**
 * İlerleme yüzdesi 0–100.
 *
 * Öncelik `progress` alanıdır (0–1 veya 0–100 olabilir), yoksa
 * currentTime/duration oranından hesaplanır.
 *
 * @param {object} item
 * @returns {number}
 */
export function progressPercent(item) {
	if (!item) return 0;

	const raw = Number(item.progress);
	if (Number.isFinite(raw) && raw > 0) {
		return Math.min(100, Math.max(0, raw <= 1 ? raw * 100 : raw));
	}

	const duration = Number(item.duration) || 0;
	const current = Number(item.currentTime) || 0;
	if (duration > 0 && current > 0) {
		return Math.min(100, Math.max(0, (current / duration) * 100));
	}
	return 0;
}

/**
 * Sezon/bölüm satırı: "S1:B4 • 4. Bölüm" veya "S2 • 3. Bölüm".
 * Dizi değilse veya sezon bilgisi yoksa boş döner.
 *
 * @param {object} item
 * @returns {string}
 */
export function formatSeasonEpisode(item) {
	if (!isSeries(item)) return "";

	const season = item.season ?? item.initialSeason;
	const episode = item.episode ?? item.initialEpisode;
	const parts = [];

	if (season !== undefined && season !== null && season !== "") {
		parts.push(`S${season}`);
	}
	if (episode !== undefined && episode !== null && episode !== "") {
		parts.push(`B${episode}`);
	}
	if (!parts.length) return "";

	const code = parts.join(":");
	const title = item.episodeTitle?.trim();
	return title ? `${code} • ${title}` : code;
}

/**
 * Kart altındaki meta satırı.
 *
 * Gerçekte elimizde yalnızca `type` ve `year` var; tasarımdaki tür
 * ("Biyografi", "Bilim Kurgu") veri modelinde yok, bu yüzden yazılmaz.
 * Yalnızca gerçekten bir şey varsa döner — "Film • " gibi yarım
 * noktalama asla üretilmez.
 *
 * @param {object} item
 * @returns {string}
 */
export function formatMetaLine(item) {
	const parts = [];
	const typeLabel = contentTypeLabel(item);
	if (typeLabel) parts.push(typeLabel);

	if (item?.year) parts.push(String(item.year));

	return parts.join(" • ");
}

/**
 * İzleme geçmişi zaman etiketi: "Dün 22:40", "Bugün 14:05", "3 gün önce".
 *
 * @param {string|number|Date} value - ISO tarih
 * @returns {string}
 */
export function formatWatchedAt(value) {
	if (!value) return "";

	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return "";

	const time = date.toLocaleTimeString("tr-TR", {
		hour: "2-digit",
		minute: "2-digit",
	});

	const startOfToday = new Date();
	startOfToday.setHours(0, 0, 0, 0);
	const diffDays = Math.floor((startOfToday - date) / 86_400_000);

	if (diffDays <= 0) return `Bugün ${time}`;
	if (diffDays === 1) return `Dün ${time}`;
	if (diffDays < 7) return `${diffDays} gün önce`;

	return date.toLocaleDateString("tr-TR", {
		day: "numeric",
		month: "long",
	});
}

/**
 * "Tamamlandı" / "Sezon Finali" yerine elimizde tek gerçek bayrak var:
 * `isCompleted`. Tasarımdaki "Sezon Finali" bir dizi bilgisi gerektirir
 * (sezonun son bölümü) ve bu veri yoktur — uydurulmaz.
 *
 * @param {object} item
 * @returns {string} Durum metni veya boş
 */
export function formatWatchedStatus(item) {
	if (!item) return "";
	if (item.isCompleted) return "Tamamlandı";
	return "";
}

/**
 * İçeriğin en iyi poster adresi.
 * @param {object} item
 * @returns {string|null}
 */
export function posterOf(item) {
	return (
		item?.poster ||
		item?.poster_url ||
		item?.image ||
		item?.backdrop_url ||
		null
	);
}

/**
 * Kararlı liste anahtarı.
 * @param {object} item
 * @param {number} index
 * @returns {string}
 */
export function itemKey(item, index) {
	return String(item?.id || item?.url || item?.seriesId || index);
}

/**
 * Favorileri filtre çubuğuna göre ayırır.
 * @param {Array} list
 * @param {"all"|"movie"|"series"} filter
 * @returns {Array}
 */
export function filterFavorites(list, filter) {
	if (!Array.isArray(list)) return [];
	if (filter === "movie") return list.filter((i) => !isSeries(i));
	if (filter === "series") return list.filter((i) => isSeries(i));
	return list;
}

/**
 * Eklenti adını EKRANDA gösterilecek biçime getirir.
 *
 * ⚠️ Sorun: `resolvePluginName` (`utils/storage.js:1941`) iki farklı kaynaktan
 * ad döndürüyor — kayıttaki `plugin` alanı (yazanın verdiği yazım, örn.
 * "HDFilmCehennemi") veya URL'den türetilen slug (her zaman küçük harf, örn.
 * "hdfilmcehennemi"). Aynı listede iki farklı yazım yan yana görünüyordu.
 *
 * Burada slug'ları kanonik görünen adına eşliyoruz. Bilinmeyen bir slug
 * gelirse DOKUNULMAZ (kullanıcının eklenti adı neyse o yazılır) — uydurma
 * isim gösterilmez.
 */
const PLUGIN_DISPLAY_NAMES = {
	dizibox: "Dizibox",
	hdfilmcehennemi: "HDFilmCehennemi",
	filmmodu: "FilmModu",
	dizipal: "Dizipal",
	sezonlukdizi: "SezonlukDizi",
	diziyou: "DiziYou",
	sinefy: "Sinefy",
	fullhdfilmizlesene: "FullHdFilmİzleSene",
};

/**
 * @param {string|null|undefined} name
 * @returns {string|null}
 */
export function formatPluginName(name) {
	if (!name || typeof name !== "string") return null;
	const key = name.trim().toLowerCase();
	if (!key) return null;
	return PLUGIN_DISPLAY_NAMES[key] ?? name.trim();
}

/**
 * Sıralama.
 *
 * `addedAt` referans tasarımdaki "Son Eklenenler" sıralamasıdır. Favori
 * kaydında `addedAt` olmayabilir; o zaman `watchedAt`/`updatedAt` ve en
 * sonda kararlı başlık sırası kullanılır — sıralamanın her koşulda
 * DETERMİSTİK olması gerekir, yoksa FlatList her render'da kayıt
 * yer değiştirir.
 *
 * @param {Array} list
 * @param {"added"|"title"} sort
 * @param {"asc"|"desc"} dir
 * @returns {Array} Yeni dizi (kaynak dizi MUTASYONLANMAZ)
 */
export function sortItems(list, sort = "added", dir = "desc") {
	if (!Array.isArray(list)) return [];

	const sign = dir === "asc" ? 1 : -1;

	return [...list].sort((a, b) => {
		if (sort === "title") {
			const at = (a?.title || "").localeCompare(b?.title || "", "tr");
			return at !== 0 ? at * sign : 0;
		}

		const timeOf = (item) => {
			const raw =
				item?.addedAt || item?.updatedAt || item?.watchedAt || null;
			const t = raw ? new Date(raw).getTime() : NaN;
			return Number.isNaN(t) ? 0 : t;
		};

		const diff = timeOf(a) - timeOf(b);
		if (diff !== 0) return diff * sign;
		return (a?.title || "").localeCompare(b?.title || "", "tr");
	});
}
