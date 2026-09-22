import { useThemeContext } from "@context/ThemeContext";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import {
	StatusBar,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
	useWindowDimensions,
} from "react-native";

const POSTER_WIDTH = 120;
const POSTER_HEIGHT = 180;

export default function HeroSection({ content }) {
	const { colors, theme } = useThemeContext();
	const router = useRouter();
	const { width, height } = useWindowDimensions();

	let BACKDROP_HEIGHT = height * 0.4;
	let resizeMode = "cover";
	if (width > 768) {
		BACKDROP_HEIGHT = height * 0.85;
		resizeMode = "stretch";
	}

	// Dynamic styles that depend on current dimensions
	const dynamicStyles = {
		container: {
			width: width,
			height: BACKDROP_HEIGHT,
		},
		backdropContainer: {
			width: width,
			height: BACKDROP_HEIGHT,
		},
	};

	return (
		<View style={[styles.container, dynamicStyles.container]}>
			<StatusBar
				barStyle="light-content"
				backgroundColor="transparent"
				translucent
			/>

			{/* Backdrop Image */}
			<View
				style={[
					styles.backdropContainer,
					dynamicStyles.backdropContainer,
				]}>
				{content.backdrop_url ? (
					<Image
						source={{ uri: content.backdrop_url }}
						style={styles.backdrop}
						contentFit={resizeMode}
						transition={200}
						cachePolicy="memory-disk"
					/>
				) : (
					<View
						style={[
							styles.backdropPlaceholder,
							{ backgroundColor: colors.cardBg },
						]}
					/>
				)}

				{/* Gradient Overlay */}
				<LinearGradient
					colors={[
						"rgba(0,0,0,0.3)",
						"rgba(0,0,0,0.6)",
						theme === "dark" ? "#121212" : "#f8f6f6",
					]}
					locations={[0, 0.5, 1]}
					style={styles.gradient}
				/>
			</View>

			{/* Back Button */}
			<TouchableOpacity
				style={[
					styles.backButton,
					{ backgroundColor: "rgba(0,0,0,0.5)" },
				]}
				onPress={() => router.back()}
				activeOpacity={0.8}>
				<Ionicons name="arrow-back" size={24} color="#ffffff" />
			</TouchableOpacity>

			{/* Content Info */}
			<View style={styles.contentInfo}>
				{/* Poster */}
				{/* <View style={styles.posterContainer}>
					{content.poster_url ? (
						<Image
							source={{ uri: content.poster_url }}
							style={styles.poster}
							contentFit="cover"
							transition={200}
							cachePolicy="memory-disk"
						/>
					) : (
						<View
							style={[
								styles.posterPlaceholder,
								{ backgroundColor: colors.cardBg },
							]}>
							<Ionicons
								name="film-outline"
								size={40}
								color={colors.textSecondary}
							/>
						</View>
					)}
				</View> */}

				{/* Text Info */}
				<View style={styles.textInfo}>
					<Text
						style={[styles.title, { color: colors.text }]}
						numberOfLines={2}>
						{content.title}
					</Text>

					{content.original_title &&
						content.original_title !== content.title && (
							<Text
								style={[
									styles.originalTitle,
									{ color: colors.textSecondary },
								]}
								numberOfLines={1}>
								{content.original_title}
							</Text>
						)}

					{content.tagline && (
						<Text
							style={[
								styles.tagline,
								{ color: colors.textSecondary },
							]}
							numberOfLines={2}>
							"{content.tagline}"
						</Text>
					)}
				</View>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		marginBottom: 20,
	},
	backdropContainer: {
		position: "absolute",
		top: 0,
		left: 0,
	},
	backdrop: {
		width: "100%",
		height: "100%",
	},
	backdropPlaceholder: {
		width: "100%",
		height: "100%",
	},
	gradient: {
		...StyleSheet.absoluteFill,
	},
	backButton: {
		position: "absolute",
		top: StatusBar.currentHeight ? StatusBar.currentHeight + 12 : 52,
		left: 16,
		width: 40,
		height: 40,
		borderRadius: 20,
		justifyContent: "center",
		alignItems: "center",
		zIndex: 10,
	},
	contentInfo: {
		position: "absolute",
		bottom: 20,
		left: 20,
		right: 20,
		flexDirection: "row",
		gap: 16,
	},
	posterContainer: {
		width: POSTER_WIDTH,
		height: POSTER_HEIGHT,
		borderRadius: 12,
		overflow: "hidden",
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 8 },
		shadowOpacity: 0.5,
		shadowRadius: 12,
		elevation: 10,
	},
	poster: {
		width: "100%",
		height: "100%",
	},
	posterPlaceholder: {
		width: "100%",
		height: "100%",
		justifyContent: "center",
		alignItems: "center",
	},
	textInfo: {
		flex: 1,
		justifyContent: "flex-end",
		paddingBottom: 4,
	},
	title: {
		fontSize: 26,
		fontWeight: "800",
		letterSpacing: -0.5,
		lineHeight: 32,
		marginBottom: 4,
	},
	originalTitle: {
		fontSize: 14,
		fontWeight: "500",
		marginBottom: 6,
		fontStyle: "italic",
	},
	tagline: {
		fontSize: 13,
		fontWeight: "500",
		lineHeight: 18,
		fontStyle: "italic",
	},
});
