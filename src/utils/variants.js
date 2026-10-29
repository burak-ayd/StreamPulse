/*
 * Kalite seçimi yardımcıları (madde 4).
 * `variantId` native engine'ın `Variant.id` kuralıyla aynıdır:
 *   `${resolution}@${bandwidth}`
 */

/** Kalite kimliği: doğrudan satır seçimi için. */
export function variantId(v) {
	return `${v.resolution || "?"}@${v.bandwidth}`;
}

/**
 * Kayıtlı kimliğe göre varyantı seçer: birebir id → yoksa en yakın bant
 * genişliği → o da yoksa en yüksek.
 */
export function pickVariant(variants, savedId) {
	if (!Array.isArray(variants) || variants.length === 0) return null;
	const exact = variants.find((v) => variantId(v) === savedId);
	if (exact) return exact;
	const bw = Number(String(savedId || "").split("@")[1]);
	if (Number.isFinite(bw) && bw > 0) {
		const nearest = variants.reduce((a, b) => {
			const da = Math.abs(Number(a.bandwidth || 0) - bw);
			const db = Math.abs(Number(b.bandwidth || 0) - bw);
			return db < da ? b : a;
		});
		if (nearest) return nearest;
	}
	return variants.reduce((a, b) =>
		Number(b.bandwidth || 0) > Number(a.bandwidth || 0) ? b : a,
	);
}

/** UI satırı: "1080p · 4.8 Mbps". */
export function variantLabel(v) {
	const h = v.resolution ? v.resolution.split("x")[1] : null;
	const mbps = (Number(v.bandwidth || 0) / 1000000).toFixed(1);
	return h ? `${h}p · ${mbps} Mbps` : `${mbps} Mbps`;
}
