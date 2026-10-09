import { Ionicons } from "@react-native-vector-icons/ionicons";
import { StyleSheet, Text, View } from "react-native";

/** `mm:ss` / `hh:mm:ss` biçimlendirici (CloudStream `convertTimeToString`). */
function fmt(seconds) {
	if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
	const total = Math.floor(seconds);
	const h = Math.floor(total / 3600);
	const m = Math.floor((total % 3600) / 60);
	const s = total % 60;
	const pad = (n) => (n < 10 ? `0${n}` : `${n}`);
	return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/**
 * Yatay sürükleme sırasında gösterilen seek önizlemesi.
 *
 * YouTube/Netflix davranışı: hedef zaman ortada büyük, fark (±) yanında
 * küçük ve renkli gösterilir. `delta` 1 saniyenin altındaysa işaret
 * gösterilmez (CloudStream `forceLetters` / `seek_preview` kuralı).
 */
export default function SwipeSeekPreview({ info, currentTime, duration }) {
	if (!info) return null;

	const delta = info.delta;
	const showDelta = Math.abs(delta) >= 1;
	const forward = delta >= 0;

	return (
		<View style={styles.container} pointerEvents="none">
			<View style={styles.box}>
				<Ionicons
					name={
						forward
							? "play-forward-circle-outline"
							: "play-back-circle-outline"
					}
					size={44}
					color={forward ? "#FFFFFF" : "#FFFFFF"}
				/>

				<Text style={styles.target}>{fmt(info.position)}</Text>

				{showDelta ? (
					<Text
						style={[
							styles.delta,
							{ color: forward ? "#4ADE80" : "#F87171" },
						]}>
						{`${forward ? "+" : "−"}${fmt(Math.abs(delta))}`}
					</Text>
				) : null}

				<Text style={styles.total}>{`/ ${fmt(duration)}`}</Text>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		...StyleSheet.absoluteFill,
		alignItems: "center",
		justifyContent: "center",
		zIndex: 14,
	},
	box: {
		alignItems: "center",
		backgroundColor: "rgba(0, 0, 0, 0.82)",
		paddingHorizontal: 28,
		paddingVertical: 22,
		borderRadius: 16,
		gap: 4,
	},
	target: {
		color: "#FFFFFF",
		fontSize: 28,
		fontWeight: "700",
		marginTop: 6,
		fontVariant: ["tabular-nums"],
	},
	delta: {
		fontSize: 16,
		fontWeight: "700",
		fontVariant: ["tabular-nums"],
	},
	total: {
		color: "#8E8E93",
		fontSize: 12,
		fontWeight: "500",
	},
});
