/*
 * MissingPermissionsGate (madde 3) — açılışta zorunlu izinlerden eksik
 * olanlar varsa BİR KEZ gösterilen yumuşak kapı. Reddedilirse uygulama
 * yine de açılır; Ayarlar → İzinler'de kırmızı işaret görünür.
 */
import { Modal, Platform, StyleSheet, Text, View } from "react-native";
import React, { useCallback, useEffect, useState } from "react";

import TVPressable from "@/components/common/TVPressable";
import { useThemeContext } from "@/context/ThemeContext";
import {
	buildPermissionRows,
	getPermissionStatuses,
	requestPermission,
} from "@/utils/permissions";
import { Ionicons } from "@react-native-vector-icons/ionicons";

export default function MissingPermissionsGate() {
	const { colors } = useThemeContext();
	const [missing, setMissing] = useState([]); // [{key,label,reason,status}]
	const [busy, setBusy] = useState(false);

	useEffect(() => {
		if (Platform.OS !== "android") return;
		let cancelled = false;
		(async () => {
			try {
				const { sdk, statuses } = await getPermissionStatuses();
				if (cancelled) return;
				const rows = buildPermissionRows(statuses, sdk).filter(
					(r) => r.required && r.status !== "granted" && r.status !== "not_required",
				);
				if (rows.length) setMissing(rows);
			} catch (e) {
				console.warn("İzin durumu okunamadı:", e?.message);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	const grantAll = useCallback(async () => {
		setBusy(true);
		try {
			for (const row of missing) {
				await requestPermission(row.key);
			}
		} finally {
			setBusy(false);
			setMissing([]); // kapat; durum Ayarlar → İzinler'de güncel görünür
		}
	}, [missing]);

	const skip = useCallback(() => setMissing([]), []);

	return (
		<Modal visible={missing.length > 0} transparent animationType="fade">
			<View style={styles.backdrop}>
				<View style={[styles.card, { backgroundColor: colors.cardBg }]}>
					<Ionicons name="shield-outline" size={40} color={colors.primary} />
					<Text style={[styles.title, { color: colors.text }]}>
						İzinler Gerekli
					</Text>
					<Text style={[styles.sub, { color: colors.textSecondary }]}>
						Aşağıdaki izinler uygulamanın temel işleyişi için gerekli.
					</Text>
					{missing.map((row) => (
						<View key={row.key} style={styles.row}>
							<Text style={[styles.rowLabel, { color: colors.text }]}>
								{row.label}
							</Text>
							<Text style={[styles.rowReason, { color: colors.textSecondary }]}>
								{row.reason}
							</Text>
						</View>
					))}
					<TVPressable
						style={[styles.button, { backgroundColor: colors.primary }]}
						onPress={grantAll}
						disabled={busy}>
						<Text style={[styles.buttonText, { color: colors.bg }]}>
							{busy ? "İsteniyor…" : "İzin Ver"}
						</Text>
					</TVPressable>
					<TVPressable
						style={[styles.button, styles.buttonGhost, { borderColor: colors.border }]}
						onPress={skip}>
						<Text style={[styles.buttonText, { color: colors.textSecondary }]}>
							Şimdi Değil
						</Text>
					</TVPressable>
					<Text style={[styles.hint, { color: colors.textSecondary }]}>
						Daha sonra Ayarlar → İzinler ekranından verebilirsiniz.
					</Text>
				</View>
			</View>
		</Modal>
	);
}

const styles = StyleSheet.create({
	backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", alignItems: "center", justifyContent: "center", padding: 24 },
	card: { width: "100%", maxWidth: 420, borderRadius: 16, padding: 24, alignItems: "center" },
	title: { fontSize: 20, fontWeight: "800", marginTop: 10 },
	sub: { fontSize: 13, textAlign: "center", marginTop: 4 },
	row: { alignSelf: "stretch", marginTop: 12 },
	rowLabel: { fontSize: 14, fontWeight: "700" },
	rowReason: { fontSize: 12, marginTop: 2 },
	button: { alignSelf: "stretch", marginTop: 14, paddingVertical: 12, borderRadius: 10, alignItems: "center" },
	buttonGhost: { backgroundColor: "transparent", borderWidth: 1 },
	buttonText: { fontSize: 15, fontWeight: "700" },
	hint: { fontSize: 11, marginTop: 10, textAlign: "center" },
});
