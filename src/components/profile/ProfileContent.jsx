/**
 * Profil Ekranı — Sekme Gövdeleri
 *
 *   • ContinueWatchingList — liste + ızgara görünümü (referans: minimal)
 *   • FavoriteGrid          — filtre çipleri + 2 sütun poster ızgarası
 *   • HistoryList           — dönem çipi + satır listesi
 *
 * ⚠️ Bu dosyadaki rozetler veri yoksa render EDİLMEZ. Bkz.
 * `ProfileBadges.jsx` ve `src/utils/profileFormat.js` başlığı.
 *
 * ⚠️ TV/P、Amazon focus yapısı: Her kart, iç içe `Pressable` YERİNE kardeş
 * pressable'lar kullanır. İç içe focusable'lar Android TV'de D-Pad odağını
 * iki hedef arasında sıkıştırır (focus thrash) ve hangi düğmenin
 * odaklandığı görünmez olur. Bu yüzden kart çerçevesi düz `View`'dir;
 * dokunulabilir alanlar (görsel/metin) ve eylem düğmeleri kardeştir.
 *
 * Liste veresi `FlatList` ile verilir; `ScrollView` içine gömülmez —
 * iç içe scroll view Android'de performans düşürür ve kısayol jestini bozar.
 */

import { useThemeContext } from "@/context/ThemeContext";
import { ScreenGutter } from "@constants/theme";
import {
	EmptyState,
	PluginBadge,
	QualityBadge,
	RatingBadge,
} from "@/components/profile/ProfileBadges";
import {
	formatDurationShort,
	formatMetaLine,
	formatPluginName,
	formatSeasonEpisode,
	formatTimeLeft,
	formatWatchedAt,
	formatWatchedStatus,
	progressPercent,
} from "@/utils/profileFormat";
import TVPressable from "@components/common/TVPressable";
import { resolvePluginName } from "@/utils/storage";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import {
	FlatList,
	StyleSheet,
	Text,
	useWindowDimensions,
	View,
} from "react-native";

/** Favoriler ızgarasının sütun sayısı. */
const FAV_COLUMNS = 3;

/** Oynat düğmesi + karartma katmanı (liste ve ızgara ortak). */
function PlayOverlay({ color, iconColor }) {
	return (
		<View style={styles.scrim} pointerEvents="none">
			<View style={[styles.playDot, { backgroundColor: color }]}>
				<Ionicons name="play" size={14} color={iconColor} />
			</View>
		</View>	);
}

/** Alt ilerleme çubuğu. */
function ProgressBar({ percent, color }) {
	if (!percent) return null;
	return (
		<View style={styles.progressTrack} pointerEvents="none">
			<View
				style={[
					styles.progressFill,
					{ width: `${percent}%`, backgroundColor: color },
				]}
			/>
		</View>
	);
}

// ════════════════════════════════════════════════════════════════
// 1) DEVAM EDENLER
// ════════════════════════════════════════════════════════════════

function ContinueRow({ item, onPress, onRemove }) {
	const { m3 } = useThemeContext();
	const percent = progressPercent(item);
	const timeLeft = formatTimeLeft(item);
	const meta = formatSeasonEpisode(item) || formatMetaLine(item);
	const title = item.title || item.seriesTitle || "İçerik";

	return (
		<View
			style={[
				styles.rowCard,
				{
					backgroundColor: m3.surfaceContainer,
					borderColor: `${m3.surfaceContainerHigh}80`,
				},
			]}>
			<TVPressable
				onPress={onPress}
				focusedStyle={styles.focusedScale}
				style={styles.rowPress}
				accessibilityLabel={title}>
				<View
					style={[
						styles.rowThumb,
						{ backgroundColor: m3.surfaceContainerHighest },
					]}>
					<Image
						source={{ uri: item.poster }}
						style={StyleSheet.absoluteFill}
						contentFit="cover"
						transition={120}
					/>
					<PlayOverlay color={m3.primaryContainer} iconColor={m3.onPrimaryContainer} />
					<ProgressBar percent={percent} color={m3.primaryContainer} />
				</View>

				<View style={styles.rowBody}>
					<Text
						style={[styles.rowTitle, { color: m3.onSurface }]}
						numberOfLines={1}>
						{title}
					</Text>
					{meta ? (
						<Text
							style={[styles.rowMeta, { color: m3.onSurfaceVariant }]}
							numberOfLines={1}>
							{meta}
						</Text>
					) : null}
					{timeLeft ? (
						<View style={styles.footLine}>
							<Ionicons name="time-outline" size={13} color={m3.tertiary} />
							<Text style={[styles.timeLeft, { color: m3.tertiary }]}>
								{timeLeft}
							</Text>
						</View>
					) : null}
				</View>
			</TVPressable>

			<TVPressable
				onPress={onRemove}
				focusedStyle={styles.focusedSmall}
				style={styles.removeBtn}
				accessibilityLabel={`${title} listesinden çıkar`}>
				<Ionicons name="close" size={15} color={`${m3.onSurfaceVariant}99`} />
			</TVPressable>
		</View>
	);
}

function ContinueTile({ item, onPress, onRemove }) {
	const { m3 } = useThemeContext();
	const percent = progressPercent(item);
	const timeLeft = formatTimeLeft(item);
	const meta = formatSeasonEpisode(item) || formatMetaLine(item);
	const title = item.title || item.seriesTitle || "İçerik";

	return (
		<View
			style={[
				styles.tile,
				{
					backgroundColor: m3.surfaceContainer,
					borderColor: `${m3.surfaceContainerHigh}80`,
				},
			]}>
			<TVPressable
				onPress={onPress}
				focusedStyle={styles.focusedScale}
				style={styles.tilePress}
				accessibilityLabel={title}>
				<View
					style={[
						styles.tileImage,
						{ backgroundColor: m3.surfaceContainerHighest },
					]}>
					<Image
						source={{ uri: item.poster }}
						style={StyleSheet.absoluteFill}
						contentFit="cover"
						transition={120}
					/>
					<PlayOverlay color={m3.primaryContainer} iconColor={m3.onPrimaryContainer} />
					<ProgressBar percent={percent} color={m3.primaryContainer} />
				</View>

				<View style={styles.tileBody}>
					<Text
						style={[styles.tileTitle, { color: m3.onSurface }]}
						numberOfLines={1}>
						{title}
					</Text>
					{meta ? (
						<Text
							style={[styles.tileMeta, { color: m3.onSurfaceVariant }]}
							numberOfLines={1}>
							{meta}
						</Text>
					) : null}
					{timeLeft ? (
						<View style={styles.footLine}>
							<Ionicons name="time-outline" size={12} color={m3.tertiary} />
							<Text style={[styles.tileTimeLeft, { color: m3.tertiary }]}>
								{timeLeft}
							</Text>
						</View>
					) : null}
				</View>
			</TVPressable>

			<TVPressable
				onPress={onRemove}
				focusedStyle={styles.focusedSmall}
				style={[styles.tileRemove, { backgroundColor: "rgba(11,14,20,0.8)" }]}
				accessibilityLabel={`${title} listesinden çıkar`}>
				<Ionicons name="close" size={13} color={m3.onSurface} />
			</TVPressable>
		</View>
	);
}

/**
 * Devam edenler sekmesi.
 *
 * @param {{items: Array, view: "list"|"grid", onToggleView: () => void,
 *          onPressItem: (item: object) => void,
 *          onRemove: (item: object) => void}} props
 */
export function ContinueWatchingList({
	items,
	view,
	onToggleView,
	onPressItem,
	onRemove,
}) {
	const { m3 } = useThemeContext();

	const segments = [
		{ key: "list", icon: "list", label: "Liste görünümü" },
		{ key: "grid", icon: "grid", label: "Izgara görünümü" },
	];

	return (
		<View>
			<View style={[styles.toolRow, { paddingHorizontal: ScreenGutter }]}>
				<View
					style={[
						styles.segmented,
						{
							backgroundColor: m3.surfaceContainer,
							borderColor: `${m3.surfaceContainerHigh}80`,
						},
					]}>
					{segments.map((seg) => {
						const isActive = seg.key === view;
						return (
							<TVPressable
								key={seg.key}
								onPress={() => !isActive && onToggleView()}
								focusedStyle={styles.focusedSmall}
								style={[
									styles.segment,
									isActive && {
										backgroundColor: m3.surfaceContainerHigh,
									},
								]}
								accessibilityLabel={seg.label}>
								<Ionicons
									name={seg.icon}
									size={16}
									color={
										isActive ? m3.primaryContainer : m3.onSurfaceVariant
									}
								/>
							</TVPressable>
						);
					})}
				</View>
			</View>

			{items.length === 0 ? (
				<EmptyState
					icon="play-circle-outline"
					title="Devam eden içerik yok"
					subtitle="İzlemeye başladığınız dizi ve filmler burada toplanır."
				/>
			) : (
				<FlatList
					data={items}
					keyExtractor={(item, index) => String(item.id || item.url || index)}
					// numColumns değişince ölçümler bayat kalır; `key` listeyi
					// yeniden kurar (FlatList bu değişimi destekler).
					key={view}
					renderItem={({ item }) =>
						view === "grid" ? (
							<ContinueTile
								item={item}
								onPress={() => onPressItem(item)}
								onRemove={() => onRemove(item)}
							/>
						) : (
							<ContinueRow
								item={item}
								onPress={() => onPressItem(item)}
								onRemove={() => onRemove(item)}
							/>
						)
					}
					numColumns={view === "grid" ? 2 : 1}
					columnWrapperStyle={view === "grid" ? styles.colGap : undefined}
					contentContainerStyle={{
						paddingHorizontal: ScreenGutter,
						paddingBottom: 24,
						rowGap: 12,
					}}
					showsVerticalScrollIndicator={false}
					removeClippedSubviews
				/>
			)}
		</View>
	);
}

// ════════════════════════════════════════════════════════════════
// 2) FAVORİLER
// ════════════════════════════════════════════════════════════════

function FavoriteCard({ item, onPress, onRemove, cardWidth }) {
	const { m3 } = useThemeContext();
	const meta = formatMetaLine(item);
	const title = item.title || "İçerik";

	return (
		<View
			style={[
				styles.favCard,
				{
					backgroundColor: m3.surfaceContainer,
					borderColor: `${m3.surfaceContainerHigh}66`,
					// ⚠️ `flex: 1` TEK BAŞINA YETERLİ DEĞİL: 3 sütunda 4 kayıt
					// varsa son satırda tek kart kalır ve `flex: 1` onu tüm genişliğe
					// yayıyordu (cihazda doğrulandı: 4. poster tüm ekranı kaplıyordu).
					// `maxWidth` o satırdaki kartı diğerleriyle aynı genişlikte tutar.
					maxWidth: cardWidth,
				},
			]}>
			<TVPressable
				onPress={onPress}
				focusedStyle={styles.focusedScale}
				style={styles.favPress}
				accessibilityLabel={title}>
				<View
					style={[
						styles.favPoster,
						{ backgroundColor: m3.surfaceContainerHigh },
					]}>
					<Image
						source={{ uri: item.poster }}
						style={StyleSheet.absoluteFill}
						contentFit="cover"
						transition={120}
					/>

					<View style={styles.favTopRow} pointerEvents="none">
						<RatingBadge rating={item.rating} />
					</View>

					<View style={styles.favBottomRow} pointerEvents="none">
						<QualityBadge
							quality={item.quality}
							dub={item.dub}
							style={styles.onPosterChip}
						/>
						{/* ⚠️ `item.plugin` tek başına YETMEZ. Kayıtta `plugin`
						    alanı boş olan favoriler vardı; `resolvePluginName`
						    (bkz. utils/storage.js:1941) alanı ve URL'yi denetleyip
						    eklenti adını geri döndürür. Eskiden de bu kullanılıyordu,
						    bu ekranda yazılınca rozet kaybolmuştu. `formatPluginName`
						    ise URL'den gelen küçük harfli slug'ı kanonik yazıma çevirir
						    (aksi hâlde aynı listede "HDFilmCehennemi" ve
						    "hdfilmcehennemi" yan yana görünüyordu). */}
						<PluginBadge
							plugin={formatPluginName(resolvePluginName(item))}
							style={styles.onPosterChip}
						/>
					</View>
				</View>

				<View style={styles.favInfo}>
					<Text
						style={[styles.favTitle, { color: m3.onSurface }]}
						numberOfLines={1}>
						{title}
					</Text>
					{meta ? (
						<Text
							style={[styles.favMeta, { color: `${m3.onSurface}99` }]}
							numberOfLines={1}>
							{meta}
						</Text>
					) : null}
				</View>
			</TVPressable>

			{/* Kalp, poster alanının ÜSTÜNDE ama onun KARDEŞİ: iç içe
			    Pressable yapmıyoruz (TV focus takılması). */}
			<TVPressable
				onPress={onRemove}
				focusedStyle={styles.focusedSmall}
				style={[styles.heartBtn, { backgroundColor: "rgba(11,14,20,0.85)" }]}
				accessibilityLabel={`${title} favorilerden çıkar`}>
				<Ionicons name="heart" size={16} color={m3.primaryContainer} />
			</TVPressable>
		</View>
	);
}

/**
 * Favoriler sekmesi.
 *
 * @param {{items: Array, counts: {all: number, movie: number, series: number},
 *          filter: string, onFilter: (f: string) => void,
 *          sortLabel: string, onToggleSort: () => void,
 *          onPressItem: (item: object) => void,
 *          onRemove: (item: object) => void}} props
 */
export function FavoriteGrid({
	items,
	counts,
	filter,
	onFilter,
	sortLabel,
	onToggleSort,
	onPressItem,
	onRemove,
}) {
	const { m3 } = useThemeContext();

	const chips = [
		{ key: "all", label: "Tümü", count: counts.all },
		{ key: "movie", label: "Filmler", count: counts.movie },
		{ key: "series", label: "Diziler", count: counts.series },
	];

	// 3 sütunda tek kartın sabit genişliği. `useWindowDimensions` kullanılıyor
	// ki tablet/tv'de esnemez; `Dimensions.get` ekran döndüğünde güncellenmez.
	const { width: winWidth } = useWindowDimensions();
	const FAV_GAP = 12;
	const cardWidth =
		(winWidth - ScreenGutter * 2 - FAV_GAP * 2) / FAV_COLUMNS;

	return (
		<View>
			<View style={[styles.toolRow, { paddingHorizontal: ScreenGutter }]}>
				<View style={styles.chipRow}>
					{chips.map((chip) => {
						const isActive = chip.key === filter;
						return (
							<TVPressable
								key={chip.key}
								onPress={() => onFilter(chip.key)}
								focusedStyle={styles.focusedPill}
								style={[
									styles.filterChip,
									isActive
										? { backgroundColor: m3.primaryContainer }
										: { backgroundColor: m3.surfaceContainerHigh },
								]}
								accessibilityLabel={`${chip.label} (${chip.count})`}>
								<Text
									style={[
										styles.filterChipText,
										{
											color: isActive
												? m3.onPrimaryContainer
												: `${m3.onSurface}B3`,
										},
									]}>
									{chip.label} ({chip.count})
								</Text>
							</TVPressable>
						);
					})}
				</View>

				<TVPressable
					onPress={onToggleSort}
					focusedStyle={styles.focusedSmall}
					style={[styles.toolBtn, { backgroundColor: m3.surfaceContainer }]}
					accessibilityLabel={`Sırala: ${sortLabel}`}>
					<Ionicons
						name="swap-vertical"
						size={17}
						color={`${m3.onSurface}CC`}
					/>
				</TVPressable>
			</View>

			<View style={[styles.subHeader, { paddingHorizontal: ScreenGutter }]}>
				<View style={styles.subHeaderLeft}>
					<Ionicons name="sparkles" size={15} color={m3.tertiary} />
					<Text style={[styles.subHeaderText, { color: `${m3.onSurface}99` }]}>
						Sıralama:{" "}
						<Text style={{ color: m3.onSurface, fontWeight: "600" }}>
							{sortLabel}
						</Text>
					</Text>
				</View>
			</View>

			{items.length === 0 ? (
				<EmptyState
					icon="heart-outline"
					title={
						filter === "all"
							? "Henüz favori içerik yok"
							: filter === "movie"
								? "Favori film yok"
								: "Favori dizi yok"
					}
					subtitle="Beğendiğiniz içerikleri favorilere ekleyin, tüm cihazlarınızda senkronlanır."
				/>
			) : (
				<FlatList
					data={items}
					keyExtractor={(item, index) => String(item.id || item.url || index)}
					renderItem={({ item }) => (
						<FavoriteCard
							item={item}
							cardWidth={cardWidth}
							onPress={() => onPressItem(item)}
							onRemove={() => onRemove(item)}
						/>
					)}
					// 3 sütun: 2 sütunda her poster ~205dp genişliğinde
					// kaldığı için kartlar ekranı domine ediyordu. Eski profil
					// ekranı da 3 sütundu; referans HTML'deki 2 sütun dar
					// ekran (390dp) için tasarlanmıştı.
					numColumns={FAV_COLUMNS}
					columnWrapperStyle={styles.colGap}
					contentContainerStyle={{
						paddingHorizontal: ScreenGutter,
						paddingBottom: 24,
						rowGap: 12,
					}}
					showsVerticalScrollIndicator={false}
					removeClippedSubviews
				/>
			)}
		</View>
	);
}

// ════════════════════════════════════════════════════════════════
// 3) SON İZLENENLER
// ════════════════════════════════════════════════════════════════

function HistoryRow({ item, onPress, onRemove }) {
	const { m3 } = useThemeContext();
	const duration = formatDurationShort(item.duration);
	const meta = formatMetaLine(item);
	const watched = formatWatchedAt(item.watchedAt);
	const status = formatWatchedStatus(item);
	const title = item.title || item.seriesTitle || "İçerik";

	return (
		<View
			style={[
				styles.histCard,
				{
					backgroundColor: m3.surfaceContainerLow,
					borderColor: `${m3.surfaceContainerHigh}66`,
				},
			]}>
			<TVPressable
				onPress={onPress}
				focusedStyle={styles.focusedScale}
				style={styles.histPress}
				accessibilityLabel={title}>
				<View
					style={[
						styles.histThumb,
						{ backgroundColor: m3.surfaceContainerHighest },
					]}>
					<Image
						source={{ uri: item.poster }}
						style={StyleSheet.absoluteFill}
						contentFit="cover"
						transition={120}
					/>
					{duration ? (
						<View
							style={[
								styles.durationPill,
								{ backgroundColor: "rgba(11,14,20,0.9)" },
							]}>
							<Text style={[styles.durationText, { color: m3.onSurface }]}>
								{duration}
							</Text>
						</View>
					) : null}
				</View>

				<View style={styles.histBody}>
					<Text
						style={[styles.histTitle, { color: m3.onSurface }]}
						numberOfLines={1}>
						{title}
					</Text>

					<View style={styles.histMetaRow}>
						{meta ? (
							<Text
								style={[styles.histType, { color: `${m3.onSurface}80` }]}
								numberOfLines={1}>
								{meta}
							</Text>
						) : null}
						<QualityBadge
							quality={item.quality}
							dub={item.dub}
							style={styles.inlineChip}
						/>
					</View>

					{watched || status ? (
						<View style={styles.footLine}>
							{status ? (
								<Ionicons
									name="checkmark-circle"
									size={14}
									color="#34d399"
								/>
							) : null}
							<Text
								style={[styles.histFootText, { color: `${m3.onSurface}99` }]}
								numberOfLines={1}>
								{[watched, status].filter(Boolean).join(" • ")}
							</Text>
						</View>
					) : null}
				</View>
			</TVPressable>

			<TVPressable
				onPress={onRemove}
				focusedStyle={styles.focusedRound}
				style={[styles.replayBtn, { backgroundColor: m3.surfaceContainer }]}
				accessibilityLabel={`${title} geçmişten kaldır`}>
				<Ionicons name="refresh" size={18} color={m3.onSurface} />
			</TVPressable>
		</View>
	);
}

/**
 * Son izlenenler sekmesi.
 *
 * @param {{items: Array, weekCount: number, sortLabel: string,
 *          onToggleSort: () => void, onClear: () => void,
 *          onPressItem: (item: object) => void,
 *          onRemove: (item: object) => void}} props
 */
export function HistoryList({
	items,
	weekCount,
	sortLabel,
	onToggleSort,
	onClear,
	onPressItem,
	onRemove,
}) {
	const { m3 } = useThemeContext();

	return (
		<View>
			<View style={[styles.toolRow, { paddingHorizontal: ScreenGutter }]}>
				<View style={styles.chipRow}>
					<View
						style={[
							styles.periodChip,
							{ backgroundColor: m3.surfaceContainer },
						]}>
						<Ionicons name="calendar-outline" size={13} color={m3.tertiary} />
						<Text style={[styles.periodChipText, { color: m3.onSurface }]}>
							Bu Hafta ({weekCount} içerik)
						</Text>
					</View>

					<TVPressable
						onPress={onToggleSort}
						focusedStyle={styles.focusedSmall}
						style={styles.sortTextBtn}
						accessibilityLabel={`Sırala: ${sortLabel}`}>
						<Text style={[styles.sortText, { color: `${m3.onSurface}99` }]}>
							{sortLabel}
						</Text>
						<Ionicons name="chevron-down" size={14} color={`${m3.onSurface}99`} />
					</TVPressable>
				</View>

				<TVPressable
					onPress={onClear}
					focusedStyle={styles.focusedSmall}
					style={styles.clearBtn}
					accessibilityLabel="Geçmişi temizle">
					<Ionicons
						name="trash-outline"
						size={14}
						color={`${m3.onSurfaceVariant}B3`}
					/>
					<Text style={[styles.clearText, { color: `${m3.onSurfaceVariant}B3` }]}>
						Geçmişi Temizle
					</Text>
				</TVPressable>
			</View>

			{items.length === 0 ? (
				<EmptyState
					icon="film-outline"
					title="İzleme geçmişi boş"
					subtitle="İzlediğiniz içerikler burada listelenir."
				/>
			) : (
				<FlatList
					data={items}
					keyExtractor={(item, index) => String(item.id || item.url || index)}
					renderItem={({ item }) => (
						<HistoryRow
							item={item}
							onPress={() => onPressItem(item)}
							onRemove={() => onRemove(item)}
						/>
					)}
					contentContainerStyle={{
						paddingHorizontal: ScreenGutter,
						paddingBottom: 24,
						rowGap: 8,
					}}
					showsVerticalScrollIndicator={false}
					removeClippedSubviews
				/>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	// ── Ortak ──
	toolRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 8,
		paddingTop: 4,
		paddingBottom: 12,
	},
	subHeader: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingBottom: 10,
	},
	subHeaderLeft: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
	},
	subHeaderText: {
		fontSize: 13,
		lineHeight: 18,
	},
	/** Sütunlar arası yatay boşluk (columnWrapperStyle). */
	colGap: {
		gap: 12,
	},
	footLine: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		marginTop: 4,
	},
	scrim: {
		// ⚠️ `...StyleSheet.absoluteFillObject` spread'i BURADA ÇALIŞMIYORDU:
		// scrim mutlak konumlanmıyor, akışta kendi içerik yüksekliğinde
		// (30dp) duruyordu. `justifyContent: "center"` için boş alan
		// kalmadığı için play düğmesi `top: 0`'a yapışıyordu (cihazda
		// uiautomator ile ölçüldü: 64dp kap içinde 17dp yukarıda).
		// Konum değerleri AÇIKÇA yazılır; yayma ile gelmeye güvenilmez.
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		backgroundColor: "rgba(0,0,0,0.4)",
		alignItems: "center",
		justifyContent: "center",
	},
	playDot: {
		width: 30,
		height: 30,
		borderRadius: 15,
		alignItems: "center",
		justifyContent: "center",
	},
	progressTrack: {
		position: "absolute",
		left: 0,
		right: 0,
		bottom: 0,
		height: 4,
		backgroundColor: "rgba(0,0,0,0.7)",
	},
	progressFill: {
		height: "100%",
	},

	// ── Devam edenler ──
	segmented: {
		flexDirection: "row",
		padding: 2,
		borderRadius: 8,
		borderWidth: 1,
	},
	segment: {
		width: 30,
		height: 30,
		borderRadius: 6,
		alignItems: "center",
		justifyContent: "center",
	},
	rowCard: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		padding: 10,
		borderRadius: 12,
		borderWidth: 1,
	},
	rowPress: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
	},
	rowThumb: {
		width: 112,
		height: 64,
		borderRadius: 8,
		overflow: "hidden",
	},
	rowBody: {
		flex: 1,
		minWidth: 0,
	},
	rowTitle: {
		fontSize: 14,
		lineHeight: 18,
		fontWeight: "600",
	},
	rowMeta: {
		fontSize: 12,
		lineHeight: 16,
		marginTop: 2,
	},
	timeLeft: {
		fontSize: 11,
		lineHeight: 16,
		fontWeight: "600",
	},
	tile: {
		flex: 1,
		borderRadius: 12,
		borderWidth: 1,
		overflow: "hidden",
	},
	tilePress: {
		width: "100%",
	},
	tileImage: {
		width: "100%",
		aspectRatio: 16 / 9,
	},
	tileBody: {
		padding: 8,
	},
	tileTitle: {
		fontSize: 12,
		lineHeight: 16,
		fontWeight: "600",
	},
	tileMeta: {
		fontSize: 11,
		lineHeight: 16,
		marginTop: 2,
	},
	tileTimeLeft: {
		fontSize: 10,
		lineHeight: 14,
		fontWeight: "600",
	},

	// ── Favoriler ──
	chipRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		flexShrink: 1,
	},
	filterChip: {
		paddingHorizontal: 12,
		paddingVertical: 6,
		borderRadius: 999,
	},
	filterChipText: {
		fontSize: 12,
		lineHeight: 16,
		fontWeight: "600",
	},
	toolBtn: {
		width: 34,
		height: 34,
		borderRadius: 8,
		alignItems: "center",
		justifyContent: "center",
	},
	favCard: {
		flex: 1,
		borderRadius: 12,
		borderWidth: 1,
		overflow: "hidden",
	},
	favPress: {
		width: "100%",
	},
	favPoster: {
		width: "100%",
		aspectRatio: 2 / 3,
	},
	favTopRow: {
		position: "absolute",
		top: 6,
		left: 6,
		right: 6,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
	favBottomRow: {
		position: "absolute",
		left: 6,
		right: 6,
		bottom: 6,
		flexDirection: "row",
		gap: 4,
	},
	onPosterChip: {
		backgroundColor: "rgba(11,14,20,0.8)",
		// 3 sütunda kart ~130dp genişliğinde. Yüzde (`85%`) kırılmaz,
		// mutlak konumlu ve kendini saran bir satırda referanssız kalıyor;
		// sabit sınır veriyoruz ki "HDFilmCehennemi" yarıda kesilmesin.
		maxWidth: 104,
	},
	favInfo: {
		padding: 6,
		gap: 1,
	},
	favTitle: {
		fontSize: 13,
		lineHeight: 17,
		fontWeight: "700",
	},
	favMeta: {
		fontSize: 11,
		lineHeight: 15,
	},

	// ── Geçmiş ──
	periodChip: {
		flexDirection: "row",
		alignItems: "center",
		gap: 5,
		paddingHorizontal: 10,
		paddingVertical: 5,
		borderRadius: 999,
	},
	periodChipText: {
		fontSize: 10,
		lineHeight: 12,
		fontWeight: "700",
	},
	sortTextBtn: {
		flexDirection: "row",
		alignItems: "center",
		gap: 2,
		paddingVertical: 6,
	},
	sortText: {
		fontSize: 10,
		lineHeight: 12,
		fontWeight: "700",
	},
	clearBtn: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		paddingVertical: 6,
		paddingLeft: 6,
	},
	clearText: {
		fontSize: 10,
		lineHeight: 12,
		fontWeight: "700",
	},
	histCard: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		padding: 10,
		borderRadius: 12,
		borderWidth: 1,
	},
	histPress: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
	},
	histThumb: {
		width: 96,
		height: 56,
		borderRadius: 8,
		overflow: "hidden",
	},
	durationPill: {
		position: "absolute",
		right: 4,
		bottom: 4,
		paddingHorizontal: 4,
		paddingVertical: 1,
		borderRadius: 4,
	},
	durationText: {
		fontSize: 10,
		lineHeight: 12,
		fontWeight: "700",
	},
	histBody: {
		flex: 1,
		minWidth: 0,
	},
	histTitle: {
		fontSize: 15,
		lineHeight: 20,
		fontWeight: "600",
	},
	histMetaRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		marginTop: 3,
	},
	histType: {
		fontSize: 12,
		lineHeight: 16,
	},
	inlineChip: {
		backgroundColor: "transparent",
	},
	histFootText: {
		fontSize: 12,
		lineHeight: 16,
		flexShrink: 1,
	},
	replayBtn: {
		width: 40,
		height: 40,
		borderRadius: 20,
		alignItems: "center",
		justifyContent: "center",
	},

	// ── Kaldırma ──
	removeBtn: {
		width: 28,
		height: 28,
		borderRadius: 14,
		alignItems: "center",
		justifyContent: "center",
	},
	tileRemove: {
		position: "absolute",
		top: 6,
		right: 6,
		width: 24,
		height: 24,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
	},
	heartBtn: {
		position: "absolute",
		top: 6,
		right: 6,
		width: 24,
		height: 24,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
	},

	// ── TV odak (yalnızca TV'de uygulanır) ──
	focusedScale: {
		transform: [{ scale: 1.04 }],
	},
	focusedSmall: {
		borderColor: "#FFFFFF",
		borderWidth: 1.5,
	},
	focusedPill: {
		transform: [{ scale: 1.05 }],
	},
	focusedRound: {
		transform: [{ scale: 1.12 }],
	},
});
