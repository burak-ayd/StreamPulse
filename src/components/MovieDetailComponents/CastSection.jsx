import React from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useThemeContext } from "@context/ThemeContext";
import { useTvMetrics } from "@/utils/tvMetrics";

/**
 * CastSection – Mockup tasarımındaki "Oyuncular" bölümü.
 * Kırmızı accent bar + başlık ve yatay scroll chip'ler.
 *
 * İleride resimli versiyona dönülmek istenirse SHOW_AVATARS = true yapılabilir.
 */
const SHOW_AVATARS = false;

export default function CastSection({ cast }) {
	const { colors, theme } = useThemeContext();
	const { sp, gutter } = useTvMetrics();

	if (!cast || cast.length === 0) return null;

	const surfaceBg = theme === "dark" ? "#161B24" : "#ffffff";
	const surfaceBorder = theme === "dark" ? "#232A36" : "#E2E8F0";

	return (
		<View style={[styles.container, { marginBottom: sp(24) }]}>
			{/* Section Title with red accent bar */}
			<View
				style={[styles.titleRow, { gap: sp(12), marginBottom: sp(14) }]}>
				<View
					style={[
						styles.accentBar,
						{ width: sp(5), height: sp(26), borderRadius: sp(3) },
					]}
				/>
				<Text
					style={[
						styles.sectionTitle,
						{ color: colors.text, fontSize: sp(21) },
					]}>
					Oyuncular
				</Text>
			</View>

			{SHOW_AVATARS ? (
				/* ======================================================== */
				/* 1. RESİMLİ / AVATARLI VERSİYON (Gerektiğinde açılabilir)  */
				/* ======================================================== */
				<ScrollView
					horizontal
					showsHorizontalScrollIndicator={false}
					contentContainerStyle={[
						styles.avatarScrollContent,
						{ gap: sp(14), paddingRight: 20 + gutter },
					]}>
					{cast.map((actor, index) => (
						<View
							key={index}
							style={[
								styles.castCard,
								{
									backgroundColor: surfaceBg,
									borderColor: surfaceBorder,
									width: sp(120),
									padding: sp(14),
									borderRadius: sp(14),
								},
							]}>
							<View
								style={[
									styles.avatar,
									{
										backgroundColor: surfaceBorder,
										width: sp(70),
										height: sp(70),
										borderRadius: sp(35),
										marginBottom: sp(10),
									},
								]}>
								<Ionicons
									name="person"
									size={sp(30)}
									color={colors.textSecondary}
								/>
							</View>
							<Text
								style={[
									styles.actorName,
									{ color: colors.text, fontSize: sp(13) },
								]}
								numberOfLines={2}>
								{actor}
							</Text>
						</View>
					))}
				</ScrollView>
			) : (
				/* ======================================================== */
				/* 2. SADECE OYUNCU İSİMLERİ (Modern Chip / Rozet Versiyonu) */
				/* ======================================================== */
				<ScrollView
					horizontal
					showsHorizontalScrollIndicator={false}
					contentContainerStyle={[
						styles.chipsScrollContent,
						{ gap: sp(10), paddingRight: 20 + gutter },
					]}>
					{cast.map((actor, index) => (
						<View
							key={index}
							style={[
								styles.actorChip,
								{
									backgroundColor: surfaceBg,
									borderColor: surfaceBorder,
									paddingHorizontal: sp(14),
									paddingVertical: sp(10),
									borderRadius: sp(14),
									gap: sp(8),
								},
							]}>
							<View
								style={[
									styles.chipAvatarSmall,
									{
										width: sp(30),
										height: sp(30),
										borderRadius: sp(15),
									},
								]}>
								<Ionicons
									name="person"
									size={sp(16)}
									color={colors.textSecondary}
								/>
							</View>
							<Text
								style={[
									styles.actorChipText,
									{ color: colors.text, fontSize: sp(15) },
								]}>
								{actor}
							</Text>
						</View>
					))}
				</ScrollView>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	container: {},
	titleRow: {
		flexDirection: "row",
		alignItems: "center",
	},
	accentBar: {
		backgroundColor: "#E50914",
	},
	sectionTitle: {
		fontWeight: "700",
		letterSpacing: -0.2,
	},
	/* Sadece isim (chip) stilleri */
	chipsScrollContent: {},
	actorChip: {
		flexDirection: "row",
		alignItems: "center",
		borderWidth: 1,
	},
	chipAvatarSmall: {
		backgroundColor: "rgba(148,163,184,0.15)",
		justifyContent: "center",
		alignItems: "center",
	},
	actorChipText: {
		fontWeight: "600",
	},
	/* Resimli / Avatarlı versiyon stilleri (ilerisi için korundu) */
	avatarScrollContent: {},
	castCard: {
		alignItems: "center",
		borderWidth: 1,
	},
	avatar: {
		justifyContent: "center",
		alignItems: "center",
	},
	actorName: {
		fontWeight: "600",
		textAlign: "center",
	},
});
