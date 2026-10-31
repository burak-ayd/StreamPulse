import { FontFamily, Palette } from "@/constants/theme";
import { useTvMetrics } from "@/utils/tvMetrics";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import Image from "@/components/common/SmartImage";
import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

/**
 * CastSection – "Oyuncular" bölümü.
 *
 * Telefon, tablet ve TV'de yatay SLIDER (kaydırılabilir şerit).
 * Portre yalnızca `cast_images` eşleşmesi varsa gösterilir; yoksa kişi ikonu.
 */
export default function CastSection({ cast, images = {} }) {
	const { sp, isTV, gutter } = useTvMetrics();

	if (!cast || cast.length === 0) return null;

	const nameOf = (person) =>
		typeof person === "string"
			? person
			: person?.name || person?.actor || person?.original_name || "";

	const imageOf = (person) =>
		typeof person === "string"
			? images[person]
			: person?.profile_path || images[person?.name];

	const avatarSize = sp(isTV ? 48 : 64);

	const renderAvatar = (person, size) => {
		const uri = imageOf(person);
		return (
			<View
				style={[
					styles.avatar,
					{
						width: size,
						height: size,
						borderRadius: size / 2,
					},
				]}>
				{uri ? (
					<Image
						source={{ uri }}
						style={styles.avatarImage}
						contentFit="cover"
						contentPosition="center"
						transition={150}
						cachePolicy="memory-disk"
					/>
				) : (
					<Ionicons
						name="person"
						size={Math.round(size * 0.5)}
						color={Palette.onSurfaceVariant}
					/>
				)}
			</View>
		);
	};

	return (
		<View style={[styles.container, { marginBottom: sp(24), gap: sp(12) }]}>
			<Text style={[styles.sectionTitle, { fontSize: sp(18) }]}>
				Oyuncular
			</Text>

			<ScrollView
				horizontal
				showsHorizontalScrollIndicator={false}
				contentContainerStyle={[
					styles.row,
					{ gap: sp(14), paddingRight: gutter },
				]}>
				{cast.map((person, index) => (
					<View
						key={`${nameOf(person)}-${index}`}
						style={[styles.person, { width: sp(80), gap: sp(6) }]}>
						{renderAvatar(person, avatarSize)}
						<Text
							style={[
								styles.name,
								{ fontSize: sp(12.5), textAlign: "center" },
							]}
							numberOfLines={2}>
							{nameOf(person)}
						</Text>
					</View>
				))}
			</ScrollView>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {},
	sectionTitle: {
		color: Palette.onSurface,
		fontFamily: FontFamily.semiBold,
	},
	row: {
		flexDirection: "row",
	},
	person: {
		alignItems: "center",
	},
	avatar: {
		overflow: "hidden",
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: Palette.surfaceHighest,
	},
	avatarImage: {
		width: "100%",
		height: "100%",
	},
	name: {
		color: Palette.onSurface,
		fontFamily: FontFamily.medium,
	},
});