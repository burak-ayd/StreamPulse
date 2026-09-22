import { FEATURED_MOVIES } from "@constants/data";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { LinearGradient } from "expo-linear-gradient";
import React, {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	ActivityIndicator,
	Animated,
	Dimensions,
	Platform,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from "react-native";

// Ekran boyutunu her render'da taze al (yatay/dikey dönüşte güncellenir)
function getLayout(oneMovieCard = false) {
	const { width, height } = Dimensions.get("window");
	const isLandscape = width > height;
	const isTablet = width >= 768;
	let spacing = 14;
	let heightRatio = 1.48;

	// ─ Yan karttan ne kadar görünsün? ─────────────────────────────────────────
	// Bu değeri artırırsanız yan kartlar daha fazla gözükür,
	// azaltırsanız aktif kart daha geniş olur.
	let peek;

	if (isTablet && isLandscape)
		peek = 130; // tablet yatay
	else if (isTablet)
		peek = 95; // tablet dikey
	else if (isLandscape)
		peek = 85; // telefon yatay
	else peek = 48; // telefon dikey  ← ana değer burası
	if (oneMovieCard) {
		spacing = 0;
		peek = 0;
		heightRatio = 1;
	}
	// cardWidth bu sabitten türetiliyor — oran değil, peek sabittir
	const sideInset = peek + spacing;
	const cardWidth = width - 2 * peek - spacing;

	return {
		screenWidth: width,
		cardWidth,
		cardHeight: cardWidth * heightRatio,
		spacing,
		sideInset,
		itemSize: cardWidth + spacing,
	};
}

// const CARD_WIDTH = SCREEN_WIDTH * 0.76;
// const CARD_HEIGHT = CARD_WIDTH * 1.48;
// const SPACING = 14;
// const SIDE_INSET = (SCREEN_WIDTH - CARD_WIDTH) / 2;
// const ITEM_SIZE = CARD_WIDTH + SPACING;

// ─── Yıldız puanı ─────────────────────────────────────────────────────────────
function StarRating({ rating }) {
	const filled = Math.floor(rating / 2);
	const half = rating / 2 - filled >= 0.5;
	return (
		<View style={styles.starRow}>
			{/* {[1, 2, 3, 4, 5].map((i) => (
				<Ionicons
					key={i}
					name={
						i <= filled
							? "star"
							: i === filled + 1 && half
								? "star-half"
								: "star-outline"
					}
					size={11}
					color="#F5C518"
					style={{ marginRight: 1 }}
				/>
			))} */}
			<Ionicons
				name="star"
				size={11}
				color="#F5C518"
				style={{ marginRight: 1 }}
			/>
			<Text style={styles.ratingText}>{rating.toFixed(1)}</Text>
		</View>
	);
}

// ─── Afiş: skeleton + hata durumu ────────────────────────────────────────────
function PosterImage({ uri, accentColor }) {
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(false);
	const fadeAnim = useRef(new Animated.Value(0)).current;

	const onLoad = useCallback(() => {
		setLoading(false);
		Animated.timing(fadeAnim, {
			toValue: 1,
			duration: 300,
			useNativeDriver: true,
		}).start();
	}, [fadeAnim]);

	const onError = useCallback(() => {
		setLoading(false);
		setError(true);
	}, []);

	return (
		<>
			{/* Skeleton — resim yüklenirken */}
			{loading && !error && (
				<View style={[styles.skeleton, { backgroundColor: "#1a1a2a" }]}>
					<ActivityIndicator color={accentColor} size="small" />
				</View>
			)}

			{/* Hata durumu */}
			{error && (
				<View style={[styles.skeleton, { backgroundColor: "#1a1a2a" }]}>
					<Ionicons name="image-outline" size={40} color="#333" />
					<Text style={styles.errorText}>Afiş yüklenemedi</Text>
				</View>
			)}

			{/* Gerçek resim — yüklenince fade-in */}
			{!error && (
				<Animated.Image
					source={{ uri }}
					style={[styles.poster, { opacity: fadeAnim }]}
					resizeMode="cover"
					onLoad={onLoad}
					onError={onError}
				/>
			)}
		</>
	);
}

// ─── Tek film kartı ───────────────────────────────────────────────────────────
const MovieCard = React.memo(
	({ item, index, scrollX, itemSize, cardWidth, cardHeight, onPress }) => {
		const inputRange = [
			(index - 1) * itemSize,
			index * itemSize,
			(index + 1) * itemSize,
		];

		const scale = scrollX.interpolate({
			inputRange,
			outputRange: [0.88, 1, 0.88],
			extrapolate: "clamp",
		});

		const opacity = scrollX.interpolate({
			inputRange,
			outputRange: [0.55, 1, 0.55],
			extrapolate: "clamp",
		});

		return (
			<Animated.View
				style={[
					{ width: cardWidth, height: cardHeight },
					{ transform: [{ scale }], opacity },
				]}>
				<TouchableOpacity
					activeOpacity={0.92}
					style={styles.card}
					onPress={() => onPress?.(item)}>
					<PosterImage
						uri={item.poster}
						accentColor={item.accentColor}
					/>

					<LinearGradient
						colors={[
							"transparent",
							"rgba(8,8,12,0.65)",
							"rgba(8,8,12,0.97)",
						]}
						locations={[0.25, 0.6, 1]}
						style={styles.gradient}
					/>

					{/* <View style={styles.topRow}>
						<View
							style={[
								styles.badge,
								{
									backgroundColor: item.accentColor + "33",
									borderColor: item.accentColor + "88",
								},
							]}>
							<Text
								style={[
									styles.badgeText,
									{ color: item.accentColor },
								]}>
								ÖNE ÇIKAN
							</Text>
						</View>
					</View> */}

					<View style={styles.info}>
						<View style={styles.genreRow}>
							{item.genres.map((g, i) => (
								<React.Fragment key={g}>
									<Text style={styles.genreText}>{g}</Text>
									{i < item.genres.length - 1 && (
										<Text style={styles.genreDot}> · </Text>
									)}
								</React.Fragment>
							))}
						</View>

						<Text style={styles.title} numberOfLines={2}>
							{item.title}
						</Text>

						<View style={styles.metaRow}>
							<StarRating rating={item.rating} />
							<View style={styles.metaDivider} />
							<Ionicons
								name="time-outline"
								size={12}
								color="#aaa"
							/>
							<Text style={styles.metaText}>{item.duration}</Text>
						</View>

						<Text style={styles.description} numberOfLines={3}>
							{item.description}
						</Text>

						{/* <TouchableOpacity
							style={[
								styles.watchBtn,
								{ backgroundColor: item.accentColor },
							]}
							activeOpacity={0.8}
							onPress={() => onPress?.(item)}>
							<Ionicons name="play" size={13} color="#0a0a0f" />
							<Text style={styles.watchText}>Şimdi İzle</Text>
						</TouchableOpacity> */}
					</View>
				</TouchableOpacity>
			</Animated.View>
		);
	},
);

// ─── Nokta indikatörleri (activeIndex state'e göre) ───────────────────────────
function Indicators({ count, activeIndex }) {
	return (
		<View style={styles.indicators}>
			{Array.from({ length: count }).map((_, i) => (
				<View
					key={i}
					style={[
						styles.dotBase,
						i === activeIndex
							? styles.dotActive
							: styles.dotInactive,
					]}
				/>
			))}
		</View>
	);
}

// ─── Ana carousel bileşeni ────────────────────────────────────────────────────
export default function FeaturedCarousel({
	movies = FEATURED_MOVIES,
	onPress,
	oneMovieCard,
}) {
	const INITIAL_LAYOUT = getLayout(oneMovieCard);
	const [layout, setLayout] = useState(INITIAL_LAYOUT);

	// Yatay/dikey döndüğünde veya pencere boyutu değiştiğinde layout'u güncelle
	useEffect(() => {
		const sub = Dimensions.addEventListener("change", () => {
			const next = getLayout();
			setLayout(next);
			// Aktif kartın yeni offset'ine animasyonsuz atla
			flatListRef.current?.scrollToIndex({
				index: activeIndexRef.current + 1, // +1: baştaki klon
				animated: false,
			});
		});
		return () => sub?.remove();
	}, []);

	const { cardWidth, cardHeight, spacing, sideInset, itemSize } = layout;

	const scrollX = useRef(new Animated.Value(itemSize)).current;
	const flatListRef = useRef(null);
	const activeIndexRef = useRef(0); // ref: dimension change callback'te stale closure yok
	const [activeIndex, setActiveIndex] = useState(0);

	const loopedData = useMemo(() => {
		if (movies.length === 0) return [];
		return [
			{ ...movies[movies.length - 1], _loopKey: "clone-last" },
			...movies.map((m) => ({ ...m, _loopKey: m.id })),
			{ ...movies[0], _loopKey: "clone-first" },
		];
	}, [movies]);

	useEffect(() => {
		if (!flatListRef.current || loopedData.length === 0) return;
		flatListRef.current.scrollToIndex({ index: 1, animated: false });
	}, [loopedData]);

	const handleMomentumScrollEnd = useCallback(
		(e) => {
			const offset = e.nativeEvent.contentOffset.x;
			const rawIndex = Math.round(offset / itemSize);

			if (rawIndex === 0) {
				const realLastLoopedIndex = movies.length;
				flatListRef.current?.scrollToIndex({
					index: realLastLoopedIndex,
					animated: false,
				});
				activeIndexRef.current = movies.length - 1;
				setActiveIndex(movies.length - 1);
			} else if (rawIndex === loopedData.length - 1) {
				flatListRef.current?.scrollToIndex({
					index: 1,
					animated: false,
				});
				activeIndexRef.current = 0;
				setActiveIndex(0);
			} else {
				activeIndexRef.current = rawIndex - 1;
				setActiveIndex(rawIndex - 1);
			}
		},
		[movies.length, loopedData.length, itemSize],
	);

	const renderItem = useCallback(
		({ item, index }) => (
			<MovieCard
				item={item}
				index={index}
				scrollX={scrollX}
				itemSize={itemSize}
				cardWidth={cardWidth}
				cardHeight={cardHeight}
				onPress={onPress}
			/>
		),
		[scrollX, itemSize, cardWidth, cardHeight, onPress],
	);

	const keyExtractor = useCallback((item) => item._loopKey, []);

	const getItemLayout = useCallback(
		(_, index) => ({ length: itemSize, offset: itemSize * index, index }),
		[itemSize],
	);

	return (
		<View style={styles.container}>
			<Animated.FlatList
				ref={flatListRef}
				data={loopedData}
				keyExtractor={keyExtractor}
				renderItem={renderItem}
				horizontal
				showsHorizontalScrollIndicator={false}
				snapToInterval={itemSize}
				snapToAlignment="start"
				decelerationRate={Platform.OS === "ios" ? "fast" : 0.88}
				contentContainerStyle={{
					paddingHorizontal: sideInset,
					gap: spacing,
				}}
				onScroll={Animated.event(
					[{ nativeEvent: { contentOffset: { x: scrollX } } }],
					{ useNativeDriver: true },
				)}
				onMomentumScrollEnd={handleMomentumScrollEnd}
				scrollEventThrottle={16}
				getItemLayout={getItemLayout}
			/>
			<Indicators count={movies.length} activeIndex={activeIndex} />
		</View>
	);
}

// ─── Stiller ──────────────────────────────────────────────────────────────────
const BORDER_RADIUS = 22;

const styles = StyleSheet.create({
	container: { alignItems: "center", marginVertical: 20 },

	card: {
		flex: 1,
		borderRadius: BORDER_RADIUS,
		overflow: "hidden",
		backgroundColor: "#111118",
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 16 },
		shadowOpacity: 0.6,
		shadowRadius: 24,
		elevation: 18,
	},
	poster: { ...StyleSheet.absoluteFill, borderRadius: BORDER_RADIUS },
	gradient: { ...StyleSheet.absoluteFill, borderRadius: BORDER_RADIUS },

	skeleton: {
		...StyleSheet.absoluteFill,
		borderRadius: BORDER_RADIUS,
		justifyContent: "center",
		alignItems: "center",
		gap: 8,
	},
	errorText: {
		color: "#444",
		fontSize: 12,
		marginTop: 4,
	},

	topRow: {
		position: "absolute",
		top: 16,
		left: 16,
		right: 16,
		flexDirection: "row",
	},
	badge: {
		paddingHorizontal: 10,
		paddingVertical: 4,
		borderRadius: 6,
		borderWidth: 1,
	},
	badgeText: { fontSize: 9.5, fontWeight: "800", letterSpacing: 1.2 },

	info: {
		position: "absolute",
		bottom: 0,
		left: 0,
		right: 0,
		padding: 18,
		paddingTop: 12,
	},
	genreRow: { flexDirection: "row", flexWrap: "wrap", marginBottom: 6 },
	genreText: {
		color: "#ccc",
		fontSize: 11,
		fontWeight: "500",
		letterSpacing: 0.3,
	},
	genreDot: { color: "#666", fontSize: 11 },
	title: {
		color: "#fff",
		fontSize: 22,
		fontWeight: "800",
		letterSpacing: -0.4,
		lineHeight: 27,
		marginBottom: 8,
	},
	metaRow: {
		flexDirection: "row",
		alignItems: "center",
		marginBottom: 10,
		gap: 6,
	},
	starRow: { flexDirection: "row", alignItems: "center", gap: 2 },
	ratingText: {
		color: "#F5C518",
		fontSize: 11,
		fontWeight: "700",
		marginLeft: 4,
	},
	metaDivider: {
		width: 1,
		height: 10,
		backgroundColor: "#444",
		marginHorizontal: 2,
	},
	metaText: { color: "#aaa", fontSize: 11, fontWeight: "500", marginLeft: 2 },
	description: {
		color: "#bbb",
		fontSize: 12,
		lineHeight: 17.5,
		marginBottom: 14,
	},
	watchBtn: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 6,
		paddingVertical: 10,
		paddingHorizontal: 20,
		borderRadius: 50,
		alignSelf: "flex-start",
	},
	watchText: {
		color: "#0a0a0f",
		fontSize: 12.5,
		fontWeight: "800",
		letterSpacing: 0.2,
	},

	indicators: {
		flexDirection: "row",
		alignItems: "center",
		marginTop: 16,
		gap: 5,
	},
	dotBase: { height: 6, borderRadius: 3, backgroundColor: "#fff" },
	dotActive: { width: 22, opacity: 1 },
	dotInactive: { width: 6, opacity: 0.35 },
});
