/**
 * Güncelleme modalı: sürüm notları, indirme ilerlemesi ve yükleme
 * tetikleyicisi.
 *
 * Bu bileşen "ne olacak?" kararını veren TEK yer; yönetici yalnızca
 * olayları bildirir. Kullanıcı reddederse güncelleme ertelenir, hata
 * olursa tekrar denenebilir.
 *
 * ── TV ──────────────────────────────────────────────────────────────────
 * Eylem düğmeleri `TVPressable` ile odaklanabilir; güncelleme varsa
 * birincil düğme `autoFocus` alır, böylece kumandayla doğrudan
 * "Güncellemeyi indir" denebilir. Arka plan (`Pressable`) bilerek
 * odaklanabilir DEĞİL: odak oraya kaçarsa kullanıcı geri dönemez.
 * Ölçüler `useTvMetrics().sp()` ile ölçeklenir.
 */
import { Ionicons } from "@react-native-vector-icons/ionicons";
import TVPressable from "@/components/common/TVPressable";
import { useAppUpdate } from "@/context/AppUpdateContext";
import { useThemeContext } from "@/context/ThemeContext";
import { useTvMetrics } from "@/utils/tvMetrics";
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
	const { isTV, sp, gutter } = useTvMetrics();
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
	 * kurala tabidir (`onRequestClose`) ve kumandada da aynı tuştur.
	 */
	const handleClose = () => {
		if (isBusy) return;
		closeSheet();
	};

	const primaryFocusedStyle = {
		opacity: 0.85,
		...styles.focusRing,
	};
	const secondaryFocusedStyle = {
		backgroundColor: colors.border,
		...styles.focusRing,
	};
	const linkFocusedStyle = {
		opacity: 0.7,
		...styles.focusRing,
	};

	const renderBody = () => {
		if (isChecking) {
			return (
				<View style={styles.centered}>
					<ActivityIndicator color={colors.primary} size="large" />
					<Text
						style={[
							styles.statusText,
							{ color: colors.text, fontSize: sp(16) },
						]}>
						Güncellemeler kontrol ediliyor…
					</Text>
					<Text
						style={[
							styles.statusHint,
							{ color: colors.textSecondary, fontSize: sp(13) },
						]}>
						GitHub yayınlarına bakılıyor
					</Text>
				</View>
			);
		}

		if (disabledReason && !release) {
			return (
				<View style={styles.centered}>
					<View
						style={[
							styles.iconCircle,
							{
								backgroundColor: colors.border,
								width: sp(62),
								height: sp(62),
								borderRadius: sp(31),
							},
						]}>
						<Ionicons
							name="information-circle-outline"
							size={sp(30)}
							color={colors.textSecondary}
						/>
					</View>
					<Text
						style={[
							styles.statusText,
							{ color: colors.text, fontSize: sp(16) },
						]}>
						Güncelleme kullanılamıyor
					</Text>
					<Text
						style={[
							styles.statusHint,
							{ color: colors.textSecondary, fontSize: sp(13) },
						]}>
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
							{
								backgroundColor: `${colors.primary}22`,
								width: sp(62),
								height: sp(62),
								borderRadius: sp(31),
							},
						]}>
						<Ionicons
							name={error ? "alert-circle-outline" : "checkmark-circle-outline"}
							size={sp(30)}
							color={error ? "#EF4444" : colors.primary}
						/>
					</View>
					<Text
						style={[
							styles.statusText,
							{ color: colors.text, fontSize: sp(16) },
						]}>
						{error ? "Kontrol tamamlanamadı" : "Uygulamanız güncel"}
					</Text>
					<Text
						style={[
							styles.statusHint,
							{ color: colors.textSecondary, fontSize: sp(13) },
						]}>
						{error || statusMessage || `v${currentVersion} yüklü`}
					</Text>
				</View>
			);
		}

		return (
			<View>
				<View style={styles.versionRow}>
					<View
						style={[
							styles.badge,
							{
								backgroundColor: `${colors.primary}22`,
								paddingHorizontal: isTV ? sp(10) : 10,
								paddingVertical: isTV ? sp(4) : 4,
								borderRadius: isTV ? sp(8) : 8,
							},
						]}>
						<Text
							style={[
								styles.badgeText,
								{ color: colors.primary, fontSize: sp(13) },
							]}>
							v{release.version}
						</Text>
					</View>
					<Text
						style={[
							styles.metaText,
							{ color: colors.textSecondary, fontSize: sp(13) },
						]}>
						{release.sizeMB} MB
						{publishedAt ? ` • ${publishedAt}` : ""}
					</Text>
				</View>

				<ScrollView
					style={[styles.notes, isTV ? { maxHeight: sp(260) } : null]}
					contentContainerStyle={styles.notesContent}
					nestedScrollEnabled>
					<Text
						style={[
							styles.notesTitle,
							{ color: colors.text, fontSize: sp(13) },
						]}>
						Sürüm notları
					</Text>
					<Text
						style={[
							styles.notesBody,
							{ color: colors.textSecondary, fontSize: sp(14) },
						]}>
						{release.notes}
					</Text>
				</ScrollView>

				{isInstalling ? (
					<Text
						style={[
							styles.statusHint,
							{ color: colors.textSecondary, fontSize: sp(13), marginTop: 12 },
						]}>
						Sistem yükleyicisi açıldı — yeni sürümü yükleyin.
					</Text>
				) : null}

				{isDownloading ? (
					<View style={styles.progressBlock}>
						<View style={styles.progressHeader}>
							<Text
								style={[
									styles.progressLabel,
									{ color: colors.text, fontSize: sp(13) },
								]}>
								{isInstalling ? "Kuruluyor…" : "İndiriliyor…"}
							</Text>
							<Text
								style={[
									styles.progressLabel,
									{ color: colors.textSecondary, fontSize: sp(13) },
								]}>
								{isInstalling ? "" : `%${Math.round(progress)}`}
							</Text>
						</View>
						<View
							style={[
								styles.progressTrack,
								{ backgroundColor: colors.border, height: isTV ? sp(8) : 8 },
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
					<Text
						style={[styles.errorText, { color: "#EF4444", fontSize: sp(13) }]}>
						{error}
					</Text>
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
				{/*
				 * Arka plan dokunmayla kapatır ama TV'de ODAK ALMAZ;
				 * odak kaçarsa geri dönüş yolu kalır.
				 */}
				<Pressable
					style={styles.backdropPress}
					onPress={handleClose}
					// TV'de arka plan ODAKLANMAMALI: odak oraya kaçarsa
					// kumandada modaldan çıkış yolu kalmaz.
					focusable={false}
					accessibilityRole="button"
					accessibilityLabel="Kapat"
				/>

				<View
					style={[
						styles.sheet,
						{
							backgroundColor: colors.cardBg,
							paddingBottom: Math.max(insets.bottom, isTV ? sp(16) : 16) + 8,
							paddingHorizontal: isTV ? Math.max(gutter, 24) : 20,
						},
					]}>
					<View style={[styles.handle, { backgroundColor: colors.border }]} />

					<View style={styles.header}>
						<Text
							style={[
								styles.headerTitle,
								{ color: colors.text, fontSize: sp(19) },
							]}>
							Uygulama Güncellemesi
						</Text>
						<Text
							style={[
								styles.headerSubtitle,
								{ color: colors.textSecondary, fontSize: sp(13) },
							]}>
							Yüklü sürüm: v{currentVersion}
						</Text>
					</View>

					{renderBody()}

					<View style={styles.actions}>
						{showPrimaryAction ? (
							<TVPressable
								onPress={install}
								disabled={isBusy}
								// TV'de odak doğrudan ana eylemde olsun.
								autoFocus={isTV}
								style={{
									backgroundColor: colors.primary,
									opacity: isBusy ? 0.75 : 1,
									height: isTV ? sp(56) : 50,
									borderRadius: isTV ? sp(12) : 12,
								}}
								focusedStyle={primaryFocusedStyle}
								accessibilityRole="button">
								<Text
									style={[
										styles.primaryButtonText,
										{ fontSize: sp(16) },
									]}>
									{isBusy ? "Devam ediliyor…" : "Güncellemeyi indir"}
								</Text>
							</TVPressable>
						) : null}

						{showCancel ? (
							<TVPressable
								onPress={cancelDownload}
								// İndirme sürerken tek eylem bu; odak buraya
								// gelmezse modalda odaklanabilir hiçbir şey kalmaz.
								autoFocus={isTV}
								style={[
									styles.secondaryButton,
									{
										borderColor: colors.border,
										height: isTV ? sp(50) : 46,
										borderRadius: isTV ? sp(12) : 12,
									},
								]}
								focusedStyle={secondaryFocusedStyle}
								accessibilityRole="button">
								<Text
									style={[
										styles.secondaryButtonText,
										{ color: colors.text, fontSize: sp(15) },
									]}>
									İndirmeyi iptal et
								</Text>
							</TVPressable>
						) : (
							<TVPressable
								onPress={handleClose}
								disabled={isBusy}
								// Ana düğme yoksa (kuruluyor / güncel / hata)
								// odak tek çıkış yoluna gelsin.
								autoFocus={isTV && !showPrimaryAction}
								style={[
									styles.secondaryButton,
									{
										borderColor: colors.border,
										opacity: isBusy ? 0.5 : 1,
										height: isTV ? sp(50) : 46,
										borderRadius: isTV ? sp(12) : 12,
									},
								]}
								focusedStyle={secondaryFocusedStyle}
								accessibilityRole="button">
								<Text
									style={[
										styles.secondaryButtonText,
										{ color: colors.text, fontSize: sp(15) },
									]}>
									{release ? "Şimdi değil" : "Kapat"}
								</Text>
							</TVPressable>
						)}

						<TVPressable
							onPress={() => check({ manual: true })}
							disabled={isBusy}
							style={{ paddingVertical: isTV ? sp(10) : 8 }}
							focusedStyle={linkFocusedStyle}
							accessibilityRole="button">
							<Text
								style={[
									styles.linkText,
									{ color: colors.primary, fontSize: sp(14) },
								]}>
								Güncellemeleri tekrar kontrol et
							</Text>
						</TVPressable>
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
		paddingTop: 10,
		// TV'de metin satırı 1920px boyunca uzanmasın (tvMetrics kuralı).
		alignSelf: "center",
		width: "100%",
		maxWidth: 900,
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
		fontWeight: "700",
	},
	headerSubtitle: {
		marginTop: 3,
	},
	centered: {
		alignItems: "center",
		paddingVertical: 20,
	},
	iconCircle: {
		alignItems: "center",
		justifyContent: "center",
		marginBottom: 14,
	},
	statusText: {
		fontWeight: "600",
		textAlign: "center",
	},
	statusHint: {
		marginTop: 6,
		textAlign: "center",
		paddingHorizontal: 12,
	},
	versionRow: {
		flexDirection: "row",
		alignItems: "center",
		marginBottom: 12,
	},
	badge: {},
	badgeText: {
		fontWeight: "700",
	},
	metaText: {
		marginLeft: 10,
	},
	notes: {
		maxHeight: 210,
	},
	notesContent: {
		paddingBottom: 4,
	},
	notesTitle: {
		fontWeight: "700",
		marginBottom: 6,
	},
	notesBody: {
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
		fontWeight: "600",
	},
	progressTrack: {
		borderRadius: 4,
		overflow: "hidden",
	},
	progressFill: {
		height: "100%",
		borderRadius: 4,
	},
	errorText: {
		marginTop: 12,
	},
	actions: {
		marginTop: 18,
		gap: 10,
	},
	primaryButtonText: {
		color: "#ffffff",
		fontWeight: "700",
		textAlign: "center",
	},
	secondaryButton: {
		borderWidth: 1,
		alignItems: "center",
		justifyContent: "center",
	},
	secondaryButtonText: {
		fontWeight: "600",
	},
	linkText: {
		fontWeight: "600",
		textAlign: "center",
	},
	// TV odak halkası. TVPressable'in varsayılanı `scale` kullanıyor;
	// kartta ölçek değişimi kenardan taşma gibi göründüğü ve
	// absolute konumlu banner'ı kaydırdığı için burada sabit bir
	// çerçeve tercih edildi.
	focusRing: {
		borderColor: "#FFFFFF",
		borderWidth: 2,
	},
});