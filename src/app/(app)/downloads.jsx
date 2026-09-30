import BottomNavigation from "@/components/BottomNavigation";
import { getDownloads } from "@/utils/storage";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { Stack, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
	ScrollView,
	StatusBar,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function DownloadsScreen() {
	const router = useRouter();
	const [downloads, setDownloads] = useState([]);

	useEffect(() => {
		getDownloads().then((items) => {
			setDownloads(items || []);
		});
	}, []);

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
					<Text style={styles.headerTitle}>İndirilenler</Text>
					<View style={{ width: 40 }} />
				</View>

				<ScrollView
					contentContainerStyle={styles.scrollContent}
					showsVerticalScrollIndicator={false}>
					{/* Under Construction Banner Card */}
					<View style={styles.underConstructionCard}>
						<View style={styles.iconCircle}>
							<Ionicons
								name="cloud-download-outline"
								size={48}
								color="#2563EB"
							/>
						</View>
						<Text style={styles.cardTitle}>
							İndirilenler Yapım Aşamasında
						</Text>
						<Text style={styles.cardSubtitle}>
							İnternet bağlantınız olmadığında kesintisiz film ve
							dizi izleyebilmeniz için çevrimdışı indirme altyapısı
							geliştirilmektedir.
						</Text>
						<View style={styles.badgeRow}>
							<View style={styles.statusBadge}>
								<View style={styles.statusDot} />
								<Text style={styles.statusText}>Geliştiriliyor</Text>
							</View>
						</View>
					</View>

					{/* Downloaded items list if any */}
					{downloads.length > 0 && (
						<View style={styles.section}>
							<Text style={styles.sectionTitle}>
								Mevcut İndirmeler ({downloads.length})
							</Text>
							{downloads.map((item, idx) => (
								<View key={item.id || idx} style={styles.itemCard}>
									<Ionicons
										name="videocam-outline"
										size={22}
										color="#38bdf8"
									/>
									<View style={{ flex: 1 }}>
										<Text
											style={styles.itemTitle}
											numberOfLines={1}>
											{item.title}
										</Text>
										<Text style={styles.itemSubtitle}>
											{item.fileSize || "Çevrimdışı Medya"}
										</Text>
									</View>
								</View>
							))}
						</View>
					)}
				</ScrollView>

				<BottomNavigation activeRoute="/(app)/downloads" />
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
		marginTop: 24,
	},
	sectionTitle: {
		color: "#ffffff",
		fontSize: 16,
		fontWeight: "700",
		marginBottom: 12,
	},
	itemCard: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: "#161b22",
		padding: 14,
		borderRadius: 12,
		marginBottom: 10,
		gap: 12,
		borderWidth: 1,
		borderColor: "rgba(255, 255, 255, 0.06)",
	},
	itemTitle: {
		color: "#ffffff",
		fontSize: 14,
		fontWeight: "600",
	},
	itemSubtitle: {
		color: "#9ca3af",
		fontSize: 12,
		marginTop: 2,
	},
});
