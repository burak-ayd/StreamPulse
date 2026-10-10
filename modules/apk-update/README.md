# `apk-update` — GitHub Releases tabanlı APK güncelleme

Uygulama kendi içinden son APK'yı kontrol eder, indirir ve Android'in
sistem yükleyicisiyle kurar. JS tarafı **başsızdır (headless)**: `Alert`
çağırmaz, karar vermez — yalnızca callback tetikler ve sonuç döndürür.

## Akış

| Katman | Sorumluluk |
|---|---|
| `ApkUpdateModule.kt` | İndirme (DownloadManager), ilerleme, FileProvider ile kurulum |
| `ApkUpdateManager.ts` | GitHub sorgusu, sürüm karşılaştırması, asset seçimi, izin akışı |
| `AppUpdateContext.jsx` | Uygulama geneli durum, açılışta otomatik kontrol |
| `UpdateBanner` / `UpdateSheet` | Banner ve modal |

## Kullanım

React tarafında hazır sarmalayıcı zaten projeye bağlı:

```jsx
import { useAppUpdate } from "@/context/AppUpdateContext";

const { release, isChecking, check, install, openSheet } = useAppUpdate();

await check({ manual: true }); // elle kontrol (modalı da açar)
await install(); // indir + kur
```

Doğrudan kullanılacaksa:

```js
import { ApkUpdateManager } from "@modules/apk-update/src";

const manager = new ApkUpdateManager({
  repo: "owner/repo", // boşsa özellik kapalı
  token: null, // opsiyonel PAT (rate limit)
  assetHint: "streampulse",
});

manager.setCallbacks({
  onProgress: (p) => console.log(p),
  onInstallStarted: () => {},
  onPermissionRequired: () => manager.requestInstallPermission(),
  onError: (e) => console.warn(e),
});

const result = await manager.checkForUpdate();
// { status: "update-available" | "up-to-date" | "disabled" | "error", ... }
```

## GitHub deposu ayarı

`.env`:

```bash
EXPO_PUBLIC_GITHUB_REPO=owner/repo
```

Boş bırakılırsa özellik **kapalıdır** ve uygulama normal çalışır.

## Release formatı

- Tag: `v1.0.13` (veya `1.0.13`) — sürüm karşılaştırması bunu kullanır.
- Asset: `*.apk`. Seçim sırası:
  1. adında `streampulse` geçen, `debug/unsigned` içermeyen APK
  2. adında `release` geçen, `debug/unsigned` içermeyen APK
  3. herhangi bir (debug olmayan) APK
- Body: markdown serbest; modalde düz metne çevrilir (ilk 12 satır).

## İzinler ve yapılandırma

Modülün kendi izni yoktur. Gerekenler **uygulama** tarafında hazırdır:

- `REQUEST_INSTALL_PACKAGES` → `app.json → android.permissions`
- FileProvider + `file_paths.xml` → `scripts/withFileProvider.js`
  (`cache-path` tanımlı olduğu için indirilen APK cache'e kopyalanıp
  oradan paylaşılır.)

## Notlar

- **Yalnızca Android.** iOS/web'de `requireOptionalNativeModule` `null`
  döndürür; yönetici `disabled` sonucu verir, uygulama çökmez.
- **TV'de kapalı** — Android TV'de paket yükleyici arayüzü yok.
- Expo Go çalışmaz (native modül yok); `expo run:android` / prebuild
  sonrası üretilen build gerekir.
- GitHub API: token yoksa saatlik 60 istek.
- Kurulum **başlatılır**, tamamlanmaz — onay sistem yükleyicisindedir.