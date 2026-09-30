import React from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useThemeContext } from "@context/ThemeContext";

/**
 * CastSection – Mockup tasarımındaki "Oyuncular" bölümü.
 * Kırmızı accent bar + başlık ve yatay scroll chip'ler.
 *
 * İleride resimli versiyona dönülmek istenirse SHOW_AVATARS = true yapılabilir.
 */
const SHOW_AVATARS = false;

export default function CastSection({ cast }) {
	const { colors, theme } = useThemeContext();

	if (!cast || cast.length === 0) return null;

	const surfaceBg = theme === "dark" ? "#161B24" : "#ffffff";
	const surfaceBorder = theme === "dark" ? "#232A36" : "#E2E8F0";

	return (
		<View style={styles.container}>
			{/* Section Title with red accent bar */}
			<View style={styles.titleRow}>
				<View style={styles.accentBar} />
				<Text style={[styles.sectionTitle, { color: colors.text }]}>
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
					contentContainerStyle={styles.avatarScrollContent}>
					{cast.map((actor, index) => (
						<View
							key={index}
							style={[
								styles.castCard,
								{
									backgroundColor: surfaceBg,
									borderColor: surfaceBorder,
								},
							]}>
							<View
								style={[
									styles.avatar,
									{ backgroundColor: surfaceBorder },
								]}>
								<Ionicons
									name="person"
									size={24}
									color={colors.textSecondary}
								/>
							</View>
							<Text
								style={[styles.actorName, { color: colors.text }]}
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
					contentContainerStyle={styles.chipsScrollContent}>
					{cast.map((actor, index) => (
						<View
							key={index}
							style={[
								styles.actorChip,
								{
									backgroundColor: surfaceBg,
									borderColor: surfaceBorder,
								},
							]}>
							<View style={styles.chipAvatarSmall}>
								<Ionicons
									name="person"
									size={12}
									color={colors.textSecondary}
								/>
							</View>
							<Text
								style={[
									styles.actorChipText,
									{ color: colors.text },
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
	container: {
		marginBottom: 20,
	},
	titleRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		marginBottom: 12,
	},
	accentBar: {
		width: 4,
		height: 22,
		borderRadius: 2,
		backgroundColor: "#E50914",
	},
	sectionTitle: {
		fontSize: 18,
		fontWeight: "700",
		letterSpacing: -0.2,
	},
	/* Sadece isim (chip) stilleri */
	chipsScrollContent: {
		gap: 8,
		paddingRight: 20,
	},
	actorChip: {
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: 10,
		paddingVertical: 7,
		borderRadius: 12,
		borderWidth: 1,
		gap: 6,
	},
	chipAvatarSmall: {
		width: 24,
		height: 24,
		borderRadius: 12,
		backgroundColor: "rgba(148,163,184,0.15)",
		justifyContent: "center",
		alignItems: "center",
	},
	actorChipText: {
		fontSize: 12,
		fontWeight: "600",
	},
	/* Resimli / Avatarlı versiyon stilleri (ilerisi için korundu) */
	avatarScrollContent: {
		gap: 12,
		paddingRight: 20,
	},
	castCard: {
		width: 100,
		alignItems: "center",
		padding: 12,
		borderRadius: 12,
		borderWidth: 1,
	},
	avatar: {
		width: 60,
		height: 60,
		borderRadius: 30,
		justifyContent: "center",
		alignItems: "center",
		marginBottom: 8,
	},
	actorName: {
		fontSize: 12,
		fontWeight: "600",
		textAlign: "center",
		lineHeight: 16,
	},
});
