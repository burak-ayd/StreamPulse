import { createContext, useContext, useState, useCallback } from "react";

/**
 * TVFocusContext — Android TV odak navigasyonu köprüsü
 *
 * Yan ray (BottomNavigation) ve içerik alanı (FlatList/ListHeaderComponent)
 * farklı view hiyerarşilerindedir. Android focus sistemi otomatik
 * yan yana geçiş bulmaya çalışsa da, sanal listelerde (FlatList) ilk öğe
 * henüz mount edilmemiş olabilir veya ScrollView sınırları arama
 * engelleyebilir.
 *
 * Bu context, "ilk odaklanabilir içerik öğesi" (HeroBanner oynat düğmesi
 * veya ilk kategori kartı) ile "yan ray öğeleri" arası native view ID
 * (View tag) paylaşımını sağlar. `nextFocusRight` / `nextFocusLeft`
 * prop'ları native tag bekler; `findNodeHandle` ile alınır (0.86'da
 * hala çalışır, deprecated olsa da).
 */
const TVFocusContext = createContext({
	registerFirstContentView: () => {},
	registerSideRailView: () => {},
	firstContentViewTag: null,
	sideRailViewTag: null,
});

export function TVFocusProvider({ children }) {
	const [firstContentViewTag, setFirstContentViewTag] = useState(null);
	const [sideRailViewTag, setSideRailViewTag] = useState(null);

	const registerFirstContentView = useCallback((tag) => {
		if (tag != null) setFirstContentViewTag(tag);
	}, []);

	const registerSideRailView = useCallback((tag) => {
		if (tag != null) setSideRailViewTag(tag);
	}, []);

	return (
		<TVFocusContext.Provider
			value={{
				registerFirstContentView,
				registerSideRailView,
				firstContentViewTag,
				sideRailViewTag,
			}}
		>
			{children}
		</TVFocusContext.Provider>
	);
}

export function useTVFocus() {
	const ctx = useContext(TVFocusContext);
	if (!ctx) {
		throw new Error("useTVFocus must be used within TVFocusProvider");
	}
	return ctx;
}

export default TVFocusContext;