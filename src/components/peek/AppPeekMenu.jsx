import { PeekMenu } from "react-native-peek-menu";
import { Platform } from "react-native";

/**
 * Telefonda peek menüsünün açılabilir hedefi.
 *
 * TV'de peek menüsü yoktur (parmak jesti yok): içerik aynen çizilir,
 * menü kartın kendi `onLongPress`'i üzerinden `useAppMenu().open()` ile
 * merkezî panelde açılır.
 */
export default function AppPeekMenu({
	items = [],
	renderMenu,
	children,
	style,
	activateOn = "hold",
	holdDuration = 320,
	placement,
	alignment,
	disabled = false,
	preview,
}) {
	if (Platform.isTV) return children;

	return (
		<PeekMenu
			items={items}
			renderMenu={renderMenu}
			style={style}
			activateOn={activateOn}
			holdDuration={holdDuration}
			placement={placement}
			alignment={alignment}
			disabled={disabled}
			preview={preview}>
			{children}
		</PeekMenu>
	);
}