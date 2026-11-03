/**
 * Senkronizasyon Ayarları Ekranı
 *
 * Durum: Son senkronizasyon zamanı, bekleyen kayıt sayısı
 * Eylem: "Şimdi senkronize et", "Çıkış yap", "Cihaz yetkisini kaldır"
 * Cihaz listesi: ad + platform + son görülme
 *
 * Faz 3 & 4 senkronizasyon motoru entegrasyonu.
 */

import { useFeedback } from "@/components/feedback/AppFeedbackProvider";
import TVPressable from "@/components/common/TVPressable";
import { useAuth } from "@/context/AuthContext";
import { useSync } from "@/context/SyncContext";
import { FontFamily, Palette } from "@/constants/theme";
import { useTvMetrics } from "@/utils/tvMetrics";
import { openLogin } from "@/utils/authRoutes";
import { useThemeContext } from "@/context/ThemeContext";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
	ActivityIndicator,
	BackHandler,
	ScrollView,
	StatusBar,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function SyncSettingsScreen() {
	const { alert, toast } = useFeedback();
	const { theme } = useThemeContext();
	// TV: ayar satırları ortalanmış sütuna alınır (bkz. utils/tvMetrics.js).
	const { contentMaxWidth } = useTvMetrics();
	const { user, isLoggedIn, logout } = useAuth();
	const {
		status: syncStatus,
		isSyncing,
		lastSyncedAt,
		pendingCount,
		syncNow,
		devices,
		isLoadingDevices,
		refreshDevices,
		revokeDevice,
	} = useSync();

	const router = useRouter();
	const [isLoggingOut, setIsLoggingOut] = useState(false);

	useFocusEffect(
		useCallback(() => {
			const onBackPress = () => {
				if (router.canGoBack()) router.back();
				else router.replace("/(app)/settings");
				return true;
			};
			const subscription = BackHandler.addEventListener(
				"hardwareBackPress",
				onBackPress,
			);
			return () => subscription.remove();
		}, [router]),
	);

	useEffect(() => {
		if (isLoggedIn) {
			refreshDevices();
		}
	}, [isLoggedIn, refreshDevices]);

	const formatLastSync = (isoString) => {
		if (!isoString) return "Henüz senkronize edilmedi";
		try {
			const d = new Date(isoString);
			if (isNaN(d.getTime())) return "Bilinmiyor";
			const now = new Date();
			const isToday =
				d.getDate() === now.getDate() &&
				d.getMonth() === now.getMonth() &&
				d.getFullYear() === now.getFullYear();

			const timeStr = d.toLocaleTimeString([], {
				hour: "2-digit",
				minute: "2-digit",
			});
			return isToday
				? `Bugün, ${timeStr}`
				: `${d.toLocaleDateString([], { month: "short", day: "numeric" })}, ${timeStr}`;
		} catch {
			return "Bilinmiyor";
		}
	};

	const handleSyncPress = async () => {
		if (isSyncing) return;
		try {
			const res = await syncNow();
			if (res.success) {
				toast.success("Verileriniz başarıyla senkronize edildi.");
				refreshDevices();
			} else if (res.error === "unauthorized") {
				toast.error("Oturumunuzun süresi dolmuş. Lütfen tekrar giriş yapın.");
			} else {
				toast.warning("Sunucuya bağlanılamadı. Yerel verileriniz korundu, internet bağlantısı sağlandığında tekrar denenecek.");
			}
		} catch (err) {
			toast.error(err.message || "Senkronizasyon sırasında bir sorun oluştu.");
		}
	};

	const handleRevokeDevice = (device) => {
		alert({
			title: "Cihaz Bağlantısını Kes",
			message: `"${device.device_name || "Bu cihaz"}" için senkronizasyon yetkisini kaldırmak istiyor musunuz?`,
			confirmText: "Yetkiyi Kaldır",
			cancelText: "Vazgeç",
			destructive: true,
			onConfirm: async () => {
						const ok = await revokeDevice(device.device_id);
						if (ok) {
							toast.success("Cihazın senkronizasyon yetkisi kaldırıldı.");
						} else {
							toast.error("İşlem gerçekleştirilemedi.");
						}
					},
		});
	};

	const handleLogout = () => {
		alert({
			title: "Çıkış Yap",
			message: "Hesabınızdan çıkış yapılacak. Yerel verileriniz bu cihazda korunacaktır.",
			confirmText: "Çıkış Yap",
			cancelText: "Vazgeç",
			destructive: true,
			onConfirm: async () => {
						setIsLoggingOut(true);
						try {
							await logout();
							router.back();
						} catch {
							toast.error("Çıkış yapılırken bir sorun oluştu.");
						} finally {
							setIsLoggingOut(false);
						}
					},
		});
	};

	return (
		<>
			{/* ⚠️ `headerShown: true` BURADA ÇALIŞMIYORDU.
			    `(app)/_layout.jsx` `<Stack/>` yerine expo-router'in `<Slot/>`
			    bileşenini kullandığı için bu route'lar native stack ekranı
			    DEĞİL; `Stack.Screen options` yok sayılıyor. Sonuç: başlık
			    çizilmiyor, geri düğmesi görünmüyor ve `SafeAreaView` "top"
			    kenarı dışarıda kaldığı için hesap kartı durum çubuğunun
			    ALTINA taşıyordu. 			    `settings/index.jsx` ile aynı desen uygulanıyor: başlık
			    gizlenir, kendi üst çubuğumuz çizilir. */}
			<Stack.Screen options={{ headerShown: false }} />
			<SafeAreaView
				edges={["top", "left", "right", "bottom"]}
				style={[styles.container, { backgroundColor: Palette.background }]}>
				<StatusBar
					barStyle={theme === "dark" ? "light-content" : "dark-content"}
					backgroundColor={Palette.background}
				/>

				{/* Kendi üst çubuğumuz — geri + başlık */}
				<View
					style={[
						styles.topBar,
						{
							borderBottomColor: "rgba(229, 225, 228, 0.08)",
							backgroundColor: Palette.background,
						},
					]}>
					<TVPressable
						onPress={() => router.back()}
						focusedStyle={styles.topBarBtnFocused}
						style={styles.topBarBtn}
						accessibilityLabel="Geri">
						<Ionicons name="arrow-back" size={22} color={Palette.onSurface} />
					</TVPressable>
					<Text style={[styles.topBarTitle, { color: Palette.onSurface }]}>
						Senkronizasyon
					</Text>
					<View style={styles.topBarSpacer} />
				</View>

				<ScrollView
					contentInsetAdjustmentBehavior="automatic"
					contentContainerStyle={[
						styles.scrollContent,
						contentMaxWidth
							? {
									alignSelf: "center",
									width: "100%",
									maxWidth: contentMaxWidth,
								}
							: null,
					]}
					showsVerticalScrollIndicator={false}>
					{/* Hesap Kartı */}
					{isLoggedIn && user ? (
						<View
							style={[
								styles.accountCard,
								{
									backgroundColor: Palette.surfaceLow,
									borderColor: "rgba(229, 225, 228, 0.08)",
								},
							]}>
							<View
								style={[
									styles.accountAvatar,
									{ backgroundColor: "rgba(56, 189, 248, 0.12)" },
								]}>
								<Ionicons name="person" size={28} color="#38bdf8" />
							</View>
							<View style={styles.accountInfo}>
								<Text style={[styles.accountName, { color: Palette.onSurface }]}>
									{user.display_name || user.username || "Kullanıcı"}
								</Text>
								<Text style={[styles.accountEmail, { color: Palette.onSurfaceVariant }]}>
									{user.email}
								</Text>
							</View>
							<View style={styles.syncStatusBadge}>
								<View
									style={[
										styles.syncDot,
										{
											backgroundColor:
												syncStatus === "syncing"
													? "#F59E0B"
													: syncStatus === "error"
													? "#EF4444"
													: "#10B981",
										},
									]}
								/>
								<Text style={styles.syncStatusText}>
									{syncStatus === "syncing"
										? "Eşitleniyor"
										: syncStatus === "error"
										? "Hata"
										: "Bağlı"}
								</Text>
							</View>
						</View>
					) : (
						<View
							style={[
								styles.accountCard,
								{
									backgroundColor: Palette.surfaceLow,
									borderColor: "rgba(229, 225, 228, 0.08)",
								},
							]}>
							<View
								style={[
									styles.accountAvatar,
									{ backgroundColor: "rgba(245, 158, 11, 0.12)" },
								]}>
								<Ionicons name="cloud-offline-outline" size={28} color="#F59E0B" />
							</View>
							<View style={styles.accountInfo}>
								<Text style={[styles.accountName, { color: Palette.onSurface }]}>
									Giriş Yapılmadı
								</Text>
								<Text style={[styles.accountEmail, { color: Palette.onSurfaceVariant }]}>
									Cihazlar arası eşitleme için giriş yapın
								</Text>
							</View>
							<TVPressable
								style={styles.loginBtn}
								focusedStyle={styles.btnFocused}
								onPress={() => openLogin(router)}>
								<Text style={styles.loginBtnText}>Giriş</Text>
							</TVPressable>
						</View>
					)}

					{/* Senkronizasyon Durumu */}
					<View style={styles.sectionWrapper}>
						<Text style={[styles.sectionTitle, { color: Palette.onSurfaceVariant }]}>
							SENKRONİZASYON
						</Text>
						<View
							style={[
								styles.sectionCard,
								{
									backgroundColor: Palette.surfaceLow,
									borderColor: "rgba(229, 225, 228, 0.08)",
								},
							]}>
							{/* Durum */}
							<View style={styles.statusRow}>
								<View style={styles.statusLeft}>
									<View
										style={[
											styles.iconBox,
											{
												backgroundColor:
													syncStatus === "syncing"
														? "#F59E0B"
														: syncStatus === "error"
														? "#EF4444"
														: "#10B981",
											},
										]}>
										{isSyncing ? (
											<ActivityIndicator size="small" color="#fff" />
										) : (
											<Ionicons name="sync-outline" size={20} color="#fff" />
										)}
									</View>
									<View style={{ flex: 1, marginRight: 8 }}>
										<Text style={[styles.statusLabel, { color: Palette.onSurface }]}>
											Son Eşitleme
										</Text>
										<Text style={[styles.statusValue, { color: Palette.onSurfaceVariant }]}>
											{isSyncing
												? "Veriler eşitleniyor..."
												: formatLastSync(lastSyncedAt)}
										</Text>
									</View>
								</View>
								{pendingCount > 0 && (
									<View style={styles.pendingBadge}>
										<Text style={styles.pendingBadgeText}>
											{pendingCount} bekliyor
										</Text>
									</View>
								)}
							</View>

							<View style={[styles.divider, { backgroundColor: "rgba(229, 225, 228, 0.08)" }]} />

							{/* Şimdi Senkronize Et */}
							<TVPressable
								style={styles.statusRow}
								focusedStyle={styles.rowFocused}
								activeOpacity={0.65}
								disabled={isSyncing || !isLoggedIn}
								onPress={handleSyncPress}>
								<View style={styles.statusLeft}>
									<View style={[styles.iconBox, { backgroundColor: "#38bdf8" }]}>
										<Ionicons name="cloud-upload-outline" size={20} color="#fff" />
									</View>
									<View>
										<Text style={[styles.statusLabel, { color: Palette.onSurface }]}>
											Şimdi Senkronize Et
										</Text>
										<Text style={[styles.statusValue, { color: Palette.onSurfaceVariant }]}>
											Favori, liste ve ayarları sunucuyla eşitle
										</Text>
									</View>
								</View>
								{isSyncing ? (
									<ActivityIndicator size="small" color="#38bdf8" />
								) : (
									<Ionicons
										name="chevron-forward"
										size={18}
										color={Palette.onSurfaceVariant}
										style={{ opacity: 0.6 }}
									/>
								)}
							</TVPressable>
						</View>
					</View>

					{/* Cihazlar */}
					{isLoggedIn && (
						<View style={styles.sectionWrapper}>
							<View style={styles.sectionHeaderRow}>
								<Text style={[styles.sectionTitle, { color: Palette.onSurfaceVariant }]}>
									BAĞLI CİHAZLAR
								</Text>
								<TVPressable
									onPress={refreshDevices}
									focusedStyle={styles.iconBtnFocused}
									disabled={isLoadingDevices}
									hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
									<Ionicons
										name="refresh-outline"
										size={16}
										color={Palette.onSurfaceVariant}
									/>
								</TVPressable>
							</View>
							<View
								style={[
									styles.sectionCard,
									{
										backgroundColor: Palette.surfaceLow,
										borderColor: "rgba(229, 225, 228, 0.08)",
									},
								]}>
								{isLoadingDevices ? (
									<View style={styles.loadingDevices}>
										<ActivityIndicator size="small" color="#38bdf8" />
									</View>
								) : devices.length > 0 ? (
									devices.map((device, idx) => {
										const isLast = idx === devices.length - 1;
										const isCurrent = device.is_current;
										const platformIcon =
											device.platform === "ios"
												? "logo-apple"
												: device.platform === "android"
												? "logo-android"
												: "desktop-outline";

										return (
											<React.Fragment key={device.device_id || idx}>
												<View style={styles.deviceRow}>
													<View style={styles.deviceLeft}>
														<View
															style={[
																styles.iconBox,
																{
																	backgroundColor: isCurrent
																		? "#38bdf8"
																		: "rgba(100, 116, 139, 0.5)",
																},
															]}>
															<Ionicons name={platformIcon} size={18} color="#fff" />
														</View>
														<View style={{ flex: 1, marginRight: 8 }}>
															<View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
																<Text style={[styles.deviceName, { color: Palette.onSurface }]}>
																	{device.device_name || "Bilinmeyen Cihaz"}
																</Text>
																{isCurrent && (
																	<View style={styles.currentDeviceBadge}>
																		<Text style={styles.currentDeviceText}>Bu Cihaz</Text>
																	</View>
																)}
															</View>
															<Text style={[styles.deviceInfo, { color: Palette.onSurfaceVariant }]}>
																Sürüm {device.app_version || "1.0.0"} • {formatLastSync(device.last_pulled_at || device.updated_at)}
															</Text>
														</View>
													</View>
													{!isCurrent && (
														<TVPressable
															onPress={() => handleRevokeDevice(device)}
															focusedStyle={styles.iconBtnFocused}
															hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
															<Ionicons name="trash-outline" size={18} color="#EF4444" />
														</TVPressable>
													)}
												</View>
												{!isLast && (
													<View
														style={[
															styles.divider,
															{ backgroundColor: "rgba(229, 225, 228, 0.08)" },
														]}
													/>
												)}
											</React.Fragment>
										);
									})
								) : (
									<View style={styles.emptyDevices}>
										<Ionicons
											name="phone-portrait-outline"
											size={32}
											color={Palette.onSurfaceVariant}
											style={{ opacity: 0.4 }}
										/>
										<Text style={[styles.emptyText, { color: Palette.onSurfaceVariant }]}>
											Henüz başka bir cihaz bağlanmadı
										</Text>
									</View>
								)}
							</View>
						</View>
					)}

					{/* Çıkış Yap Butonu */}
					{isLoggedIn && (
						<View style={styles.logoutWrapper}>
							<TVPressable
								style={[
									styles.logoutBtn,
									{
										backgroundColor: "rgba(239, 68, 68, 0.1)",
										borderColor: "rgba(239, 68, 68, 0.3)",
									},
								]}
								focusedStyle={styles.logoutBtnFocused}
								activeOpacity={0.7}
								disabled={isLoggingOut}
								onPress={handleLogout}>
								{isLoggingOut ? (
									<ActivityIndicator size="small" color="#EF4444" />
								) : (
									<>
										<Ionicons name="log-out-outline" size={18} color="#EF4444" />
										<Text style={styles.logoutText}>Hesaptan Çıkış Yap</Text>
									</>
								)}
							</TVPressable>
							<Text style={[styles.logoutHint, { color: Palette.onSurfaceVariant }]}>
								Çıkış yaptığınızda bu cihazdaki verileriniz korunacaktır.
							</Text>
						</View>
					)}
				</ScrollView>
			</SafeAreaView>
		</>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
	},
	topBar: {
		height: 56,
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: 16,
		borderBottomWidth: 1,
	},
	topBarBtn: {
		width: 40,
		height: 40,
		alignItems: "center",
		justifyContent: "center",
	},
	topBarSpacer: {
		width: 40,
	},
	topBarTitle: {
		flex: 1,
		fontSize: 18,
		fontFamily: FontFamily.bold,
		textAlign: "center",
		letterSpacing: -0.2,
	},
	topBarBtnFocused: {
		transform: [{ scale: 1.12 }],
	},
	scrollContent: {
		padding: 16,
		paddingBottom: 40,
	},
	accountCard: {
		flexDirection: "row",
		alignItems: "center",
		padding: 16,
		borderRadius: 16,
		borderWidth: 1,
		marginBottom: 20,
	},
	accountAvatar: {
		width: 48,
		height: 48,
		borderRadius: 24,
		alignItems: "center",
		justifyContent: "center",
		marginRight: 12,
	},
	accountInfo: {
		flex: 1,
	},
	accountName: {
		fontSize: 16,
		fontFamily: FontFamily.semiBold,
		marginBottom: 2,
	},
	accountEmail: {
		fontSize: 13,
	},
	loginBtn: {
		backgroundColor: "#38bdf8",
		paddingHorizontal: 16,
		paddingVertical: 8,
		borderRadius: 10,
	},
	loginBtnText: {
		color: "#0f172a",
		fontFamily: FontFamily.bold,
		fontSize: 13,
	},
	syncStatusBadge: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: "rgba(16, 185, 129, 0.1)",
		paddingHorizontal: 8,
		paddingVertical: 4,
		borderRadius: 8,
		gap: 6,
	},
	syncDot: {
		width: 6,
		height: 6,
		borderRadius: 3,
		backgroundColor: "#10B981",
	},
	syncStatusText: {
		fontSize: 12,
		fontFamily: FontFamily.semiBold,
		color: "#10B981",
	},
	sectionWrapper: {
		marginBottom: 20,
	},
	sectionHeaderRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginBottom: 8,
		paddingHorizontal: 4,
	},
	sectionTitle: {
		fontSize: 12,
		fontFamily: FontFamily.bold,
		letterSpacing: 0.8,
		marginBottom: 8,
		paddingHorizontal: 4,
	},
	sectionCard: {
		borderRadius: 16,
		borderWidth: 1,
		overflow: "hidden",
	},
	statusRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		padding: 14,
	},
	statusLeft: {
		flexDirection: "row",
		alignItems: "center",
		flex: 1,
	},
	iconBox: {
		width: 36,
		height: 36,
		borderRadius: 10,
		alignItems: "center",
		justifyContent: "center",
		marginRight: 12,
	},
	statusLabel: {
		fontSize: 14,
		fontFamily: FontFamily.semiBold,
		marginBottom: 2,
	},
	statusValue: {
		fontSize: 12,
	},
	pendingBadge: {
		backgroundColor: "rgba(245, 158, 11, 0.15)",
		paddingHorizontal: 8,
		paddingVertical: 3,
		borderRadius: 6,
	},
	pendingBadgeText: {
		fontSize: 11,
		fontFamily: FontFamily.semiBold,
		color: "#F59E0B",
	},
	divider: {
		height: 1,
		marginLeft: 62,
	},
	emptyDevices: {
		padding: 24,
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
	},
	loadingDevices: {
		padding: 24,
		alignItems: "center",
		justifyContent: "center",
	},
	emptyText: {
		fontSize: 13,
		textAlign: "center",
	},
	deviceRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		padding: 14,
	},
	deviceLeft: {
		flexDirection: "row",
		alignItems: "center",
		flex: 1,
	},
	deviceName: {
		fontSize: 14,
		fontFamily: FontFamily.semiBold,
	},
	deviceInfo: {
		fontSize: 11,
		marginTop: 2,
	},
	currentDeviceBadge: {
		backgroundColor: "rgba(56, 189, 248, 0.15)",
		paddingHorizontal: 6,
		paddingVertical: 1,
		borderRadius: 4,
	},
	currentDeviceText: {
		fontSize: 10,
		fontFamily: FontFamily.semiBold,
		color: "#38bdf8",
	},
	logoutWrapper: {
		marginTop: 10,
		alignItems: "center",
		gap: 8,
	},
	logoutBtn: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		width: "100%",
		paddingVertical: 14,
		borderRadius: 14,
		borderWidth: 1,
	},
	logoutText: {
		color: "#EF4444",
		fontSize: 15,
		fontFamily: FontFamily.semiBold,
	},
	logoutHint: {
		fontSize: 12,
		textAlign: "center",
	},
	btnFocused: {
		borderWidth: 2,
		borderColor: "#E50914",
		transform: [{ scale: 1.05 }],
	},
	rowFocused: {
		backgroundColor: "rgba(229, 9, 20, 0.12)",
		borderWidth: 1.5,
		borderColor: "#E50914",
		borderRadius: 12,
		transform: [{ scale: 1.02 }],
	},
	iconBtnFocused: {
		backgroundColor: "rgba(229, 9, 20, 0.2)",
		borderRadius: 6,
		transform: [{ scale: 1.15 }],
	},
	logoutBtnFocused: {
		borderWidth: 2,
		borderColor: "#EF4444",
		backgroundColor: "rgba(239, 68, 68, 0.2)",
		transform: [{ scale: 1.03 }],
	},
});
