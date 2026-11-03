/*
 * İzinler ekranı (madde 3). Satırlar `buildPermissionRows`'tan; her satır
 * dokunulduğunda izni ister, kalıcı reddedilmişse sistem ayarlarını açar.
 */
import {
	AppState,
	BackHandler,
	Linking,
	ScrollView,
	StatusBar,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import React, { useCallback, useState } from "react";
import { Stack, useFocusEffect, useRouter } from "expo-router";

import TVPressable from "@/components/common/TVPressable";
import { FontFamily, Palette } from "@/constants/theme";
import { useTvMetrics } from "@/utils/tvMetrics";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import {
	buildPermissionRows,
	getPermissionStatuses,
	requestPermission,
} from "@/utils/permissions";

/** Durum → görünür metin/renk. */
function statusMeta(status) {
	switch (status) {
		case "granted":
			return { text: "Verildi", color: Palette.primary };
		case "not_required":
			return { text: "Gerekmiyor", color: Palette.onSurfaceVariant };
		case "never_ask_again":
			return { text: "Ayarları Aç →", color: Palette.tertiary };
		default:
			return { text: "Verilmedi", color: Palette.error };
	}
}

export default function PermissionsScreen() {
	const router = useRouter();
	const { contentMaxWidth, sp } = useTvMetrics();
	const [rows, setRows] = useState(null);

	const refresh = useCallback(async () => {
		try {
			const { sdk, statuses } = await getPermissionStatuses();
			setRows(buildPermissionRows(statuses, sdk));
		} catch (e) {
			console.warn("İzin durumu okunamadı:", e?.message);
		}
	}, []);

	useFocusEffect(
		useCallback(() => {
			refresh();
			// Sistem ayarlarından (izin ver/dışa dön) dönüşte durum yenilenir:
			// expo-router focus event'i işletme dışı geçişte her zaman ateşlenmez.
			const sub = AppState.addEventListener("change", (s) => {
				if (s === "active") refresh();
			});
			const onBackPress = () => {
				if (router.canGoBack()) router.back();
				else router.replace("/(app)/settings");
				return true;
			};
			const backSub = BackHandler.addEventListener("hardwareBackPress", onBackPress);
			return () => {
				sub.remove();
				backSub.remove();
			};
		}, [router, refresh]),
	);

	if (!rows) {
		return (
			<SafeAreaView style={styles.safeArea}>
				<StatusBar barStyle="light-content" backgroundColor={Palette.background} />
				<Stack.Screen options={{ headerShown: false }} />
			</SafeAreaView>
		);
	}

	const onRow = async (row) => {
		if (row.status === "never_ask_again") {
			Linking.openSettings();
			return;
		}
		await requestPermission(row.key);
		refresh();
	};

	return (
		<>
			<Stack.Screen options={{ headerShown: false }} />
			<SafeAreaView edges={["top", "left", "right", "bottom"]} style={styles.safeArea}>
				<StatusBar barStyle="light-content" backgroundColor={Palette.background} />

				<View style={[styles.header, { paddingHorizontal: sp(16), gap: sp(8) }]}>
					<TVPressable
						onPress={() => router.back()}
						focusedStyle={null}
						style={({ focused }) => [
							styles.backButton,
							{ borderRadius: sp(12) },
							focused && styles.focusRing,
						]}>
						<Ionicons name="arrow-back" size={sp(20)} color={Palette.onSurface} />
					</TVPressable>
					<Text numberOfLines={1} style={[styles.headerTitle, { fontSize: sp(20) }]}>
						İzinler
					</Text>
					<View style={{ width: sp(36) }} />
				</View>

				<ScrollView
					showsVerticalScrollIndicator={false}
					contentContainerStyle={[
						styles.scrollContainer,
						{ paddingHorizontal: sp(16) },
						contentMaxWidth
							? { alignSelf: "center", width: "100%", maxWidth: contentMaxWidth }
							: null,
					]}>
					<Text style={[styles.sectionHeader, { fontSize: sp(10) }]}>
						UYGULAMA İZİNLERİ
					</Text>
					<View style={[styles.card, { borderRadius: sp(14) }]}>
						{rows.map((row) => {
							const meta = statusMeta(row.status);
							return (
								<TVPressable
									key={row.key}
									focusedStyle={null}
									style={({ focused }) => [
										styles.valueRow,
										{ paddingVertical: sp(12), paddingHorizontal: sp(12), gap: sp(12) },
										focused && styles.focusRing,
									]}
									onPress={() => onRow(row)}>
									<View
										style={[
											styles.valueIcon,
											{ borderRadius: sp(16), backgroundColor: Palette.surfaceHigh },
										]}>
										<Ionicons
											name={
												row.status === "granted"
													? "checkmark"
													: "lock-closed-outline"
											}
											size={sp(15)}
											color={meta.color}
										/>
									</View>
									<View style={styles.valueRowText}>
										<Text
											numberOfLines={1}
											style={[styles.valueRowTitle, { fontSize: sp(13) }]}>
											{row.label}
											{row.required ? "  (zorunlu)" : ""}
										</Text>
										<Text
											numberOfLines={2}
											style={[styles.valueRowSub, { fontSize: sp(11) }]}>
											{row.reason}
										</Text>
									</View>
									<Text
										numberOfLines={1}
										style={[
											styles.valueRowValue,
											{ fontSize: sp(12), color: meta.color },
										]}>
										{meta.text}
									</Text>
								</TVPressable>
							);
						})}
					</View>
					<Text style={[styles.note, { fontSize: sp(11) }]}>
						Satıra dokunmak izni ister. Kalıcı reddedilen bir izin için sistem
						ayarları açılır.
					</Text>
				</ScrollView>
			</SafeAreaView>
		</>
	);
}

const styles = StyleSheet.create({
	safeArea: { flex: 1, backgroundColor: Palette.background },
	header: {
		flexDirection: "row",
		alignItems: "center",
		paddingVertical: 10,
	},
	backButton: {
		width: 36,
		height: 36,
		alignItems: "center",
		justifyContent: "center",
		borderWidth: 2,
		borderColor: "transparent",
	},
	headerTitle: {
		flex: 1,
		color: Palette.onSurface,
		fontFamily: FontFamily.bold,
		letterSpacing: -0.3,
	},
	scrollContainer: { paddingTop: 8, paddingBottom: 40 },
	sectionHeader: {
		color: Palette.onSurfaceVariant,
		fontFamily: FontFamily.bold,
		letterSpacing: 1.1,
		marginBottom: 8,
		paddingHorizontal: 4,
	},
	card: {
		backgroundColor: Palette.surfaceLow,
		overflow: "hidden",
	},
	valueRow: {
		flexDirection: "row",
		alignItems: "center",
		borderWidth: 2,
		borderColor: "transparent",
	},
	valueIcon: {
		width: 32,
		height: 32,
		alignItems: "center",
		justifyContent: "center",
	},
	valueRowText: { flex: 1 },
	valueRowTitle: {
		color: Palette.onSurface,
		fontFamily: FontFamily.semiBold,
	},
	valueRowSub: {
		color: Palette.onSurfaceVariant,
		fontFamily: FontFamily.regular,
		marginTop: 2,
	},
	valueRowValue: {
		fontFamily: FontFamily.bold,
	},
	note: {
		color: Palette.onSurfaceVariant,
		fontFamily: FontFamily.regular,
		marginTop: 10,
		paddingHorizontal: 4,
	},
	focusRing: {
		borderColor: Palette.primary,
		borderWidth: 2,
	},
});
