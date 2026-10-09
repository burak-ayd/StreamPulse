/**
 * Oturum Teşhis Kaydı
 *
 * SORUN
 * -----
 * "Uygulama bir süre sonra kendiliğinden çıkış yapıyor" belirtisi, sunucu
 * günlüklerinde İZ BIRAKMIYORDU: ne `/api/auth/refresh` çağrısı, ne 401.
 * Yani uygulama oturumu kullanmayı hiç denemeden giriş ekranına düşüyordu.
 *
 * TEŞHİS NEDEN AsyncStorage?
 * -------------------------
 * Şüphelenilen kök neden SecureStore'un (token deposu) boşalması. Kayıt da
 * SecureStore'a yazılsaydı aynı anda silinirdi ve ÖĞRENEMEZDİK. Bu yüzden
 * kayıt bilinçli olarak AsyncStorage'da tutulur: `clearAllUserData()` onu
 * SİLMEZ (kullanıcı verisi değildir) ve token'lardan bağımsız yaşar.
 *
 * GÜVENLİK
 * --------
 * Token DEĞERİ HİÇBİR ZAMAN yazılmaz. Yalnızca varlık, uzunluk ve sunucunun
 * döndüğü hata kodu tutulur. Kayıt ekranda göstergede ve kopyalanabilir metin
 * olarak sunulabildiği için hassas veri içermemelidir.
 *
 * KULLANIM
 * --------
 *   import { authDiag } from "@/utils/authDiagnostics";
 *   await authDiag.record("refresh", { sonuc: "terminal", http: 401 });
 *   const kayitlar = await authDiag.read();
 *
 * Kanal (console) YALNIZCA `__DEV__` içinde açılır; üretimde sessizdir.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Kayıt tutulacak AsyncStorage anahtarı.
 *
 * ⚠️ `storage.js → clearAllUserData()` listesine BİLEREK EKLENMEDİ: kullanıcı
 * verisi silinse bile teşhis geçmişi kalsın, yoksa teşhis edilecek olayın
 * kaydını da kaybederiz.
 */
const KEY = "streampulse_auth_diag";

/** Son kaç olay tutulur. Halka tamponu — eski kayıtlar üstten düşer. */
const MAX_KAYIT = 50;

/** Kaydın okunabilmesi için üst üste binen süre damgası (ms). */
let _sonYazma = 0;
let _sayac = 0;

/** Çok uzun hata gövdelerini kırpar; log ekranı taşmasın. */
function kisalt(deger, enFazla = 200) {
	if (deger == null) return null;
	const metin = typeof deger === "string" ? deger : JSON.stringify(deger);
	if (!metin) return null;
	return metin.length > enFazla ? `${metin.slice(0, enFazla)}…` : metin;
}

/**
 * Bir "an" damgası üretir.
 *
 * Aynı milisaniye içinde birden fazla olay olabiliyor (üç token yazma,
 * iki refresh). Sadece `Date.now()` yetersiz kalıyor: iki olay aynı değeri
 * alır ve sıralama kaybolur. Bu yüzden milisaniye + artan sayaç kullanılır.
 */
function zamanDamgasi() {
	const simdi = Date.now();
	_sayac = simdi === _sonYazma ? _sayac + 1 : 0;
	_sonYazma = simdi;
	return { ms: simdi, sira: _sayac };
}

export const authDiag = {
	/**
	 * Bir olayı kaydeder. HATA ASLA YUTMAZ: teşhis yüzünden uygulama
	 * çökerse kullanıcıyı teşhis aracından kovamayız.
	 *
	 * @param {string} olay - Kısa olay adı ("refresh", "hasSession", …)
	 * @param {object} [veri] - Serileştirilebilir ayrıntılar (token YOK)
	 * @returns {Promise<object|null>} yazılan kayıt
	 */
	async record(olay, veri = {}) {
		const kayit = {
			...zamanDamgasi(),
			olay,
			veri,
		};

		if (__DEV__) {
			console.log(`[authDiag] ${olay}`, veri);
		}

		try {
			const ham = await AsyncStorage.getItem(KEY);
			const mevcut = ham ? JSON.parse(ham) : [];
			if (!Array.isArray(mevcut)) throw new Error("kayıt dizi değil");

			mevcut.push(kayit);
			// Halka tamponu: en eskiden başlayarak taşmayı at
			while (mevcut.length > MAX_KAYIT) mevcut.shift();

			await AsyncStorage.setItem(KEY, JSON.stringify(mevcut));
			return kayit;
		} catch (hata) {
			// Teşhis yazamazsa uygulama akışı DEVAM etmeli.
			if (__DEV__) console.warn("[authDiag] yazılamadı:", hata?.message);
			return null;
		}
	},

	/**
	 * Tüm kayıtları eskiden yeniye doğru döndürür.
	 * @returns {Promise<object[]>}
	 */
	async read() {
		try {
			const ham = await AsyncStorage.getItem(KEY);
			if (!ham) return [];
			const liste = JSON.parse(ham);
			return Array.isArray(liste) ? liste : [];
		} catch {
			return [];
		}
	},

	/**
	 * Kayıtları okunabilir metne çevirir (paylaşım/kopyalama için).
	 * @returns {Promise<string>}
	 */
	async readAsText() {
		const liste = await authDiag.read();
		if (!liste.length) return "Oturum teşhis kaydı boş.";
		return liste
			.map((k) => {
				const t = new Date(k.ms);
				const saat = `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}:${String(t.getSeconds()).padStart(2, "0")}.${String(t.getMilliseconds()).padStart(3, "0")}`;
				return `${saat}  ${k.olay}  ${JSON.stringify(k.veri)}`;
			})
			.join("\n");
	},

	/**
	 * Kayıtları siler (ekranda "Temizle" butonu).
	 * @returns {Promise<void>}
	 */
	async clear() {
		try {
			await AsyncStorage.removeItem(KEY);
		} catch (hata) {
			if (__DEV__) console.warn("[authDiag] temizlenemedi:", hata?.message);
		}
	},

	/**
	 * Yalnızca `performRefresh` gibi yerlerde kullanılacak kısa yol.
	 * @private
	 */
	_kisalt: kisalt,
};