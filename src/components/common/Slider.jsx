import { Ionicons } from "@react-native-vector-icons/ionicons";
import React, { useCallback, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import TVPressable from "./TVPressable";

/**
 * Değer kaydırıcısı — mobilde sürükleme, TV'de −/+ düğmeleri.
 *
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @param {number} step
 * @param {(v:number)=>void} onChange
 * @param {string} valueText  sağda gösterilen metin (örn. "6 bağlantı")
 * @param {object} colors  {text, textSecondary, primary, border}
 */
export default function Slider({
	value,
	min = 1,
	max = 16,
	step = 1,
	onChange,
	valueText,
	colors = {},
}) {
	const genislikRef = useRef(0);
	const [dragging, setDragging] = useState(false);
	const text = colors.text || "#ffffff";
	const primary = colors.primary || "#38bdf8";
	const border = colors.border || "rgba(255,255,255,0.12)";

	const clamp = useCallback(
		(v) => {
			const n = Math.round(v / step) * step;
			return Math.min(max, Math.max(min, n));
		},
		[min, max, step],
	);

	// Sürükleme: track üzerindeki konumdan değer.
	const konumdanDeger = useCallback(
		(e) => {
			const gen = genislikRef.current;
			if (!gen) return null;
			const oran = Math.min(1, Math.max(0, e.nativeEvent.locationX / gen));
			return clamp(min + oran * (max - min));
		},
		[clamp, min, max],
	);

	const pct = max > min ? (value - min) / (max - min) : 0;

	return (
		<View style={styles.wrap}>
			<TVPressable
				onPress={() => onChange(clamp(value - step))}
				style={styles.stepBtn}
				focusedStyle={styles.stepBtnFocused}
				accessibilityLabel="Azalt">
				<Ionicons name="remove" size={18} color={text} />
			</TVPressable>

			<View style={styles.trackArea}>
				<View
					style={[styles.track, { backgroundColor: border }]}
					onLayout={(e) => {
						genislikRef.current = e.nativeEvent.layout.width;
					}}
					onStartShouldSetResponder={() => true}
					onMoveShouldSetResponder={() => true}
					onResponderGrant={(e) => {
						setDragging(true);
						const v = konumdanDeger(e);
						if (v !== null) onChange(v);
					}}
					onResponderMove={(e) => {
						const v = konumdanDeger(e);
						if (v !== null) onChange(v);
					}}
					onResponderRelease={() => setDragging(false)}>
					<View
						style={[
							styles.fill,
							{ width: `${pct * 100}%`, backgroundColor: primary },
						]}
					/>
					<View
						style={[
							styles.thumb,
							{
								left: `${pct * 100}%`,
								borderColor: primary,
								transform: [{ translateX: -11 }],
							},
							dragging && { transform: [{ translateX: -11 }, { scale: 1.15 }] },
						]}
					/>
				</View>
			</View>

			<TVPressable
				onPress={() => onChange(clamp(value + step))}
				style={styles.stepBtn}
				focusedStyle={styles.stepBtnFocused}
				accessibilityLabel="Artır">
				<Ionicons name="add" size={18} color={text} />
			</TVPressable>

			<Text style={[styles.value, { color: primary }]}>{valueText}</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	wrap: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
	},
	stepBtn: {
		width: 34,
		height: 34,
		borderRadius: 17,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "rgba(255,255,255,0.06)",
	},
	stepBtnFocused: {
		backgroundColor: "rgba(56,189,248,0.35)",
	},
	trackArea: {
		flex: 1,
		height: 34,
		justifyContent: "center",
	},
	track: {
		height: 6,
		borderRadius: 3,
	},
	fill: {
		height: 6,
		borderRadius: 3,
	},
	thumb: {
		position: "absolute",
		top: -8,
		width: 22,
		height: 22,
		borderRadius: 11,
		borderWidth: 3,
		backgroundColor: "#161922",
	},
	value: {
		minWidth: 82,
		textAlign: "right",
		fontSize: 13,
		fontWeight: "700",
	},
});
