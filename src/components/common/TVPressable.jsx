import React, { forwardRef, useState } from "react";
import { Platform, Pressable, StyleSheet } from "react-native";

/**
 * TVPressable
 * Hem dokunmatik mobil cihazlarda hem de Android TV'de kumanda (D-Pad) ile
 * uyumlu çalışan evrensel buton bileşeni.
 */
export const TVPressable = forwardRef(function TVPressable(
	{
		style,
		focusedStyle,
		pressedStyle,
		children,
		autoFocus = false,
		disabled = false,
		onFocus,
		onBlur,
		onPress,
		onLongPress,
		nextFocusUp,
		nextFocusDown,
		nextFocusLeft,
		nextFocusRight,
		...props
	},
	ref,
) {
	const [isFocused, setIsFocused] = useState(false);
	const isTV = Platform.isTV;

	return (
		<Pressable
			ref={ref}
			focusable={!disabled}
			hasTVPreferredFocus={isTV && autoFocus}
			disabled={disabled}
			nextFocusUp={nextFocusUp}
			nextFocusDown={nextFocusDown}
			nextFocusLeft={nextFocusLeft}
			nextFocusRight={nextFocusRight}
			onFocus={(e) => {
				setIsFocused(true);
				onFocus?.(e);
			}}
			onBlur={(e) => {
				setIsFocused(false);
				onBlur?.(e);
			}}
			onPress={onPress}
			onLongPress={onLongPress}
			style={({ pressed }) => {
				const resolvedStyle =
					typeof style === "function"
						? style({ pressed, focused: isFocused })
						: style;

				return [
					resolvedStyle,
					isTV && isFocused && (focusedStyle || styles.defaultFocused),
					pressed && (pressedStyle || styles.defaultPressed),
				];
			}}
			{...props}>
			{({ pressed }) =>
				typeof children === "function"
					? children({ focused: isFocused, pressed })
					: children
			}
		</Pressable>
	);
});

export default TVPressable;

const styles = StyleSheet.create({
	defaultFocused: {
		borderColor: "#E50914",
		borderWidth: 2,
		transform: [{ scale: 1.05 }],
	},
	defaultPressed: {
		opacity: 0.85,
		transform: [{ scale: 0.98 }],
	},
});
