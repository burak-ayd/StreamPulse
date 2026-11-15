# OTA Güncelleme Sistemi (expo-updates · XPrem sunucusu)

AstorTest2'de kurulan ve StreamPulse'a uyarlanan sistem:
**expo-updates (SDK 57) + XPrem (eski adı expo-open-ota) self-hosted sunucu
+ RSA kod imzası.** JS (ve gömülü asset) değişiklikleri APK yeniden derlemeden;
native, gradle veya plugin değişiklikleri APK derlemesiyle gider.

---

## 1. Mimari (client)

| Parça | Konum | Görevi |
|---|---|---|
| Native config | `app.config.js` → `updates` + `runtimeVersion` | URL, request header'ları, kod imzası, runtimeVersion — prebuild sırasında APK'ya gömülür |
| Kontrol akışı | `src/hooks/useOtaUpdate.js` | YALNIZ uygulama açılışında bir kez sessiz check → indir; açılış penceresinde biterse aynı açılışta uygular, yoksa sonraki açılışta native devreye girer |
| Tercih saklama | `src/services/otaUpdate.js` | Bildirim tercihi (AsyncStorage, anahtar `app_ota_notify`) |
| UI | Ayarlar → "Güncelleme Bildirimi" satırı | Sessiz (varsayılan) ↔ her sürümde onay sorusu |

Kritik parametreler (`app.config.js`):

- `runtimeVersion: "1"` — elle yönetilen string. **Native/gradle/plugin
  değişiklikte "2" (vb.) artırmak SENİN görevin;** JS-only sürümlerde sabit kalır.
- `url: https://ota.burakaydogan.net.tr/manifest` — XPrem base URL + `/manifest`
- `requestHeaders`:
  - `expo-app-id: 46297b13-b95e-43b4-90da-cebab8f8741a` (XPrem dashboard'daki
    StreamPulse App ID),
  - `expo-channel-name`: `RELEASE_CHANNEL` env'i, tanımsızsa koddaki
    fallback `"release"` APK'ya gömülür (XPrem'de bu kanalın bir branch'e
    bağlı olması şart).
- `codeSigningCertificate: ./certs/certificate.pem` — bu sertifika XPrem
  dashboard'ından (App Info → Download certificate) indirilmiş
  **StreamPulse'a özel** sertifikadır (CN=StreamPulse); git'te yok
  (`.gitignore` `*.pem`), private key XPrem sunucusundadır.
- `codeSigningMetadata: { keyid: "main", alg: "rsa-v1_5-sha256" }`
- `checkAutomatically: "ON_ERROR_RECOVERY"` + `fallbackToCacheTimeout: 0`
  → açılışta bekleme yok; kontrol tamamen JS tarafında yapılır
  (`src/hooks/useOtaUpdate.js`).
- İmzasız test: `DISABLE_CODE_SIGNING=1` ile derle.

⚠️ `android/` klasörü CNG'dir ve `git` ile takip EDİLMEZ. Şu an
`android/app/src/main/AndroidManifest.xml` içinde 9 adet
`expo.modules.updates.*` meta-data SATIRI VAR (satır 28–36). GitHub web'de
bu klasör görünmez; doğru yerler: yereldeki dosya ve derlenmiş APK.

## 2. runtimeVersion kuralları (sürüm disiplini)

runtimeVersion elle yönetilir ("1").

| Değişiklik | Yapılacak | Yayın yolu |
|---|---|---|
| JS / gömülü asset only | runtimeVersion DOKUNULMAZ ("1") | OTA (XPrem'de güncellemeyi runtime "1" hedefine yayınla) |
| Native dep / gradle / plugin / SDK / updates bloğu | runtimeVersion ARTIRILIR ("2" gibi) → APK derleme | APK; sunucuda "2" runtime'ına güncelleme yayınlama |

⚠️ Sürüm numarası ayrı bir olgudur: her APK derlemesi
`scripts/bump-version.js` ile `app.json` `version`'ını (patch) artırır;
bu version runtimeVersion'ı DEĞİŞTİRMEZ. runtimeVersion'ı artırmak için
`app.config.js`'teki değeri elle güncelle — native değişikliği APK'ya
geçirmeden önce yapılır.

## 3. Derleme & yayın

APK (native değişiklik veya ilk OTA-yeten derleme):

```sh
bun run build:release      # = APP_VARIANT=release node scripts/build.js apk
bun run build:release:tv   # TV varyantı
```

JS-only OTA — XPrem'in standart CLI'si (eoas):

```sh
# sunucudaki streamPulse app'i için API token'ı (bir kez al):
export EOO_TOKEN=eoo_your_api_key
export RELEASE_CHANNEL=production          # APK'ya gömülü channel ile aynı olmalı
npx eoas publish --branch production       # app.json version'a DOKUNMA
```

XPrem tarafı checklist (kesin aşamalar):

1. Dashboard → App Info: `expo-app-id` = 46297b13-… (StreamPulse kaydı).
2. Certificate: indirilen `certs/certificate.pem` projede kullanılıyor
   (CN=StreamPulse). Sunucudaki imza anahtarıyla EŞLEŞİYOR.
3. Channels: "production" kanalı oluşturuldu ve ilgili branch'e bağlı
   (progressive rollout bu ekrandan yönetilir).
4. Update publish: `eoas publish` ile aynı branch'e güncelleme yükle.

Hızlı doğrulama (sunucu çalışıyor ve channel eşleşiyor mu?):

```sh
curl -sD - "https://ota.burakaydogan.net.tr/manifest" \
  -H "expo-app-id: 46297b13-b95e-43b4-90da-cebab8f8741a" \
  -H "expo-channel-name: production" \
  -H "expo-runtime-version: 1" \
  -H "expo-platform: android" \
  -H "expo-protocol-version: 1"
```

`expo-manifest-filters: branch="production"` başlığı görünürsa
sunucu tarafı tamamdır.

## 4. Kullanıcı davranışı (varsayılan)

- Kontrol YALNIZCA uygulama AÇILIŞINDA bir kez yapılır; uygulama açıkken
  başka kontrol ve reload YOK. (Eski "ön plana dönüşte kontrol" ve "arka
  plana geçince sessiz reload" modelleri kaldırıldı: ikincisi RootLayout'u
  navigasyona abone edip her ekran geçişini kastırıyordu; Hook artık
  hiçbir abonelik kurmaz.)
- Güncelleme sessizce iner. İndirme AÇILIŞ PENCERESİ içinde (splash
  kapısının azami süresi, `MAX_SPLASH_MS` ≈3 sn) tamamlanırsa `reloadAsync`
  ile AYNI açılışta uygulanır — reload splash'ın altında olup biter,
  kullanıcı yalnızca normal bir açılış görür; "kapat-aç" GEREKMEZ. Pencere
  kaçarsa güncelleme bekletilir ve uygulamanın BİR SONRAKİ açılışında
  expo-updates tarafından native olarak devreye alınır. Her iki durumda da
  uygulama AÇIKKEN hiçbir kesinti yaşanmaz.
- Aynı sürüm için üst üste reload'u engelleyen id guard'ı vardır
  (AsyncStorage `app_ota_startup_applied`).
- Ayarlar → "Güncelleme Bildirimi" AÇIKSA otomatik-açılışta-uygulama
  yerine indirme sonrası "Şimdi yenile / Kapat" sorulur; "Şimdi yenile"
  kullanıcı onayıyla anında uygular, "Kapat" bir sonraki açılışa bırakır.
- Kötü bir güncellemeye karşı koruma: sunucu rollback emri
  verirse istemci indirme YAPMAZ ve bir sonraki açılışta embedded'e döner.

## 5. Test senaryosu

1. `bun run build:release` → APK'yı cihaza kur.
2. Yerelde doğrulama — manifest zaten text olarak
   `android/app/src/main/AndroidManifest.xml`'de var (satır 28–36);
   APK içinde ise BINARY'dir, düz unzip + metin araması TUTMAZ:

```sh
# Android SDK build-tools'tan:
aapt2 dump xmltree <apk-yolu> --file AndroidManifest.xml | findstr "expo.modules.updates"
```

3. Sunucuya JS değişikliği yayınla (`eoas publish`, version'a dokmadan).
4. Uygulamayı aç: güncelleme sessizce iner ve yerel sunucuda kısa sürdüğü
   için AYNI açılışta uygulanır (uygulama bir kez daha "açılmış" gibi olur,
   splash altında). Uzun sürerse uygulamayı tamamen kapat → yeniden aç:
   yeni sürüm aktif (`Updates.isEmbeddedLaunch === false`). Uygulama
   AÇIKKEN hiçbir kesinti/reload yaşanmamalı.
5. Ayarlar → "Güncelleme Bildirimi" açıkken Alert ve "Şimdi yenile"yi test et.
6. XPrem dashboard'dan rollback → istemci sonraki açılışta embedded'e döner.

## 6. Bilinen sınırlar

- `__DEV__` ve Expo Go'da akış çalışmaz; API'ler hata atar, sessizce
  yakalanır.
- `expo-updates` native modül eklediği için BİR KEZ yeni APK derlemesi
  şarttır. Bundan sonraki JS sürümleri derlemeden bağımsızdır.
- Eski 1.0.30 kurulumlarında expo-updates modülü yoktur; onlara OTA
  ulaşamaz — eski kurulumlarda yalnızca APK-güncelleme akışı (GitHub
  Releases) işler.
- Certificate.pem sunucunun imza anahtarıyla EŞLEŞMEZSE imzalı
  manifest'ler REDDEDİLİR; yeni anahtar çifti kullanılacaksa APK yeniden
  derlenmelidir.
- İmzasız güncelleme kabulünü test etmek için APK'yı
  `DISABLE_CODE_SIGNING=1` ile derle; yalnızca geliştirme amaçlıdır.
