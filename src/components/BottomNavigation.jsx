import TVPressable from "@/components/common/TVPressable";
import { NAV_RAIL_WIDTH, useNavLayout } from "@/hooks/useNavLayout";
import {
	okunmamisSayisiGetir,
	rozetAbone,
} from "@/services/bildirimApi";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";

/** @deprecated Geriye uyumluluk: artık useNavLayout'ı kullanın. */
export const TV_NAV_WIDTH = NAV_RAIL_WIDTH;

const NAV_ITEMS = [
	{ id: "home", icon: "home", route: "/(app)" },
	{ id: "search", icon: "search", route: "/(app)/search" },
	{ id: "library", icon: "folder", route: "/(app)/library" },
	{ id: "bildirim", icon: "notifications", route: "/(app)/bildirimler" },
	{ id: "downloads", icon: "download", route: "/(app)/downloads" },
	{ id: "settings", icon: "settings", route: "/(app)/settings" },
];

/**
 * Okunmamış adet rozet noktası — `deger` 0 ise hiç çizilmez.
 * TV rayı ikon kutusuna ve telefon barındaki hap gövdeye
 * `pointerEvents: "none"` ile bindirilir; dokunuş bandın kendisine gider.
 */
function RozetNokta({ deger }) {
	if (!deger || deger <= 0) return null;
	const metin = deger > 99 ? "99+" : String(deger);
	return (
		<View
			pointerEvents="none"
			style={[
				styles.rozetNokta,
				metin.length > 1 ? styles.rozetNoktaGenis : null,
			]}>
			<Text style={styles.rozetYazi} maxFontSizeMultiplier={1.1}>
				{metin}
			</Text>
		</View>
	);
}

/**
 * ⚠️ SORUN 3'ÜN KÖK NEDENİ: Sol rayın dikey payı.
 *
 * Android TV odak yöneticisi bir düğmeyi ararken "ışın" (beam) mantığı
 * kullanır: adayın, odaklı görünümün **dik eksen** (sol/sağ için dikey)
 * aralığıyla KESİŞMESİ gerekir. Rayın ikonları `justifyContent:
 * "center"` ile ekranın tam ORTASINA yığılmıştı; ekranın üstünde veya
 * altında duran bir karttan `SOL` basıldığında ışın hiçbir ray
 * öğesiyle kesişmediği için odak hiçbir yere gitmiyordu. Kullanıcı
 * "menüye ancak sayfanın en üstüne çıkıp sol tuşuna basınca geçebiliyorum"
 * diye tarif ediyordu — üstteki odaklı öğe ışınla kesiştiği için.
 *
 * ÇÖZÜM: Her ray öğesi artık ekranın beşte birini kaplayan bir
 * **dikey bant** oluşturuyor (görsel ikon 44×44 kalıyor, odak halkası
 * onun üzerinde). Böylece ekranın HANGİ noktasından sol tuşu basılırsa
 * basılsın en az bir ray bandı ışınla kesişir ve odak her zaman raya
 * düşer.
 *
 * Üstte/altta bırakılan pay (`paddingVertical`) şart: rayın son öğesinin
 * ALTINDA boşluk kalmazsa, oradan `AŞAĞA` basıldığında odak rayın içinde
 * hapsolur ve kullanıcı içerik dönemez.
 */
const RAIL_EDGE_RATIO = 0.08;

/**
 * ⚠️ SORUN 4'ÜN YAN ETKİSİ — bölüm geçişi sekme gibi davranmalı.
 *
 * `<Slot/>` yerine `<Stack/>` kullanılınca (ekranları mount durumunda
 * tutmak için) her bölüm düğmesine basmak yeni bir ekran YIGINDI.
 * Ana → Arama → Ana → Arama… sonrası "geri" tuşu sanılan yerlerde
 * ekranlar arasında dolaşıyordu.
 *
 * Çözüm: basılan bölüm yazdığımız gezinme İZİNDE zaten varsa ona
 * geri sarılıyoruz. Böylece:
 *   • ekran mount durumunda kalıyor → kaydırma konumu/filtre korunuyor,
 *   • geri tuşu anlamlı bir geçmişe dönüyor.
 *
 * İz, aktif bölüm değiştikçe `syncSectionTrail` ile gerçek duruma
 * göre kırpılır; böylece donanım geri tuşuyla yapılan gezinme de
 * tutarlı kalır.
 */
let sectionTrail = [];

function syncSectionTrail(sectionId) {
	if (!sectionId) return;
	if (sectionTrail[sectionTrail.length - 1] === sectionId) return;
	const idx = sectionTrail.lastIndexOf(sectionId);
	sectionTrail =
		idx >= 0 ? sectionTrail.slice(0, idx + 1) : [...sectionTrail, sectionId];
}

function goToSection(router, route) {
	const idx = sectionTrail.lastIndexOf(route);
	// Izde daha önce görülmüş ve şu an üstünde değilsek → geri sar.
	if (idx >= 0 && idx < sectionTrail.length - 1) {
		const steps = sectionTrail.length - 1 - idx;
		for (let i = 0; i < steps; i++) router.back();
		return;
	}
	router.push(route);
}

export default function BottomNavigation({ activeRoute, onOpenPlatforms }) {
	const router = useRouter();
	// Tek kaynak: TV + tablet yatay → sol ray; telefon ve tablet dikey → alt bar.
	const { isSideRail } = useNavLayout();
	const { height } = useWindowDimensions();

	/*
	 * Okunmamış bildirim sayaç — serviste modül önbelleği + abonelik var;
	 * bileşen TV'de ekran başına birden çok örnekte yaşasa bile bunun
	 * sayesinde ağ istekleri TEK tazelenmede birleşir.
	 */
	const [rozet, setRozet] = useState(0);
	useEffect(() => {
		const cik = rozetAbone(setRozet);
		let canli = true;
		okunmamisSayisiGetir().then((sayi) => {
			if (canli) setRozet(sayi);
		});
		return () => {
			canli = false;
			cik();
		};
	}, []);

	const activeSection = NAV_ITEMS.find((i) => i.route === activeRoute)?.id;

	useEffect(() => {
		syncSectionTrail(activeSection);
	}, [activeSection]);

	const handleAction = (item) => {
		if (item.route && activeRoute !== item.route) {
			goToSection(router, item.route);
		}
	};

	// Sol tarafta dikey ray: TV ve tablet (yatay)
	if (isSideRail) {
		const edgePad = Math.max(8, Math.round(height * RAIL_EDGE_RATIO));
		return (
			<View
				style={[
					styles.railContainer,
					{ paddingTop: edgePad, paddingBottom: edgePad },
				]}>
				<View style={styles.railNavList}>
					{NAV_ITEMS.map((item) => {
						const isActive =
							item.route && activeRoute === item.route;
						return (
							<TVPressable
								key={item.id}
								onPress={() => handleAction(item)}
								style={styles.railItem}
								focusedStyle={null}
								accessibilityLabel={item.id}>
								{({ focused }) => (
									<View
										style={[
											styles.railIconBox,
											isActive
												? styles.railIconBoxActive
												: styles.railIconBoxInactive,
											focused && styles.railIconBoxFocused,
										]}>
										<Ionicons
											name={
												isActive
													? item.icon
													: `${item.icon}-outline`
											}
											size={22}
											color={
												isActive || focused
													? "#ffffff"
													: "#8E8E93"
											}
										/>
										{item.id === "bildirim" && (
											<RozetNokta deger={rozet} />
										)}
									</View>
								)}
							</TVPressable>
						);
					})}
				</View>
			</View>
		);
	}

	// Altta yatay bar: telefon ve tablet (dikey)
	return (
		<View style={styles.container}>
			{NAV_ITEMS.map((item) => {
				const isActive = item.route && activeRoute === item.route;
				return (
					<TVPressable
						key={item.id}
						onPress={() => handleAction(item)}
						style={styles.navItem}
						focusedStyle={styles.navItemFocused}>
						{({ focused }) => (
							<View
								style={[
									isActive
										? styles.activePill
										: styles.inactivePill,
									focused &&
										(isActive
											? styles.activePillFocused
											: styles.inactivePillFocused),
								]}>
								<Ionicons
									name={
										isActive
											? item.icon
											: `${item.icon}-outline`
									}
									size={22}
									color={focused || isActive ? "#ffffff" : "#8E8E93"}
								/>
								{item.id === "bildirim" && (
									<RozetNokta deger={rozet} />
								)}
							</View>
						)}
					</TVPressable>
				);
			})}
		</View>
	);
}

const styles = StyleSheet.create({
	// --- Sol taraf rayı: TV + tablet (yatay) ---
	railContainer: {
		position: "absolute",
		top: 0,
		bottom: 0,
		left: 0,
		width: NAV_RAIL_WIDTH,
		backgroundColor: "#0d0e12",
		borderRightWidth: 1,
		borderRightColor: "rgba(255, 255, 255, 0.08)",
		alignItems: "center",
		zIndex: 9999,
		elevation: 24,
	},
	/*
	 * SORUN 3: liste tüm yüksekliği kaplar, öğeler `space-evenly` ile
	 * dağıtılır ve her öğe esner (`flex: 1`). Böylece herhangi bir
	 * dikey konumdan basılan SOL tuşu bir ray bandıyla kesişir.
	 */
	railNavList: {
		flex: 1,
		width: "100%",
		flexDirection: "column",
		alignItems: "center",
		justifyContent: "space-evenly",
	},
	/* Odak hedefi = dikey bant; görsel ikon `railIconBox`. */
	railItem: {
		width: "100%",
		flex: 1,
		minHeight: 52,
		maxHeight: 160,
		alignItems: "center",
		justifyContent: "center",
	},
	railIconBox: {
		width: 44,
		height: 44,
		borderRadius: 14,
		alignItems: "center",
		justifyContent: "center",
	},
	railIconBoxActive: {
		backgroundColor: "#2563EB",
	},
	railIconBoxInactive: {
		backgroundColor: "transparent",
	},
	// TV performans: odakta elevation DEĞİŞTİRİLMEZ, sadece kenar + zemin.
	railIconBoxFocused: {
		backgroundColor: "rgba(229, 9, 20, 0.25)",
		borderColor: "#E50914",
		borderWidth: 2,
	},

	// --- Alt bar: telefon + tablet (dikey) ---
	container: {
		flexDirection: "row",
		borderTopWidth: 1,
		borderTopColor: "rgba(255, 255, 255, 0.08)",
		backgroundColor: "#0d0e12",
		paddingVertical: 10,
		paddingHorizontal: 12,
		alignItems: "center",
		justifyContent: "space-around",
	},
	navItem: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		height: 44,
	},
	navItemFocused: {
		transform: [{ scale: 1.12 }],
	},
	activePill: {
		backgroundColor: "#2563EB",
		paddingHorizontal: 18,
		paddingVertical: 7,
		borderRadius: 12,
		justifyContent: "center",
		alignItems: "center",
	},
	activePillFocused: {
		backgroundColor: "#FF3B30",
		borderColor: "#FFFFFF",
		borderWidth: 1.5,
	},
	inactivePill: {
		paddingHorizontal: 14,
		paddingVertical: 6,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
	},
	inactivePillFocused: {
		backgroundColor: "rgba(255, 59, 48, 0.25)",
		borderColor: "#FF3B30",
		borderWidth: 1.5,
	},

	// --- Okunmamış rozet noktası (TV rayı + telefon barı ortak) ---
	rozetNokta: {
		position: "absolute",
		top: -4,
		right: -7,
		minWidth: 17,
		height: 17,
		borderRadius: 9,
		backgroundColor: "#E50914",
		borderWidth: 1.5,
		borderColor: "#0d0e12",
		paddingHorizontal: 3.5,
		alignItems: "center",
		justifyContent: "center",
	},
	rozetNoktaGenis: {
		borderRadius: 9,
	},
	rozetYazi: {
		color: "#ffffff",
		fontSize: 9.5,
		fontWeight: "800",
	},
});
