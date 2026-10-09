import React from "react";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { Modal, StyleSheet, Text, View } from "react-native";
import TVPressable from "@/components/common/TVPressable";
import { PLAYBACK_RATES } from "./constants";

/**
 * Oynatma hızı seçici (CloudStream `speed_dialog.xml` karşılığı).
 *
 * ⚠️ Kapsam: yalnızca SEÇİM yapar. Hızı `onSelect` ile dışarı verir;
 * oynatıcı `rate` prop'unu kendisi yönetir. Böylece ayar hem kalıcı
 * (storage) hem de oturumluk (state) olarak tek yerden yönetilir.
 */
export default function SpeedSheet({ visible, currentRate, onSelect, onClose }) {
	// Slider yerine hazır hız listesi: TV kumandasında `onChangeValue`
	// çalışmadığı için kumandayla gezilemeyen bir kontrol sunmamak yerine
	// doğrudan odaklanabilir düğmeler veriyoruz.
	const rates = PLAYBACK_RATES;

	return (
		<Modal
			visible={visible}
			transparent
			animationType="fade"
			onRequestClose={onClose}>
			<View style={styles.backdrop}>
				<View style={styles.sheet}>
					<Text style={styles.title}>Oynatma Hızı</Text>

					<View style={styles.grid}>
						{rates.map((rate) => {
							const active = Math.abs(rate - currentRate) < 0.01;
							return (
								<TVPressable
									key={rate}
									style={[styles.rateButton, active && styles.rateButtonActive]}
									focusedStyle={styles.rateButtonFocused}
									onPress={() => onSelect(rate)}>
									<Text
										style={[
											styles.rateText,
											active && styles.rateTextActive,
										]}>
										{rate === 1 ? "Normal" : `${rate}×`}
									</Text>
									{active ? (
										<Ionicons
											name="checkmark"
											size={14}
											color="#FF3B30"
											style={styles.checkmark}
										/>
									) : null}
								</TVPressable>
							);
						})}
					</View>

					<TVPressable
						style={styles.closeButton}
						focusedStyle={styles.closeButtonFocused}
						onPress={onClose}>
						<Text style={styles.closeText}>Kapat</Text>
					</TVPressable>

					<Text style={styles.hint}>
						Video üzerinde uzun basılı tutarak geçici olarak 2× hıza
						geçebilirsiniz.
					</Text>
				</View>
			</View>
		</Modal>
	);
}

const styles = StyleSheet.create({
	backdrop: {
		flex: 1,
		backgroundColor: "rgba(0, 0, 0, 0.75)",
		justifyContent: "center",
		alignItems: "center",
	},
	sheet: {
		width: "70%",
		maxWidth: 520,
		backgroundColor: "#14161C",
		borderRadius: 20,
		padding: 24,
		borderWidth: 1,
		borderColor: "rgba(255, 59, 48, 0.35)",
	},
	title: {
		color: "#FFFFFF",
		fontSize: 18,
		fontWeight: "700",
		marginBottom: 18,
		textAlign: "center",
	},
	grid: {
		flexDirection: "row",
		flexWrap: "wrap",
		justifyContent: "center",
		gap: 10,
	},
	rateButton: {
		minWidth: 92,
		paddingVertical: 12,
		paddingHorizontal: 16,
		borderRadius: 12,
		backgroundColor: "rgba(255, 255, 255, 0.08)",
		alignItems: "center",
		justifyContent: "center",
		borderWidth: 1.5,
		borderColor: "transparent",
	},
	rateButtonActive: {
		backgroundColor: "rgba(255, 59, 48, 0.22)",
		borderColor: "#FF3B30",
	},
	rateButtonFocused: {
		backgroundColor: "rgba(255, 59, 48, 0.35)",
		borderColor: "#FFFFFF",
	},
	rateText: {
		color: "#FFFFFF",
		fontSize: 15,
		fontWeight: "600",
	},
	rateTextActive: {
		color: "#FF6B60",
	},
	checkmark: {
		position: "absolute",
		right: 8,
		top: 6,
	},
	closeButton: {
		marginTop: 20,
		paddingVertical: 12,
		borderRadius: 12,
		backgroundColor: "rgba(255, 255, 255, 0.1)",
		alignItems: "center",
	},
	closeButtonFocused: {
		backgroundColor: "rgba(255, 59, 48, 0.35)",
	},
	closeText: {
		color: "#FFFFFF",
		fontSize: 14,
		fontWeight: "600",
	},
	hint: {
		color: "#8E8E93",
		fontSize: 12,
		textAlign: "center",
		marginTop: 14,
		lineHeight: 18,
	},
});