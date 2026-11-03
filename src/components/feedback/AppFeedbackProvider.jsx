/**
 * Uygulama geri bildirim katmanı — onay diyaloğu (alert) + toast.
 *
 * Neden tek dosya: `Alert.alert` yerine hem tasarıma uygun bir onay kartı
 * hem de toast gerekiyordu; iki ayrı provider açmak kök düzeni gereksiz
 * kalabalıklaştırıyordu.
 *
 * Kullanım:
 *   const { alert, toast } = useFeedback();
 *   alert({ title, message, confirmText, cancelText, destructive, onConfirm });
 *   toast.error("İndirme başlatılamadı");
 *
 * `alert` bir Promise döndürür (true = onaylandı). Çoğu çağrı yeri
 * `onConfirm` kullanır; Promise yalnız `await` etmek isteyenler için.
 */

import TVPressable from "@/components/common/TVPressable";
import { FontFamily, Palette } from "@/constants/theme";
import React, {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { Animated, Modal, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@react-native-vector-icons/ionicons";

const FeedbackContext = createContext(null);

/**
 * Provider ağacının DIŞINDAN `useFeedback()` çağrılırsa dönen sessiz yedek.
 *
 * ⚠️ Neden var: uygulama açılışında provider'ın ÜSTÜNDE çalışan bir kancadan
 * (ör. RootLayout içindeki `useOtaUpdate`) geri bildirim istenirse fırlatılan
 * hata tüm uygulamayı beyaz ekrana düşürüyordu. Geri bildirim kaybolsun,
 * uygulama açılsın.
 */
const FALLBACK_FEEDBACK = {
	alert: () => Promise.resolve(false),
	toast: {
		show: () => {},
		success: () => {},
		error: () => {},
		warning: () => {},
		info: () => {},
	},
};

const TOAST_MS = 2600;

const TOAST_STYLE = {
	success: { icon: "checkmark-circle", color: Palette.secondary },
	error: { icon: "alert-circle", color: Palette.error },
	warning: { icon: "warning", color: Palette.tertiary },
	info: { icon: "information-circle", color: Palette.primary },
};

export function AppFeedbackProvider({ children }) {
	/* ── Onay diyaloğu ─────────────────────────────────────── */
	const [dialog, setDialog] = useState(null);
	const resolverRef = useRef(null);

	const close = useCallback((result) => {
		setDialog(null);
		const resolve = resolverRef.current;
		resolverRef.current = null;
		resolve?.(result);
	}, []);

	const alert = useCallback((options) => {
		return new Promise((resolve) => {
			resolverRef.current = resolve;
			setDialog({
				title: options?.title || "Onay",
				message: options?.message || "",
				confirmText: options?.confirmText || "Tamam",
				cancelText: options?.cancelText || null,
				destructive: Boolean(options?.destructive),
				onConfirm: options?.onConfirm,
			});
		});
	}, []);

	const confirm = useCallback(() => {
		const handler = dialog?.onConfirm;
		close(true);
		handler?.();
	}, [dialog, close]);

	/* ── Toast ─────────────────────────────────────────────── */
	const [toastState, setToastState] = useState(null);
	const [opacity] = useState(() => new Animated.Value(0));
	const timerRef = useRef(null);

	const toast = useCallback((message, type = "info") => {
		if (!message) return;
		setToastState({ message: String(message), type });
	}, []);

	useEffect(() => {
		if (!toastState) return undefined;
		opacity.setValue(0);
		Animated.timing(opacity, {
			toValue: 1,
			duration: 160,
			useNativeDriver: true,
		}).start();
		timerRef.current = setTimeout(() => {
			Animated.timing(opacity, {
				toValue: 0,
				duration: 200,
				useNativeDriver: true,
			}).start(({ finished }) => {
				if (finished) setToastState(null);
			});
		}, TOAST_MS);
		return () => {
			if (timerRef.current) clearTimeout(timerRef.current);
		};
	}, [toastState, opacity]);

	const toastApi = useMemo(
		() => ({
			show: (message) => toast(message, "info"),
			success: (message) => toast(message, "success"),
			error: (message) => toast(message, "error"),
			warning: (message) => toast(message, "warning"),
			info: (message) => toast(message, "info"),
		}),
		[toast],
	);

	const value = useMemo(
		() => ({ alert, toast: toastApi }),
		[alert, toastApi],
	);

	const toastMeta = toastState ? TOAST_STYLE[toastState.type] : null;

	return (
		<FeedbackContext.Provider value={value}>
			<View style={styles.host}>
				<View style={styles.content}>{children}</View>

				{/* Toast — dokunuşu engellemez, içeriğin üstünde yüzer. */}
				{toastState ? (
					<Animated.View
						pointerEvents="none"
						style={[styles.toast, { opacity }]}>
						<Ionicons
							name={toastMeta.icon}
							size={16}
							color={toastMeta.color}
						/>
						<Text style={styles.toastText} numberOfLines={2}>
							{toastState.message}
						</Text>
					</Animated.View>
				) : null}

				<Modal
					visible={Boolean(dialog)}
					transparent
					animationType="fade"
					onRequestClose={() => close(false)}>
					<View style={styles.backdrop}>
						<View style={styles.card}>
							<View
								style={[
									styles.iconCircle,
									dialog?.destructive && styles.iconCircleDanger,
								]}>
								<Ionicons
									name={
										dialog?.destructive
											? "warning"
											: "help-circle"
									}
									size={20}
									color={
										dialog?.destructive
											? Palette.error
											: Palette.primary
									}
								/>
							</View>

							<Text style={styles.title} numberOfLines={2}>
								{dialog?.title}
							</Text>
							{dialog?.message ? (
								<Text style={styles.message} numberOfLines={4}>
									{dialog.message}
								</Text>
							) : null}

							<View style={styles.actions}>
								{dialog?.cancelText ? (
									<TVPressable
										onPress={() => close(false)}
										focusedStyle={null}
										style={({ focused }) => [
											styles.btn,
											styles.btnGhost,
											focused && styles.btnFocused,
										]}>
										<Text style={styles.btnGhostText}>
											{dialog.cancelText}
										</Text>
									</TVPressable>
								) : null}

								<TVPressable
									onPress={confirm}
									autoFocus
									focusedStyle={null}
									style={({ focused }) => [
										styles.btn,
										dialog?.destructive
											? styles.btnDanger
											: styles.btnPrimary,
										focused && styles.btnFocused,
									]}>
									<Text style={styles.btnText}>
										{dialog?.confirmText}
									</Text>
								</TVPressable>
							</View>
						</View>
					</View>
				</Modal>
			</View>
		</FeedbackContext.Provider>
	);
}

export function useFeedback() {
	const ctx = useContext(FeedbackContext);
	return ctx || FALLBACK_FEEDBACK;
}

const styles = StyleSheet.create({
	host: {
		flex: 1,
	},
	content: {
		flex: 1,
	},

	toast: {
		position: "absolute",
		left: 16,
		right: 16,
		bottom: 88,
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		paddingHorizontal: 14,
		paddingVertical: 11,
		borderRadius: 12,
		backgroundColor: Palette.surfaceHigh,
		alignSelf: "center",
		maxWidth: 520,
	},
	toastText: {
		flex: 1,
		color: Palette.onSurface,
		fontFamily: FontFamily.medium,
		fontSize: 12,
	},

	backdrop: {
		flex: 1,
		backgroundColor: "rgba(0, 0, 0, 0.62)",
		alignItems: "center",
		justifyContent: "center",
		padding: 24,
	},
	card: {
		width: "100%",
		maxWidth: 380,
		backgroundColor: Palette.surfaceLow,
		borderRadius: 20,
		padding: 20,
		gap: 8,
		borderWidth: 1,
		borderColor: "rgba(229, 225, 228, 0.08)",
	},
	iconCircle: {
		width: 36,
		height: 36,
		borderRadius: 18,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "rgba(192, 193, 255, 0.14)",
		marginBottom: 2,
	},
	iconCircleDanger: {
		backgroundColor: "rgba(255, 180, 171, 0.14)",
	},
	title: {
		color: Palette.onSurface,
		fontFamily: FontFamily.bold,
		fontSize: 16,
		letterSpacing: -0.2,
	},
	message: {
		color: Palette.onSurfaceVariant,
		fontFamily: FontFamily.regular,
		fontSize: 13,
		lineHeight: 18,
	},
	actions: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "flex-end",
		gap: 8,
		marginTop: 8,
	},
	btn: {
		paddingHorizontal: 16,
		paddingVertical: 10,
		borderRadius: 18,
		borderWidth: 2,
		borderColor: "transparent",
	},
	btnGhost: {
		backgroundColor: Palette.surfaceHigh,
	},
	btnPrimary: {
		backgroundColor: Palette.primaryContainer,
	},
	btnDanger: {
		backgroundColor: "rgba(255, 180, 171, 0.16)",
	},
	btnFocused: {
		borderColor: Palette.primary,
	},
	btnText: {
		color: Palette.onPrimaryContainer,
		fontFamily: FontFamily.bold,
		fontSize: 13,
	},
	btnGhostText: {
		color: Palette.onSurface,
		fontFamily: FontFamily.semiBold,
		fontSize: 13,
	},
});
