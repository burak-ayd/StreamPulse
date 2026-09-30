import React from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useThemeContext } from "@context/ThemeContext";

/**
 * Oyuncular Bölümü
 * İleride resimli versiyona dönülmek istenirse SHOW_AVATARS = true yapılabilir.
 * Kullanıcı isteği doğrultusunda şu an sadece oyuncu isimleri (chipler) gösterilmektedir.
 */
const SHOW_AVATARS = false;

export default function CastSection({ cast }) {
	const { colors } = useThemeContext();

	if (!cast || cast.length === 0) return null;

	return (
		<View style={styles.container}>
			<Text style={[styles.sectionTitle, { color: colors.text }]}>
				Oyuncular
			</Text>

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
									backgroundColor: colors.cardBg,
									borderColor: colors.border,
								},
							]}>
							<View
								style={[
									styles.avatar,
									{ backgroundColor: colors.border },
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
									backgroundColor: colors.cardBg,
									borderColor: colors.border,
								},
							]}>
							<Ionicons
								name="person-outline"
								size={13}
								color={colors.primary}
								style={styles.actorChipIcon}
							/>
							<Text
								style={[styles.actorChipText, { color: colors.text }]}>
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
		marginBottom: 24,
	},
	sectionTitle: {
		fontSize: 18,
		fontWeight: "700",
		marginBottom: 12,
	},
	/* Sadece isim (chip) stilleri */
	chipsScrollContent: {
		gap: 8,
		paddingRight: 20,
	},
	actorChip: {
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: 12,
		paddingVertical: 7,
		borderRadius: 20,
		borderWidth: 1,
	},
	actorChipIcon: {
		marginRight: 6,
	},
	actorChipText: {
		fontSize: 13,
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
