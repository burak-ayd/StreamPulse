/**
 * TV Bağla — Ayarlar girişi (TELEFON).
 *
 * Ekranın kendisi paylaşılan bileşendedir; buradaki dosya yalnızca rotayı
 * tanımlar (bkz. `components/tv/TvConnectScreen.jsx` başlığındaki
 * "Neden paylaşılan bileşen" notu).
 */

import TvConnectScreen from "@/components/tv/TvConnectScreen";
import React from "react";

export default function TvConnectRoute() {
	return <TvConnectScreen />;
}
