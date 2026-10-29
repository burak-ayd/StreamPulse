/*
 * İzin satırlarının saf hesabı (madde 3) — I/O yok, node --test ile
 * doğrulanır. Cihaz tarafı `permissions.js`'te.
 */

/** Satır etiketleri ve gerekçeleri (UI ile paylaşılır). */
export const PERMISSION_LABELS = {
	notifications: {
		label: "Bildirimler",
		reason: "İndirme ilerlemesi ve tamamlanınca uyarı için gerekli",
	},
	storage: {
		label: "Depolama / Medya",
		reason: "İndirilen dosyalara ve galeri medyasına erişim (API 33+ görsel/video)",
	},
	installPackages: {
		label: "Uygulama Yükleme",
		reason: "APK güncellemelerini yükleyebilmek için (isteğe bağlı)",
	},
	camera: {
		label: "Kamera",
		reason: "Profil fotoğrafı çekimi gibi özellikler için (isteğe bağlı)",
	},
	mediaImages: {
		label: "Medya Görselleri",
		reason: "Galeriden profil fotoğrafı seçimi için (isteğe bağlı)",
	},
	batteryOptimization: {
		label: "Pil Optimizasyonu İstisnası",
		reason: "Ekran kapalıyken indirirken arka planda kalması için (isteğe bağlı)",
	},
};

/**
 * SDK sürümüne göre izin satırlarını kurar. `statuses` boşsa "denied"
 * varsayılır — cihazda gerçek yanıt doldurulur.
 * @param {{[key: string]: string}} statuses — granted | denied | blocked
 * @param {number} sdkInt
 * @returns {Array<{key,label,reason,required,status}>}
 */
export function buildPermissionRows(statuses = {}, sdkInt = 33) {
	const rows = [];
	const st = (key, required, override = null) => ({
		key,
		...PERMISSION_LABELS[key],
		required,
		status: override || statuses[key] || "denied",
	});

	if (sdkInt >= 33) {
		rows.push(st("notifications", true));
	}
	// Depolama satırı her sürümde (kullanıcı kararı): API ≤28 zorunlu,
	// 29+ isteğe bağlı ama yine de istenir (MediaStore yazımı izinsiz de çalışır).
	rows.push(st("storage", sdkInt < 29));
	rows.push(st("installPackages", false));
	rows.push(st("camera", false));
	if (sdkInt >= 33) {
		rows.push(st("mediaImages", false));
	}
	rows.push(st("batteryOptimization", false, null));
	return rows;
}
