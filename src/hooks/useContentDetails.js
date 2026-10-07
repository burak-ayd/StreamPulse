import { fetchContentDetails } from "@/services/api";
import { useCallback, useEffect, useState } from "react";

/**
 * Custom hook to fetch content details from API
 * @param {string} contentId - ID of the content
 * @returns {Object} { content, loading, error, refetch }
 */
export function useContentDetails(contentId) {
	const [content, setContent] = useState(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);

	/*
	 * `useCallback` ile sarılıyor çünkü `useEffect` bağımlılık dizisine
	 * ekleniyor. Sarılmadan eklenirse fonksiyon her render'da yeni
	 * kimlik kazanır, effect her render'da çalışır ve sonsuz döngüye
	 * girerdi. Tek gerçek bağımlılık `contentId`.
	 */
	const fetchContent = useCallback(async () => {
		try {
			setLoading(true);
			setError(null);

			const data = await fetchContentDetails(contentId);
			if (!data) {
				throw new Error("İçerik bulunamadı");
			}

			setContent(data);
		} catch (err) {
			console.error("Error fetching content:", err);
			setError(err.message || "İçerik yüklenirken bir hata oluştu");
		} finally {
			setLoading(false);
		}
	}, [contentId]);

	useEffect(() => {
		if (contentId) {
			fetchContent();
		}
	}, [contentId, fetchContent]);

	return {
		content,
		loading,
		error,
		refetch: fetchContent,
	};
}

export default useContentDetails;
