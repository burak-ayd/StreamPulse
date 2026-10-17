/**
 * Profil Ekranı — Üst Kısım (Chrome)
 *
 * Referans: profil_sekmeli_minimal / profil_favoriler_sekmesi /
 * profil_son_i_zlenenler_sekmesi (Ortak başlık bloğu)
 *
 * Material 3 yüzey rampası; tüm renkler `useThemeContext().m3`.
 * TV desteği için `TVPressable` ve `focusedStyle` kullanılır.
 */

import { useThemeContext } from "@/context/ThemeContext";
import TVPressable from "@components/common/TVPressable";
import { ScreenGutter } from "@constants/theme";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import Image from "@/components/common/SmartImage";
import { StyleSheet, Text, View } from "react-native";

// ─── Üst Çubuk ──────────────────────────────────────────────────

/**
 * "Profilim •" başlığı + bildirim ve SENKRONİZASYON düğmeleri.
 *
 * ⚠️ Bu düğme genel ayarları değil, doğrudan `/settings/sync` ekranını açar
 * (genel ayarlara alt navigasyondaki "Ayarlar" girilir). Bu yüzden simgesi
 * de sync ile ilgili: sağlıklıyken bulut/onay, sorunluyken bulut/kesik.
 *
 * @param {{onBack: () => void, onNotifications: () => void, onSettings: () => void,
 *          hasNotification?: boolean, syncHealthy?: boolean}} props
 */
export function ProfileTopBar({
	onBack,
	onNotifications,
	onSettings,
	hasNotification = false,
	syncHealthy = false,
}) {
	const { m3 } = useThemeContext();

	return (
		<View
			style={[
				styles.topBar,
				{
					backgroundColor: m3.surfaceLowest,
					borderBottomColor: `${m3.surfaceContainerHigh}66`,
				},
			]}>
			<TVPressable
				onPress={onBack}
				focusedStyle={styles.focusedRound}
				style={styles.topBarSide}
				accessibilityLabel="Geri">
				<Ionicons name="arrow-back" size={22} color={m3.onSurface} />
			</TVPressable>

			<View style={styles.topBarTitleWrap}>
				<Text style={[styles.topBarTitle, { color: m3.onSurface }]}>
					Profilim
				</Text>
			</View>

			<View style={styles.topBarActions}>
				<TVPressable
					onPress={onNotifications}
					focusedStyle={styles.focusedRound}
					style={[
						styles.iconBtn,
						{ backgroundColor: `${m3.surfaceContainer}99` },
					]}
					accessibilityLabel="Bildirimler">
					<Ionicons
						name="notifications-outline"
						size={20}
						color={m3.onSurface}
					/>
					{hasNotification ? (
						<View
							style={[
								styles.badgeDot,
								{
									backgroundColor: m3.primaryContainer,
									borderColor: m3.surfaceLowest,
								},
							]}
						/>
					) : null}
				</TVPressable>
				<TVPressable
					onPress={onSettings}
					focusedStyle={styles.focusedRound}
					style={[
						styles.iconBtn,
						{
							backgroundColor: `${m3.surfaceContainer}99`,
							borderWidth: 1,
							borderColor: syncHealthy
								? `${m3.success}55`
								: `${m3.surfaceContainerHigh}99`,
						},
					]}
					accessibilityLabel={
						syncHealthy ? "Senkronizasyon" : "Senkronizasyon hatası"
					}>
					<Ionicons
						name={syncHealthy ? "cloud-done-outline" : "cloud-offline-outline"}
						size={20}
						color={syncHealthy ? m3.success : m3.onSurface}
					/>
				</TVPressable>
			</View>
		</View>
	);
}

// ─── Profil Başlığı ─────────────────────────────────────────────

/**
 * Profil Başlığı.
 *
 * Çerçeve rengi senkronizasyon durumunu gösterir:
 *   • giriş yapılmış VE sync hatası yok  → YEŞİL
 *   • aksi (giriş yok / sync hatası var) → KIRMIZI
 *
 * ── `wide` (yatay + geniş ekran: TV, tablet yatay, telefon yatay) ──
 *
 * Tek sütunda kimlik satırı kenardan kenara yayılıyordu: isim solda,
 * "Düzenle" düğmesi 800dp ötede sağ uçta kalıyordu. Geniş yerleşimde
 * başlık, sol sütunun içinde ORTALANMIŞ bir kimlik kartına döner
 * (avatar üstte, isim/handle altında, düğme altta) — iki sütunlu
 * düzenin "profil kartı" görünümü. DİKEY telefon yerleşimi değişmez.
 *
 * @param {{displayName: string, handle: string, roleLabel?: string,
 *          avatarUri?: string|null, onEdit: () => void,
 *          syncHealthy?: boolean, wide?: boolean}} props
 */
export function ProfileHeader({
	displayName,
	handle,
	roleLabel,
	avatarUri,
	onEdit,
	syncHealthy = false,
	wide = false,
}) {
	const { m3 } = useThemeContext();
	const initial = (displayName || "K").trim().charAt(0).toUpperCase();
	const ringColor = syncHealthy ? m3.success : m3.primaryContainer;
	const avatarSize = wide ? 76 : 64;

	const avatar = avatarUri ? (
		<Image
			source={{ uri: avatarUri }}
			style={[
				styles.avatar,
				{
					width: avatarSize,
					height: avatarSize,
					borderRadius: avatarSize / 2,
					borderColor: ringColor,
				},
			]}
			contentFit="cover"
			transition={150}
		/>
	) : (
		<View
			style={[
				styles.avatar,
				styles.avatarFallback,
				{
					width: avatarSize,
					height: avatarSize,
					borderRadius: avatarSize / 2,
					backgroundColor: m3.surfaceContainerHighest,
					borderColor: ringColor,
				},
			]}>
			<Text
				style={[
					styles.avatarInitial,
					wide && styles.avatarInitialWide,
					{ color: m3.onSurface },
				]}>
				{initial}
			</Text>
		</View>
	);

	/* Durum noktası — referans tasarımda avatarın sağ altında yeşil bir
	   "çevrimiçi" noktası var. Burada aynı yerde ama anlamı senkronizasyon
	   sağlığını bildiriyor. */
	const statusDot = (
		<View
			style={[
				styles.statusDot,
				wide && styles.statusDotWide,
				{
					backgroundColor: syncHealthy
						? m3.success
						: m3.primaryContainer,
					borderColor: m3.surfaceLowest,
				},
			]}
		/>
	);

	const editButton = (
		<TVPressable
			onPress={onEdit}
			focusedStyle={styles.focusedPill}
			style={({ focused }) => [
				styles.editBtn,
				wide && styles.editBtnWide,
				{
					backgroundColor: m3.surfaceContainerHigh,
					borderColor: `${m3.surfaceContainerHigh}99`,
				},
				focused && { borderColor: m3.onSurface },
			]}>
			<Ionicons name="create-outline" size={15} color={m3.onSurface} />
			<Text style={[styles.editBtnText, { color: m3.onSurface }]}>
				Düzenle
			</Text>
		</TVPressable>
	);

	if (wide) {
		return (
			<View
				style={[
					styles.header,
					styles.headerWide,
					{ paddingHorizontal: ScreenGutter },
				]}>
				<View style={styles.identityCard}>
					<View>
						{avatar}
						{statusDot}
					</View>

					<Text
						style={[styles.name, styles.nameWide, { color: m3.onSurface }]}
						numberOfLines={1}>
						{displayName}
					</Text>
					<Text
						style={[
							styles.handle,
							styles.handleWide,
							{ color: m3.onSurfaceVariant },
						]}
						numberOfLines={1}>
						{handle}
						{roleLabel ? ` • ${roleLabel}` : ""}
					</Text>

					{editButton}
				</View>
			</View>
		);
	}

	return (
		<View style={[styles.header, { paddingHorizontal: ScreenGutter }]}>
			<View style={styles.headerRow}>
				<View style={styles.identity}>
					<View>
						{avatar}
						{statusDot}
					</View>

					<View style={styles.identityText}>
						<Text
							style={[styles.name, { color: m3.onSurface }]}
							numberOfLines={1}>
							{displayName}
						</Text>
						<Text
							style={[
								styles.handle,
								{ color: m3.onSurfaceVariant },
							]}
							numberOfLines={1}>
							{handle}
							{roleLabel ? ` • ${roleLabel}` : ""}
						</Text>
					</View>
				</View>

				{editButton}
			</View>
		</View>
	);
}

// ─── Hesap Eylemi (Giriş / Çıkış) ───────────────────────────────

/**
 * Giriş yap / çıkış yap düğmesi.
 *
 * Giriş yapılmamışken ana eylem olduğu için dolgu (primaryContainer),
 * giriş yapılmışken ikincil eylem olduğu için çizgili (outline) görünür.
 * Çıkış, veri kaybı yaratabileceği için ayrıca onay ister (üst katmanda).
 *
 * @param {{isLoggedIn: boolean, onLogin: () => void, onLogout: () => void,
 *          wide?: boolean}} props
 */
export function AccountAction({ isLoggedIn, onLogin, onLogout, wide = false }) {
	const { m3 } = useThemeContext();

	return (
		<View
			style={[
				styles.accountWrap,
				wide && styles.accountWrapWide,
				{ paddingHorizontal: ScreenGutter },
			]}>
			<TVPressable
				onPress={isLoggedIn ? onLogout : onLogin}
				focusedStyle={styles.focusedPill}
				style={[
					styles.accountBtn,
					isLoggedIn
						? {
								backgroundColor: "transparent",
								borderColor: `${m3.onSurfaceVariant}66`,
							}
						: {
								backgroundColor: m3.primaryContainer,
								borderColor: m3.primaryContainer,
							},
				]}
				accessibilityLabel={isLoggedIn ? "Çıkış yap" : "Giriş yap"}>
				<Ionicons
					name={isLoggedIn ? "log-out-outline" : "log-in-outline"}
					size={17}
					color={
						isLoggedIn ? m3.onSurfaceVariant : m3.onPrimaryContainer
					}
				/>
				<Text
					style={[
						styles.accountBtnText,
						{
							color: isLoggedIn
								? m3.onSurfaceVariant
								: m3.onPrimaryContainer,
						},
					]}>
					{isLoggedIn ? "Çıkış Yap" : "Giriş Yap"}
				</Text>
			</TVPressable>

			{!isLoggedIn ? (
				<Text
					style={[
						styles.accountHint,
						{ color: m3.onSurfaceVariant },
					]}>
					Giriş yaparak favorilerini ve izleme geçmişini tüm
					cihazlarında senkronize edebilirsin.
				</Text>
			) : null}
		</View>
	);
}

// ─── İstatistik Kartları ────────────────────────────────────────

/**
 * Üç tane dokunulabilir istatistik kartı.
 *
 * Görsel kural (referans fotoğraf): üç hücre ortak bir yuvarlak kart içinde,
 * ince dikey ayraçlarla bölünmüş. Aktif hücre YALNIZCA kırmızı sayıyla
 * belli olur — aktif hücreye arka plan verilmez, üst kenarlık çizilmez.
 * (Önceki sürümde hem arka plan hem üst çizgi vardı; fotoğrafta yok.)
 *
 * Karta dokunmak o sekmeye geçer.
 *
 * @param {{stats: Array<{key: string, value: number, label: string}>,
 *          activeKey: string, onSelect: (key: string) => void,
 *          wide?: boolean}} props
 */
export function ProfileStats({ stats, activeKey, onSelect, wide = false }) {
	const { m3 } = useThemeContext();

	return (
		<View
			style={[
				styles.statsWrap,
				wide && styles.statsWrapWide,
				{ paddingHorizontal: ScreenGutter },
			]}>
			<View
				style={[
					styles.statsRow,
					{
						backgroundColor: m3.surfaceContainer,
						borderColor: `${m3.surfaceContainerHigh}80`,
					},
				]}>
				{stats.map((stat, index) => {
					const isActive = stat.key === activeKey;

					return (
						<TVPressable
							key={stat.key}
							onPress={() => onSelect(stat.key)}
							focusedStyle={styles.focusedStat}
							style={[
								styles.statCell,
								index > 0 && {
									borderLeftWidth:
										StyleSheet.hairlineWidth * 2,
									borderLeftColor: `${m3.surfaceContainerHigh}CC`,
								},
							]}
							accessibilityLabel={`${stat.label}: ${stat.value}`}>
							<Text
								style={[
									styles.statValue,
									{
										color: isActive
											? m3.primaryContainer
											: m3.onSurface,
									},
								]}>
								{stat.value}
							</Text>
							<Text
								style={[
									styles.statLabel,
									{ color: m3.onSurfaceVariant },
								]}
								numberOfLines={1}>
								{stat.label}
							</Text>
						</TVPressable>
					);
				})}
			</View>
		</View>
	);
}

// ─── Sekme Çubuğu ───────────────────────────────────────────────

/**
 * Sekme çubuğu — ALT ÇİZGİ varyantı.
 *
 * Aktif sekme: kırmızı + kalın metin + 2px kırmızı alt çizgi.
 * Pasif sekme: soluk gri + 600 ağırlık.
 * Çubuğun tamamı ince bir ayraç çizgisiyle biter (referans `border-b`).
 *
 * @param {{tabs: Array<{key: string, label: string, dot?: boolean}>,
 *          activeKey: string, onSelect: (key: string) => void,
 *          wide?: boolean}} props
 */
export function ProfileTabBar({ tabs, activeKey, onSelect, wide = false }) {
	const { m3 } = useThemeContext();

	return (
		<View
			style={[
				styles.tabsWrap,
				wide && styles.tabsWrapWide,
				{ paddingHorizontal: ScreenGutter },
			]}>
			<View
				style={[
					styles.tabsRow,
					{ borderBottomColor: `${m3.surfaceContainerHigh}99` },
				]}>
				{tabs.map((tab) => {
					const isActive = tab.key === activeKey;

					return (
						<TVPressable
							key={tab.key}
							onPress={() => onSelect(tab.key)}
							focusedStyle={styles.focusedTab}
							style={[
								wide ? styles.tabWide : styles.tab,
								{
									borderBottomColor: isActive
										? m3.primaryContainer
										: "transparent",
								},
							]}
							accessibilityRole="tab"
							accessibilityState={{ selected: isActive }}>
							{({ focused }) => (
								<View style={styles.tabInner}>
									<Text
										style={[
											styles.tabText,
											{
												color: isActive
													? m3.primaryContainer
													: focused
														? m3.onSurface
														: `${m3.onSurfaceVariant}CC`,
												fontWeight: isActive
													? "700"
													: "600",
											},
										]}
										numberOfLines={1}>
										{tab.label}
									</Text>
									{tab.dot && isActive ? (
										<View
											style={[
												styles.tabDot,
												{
													backgroundColor:
														m3.primaryContainer,
												},
											]}
										/>
									) : null}
								</View>
							)}
						</TVPressable>
					);
				})}
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	// Üst çubuk
	topBar: {
		height: 56,
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: ScreenGutter,
		borderBottomWidth: 1,
	},
	topBarSide: {
		width: 40,
		height: 40,
		alignItems: "center",
		justifyContent: "center",
	},
	topBarTitleWrap: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 6,
	},
	topBarTitle: {
		fontSize: 20,
		lineHeight: 26,
		fontWeight: "700",
		letterSpacing: -0.3,
	},
	titleDot: {
		width: 6,
		height: 6,
		borderRadius: 3,
	},
	topBarActions: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
	},
	iconBtn: {
		width: 40,
		height: 40,
		borderRadius: 20,
		alignItems: "center",
		justifyContent: "center",
	},
	badgeDot: {
		position: "absolute",
		top: 9,
		right: 10,
		width: 8,
		height: 8,
		borderRadius: 4,
		borderWidth: 2,
	},

	// Başlık
	header: {
		paddingTop: 16,
		paddingBottom: 8,
	},
	headerRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 12,
	},
	identity: {
		flexDirection: "row",
		alignItems: "center",
		gap: 14,
		flex: 1,
		minWidth: 0,
	},
	avatar: {
		width: 64,
		height: 64,
		borderRadius: 32,
		borderWidth: 2,
		// Satırda sıkışıp metnin üstüne binmesin diye boyutu sabit tutulur.
		flexShrink: 0,
	},
	avatarFallback: {
		alignItems: "center",
		justifyContent: "center",
	},
	statusDot: {
		position: "absolute",
		right: -1,
		bottom: -1,
		width: 16,
		height: 16,
		borderRadius: 8,
		borderWidth: 2.5,
	},
	avatarInitial: {
		fontSize: 26,
		fontWeight: "700",
	},
	identityText: {
		flex: 1,
		minWidth: 0,
	},
	name: {
		fontSize: 18,
		lineHeight: 22,
		fontWeight: "700",
	},
	handle: {
		fontSize: 12,
		lineHeight: 16,
		fontWeight: "500",
		marginTop: 2,
	},
	editBtn: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		paddingHorizontal: 12,
		paddingVertical: 8,
		borderRadius: 999,
		borderWidth: 1,
		flexShrink: 0,
	},
	editBtnText: {
		fontSize: 12,
		lineHeight: 16,
		fontWeight: "600",
	},

	// Başlık — geniş yerleşim (sol sütunda ortalanmış kimlik kartı;
	// tek sütunda isim ile "Düzenle" ekranın iki ucuna savruluyordu)
	headerWide: {
		paddingTop: 8,
		paddingBottom: 4,
	},
	identityCard: {
		alignItems: "center",
	},
	avatarInitialWide: {
		fontSize: 30,
	},
	statusDotWide: {
		right: 2,
		bottom: 2,
		width: 18,
		height: 18,
		borderRadius: 9,
		borderWidth: 3,
	},
	nameWide: {
		fontSize: 19,
		lineHeight: 24,
		marginTop: 12,
		textAlign: "center",
	},
	handleWide: {
		textAlign: "center",
	},
	editBtnWide: {
		marginTop: 12,
		paddingHorizontal: 16,
		paddingVertical: 9,
	},

	// Hesap eylemi
	accountWrap: {
		paddingTop: 12,
		paddingBottom: 4,
	},
	accountWrapWide: {
		paddingTop: 8,
	},
	accountBtn: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		paddingVertical: 11,
		borderRadius: 999,
		borderWidth: 1,
	},
	accountBtnText: {
		fontSize: 13,
		lineHeight: 18,
		fontWeight: "700",
	},
	accountHint: {
		fontSize: 12,
		lineHeight: 17,
		textAlign: "center",
		marginTop: 8,
		paddingHorizontal: 12,
	},

	// İstatistikler
	statsWrap: {
		paddingTop: 12,
		paddingBottom: 8,
	},
	statsWrapWide: {
		paddingTop: 8,
		paddingBottom: 4,
	},
	statsRow: {
		flexDirection: "row",
		paddingVertical: 14,
		paddingHorizontal: 4,
		borderRadius: 12,
		borderWidth: 1,
	},
	statCell: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 2,
	},
	statValue: {
		fontSize: 22,
		lineHeight: 28,
		fontWeight: "700",
	},
	statLabel: {
		fontSize: 11,
		lineHeight: 16,
		fontWeight: "500",
		marginTop: 2,
	},

	// Sekmeler
	tabsWrap: {
		paddingTop: 12,
		paddingBottom: 8,
	},
	tabsWrapWide: {
		paddingTop: 2,
		paddingBottom: 8,
	},
	tabsRow: {
		flexDirection: "row",
		borderBottomWidth: 1,
	},
	tab: {
		flex: 1,
		borderBottomWidth: 2,
	},
	// Geniş yerleşim: sekmeler eşit dağıtılmaz — içerikleri kadar yer
	// kaplar. Tek sütunda 3 sekme 288dp'ye yayılıyordu (TV'de ~575px).
	tabWide: {
		flexGrow: 0,
		flexShrink: 0,
		flexBasis: "auto",
		paddingHorizontal: 14,
		borderBottomWidth: 2,
	},
	tabInner: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 5,
		paddingBottom: 10,
		paddingTop: 2,
		paddingHorizontal: 4,
	},
	tabText: {
		fontSize: 12,
		lineHeight: 16,
		letterSpacing: 0.1,
	},
	tabDot: {
		width: 6,
		height: 6,
		borderRadius: 3,
	},

	// TV odak stilleri
	focusedRound: {
		transform: [{ scale: 1.12 }],
	},
	focusedPill: {
		transform: [{ scale: 1.04 }],
	},
	focusedStat: {
		borderColor: "#FFFFFF",
		borderWidth: 1,
	},
	focusedTab: {
		transform: [{ scale: 1.04 }],
	},
});
