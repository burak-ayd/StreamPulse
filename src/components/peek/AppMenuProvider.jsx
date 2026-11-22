import TVFocusTrap from "@/components/common/TVFocusTrap";
import { FontFamily, Palette } from "@/constants/theme";
import { useTvMetrics } from "@/utils/tvMetrics";
import { PeekMenuProvider } from "react-native-peek-menu";
import { FullWindowOverlay } from "react-native-screens";
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	BackHandler,
	Modal,
	Platform,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AppMenuList from "./AppMenuList";

/**
 * Uygulamanın menü sağlayıcısı.
 *
 * Telefon/tablet: `react-native-peek-menu` sağlayıcısı. Menü, basılan kartın
 * üstünde açılır; liste görünümü `AppMenuList`.
 *
 * TV: peek menüsü parmak jestine dayanır, kumandada karşılığı yoktur.
 * Bu yüzden TV'de aynı liste, odaklanabilir satırlarla `TVMenuPanel` içinde
 * merkezî bir panel olarak açılır. Menü içeriği (item listesi) iki platformda
 * AYNI; yalnızca açılış biçimi ve ölçek değişir.
 */

const AppMenuContext = createContext({
	open: () => {},
	close: () => {},
});

export function useAppMenu() {
	return useContext(AppMenuContext);
}

const isIOS = Platform.OS === "ios";

export function AppMenuProvider({ children }) {
	const insets = useSafeAreaInsets();
	const [tvMenu, setTvMenu] = useState(null);

	const open = useCallback((menu) => {
		if (!Platform.isTV || !menu) return;
		setTvMenu(menu);
	}, []);

	const close = useCallback(() => setTvMenu(null), []);

	const value = useMemo(() => ({ open, close }), [open, close]);

	return (
		<AppMenuContext.Provider value={value}>
			{Platform.isTV ? (
				<>
					{children}
					<TVMenuPanel menu={tvMenu} onClose={close} />
				</>
			) : (
				<PeekMenuProvider
					safeAreaInsets={insets}
					colorScheme="dark"
					backdropColor="rgba(0, 0, 0, 0.62)"
					renderMenu={({ items, onItemPress }) => (
						<AppMenuList
							items={items}
							onItemPress={onItemPress}
						/>
					)}
					overlayContainer={isIOS ? FullWindowOverlay : undefined}>
					{children}
				</PeekMenuProvider>
			)}
		</AppMenuContext.Provider>
	);
}

function TVMenuPanel({ menu, onClose }) {
	const { sp, width, height } = useTvMetrics();
	const contentRef = useRef(null);

	useEffect(() => {
		if (!menu) return;
		const sub = BackHandler.addEventListener(
			"hardwareBackPress",
			() => {
				onClose();
				return true;
			},
		);
		return () => sub.remove();
	}, [menu, onClose]);

	if (!menu) return null;

	const panelWidth = Math.min(sp(560), width - sp(80));
	// Satırlar 1.12× ölçeklendiği için liste kutusu o orana bölünür;
	// aksi hâlde menü panelin kenarından taşar.
	const scale = 1.12;
	const contentWidth = Math.round((panelWidth - sp(36)) / scale);

	const handleItemPress = (item) => {
		if (item.disabled) return;
		onClose();
		item.onPress?.();
	};

	return (
		<Modal
			transparent
			animationType="fade"
			statusBarTranslucent
			visible
			onRequestClose={onClose}>
			<Pressable style={styles.backdrop} onPress={onClose}>
				<TVFocusTrap
					active
					onDeactivate={onClose}
					contentRef={contentRef}>
					<Pressable
						ref={contentRef}
						style={[
							styles.panel,
							{
								width: panelWidth,
								maxHeight: height * 0.82,
								padding: sp(14),
							},
						]}
						onPress={(e) => e.stopPropagation()}>
						<Text
							style={[
								styles.title,
								{ fontSize: sp(13), marginBottom: sp(8) },
							]}>
							İŞLEMLER
						</Text>
						<View style={{ transform: [{ scale }] }}>
							{menu.render ? (
								<ScrollView
									showsVerticalScrollIndicator={false}
									style={{ maxHeight: height * 0.62 }}>
									{menu.render({
										close: onClose,
										autoFocus: true,
										width: contentWidth,
									})}
								</ScrollView>
							) : (
								<ScrollView
									showsVerticalScrollIndicator={false}
									style={{ maxHeight: height * 0.62 }}>
									<AppMenuList
										items={menu.items}
										onItemPress={handleItemPress}
										autoFocusFirst
										width={contentWidth}
									/>
								</ScrollView>
							)}
						</View>
					</Pressable>
				</TVFocusTrap>
			</Pressable>
		</Modal>
	);
}

const styles = StyleSheet.create({
	backdrop: {
		flex: 1,
		backgroundColor: "rgba(0, 0, 0, 0.72)",
		alignItems: "center",
		justifyContent: "center",
	},
	panel: {
		backgroundColor: Palette.background,
		borderRadius: 22,
		borderWidth: 1,
		borderColor: "rgba(229, 225, 228, 0.12)",
	},
	title: {
		fontFamily: FontFamily.bold,
		letterSpacing: 0.8,
		color: Palette.onSurfaceVariant,
	},
});

export default AppMenuProvider;