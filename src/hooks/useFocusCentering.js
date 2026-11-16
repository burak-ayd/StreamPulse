/**
 * `useFocusCentering` — TV odaklanan öğeyi ekrana ORTALAR (sorun 5)
 * =================================================================
 *
 * ⚠️ Neden ORTAK KANCA
 *
 * Sorun 5'in davranışı (`scrollToIndex({ viewPosition: 0.5 })` +
 * `onScrollToIndexFailed` + retry) ilk başta yalnızca ana sayfada
 * uygulandı; sonraki ekranlara elle kopyalandıkça üç ayrı kopya
 * oluştu (bkz. `category.jsx`, `live.jsx`, `MovieCategorySection.jsx`) ve
 * biri güncellendiğinde diğerleri bayat kaldı. Bu kanca o davranışı TEK
 * yerden verir; ekranlar yalnızca `handleItemFocus`/`onScrollToIndexFailed`
 * prop'larını bağlar.
 *
 * ── SORUN 5'in KÖK NEDENİ ──────────────────────────────────────────
 *
 * Android TV'nin odak yöneticisi odaklanan öğeyi yalnızca EKRANA
 * GETİRİR (en az kaydırma). Sonuç: kart ekranın kenarına yapışır,
 * başlığı yarım görünür, kullanıcı "önce kaydırdım, sonra seçtim"
 * diye tarif eder. `viewPosition: 0.5` öğeyi görüntü alanının tam
 * ortasına sabitler.
 *
 * ── İZGARALAR (`numColumns > 1`) ───────────────────────────────────
 *
 * Dikeyde ortalama SATIR bazlıdır: kart indeksi tek başına hedef
 * olamaz, çünkü kartın satırın YATAY ortası da ekranda olmalıdır.
 * Bu yüzden `Math.floor(index / columns) * columns` ile satırın ilk
 * kartına yumuşak geçiş yapılır.
 *
 * ── `ScrollView` DESTEĞİ ─────────────────────────────────────────
 *
 * `ScrollView` `scrollToIndex` BİLMEZ; `scrollTo({ y })` ister. Bu
 * yüzden hook ölçüm bilgisi verilirse (`itemHeight`) offset hesaplayıp
 * `scrollTo` kullanır, `FlatList` yolundan otomatik ayrılır.
 */

import { useCallback, useRef } from "react";
import { Platform } from "react-native";

/** Varsayılan: dikeyde ortalama, yatayda da ortalama. */
export function useFocusCentering(options = {}) {
	const {
		/**
		 * Dikey ızgara sütun sayısı. 1 veya `null` → tek sütunlu liste
		 * (her kart kendi satırıdır).
		 */
		columns = 1,
		/**
		 * Yatay liste mi? `true` ise `handleItemFocus` içeriği yatayda
		 * ortalar (ana sayfa kategori satırları gibi).
		 */
		horizontal = false,
		/**
		 * `ScrollView` için kart yüksekliği (px). Verilirse hook
		 * `scrollToIndex` yerine `scrollTo({ y })` kullanır.
		 */
		itemHeight = null,
		/** Mobil/dokunmatik cihazlarda devre dışı bırakmak için. */
		enabled = Platform.isTV,
		/**
		 * Satır ortalandıktan sonra çağrılır — dikeyde bir ÜST satırın
		 * ayrıca ortalanması gereken ekranlar (ör. ana sayfa) burada
		 * kendi `scrollToIndex`'ini yapar.
		 */
		onCentered = null,
	} = options;

	/** Hedef listenin ref'i. Ekran bunu `ref` prop'una verir. */
	const listRef = useRef(null);
	/** Henüz ölçülmediği için başarısız hedef (retry için saklanır). */
	const pendingIndexRef = useRef(null);
	const retryTimerRef = useRef(null);
	/** D-pad hızlı navigasyonunda scroll'i debounce etmek için (80ms). */
	const scrollDebounceTimerRef = useRef(null);
	/**
	 * En son ortalanan hedef. Aynı satır içinde SOL/SAĞ gezinirken dikey
	 * liste zaten o konumdadır; `scrollToIndex`'i tekrar çalıştırmak TV'de
	 * her tuşta boşuna bir animasyon + ölçüm demek (kullanıcı: "aşağı yukarı
	 * hareket ederken ufak takılmalar"). Aynı hedefse atlanır.
	 */
	const lastTargetRef = useRef(null);
	/**
	 * Görünür öğe aralığı (`first..last`) — liste `onViewableItemsChanged`
	 * ile günceller.
	 *
	 * ⚠️ Netflix/Prime/CloudStream davranışı: odaklanan öğe ZATEN görünürse
	 * liste HİÇ kaymaz. Kaydırma yalnızca öğe bu aralığın dışına çıkınca ve
	 * o zaman da "tam ortala" değil, öğeyi görüş alanının ilgili kenarına
	 * getirecek kadar yapılır. Eskiden her odak değişiminde ortalama
	 * yapıldığı için kullanıcı "önce odak, sonra ekstra bir kayma" görüyordu.
	 *
	 * Başlangıçta `last` = -1: ölçüm gelene kadar hiçbir şey "görünür"
	 * sayılmaz, yani ilk odakta kaydırma yapılmaz (liste zaten başında).
	 */
	const visibleRef = useRef({ first: 0, last: -1 });

	const onViewableItemsChanged = useCallback(({ viewableItems }) => {
		if (!viewableItems || viewableItems.length === 0) return;
		let first = Infinity;
		let last = -1;
		for (const token of viewableItems) {
			if (token?.index == null || token.isViewable === false) continue;
			if (token.index < first) first = token.index;
			if (token.index > last) last = token.index;
		}
		if (last >= 0) visibleRef.current = { first, last };
	}, []);

	/*
	 * Yatayda odaklanan kart ekranın ortasına değil, kenara yakın durur;
	 * böylece sağında/solunda "sıradaki" kartlar görünür kalır. Dikeyde ise
	 * satır çok uçlara (0.06 veya 0.94) fırlatılmamalı; aksi takdirde aşağı/yukarı
	 * her geçişte devasa sıçramalar yaşanır. Netflix/Prime tarzı ekranın ~%28-%32
	 * bölgesinde dengeli tutulmalıdır.
	 */
	const forwardAlign = horizontal ? 0.65 : 0.3;
	const backwardAlign = horizontal ? 0.25 : 0.25;

	/**
	 * Geçici zamanlayıcıları temizle.
	 *
	 * Ekranlar bunu `useEffect` cleanup'inde çağırır; aksi hâlde unmount
	 * sonrası `scrollToIndex` "unmounted component" uyarısı basar.
	 */
	const clearRetry = useCallback(() => {
		if (retryTimerRef.current) {
			clearTimeout(retryTimerRef.current);
			retryTimerRef.current = null;
		}
	}, []);

	/**
	 * Debounce zamanlayıcısını temizle.
	 */
	const clearDebounce = useCallback(() => {
		if (scrollDebounceTimerRef.current) {
			clearTimeout(scrollDebounceTimerRef.current);
			scrollDebounceTimerRef.current = null;
		}
	}, []);

	const scrollRowToCenter = useCallback(
		(targetIndex) => {
			const node = listRef.current;
			if (!node) return;

			// Aynı hedef hem yatay hem dikeyde tekrar ortalanmasın.
			if (lastTargetRef.current === targetIndex) return;

			// ── Görünürse hiç kaydırma (asıl akıcılık kazancı) ──
			const { first, last } = visibleRef.current;
			if (last >= 0 && targetIndex >= first && targetIndex <= last) {
				lastTargetRef.current = targetIndex;
				onCentered?.(targetIndex);
				return;
			}

			lastTargetRef.current = targetIndex;

			/*
			 * Öğe görüş alanının dışında. İlerleme yönüne göre "yetir"
			 * hizalaması: aşağı/sağa gidiyorsak öğeyi görüş alanının
			 * ileri kenarına, yukarı/sola gidiyorsak geri kenarına getir.
			 */
			const align =
				last >= 0 && targetIndex > last ? forwardAlign : backwardAlign;

			// ── `ScrollView` yolu (itemHeight verilmişse) ──
			if (itemHeight) {
				const offset = targetIndex * itemHeight;
				if (typeof node.scrollTo === "function") {
					node.scrollTo({
						y: Math.max(0, offset),
						animated: true,
					});
				}
				onCentered?.(targetIndex);
				return;
			}

			// ── `FlatList` yolu ──
			try {
				node.scrollToIndex({
					index: targetIndex,
					viewPosition: align,
					animated: true,
				});
				onCentered?.(targetIndex);
			} catch {
				// Ölçüm henüz yok → `onScrollToIndexFailed` devreye girer.
			}
		},
		[itemHeight, forwardAlign, backwardAlign, onCentered],
	);

	/**
	 * Öğe odaklandığında çağrılır.
	 *
	 * @param {number} index Odaklanan kartın liste içindeki indeksi.
	 */
	const handleItemFocus = useCallback(
		(index) => {
			if (!enabled || index == null) return;

			const colCount =
				Number.isFinite(columns) && columns > 0 ? columns : 1;

			/*
			 * Dikey ızgara: satırın İLK kartına yumuşak geçiş yapılır
			 * (kartın kendisi yatayda zaten ortalı değilse bile satır
			 * görüş alanına girer, başlığı kesilmez).
			 *
			 * Tek sütunlu listede bu `index`in kendisidir.
			 */
			const target = horizontal
				? index
				: Math.floor(index / colCount) * colCount;

			// ⚡ DEBOUNCE: Hızlı D-pad tutuşunda (saniyede ~10 tuş) her tuşta
			// scrollToIndex tetiklenmesin — 80ms bekle, kullanıcı bırakınca
			// veya 80ms sonra son hedefe kaydır.
			// Netflix/Prime ~60-100ms arası; 80ms iyi denge (algılanan gecikme < 100ms).
			if (scrollDebounceTimerRef.current) {
				clearTimeout(scrollDebounceTimerRef.current);
			}
			scrollDebounceTimerRef.current = setTimeout(() => {
				scrollDebounceTimerRef.current = null;
				scrollRowToCenter(target);
			}, 80);
		},
		[columns, horizontal, scrollRowToCenter, enabled],
	);

	/**
	 * Hedef satır henüz render/ölçülmediyse RN burada durur.
	 *
	 * Önce TAHMİNİ konuma atlanır, bir sonraki karede `viewPosition`
	 * uygulanarak tekrar denenir.
	 */
	const onScrollToIndexFailed = useCallback(
		(info) => {
			const node = listRef.current;
			if (!node) return;

			// Retry aynı indeksle gelecek; "aynı hedef" atlaması engellemesin.
			lastTargetRef.current = null;

			// Tahmini konuma atla (animasyonsuz — kullanıcı görmesin).
			if (typeof node.scrollToOffset === "function") {
				node.scrollToOffset({
					offset: info.averageItemLength * info.index,
					animated: false,
				});
			} else if (typeof node.scrollTo === "function") {
				node.scrollTo({
					y: Math.max(0, info.averageItemLength * info.index),
					animated: false,
				});
			}

			// Bir sonraki karede gerçek hedefe yumuşak geçiş.
			pendingIndexRef.current = info.index;
			clearRetry();
			retryTimerRef.current = setTimeout(() => {
				retryTimerRef.current = null;
				if (pendingIndexRef.current != null) {
					const idx = pendingIndexRef.current;
					pendingIndexRef.current = null;
					scrollRowToCenter(idx);
				}
			}, 120);
		},
		[scrollRowToCenter, clearRetry],
	);

	/*
	 * Görünürlük eşiği: öğenin %92'si görünüyorsa "yeterince görünür"
	 * sayılır. Yatayda %70 yeter — kart tam görünmese de okunur durumdadır
	 * ve eşiği yükseltmek gereksiz kaydırma üretir.
	 */
	const viewabilityConfig = useRef({
		itemVisiblePercentThreshold: horizontal ? 70 : 92,
		minimumViewTime: 32,
	}).current;

	return {
		/** `FlatList`/`ScrollView`'a verilecek ref. */
		listRef,
		/** `renderItem`'ın `onFocus`'ine bağlanır. */
		handleItemFocus,
		/** `FlatList`'a verilir. */
		onScrollToIndexFailed,
		/** Listeye verilir — görünür aralığı bu günceller. */
		onViewableItemsChanged,
		/** Listeye verilir. */
		viewabilityConfig,
		/** Elle ortalama (dışarıdan tetiklemek için). */
		scrollRowToCenter,
		/** Bekleyen retry varsa onu iptal eder (unmount temizliği). */
		clearRetry,
		/** Debounce zamanlayıcısını iptal eder (unmount temizliği). */
		clearDebounce,
	};
}

export default useFocusCentering;

/**
 * `useScrollViewFocusCentering` — `ScrollView` ekranları için odak ortalama
 * =========================================================================
 *
 * ⚠️ `ScrollView` `scrollToIndex` BİLMEZ.
 *
 * Yukarıdaki kanca `FlatList` içindir. `search.jsx`, `MovieDetails`,
 * `downloads.jsx`, `discover.jsx` gibi ekranlar sonuçları elle dizilmiş
 * `ScrollView` blokları içinde gösterir; bu yüzden onlar için hedef
 * KONUM (`{ y }`), İNDEKS değildir.
 *
 * ── NASIL ÇALIŞIR ────────────────────────────────────────────────
 *
 * 1. Kart odaklandığında `onFocus` → `centerItem(index)`.
 * 2. `centerItem` o kartın ölçülmüş konumunu okur.
 * 3. `scrollTo({ y: itemY + itemH/2 - viewportH/2 })` ile EKRANIN
 *    ortasına taşır.
 *
 * Konum `onLayout` ile ölçülür (`measureItem`). Ölçülmemişse odağa
 * düşmez: kart zaten görünür durumdadır, kullanıcı bir sonraki odak
 * değişiminde konum bulunmuş olur.
 *
 * @param {object} scrollRef `ScrollView`'un ref'i.
 */
export function useScrollViewFocusCentering(scrollRef, options = {}) {
	const { enabled = Platform.isTV, viewportHeight = 0 } = options;

	/** `index → { y, height }`. Kartlar `onLayout` ile buraya yazılır. */
	const metricsRef = useRef(new Map());

	/** Kart ölçüldüğünde çağrılır (`onLayout` prop'u). */
	const measureItem = useCallback((index, y, height) => {
		metricsRef.current.set(index, { y, height });
	}, []);

	/** Kart odaklandığında çağrılır (`onFocus` prop'u). */
	const centerItem = useCallback(
		(index) => {
			if (!enabled) return;
			const node = scrollRef?.current;
			if (!node || typeof node.scrollTo !== "function") return;

			const metric = metricsRef.current.get(index);
			if (!metric) return;

			/*
			 * `viewportHeight` bilinmiyorsa listenin kendi yüksekliği
			 * kullanılır. `onLayout` ile bir kez ölçülür (aşağıda
			 * `measureViewport`).
			 */
			const vh = viewportHeight || 0;
			if (vh <= 0) return;

			const center = metric.y + metric.height / 2 - vh / 2;
			// Üstte/altta boşluğa kaydırma: içerik sınırları dışına çıkmasın.
			node.scrollTo({
				y: Math.max(0, center),
				animated: true,
			});
		},
		[enabled, scrollRef, viewportHeight],
	);

	return { measureItem, centerItem, metricsRef };
}