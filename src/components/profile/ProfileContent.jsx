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

import { FontFamily, Palette, ScreenGutter } from "@constants/theme";
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
import { useMeasuredColumns } from "@/hooks/useMeasuredColumns";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import Image from "@/components/common/SmartImage";
import { FlatList, StyleSheet, Text, View } from "react-native";

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
	const percent = progressPercent(item);
	const timeLeft = formatTimeLeft(item);
	const meta = formatSeasonEpisode(item) || formatMetaLine(item);
	const title = item.title || item.seriesTitle || "İçerik";

	return (
		<View
			style={[
				styles.rowCard,
				{
					backgroundColor: Palette.surface,
					borderColor: `${Palette.surfaceHigh}80`,
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
						{ backgroundColor: Palette.surfaceHighest },
					]}>
					<Image
						source={{ uri: item.poster }}
						style={StyleSheet.absoluteFill}
						contentFit="cover"
						transition={120}
					/>
					<PlayOverlay color={Palette.primaryContainer} iconColor={Palette.onPrimaryContainer} />
					<ProgressBar percent={percent} color={Palette.primaryContainer} />
				</View>

				<View style={styles.rowBody}>
					<Text
						style={[styles.rowTitle, { color: Palette.onSurface }]}
						numberOfLines={1}>
						{title}
					</Text>
					{meta ? (
						<Text
							style={[styles.rowMeta, { color: Palette.onSurfaceVariant }]}
							numberOfLines={1}>
							{meta}
						</Text>
					) : null}
					{timeLeft ? (
						<View style={styles.footLine}>
							<Ionicons name="time-outline" size={13} color={Palette.tertiary} />
							<Text style={[styles.timeLeft, { color: Palette.tertiary }]}>
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
				<Ionicons name="close" size={15} color={`${Palette.onSurfaceVariant}99`} />
			</TVPressable>
		</View>
	);
}

function ContinueTile({ item, onPress, onRemove, maxWidth }) {
	const percent = progressPercent(item);
	const timeLeft = formatTimeLeft(item);
	const meta = formatSeasonEpisode(item) || formatMetaLine(item);
	const title = item.title || item.seriesTitle || "İçerik";

	return (
		<View
			style={[
				styles.tile,
				{
					backgroundColor: Palette.surface,
					borderColor: `${Palette.surfaceHigh}80`,
					// ⚠️ `flex: 1` TEK BAŞINA YETMİYOR: kayıt sayısı sütunun
					// katı değilse son satırdaki tek kart tüm satıra yayılıyordu
					// (TV'de tek kayıtla dev bir 16:9 kart kaplıyordu).
					maxWidth,
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
						{ backgroundColor: Palette.surfaceHighest },
					]}>
					<Image
						source={{ uri: item.poster }}
						style={StyleSheet.absoluteFill}
						contentFit="cover"
						transition={120}
					/>
					<PlayOverlay color={Palette.primaryContainer} iconColor={Palette.onPrimaryContainer} />
					<ProgressBar percent={percent} color={Palette.primaryContainer} />
				</View>

				<View style={styles.tileBody}>
					<Text
						style={[styles.tileTitle, { color: Palette.onSurface }]}
						numberOfLines={1}>
						{title}
					</Text>
					{meta ? (
						<Text
							style={[styles.tileMeta, { color: Palette.onSurfaceVariant }]}
							numberOfLines={1}>
							{meta}
						</Text>
					) : null}
					{timeLeft ? (
						<View style={styles.footLine}>
							<Ionicons name="time-outline" size={12} color={Palette.tertiary} />
							<Text style={[styles.tileTimeLeft, { color: Palette.tertiary }]}>
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
				<Ionicons name="close" size={13} color={Palette.onSurface} />
			</TVPressable>
		</View>
	);
}

/**
 * Devam edenler sekmesi.
 *
 * `fallbackWidth`: iki sütunlu profil yerleşiminde sağ panonun beklenen
 * genişliği — ölçüm ilk karede gelmeden önce ızgara yanlış sütunla
 * kurulmasın diye (bkz. hooks/useMeasuredColumns.js).
 *
 * @param {{items: Array, view: "list"|"grid", onToggleView: () => void,
 *          onPressItem: (item: object) => void,
 *          onRemove: (item: object) => void,
 *          fallbackWidth?: number}} props
 */
export function ContinueWatchingList({
	items,
	view,
	onToggleView,
	onPressItem,
	onRemove,
	fallbackWidth,
}) {

	// Sütun sayısı sabit 2 DEĞİL: kabın ölçüsünden türetilir. Sağ pano
	// daraldığında (iki sütunlu yerleşim) sabit 2 sütun kartları yeniden
	// devleştiriyordu; geniş ekranda ise 2 sütun israf.
	const { onLayout, columns, itemWidth } = useMeasuredColumns({
		minItemWidth: 155,
		gap: 12,
		max: 4,
		min: 2,
		padding: ScreenGutter,
		fallbackWidth,
	});

	const segments = [
		{ key: "list", icon: "list", label: "Liste görünümü" },
		{ key: "grid", icon: "grid", label: "Izgara görünümü" },
	];

	return (
		<View onLayout={onLayout}>
			<View style={[styles.toolRow, { paddingHorizontal: ScreenGutter }]}>
				<View
					style={[
						styles.segmented,
						{
							backgroundColor: Palette.surface,
							borderColor: `${Palette.surfaceHigh}80`,
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
										backgroundColor: Palette.surfaceHigh,
									},
								]}
								accessibilityLabel={seg.label}>
								<Ionicons
									name={seg.icon}
									size={16}
									color={
										isActive ? Palette.primaryContainer : Palette.onSurfaceVariant
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
					keyExtractor={(item, index) =>
						/*
						 * ⚠️ Çift kayıt savunması.
						 *
						 * `item.id || item.url` tek başına yeterli değil: diskte
						 * (senkron, eski sürümden gelen ya da iki farklı kod
						 * yolundan yazılmış) aynı içerik için İKİ kayıt
						 * bulunabiliyor. Bu durumda React "two children with
						 * the same key" hatası veriyor ve liste bozuluyordu.
						 *
						 * Kayıt `storage.js` içinde tekilleştiriliyor; buradaki
						 * `index` son eğer: disk zaten bozuksa bile liste
						 * çökmez ve satırlar birbirini ezmez.
						 */
						`${item.id || item.url || "item"}_${index}`
					}
					// numColumns değişince ölçümler bayat kalır; `key` listeyi
					// yeniden kurar (FlatList bu değişimi destekler). Sütun
					// sayısı ölçümden geldiği için `key` onu da içerir.
					key={`${view}-${columns}`}
					renderItem={({ item }) =>
						view === "grid" ? (
							<ContinueTile
								item={item}
								maxWidth={itemWidth}
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
					numColumns={view === "grid" ? columns : 1}
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
	const meta = formatMetaLine(item);
	const title = item.title || "İçerik";

	return (
		<View
			style={[
				styles.favCard,
				{
					backgroundColor: Palette.surface,
					borderColor: `${Palette.surfaceHigh}66`,
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
						{ backgroundColor: Palette.surfaceHigh },
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
						style={[styles.favTitle, { color: Palette.onSurface }]}
						numberOfLines={1}>
						{title}
					</Text>
					{meta ? (
						<Text
							style={[styles.favMeta, { color: `${Palette.onSurface}99` }]}
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
				<Ionicons name="heart" size={16} color={Palette.primaryContainer} />
			</TVPressable>
		</View>
	);
}

/**
 * Favoriler sekmesi.
 *
 * `fallbackWidth`: iki sütunlu profil yerleşiminde sağ panonun beklenen
 * genişliği (bkz. hooks/useMeasuredColumns.js).
 *
 * @param {{items: Array, counts: {all: number, movie: number, series: number},
 *          filter: string, onFilter: (f: string) => void,
 *          sortLabel: string, onToggleSort: () => void,
 *          onPressItem: (item: object) => void,
 *          onRemove: (item: object) => void,
 *          fallbackWidth?: number}} props
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
	fallbackWidth,
}) {

	const chips = [
		{ key: "all", label: "Tümü", count: counts.all },
		{ key: "movie", label: "Filmler", count: counts.movie },
		{ key: "series", label: "Diziler", count: counts.series },
	];

	// Sütun sayısı ve kart genişliği kabın ÖLÇÜLEN genişliğinden türetilir.
	//
	// ⚠️ Eski hesap `useWindowDimensions().width` kullanıyordu: pencere
	// genişliği paylaşılan tek değerdir ve iki sütunlu profilde kartlar
	// panodan taşar. Ayrıca sütun sayısı sabit 3'tü; telefon 2 sütunda
	// (~205dp poster) kartlar ekranı domine ederken yatay/tablet genişliği
	// israf ediyordu. Ölçümle 3→4-5 sütuna doğal geçiş olur.
	const { onLayout, columns, itemWidth } = useMeasuredColumns({
		minItemWidth: 110,
		gap: 12,
		max: 8,
		min: 3,
		padding: ScreenGutter,
		fallbackWidth,
	});

	return (
		<View onLayout={onLayout}>
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
										? { backgroundColor: Palette.primaryContainer }
										: { backgroundColor: Palette.surfaceHigh },
								]}
								accessibilityLabel={`${chip.label} (${chip.count})`}>
								<Text
									style={[
										styles.filterChipText,
										{
											color: isActive
												? Palette.onPrimaryContainer
												: `${Palette.onSurface}B3`,
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
					style={[styles.toolBtn, { backgroundColor: Palette.surface }]}
					accessibilityLabel={`Sırala: ${sortLabel}`}>
					<Ionicons
						name="swap-vertical"
						size={17}
						color={`${Palette.onSurface}CC`}
					/>
				</TVPressable>
			</View>

			<View style={[styles.subHeader, { paddingHorizontal: ScreenGutter }]}>
				<View style={styles.subHeaderLeft}>
					<Ionicons name="sparkles" size={15} color={Palette.tertiary} />
					<Text style={[styles.subHeaderText, { color: `${Palette.onSurface}99` }]}>
						Sıralama:{" "}
						<Text style={{ color: Palette.onSurface, fontFamily: FontFamily.semiBold }}>
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
					keyExtractor={(item, index) =>
						/*
						 * ⚠️ Çift kayıt savunması.
						 *
						 * `item.id || item.url` tek başına yeterli değil: diskte
						 * (senkron, eski sürümden gelen ya da iki farklı kod
						 * yolundan yazılmış) aynı içerik için İKİ kayıt
						 * bulunabiliyor. Bu durumda React "two children with
						 * the same key" hatası veriyor ve liste bozuluyordu.
						 *
						 * Kayıt `storage.js` içinde tekilleştiriliyor; buradaki
						 * `index` son eğer: disk zaten bozuksa bile liste
						 * çökmez ve satırlar birbirini ezmez.
						 */
						`${item.id || item.url || "item"}_${index}`
					}
					renderItem={({ item }) => (
						<FavoriteCard
							item={item}
							cardWidth={itemWidth}
							onPress={() => onPressItem(item)}
							onRemove={() => onRemove(item)}
						/>
					)}
					// Sütun sayısı ölçümden gelir (bkz. yukarıdaki not):
					// telefon dikeyde 3, geniş panoda 4-8. Sütun değişince
					// FlatList yeniden kurulur.
					key={`fav-${columns}`}
					numColumns={columns}
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
	const duration = formatDurationShort(item.duration);
	// ⚠️ Sezon/bölüm bilgisi gösterilmiyordu.
	//
	// `HistoryRow` yalnızca `formatMetaLine` çağırıyordu; o fonksiyon
	// sadece tür ("Dizi"/"Film") ve yıl yazar. Aynı dosyadaki
	// ContinueWatchingList (L87) ve FavoriteGrid (L158) ise
	// `formatSeasonEpisode`'yi ÖNCELİK olarak kullanıyor — tutarsızlık
	// buydu.
	//
	// Dizi kayıtlarında "S1:B4 • 4. Bölüm", filmlerde ise eski davranış
	// korunur ("Film", "Film 2024").
	const meta = formatSeasonEpisode(item) || formatMetaLine(item);
	const watched = formatWatchedAt(item.watchedAt);
	const status = formatWatchedStatus(item);
	const title = item.title || item.seriesTitle || "İçerik";

	return (
		<View
			style={[
				styles.histCard,
				{
					backgroundColor: Palette.surfaceLow,
					borderColor: `${Palette.surfaceHigh}66`,
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
						{ backgroundColor: Palette.surfaceHighest },
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
							<Text style={[styles.durationText, { color: Palette.onSurface }]}>
								{duration}
							</Text>
						</View>
					) : null}
				</View>

				<View style={styles.histBody}>
					<Text
						style={[styles.histTitle, { color: Palette.onSurface }]}
						numberOfLines={1}>
						{title}
					</Text>

					<View style={styles.histMetaRow}>
						{meta ? (
							<Text
								style={[styles.histType, { color: `${Palette.onSurface}80` }]}
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
								style={[styles.histFootText, { color: `${Palette.onSurface}99` }]}
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
				style={[styles.replayBtn, { backgroundColor: Palette.surface }]}
				accessibilityLabel={`${title} geçmişten kaldır`}>
				<Ionicons name="refresh" size={18} color={Palette.onSurface} />
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

	return (
		<View>
			<View style={[styles.toolRow, { paddingHorizontal: ScreenGutter }]}>
				<View style={styles.chipRow}>
					<View
						style={[
							styles.periodChip,
							{ backgroundColor: Palette.surface },
						]}>
						<Ionicons name="calendar-outline" size={13} color={Palette.tertiary} />
						<Text style={[styles.periodChipText, { color: Palette.onSurface }]}>
							Bu Hafta ({weekCount} içerik)
						</Text>
					</View>

					<TVPressable
						onPress={onToggleSort}
						focusedStyle={styles.focusedSmall}
						style={styles.sortTextBtn}
						accessibilityLabel={`Sırala: ${sortLabel}`}>
						<Text style={[styles.sortText, { color: `${Palette.onSurface}99` }]}>
							{sortLabel}
						</Text>
						<Ionicons name="chevron-down" size={14} color={`${Palette.onSurface}99`} />
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
						color={`${Palette.onSurfaceVariant}B3`}
					/>
					<Text style={[styles.clearText, { color: `${Palette.onSurfaceVariant}B3` }]}>
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
					keyExtractor={(item, index) =>
						/*
						 * ⚠️ Çift kayıt savunması.
						 *
						 * `item.id || item.url` tek başına yeterli değil: diskte
						 * (senkron, eski sürümden gelen ya da iki farklı kod
						 * yolundan yazılmış) aynı içerik için İKİ kayıt
						 * bulunabiliyor. Bu durumda React "two children with
						 * the same key" hatası veriyor ve liste bozuluyordu.
						 *
						 * Kayıt `storage.js` içinde tekilleştiriliyor; buradaki
						 * `index` son eğer: disk zaten bozuksa bile liste
						 * çökmez ve satırlar birbirini ezmez.
						 */
						`${item.id || item.url || "item"}_${index}`
					}
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
		fontFamily: FontFamily.semiBold,
	},
	rowMeta: {
		fontSize: 12,
		lineHeight: 16,
		marginTop: 2,
	},
	timeLeft: {
		fontSize: 11,
		lineHeight: 16,
		fontFamily: FontFamily.semiBold,
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
		fontFamily: FontFamily.semiBold,
	},
	tileMeta: {
		fontSize: 11,
		lineHeight: 16,
		marginTop: 2,
	},
	tileTimeLeft: {
		fontSize: 10,
		lineHeight: 14,
		fontFamily: FontFamily.semiBold,
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
		fontFamily: FontFamily.semiBold,
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
		fontFamily: FontFamily.bold,
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
		fontFamily: FontFamily.bold,
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
		fontFamily: FontFamily.bold,
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
		fontFamily: FontFamily.bold,
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
		fontFamily: FontFamily.bold,
	},
	histBody: {
		flex: 1,
		minWidth: 0,
	},
	histTitle: {
		fontSize: 15,
		lineHeight: 20,
		fontFamily: FontFamily.semiBold,
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
