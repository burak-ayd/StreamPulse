# OTA Güncelleme Sistemi (expo-updates · custom server)

AstorTest2'de kurulan ve StreamPulse'a uyarlanan sistem:
**expo-updates (SDK 57) + özel sunucu (ota.burakaydogan.tk) + RSA kod imzası.**
JS (ve gömülü asset) değişiklikleri APK yeniden derlemeden; native,
gradle veya plugin değişiklikleri APK derlemesiyle gider.

---

## 1. Mimari (client)

| Parça | Konum | Görevi |
|---|---|---|
| Native config | `app.config.js` → `updates` + `runtimeVersion` | URL, request header'ları, kod imzası, runtimeVersion — prebuild sırasında APK'ya gömülür |
| Kontrol akışı | `src/hooks/useOtaUpdate.js` | Açılış + foreground'da sessiz check → indir → uygula |
| Tercih saklama | `src/services/otaUpdate.js` | Bildirim tercihi (AsyncStorage, anahtar `app_ota_notify`) |
| UI | Ayarlar → "Güncelleme Bildirimi" satırı | Sessiz (varsayılan) ↔ her sürümde onay sorusu |

Kritik parametreler (`app.config.js`):

- `runtimeVersion: { policy: "appVersion" }` → runtime = `app.json` `version`
- `url: https://ota.burakaydogan.tk/manifest`
- `requestHeaders`:
  - `expo-app-id: 46297b13-b95e-43b4-90da-cebab8f8741a` (StreamPulse'a özgü
    sunucu kaydı),
  - `expo-channel-name`: APP_VARIANT'tan (release / preview / dev)
- `codeSigningCertificate: ./certs/certificate.pem` — public
  sertifikadır; makine-lokal tutulur, git'te YOK (`.gitignore` `*.pem`).
  Private key yalnızca sunucu tarafındadır.
- `codeSigningMetadata: { keyid: "main", alg: "rsa-v1_5-sha256" }`
- `checkAutomatically: "ON_ERROR_RECOVERY"` + `fallbackToCacheTimeout: 0`
  → açılışta bekleme yok; kontrol tamamen JS tarafında yapılır
  (`src/hooks/useOtaUpdate.js`).
- Test'te imza doğrulamasını kapatmak için: `DISABLE_CODE_SIGNING=1` ile
  derle.

## 2. runtimeVersion kuralları (sürüm disiplini)

runtimeVersion `appVersion` politikasıyla `app.json` `version`'dan gelir.

| Değişiklik | Yapılacak | Yayın yolu |
|---|---|---|
| JS / gömülü asset only | `version` DEĞİŞTİRİLMEZ | OTA (sunucudaki manifest runtime'ı aynı version) |
| Native dep / gradle / plugin / SDK / `app.config.js` updates bloğu | `version` artırılır → APK derleme | APK |

⚠️ JS-only OTA yayınlarken `app.json` `version`'a dokunma. Dokunursan
yayınlanan manifest'in runtime'ı hiçbir yüklü APK ile eşleşmez ve
güncelleme kimsenin cihazına düşmez.

Her APK derlemesi `scripts/bump-version.js` ile patch sürümünü artırdığı
için her yeni APK'ya otomatik olarak yeni bir runtimeVersion düşer;
eşleşme hataya kapalıdır.

## 3. Derleme & yayın

APK (native değişiklik veya ilk OTA-yeten derleme):

```sh
bun run build:release      # = APP_VARIANT=release node scripts/build.js apk
bun run build:release:tv   # TV varyantı
```

JS-only OTA — AstorTest2'deki yayın akışıyla aynıdır (aynı sunucu,
aynı protokol):

1. `app.json` `version`'ı OLDUĞU GİBİ bırak.
2. Bundle'ı üret ve sunucunun beklediği formatta/yerde yayınla
   (AstorTest2'de kullandığın adımların birebir aynısı çalışır; sunucu
   tarafında StreamPulse için `expo-app-id: 46297b13-…` kaydının ve
   `version`'a eş runtime tanımının açılmış olması gerekir).
3. Sunucu manifest'i private key ile imzalar; APK'ya gömülü
   `certs/certificate.pem` doğrular.

Sunucunun bilmesi gerekenler (Expo Updates protokolü, birebir olarak
AstorTest2'deki uygulama aynı):

- `GET /manifest` → platform + runtimeVersion eşleşen güncelleme
  manifest'ini döndürmek (istek başlıkları: `expo-runtime-version`,
  `expo-platform`, `expo-protocol-version`, `expo-channel-name`,
  `expo-app-id`),
- asset dosyalarını (bundle + görseller) sunmak,
- imzalı manifestlerde `codeSigningInfo` alanını taşımak.

## 4. Kullanıcı davranışı (varsayılan)

- Kontrol ve indirme tamamen sessizdir; yeni bundle uygulamayı
  YENİDEN AÇTIĞINDA otomatik devreye girer (fark edilemez).
- Ayarlar → "Güncelleme Bildirimi" açılırsa her indirilen sürümde
  "Şimdi yenile / Kapat" sorusu çıkar. "Kapat" derse o manifest id
  bu oturum boyunca tekrar sorulmaz; indirme zaten tamamlanmış olduğundan
  sonraki açılışta sessiz uygulanır.
- Kötü bir güncellemeye karşı koruma: sunucu rollback emri
  (`rollback` / `isRollBackToEmbedded`) verirse istemci indirme YAPMAZ
  ve bir sonraki açılışta embedded sürüme döner.

## 5. Test senaryosu

1. `bun run build:release` → APK'yı cihaza kur (örn. 1.0.31).
2. Sunucuya JS değişikliği yayınla (version sabit, runtime aynı).
3. Uygulama açılır: foreground'da/kontrol döngüsünde sessiz indirme;
   uygulamayı yeniden aç → yeni JS sürümü çalıştır
   (doğrulama: `Updates.isEmbeddedLaunch === false`).
4. Ayarlar → "Güncelleme Bildirimi"ni aç; sunucuya yeni bir OTA yayınla;
   indirme bitince Alert göründüğünü, "Şimdi yenile" ve "Kapat"
   yollarının ikisinin de çalıştığını doğrula.
5. Sunucuda rollback'e düşür → istemci sonraki açılışta embedded'e döner.

## 6. Bilinen sınırlar

- `__DEV__` ve Expo Go'da akış çalışmaz; API'ler hata atar,
  istemci tarafında sessizce yakalanır.
- `expo-updates` native modül eklediği için BİR KEZ yeni APK derlemesi
  şarttır (modülü gömmek için). Bundan sonraki JS sürümleri bu
  derlemeden bağımsız gider.
- `certificate.pem` sunucunun imza anahtarıyla EŞLEŞMEZSE imzalı
  manifest'ler REDDEDİLİR; yeni bir anahtar çifti kullanılacaksa
  APK yeniden derlenmelidir.
- İlk OTA-yeten APK, önceki (1.0.30) sürümlü cihazların APK'sının
  YERİNİ ALMAZ: eski APK'larda expo-updates modülü olmadığından onlara
  OTA ulaşamaz; eski kurulumlarda yalnızca APK-güncelleme akışı
  (GitHub Releases) işler.
