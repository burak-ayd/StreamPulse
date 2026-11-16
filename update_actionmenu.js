const fs = require('fs');
let content = fs.readFileSync('src/components/modal/ActionMenuModal.jsx', 'utf8');

// Add useTVFocusRestore and contentRef after the useEffect for BackHandler
const oldHooks = `}, [visible, onClose]);

	if (!visible) return null;`;

const newHooks = `}, [visible, onClose]);

	// TV focus restore for this modal
	const focusRestore = useTVFocusRestore("actionmenu");
	const contentRef = useRef(null);

	if (!visible) return null;`;

content = content.replace(oldHooks, newHooks);

// Wrap the sheet content with TVFocusTrap
const oldReturn = `return (
		<Modal
			visible={visible}
			transparent
			animationType="fade"
			statusBarTranslucent
			onRequestClose={onClose}>
			<Pressable
				style={styles.backdrop}
				onPress={() => {
					if (isTVPressSuppressed()) return;
					onClose?.();
				}}>
				<Pressable
					style={styles.sheet}
					onPress={(e) => e.stopPropagation()}>`;

const newReturn = `return (
		<Modal
			visible={visible}
			transparent
			animationType="fade"
			statusBarTranslucent
			onRequestClose={onClose}>
			<Pressable
				style={styles.backdrop}
				onPress={() => {
					if (isTVPressSuppressed()) return;
					onClose?.();
				}}>
				<TVFocusTrap
					active={visible && Platform.isTV}
					onDeactivate={onClose}
					contentRef={contentRef}>
					<Pressable
						style={styles.sheet}
						onPress={(e) => e.stopPropagation()}>`;

content = content.replace(oldReturn, newReturn);

// Close TVFocusTrap before closing Pressable
const oldEnd = `</Pressable>
			</Pressable>
		</Modal>
	);
}`;

const newEnd = `</Pressable>
				</TVFocusTrap>
			</Pressable>
		</Modal>
	);
}`;

content = content.replace(oldEnd, newEnd);

// Add Platform import
content = content.replace(
	"import React, { useEffect, useRef } from \"react\";",
	"import React, { useEffect, useRef } from \"react\";\nimport { Platform } from \"react-native\";"
);

fs.writeFileSync('src/components/modal/ActionMenuModal.jsx', content);
console.log('Updated ActionMenuModal with TVFocusTrap');