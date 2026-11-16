const fs = require('fs');
let content = fs.readFileSync('src/components/modal/Bottomsheetmodal.jsx', 'utf8');

const oldReturn = `if (!visible) return null;

	return (
		<Modal
			transparent
			animationType="none"
			visible={visible}
			onRequestClose={onClose}
			statusBarTranslucent>
			{/* Backdrop */}
			<Animated.View
				style={[
					styles.backdrop,
					{
						opacity: backdropOpacity.interpolate({
							inputRange: [0, 1],
							outputRange: [0, opacity],
						}),
					},
				]}>
				<Pressable
					style={StyleSheet.absoluteFill}
					onPress={closeOnBackdrop ? onClose : undefined}
				/>
			</Animated.View>

			{/* Sheet */}
			<View style={StyleSheet.absoluteFill} pointerEvents="box-none">
				<Animated.View
					onLayout={handleLayout}
					style={[
						styles.sheet,
						isTV && styles.sheetTv,
						{
							bottom: -altTasma,
							...(isAuto
								? {
										maxHeight: SCREEN_HEIGHT * 0.85,
										paddingBottom: altTasma,
									}
								: { height: sheetHeight + altTasma }),
						},
						{ transform: [{ translateY }] },
					]}
					{...panResponder.panHandlers}>
					{/* Drag handle — telefonda var, TV'de anlamsız */}
					{handle && !isTV ? (
						<View style={styles.handleContainer}>
							<View style={styles.handle} />
						</View>
					) : null}

					{/* Başlık */}
					{title ? (
						<View style={styles.titleRow}>
							<Text style={styles.titleText}>{title}</Text>
						</View>
					) : null}

					{/* İçerik — alt boşluk kasıtlı olarak dar.
					    Panel artık \`altTasma\` kadar ekranın altına taşıyor
					    (bkz. \`altTasma\`), buraya da tam inset kadar pay
					    verilirse son kart navigasyon çubuğunun arkasına
					    gömülür. Çubuk yokken 10dp: son kart ekranın
					kabına yapışmasın diye yeterli, "kalın ölü şerit" de bırakmıyor. */}
					<View
						style={[
							styles.content,
							isAuto && styles.autoContent,
							{ paddingBottom: Math.max(insets.bottom, 10) },
						]}>
						{children}
					</View>
				</Animated.View>
			</View>
		</Modal>
	);
};`;

const newReturn = `if (!visible) return null;

	// TV focus restore for this modal
	const focusRestore = useTVFocusRestore("bottomsheet");
	const contentRef = useRef(null);

	return (
		<Modal
			transparent
			animationType="none"
			visible={visible}
			onRequestClose={onClose}
			statusBarTranslucent>
			{/* Backdrop */}
			<Animated.View
				style={[
					styles.backdrop,
					{
						opacity: backdropOpacity.interpolate({
							inputRange: [0, 1],
							outputRange: [0, opacity],
						}),
					},
				]}>
				<Pressable
					style={StyleSheet.absoluteFill}
					onPress={closeOnBackdrop ? onClose : undefined}
				/>
			</Animated.View>

			{/* Sheet with TV Focus Trap */}
			<TVFocusTrap
				active={visible && isTV}
				onDeactivate={onClose}
				contentRef={contentRef}>
				<View style={StyleSheet.absoluteFill} pointerEvents="box-none">
					<Animated.View
						onLayout={handleLayout}
						ref={contentRef}
						style={[
							styles.sheet,
							isTV && styles.sheetTv,
							{
								bottom: -altTasma,
								...(isAuto
									? {
											maxHeight: SCREEN_HEIGHT * 0.85,
											paddingBottom: altTasma,
										}
									: { height: sheetHeight + altTasma }),
							},
							{ transform: [{ translateY }] },
						]}
						{...panResponder.panHandlers}>
						{/* Drag handle — telefonda var, TV'de anlamsız */}
						{handle && !isTV ? (
							<View style={styles.handleContainer}>
								<View style={styles.handle} />
							</View>
						) : null}

						{/* Başlık */}
						{title ? (
							<View style={styles.titleRow}>
								<Text style={styles.titleText}>{title}</Text>
							</View>
						) : null}

						{/* İçerik — alt boşluk kasıtlı olarak dar.
						    Panel artık \`altTasma\` kadar ekranın altına taşıyor
						    (bkz. \`altTasma\`), buraya da tam inset kadar pay
						    verilirse son kart navigasyon çubuğunun arkasına
						    gömülür. Çubuk yokken 10dp: son kart ekranın
						kabına yapışmasın diye yeterli, "kalın ölü şerit" de bırakmıyor. */}
						<View
							style={[
								styles.content,
								isAuto && styles.autoContent,
								{ paddingBottom: Math.max(insets.bottom, 10) },
							]}>
							{children}
						</View>
					</Animated.View>
				</View>
			</TVFocusTrap>
		</Modal>
	);
};`;

content = content.replace(oldReturn, newReturn);

fs.writeFileSync('src/components/modal/Bottomsheetmodal.jsx', content);
console.log('Updated BottomSheetModal with TVFocusTrap');