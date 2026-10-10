/**
 * Güncelleme modalı: sürüm notları, indirme ilerlemesi ve yükleme
 * tetikleyicisi.
 *
 * Bu bileşen "ne olacak?" kararını veren TEK yer; yönetici yalnızca
 * olayları bildirir. Kullanıcı reddederse güncelleme ertelenir, hata
 * olursa tekrar denenebilir.
 */
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useAppUpdate } from "@/context/AppUpdateContext";
import { useThemeContext } from "@/context/ThemeContext";
import React from "react";
import {
	ActivityIndicator,
	Modal,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** "2026-07-09T23:49:58Z" → "9 Temmuz 2026" (geçersizse null). */
function formatDate(value) {
	if (!value) return null;
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return null;
	try {
		return date.toLocaleDateString("tr-TR", {
			day: "numeric",
			month: "long",
			year: "numeric",
		});
	} catch {
		return null;
	}
}

export default function UpdateSheet() {
	const { colors } = useThemeContext();
	const insets = useSafeAreaInsets();
	const {
		sheetVisible,
		closeSheet,
		release,
		progress,
		error,
		statusMessage,
		currentVersion,
		disabledReason,
		isChecking,
		isBusy,
		stage,
		check,
		install,
		cancelDownload,
	} = useAppUpdate();

	const isDownloading = stage === "downloading";
	const isInstalling = stage === "installing" || stage === "done";
	const publishedAt = formatDate(release?.publishedAt);

	/**
	 * Modal, indirme sürerken kapatılamaz — kullanıcı arka planda
	 * yarım kalmış bir indirme bırakmasın. Android geri tuşu da aynı
	 * kurala tabidir (`onRequestClose`).
	 */
	const handleClose = () => {
		if (isBusy) return;
		closeSheet();
	};

	const renderBody = () => {
		if (isChecking) {
			return (
				<View style={styles.centered}>
					<ActivityIndicator color={colors.primary} size="large" />
					<Text style={[styles.statusText, { color: colors.text }]}>
						Güncellemeler kontrol ediliyor…
					</Text>
					<Text
						style={[styles.statusHint, { color: colors.textSecondary }]}>
						GitHub yayınlarına bakılıyor
					</Text>
				</View>
			);
		}

		if (disabledReason && !release) {
			return (
				<View style={styles.centered}>
					<View
						style={[styles.iconCircle, { backgroundColor: colors.border }]}>
						<Ionicons
							name="information-circle-outline"
							size={30}
							color={colors.textSecondary}
						/>
					</View>
					<Text style={[styles.statusText, { color: colors.text }]}>
						Güncelleme kullanılamıyor
					</Text>
					<Text
						style={[styles.statusHint, { color: colors.textSecondary }]}>
						{disabledReason}
					</Text>
				</View>
			);
		}

		if (!release) {
			return (
				<View style={styles.centered}>
					<View
						style={[
							styles.iconCircle,
							{ backgroundColor: `${colors.primary}22` },
						]}>
						<Ionicons
							name={error ? "alert-circle-outline" : "checkmark-circle-outline"}
							size={30}
							color={error ? "#EF4444" : colors.primary}
						/>
					</View>
					<Text style={[styles.statusText, { color: colors.text }]}>
						{error ? "Kontrol tamamlanamadı" : "Uygulamanız güncel"}
					</Text>
					<Text
						style={[styles.statusHint, { color: colors.textSecondary }]}>
						{error || statusMessage || `v${currentVersion} yüklü`}
					</Text>
				</View>
			);
		}

		return (
			<View>
				<View style={styles.versionRow}>
					<View
						style={[styles.badge, { backgroundColor: `${colors.primary}22` }]}>
						<Text style={[styles.badgeText, { color: colors.primary }]}>
							v{release.version}
						</Text>
					</View>
					<Text style={[styles.metaText, { color: colors.textSecondary }]}>
						{release.sizeMB} MB
						{publishedAt ? ` • ${publishedAt}` : ""}
					</Text>
				</View>

				<ScrollView
					style={styles.notes}
					contentContainerStyle={styles.notesContent}
					nestedScrollEnabled>
					<Text style={[styles.notesTitle, { color: colors.text }]}>
						Sürüm notları
					</Text>
					<Text style={[styles.notesBody, { color: colors.textSecondary }]}>
						{release.notes}
					</Text>
				</ScrollView>

				{isInstalling ? (
					<Text
						style={[
							styles.statusHint,
							{ color: colors.textSecondary, marginTop: 12 },
						]}>
						Sistem yükleyicisi açıldı — yeni sürümü yükleyin.
					</Text>
				) : null}

				{isDownloading ? (
					<View style={styles.progressBlock}>
						<View style={styles.progressHeader}>
							<Text
								style={[styles.progressLabel, { color: colors.text }]}>
								{isInstalling ? "Kuruluyor…" : "İndiriliyor…"}
							</Text>
							<Text
								style={[
									styles.progressLabel,
									{ color: colors.textSecondary },
								]}>
								{isInstalling ? "" : `%${Math.round(progress)}`}
							</Text>
						</View>
						<View
							style={[
								styles.progressTrack,
								{ backgroundColor: colors.border },
							]}>
							<View
								style={[
									styles.progressFill,
									{
										backgroundColor: colors.primary,
										width: isInstalling ? "100%" : `${Math.round(progress)}%`,
									},
								]}
							/>
						</View>
					</View>
				) : null}

				{error ? (
					<Text style={[styles.errorText, { color: "#EF4444" }]}>{error}</Text>
				) : null}
			</View>
		);
	};

	/*
	 * Kurulum başladıysa "Güncellemeyi indir" düğmesi gizlenir: aynı
	 * sürümü ikinci kez indirmeye çalışmak hem anlamsız hem de yükleyici
	 * zaten açıkken kullanıcıyı yanlış bir akışa sokar.
	 */
	const showPrimaryAction = Boolean(release) && !isDownloading && !isInstalling;
	const showCancel = isDownloading;

	return (
		<Modal
			visible={sheetVisible}
			transparent
			animationType="slide"
			statusBarTranslucent
			onRequestClose={handleClose}>
			<View style={styles.backdrop}>
				<Pressable
					style={styles.backdropPress}
					onPress={handleClose}
					accessibilityRole="button"
					accessibilityLabel="Kapat"
				/>

				<View
					style={[
						styles.sheet,
						{
							backgroundColor: colors.cardBg,
							paddingBottom: Math.max(insets.bottom, 16) + 8,
						},
					]}>
					<View style={[styles.handle, { backgroundColor: colors.border }]} />

					<View style={styles.header}>
						<Text style={[styles.headerTitle, { color: colors.text }]}>
							Uygulama Güncellemesi
						</Text>
						<Text
							style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
							Yüklü sürüm: v{currentVersion}
						</Text>
					</View>

					{renderBody()}

					<View style={styles.actions}>
						{showPrimaryAction ? (
							<Pressable
								onPress={install}
								disabled={isBusy}
								style={({ pressed }) => [
									styles.primaryButton,
									{
										backgroundColor: colors.primary,
										opacity: pressed || isBusy ? 0.75 : 1,
									},
								]}
								accessibilityRole="button">
								<Text style={styles.primaryButtonText}>
									{isBusy ? "Devam ediliyor…" : "Güncellemeyi indir"}
								</Text>
							</Pressable>
						) : null}

						{showCancel ? (
							<Pressable
								onPress={cancelDownload}
								style={[
									styles.secondaryButton,
									{ borderColor: colors.border },
								]}
								accessibilityRole="button">
								<Text
									style={[
										styles.secondaryButtonText,
										{ color: colors.text },
									]}>
									İndirmeyi iptal et
								</Text>
							</Pressable>
						) : (
							<Pressable
								onPress={handleClose}
								disabled={isBusy}
								style={[
									styles.secondaryButton,
									{ borderColor: colors.border, opacity: isBusy ? 0.5 : 1 },
								]}
								accessibilityRole="button">
								<Text
									style={[
										styles.secondaryButtonText,
										{ color: colors.text },
									]}>
									{release ? "Şimdi değil" : "Kapat"}
								</Text>
							</Pressable>
						)}

						<Pressable
							onPress={() => check({ manual: true })}
							disabled={isBusy}
							style={styles.linkButton}
							accessibilityRole="button">
							<Text style={[styles.linkText, { color: colors.primary }]}>
								Güncellemeleri tekrar kontrol et
							</Text>
						</Pressable>
					</View>
				</View>
			</View>
		</Modal>
	);
}

const styles = StyleSheet.create({
	backdrop: {
		flex: 1,
		justifyContent: "flex-end",
		backgroundColor: "rgba(0,0,0,0.55)",
	},
	backdropPress: {
		flex: 1,
	},
	sheet: {
		borderTopLeftRadius: 22,
		borderTopRightRadius: 22,
		paddingHorizontal: 20,
		paddingTop: 10,
	},
	handle: {
		alignSelf: "center",
		width: 42,
		height: 4,
		borderRadius: 2,
		marginBottom: 14,
	},
	header: {
		marginBottom: 14,
	},
	headerTitle: {
		fontSize: 19,
		fontWeight: "700",
	},
	headerSubtitle: {
		fontSize: 13,
		marginTop: 3,
	},
	centered: {
		alignItems: "center",
		paddingVertical: 20,
	},
	iconCircle: {
		width: 62,
		height: 62,
		borderRadius: 31,
		alignItems: "center",
		justifyContent: "center",
		marginBottom: 14,
	},
	statusText: {
		fontSize: 16,
		fontWeight: "600",
		textAlign: "center",
	},
	statusHint: {
		fontSize: 13,
		marginTop: 6,
		textAlign: "center",
		paddingHorizontal: 12,
	},
	versionRow: {
		flexDirection: "row",
		alignItems: "center",
		marginBottom: 12,
	},
	badge: {
		paddingHorizontal: 10,
		paddingVertical: 4,
		borderRadius: 8,
	},
	badgeText: {
		fontSize: 13,
		fontWeight: "700",
	},
	metaText: {
		fontSize: 13,
		marginLeft: 10,
	},
	notes: {
		maxHeight: 210,
	},
	notesContent: {
		paddingBottom: 4,
	},
	notesTitle: {
		fontSize: 13,
		fontWeight: "700",
		marginBottom: 6,
	},
	notesBody: {
		fontSize: 14,
		lineHeight: 21,
	},
	progressBlock: {
		marginTop: 14,
	},
	progressHeader: {
		flexDirection: "row",
		justifyContent: "space-between",
		marginBottom: 6,
	},
	progressLabel: {
		fontSize: 13,
		fontWeight: "600",
	},
	progressTrack: {
		height: 8,
		borderRadius: 4,
		overflow: "hidden",
	},
	progressFill: {
		height: "100%",
		borderRadius: 4,
	},
	errorText: {
		fontSize: 13,
		marginTop: 12,
	},
	actions: {
		marginTop: 18,
		gap: 10,
	},
	primaryButton: {
		height: 50,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
	},
	primaryButtonText: {
		color: "#ffffff",
		fontSize: 16,
		fontWeight: "700",
	},
	secondaryButton: {
		height: 46,
		borderRadius: 12,
		borderWidth: 1,
		alignItems: "center",
		justifyContent: "center",
	},
	secondaryButtonText: {
		fontSize: 15,
		fontWeight: "600",
	},
	linkButton: {
		paddingVertical: 8,
		alignItems: "center",
	},
	linkText: {
		fontSize: 14,
		fontWeight: "600",
	},
});