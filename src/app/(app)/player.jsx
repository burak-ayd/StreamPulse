import VideoPlayer from "@/components/player/VideoPlayer";
import { extractVideoSources, fetchPluginDetail } from "@/services/api";
import { addToWatchHistory, getContinueWatching } from "@/utils/storage";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import * as ScreenOrientation from "expo-screen-orientation";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
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
	const contentType = params.type || (params.episode ? "episode" : "movie");
	const [dynamicNextEpisode, setDynamicNextEpisode] = useState(null);

	const seriesInfo = useMemo(() => {
		let base = null;
		if (params.seriesInfo) {
			base =
				typeof params.seriesInfo === "string"
					? JSON.parse(params.seriesInfo)
					: params.seriesInfo;
		} else if (params.seriesId || params.season || params.episode) {
			base = {
				seriesId: params.seriesId || params.id,
				seriesTitle: params.seriesTitle || params.title,
				seriesUrl:
					params.seriesUrl ||
					(params.seriesId &&
					(String(params.seriesId).startsWith("http") ||
						String(params.seriesId).startsWith("/"))
						? params.seriesId
						: undefined),
				plugin: params.plugin,
				season: params.season ? Number(params.season) : undefined,
				episode: params.episode ? Number(params.episode) : undefined,
				episodeTitle: params.episodeTitle,
				totalEpisodes: params.totalEpisodes
					? Number(params.totalEpisodes)
					: undefined,
				nextEpisode: params.nextEpisode
					? typeof params.nextEpisode === "string"
						? JSON.parse(params.nextEpisode)
						: params.nextEpisode
					: undefined,
			};
		}
		if (base && !base.nextEpisode && dynamicNextEpisode) {
			return { ...base, nextEpisode: dynamicNextEpisode };
		}
		return base;
	}, [
		params.seriesInfo,
		params.seriesId,
		params.seriesUrl,
		params.plugin,
		params.season,
		params.episode,
		params.id,
		params.title,
		params.seriesTitle,
		params.episodeTitle,
		params.totalEpisodes,
		params.nextEpisode,
		dynamicNextEpisode,
	]);

	// Eğer sonraki bölüm bilgisi gelmediyse, dizi detayından otomatik hesapla
	useEffect(() => {
		if (contentType !== "episode") return;
		if (params.nextEpisode) return;

		const sUrl =
			params.seriesUrl ||
			(params.seriesId && String(params.seriesId).startsWith("http")
				? params.seriesId
				: null) ||
			(targetUrl && String(targetUrl).includes("/dizi/")
				? targetUrl.replace(/\/sezon-\d+\/bolum-\d+.*$/, "")
				: null);
		const pName = params.plugin;
		const currSeason = params.season ? Number(params.season) : 1;
		const currEpisode = params.episode ? Number(params.episode) : 1;

		if (sUrl && pName) {
			fetchPluginDetail(pName, sUrl)
				.then((detail) => {
					const seasons = detail?.seasons;
					if (seasons && typeof seasons === "object") {
						const currList =
							seasons[String(currSeason)] ||
							seasons[currSeason] ||
							[];
						if (Array.isArray(currList)) {
							const idx = currList.findIndex(
								(e) =>
									Number(e.episode || e.episode_number) ===
									currEpisode,
							);
							if (idx !== -1 && idx + 1 < currList.length) {
								const nextObj = currList[idx + 1];
								setDynamicNextEpisode({
									id: nextObj.id || nextObj.url,
									url: nextObj.url,
									title: nextObj.title,
									season: currSeason,
									episode: Number(
										nextObj.episode ||
											nextObj.episode_number ||
											currEpisode + 1,
									),
									poster: nextObj.poster || poster,
								});
							} else {
								const nextSeasonList =
									seasons[String(currSeason + 1)];
								if (
									Array.isArray(nextSeasonList) &&
									nextSeasonList.length > 0
								) {
									const nextObj = nextSeasonList[0];
									setDynamicNextEpisode({
										id: nextObj.id || nextObj.url,
										url: nextObj.url,
										title: nextObj.title,
										season: currSeason + 1,
										episode: Number(
											nextObj.episode ||
												nextObj.episode_number ||
												1,
										),
										poster: nextObj.poster || poster,
									});
								}
							}
						}
					}
				})
				.catch((err) => {
					console.warn("player.jsx nextEpisode çözme hatası:", err);
				});
		}
	}, [
		contentType,
		params.nextEpisode,
		params.seriesUrl,
		params.seriesId,
		params.plugin,
		params.season,
		params.episode,
		targetUrl,
		poster,
	]);

	const [initialTime, setInitialTime] = useState(
		params.currentTime ? Number(params.currentTime) : 0,
	);
	const [sources, setSources] = useState([]);
	const [loading, setLoading] = useState(Boolean(targetUrl));
	const [error, setError] = useState(
		!targetUrl ? "Oynatılacak video bağlantısı bulunamadı." : null,
	);

	useEffect(() => {
		async function checkResumePosition() {
			if (params.currentTime) {
				setInitialTime(Number(params.currentTime));
				return;
			}
			try {
				const continueData = await getContinueWatching();
				const match = continueData.find(
					(item) =>
						item.id === (contentId || targetUrl) ||
						(targetUrl && item.url === targetUrl),
				);
				if (match && match.currentTime > 10) {
					setInitialTime(match.currentTime);
				}
			} catch (err) {
				console.error("Resume pozisyonu kontrol edilirken hata:", err);
			}
		}
		checkResumePosition();
	}, [contentId, targetUrl, params.currentTime]);

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
				// Add to watch history (recent play)
				if (contentId || title) {
					if (contentType === "episode") {
						addToWatchHistory({
							id: contentId || targetUrl,
							title: seriesInfo?.seriesTitle || title,
							seriesTitle: seriesInfo?.seriesTitle || title,
							seriesId: seriesInfo?.seriesId,
							season: seriesInfo?.season,
							episode: seriesInfo?.episode,
							episodeTitle: seriesInfo?.episodeTitle,
							poster,
							type: "episode",
							url: targetUrl,
							totalEpisodes: seriesInfo?.totalEpisodes,
							overview: subtitle,
							plugin: params.plugin || seriesInfo?.plugin,
						}).catch(() => {});
					} else {
						addToWatchHistory({
							id: contentId || targetUrl,
							title,
							poster,
							type: "movie",
							url: targetUrl,
							overview: subtitle,
							plugin: params.plugin || seriesInfo?.plugin,
						}).catch(() => {});
					}
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
	}, [targetUrl, contentId, title, subtitle, poster, contentType, seriesInfo, params.plugin]);

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
							plugin: params.plugin || seriesInfo?.plugin,
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
	}, [targetUrl, contentId, title, subtitle, poster, params.plugin, seriesInfo]);

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
					initialTime={initialTime}
					contentId={contentId || targetUrl}
					contentType={contentType}
					seriesInfo={seriesInfo}
					targetUrl={targetUrl}
					plugin={params.plugin || seriesInfo?.plugin}
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
