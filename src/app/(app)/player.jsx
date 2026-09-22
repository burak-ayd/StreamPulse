import VideoPlayer from "@/components/player/VideoPlayer";
import { extractVideoSources } from "@/services/api";
import { addToWatchHistory } from "@/utils/storage";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import * as ScreenOrientation from "expo-screen-orientation";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
	ActivityIndicator,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from "react-native";

export default function PlayerScreen() {
	const params = useLocalSearchParams();
	const router = useRouter();

	const targetUrl = params.url;
	const title = params.title || "Video";
	const subtitle = params.subtitle || "";
	const poster = params.poster || null;
	const contentId = params.id || null;

	const [sources, setSources] = useState([]);
	const [loading, setLoading] = useState(Boolean(targetUrl));
	const [error, setError] = useState(
		!targetUrl ? "Oynatılacak video bağlantısı bulunamadı." : null,
	);

	const loadSources = useCallback(async () => {
		if (!targetUrl) {
			setError("Oynatılacak video bağlantısı bulunamadı.");
			setLoading(false);
			return;
		}

		try {
			setLoading(true);
			setError(null);
			const extracted = await extractVideoSources(targetUrl);

			if (Array.isArray(extracted) && extracted.length > 0) {
				setSources(extracted);
				// Add to watch history
				if (contentId || title) {
					addToWatchHistory({
						id: contentId || targetUrl,
						title,
						poster,
						overview: subtitle,
					}).catch(() => {});
				}
			} else {
				setError("Bu içerik için video kaynağı bulunamadı.");
			}
		} catch (err) {
			console.error("Player loadSources error:", err);
			setError("Video kaynakları alınırken bir hata oluştu.");
		} finally {
			setLoading(false);
		}
	}, [targetUrl, contentId, title, subtitle, poster]);

	useEffect(() => {
		// Video oynatıcı açıldığında her zaman doğrudan yatay moda kilitlen
		ScreenOrientation.lockAsync(
			ScreenOrientation.OrientationLock.LANDSCAPE,
		).catch(() => {});

		return () => {
			ScreenOrientation.lockAsync(
				ScreenOrientation.OrientationLock.PORTRAIT_UP,
			).catch(() => {});
		};
	}, []);

	useEffect(() => {
		if (!targetUrl) return;

		let isMounted = true;
		extractVideoSources(targetUrl)
			.then((extracted) => {
				if (!isMounted) return;
				if (Array.isArray(extracted) && extracted.length > 0) {
					setSources(extracted);
					if (contentId || title) {
						addToWatchHistory({
							id: contentId || targetUrl,
							title,
							poster,
							overview: subtitle,
						}).catch(() => {});
					}
				} else {
					setError("Bu içerik için video kaynağı bulunamadı.");
				}
			})
			.catch((err) => {
				if (!isMounted) return;
				console.error("Player loadSources error:", err);
				setError("Video kaynakları alınırken bir hata oluştu.");
			})
			.finally(() => {
				if (isMounted) setLoading(false);
			});

		return () => {
			isMounted = false;
		};
	}, [targetUrl, contentId, title, subtitle, poster]);

	const handleClose = () => {
		ScreenOrientation.lockAsync(
			ScreenOrientation.OrientationLock.PORTRAIT_UP,
		).catch(() => {});
		router.back();
	};

	return (
		<View style={styles.container}>
			<Stack.Screen options={{ headerShown: false }} />

			{loading && (
				<View style={styles.centerContainer}>
					<ActivityIndicator size="large" color="#FF3B30" />
					<Text style={styles.loadingTitle}>Video Kaynakları Taranıyor</Text>
					<Text style={styles.loadingSubtitle}>
						Lütfen bekleyin, en uygun yayın akışı hazırlanıyor...
					</Text>
					<TouchableOpacity
						style={[styles.backButton, { marginTop: 32 }]}
						onPress={handleClose}>
						<Ionicons name="arrow-back" size={20} color="#FFFFFF" />
						<Text style={styles.backButtonText}>Vazgeç</Text>
					</TouchableOpacity>
				</View>
			)}

			{!loading && error && (
				<View style={styles.centerContainer}>
					<Ionicons name="alert-circle-outline" size={60} color="#FF453A" />
					<Text style={styles.errorTitle}>Kaynak Bulunamadı</Text>
					<Text style={styles.errorDescription}>{error}</Text>
					<View style={styles.errorButtonsRow}>
						<TouchableOpacity
							style={styles.retryButton}
							onPress={loadSources}>
							<Ionicons name="refresh" size={18} color="#FFFFFF" />
							<Text style={styles.buttonText}>Tekrar Dene</Text>
						</TouchableOpacity>
						<TouchableOpacity
							style={styles.backButton}
							onPress={handleClose}>
							<Ionicons name="arrow-back" size={18} color="#FFFFFF" />
							<Text style={styles.buttonText}>Geri Dön</Text>
						</TouchableOpacity>
					</View>
				</View>
			)}

			{!loading && !error && sources.length > 0 && (
				<VideoPlayer
					sources={sources}
					title={title}
					subtitle={subtitle}
					poster={poster}
					onClose={handleClose}
				/>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: "#000000",
	},
	centerContainer: {
		flex: 1,
		backgroundColor: "#0B0E14",
		justifyContent: "center",
		alignItems: "center",
		paddingHorizontal: 28,
	},
	loadingTitle: {
		color: "#FFFFFF",
		fontSize: 18,
		fontWeight: "700",
		marginTop: 20,
	},
	loadingSubtitle: {
		color: "#8E8E93",
		fontSize: 14,
		textAlign: "center",
		marginTop: 8,
		lineHeight: 20,
	},
	errorTitle: {
		color: "#FFFFFF",
		fontSize: 20,
		fontWeight: "700",
		marginTop: 16,
	},
	errorDescription: {
		color: "#8E8E93",
		fontSize: 14,
		textAlign: "center",
		marginTop: 8,
		marginBottom: 28,
		lineHeight: 20,
	},
	errorButtonsRow: {
		flexDirection: "row",
		gap: 12,
	},
	retryButton: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		backgroundColor: "#FF3B30",
		paddingHorizontal: 20,
		paddingVertical: 12,
		borderRadius: 12,
	},
	backButton: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		backgroundColor: "rgba(255, 255, 255, 0.12)",
		paddingHorizontal: 20,
		paddingVertical: 12,
		borderRadius: 12,
	},
	buttonText: {
		color: "#FFFFFF",
		fontSize: 14,
		fontWeight: "600",
	},
	backButtonText: {
		color: "#FFFFFF",
		fontSize: 14,
		fontWeight: "600",
	},
});
