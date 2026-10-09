# Icon & Splash Pipeline

StreamPulse ikonları tek kaynaktan üretilir: `brand.mjs` (tasarım) → `generate.mjs` (render) → `app.config.js` (bağlama).

```
npm run icons          # 3 varyant × 19 asset üretir → assets/icons/<release|preview|dev>/
npm run icons:preview  # 3 varyantı 16→256px karşılaştırmalı gösterir → assets/generated/preview/
npm run icons:verify   # config'teki HER yolun var + doğru boyutta olduğunu doğrular
```

## Tasarım — "Neon Play"

| Katman | Değer |
|---|---|
| Zemin | `#1B2434` → `#06080D` lineer degrade + üstte aksan rengi radial halo |
| Marka | Yuvarlatılmış play üçgeni, `#FFF1F3` → `#FF5C6C` → `#FF2D55` degrade + sheen |
| Nabız noktası | Varyant aksan rengi, hafif glow + beyaz highlight |
| Kenar | iOS maskesinin hemen içinde 3px `#FFFFFF` %10 iç çizgi |
| Bloom | Kasıtlı olarak zayıf — 16px'te şekle yem olmaması için |

Tüm marka içeriği **Android adaptive icon güvenli dairesinin** (108dp içinde 66dp) içindedir.
Bu sayede tek geometri hem iOS kare maskeye hem Android maskeley'e (daire / squircle / rounded-square) uyar.

## Varyantlar

`APP_VARIANT` ortam değişkenine göre ayrışır. **Marka şekli her zaman birebir aynıdır**; yalnızca aksan ve zemin tonu değişir.

| Variant | `APP_VARIANT` | Klasör | Aksan | Zemin tonu |
|---|---|---|---|---|
| release | *(yok)* / `release` | `assets/icons/release/` | `#22D3EE` camgöbeği | serin |
| preview | `preview` | `assets/icons/preview/` | `#A78BFA` mor | morumsu |
| dev | `development` | `assets/icons/dev/` | `#FFB020` amber | sıcak |

Splash'ta dev/preview varyantlarda ek olarak `PREVIEW` / `DEV` etiketi yazar.

## Üretilen dosyalar (varyant başına 19)

| Dosya | Boyut | Kullanım |
|---|---|---|
| `icon.png` | 1024×1024 opak | iOS + temel master (alpha kanalı **yok** — App Store şartı) |
| `icon-adaptive-foreground.png` | 1024×1024 | Android `<foreground>` |
| `icon-adaptive-background.png` | 1024×1024 opak | Android `<background>` |
| `icon-adaptive-monochrome.png` | 1024×1024 | Android 13+ themed icon (`<monochrome>`) |
| `splash-icon.png` | 1024×1024 | `expo-splash-screen` `image` (`imageWidth: 260`) |
| `notification-icon.png` | 96×96 | `expo-notifications` `icon` (tam beyaz) |
| `favicon.png` / `favicon-{16,32,48}.png` / `favicon.ico` | 48/48/32/16 | web favicon, `.ico` 3 çözünürlük gömülü |
| `tv-icon.png` | 1280×768 | Apple TV app icon |
| `tv-icon-small.png` · `tv-icon-small-2x.png` | 400×240 · 800×480 | Apple TV small icon |
| `tv-topshelf.png` · `-2x.png` | 1920×720 · 3840×1440 | Apple TV top shelf |
| `tv-topshelf-wide.png` · `-2x.png` | 2320×720 · 4640×1440 | Apple TV wide top shelf |
| `tv-banner.png` | 320×180 | Android TV banner |

## Nasıl çalışır

1. **`brand.mjs`** — geometri, palet, varyant tanımları ve SVG üreticileri. Tek doğruluk kaynağı.
2. **`generate.mjs`** — SVG'leri `sharp` (libRSVG) ile PNG'ye çevirir, favicon `.ico` konteynerini elle yazar,
   `assets/icons/manifest.json` üretir. Opak olması gerekenlerde `flatten()` uygular ve alpha varsa **hata verir**.
3. **`verify.mjs`** — `app.config.js`'i gerçekten çalıştırır (üç varyant için) ve referans edilen her dosyanın
   var olduğunu + beklenen piksel boyutunda olduğunu doğrular. Build öncesi çalıştırılabilir.
4. **`app.config.js`** — `VARIANT_DIR` + `iconPaths()` + `patchPlugins()` ile `APP_VARIANT`'a göre
   `icon`, `ios.icon`, `android.adaptiveIcon`, `web.favicon`, splash, notification ve tüm TV yollarını seçer.

## Yeni konsept / revizyon akışı

```bash
# 1. brand.mjs içindeki geometriyi değiştir (TRI / DOT / VARIANTS)
# 2. üret
npm run icons
# 3. gözle kontrol et
npm run icons:preview     # assets/generated/preview/preview.png
# 4. config bütünlüğünü doğrula
npm run icons:verify
# 5. native klasörü yenile (android/ gitignore'da olduğu için güvenli)
npm run clean:release     # = APP_VARIANT=release expo prebuild --clean
```

> **Önemli:** `assets/icons/` commit'lenir, `assets/generated/` edilmez. `sharp` devDependency'dır;
> CI'da `npm install` sonrası `npm run icons` deterministik olarak yeniden üretilebilir.
