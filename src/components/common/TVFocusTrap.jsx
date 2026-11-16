import React, { useEffect, useRef, useImperativeHandle, forwardRef } from "react";
import { Platform, UIManager, findNodeHandle, Pressable, StyleSheet } from "react-native";

/**
 * TVFocusTrap — Modal/overlay açıldığında odak içinde tutar.
 * Kapandığında eski odağa geri döner.
 *
 * Android TV'de native "window focus" kavramı yok — RN tarafında
 * backdrop'u focusable=false yapıp, içerik alanının ilk öğesine
 * hasTVPreferredFocus vermek gerekir.
 *
 * @param {object} props
 * @param {boolean} props.active - Tuzağın aktif olup olmadığı
 * @param {React.ReactNode} props.children - Tuzak içindeki içerik
 * @param {function} [props.onDeactivate] - Tuzak kapatıldığında çağrılır
 * @param {React.RefObject} [props.contentRef] - İçerik alanının ref'i (ilk odaklanabilir öğe için)
 */
const TVFocusTrap = forwardRef(function TVFocusTrap({ active, children, onDeactivate, contentRef }, ref) {
	const previousFocusRef = useRef(null);
	const trapActiveRef = useRef(active);

	// Ref üzerinden dışarıya savePreviousFocus ve focusFirstContent aç
	useImperativeHandle(ref, () => ({
		savePreviousFocus: (nativeTag) => {
			if (nativeTag != null) {
				previousFocusRef.current = nativeTag;
			}
		},
		focusFirstContent: () => {
			if (contentRef?.current) {
				const tag = findNodeHandle(contentRef.current);
				if (tag != null) {
					UIManager.dispatchViewManagerCommand(tag, "requestTVFocus", []);
				}
			}
		},
	}), [contentRef]);

	useEffect(() => {
		trapActiveRef.current = active;
	}, [active]);

	// Tuzak kapatılıyorsa, eski odağı geri yükle
	useEffect(() => {
		if (!active && previousFocusRef.current && Platform.isTV) {
			UIManager.dispatchViewManagerCommand(
				previousFocusRef.current,
				"requestTVFocus",
				[]
			);
		}
	}, [active]);

	// Tuzak aktif olduğunda ilk içeriğe odak ver
	useEffect(() => {
		if (active && Platform.isTV) {
			const timer = setTimeout(() => {
				if (contentRef?.current) {
					const tag = findNodeHandle(contentRef.current);
					if (tag != null) {
						UIManager.dispatchViewManagerCommand(tag, "requestTVFocus", []);
					}
				}
			}, 50);
			return () => clearTimeout(timer);
		}
	}, [active, contentRef]);

	return (
		<>
			{children}
		</>
	);
});

const styles = StyleSheet.create({
	backdrop: {
		...StyleSheet.absoluteFill,
		backgroundColor: "transparent",
	},
});

TVFocusTrap.displayName = "TVFocusTrap";

export default TVFocusTrap;