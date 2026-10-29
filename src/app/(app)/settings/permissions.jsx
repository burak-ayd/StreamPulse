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
import { useThemeContext } from "@/context/ThemeContext";
import { useTvMetrics } from "@/utils/tvMetrics";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import {
	buildPermissionRows,
	getPermissionStatuses,
	requestPermission,
} from "@/utils/permissions";

/** Durum → görünür metin/renk. */
function statusMeta(status, colors) {
	switch (status) {
		case "granted":
			return { text: "Verildi", color: "#10b981" };
		case "not_required":
			return { text: "Gerekmiyor", color: colors.textSecondary };
		case "never_ask_again":
			return { text: "Ayarları Aç →", color: "#f59e0b" };
		default:
			return { text: "Verilmedi", color: "#f43f5e" };
	}
}

export default function PermissionsScreen() {
	const { colors } = useThemeContext();
	const router = useRouter();
	const { contentMaxWidth } = useTvMetrics();
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
			<SafeAreaView style={[styles.safeArea, { backgroundColor: colors.bg }]}>
				<StatusBar barStyle="light-content" backgroundColor={colors.bg} />
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
			<SafeAreaView
				edges={["top", "left", "right", "bottom"]}
				style={[styles.safeArea, { backgroundColor: colors.bg }]}>
				<StatusBar barStyle="light-content" backgroundColor={colors.bg} />

				{/* Header */}
				<View
					style={[
						styles.header,
						{ borderBottomColor: colors.border, backgroundColor: colors.cardBg },
					]}>
					<TVPressable
						onPress={() => router.back()}
						style={styles.backButton}
						focusedStyle={styles.headerButtonFocused}>
						<Ionicons name="arrow-back" size={24} color={colors.text} />
					</TVPressable>
					<Text style={[styles.headerTitle, { color: colors.text }]}>
						İzinler
					</Text>
					<View style={{ width: 40 }} />
				</View>

				<ScrollView
					showsVerticalScrollIndicator={false}
					contentContainerStyle={[
						styles.scrollContainer,
						contentMaxWidth
							? { alignSelf: "center", width: "100%", maxWidth: contentMaxWidth }
							: null,
					]}>
					<Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>
						UYGULAMA İZİNLERİ
					</Text>
					<View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
						{rows.map((row) => {
							const meta = statusMeta(row.status, colors);
							return (
								<TVPressable
									key={row.key}
									style={styles.valueRow}
									focusedStyle={styles.rowFocused}
									onPress={() => onRow(row)}>
									<View style={[styles.valueIcon, { backgroundColor: meta.color }]}>
										<Ionicons
											name={row.status === "granted" ? "checkmark" : "lock-closed-outline"}
											size={16}
											color="#ffffff"
										/>
									</View>
									<View style={styles.valueRowText}>
										<Text style={[styles.valueRowTitle, { color: colors.text }]}>
											{row.label}
											{row.required ? "  (zorunlu)" : ""}
										</Text>
										<Text style={[styles.valueRowSub, { color: colors.textSecondary }]}>
											{row.reason}
										</Text>
									</View>
									<Text style={[styles.valueRowValue, { color: meta.color }]}>
										{meta.text}
									</Text>
								</TVPressable>
							);
						})}
					</View>
					<Text style={[styles.note, { color: colors.textSecondary }]}>
						Satıra dokunmak izni ister. Kalıcı reddedilen bir izin için sistem
						ayarları açılır.
					</Text>
				</ScrollView>
			</SafeAreaView>
		</>
	);
}

const styles = StyleSheet.create({
	safeArea: { flex: 1 },
	header: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: 16,
		paddingVertical: 10,
		borderBottomWidth: 1,
	},
	backButton: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
	headerButtonFocused: { backgroundColor: "rgba(255,255,255,0.12)" },
	headerTitle: { fontSize: 18, fontWeight: "800" },
	scrollContainer: { padding: 16, paddingBottom: 40 },
	sectionHeader: { fontSize: 12, fontWeight: "800", letterSpacing: 1, marginBottom: 8 },
	card: { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
	valueRow: {
		flexDirection: "row",
		alignItems: "center",
		paddingVertical: 14,
		paddingHorizontal: 14,
		gap: 12,
	},
	rowFocused: { backgroundColor: "rgba(255,255,255,0.06)" },
	valueIcon: { width: 32, height: 32, borderRadius: 9, alignItems: "center", justifyContent: "center" },
	valueRowText: { flex: 1 },
	valueRowTitle: { fontSize: 14.5, fontWeight: "700" },
	valueRowSub: { fontSize: 12, marginTop: 2 },
	valueRowValue: { fontSize: 13, fontWeight: "700" },
	note: { fontSize: 11.5, marginTop: 10, paddingHorizontal: 4 },
});
