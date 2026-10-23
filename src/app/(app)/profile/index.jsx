/**
 * Profil Ekranı
 *
 * Referans tasarımlar (3 varyant, tek tasarım dili):
 *   • profil_sekmeli_minimal        → Devam Edenler sekmesi
 *   • profil_favoriler_sekmesi      → Favoriler sekmesi
 *   • profil_son_i_zlenenler_sekmesi→ Son İzlenenler sekmesi
 *
 * Yapı: `ProfileHeader.jsx` (chrome) + `ProfileContent.jsx` (gövdeler) +
 * `ProfileBadges.jsx` (atomlar) + `utils/profileFormat.js` (biçimlendirme).
 *
 * ⚠️ Veri gerçekliği: puan / tür / kalite / dublaj alanları veri modelinde
 * yok; bu ekran onları UYDURMAZ. Bkz. `utils/profileFormat.js` başlığı.
 *
 * Erişilebilirlik notu: sekmeler `params.tab` ile derin bağlanabilir
 * (aynı sözleşme eski ekrandan korundu): `?tab=continue|history|favorites`.
 */

import {
	AccountAction,
	ProfileHeader,
	ProfileStats,
	ProfileTabBar,
	ProfileTopBar,
} from "@/components/profile/ProfileHeader";
import {
	ContinueWatchingList,
	FavoriteGrid,
	HistoryList,
} from "@/components/profile/ProfileContent";
import { useAuth } from "@/context/AuthContext";
import { useSync } from "@/context/SyncContext";
import { useThemeContext } from "@/context/ThemeContext";
import {
	clearWatchHistory,
	getContinueWatching,
	getFavorites,
	getSelectedPlatform,
	getUserProfile,
	getWatchHistory,
	removeContinueWatching,
	removeFromWatchHistory,
	resolvePluginName,
	toggleFavorite,
} from "@/utils/storage";
import { useTvMetrics } from "@/utils/tvMetrics";
import { openLogin } from "@/utils/authRoutes";
import {
	filterFavorites,
	isSeries,
	sortItems,
} from "@/utils/profileFormat";
import { useReactiveData } from "@/utils/storageListener";
import { Alert, BackHandler, Platform, ScrollView, StatusBar, StyleSheet, View } from "react-native";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";

/** Sekme anahtarları — eski `?tab=` değerleriyle uyumlu. */
const TAB_KEYS = {
	continue: { key: "continue", label: "Devam Edenler", param: "continue" },
	favorites: { key: "favorites", label: "Favoriler", param: "favorites" },
	history: { key: "history", label: "Son İzlenenler", param: "history" },
};

const TAB_ORDER = [TAB_KEYS.continue, TAB_KEYS.favorites, TAB_KEYS.history];

/** Sıralama düğmesinin iki durumu arasında döndüğü etiketler. */
const SORT_LABELS = {
	added: "Son Eklenenler",
	title: "Ada Göre (A-Z)",
};

export default function ProfileScreen() {
	const { m3, theme } = useThemeContext();
	// TV ölçüleri — bkz. utils/tvMetrics.js
	const { isWide, isLandscape, width: winWidth } = useTvMetrics();
	const { isLoggedIn, user, logout } = useAuth();
	const { status: syncStatus } = useSync();
	const router = useRouter();
	const params = useLocalSearchParams();

	/**
	 * Senkronizasyon sağlıklı mı?
	 *
	 * `SyncContext.status`: 'idle' | 'syncing' | 'error'. Giriş yapılmış
	 * ve son durum hata DEĞİLSE yeşil. Giriş yoksa kırmızı — çünkü o
	 * durumda senkronizasyon hiç çalışmıyor demektir.
	 */
	const syncHealthy = isLoggedIn && syncStatus !== "error";

	// ── Sekme ────────────────────────────────────────────────
	const initialTab = TAB_KEYS[params?.tab] ? params.tab : "continue";
	const [activeTab, setActiveTab] = useState(initialTab);

	// Derin bağ (`?tab=`) değişirse sekmeyi takip et (aynı desen eski ekrandan).
	const [prevTabParam, setPrevTabParam] = useState(params?.tab);
	if (params?.tab !== prevTabParam) {
		setPrevTabParam(params?.tab);
		if (TAB_KEYS[params?.tab]) setActiveTab(params.tab);
	}

	// ── Görünüm / filtre / sıralama ──────────────────────────
	// Varsayılan CARD (ızgara) görünümü — istenen davranış.
	const [continueView, setContinueView] = useState("grid");
	const [favFilter, setFavFilter] = useState("all");
	const [favSort, setFavSort] = useState("added");
	const [historySort, setHistorySort] = useState("added");

	// ── Veri ─────────────────────────────────────────────────
	const [profile, setProfile] = useState(null);
	const [selectedPlatform, setSelectedPlatform] = useState(null);
	const [favorites, setFavorites] = useState([]);
	const [history, setHistory] = useState([]);
	const [continueWatching, setContinueWatching] = useState([]);
	/**
	 * "Bu Hafta (N)" sayacı.
	 *
	 * ⚠️ Render sırasında `Date.now()` çağrılamaz (React Compiler saflık
	 * kuralı): render'lar arasında "bu hafta" sınırı kayabilir ve sayaç
	 * titrer. Sınır veri yüklenirken bir kez hesaplanıp state'e yazılır —
	 * ki bu doğru zaman zaten odak değişimi ve senkronizasyon olayıdır.
	 */
	const [weekCount, setWeekCount] = useState(0);

	const loadData = useCallback(async () => {
		try {
			const [userProf, favs, hist, cont, platform] = await Promise.all([
				getUserProfile(),
				getFavorites(),
				getWatchHistory(),
				getContinueWatching(),
				getSelectedPlatform(),
			]);
			setProfile(userProf);
			setFavorites(favs || []);
			setHistory(hist || []);
			setContinueWatching(cont || []);

			const weekAgo = Date.now() - 7 * 86_400_000;
			setWeekCount(
				(hist || []).filter((item) => {
					if (!item.watchedAt) return false;
					const t = new Date(item.watchedAt).getTime();
					return !Number.isNaN(t) && t >= weekAgo;
				}).length,
			);

			if (platform) setSelectedPlatform(platform);
		} catch (error) {
			console.error("Profil bilgileri yüklenirken hata:", error);
		}
	}, []);

	useFocusEffect(
		useCallback(() => {
			loadData();
		}, [loadData]),
	);

	// Senkronizasyon gelen veriyi odak değişimi olmadan da yansıt
	useReactiveData(loadData, [
		"user_favorites",
		"user_watchlist",
		"user_watch_history",
		"user_continue_watching",
		"user_profile",
	]);

	// Android donanım geri tuşu — kök yığında varsayılana bırakılır;
	// koşulsuz back() burada sıkışıp kalıyordu.
	const handleBack = useCallback(() => {
		if (router.canGoBack()) router.back();
		else router.replace("/(app)");
	}, [router]);

	useFocusEffect(
		useCallback(() => {
			if (Platform.OS !== "android") return;
			const sub = BackHandler.addEventListener(
				"hardwareBackPress",
				() => {
					handleBack();
					return true;
				},
			);
			return () => sub.remove();
		}, [handleBack]),
	);

	// ── Türetilmiş veri ──────────────────────────────────────

	const favCounts = useMemo(
		() => ({
			all: favorites.length,
			movie: favorites.filter((i) => !isSeries(i)).length,
			series: favorites.filter((i) => isSeries(i)).length,
		}),
		[favorites],
	);

	const favItems = useMemo(
		() => sortItems(filterFavorites(favorites, favFilter), favSort, "desc"),
		[favorites, favFilter, favSort],
	);

	const historyItems = useMemo(
		() => sortItems(history, historySort, "desc"),
		[history, historySort],
	);

	/** "Bu Hafta (N)" — `loadData` içinde hesaplanır (saflık kuralı). */

	const stats = useMemo(
		() => [
			{ key: "continue", value: continueWatching.length, label: "Devam Eden" },
			{ key: "favorites", value: favorites.length, label: "Favorilerim" },
			{ key: "history", value: history.length, label: "Son İzlenen" },
		],
		[continueWatching.length, favorites.length, history.length],
	);

	// ── Kimlik ───────────────────────────────────────────────

	/**
	 * Profil kaydı varsayılan "Misafir" değerlerinde mi?
	 * (Eski ekrandaki mantık korundu; kullanıcı adı zorla değiştirilmesin.)
	 */
	const isDefaultProfile =
		!profile ||
		profile.username === "misafir" ||
		profile.displayName === "Misafir Kullanıcı";

	const displayName =
		(isLoggedIn && user
			? user.display_name || user.username || user.email?.split("@")[0]
			: !isDefaultProfile && profile?.displayName) || "Misafir Kullanıcı";

	const handle =
		(isLoggedIn && user
			? user.username || user.email?.split("@")[0]
			: !isDefaultProfile && profile?.username) || "misafir";

	const avatarUri =
		(isLoggedIn && user?.avatar_url ? user.avatar_url : null) ||
		(!isDefaultProfile ? profile?.avatarUrl : null) ||
		null;

	// ── Eylemler ─────────────────────────────────────────────

	const openDetails = useCallback(
		(item) => {
			if (!item) return;

			const targetPlugin =
				resolvePluginName(item) ||
				item.plugin ||
				selectedPlatform?.name ||
				"hdfilmcehennemi";

			let movieWithPlugin = { ...item, plugin: targetPlugin };

			// "Dizi 2. Sezon 3. Bölüm" gibi başlıklardan sezon/bölüm çıkar
			const epMatch = (item.title || "").match(
				/^(.+?)\s+(\d+)\.\s*Sezon\s+(\d+)\.\s*Bölüm/i,
			);
			if (epMatch) {
				movieWithPlugin = {
					...movieWithPlugin,
					seriesTitle: epMatch[1].trim(),
					initialSeason: String(epMatch[2]),
					initialEpisode: String(epMatch[3]),
					is_series: true,
					content_type: "series",
				};
			}

			const movieId =
				item.id || encodeURIComponent(item.url || item.title || "content");

			router.push({
				pathname: "/(app)/MovieDetails/[id]",
				params: {
					id: String(movieId),
					url: item.url || item.seriesUrl || "",
					plugin: targetPlugin,
					movieData: JSON.stringify(movieWithPlugin),
				},
			});
		},
		[router, selectedPlatform?.name],
	);

	const playContinue = useCallback(
		(item) => {
			if (item.url) {
				router.push({
					pathname: "/player",
					params: {
						url: item.url,
						title: item.title,
						subtitle: item.episodeTitle || item.seriesTitle || "",
						poster: item.poster,
						id: item.id,
						type: item.type || "movie",
						seriesId: item.seriesId,
						season: item.season,
						episode: item.episode,
						episodeTitle: item.episodeTitle,
						currentTime: item.currentTime,
					},
				});
			} else if (item.id) {
				router.push(`/(app)/MovieDetails/${item.id}`);
			}
		},
		[router],
	);

	const removeFavorite = useCallback(async (item) => {
		await toggleFavorite(item);
		const next = await getFavorites();
		setFavorites(next || []);
	}, []);

	const removeHistory = useCallback(async (item) => {
		const next = await removeFromWatchHistory(item);
		setHistory(next || []);
	}, []);

	const removeContinue = useCallback(async (item) => {
		const next = await removeContinueWatching(item.id ?? item);
		setContinueWatching(next || []);
	}, []);

	const confirmClearHistory = useCallback(() => {
		Alert.alert(
			"İzleme geçmişini temizle",
			"Tüm cihazlarındaki izleme geçmişi silinecek. Bu işlem geri alınamaz.",
			[
				{ text: "Vazgeç", style: "cancel" },
				{
					text: "Temizle",
					style: "destructive",
					onPress: async () => {
						await clearWatchHistory();
						setHistory([]);
					},
				},
			],
		);
	}, []);

	/**
	 * Çıkış onayı.
	 *
	 * Onay isteniyor çünkü çıkış `resetSyncState()` çağırıyor: hesabın bu
	 * cihazdaki delta damgası siliniyor ve bir sonraki giriş tam döküm
	 * çekiyor. Kullanıcı "yanlışlıkla çıktım" deyip veri kaybı yaşamamalı.
	 */
	const confirmLogout = useCallback(() => {
		Alert.alert(
			"Çıkış yapılsın mı?",
			"Çıkış yaptığında bu cihazdaki senkronizasyon damgan sıfırlanır. " +
				"Verilerin silinmez; tekrar girdiğinde hesabının tamamı yeniden indirilir.",
			[
				{ text: "Vazgeç", style: "cancel" },
				{
					text: "Çıkış Yap",
					style: "destructive",
					onPress: () => {
						logout().catch((err) =>
							console.warn("Çıkış tamamlanamadı:", err?.message),
						);
					},
				},
			],
		);
	}, [logout]);

	// ── Yerleşim ─────────────────────────────────────────────

	/**
	 * İKİ SÜTUNLU yerleşim koşulu.
	 *
	 * DİKEY telefonda düzen aynen korunur (geri bildirim: dikey iyi).
	 * YATAY + geniş ekranda (TV, tablet yatay, telefon yatay) kimlik ve
	 * hesap işlemleri solda sabit bir sütunda toplanır; sekmeler ve içerik
	 * sağdadır: tek sütunlu telefon düzeni 960dp'ye yayıldığında başlık
	 * iki uca savruluyor, satırlar ~860dp uzuyordu.
	 */
	const twoPane = isWide && isLandscape;

	/** Sol sütun: ekranın ~1/3'ü, 280–340dp arasına kırpılır. */
	const sideWidth = Math.round(
		Math.min(Math.max(winWidth * 0.33, 280), 340),
	);

	/**
	 * Sağ panonun beklenen genişliği — ızgara ölçümü gelmeden önceki ilk
	 * kare için (bkz. hooks/useMeasuredColumns.js). Dikeyde 0 verilir;
	 * kanca o durumda ekran genişliğini kullanır.
	 */
	const paneFallbackWidth = twoPane
		? Math.max(0, winWidth - sideWidth - 16)
		: 0;

	/**
	 * Kimlik + hesap + istatistik bloğu.
	 *
	 * Dikeyde gövdenin doğrudan çocuklarıdır (eski yerleşim aynen);
	 * yatay/geniş yerleşimde sol sütunun ScrollView'ına girer.
	 */
	const sideContent = (
		<>
			<ProfileHeader
				displayName={displayName}
				handle={`@${handle}`}
				roleLabel="Sinefil"
				avatarUri={avatarUri}
				syncHealthy={syncHealthy}
				onEdit={() => router.push("/profile/EditProfile")}
				wide={twoPane}
			/>

			<AccountAction
				isLoggedIn={isLoggedIn}
				onLogin={() => openLogin(router)}
				onLogout={confirmLogout}
				wide={twoPane}
			/>

			<ProfileStats
				stats={stats}
				activeKey={activeTab}
				onSelect={(key) => setActiveTab(key)}
				wide={twoPane}
			/>
		</>
	);

	// ── Render ───────────────────────────────────────────────

	return (
		<>
			<Stack.Screen options={{ headerShown: false }} />
			{/* TV geri bildirimi: gövde TAM genişlik. Eski contentMaxWidth
			    ortalaması yanlarda boşluk bırakıyordu; kenar boşlukları
			    panellerin kendi iç dolgularından (ScreenGutter) gelir. */}
			<SafeAreaView
				edges={["top", "left", "right"]}
				style={[styles.safeArea, { backgroundColor: m3.surfaceLowest }]}>
				<StatusBar
					barStyle={theme === "dark" ? "light-content" : "dark-content"}
					backgroundColor={m3.surfaceLowest}
				/>

				<ProfileTopBar
					onBack={handleBack}
					syncHealthy={syncHealthy}
					onNotifications={() => router.push("/(app)/bildirimler")}
					// Ayar düğmesi doğrudan SENKRONİZASYON ayarlarını açar.
					// Genel ayarlara alt navigasyondaki "Ayarlar" girilir; buraya
					// ikinci bir genel ayar girişi koymak yol bulmacayı dağıtıyor.
					onSettings={() => router.push("/(app)/settings/sync")}
				/>

				{/* Tüm sekme gövdeleri kendi FlatList'ini taşır; dışarıda bir
				    ScrollView YOK — iç içe scroll view Android'de hem
				    performans düşürür hem de kısayol jestini bozar. Yan
				    sütunun ScrollView'ı ile gövde FlatList'i KARDEŞTİR
				    (iç içe değil); o da yalnızca yatay/geniş yerleşimde
				    devreye girer. */}
				<View style={[styles.body, twoPane && styles.bodyWide]}>
					{twoPane ? (
						<ScrollView
							style={[
								styles.side,
								{
									width: sideWidth,
									borderRightColor: `${m3.surfaceContainerHigh}55`,
								},
							]}
							showsVerticalScrollIndicator={false}>
							{sideContent}
						</ScrollView>
					) : (
						sideContent
					)}

					<View style={styles.main}>
						<ProfileTabBar
							tabs={TAB_ORDER}
							activeKey={activeTab}
							onSelect={(key) => setActiveTab(key)}
							wide={twoPane}
						/>

						<View style={styles.content}>
							{activeTab === "continue" ? (
								<ContinueWatchingList
									items={continueWatching}
									view={continueView}
									onToggleView={() =>
										setContinueView((v) =>
											v === "list" ? "grid" : "list",
										)
									}
									onPressItem={playContinue}
									onRemove={removeContinue}
									fallbackWidth={paneFallbackWidth}
								/>
							) : activeTab === "favorites" ? (
								<FavoriteGrid
									items={favItems}
									counts={favCounts}
									filter={favFilter}
									onFilter={setFavFilter}
									sortLabel={SORT_LABELS[favSort]}
									onToggleSort={() =>
										setFavSort((s) =>
											s === "added" ? "title" : "added",
										)
									}
									onPressItem={openDetails}
									onRemove={removeFavorite}
									fallbackWidth={paneFallbackWidth}
								/>
							) : (
								<HistoryList
									items={historyItems}
									weekCount={weekCount}
									sortLabel={SORT_LABELS[historySort]}
									onToggleSort={() =>
										setHistorySort((s) =>
											s === "added" ? "title" : "added",
										)
									}
									onClear={confirmClearHistory}
									onPressItem={openDetails}
									onRemove={removeHistory}
								/>
							)}
						</View>
					</View>
				</View>
			</SafeAreaView>
		</>
	);
}

const styles = StyleSheet.create({
	safeArea: {
		flex: 1,
	},
	body: {
		flex: 1,
	},
	// Yatay/geniş yerleşim: sol sütun (kimlik + hesap + istatistik) ve
	// sağda sekmeler + içerik.
	bodyWide: {
		flexDirection: "row",
		gap: 16,
	},
	side: {
		// ⚠️ ScrollView varsayılanı `flexGrow: 1`: satırda serbest alanı
		// yan sütunla paylaşıp sütunu 316dp'den ~580dp'ye şişiriyordu
		// (TV'de doğrulandı). Genişlik sabit kalır; büyüyen taraf panodur.
		flexGrow: 0,
		flexShrink: 0,
		borderRightWidth: 1,
	},
	main: {
		flex: 1,
		minWidth: 0,
	},
	content: {
		flex: 1,
	},
});
