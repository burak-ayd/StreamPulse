/**
 * Profil Ekranı — Üst Kısım (Chrome)
 *
 * Yeni tasarım: profil kartı (ortalanmış avatar + ad + iletişim + düzenle),
 * istatistik kartları, Hızlı Erişim listesi, çıkış/giriş eylemi ve sekme
 * çubuğu. Tüm renkler `Palette` / `FontFamily` üzerinden gelir.
 * TV desteği için `TVPressable` kullanılır.
 */

import TVPressable from "@components/common/TVPressable";
import { FontFamily, Palette, ScreenGutter } from "@constants/theme";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import Image from "@/components/common/SmartImage";
import { StyleSheet, Text, View } from "react-native";

// ─── Üst Çubuk ──────────────────────────────────────────────────

/**
 * "Profil" başlığı + bildirim ve SENKRONİZASYON düğmeleri.
 *
 * ⚠️ Bu düğme genel ayarları değil, doğrudan `/settings/sync` ekranını açar
 * (genel ayarlara alt navigasyondaki "Ayarlar" girilir).
 */
export function ProfileTopBar({
	onBack,
	onNotifications,
	onSettings,
	hasNotification = false,
	syncHealthy = false,
}) {
	return (
		<View style={[styles.topBar, { paddingHorizontal: ScreenGutter }]}>
			<TVPressable
				onPress={onBack}
				accessibilityLabel="Geri"
				focusedStyle={null}
				style={({ focused }) => [styles.iconBtn, focused && styles.focusRing]}>
				<Ionicons name="arrow-back" size={20} color={Palette.onSurface} />
			</TVPressable>

			<Text numberOfLines={1} style={styles.topTitle}>
				Profil
			</Text>

			<TVPressable
				onPress={onNotifications}
				accessibilityLabel="Bildirimler"
				focusedStyle={null}
				style={({ focused }) => [styles.iconBtn, focused && styles.focusRing]}>
				<Ionicons
					name={hasNotification ? "notifications" : "notifications-outline"}
					size={19}
					color={Palette.onSurface}
				/>
			</TVPressable>

			<TVPressable
				onPress={onSettings}
				accessibilityLabel="Senkronizasyon ayarları"
				focusedStyle={null}
				style={({ focused }) => [styles.iconBtn, focused && styles.focusRing]}>
				<Ionicons
					name={syncHealthy ? "cloud-done-outline" : "cloud-offline-outline"}
					size={19}
					color={syncHealthy ? Palette.primary : Palette.onSurfaceVariant}
				/>
			</TVPressable>
		</View>
	);
}

// ─── Kimlik Kartı ───────────────────────────────────────────────

export function ProfileHeader({
	displayName,
	handle,
	roleLabel,
	avatarUri,
	onEdit,
	syncHealthy = false,
	wide = false,
}) {
	const initial = (displayName || "K").trim().charAt(0).toUpperCase();
	const avatarSize = wide ? 76 : 72;

	const avatar = avatarUri ? (
		<Image
			source={{ uri: avatarUri }}
			style={[
				styles.avatar,
				{ width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2 },
			]}
			contentFit="cover"
			transition={150}
		/>
	) : (
		<View
			style={[
				styles.avatar,
				styles.avatarFallback,
				{ width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2 },
			]}>
			<Text style={styles.avatarInitial}>{initial}</Text>
		</View>
	);

	return (
		<View style={[styles.card, wide && styles.cardWide]}>
			<View>
				{avatar}
				<View
					style={[
						styles.statusDot,
						{
							backgroundColor: syncHealthy ? Palette.primary : Palette.outline,
						},
					]}
				/>
			</View>

			<View style={styles.nameRow}>
				<Text numberOfLines={1} style={styles.name}>
					{displayName}
				</Text>
				{roleLabel ? (
					<View style={styles.rolePill}>
						<Ionicons
							name="checkmark-circle"
							size={11}
							color={Palette.secondary}
						/>
						<Text numberOfLines={1} style={styles.roleText}>
							{roleLabel}
						</Text>
					</View>
				) : null}
			</View>

			<Text numberOfLines={1} style={styles.handle}>
				{handle}
			</Text>

			<TVPressable
				onPress={onEdit}
				focusedStyle={null}
				style={({ focused }) => [styles.editBtn, focused && styles.editBtnFocused]}>
				<Ionicons
					name="create-outline"
					size={15}
					color={Palette.onPrimaryContainer}
				/>
				<Text style={styles.editBtnText}>Profili Düzenle</Text>
			</TVPressable>
		</View>
	);
}

// ─── Hesap Eylemi ───────────────────────────────────────────────

export function AccountAction({ isLoggedIn, onLogin, onLogout, wide = false }) {
	return (
		<TVPressable
			onPress={isLoggedIn ? onLogout : onLogin}
			focusedStyle={null}
			style={({ focused }) => [
				styles.accountBtn,
				wide && styles.accountBtnWide,
				focused && styles.accountBtnFocused,
			]}>
			<Ionicons
				name={isLoggedIn ? "log-out-outline" : "log-in-outline"}
				size={16}
				color={isLoggedIn ? Palette.error : Palette.onSurface}
			/>
			<Text
				numberOfLines={1}
				style={[
					styles.accountBtnText,
					isLoggedIn && styles.accountBtnTextDanger,
				]}>
				{isLoggedIn ? "Hesaptan Çıkış Yap" : "Giriş Yap"}
			</Text>
		</TVPressable>
	);
}

// ─── İstatistikler ──────────────────────────────────────────────

export function ProfileStats({ stats, activeKey, onSelect, wide = false }) {
	return (
		<View style={[styles.statsSection, wide && styles.statsSectionWide]}>
			<Text style={styles.sectionTitle}>İZLEME İSTATİSTİKLERİ</Text>
			<View style={[styles.statsWrap, wide && styles.statsWrapWide]}>
				{stats.map((stat, index) => {
					const active = stat.key === activeKey;
					return (
						<TVPressable
							key={stat.key}
							onPress={() => onSelect?.(stat.key)}
							focusedStyle={null}
							style={({ focused }) => [
								styles.statCard,
								wide && styles.statCardWide,
								active && styles.statCardActive,
								focused && styles.focusRing,
							]}>
							<View style={styles.statTop}>
								<Text numberOfLines={1} style={styles.statLabel}>
									{stat.label}
								</Text>
								<View style={styles.statNumberRow}>
									<Text style={styles.statNumber}>{stat.value}</Text>
									{index === 0 ? (
										<Ionicons
											name="time-outline"
											size={13}
											color={Palette.tertiary}
										/>
									) : null}
								</View>
							</View>
						</TVPressable>
					);
				})}
			</View>
		</View>
	);
}

// ─── Hızlı Erişim ──────────────────────────────────────────────

/**
 * Hızlı Erişim satırları. `items`: {key, icon, label, subtitle, count, onPress}
 */
export function ProfileQuickAccess({ items }) {
	return (
		<View style={styles.quickWrap}>
			<Text style={styles.sectionTitle}>HIZLI ERİŞİM</Text>
			<View style={styles.quickCard}>
				{items.map((item) => (
					<TVPressable
						key={item.key}
						onPress={item.onPress}
						focusedStyle={null}
						style={({ focused }) => [styles.quickRow, focused && styles.focusRing]}>
						<View style={styles.quickIcon}>
							<Ionicons name={item.icon} size={16} color={Palette.primary} />
						</View>
						<View style={styles.flex}>
							<Text numberOfLines={1} style={styles.quickLabel}>
								{item.label}
							</Text>
							{item.subtitle ? (
								<Text numberOfLines={1} style={styles.quickSub}>
									{item.subtitle}
								</Text>
							) : null}
						</View>
						{item.count != null ? (
							<View style={styles.quickCount}>
								<Text numberOfLines={1} style={styles.quickCountText}>
									{`${item.count} içerik`}
								</Text>
							</View>
						) : null}
						<Ionicons
							name="chevron-forward"
							size={15}
							color={Palette.onSurfaceVariant}
							style={{ opacity: 0.6 }}
						/>
					</TVPressable>
				))}
			</View>
		</View>
	);
}

// ─── Sekmeler ──────────────────────────────────────────────────

export function ProfileTabBar({ tabs, activeKey, onSelect, wide = false }) {
	return (
		<View style={[styles.tabRow, wide && styles.tabRowWide]}>
			{tabs.map((tab) => {
				const active = tab.key === activeKey;
				return (
					<TVPressable
						key={tab.key}
						onPress={() => onSelect(tab.key)}
						focusedStyle={null}
						style={({ focused }) => [
							styles.tabPill,
							active ? styles.tabPillActive : styles.tabPillIdle,
							focused && styles.focusRing,
						]}>
						<Text
							numberOfLines={1}
							style={[
								styles.tabText,
								{ color: active ? Palette.onPrimary : Palette.onSurfaceVariant },
							]}>
							{tab.label}
						</Text>
					</TVPressable>
				);
			})}
		</View>
	);
}

const styles = StyleSheet.create({
	flex: { flex: 1 },
	focusRing: {
		borderColor: Palette.primary,
		borderWidth: 2,
	},

	/* Üst çubuk */
	topBar: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		paddingVertical: 8,
	},
	topTitle: {
		flex: 1,
		color: Palette.onSurface,
		fontFamily: FontFamily.bold,
		fontSize: 20,
		letterSpacing: -0.3,
	},
	iconBtn: {
		width: 36,
		height: 36,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: Palette.surfaceLow,
		borderWidth: 2,
		borderColor: "transparent",
	},

	/* Kimlik kartı */
	card: {
		alignItems: "center",
		backgroundColor: Palette.surfaceLow,
		borderRadius: 16,
		paddingVertical: 18,
		paddingHorizontal: 16,
		marginHorizontal: ScreenGutter,
		gap: 6,
	},
	cardWide: {
		marginHorizontal: 0,
	},
	avatar: {
		backgroundColor: Palette.surfaceHigh,
	},
	avatarFallback: {
		alignItems: "center",
		justifyContent: "center",
	},
	avatarInitial: {
		color: Palette.primary,
		fontFamily: FontFamily.bold,
		fontSize: 26,
	},
	statusDot: {
		position: "absolute",
		right: 2,
		bottom: 2,
		width: 14,
		height: 14,
		borderRadius: 7,
		borderWidth: 2,
		borderColor: Palette.surfaceLow,
	},
	nameRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		maxWidth: "100%",
	},
	name: {
		color: Palette.onSurface,
		fontFamily: FontFamily.bold,
		fontSize: 20,
		letterSpacing: -0.3,
		flexShrink: 1,
	},
	rolePill: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		paddingHorizontal: 7,
		paddingVertical: 2,
		borderRadius: 8,
		backgroundColor: "rgba(76, 215, 246, 0.14)",
	},
	roleText: {
		color: Palette.secondary,
		fontFamily: FontFamily.bold,
		fontSize: 9,
		letterSpacing: 0.6,
		textTransform: "uppercase",
	},
	handle: {
		color: Palette.onSurfaceVariant,
		fontFamily: FontFamily.regular,
		fontSize: 12,
	},
	editBtn: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 6,
		marginTop: 8,
		alignSelf: "stretch",
		paddingVertical: 10,
		borderRadius: 20,
		backgroundColor: Palette.primaryContainer,
		borderWidth: 2,
		borderColor: "transparent",
	},
	editBtnFocused: {
		borderColor: Palette.onSurface,
	},
	editBtnText: {
		color: Palette.onPrimaryContainer,
		fontFamily: FontFamily.bold,
		fontSize: 13,
	},

	/* Hesap eylemi */
	accountBtn: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		marginHorizontal: ScreenGutter,
		marginTop: 12,
		paddingVertical: 12,
		borderRadius: 20,
		backgroundColor: "rgba(255, 180, 171, 0.10)",
		borderWidth: 2,
		borderColor: "transparent",
	},
	accountBtnWide: {
		marginHorizontal: 0,
	},
	accountBtnFocused: {
		borderColor: Palette.primary,
	},
	accountBtnText: {
		color: Palette.onSurface,
		fontFamily: FontFamily.semiBold,
		fontSize: 13,
	},
	accountBtnTextDanger: {
		color: Palette.error,
	},

	/* İstatistikler */
	statsSection: {
		marginHorizontal: ScreenGutter,
		marginTop: 16,
	},
	statsSectionWide: {
		marginHorizontal: 0,
	},
	statsWrap: {
		flexDirection: "row",
		gap: 8,
	},
	statsWrapWide: {
		flexDirection: "column",
	},
	statCard: {
		flex: 1,
		minWidth: 0,
		backgroundColor: Palette.surfaceLow,
		borderRadius: 14,
		paddingVertical: 10,
		paddingHorizontal: 10,
		borderWidth: 2,
		borderColor: "transparent",
	},
	statCardWide: {
		flex: 0,
	},
	statCardActive: {
		backgroundColor: Palette.surface,
	},
	statTop: {
		gap: 2,
	},
	statLabel: {
		color: Palette.onSurfaceVariant,
		fontFamily: FontFamily.medium,
		fontSize: 10,
	},
	statNumberRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 5,
	},
	statNumber: {
		color: Palette.onSurface,
		fontFamily: FontFamily.bold,
		fontSize: 22,
		letterSpacing: -0.5,
	},

	/* Hızlı erişim */
	quickWrap: {
		marginHorizontal: ScreenGutter,
		marginTop: 16,
	},
	sectionTitle: {
		color: Palette.onSurfaceVariant,
		fontFamily: FontFamily.bold,
		fontSize: 10,
		letterSpacing: 1.1,
		marginBottom: 8,
		paddingHorizontal: 4,
	},
	quickCard: {
		backgroundColor: Palette.surfaceLow,
		borderRadius: 14,
		overflow: "hidden",
	},
	quickRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		paddingHorizontal: 12,
		paddingVertical: 12,
		borderWidth: 2,
		borderColor: "transparent",
	},
	quickIcon: {
		width: 32,
		height: 32,
		borderRadius: 16,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: Palette.surfaceHigh,
	},
	quickLabel: {
		color: Palette.onSurface,
		fontFamily: FontFamily.semiBold,
		fontSize: 13,
	},
	quickSub: {
		color: Palette.onSurfaceVariant,
		fontFamily: FontFamily.regular,
		fontSize: 11,
		marginTop: 1,
	},
	quickCount: {
		paddingHorizontal: 8,
		paddingVertical: 2,
		borderRadius: 8,
		backgroundColor: Palette.surfaceHigh,
	},
	quickCountText: {
		color: Palette.onSurfaceVariant,
		fontFamily: FontFamily.semiBold,
		fontSize: 10,
	},

	/* Sekmeler */
	tabRow: {
		flexDirection: "row",
		gap: 8,
		paddingHorizontal: ScreenGutter,
		paddingVertical: 12,
	},
	tabRowWide: {
		paddingHorizontal: 0,
		paddingTop: 0,
	},
	tabPill: {
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: 14,
		paddingVertical: 8,
		borderRadius: 18,
		borderWidth: 2,
		borderColor: "transparent",
	},
	tabPillActive: {
		backgroundColor: Palette.primary,
	},
	tabPillIdle: {
		backgroundColor: Palette.surfaceLow,
	},
	tabText: {
		fontFamily: FontFamily.semiBold,
		fontSize: 12,
	},
});
