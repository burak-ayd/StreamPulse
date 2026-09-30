import BottomNavigation from "@/components/BottomNavigation";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { Stack, useRouter } from "expo-router";
import React from "react";
import {
	ScrollView,
	StatusBar,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function LibraryScreen() {
	const router = useRouter();

	return (
		<>
			<Stack.Screen options={{ headerShown: false }} />
			<SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
				<StatusBar barStyle="light-content" backgroundColor="#0d0e12" />

				{/* Header */}
				<View style={styles.header}>
					<TouchableOpacity
						onPress={() => router.back()}
						style={styles.backButton}
						activeOpacity={0.7}>
						<Ionicons name="arrow-back" size={24} color="#ffffff" />
					</TouchableOpacity>
					<Text style={styles.headerTitle}>Kitaplık</Text>
					<View style={{ width: 40 }} />
				</View>

				<ScrollView
					contentContainerStyle={styles.scrollContent}
					showsVerticalScrollIndicator={false}>
					{/* Under Construction Banner Card */}
					<View style={styles.underConstructionCard}>
						<View style={styles.iconCircle}>
							<Ionicons
								name="library-outline"
								size={48}
								color="#2563EB"
							/>
						</View>
						<Text style={styles.cardTitle}>
							Kitaplık Yapım Aşamasında
						</Text>
						<Text style={styles.cardSubtitle}>
							Özel oynatma listeleriniz, favori arşiviniz ve
							koleksiyonlarınız için gelişmiş kitaplık modülü çok
							yakında burada olacaktır.
						</Text>
						<View style={styles.badgeRow}>
							<View style={styles.statusBadge}>
								<View style={styles.statusDot} />
								<Text style={styles.statusText}>Geliştiriliyor</Text>
							</View>
						</View>
					</View>

					{/* Quick Links */}
					<View style={styles.section}>
						<Text style={styles.sectionTitle}>Hızlı Erişim</Text>
						<TouchableOpacity
							style={styles.actionCard}
							onPress={() => router.push("/(app)/profile")}
							activeOpacity={0.7}>
							<Ionicons
								name="heart-outline"
								size={22}
								color="#ef4444"
							/>
							<View style={{ flex: 1 }}>
								<Text style={styles.actionTitle}>Favorilerim</Text>
								<Text style={styles.actionSubtitle}>
									Kayıtlı film ve dizilerinizi görün
								</Text>
							</View>
							<Ionicons
								name="chevron-forward"
								size={20}
								color="#6b7280"
							/>
						</TouchableOpacity>

						<TouchableOpacity
							style={styles.actionCard}
							onPress={() => router.push("/(app)/profile")}
							activeOpacity={0.7}>
							<Ionicons
								name="time-outline"
								size={22}
								color="#38bdf8"
							/>
							<View style={{ flex: 1 }}>
								<Text style={styles.actionTitle}>
									İzleme Geçmişi
								</Text>
								<Text style={styles.actionSubtitle}>
									Son izlediğiniz içerikler
								</Text>
							</View>
							<Ionicons
								name="chevron-forward"
								size={20}
								color="#6b7280"
							/>
						</TouchableOpacity>
					</View>
				</ScrollView>

				<BottomNavigation activeRoute="/(app)/library" />
			</SafeAreaView>
		</>
	);
}

const styles = StyleSheet.create({
	safeArea: {
		flex: 1,
		backgroundColor: "#0d0e12",
	},
	header: {
		height: 56,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: 16,
		borderBottomWidth: 1,
		borderBottomColor: "rgba(255, 255, 255, 0.08)",
	},
	backButton: {
		width: 40,
		height: 40,
		justifyContent: "center",
		alignItems: "center",
	},
	headerTitle: {
		color: "#ffffff",
		fontSize: 18,
		fontWeight: "700",
	},
	scrollContent: {
		padding: 20,
		alignItems: "center",
	},
	underConstructionCard: {
		width: "100%",
		backgroundColor: "#161b22",
		borderRadius: 16,
		padding: 28,
		alignItems: "center",
		borderWidth: 1,
		borderColor: "rgba(255, 255, 255, 0.08)",
		marginTop: 20,
	},
	iconCircle: {
		width: 88,
		height: 88,
		borderRadius: 44,
		backgroundColor: "rgba(37, 99, 235, 0.15)",
		justifyContent: "center",
		alignItems: "center",
		marginBottom: 18,
	},
	cardTitle: {
		color: "#ffffff",
		fontSize: 20,
		fontWeight: "700",
		textAlign: "center",
		marginBottom: 10,
	},
	cardSubtitle: {
		color: "#9ca3af",
		fontSize: 14,
		lineHeight: 21,
		textAlign: "center",
		marginBottom: 20,
	},
	badgeRow: {
		flexDirection: "row",
		alignItems: "center",
	},
	statusBadge: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: "rgba(37, 99, 235, 0.2)",
		paddingHorizontal: 14,
		paddingVertical: 6,
		borderRadius: 12,
		gap: 6,
	},
	statusDot: {
		width: 7,
		height: 7,
		borderRadius: 4,
		backgroundColor: "#38bdf8",
	},
	statusText: {
		color: "#38bdf8",
		fontSize: 12,
		fontWeight: "600",
	},
	section: {
		width: "100%",
		marginTop: 28,
	},
	sectionTitle: {
		color: "#ffffff",
		fontSize: 16,
		fontWeight: "700",
		marginBottom: 12,
	},
	actionCard: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: "#161b22",
		padding: 16,
		borderRadius: 12,
		marginBottom: 12,
		gap: 14,
		borderWidth: 1,
		borderColor: "rgba(255, 255, 255, 0.06)",
	},
	actionTitle: {
		color: "#ffffff",
		fontSize: 15,
		fontWeight: "600",
	},
	actionSubtitle: {
		color: "#9ca3af",
		fontSize: 12,
		marginTop: 2,
	},
});
