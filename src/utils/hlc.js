/**
 * Hybrid Logical Clock (HLC) — Kulkarni et al.
 *
 * Deterministik sıralama sağlar: (wall, counter, deviceId)
 * Sunucu LWW kararını bu tuple ile verir.
 *
 * Saf JS, sıfır bağımlılık. ~50 satır.
 */

/**
 * Yeni HLC üretir. Fiziksel saat ile önceki HLC'nin maksimumunu alır.
 * @param {object|null} prev - Önceki HLC: { wall, counter }
 * @returns {{ wall: number, counter: number }}
 */
export function now(prev = null) {
	const physicalNow = Date.now();

	if (!prev) {
		return { wall: physicalNow, counter: 0 };
	}

	if (physicalNow > prev.wall) {
		return { wall: physicalNow, counter: 0 };
	}

	// Fiziksel saat ilerlemedi — mantıksal sayacı artır
	return { wall: prev.wall, counter: (prev.counter || 0) + 1 };
}

/**
 * Gelen HLC ile yerel HLC'yi birleştirir (receive/update).
 * İki tarafın en yükseğini alır, counter ayarlar.
 * @param {object} local  - Yerel HLC: { wall, counter }
 * @param {object} remote - Uzak HLC: { wall, counter }
 * @returns {{ wall: number, counter: number }}
 */
export function update(local, remote) {
	const physicalNow = Date.now();

	const maxWall = Math.max(physicalNow, local?.wall || 0, remote?.wall || 0);

	if (maxWall === physicalNow && maxWall > (local?.wall || 0) && maxWall > (remote?.wall || 0)) {
		return { wall: maxWall, counter: 0 };
	}

	if (maxWall === (local?.wall || 0) && maxWall === (remote?.wall || 0)) {
		return {
			wall: maxWall,
			counter: Math.max(local?.counter || 0, remote?.counter || 0) + 1,
		};
	}

	if (maxWall === (local?.wall || 0)) {
		return { wall: maxWall, counter: (local?.counter || 0) + 1 };
	}

	if (maxWall === (remote?.wall || 0)) {
		return { wall: maxWall, counter: (remote?.counter || 0) + 1 };
	}

	return { wall: maxWall, counter: 0 };
}

/**
 * İki HLC'yi karşılaştırır. LWW sıralama anahtarı.
 * @param {{ wall: number, counter: number, deviceId?: string }} a
 * @param {{ wall: number, counter: number, deviceId?: string }} b
 * @returns {number}  negatif: a < b, pozitif: a > b, 0: eşit
 */
export function compare(a, b) {
	if (!a && !b) return 0;
	if (!a) return -1;
	if (!b) return 1;

	const wallDiff = (a.wall || 0) - (b.wall || 0);
	if (wallDiff !== 0) return wallDiff;

	const counterDiff = (a.counter || 0) - (b.counter || 0);
	if (counterDiff !== 0) return counterDiff;

	// Son çare: deviceId ile leksikografik karşılaştırma
	const aId = a.deviceId || "";
	const bId = b.deviceId || "";
	if (aId < bId) return -1;
	if (aId > bId) return 1;

	return 0;
}

/**
 * HLC'yi API sözleşmesine uygun objeye çevirir.
 * @param {{ wall: number, counter: number }} hlc
 * @returns {{ wall: number, counter: number }}
 */
export function toPayload(hlc) {
	return { wall: hlc.wall, counter: hlc.counter };
}

/**
 * API yanıtından HLC'yi ayrıştırır.
 * @param {{ wall: number, counter: number }} payload
 * @returns {{ wall: number, counter: number }}
 */
export function fromPayload(payload) {
	return {
		wall: payload?.wall || 0,
		counter: payload?.counter || 0,
	};
}
