const fs = require('fs');
let content = fs.readFileSync('src/components/modal/QuickPreviewModal.jsx', 'utf8');

// Add useTVFocusRestore and contentRef after the existing useState hooks
const oldHooks = `const [isListSelectVisible, setIsListSelectVisible] = useState(false);

const movieId = movie?.id || movie?.url || movie?.title;`;

const newHooks = `const [isListSelectVisible, setIsListSelectVisible] = useState(false);

// TV focus restore for this modal
const focusRestore = useTVFocusRestore("quickpreview");
const contentRef = useRef(null);

const movieId = movie?.id || movie?.url || movie?.title;`;

content = content.replace(oldHooks, newHooks);

// Wrap the Modal content with TVFocusTrap
const oldModalStart = `return (
		<Modal
			visible={visible}
			transparent
			animationType="fade"
			statusBarTranslucent
			onRequestClose={onClose}>
			<Pressable
				style={[
					styles.backdropOverlay,
					isTV && {
						justifyContent: "center",
						alignItems: "center",
						paddingHorizontal: sp(40),
						paddingVertical: sp(24),
					},
				]}
				onPress={() => {
					if (isTVPressSuppressed()) return;
					onClose?.();
				}}>
				<Pressable
					style={[
						styles.sheetContainer,
						isTV && {
							// TV: alt yapışmak yerine ortalanmış, iki kolonlu panel.
							maxWidth: tvPanelMaxWidth,
							width: "100%",
							maxHeight: tvDialogMaxHeight,
							borderTopLeftRadius: sp(22),
							borderTopRightRadius: sp(22),
							borderTopWidth: 0,
							borderWidth: 1,
							borderColor: "rgba(255, 255, 255, 0.14)",
							paddingTop: 0,
							backgroundColor: Palette.surfaceLow,
							shadowOpacity: 0.75,
						},
						// Telefon: daha uzun bottom-sheet, tam yuvarlak üst köşeler.
						isPhone && {
							maxHeight: "92%",
							borderTopLeftRadius: 24,
							borderTopRightRadius: 24,
						},
					]}
					onPress={(e) => e.stopPropagation()}>`;

const newModalStart = `return (
		<Modal
			visible={visible}
			transparent
			animationType="fade"
			statusBarTranslucent
			onRequestClose={onClose}>
			<Pressable
				style={[
					styles.backdropOverlay,
					isTV && {
						justifyContent: "center",
						alignItems: "center",
						paddingHorizontal: sp(40),
						paddingVertical: sp(24),
					},
				]}
				onPress={() => {
					if (isTVPressSuppressed()) return;
					onClose?.();
				}}>
				<TVFocusTrap
					active={visible && isTV}
					onDeactivate={onClose}
					contentRef={contentRef}>
					<Pressable
						style={[
							styles.sheetContainer,
							isTV && {
								// TV: alt yapışmak yerine ortalanmış, iki kolonlu panel.
								maxWidth: tvPanelMaxWidth,
								width: "100%",
								maxHeight: tvDialogMaxHeight,
								borderTopLeftRadius: sp(22),
								borderTopRightRadius: sp(22),
								borderTopWidth: 0,
								borderWidth: 1,
								borderColor: "rgba(255, 255, 255, 0.14)",
								paddingTop: 0,
								backgroundColor: Palette.surfaceLow,
								shadowOpacity: 0.75,
							},
							// Telefon: daha uzun bottom-sheet, tam yuvarlak üst köşeler.
							isPhone && {
								maxHeight: "92%",
								borderTopLeftRadius: 24,
								borderTopRightRadius: 24,
							},
						},
					]}
						onPress={(e) => e.stopPropagation()}>`;

content = content.replace(oldModalStart, newModalStart);

// Close TVFocusTrap before ListSelectModal
const oldEnd = `				</Pressable>
			</Pressable>

			{/* Liste Seçim Modalı */}
			<ListSelectModal
				visible={isListSelectVisible}
				movie={currentItem}
				onClose={() => setIsListSelectVisible(false)}
				onStatusChanged={(newStatus, newFav) => {
					setActiveStatus(newStatus);
					if (newFav !== undefined) setIsFav(newFav);
				}}
			/>
		</Modal>
	);
}`;

const newEnd = `				</Pressable>
			</TVFocusTrap>
			</Pressable>

			{/* Liste Seçim Modalı */}
			<ListSelectModal
				visible={isListSelectVisible}
				movie={currentItem}
				onClose={() => setIsListSelectVisible(false)}
				onStatusChanged={(newStatus, newFav) => {
					setActiveStatus(newStatus);
					if (newFav !== undefined) setIsFav(newFav);
				}}
			/>
		</Modal>
	);
}`;

content = content.replace(oldEnd, newEnd);

fs.writeFileSync('src/components/modal/QuickPreviewModal.jsx', content);
console.log('Updated QuickPreviewModal with TVFocusTrap');