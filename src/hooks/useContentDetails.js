import { supabase } from "@utils/supabase";
import { useEffect, useState } from "react";

/**
 * Custom hook to fetch content details from Supabase
 * @param {string} contentId - UUID of the content
 * @returns {Object} { content, loading, error, refetch }
 */
export function useContentDetails(contentId) {
	const [content, setContent] = useState(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);

	const fetchContent = async () => {
		try {
			setLoading(true);
			setError(null);

			const { data, error: fetchError } = await supabase
				.from("v_content_list")
				.select("*")
				.eq("id", contentId)
				.single();

			if (fetchError) throw fetchError;

			setContent(data);
		} catch (err) {
			console.error("Error fetching content:", err);
			setError(err.message || "İçerik yüklenirken bir hata oluştu");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		if (contentId) {
			fetchContent();
		}
	}, [contentId]);

	return {
		content,
		loading,
		error,
		refetch: fetchContent,
	};
}
