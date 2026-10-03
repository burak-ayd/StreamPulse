import { Ionicons } from "@react-native-vector-icons/ionicons";
import React from "react";
import {
	Modal,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import TVPressable from "../common/TVPressable";

/**
 * TrackSelectionModal
 * Allows switching between:
 * - Video Sources (Close, Rapidrame, VidMoly, etc.)
 * - Subtitles (External VTT/SRT or stream subtitles)
 * - Audio Tracks (Dubbing / Multi-audio)
 */
export default function TrackSelectionModal({
	visible,
	onClose,
	type = "sources", // 'sources' | 'subtitles' | 'audio'
	sources = [],
	selectedSourceIndex = 0,
	onSelectSource,
	subtitles = [],
	selectedSubtitle = null, // null = disabled, or object { title, uri, ... }
	onSelectSubtitle,
	subtitleOffset = 0,
	onUpdateSubtitleOffset,
	audioTracks = [],
	selectedAudioTrack = null, // null = auto/default, or index
	onSelectAudioTrack,
}) {
	const insets = useSafeAreaInsets();

	if (!visible) return null;

	const getTitle = () => {
		switch (type) {
			case "sources":
				return "Video Kaynağı Seç";
			case "subtitles":
				return "Altyazı Seçimi";
			case "audio":
				return "Ses / Dublaj Seçimi";
			default:
				return "Seçenekler";
		}
	};

	const getIcon = () => {
		switch (type) {
			case "sources":
				return "server-outline";
			case "subtitles":
				return "chatbubble-ellipses-outline";
			case "audio":
				return "volume-high-outline";
			default:
				return "options-outline";
		}
	};

	return (
		<Modal
			visible={visible}
			transparent
			animationType="slide"
			onRequestClose={onClose}>
			<View style={styles.backdrop}>
				<Pressable style={styles.dismissArea} onPress={onClose} />
				<View
					style={[
						styles.sheetContainer,
						{ paddingBottom: Math.max(insets.bottom, 20) },
					]}>
					{/* Header */}
					<View style={styles.header}>
						<View style={styles.headerLeft}>
							<Ionicons
								name={getIcon()}
								size={22}
								color="#FF3B30"
								style={styles.headerIcon}
							/>
							<Text style={styles.headerTitle}>{getTitle()}</Text>
						</View>
						<TVPressable
							onPress={onClose}
							hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
							style={styles.closeButton}
							focusedStyle={styles.closeButtonFocused}>
							<Ionicons name="close" size={22} color="#8E8E93" />
						</TVPressable>
					</View>

					{/* Options Content */}
					<ScrollView
						style={styles.contentList}
						showsVerticalScrollIndicator={false}>
						{/* 1. SOURCES SELECTION */}
						{type === "sources" && (
							<View>
								{sources.length === 0 ? (
									<Text style={styles.emptyText}>
										Kullanılabilir video kaynağı bulunamadı.
									</Text>
								) : (
									sources.map((item, index) => {
										const isSelected = selectedSourceIndex === index;
										const name =
											item.result?.name ||
											item.extractor ||
											`Kaynak ${index + 1}`;
										const subCount = item.result?.subtitles?.length || 0;

										return (
											<TVPressable
												key={`source-${index}`}
												autoFocus={isSelected}
												style={[
													styles.optionItem,
													isSelected && styles.optionItemSelected,
												]}
												focusedStyle={styles.optionItemFocused}
												onPress={() => {
													onSelectSource(index);
													onClose();
												}}>
												<View style={styles.optionLeft}>
													<View
														style={[
															styles.radioCircle,
															isSelected && styles.radioCircleSelected,
														]}>
														{isSelected && (
															<View style={styles.radioDot} />
														)}
													</View>
													<View style={styles.optionTextContainer}>
														<Text
															style={[
																styles.optionTitle,
																isSelected && styles.optionTitleSelected,
															]}>
															{name}
														</Text>
														<Text style={styles.optionSubtitle}>
															{subCount > 0
																? `${subCount} Altyazı Dili Mevcut`
																: "Harici altyazı yok"}
														</Text>
													</View>
												</View>
												{isSelected && (
													<View style={styles.badge}>
														<Text style={styles.badgeText}>Aktif</Text>
													</View>
												)}
											</TVPressable>
										);
									})
								)}
							</View>
						)}

						{/* 2. SUBTITLES SELECTION */}
						{type === "subtitles" && (
							<View>
								{/* Senkronizasyon (Gecikme) Ayarı - Yalnızca bir altyazı seçiliyken */}
								{selectedSubtitle && (
									<View style={styles.syncBox}>
										<View style={styles.syncHeader}>
											<View style={styles.syncTitleRow}>
												<Ionicons
													name="time-outline"
													size={16}
													color="#FF9500"
												/>
												<Text style={styles.syncTitle}>
													Senkronizasyon (Gecikme)
												</Text>
											</View>
											<View
												style={[
													styles.syncBadge,
													subtitleOffset !== 0 &&
														styles.syncBadgeActive,
												]}>
												<Text
													style={[
														styles.syncBadgeText,
														subtitleOffset !== 0 &&
															styles.syncBadgeTextActive,
													]}>
													{subtitleOffset > 0
														? `+${subtitleOffset.toFixed(1)} sn`
														: `${subtitleOffset.toFixed(1)} sn`}
												</Text>
											</View>
										</View>
										<Text style={styles.syncHint}>
											Altyazı erken geliyorsa (+), geç kalıyorsa (-) butonlarına basın.
										</Text>
										<View style={styles.syncButtonsRow}>
											<TVPressable
												style={styles.syncBtn}
												focusedStyle={styles.syncBtnFocused}
												onPress={() =>
													onUpdateSubtitleOffset?.(-0.5)
												}>
												<Text style={styles.syncBtnText}>
													-0.5s
												</Text>
											</TVPressable>
											<TVPressable
												style={styles.syncBtn}
												focusedStyle={styles.syncBtnFocused}
												onPress={() =>
													onUpdateSubtitleOffset?.(-0.1)
												}>
												<Text style={styles.syncBtnText}>
													-0.1s
												</Text>
											</TVPressable>
											<TVPressable
												style={[
													styles.syncBtn,
													styles.syncBtnReset,
												]}
												focusedStyle={styles.syncBtnFocused}
												onPress={() =>
													onUpdateSubtitleOffset?.(0, true)
												}>
												<Text
													style={
														styles.syncBtnResetText
													}>
													Sıfırla
												</Text>
											</TVPressable>
											<TVPressable
												style={styles.syncBtn}
												focusedStyle={styles.syncBtnFocused}
												onPress={() =>
													onUpdateSubtitleOffset?.(0.1)
												}>
												<Text style={styles.syncBtnText}>
													+0.1s
												</Text>
											</TVPressable>
											<TVPressable
												style={styles.syncBtn}
												focusedStyle={styles.syncBtnFocused}
												onPress={() =>
													onUpdateSubtitleOffset?.(0.5)
												}>
												<Text style={styles.syncBtnText}>
													+0.5s
												</Text>
											</TVPressable>
										</View>
									</View>
								)}

								{/* Option: Kapalı (Off) */}
								<TVPressable
									autoFocus={!selectedSubtitle}
									style={[
										styles.optionItem,
										!selectedSubtitle && styles.optionItemSelected,
									]}
									focusedStyle={styles.optionItemFocused}
									onPress={() => {
										onSelectSubtitle(null);
										onClose();
									}}>
									<View style={styles.optionLeft}>
										<View
											style={[
												styles.radioCircle,
												!selectedSubtitle && styles.radioCircleSelected,
											]}>
											{!selectedSubtitle && (
												<View style={styles.radioDot} />
											)}
										</View>
										<View style={styles.optionTextContainer}>
											<Text
												style={[
													styles.optionTitle,
													!selectedSubtitle && styles.optionTitleSelected,
												]}>
												Kapalı
											</Text>
											<Text style={styles.optionSubtitle}>
												Altyazı gösterme
											</Text>
										</View>
									</View>
									{!selectedSubtitle && (
										<Ionicons
											name="checkmark-circle"
											size={20}
											color="#FF3B30"
										/>
									)}
								</TVPressable>

								{/* Available Subtitles */}
								{subtitles.map((sub, index) => {
									const isSelected =
										selectedSubtitle &&
										(selectedSubtitle.uri === sub.uri ||
											selectedSubtitle.title === sub.title ||
											(typeof selectedSubtitle.index === "number" &&
												selectedSubtitle.index === sub.index));

									return (
										<TVPressable
											key={`sub-${index}-${sub.title || sub.name}`}
											autoFocus={isSelected}
											style={[
												styles.optionItem,
												isSelected && styles.optionItemSelected,
											]}
											focusedStyle={styles.optionItemFocused}
											onPress={() => {
												onSelectSubtitle(sub);
											}}>
											<View style={styles.optionLeft}>
												<View
													style={[
														styles.radioCircle,
														isSelected && styles.radioCircleSelected,
													]}>
													{isSelected && (
														<View style={styles.radioDot} />
													)}
												</View>
												<View style={styles.optionTextContainer}>
													<Text
														style={[
															styles.optionTitle,
															isSelected && styles.optionTitleSelected,
														]}>
														{sub.title || sub.name || `Altyazı ${index + 1}`}
													</Text>
													{sub.language && (
														<Text style={styles.optionSubtitle}>
															Dil: {sub.language.toUpperCase()}
														</Text>
													)}
												</View>
											</View>
											{isSelected && (
												<Ionicons
													name="checkmark-circle"
													size={20}
													color="#FF3B30"
												/>
											)}
										</TVPressable>
									);
								})}
							</View>
						)}

						{/* 3. AUDIO TRACKS SELECTION */}
						{type === "audio" && (
							<View>
								{audioTracks.length === 0 ? (
									<View style={styles.emptyContainer}>
										<Ionicons
											name="information-circle-outline"
											size={28}
											color="#8E8E93"
										/>
										<Text style={styles.emptyText}>
											Bu video kaynağında ek ses parçası bulunamadı.
											Varsayılan ses oynatılıyor.
										</Text>
									</View>
								) : (
									audioTracks.map((track, index) => {
										const trackId =
											typeof track.index === "number"
												? track.index
												: index;
										const isSelected =
											selectedAudioTrack === trackId ||
											(selectedAudioTrack === null && track.selected);

										// Format track title
										let title =
											track.title ||
											(track.language
												? `Ses (${track.language.toUpperCase()})`
												: `Ses Parçası ${index + 1}`);

										return (
											<TVPressable
												key={`audio-${index}`}
												autoFocus={isSelected}
												style={[
													styles.optionItem,
													isSelected && styles.optionItemSelected,
												]}
												focusedStyle={styles.optionItemFocused}
												onPress={() => {
													onSelectAudioTrack(trackId);
													onClose();
												}}>
												<View style={styles.optionLeft}>
													<View
														style={[
															styles.radioCircle,
															isSelected && styles.radioCircleSelected,
														]}>
														{isSelected && (
															<View style={styles.radioDot} />
														)}
													</View>
													<View style={styles.optionTextContainer}>
														<Text
															style={[
																styles.optionTitle,
																isSelected && styles.optionTitleSelected,
															]}>
															{title}
														</Text>
														{track.bitrate && (
															<Text style={styles.optionSubtitle}>
																{Math.round(track.bitrate / 1000)} kbps
															</Text>
														)}
													</View>
												</View>
												{isSelected && (
													<Ionicons
														name="checkmark-circle"
														size={20}
														color="#FF3B30"
													/>
												)}
											</TVPressable>
										);
									})
								)}
							</View>
						)}
					</ScrollView>
				</View>
			</View>
		</Modal>
	);
}

const styles = StyleSheet.create({
	backdrop: {
		flex: 1,
		backgroundColor: "rgba(0, 0, 0, 0.75)",
		justifyContent: "flex-end",
	},
	dismissArea: {
		flex: 1,
	},
	sheetContainer: {
		backgroundColor: "#161922",
		borderTopLeftRadius: 20,
		borderTopRightRadius: 20,
		paddingTop: 16,
		paddingHorizontal: 20,
		maxHeight: "75%",
		borderTopWidth: 1,
		borderColor: "rgba(255, 255, 255, 0.1)",
	},
	header: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingBottom: 16,
		borderBottomWidth: 1,
		borderBottomColor: "rgba(255, 255, 255, 0.08)",
		marginBottom: 12,
	},
	headerLeft: {
		flexDirection: "row",
		alignItems: "center",
	},
	headerIcon: {
		marginRight: 10,
	},
	headerTitle: {
		color: "#FFFFFF",
		fontSize: 18,
		fontWeight: "700",
	},
	closeButton: {
		padding: 4,
		borderRadius: 16,
		backgroundColor: "rgba(255, 255, 255, 0.06)",
	},
	closeButtonFocused: {
		backgroundColor: "rgba(255, 59, 48, 0.35)",
		borderColor: "#FF3B30",
		borderWidth: 1.5,
		transform: [{ scale: 1.15 }],
	},
	contentList: {
		marginBottom: 8,
	},
	optionItem: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingVertical: 14,
		paddingHorizontal: 16,
		borderRadius: 12,
		backgroundColor: "rgba(255, 255, 255, 0.03)",
		marginBottom: 8,
		borderWidth: 1,
		borderColor: "transparent",
	},
	optionItemFocused: {
		backgroundColor: "rgba(255, 59, 48, 0.28)",
		borderColor: "#FF3B30",
		borderWidth: 1.5,
		transform: [{ scale: 1.02 }],
	},
	optionItemSelected: {
		backgroundColor: "rgba(255, 59, 48, 0.12)",
		borderColor: "rgba(255, 59, 48, 0.35)",
	},
	syncBtnFocused: {
		backgroundColor: "rgba(255, 59, 48, 0.35)",
		borderColor: "#FF3B30",
		borderWidth: 1.5,
		transform: [{ scale: 1.08 }],
	},
	optionLeft: {
		flexDirection: "row",
		alignItems: "center",
		flex: 1,
	},
	radioCircle: {
		width: 20,
		height: 20,
		borderRadius: 10,
		borderWidth: 2,
		borderColor: "#636366",
		alignItems: "center",
		justifyContent: "center",
		marginRight: 14,
	},
	radioCircleSelected: {
		borderColor: "#FF3B30",
	},
	radioDot: {
		width: 10,
		height: 10,
		borderRadius: 5,
		backgroundColor: "#FF3B30",
	},
	optionTextContainer: {
		flex: 1,
	},
	optionTitle: {
		color: "#E5E5EA",
		fontSize: 15,
		fontWeight: "600",
		marginBottom: 2,
	},
	optionTitleSelected: {
		color: "#FFFFFF",
		fontWeight: "700",
	},
	optionSubtitle: {
		color: "#8E8E93",
		fontSize: 12,
	},
	badge: {
		backgroundColor: "rgba(255, 59, 48, 0.2)",
		paddingHorizontal: 8,
		paddingVertical: 3,
		borderRadius: 6,
		borderWidth: 1,
		borderColor: "rgba(255, 59, 48, 0.4)",
	},
	badgeText: {
		color: "#FF453A",
		fontSize: 11,
		fontWeight: "700",
	},
	syncBox: {
		backgroundColor: "rgba(255, 149, 0, 0.08)",
		borderRadius: 12,
		padding: 12,
		marginBottom: 14,
		borderWidth: 1,
		borderColor: "rgba(255, 149, 0, 0.25)",
	},
	syncHeader: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginBottom: 6,
	},
	syncTitleRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
	},
	syncTitle: {
		color: "#FF9500",
		fontSize: 13,
		fontWeight: "700",
	},
	syncBadge: {
		backgroundColor: "rgba(255, 255, 255, 0.1)",
		paddingHorizontal: 8,
		paddingVertical: 2,
		borderRadius: 6,
	},
	syncBadgeActive: {
		backgroundColor: "rgba(255, 149, 0, 0.25)",
		borderColor: "#FF9500",
		borderWidth: 1,
	},
	syncBadgeText: {
		color: "#E5E5EA",
		fontSize: 12,
		fontWeight: "700",
	},
	syncBadgeTextActive: {
		color: "#FF9500",
	},
	syncHint: {
		color: "#8E8E93",
		fontSize: 11,
		marginBottom: 10,
	},
	syncButtonsRow: {
		flexDirection: "row",
		gap: 6,
		justifyContent: "space-between",
	},
	syncBtn: {
		flex: 1,
		backgroundColor: "rgba(255, 255, 255, 0.08)",
		paddingVertical: 8,
		borderRadius: 8,
		alignItems: "center",
		justifyContent: "center",
	},
	syncBtnReset: {
		backgroundColor: "rgba(255, 59, 48, 0.15)",
	},
	syncBtnText: {
		color: "#FFFFFF",
		fontSize: 12,
		fontWeight: "700",
	},
	syncBtnResetText: {
		color: "#FF453A",
		fontSize: 11,
		fontWeight: "700",
	},
	emptyContainer: {
		alignItems: "center",
		justifyContent: "center",
		paddingVertical: 32,
		paddingHorizontal: 16,
	},
	emptyText: {
		color: "#8E8E93",
		fontSize: 14,
		textAlign: "center",
		marginTop: 8,
		lineHeight: 20,
	},
});
