/**
 * LoadingState — MovieDetails ekranının iskeleti
 * =============================================
 *
 * Eskiden ekranın ortasında dönen bir `ActivityIndicator` vardı. İçerik
 * geldiğinde backdrop + başlık + meta hapları + butonlar + bölümler
 * ekrana giriyor, yani kullanıcı farklı iki düzen arasında geçiş
 * görüyordu.
 *
 * Burada ekranın gerçek bölüm SIRASI çizilir:
 *   1. Hero backdrop — `HeroSection`'in gerçek yükseklik formülü
 *      (`width > 768 ? 0.65 : 0.48`, TV'de biraz kısa)
 *   2. Başlık + meta satırı
 *   3. Ana eylem butonu
 *   4. İki bölüm bloğu
 *
 * Ölçüler `HeroSection` / `ActionButtons` ile aynı kaynaktan gelir; veri
 * geldiğinde iskelet blokların yerine gerçek öğeler oturur.
 */

import { SkeletonBlock, SkeletonLine } from "@components/common/Skeleton";
import React from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { useThemeContext } from "@/context/ThemeContext";
import { useTvMetrics } from "@/utils/tvMetrics";

export default function LoadingState() {
	const { m3, theme } = useThemeContext();
	const { width, height } = useWindowDimensions();
	const { isTV, sp } = useTvMetrics();

	// HeroSection ile aynı formül — bkz. HeroSection.jsx `backdropFraction`.
	const backdropFraction = width > 768 ? 0.65 : 0.48;
	const backdropHeight = height * (isTV ? backdropFraction - 0.06 : backdropFraction);

	return (
		<View
			style={[styles.container, { backgroundColor: m3.surfaceLowest }]}
			pointerEvents="none">
			{/* 1. Hero backdrop */}
			<View
				style={[
					styles.backdrop,
					{ height: backdropHeight, backgroundColor: m3.surfaceContainer },
				]}
			/>

			{/* 2. Başlık + meta */}
			<View
				style={[
					styles.body,
					{ paddingHorizontal: 20, paddingTop: sp(16) },
				]}>
				<SkeletonLine
					width="72%"
					height={sp(26)}
					radius={sp(8)}
					color={m3.surfaceContainerHigh}
				/>
				<View style={[styles.metaRow, { gap: sp(8), marginTop: sp(10) }]}>
					<SkeletonBlock
						width={sp(64)}
						height={sp(22)}
						radius={sp(8)}
						color={m3.surfaceContainerHigh}
					/>
					<SkeletonBlock
						width={sp(52)}
						height={sp(22)}
						radius={sp(8)}
						color={m3.surfaceContainerHigh}
					/>
					<SkeletonBlock
						width={sp(74)}
						height={sp(22)}
						radius={sp(8)}
						color={m3.surfaceContainerHigh}
					/>
				</View>

				{/* 3. Ana eylem butonu + yanındaki ikon butonları */}
				<View style={{ marginTop: sp(18) }}>
					<SkeletonBlock
						width="100%"
						height={sp(46)}
						radius={sp(12)}
						color={m3.surfaceContainerHigh}
					/>
					<View
						style={[styles.metaRow, { gap: sp(10), marginTop: sp(12) }]}>
						{Array.from({ length: 4 }).map((_, index) => (
							<SkeletonBlock
								key={`sk-eylem-${index}`}
								width={sp(58)}
								height={sp(44)}
								radius={sp(12)}
								color={m3.surfaceContainerHigh}
							/>
						))}
					</View>
				</View>

				{/* 4. İki bölüm: özet + ilgili içerikler */}
				<View style={{ marginTop: sp(24), gap: sp(8) }}>
					<SkeletonLine
						width="94%"
						height={sp(12)}
						color={m3.surfaceContainerHigh}
					/>
					<SkeletonLine
						width="88%"
						height={sp(12)}
						color={m3.surfaceContainerHigh}
					/>
					<SkeletonLine
						width="62%"
						height={sp(12)}
						color={m3.surfaceContainerHigh}
					/>
				</View>

				<View style={{ marginTop: sp(28) }}>
					<SkeletonLine
						width={sp(140)}
						height={sp(16)}
						color={m3.surfaceContainerHigh}
					/>
					<View style={[styles.posterRow, { gap: sp(10), marginTop: sp(12) }]}>
						{Array.from({ length: 4 }).map((_, index) => (
							<SkeletonBlock
								key={`sk-afiş-${index}`}
								width={sp(84)}
								height={sp(126)}
								radius={sp(10)}
								color={m3.surfaceContainerHigh}
							/>
						))}
					</View>
				</View>
			</View>

			{/*
			 * Alt kenar karartması — `HeroSection`'in alt gradyanının
			 * karşılığı. Tema rengi doğru; gradyan değeri `colors.bg`
			 * üzerine kurulduğu için ince bir yumuşaklık yeterli.
			 */}
			<View
				pointerEvents="none"
				style={[
					styles.bottomFade,
					{
						backgroundColor:
							theme === "dark"
								? "rgba(11,14,20,0.35)"
								: "rgba(248,250,252,0.35)",
					},
				]}
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
	},
	backdrop: {
		width: "100%",
	},
	body: {
		flex: 1,
	},
	metaRow: {
		flexDirection: "row",
		alignItems: "center",
	},
	posterRow: {
		flexDirection: "row",
	},
	bottomFade: {
		position: "absolute",
		left: 0,
		right: 0,
		bottom: 0,
		height: "35%",
	},
});