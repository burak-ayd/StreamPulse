/**
 * Derin bağlantı köprüsü — `streampulse://tv-activate?code=K9X4M2`
 *
 * Kullanıcı TV'deki QR'ı telefonun sistem kamerasıyla okuttuğunda işletim
 * sistemi bu adresi açar; `expo-router` `code` parametresini bu rotaya taşır
 * ve ekran kodu KENDİLİĞİNDEN onaylar (`autoSubmit`).
 *
 * ⚠️ Rota `(app)` grubunda ama URL'de parantezli grup görünmez → yol
 * `/tv-activate`. Bu yüzden bağlantı şeması ek bir yapılandırma gerektirmez;
 * `app.json`daki `scheme: "streampulse"` yeterlidir.
 *
 * ⚠️ Giriş yapılmamışsa `TvConnectScreen` "önce giriş yapın" durumunu
 * gösterir: kodu ONAYLAYAN telefonun, TV'ye bağlanacak hesapla oturum açmış
 * olması gerekir.
 */

import TvConnectScreen from "@/components/tv/TvConnectScreen";
import { useLocalSearchParams } from "expo-router";
import React from "react";

export default function TvActivateRoute() {
	const { code } = useLocalSearchParams();

	return (
		<TvConnectScreen
			initialCode={typeof code === "string" ? code : ""}
			autoSubmit
		/>
	);
}
