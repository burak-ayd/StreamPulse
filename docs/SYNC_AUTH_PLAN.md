# Cihazlar Arası Senkronizasyon + Kullanıcı Hesabı — Uygulama Planı (v2)

> **Durum:** Sadece plan. Bu doküman kod içermez ve henüz hiçbir değişiklik yapılmamıştır.
> **Öncül:** `DEVICE_SYNC_PLAN.md` (sunucusuz LAN aktarımı, 2026-09-25)
> **Kapsam:** StreamPulse (React Native / Expo) + MovieAppNew (Python FastAPI)
> **Hazırlayan:** mimari araştırma, 2026-10-01
> **Değişikten sonra:** `DEVICE_SYNC_PLAN.md` arşivlenmeli — aşağıdaki §3 bunun nedenini açıklar.

---

## 0. Yönetici Özeti

**Yeni gereksinim:** Kullanıcı hesabı (giriş/çıkış/profil) + cihazlar arası senkronizasyon. Backend mevcut: `MovieAppNew`. Giriş uygulamada **zorunlu değil**, senkronizasyon için **zorunlu**. Tüm kullanıcı verisi senkronize olacak.

**En önemli tespit:** `DEVICE_SYNC_PLAN.md`, *"sunucu ve veritabanı olmadan"* çalışmak üzerine kurulmuş bir plan. Yeni gereksinim (backend + hesap) bu planın **taşıma, güvenlik, keşif ve platform izin katmanlarının tamamını geçersiz kılar.** Planın §2'sindeki *"arka plan senkronizasyonu sunucusuz imkânsızdır"* tezi artık doğru değildir.

| Eski planın katmanı | Durum |
|---|---|
| Katman 1 — Veri modeli (HLC, tombstone, merge) | ✅ **Ayakta kalıyor** — hatta daha da kritik |
| Katman 2 — Taşıma (react-native-tcp-socket, TLS, çerçeveleme) | ❌ **Geçersiz** — HTTPS ile değişiyor |
| Katman 3 — Keşif (mDNS, manuel IP) | ❌ **Geçersiz** — cihaz listesi sunucuda |
| Katman 4 — Eşleştirme (kısa kod, SAS, parmak izi, güven deposu) | ❌ **Geçersiz** — Supabase Auth JWT ile değişiyor |
| §2 — "Arka plan senkronizasyonu imkânsız" | ❌ **Yanlış** — sunucu var |
| §5 — iOS yerel ağ izinleri, Android 17 `ACCESS_LOCAL_NETWORK` | ❌ **Gerekmiyor** — LAN erişimi yok |
| §9 — WebRTC / mDNS / libp2p reddi | ❌ **Konu dışı** |
| Risk #1 — tcp-socket RN 0.86'da derlenmiyor | ✅ **Ortadan kalktı** |
| Risk #2 — Android TV'de üçüncü parti native ağ modülü | ✅ **Ortadan kalktı** |

**Planın en büyük iki riski (native modül uyumluluğu + Android TV) sunucu tabanlı senkronizasyonla tamamen yok oluyor.** Bu, planın kabul ettiği "en büyük teknik belirsizlik" maliyetinden kurtulmanın en ucuz yolu.

**Ne yapılacak (özet):**

1. **Faz 0** — Veri modeli: `deviceId`, HLC, tombstone, alan beyaz listesi, boyut kapakları. *Saf JS, sıfır bağımlılık.*
2. **Faz 1** — Backend temeli: `load_dotenv`, async Supabase, senkron tabloları.
3. **Faz 2** — Auth: Supabase Auth + JWT + `AuthContext` + giriş ekranları.
4. **Faz 3** — Senkronizasyon motoru: push/pull, delta, ilk-giriş birleştirme.
5. **Faz 4** — Tetikleyiciler + UX + çıkış semantiği.
6. **Faz 5** — Arka plan senkronizasyonu (opsiyonel, artık mümkün).

**Tahmini süre:** 12–18 gün (Faz 5 hariç: 11–15 gün)

---

## 1. Mevcut Durum — Her İki Repo

### 1.1 Backend (`MovieAppNew`) — FastAPI

| Bulgu | Kanıt | Etki |
|---|---|---|
| Auth **yok** — `client.auth` hiç kullanılmamış | `Core/Libs/Supabase.py:11,14,27,31` yalnızca `client.table(...)` | Sıfırdan başlanıyor, `supabase` bağımlılığı zaten var (`requirements.txt:25`) |
| **`load_dotenv()` API'de hiç çağrılmıyor** | `api/app.py:1-69` — projede tek çağrı `main__.py:10-11` | 🔴 `SUPABASE_URL` boş döner. **Auth eklemeden önce şart.** |
| `create_client` **senkron** | `Core/Libs/Supabase.py:6-9` — `def __init__`, 4 metot `def` | 🔴 `async def` route içinden çağrılırsa event loop bloklanır |
| `SupabaseManager` API'de **hiç instantiate edilmiyor** | Yalnızca `main__.py:29` | Bugün patlamıyor; auth ile patlar |
| `SUPABASE_KEY` tek değişken, rolü belirsiz | `Core/Libs/Supabase.py:8` — hem yazma hem okuma için | 🔴 service_role ise RLS anlamsız. Ayırılmalı. |
| CORS `allow_origins=["*"]` + `allow_credentials=True` | `api/app.py:47-53` | Mobilde sorun değil (RN CORS motoru çalıştırmaz), ama web istemcide credentialed açık |
| `response_model` **hiç kullanılmıyor** (13/13) | `api/routes/plugins.py:71-73` | Auth/sync için bilinçli istisna önerilir |
| `Depends` **hiç kullanılmıyor** (0) | — | `api/deps.py` adı tam bunun için konmuş |
| **API seviyesi test yok** | `tests/` sadece plugin/extractor, canlı ağ + `pytest.skip` | Auth/sync testleri için yeni alışkanlık |
| `pydantic` sabitlenmemiş | `requirements.txt:10` çıplak `pydantic`; kod `field_validator` kullanıyor | `pydantic>=2.7.0` yapılmalı |
| RLS muhtemelen kapalı | `PLAN.md` §4 DDL'inde hiç `CREATE POLICY` yok | Yeni tablolarda mutlaka açılmalı |

**Mevcut konvansiyonlar (yeni kod birebir uyacak):**
- `Core/` = `PascalCase.py` · `api/` = `lowercase.py`
- `router = APIRouter(prefix="/api", tags=["..."])` — `api/routes/plugins.py:30`
- `summary=` zorunlu, `detail` **daima Türkçe**, `raise ... from` yok — `plugins.py:130-133`
- Global lazy singleton — `api/deps.py:12-24`
- Pydantic: `model_config = ConfigDict(extra="allow")`, hizalı kolonlar, `__str__` → `model_dump_json(indent=4)` — `Core/Plugin/PluginModels.py:6-24`
- ⚠️ `PLAN.md:39` `SupabaseClient` diyor, **kod `SupabaseManager`** (4 import noktası kırılır). Ad **korunmalı**; `PLAN.md` hatalı.

### 1.2 Frontend (`StreamPulse`) — Expo SDK 57 / RN 0.86

**12 storage anahtarı** (`src/utils/storage.js:3-16`), 42 export. Kritik envanter:

| # | Key | Şema | Zaman damgası | Senkron? |
|---|---|---|---|---|
| 1 | `user_profile` | `{username, displayName, email, avatarUrl, bio, language, isPrivate, birthDate}` | ✅ `updatedAt` (`:84`) | ✅ blob |
| 2 | `user_favorites` | `{id,title,poster,type,plugin,url}` | ❌ **yok** | ✅ kayıt + tombstone |
| 3 | `user_watch_history` | `{...movie, watchedAt}` ≤50 | ✅ `watchedAt` (`:169`) | ✅ kayıt |
| 4 | `app_settings` | — | — | ❌ **ölü anahtar** (`:7`, tek kullanım yok) |
| 5 | `user_search_history` | `string[]` ≤20 | ❌ **yok** | ✅ blob |
| 6 | `app_player_settings` | 11 alan | ❌ **yok** | ✅ blob |
| 7 | `user_selected_platform` | `{id,name,website,is_active}` | ❌ **yok** | ✅ blob |
| 8 | `streampulse_downloads_list` | 12 alan, **`slice` yok** | ❌ yok | ⚠️ **karar gerekli** (§7.4) |
| 9 | `user_continue_watching` | 15 alan ≤50 | ✅ `updatedAt` (`:462`) | ✅ kayıt |
| 10 | `streampulse_plugin_visibility` | `{[plugin]: bool}` | ❌ **yok** | ✅ blob |
| 11 | `streampulse_category_visibility` | `{[plugin]:{[cat]:bool}}` | ❌ **yok** | ✅ blob |
| 12 | `user_watchlist` | **ham API nesnesi**, `slice` **yok** | ❌ **yok** | ✅ kayıt + alan beyaz listesi |
| +1 | `app_theme_preference` | `ThemeContext.js:8` — `storage.js` **dışında** | ❌ yok | ✅ blob |

**Kritik bulgular:**

1. **12 anahtarın tamamında read-modify-write yarış durumu.** `toggleFavorite` (`:115-126`), `toggleWatchlist` (`:733-744`) ve 9 fonksiyon daha `getItem → await → modify → setItem` deseni kullanıyor. Senkronizasyonla birlikte kalıcı veri kaybı riski.
   `setContentLibraryList` (`:832-843`) `Promise.all` ile **3 anahtara paralel** yazıyor → atomiklik yok.

2. **2 anahtar sınırsız.** `continueWatching` ≤50 (`:465`), `watchHistory` ≤50 (`:174`), `searchHistory` ≤20 (`:233`) — ama `toggleWatchlist` ve `saveDownloadItem` (`:380-394`) `slice` içermiyor. Watchlist ham API nesnesi + `seasons` saklıyor (`search.jsx:216-219`).
   → `DEVICE_SYNC_PLAN.md:15` "~100 KB" **ortalama** için makul, **üst sınır değil**. 5 watchlist kalemi tavanı aşar.

3. **Senkronizasyon sonrası UI bayat kalır.** 11 dosya `useFocusEffect` ile veri çekiyor; hiçbiri storage değişikliğine abone değil.

4. **`AsyncStorage.clear()` her şeyi siliyor** — `settings/index.jsx:223`. Oturum anahtarı da silinir.

5. **`getUserProfile()` sahte profil yazıyor.** `storage.js:65-68` ilk çalıştırmada `DEFAULT_PROFILE` (`username: "sinemasever"`, `email: "kullanici@cineverse.com"`) diske yazıyor. **Giriş öncesi profil mevcut.**

6. **Döngüsel import riski.** `api.js:1` storage import ediyor. `storage → sync → api → storage` zinciri Metro'da cycle oluşturur.

7. **`expo-secure-store` yok** (`package.json`) ama Expo Go'da çalışır ve Expo'nun TV listesinde `SecureStore` **doğrulanmış**. `npx expo install expo-secure-store`.

8. **Android TV mümkün.** Expo SDK 57 → `react-native-tvos@0.86-stable` (resmi uyumluluk tablosu). Proje zaten RN 0.86.3 kullanıyor → sürüm eşleşiyor. TV hedefi ayrı bir konfigürasyon işi, **bloklayıcı risk değil.**

9. **`expo-notifications` zaten kurulu** (`package.json:12`) ama TV listesinde **yok** → push tabanlı senkron tetikleme telefon/tablette çalışır, TV'de çalışmaz.

---

## 2. Yeni Mimari — Genel Bakış

### 2.1 Neden sunucu her şeyi değiştiriyor

```
┌──────────────────────────────────────────────────────────────────┐
│  StreamPulse (her cihaz)                                       │
│  ├── AsyncStorage (yerel kaynak — çevrimdışı tam çalışır)      │
│  ├── HLC + merge (saf JS, Faz 0)                               │
│  └── Sync Engine (delta push/pull)                             │
└───────────────┬──────────────────────────────────────────────────┘
                │ HTTPS + Bearer JWT
                │ (EXPO_PUBLIC_API_URL)
┌───────────────▼──────────────────────────────────────────────────┐
│  MovieAppNew — FastAPI                                          │
│  ├── /api/auth/*   → Supabase Auth (GoTrue)                    │
│  ├── /api/sync/*   → koşullu upsert + delta pull              │
│  └── Supabase Postgres                                           │
│      ├── user_profiles    (blob: profil)                        │
│      ├── user_documents   (blob: ayarlar)                       │
│      ├── user_library     (kayıt: favori/geçmiş/liste)          │
│      └── user_devices     (cihaz envanteri)                     │
└──────────────────────────────────────────────────────────────────┘
```

**Taşıma katmanı tamamen sadeleşiyor:** TCP + TLS + uzunluk öneki + çerçeveleme + sıkıştırma + zaman aşımı + eşleştirme + SAS + parmak izi + güven deposu + mDNS → **tek bir `fetch` çağrısı.**

### 2.2 Senkronizasyon stratejisi — iki model, hibrit

Sunucu **tüm otoriteler**: LWW kararını bir kez, merkezî olarak verir. Böylece iki cihaz aynı anda push etse bile sonuç deterministiktir.

| Veri tipi | Model | Neden |
|---|---|---|
| Favoriler, Listem, İzleme geçmişi, Kaldığın yerden | **Kayıt bazlı** (`user_library`) | Her içerik bağımsız birleşir; tombstone gerekir |
| Profil, Oynatıcı ayarları, Arama geçmişi, Tema, Platform, Görünürlük | **Belge bazlı** (`user_documents`) | Tek parça tercih; alan bazlı LWW ileride eklenebilir |

**Akış:**

```
PUSH  (cihaz → sunucu)
  1. Cihaz HLC'li kayıtlarını gönderir
  2. Sunucu mevcut satırla karşılaştırır:
     gelen HLC > mevcut HLC  →  uygula (kazanır)
     gelen HLC ≤ mevcut HLC  →  reddet + SUNUCU SÜRÜMÜNÜ DÖNDÜR
  3. Cihaz reddedilen kayıtları sunucu sürümüyle uzlaştırır

PULL  (sunucu → cihaz)
  1. Cihaz `?since=<son çekiş zamanı>` gönderir
  2. Sunucu o zamandan sonra değişen kayıtları döndürür
  3. Cihaz yerel veriyle birleştirir, diske yazar, UI'ı bilgilendirir
```

**Push reddi neden kritik:** Sessiz veri kaybını önler. Kaybeden cihaz, kazanan cihazın sürümünü öğrenip kendi verisini günceller — kullanıcı hiçbir şey kaybetmez.

### 2.3 HLC neden hâlâ gerekli

Sunucu olması saat sorununu **çözmez, sadece görünür kılar**. Cihaz saati 5 dk ileriyse ve kullanıcı gerçek zaman 10:00'da telefonu, 10:01'de tableti düzenlediyse:

- Tablet yazıyor → HLC `(10:01+5dk, c, tablet)` → sunucuya 10:06 olarak ulaşır
- Telefon 10:03'te yazdı → sunucuya 10:03 olarak ulaşır
- Sunucu karşılaştırır: **10:06 > 10:03 → tablet kazanır.** Yanlış.

HLC bunu çözer: telefon 10:03'te HLC üretir, tablet bağlandığında `update()` çağrısı HLC'yi 10:06'ya taşır, sonraki yazma 10:06'dan sonra olur. Saat kayması sınırlı bir farkı aşamaz, `(wall, counter, deviceId)` üçlüsü deterministik sıralama verir.

**HLC = ~50 satır saf JS. Faz 0'da yazılır, sunucu sadece 3 kolon saklar.**

---

## 3. `DEVICE_SYNC_PLAN.md` Neden Arşivlenmeli

Bu bölüm, eski plana harcanacak çabanın neden boşa gideceğini belgeler.

### 3.1 Temel varsayım tersine döndü

`DEVICE_SYNC_PLAN.md:0-5` *"sunucusuz"* ilan ediyor; `:11` *"Ortada sunucu ya da veritabanı olmayacak"* diyor; `:13` otomatik senkronizasyonu *"teknik olarak imkânsızdır"* diye reddediyor; `:149` eve gelmeden önce TV'de hazır olmasını *"plan kapsam dışı"* ilan ediyor.

Backend mevcut ve kullanılacak. Bu dört hükümün tamamı geçersiz.

### 3.2 Geçersiz kılan katmanlar

| Katman | Gerekçe |
|---|---|
| **Taşıma** (`transport/tcp.js`, `protocol.js`, `compress.js`) | TCP/TLS gereksiz; HTTPS var. `react-native-tcp-socket` bağımlılığı, Expo Go dışı kısıtı, uzunluk öneki kodunun tamamı iptal. |
| **Keşif** (`discovery/mdns.js`, `discovery/manual.js`, IP girişi) | Cihaz listesi sunucuda (`user_devices`). Kullanıcı "TV'yi seç" yerine "Şimdi senkronize et" diyor. |
| **Eşleştirme** (`pairing/shortCode.js`, `sas.js`, `trustStore.js`) | Kısa kod, SAS doğrulama, parmak izi pinleme, güven deposu — hepsi gereksiz. Supabase Auth parola hash'ler, JWT imzalar, oturumu yönetir. |
| **Platform izinleri** (§5.1 iOS, §5.2 Android, §5.3 TV) | LAN erişimi yok → `NSLocalNetworkUsageDescription`, `NSBonjourServices`, `CHANGE_WIFI_MULTICAST_STATE`, Android 17 `ACCESS_LOCAL_NETWORK` riski **tamamen yok**. |
| **Reddedilenler** (§9) | WebRTC, mDNS, libp2p, Gun.js — neden reddedildikleri sunucusuzluktu. O kısım çözdüğü için ret gerekçeleri düşüyor. |

### 3.3 Çözdüğü riskler

| Risk | Eski durum | Yeni durum |
|---|---|---|
| #1 `react-native-tcp-socket` RN 0.86'da derlenmiyor | Orta olasılık / Yüksek etki | ✅ **Ortadan kalktı** — HTTP kullanıyoruz |
| #2 Android TV'de üçüncü parti native ağ modülü | Orta-Yüksek / Yüksek | ✅ **Ortadan kalktı** |
| #3 Kullanıcı eşleştirme akışını atlıyor | Orta / Yüksek | ⚠️ Azaldı — tek ekran, tek düğme |
| #4 mDNS üreticiden üreticiye bozuk | Yüksek / Düşük | ✅ Ortadan kalktı |
| #7 Android 17 `ACCESS_LOCAL_NETWORK` | Düşük / Yüksek | ✅ Ortadan kalktı |
| #9 "Otomatik olsun" beklentisi | **Yüksek / Yüksek** | ✅ **Büyük ölçüde çözüldü** — arka plan senkronizasyonu artık mümkün (§7.5) |

**Eski planın kabul ettiği "en büyük teknik belirsizlik" (`:23`, `:458`) tam olarak sunucu tabanlı yaklaşımla yok oluyor.** Bu planın v2'si, o belirsizliği kabul etmek yerine ortadan kaldırmayı seçiyor.

### 3.4 Planlanan dosya yapısı değişiyor

`DEVICE_SYNC_PLAN.md:646-686`'daki yapıdan:

```
src/sync/
├── deviceId.js       ✅ kalır
├── hlc.js            ✅ kalır
├── schema.js         ✅ kalır
├── merge/*           ✅ kalır
├── transport/        ❌ SİLİNİR (tcp.js, protocol.js, compress.js)
├── pairing/          ❌ SİLİNİR (shortCode.js, sas.js, trustStore.js)
└── discovery/        ❌ SİLİNİR (manual.js, mdns.js)
src/app/(app)/devices/     ❌ SİLİNİR (pair.jsx, verify.jsx, transfer.jsx)
```

Yerine `src/services/sync.js` + `src/services/apiClient.js` + `src/context/SyncContext.jsx` + `src/app/(auth)/*` + `src/app/(app)/settings/sync.jsx` gelir.

---

## 4. Backend Planı — `MovieAppNew`

### 4.1 Dosya listesi

| Dosya | Durum | Sorumluluk |
|---|---|---|
| `api/app.py` | **DEĞİŞTİR** | `load_dotenv()` ekle (🔴 şart); CORS'u env tabanlı allowlist'e çevir; lifespan'de config doğrulama; yeni router'ları kaydet |
| `api/deps.py` | **DEĞİŞTİR** | `get_supabase_async()` lazy singleton; `get_current_user()` `Depends` bağımlılığı |
| `api/routes/__init__.py` | **DEĞİŞTİR** | `auth_router`, `sync_router` export |
| `api/routes/auth.py` | **YENİ** | `POST /api/auth/{signup,login,refresh,logout}`, `GET /api/auth/me` |
| `api/routes/sync.py` | **YENİ** | `POST /api/sync/push`, `GET /api/sync/pull`, cihaz uçları |
| `Core/Libs/SupabaseAuth.py` | **YENİ** | `acreate_client` async GoTrue sarmalayıcı; JWT yerel doğrulama |
| `Core/Libs/AuthModels.py` | **YENİ** | Pydantic v2 istek/yanıt modelleri (`PluginModels.py` kalıbı) |
| `Core/Libs/SyncModels.py` | **YENİ** | Pydantic v2 sync modelleri |
| `Core/Libs/Supabase.py` | **DEĞİŞTİR** | **Ad korunur.** `async def` metotlar eklenir (`user_library`, `user_documents`, `user_devices`) |
| `.env.example` | **DEĞİŞTİR** | `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_JWT_SECRET` / `CORS_ORIGINS` |
| `requirements.txt` | **DEĞİŞTİR** | `pydantic>=2.7.0` sabitle (başka auth bağımlılığı **gerekmiyor**) |
| `api_documentation.md` | **DEĞİŞTİR** | Endpoint tablosu + dosya yapısı |
| `tests/test_auth_api.py` | **YENİ** | `TestClient` ile API testi (mevcut `tests/` bu deseni kullanmıyor — yeni alışkanlık) |
| `tests/test_sync_merge.py` | **YENİ** | Koşullu upsert + delta çekme testleri |

### 4.2 Auth mimarisi kararı

**Seçim: Supabase Auth (GoTrue) + yerel JWT doğrulama.**

| Alternatif | Değerlendirme |
|---|---|
| **Supabase Auth** ✅ | `supabase` zaten bağımlılık (`requirements.txt:25`). Parola hash'leme, JWT imzalama, token yenileme, parola sıfırlama hazır. **Sıfır yeni bağımlılık.** |
| Kendi `users` tablosu + bcrypt + kendi JWT | ❌ Hash, salt, refresh, revocation, rate-limit, e-posta doğrulama — hepsi yazılmalı. `passlib`/`bcrypt` kurulu değil. İkinci kullanıcı deposu doğar. |
| `client.auth.get_user(jwt)` her istekte | ⚠️ Çalışır ama her istekte GoTrue'ya ağ turu (≈20–40 ms). |

**JWT doğrulama stratejisi:**
- **Birincil:** `SUPABASE_JWT_SECRET` + `python-jose` ile **yerel HS256 doğrulama** (`requirements.txt:28` zaten var). Ağ turu yok, hızlı.
- **Yedek:** `client.auth.get_user(jwt)` — secret yoksa devreye girer.
- Her ikisi de `async def`.

**Neden `Depends` ve `response_model` kullanılacak (bilinçli konvansiyon istisnası):**
- `api/deps.py` dosyasının adı tam bu iş için konmuş; `Depends` FastAPI'nin en doğal aracı.
- Token gövdesi ve sync red/g Kabul semantiği gizli kalmamalı — OpenAPI şeması belgelemeli.
- Bu, iki gerekçeli istisnadır; geri kalan her şey mevcut kalıba uyacak.

### 4.3 Supabase Auth kurulumu (Dashboard / SQL Editor)

Supabase Auth GoTrue kullanılacağı için:

1. **Authentication → Providers → Email** → açık (varsayılan)
2. **"Confirm email" → KAPALI.** Mobil uygulamada e-posta doğrulama ekranı istemiyoruz; kullanıcı anında giriş yapabilmeli. (Açık bırakılırsa her cihazda e-posta tıklama zorunluluğu doğar — senkronizasyon deneyimini bozar.)
3. **"Secure password change" → KAPALI** (aşırı zor parola kuralı koymasın)
4. Yeni kullanıcı kaydında `user_metadata` alanına `username`, `display_name` taşınır.

**Gerekçe:** Giriş zorunlu olmayan bir uygulamada, giriş yapan kullanıcıdan ek bir doğrulama adımı istemek, senkronizasyonun "tek ekran, tek düğme" vaadini bozar.

### 4.4 Veritabanı şeması

`PLAN.md` §4 stiliyle uyumlu: `CREATE TABLE IF NOT EXISTS`, `BIGSERIAL PRIMARY KEY`, `TIMESTAMPTZ DEFAULT NOW()`, `CREATE INDEX IF NOT EXISTS`, Türkçe satır-sonu yorumları.

```sql
-- ══════════════════════════════════════════════════════════════════
-- 5. Kullanıcı Profili
-- NOT: Kimlik doğrulama Supabase Auth (auth.users) tarafından yürütülür.
-- Bu tablo yalnızca uygulamaya özel profil alanlarını tutar.
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID PRIMARY KEY,                          -- auth.users.id ile birebir eşleşir
    username TEXT UNIQUE,                         -- giriş adı
    display_name TEXT,                            -- görünen ad
    avatar_url TEXT,                              -- profil fotoğrafı
    bio TEXT,                                     -- kısa tanıtım
    language TEXT DEFAULT 'tr',                   -- tercih edilen dil
    birth_date DATE,                              -- doğum tarihi
    is_private BOOLEAN DEFAULT FALSE,             -- profil gizliliği
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_username ON user_profiles(username);

-- ══════════════════════════════════════════════════════════════════
-- 6. Kullanıcı Belgeleri (blob senkronizasyon)
-- Her belge türü kullanıcı başına tek satırdır ve alan bazlı LWW ile birleşir.
-- Belge türleri: player_settings | search_history | theme | selected_platform
--                | plugin_visibility | category_visibility
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS user_documents (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    doc_type TEXT NOT NULL,                       -- yukarıdaki belge türü adı
    payload JSONB NOT NULL DEFAULT '{}'::JSONB,   -- belge içeriği
    hlc_wall BIGINT NOT NULL,                     -- HLC fiziksel zaman (ms)
    hlc_counter INTEGER NOT NULL DEFAULT 0,       -- HLC mantıksal sayaç
    device_id TEXT NOT NULL,                      -- son yazan cihaz (eşitlik bozucu)
    client_updated_at TIMESTAMPTZ,                -- istemcinin bildirdiği ISO zaman (denetim izi)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),          -- sunucu tarafı son değişim (delta sorgusu)
    CONSTRAINT unique_user_document UNIQUE (user_id, doc_type)
);

CREATE INDEX IF NOT EXISTS idx_user_documents_user_doc ON user_documents(user_id, doc_type);
-- Pull sorgularının ana erişim yolu
CREATE INDEX IF NOT EXISTS idx_user_documents_user_updated
    ON user_documents(user_id, updated_at DESC);

-- ══════════════════════════════════════════════════════════════════
-- 7. Kullanıcı Kütüphanesi (kayıt bazlı senkronizasyon)
-- Favoriler, Listem, İzleme Geçmişi ve Kaldığın Yerden burada tutulur.
-- is_deleted bir TOMBSTONE'dır: cihazlar arası silme aktarımı için zorunludur.
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS user_library (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    item_type TEXT NOT NULL
        CHECK (item_type IN ('favorite', 'watchlist', 'watch_history', 'continue_watching')),
    content_id TEXT NOT NULL,                     -- içerik kimliği (id veya url)
    payload JSONB NOT NULL DEFAULT '{}'::JSONB,   -- beyaz listeye uygun içerik alanları
    is_deleted BOOLEAN DEFAULT FALSE,             -- tombstone
    hlc_wall BIGINT NOT NULL,                     -- HLC fiziksel zaman (ms)
    hlc_counter INTEGER NOT NULL DEFAULT 0,       -- HLC mantıksal sayaç
    device_id TEXT NOT NULL,                      -- son yazan cihaz (eşitlik bozucu)
    client_updated_at TIMESTAMPTZ,                -- istemcinin bildirdiği ISO zaman (denetim izi)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),          -- sunucu tarafı son değişim (delta sorgusu)
    CONSTRAINT unique_user_item UNIQUE (user_id, item_type, content_id)
);

CREATE INDEX IF NOT EXISTS idx_user_library_user_type ON user_library(user_id, item_type);
CREATE INDEX IF NOT EXISTS idx_user_library_content_id ON user_library(content_id);
-- Pull sorgularının ana erişim yolu
CREATE INDEX IF NOT EXISTS idx_user_library_user_updated
    ON user_library(user_id, updated_at DESC);

-- ══════════════════════════════════════════════════════════════════
-- 8. Cihaz Envanteri
-- Kullanıcının hesabına bağlı cihazları listelemek ve iptal etmek için.
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS user_devices (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    device_id TEXT NOT NULL,                      -- cihazda üretilen kalıcı UUID
    device_name TEXT,                             -- örn: 'Salon TV', 'iPhone'
    platform TEXT,                                -- 'ios' | 'android' | 'web'
    app_version TEXT,                             -- örn: '1.0.0'
    is_current BOOLEAN DEFAULT FALSE,             -- bu isteği yapan cihaz
    last_pulled_at TIMESTAMPTZ,
    last_pushed_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,                       -- iptal edilmişse dolu
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_user_device UNIQUE (user_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_user_devices_user_id ON user_devices(user_id);

-- ══════════════════════════════════════════════════════════════════
-- 9. updated_at Tetikleyicileri
-- NOT: Mevcut crawler_state tablosunda bu tetikleyici YOK ve bu bir
-- latent hatadır — DEFAULT NOW() yalnızca INSERT'te uygulanır, PostgREST'in
-- ON CONFLICT DO UPDATE'i yalnızca gönderilen kolonları güncellediği için
-- updated_at hiçbir zaman güncellenmez. Tekrarlanmaması için burada şart.
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_profiles_updated_at ON user_profiles;
CREATE TRIGGER trg_user_profiles_updated_at
    BEFORE UPDATE ON user_profiles
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_user_documents_updated_at ON user_documents;
CREATE TRIGGER trg_user_documents_updated_at
    BEFORE UPDATE ON user_documents
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_user_library_updated_at ON user_library;
CREATE TRIGGER trg_user_library_updated_at
    BEFORE UPDATE ON user_library
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_user_devices_updated_at ON user_devices;
CREATE TRIGGER trg_user_devices_updated_at
    BEFORE UPDATE ON user_devices
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ══════════════════════════════════════════════════════════════════
-- 10. Satır Seviyesi Güvenlik (RLS)
-- Backend tek yazıcı olduğu için doğruluk için gerekli değildir; savunma
-- derinliği olarak durur. Supabase anon anahtarı varsayılan olarak
-- istemciden görünür olduğu için kişisel veri içeren tablolar açık bırakılmaz.
-- ══════════════════════════════════════════════════════════════════
ALTER TABLE user_profiles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_documents  ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_library    ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_devices    ENABLE ROW LEVEL SECURITY;
```

**Neden `is_deleted` (tombstone)?**
Favoriler bir "set"tir; kayıt fiziksel olarak silinmez, **işaretlenir.** Aksi halde cihaz A'nın sildiği kayıt, cihaz B'nin kopyası üzerinden bir sonraki `pull`'da geri gelir.

| Telefon | Tablet | Tombstone olmadan | Tombstone ile |
|---|---|---|---|
| Ekle | Ekle | ✅ Doğru | ✅ Doğru |
| Ekle | Sil | ⚠️ Belirsiz | ✅ Ekle kazanır |
| Sil | Sil | ⚠️ Silme kaybolur, tekrar eklenir | ✅ İkisi de silinmiş |

**Neden 3 kolon (`hlc_wall`, `hlc_counter`, `device_id`)?**
Sunucu LWW kararını deterministik vermeli. Sıralama anahtarı:
`(hlc_wall, hlc_counter, device_id)` leksikografik karşılaştırma. `device_id` son çare eşitlik bozucu — iki cihaz aynı HLC üretirse (nadir ama mümkün) hangisinin kazandığı cihaz kimliğiyle sabitlenir. **Karar sunucuda bir kez verildiği için tüm cihazlar aynı sonucu görür.**

**Neden `updated_at` ayrıca tutuluyor?**
`updated_at` **sunucu saatidir** ve delta (`?since=`) sorgusunun tek indeksidir. `client_updated_at` istemcinin bildirdiği ISO zamanıdır ve yalnızca denetim izi olarak kullanılır — karşılaştırmada kullanılmaz, çünkü cihaz saati güvenilmezdir.

---

## 5. API Sözleşmesi

Frontend ve backend bu sözleşmeyle bağımsız çalışabilir. İmza değişirse iki taraf da güncellenir.

### 5.1 Auth

```http
POST /api/auth/signup
Content-Type: application/json

{ "email": "user@example.com",
  "password": "••••••••",
  "username": "sinemasever",
  "display_name": "Sinema Sever" }
```
**200**
```json
{ "access_token": "eyJhbGciOi...",
  "refresh_token": "v1-refresh-...",
  "token_type": "bearer",
  "expires_in": 3600,
  "user": { "id": "uuid", "email": "user@example.com",
            "username": "sinemasever", "display_name": "Sinema Sever" } }
```
**400** `{ "detail": "Bu e-posta adresi zaten kayıtlı." }`
**409** `{ "detail": "Bu kullanıcı adı alınmış." }`

---

```http
POST /api/auth/login
{ "email": "user@example.com", "password": "••••••••" }
```
**200** → `signup` ile aynı gövde
**401** `{ "detail": "E-posta veya parola hatalı." }`

---

```http
POST /api/auth/refresh
{ "refresh_token": "v1-refresh-..." }
```
**200** → yeni `access_token` + `refresh_token`
**401** `{ "detail": "Oturumun süresi doldu. Lütfen tekrar giriş yap." }`

---

```http
POST /api/auth/logout
Authorization: Bearer <access_token>
```
**204** — refresh token iptal edilir

---

```http
GET /api/auth/me
Authorization: Bearer <access_token>
```
**200** → profil + cihaz listesi
**401** `{ "detail": "Oturum geçersiz." }`

### 5.2 Sync

```http
POST /api/sync/push
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "device": { "device_id": "uuid", "device_name": "iPhone 15 Pro",
              "platform": "ios", "app_version": "1.0.0" },
  "records": [
    { "item_type": "favorite", "content_id": "abc123",
      "payload": { "id":"abc123", "title":"Interstellar", "poster":"https://…",
                   "type":"movie", "plugin":"HDFilm", "url":"/film/…" },
      "is_deleted": false,
      "hlc": { "wall": 1760000000000, "counter": 42 },
      "device_id": "uuid",
      "client_updated_at": "2026-10-01T12:00:00.000Z" }
  ],
  "documents": {
    "player_settings": {
      "payload": { "seekDuration": 15, "autoPlay": false, "…": "…" },
      "hlc": { "wall": 1760000000000, "counter": 43 },
      "device_id": "uuid",
      "client_updated_at": "2026-10-01T12:00:05.000Z"
    }
  }
}
```
**200**
```json
{ "applied":    [ { "item_type":"favorite", "content_id":"abc123" } ],
  "rejected":   [ { "item_type":"favorite", "content_id":"xyz789",
                    "reason": "server_newer",
                    "server_version": {
                      "payload": { "…": "sunucudaki güncel sürüm" },
                      "is_deleted": true,
                      "hlc": { "wall": 1760000009999, "counter": 7 },
                      "device_id": "başka-cihaz" } } ],
  "documents_applied":  [ "player_settings" ],
  "documents_rejected": [ { "doc_type": "theme",
                           "reason": "server_newer",
                           "server_version": { "…": "…" } } ],
  "server_time": "2026-10-01T12:00:10.000Z" }
```

`rejected` listesi **sessiz veri kaybını önler.** Kaybeden cihaz, `server_version` ile kendi kaydını uzlaştırır ve kullanıcı hiçbir şey kaybetmez.

---

```http
GET /api/sync/pull?since=2026-10-01T08:00:00.000Z
Authorization: Bearer <access_token>
```
**200**
```json
{ "records":   [ { "item_type":"favorite", "content_id":"abc123",
                    "payload": { }, "is_deleted": false,
                    "hlc": { }, "device_id": "uuid",
                    "server_updated_at": "2026-10-01T09:00:00.000Z" } ],
  "documents": { "player_settings": { "payload": { }, "hlc": { } } },
  "deleted_content_ids": [ "eski-kayit-1" ],
  "server_time": "2026-10-01T12:00:10.000Z",
  "has_more": false }
```

**İlk giriş:** `since` yok → tam döküm (tüm veri).
**Sonraki:** `since=<son pull zamanı>` → delta.

---

```http
GET    /api/sync/devices      → bağlı cihaz listesi
DELETE /api/sync/devices/{device_id}  → cihazı iptal et
```

### 5.3 Hata semantiği

| Kod | Anlamı | İstemci davranışı |
|---|---|---|
| 400 | Geçersiz gövde | Göster, tekrar deneme yok |
| 401 | Oturum geçersiz / süresi dolmuş | Sessiz `refresh` dene, başarısızsa çıkış yap |
| 409 | Çakışma (kullanıcı adı alınmış) | Form hatası göster |
| 413 | Yük çok büyük | Kısmi gönder (batch böl) |
| 429 | Hız sınırı | Üstel geri çekilme |
| 5xx | Sunucu hatası | Yerel veri korunur, sessizce sonra dene |

---

## 6. Frontend Planı — `StreamPulse`

### 6.1 Faz 0 — Veri Modeli (sıfır bağımlılık, Expo Go)

`DEVICE_SYNC_PLAN.md` Faz 0'ının taşıma katmanından arındırılmış hâli. **Bu faz değişmedi, önceliği arttı** — sunucu şeması HLC tuple'ına bağlı.

| Dosya | Durum | Sorumluluk |
|---|---|---|
| `src/utils/storage.js` | **DEĞİŞTİR** | Şema + zaman damgası; **42 public API korunur** |
| `src/utils/hlc.js` | **YENİ** | Hybrid Logical Clock (saf JS, ~50 satır) |
| `src/utils/deviceId.js` | **YENİ** | Kalıcı UUID üretimi + cihaz adı |
| `src/utils/schemaVersion.js` | **YENİ** | Sürümleme + ileri uyumlu alan koruma |
| `src/utils/fieldWhitelist.js` | **YENİ** | Senkronize edilecek alan beyaz listesi |
| `src/utils/storageListener.js` | **YENİ** | Abonelik + `useSyncExternalStore` |
| `src/utils/merge/favorites.js` | **YENİ** | Set-birleştirme (add-wins) + tombstone |
| `src/utils/merge/library.js` | **YENİ** | Watchlist / history / continue-watching LWW |
| `src/utils/merge/documents.js` | **YENİ** | Alan bazlı LWW (profil, ayarlar, görünürlük) |
| `src/utils/migrate.js` | **YENİ** | Geriye uyumlu dönüşüm (eski → yeni şema) |
| `__tests__/merge.test.js` | **YENİ** | Birleştirme test paketi (§8.1) |

**Zorunlu kazanımlar:**

1. **`deviceId`** — UUID, AsyncStorage'da kalıcı. Cihaz adı kullanıcı tarafından düzenlenebilir.
2. **HLC** — `{wall, counter}`. `now()` / `update()` / `compare(a,b)` saf fonksiyonlar.
3. **Zaman damgası** — 3 anahtara (`favorites`, `search_history`, `player_settings` + diğer 6'sı) eklenecek:
   - Favoriler: `{...movie, _hlc, _deviceId, _deleted}` — tombstone silme kaydı
   - Arama geçmişi: `string[]` → `[{q, _hlc, _deviceId}]`
   - Ayarlar/görünürlük: `{...değerler, _hlc, _deviceId}`
4. **Alan beyaz listesi** — `search.jsx:216-219` ham API nesnesini yayıyor, `seasons` dahil. Senkronize edilen kayıtta `seasons`/`episodes` **olmayacak**.
   Beyaz liste: `id, url, title, poster, type, plugin, year, season, episode, seriesId, seriesTitle, episodeTitle, currentTime, duration, progress, watchedAt, isCompleted`
5. **Boyut kapakları** — `watchlist` ve `downloads` `slice` içermiyor. `slice(0, 100)` eklenecek.
6. **Read-modify-write serileştirme** — `toggleFavorite`/`toggleWatchlist`/9 fonksiyon daha `getItem → await → setItem` yapıyor. Tek bir `mutate(key, fn)` yardımcısına toplanacak; yazma sırası JS tarafında kuyruklanacak (AsyncStorage aynı anahtar için sıralama garantisi vermez).
7. **`storageListener`** — `subscribe(fn)` + `useSyncExternalStore` hook'u. Senkron sonrası 11 `useFocusEffect` ekranı bayat kalmasın.
8. **Geriye uyumlu migrasyon** — `migrate.js` mevcut ham veriyi yeni şemaya çevirir. `app_settings` (`storage.js:7`, ölü anahtar) ve `app_theme_preference` (`ThemeContext.js:8`) dahil.
9. **`clearAllUserData()`** — `settings/index.jsx:223` `AsyncStorage.clear()` yerine geçecek. Oturum anahtarı hariç tutulacak.

**Başarı kriterleri:**
- Mevcut AsyncStorage verisi kayıpsız okunuyor
- Birleştirme **sıra bağımsız** (aynı veri farklı sırada → aynı sonuç) — bu, sessiz veri bozulmasının tek önlemi
- Birleştirme **idempotent** (aynı veri iki kez → aynı sonuç)
- Saat farkı senaryosu HLC ile doğru sonucu veriyor
- Tombstone çakışma senaryoları doğru

### 6.2 Faz 2 — Auth

| Dosya | Durum | Sorumluluk |
|---|---|---|
| `src/services/apiClient.js` | **YENİ** | Token'lı `fetch` sarmalayıcı + 401 → `refresh` → tekrar dene |
| `src/services/token.js` | **YENİ** | SecureStore erişimi; `storage.js`'den bağımsız (döngüsel import önleme) |
| `src/context/AuthContext.jsx` | **YENİ** | Oturum durumu; `PlayerSettingsContext.jsx` kalıbı |
| `src/app/(auth)/_layout.jsx` | **YENİ** | Oturum varsa `(app)`'e yönlendir |
| `src/app/(auth)/login.jsx` | **YENİ** | Giriş ekranı |
| `src/app/(auth)/register.jsx` | **YENİ** | Kayıt ekranı |
| `src/app/(app)/profile/index.jsx` | **DEĞİŞTİR** | Giriş/çıkış durumu + oturum kartı |
| `src/app/_layout.jsx` | **DEĞİŞTİR** | `AuthProvider` ekle |
| `app.json` | **DEĞİŞTİR** | `expo-secure-store` plugin |

**Provider sırası** (`_layout.jsx`):
```
ThemeProvider → AuthProvider → PlayerSettingsProvider → SafeAreaProvider → <Slot/>
```
`AuthProvider`, `PlayerSettingsContext.jsx`'ten **önce** gelmeli — `PlayerSettingsProvider` senkron tetiklemesi başlatabilir.

**Giriş zorunlu değil — bu kritik:**
`(auth)` grubu **root seviyesinde** kalmalı (`src/app/(auth)/`). `(app)/_layout.jsx` içine `Redirect` konursa oturum zorlanır ve `useFocusEffect` tabanlı ekranlar bozulur. Giriş **herhangi bir ekrandan** tetiklenebilmeli, engelleyici olmamalı.

**Sahte profil gerçek hesapla değişimi:**
`storage.js:43-52` `DEFAULT_PROFILE` (`username: "sinemasever"`, `email: "kullanici@cineverse.com"`) ilk çalıştırmada diske yazılıyor (`:65-68`). Oturum açıldığında:
- `username` → hesabın gerçek `username`'i
- `email` → hesabın gerçek e-postası
- `displayName`, `avatarUrl`, `bio`, `language`, `isPrivate`, `birthDate` → sunucudan gelir (mevcut `EditProfile.jsx:31-38` alanlarıyla birebir eşleşir)

**`expo-secure-store` kurulumu:**
```
npx expo install expo-secure-store
```
`app.json` → `plugins`: `["expo-secure-store", { "faceIDPermission": "..." }]`, `ios.config.usesNonExemptEncryption: false`

Expo Go'da çalışır, Android TV'de doğrulanmış. **Sadece token saklanmalı** — iOS ~2048 bayt sınırı. Veri AsyncStorage'da kalır.

**Bu aşamada senkronizasyon YOK.** Giriş çalışır, profil sunucudan gelir, favoriler hâlâ yerelde. Bu, Faz 0 ve Faz 2'nin bağımsız test edilebilmesi için önemli.

### 6.3 Faz 3 — Senkronizasyon Motoru

| Dosya | Durum | Sorumluluk |
|---|---|---|
| `src/services/sync.js` | **YENİ** | push/pull orkestrasyonu; kuyruk, yeniden deneme, backoff |
| `src/context/SyncContext.jsx` | **YENİ** | Durum makinesi + abonelik (`idle`/`syncing`/`offline`/`error`) |
| `src/app/(app)/settings/sync.jsx` | **YENİ** | Senkronizasyon ekranı |
| `src/app/(app)/settings/index.jsx` | **DEĞİŞTİR** | "Cihazlar ve Senkronizasyon" satırı |
| `src/services/api.js` | **DEĞİŞTİR** | 9 doğrudan `fetch` → `apiClient` üzerinden |

**Import zinciri kuralı (döngüsel import önleme):**
```
storage.js  →  sync.js  →  token.js  →  SecureStore
     ↑                        ↑
     └── api.js ──────────────┘   (storage'ı okur, sync'i BİLMEZ)
```
`api.js`'den `sync`'e **hiçbir import yapılmayacak.** `api.js:1` storage import ediyor; ters yönde bağ kurulursa Metro'da cycle oluşur.

**Push kuyruğu:**
Her senkronize yazma işlemi kuyruğa alınır. `nudge()` çağrısı: kuyruk boşsa → hemen gönder; doluysa → 2 sn debounce. Çevrimdışıysa → kuyruk birikir, bağlantı gelince boşalır. Yerel veri **her zaman** önce diske yazılır; push asla yazmayı bloklamaz.

**Pull sonrası UI:**
`storage.js` yazınca `storageListener` yayın yapar → `useSyncExternalStore` aboneleri güncellenir → `profile/index.jsx`, `library.jsx`, `index.jsx` `useFocusEffect`'e gerek kalmadan yenilenir. **Bu, "bayat UI" riskinin çözümüdür.**

### 6.4 Faz 4 — Tetikleyiciler ve UX

**Otomatik senkronizasyon tetikleyicileri:**

| Tetikleyici | Koşul |
|---|---|
| Uygulama açılışı | `AppState` → `active` |
| Oturum açıldı | `login()` sonrası: önce pull, sonra push |
| Manuel | Ayarlar → "Şimdi senkronize et" |
| Veri yazıldı | Debounce 2 sn, kuyruk boşsa |
| 30 dk aralık | Uygulama ön plandayken (`AppState` `active`) |
| Arka plan | **Faz 5** — `expo-task-manager` |

**Çıkış semantiği (§7.1):** Oturum kapatıldığında yerel veri **korunur**. Ayarlar ekranındaki "Bu cihazdaki verileri sil" kutusu ayrı ve varsayılan **kapalı**.

**Senkronizasyon ekranı (`settings/sync.jsx`):**
- Durum: Son senkronizasyon zamanı, bekleyen kayıt sayısı
- Eylem: "Şimdi senkronize et" (primary), "Bu cihazdaki verileri sil" (destructive)
- Cihaz listesi: ad + platform + son görülme + iptal
- Çakışma günlüğü: son reddedilen kayıtlar (şeffaflık)

**Ayarlar satırı** (`settings/index.jsx`, mevcut "Güncellemeler ve Yedekleme" satırının kopyası):
```jsx
<SettingRow
	icon="phone-portrait-outline"
	iconBg="#7C3AED"
	label="Cihazlar ve Senkronizasyon"
	subtitle={isLoggedIn ? "Favoriler ve listeler diğer cihazlarınızla paylaşılıyor" : "Giriş yapın, verileriniz cihazlar arasında eşitlensin"}
	badgeText={syncBadge}
	badgeColor={isSynced ? "#10B981" : undefined}
	onPress={() => router.push("/(app)/settings/sync")}
/>
```

### 6.5 Faz 5 — Arka Plan Senkronizasyonu (opsiyonel)

Eski planın "imkânsız" dediği şey artık mümkün. Yine de platform kısıtları geçerli:

| Platform | Durum | Not |
|---|---|---|
| Android | `expo-task-manager` + `BackgroundFetch` | Doze kısıtları devrede |
| iOS | `expo-background-task` (BGTaskScheduler) | Yeni build gerektirir |
| Android TV | ✅ `TaskManager` + `BackgroundTask` TV listesinde | Yine de TV uygulaması çalışmayabilir — **kullanıcı tetikli yol kalıcı olmalı** |

**Push ile uzaktan tetikleme:** `expo-notifications` zaten kurulu (`package.json:12`) → sunucu bir değişiklik algıladığında "Yeni cihaz senkronize edildi" bildirimi gönderilebilir. **Ancak `expo-notifications` TV listesinde yok** → bu kanal yalnızca telefon/tablette çalışır, TV'de kullanıcı uygulamayı açıp "Şimdi senkronize et" demelidir.

**Faz 5 opsiyoneldir. Faz 0–4 tamamlandığında ürün çalışır.** Arka plan senkronizasyonu kullanıcı deneyimini iyileştirir, mümkün kılmaz.

### 6.6 Android TV Hedefleme (auth/sync'tan bağımsız)

Senkronizasyon mimarisi TV'yi hiç engellemiyor — aynı HTTP, aynı token, aynı kod yolu. TV'yi bir hedef olarak derlemek ayrı bir yapılandırma işi:

```json
// package.json — Expo SDK 57 → React Native TV 0.86-stable
"dependencies": {
  "react-native": "npm:react-native-tvos@0.86-stable"
}
```
Proje RN **0.86.3** kullanıyor (`package.json:32`) → SDK 57'nin gerektirdiği TV fork sürümüyle **birebir eşleşiyor.**

```sh
npx expo install @react-native-tvos/config-tv -- --dev
# app.json → "plugins": ["@react-native-tvos/config-tv"]
```
```sh
# TV build
set EXPO_TV=1 && npx expo prebuild --clean && npx expo run:android
# Telefona dönüş
set EXPO_TV= && npx expo prebuild --clean && npx expo run:android
```

`eas.json` **yok** (projede) → `development_tv` / `preview_tv` profilleri eklenmeli.

**TV'de test edilecek tek auth/sync farkı:** `expo-notifications` TV listesinde olmadığı için push bildirimi gelmez. Kullanıcı uygulamayı açtığında `AppState → active` tetikleyicisi zaten çalışır — yani TV'de de otomatik senkron olur, sadece "uzaktan uyarı" gelmez.

---

## 7. Kritik Ürün Kararları

Bu dört soru, kod yazılmadan cevaplanmalı. Her biri veri kaybı riski taşıyor.

### 7.1 Çıkış yapınca yerel veri ne olacak?

| Seçenek | Sonuç |
|---|---|
| A) Yerel veri korunur, oturum kapanır | ✅ **Önerilen.** Veri kaybı yok. Kullanıcı anonim kullanmaya devam eder, senkron durur. |
| B) Yerel veri silinir | ⚠️ Geri dönüşü yok. Kullanıcı çıkış yapınca verisini kaybettiğini fark eder. |
| C) Kullanıcıya sor | ⚠️ Ek ekran, karar karmaşıklığı |

**Karar: A.** Ayarlarda ayrı ve **varsayılan kapalı** bir "Bu cihazdaki verileri sil" seçeneği bulunur.

### 7.2 İlk girişte yerel (misafir) veri ne olacak?

Kullanıcı 2 yıllık yerel favorisiyle ilk kez giriş yapıyor. Sunucu boş.

| Seçenek | Sonuç |
|---|---|
| A) Yükle ve birleştir | ✅ **Önerilen.** Favoriler birleşim + tombstone; listeler LWW. Hiçbir şey kaybolmaz. |
| B) Kullanıcıya sor: "Yükle / Sil" | ✅ **En iyisi** — şeffaf, ama bir ekran |
| C) Üzerine yaz | ❌ Veri kaybı |

**Karar: B, A varsayılanıyla.** Girişten sonra tek seferlik bir sheet: *"Bu cihazdaki 47 favori, 12 izleme kaydı ve 3 liste hesabınızla paylaşılsın mı?"* → [Paylaş] [Hayır, sil]

**Neden LWW burada doğru:** Cihazın verisi HLC'li, yeni `deviceId`'li → sunucuya yazılır. Başka bir cihaz zaten senkronize ise `user_library`'de aynı `content_id` için iki satır olur; HLC sıralaması hangisinin geçerli olduğunu belirler. Favorilerde birleşim (add-wins) olduğu için hiçbir favorili kaybolmaz.

### 7.3 Aynı içerik iki cihazda farklı durumda

Örnek: telefonda "Inception" favori, tablette favorilerden çıkarılmış.

HLC + tombstone ile çözülür: **kazanan cihazın kararı sunucuda kesinleşir**, `rejected` yanıtıyla diğer cihaza bildirilir. Kullanıcı bir şey görmez; iki cihaz da aynı sonuca varır.

Tombstone yaşam süresi: `is_deleted = true` kayıtları **90 gün** sonra temizlenebilir. Bu, bir cihazın 3 ay sonra çevrimiçi olduğunda eski bir silmeyi yanlışlıkla uygulamasını engeller.

### 7.4 İndirilenler senkronize edilsin mi?

`DEVICE_SYNC_PLAN.md:0-5` sunucusuz olduğu için indirmeler cihazda kalıyordu. Şimdi sunucu var, ama indirme dosyaları yine cihaza özgü.

| Seçenek | Sonuç |
|---|---|
| A) Senkronize **etme** | ✅ **Önerilen.** `streampulse_downloads_list` içindeki dosya yolları (`localUri`) cihazlar arası geçersizdir. |
| B) Sadece **meta veri** senkronize et | ⚠️ "Hangi dizi indirilmiş" bilgisi taşınır, dosya yolu taşınmaz. Alıcı cihaz "yeniden indir" isteyebilir. |
| C) Tam senkronizasyon + indirme | ❌ Veri trafiği pahalı, offline kullanım kırılır. |

**Karar: A (artık).** `streampulse_downloads_list` senkron kapsamı dışında — dosya yolları cihazaya özgü ve taşınamaz. `OFFLINE_DOWNLOAD_PLAN.md`'deki mimariyle uyumlu.

> **Emin değilsen B'yi değerlendir.** "Bu dizi telefonda indirilmiş" bilgisi farklı bir cihazda işe yarar olabilir. Karar senin; kod etkisi küçük (bir `SYNCABLE_KEYS` listesinden çıkarma).

---

## 8. Test Planı

### 8.1 Faz 0 — Birleştirme testleri (saf, ağ yok)

En kapsamlı paket burada — ağ bağımsız, en düşük risk.

| Test | Doğrulama |
|---|---|
| Boş + boş | Sonuç boş, hata yok |
| Tek taraf dolu | Diğer taraf doğru kopyalar |
| Aynı veri iki cihazda | Idempotent |
| Saat farkı (biri 5 dk ileri) | HLC doğru cihazı seçiyor |
| Favori ekleme + silme çakışması | Tombstone doğru sonucu veriyor |
| Silme kaydının çift uygulanması | Idempotent |
| 3+ cihaz birleştirme | Sıra bağımsız, aynı sonuç |
| Şema sürümü uyuşmazlığı | Bilinmeyen alanlar korunuyor |
| Eski format veri | Kayıpsız okunuyor |
| Bozuk JSON | Çökmüyor, varsayılana dönüyor |
| `seasons` alanı | Kayıtta yok (beyaz liste) |
| Boyut kapağı | `watchlist` 100'de kesiliyor |

**Kritik test — sıra bağımsızlık.** Birleştirme sonucu verinin geliş sırasından bağımsız olmalı. Aksi halde cihazlar farklı sonuçlara varır ve veri sessizce bozulur.

### 8.2 Backend testleri (yeni alışkanlık)

Mevcut `tests/` **API testi içermiyor** (plugin/extractor testleri canlı ağ + `pytest.skip`). Auth/sync için `fastapi.testclient.TestClient` kalıbı kurulmalı:

| Test | Ortam |
|---|---|
| `signup` → `me` → `logout` akışı | `TestClient` + gerçek Supabase (ya da mock) |
| Geçersiz parola → 401 | `TestClient` |
| Token'sız `/sync/pull` → 401 | `TestClient` |
| Push → aynı kaydı tekrar push → `rejected` | `TestClient` + Supabase |
| `since` delta → yalnızca değişen kayıtlar | `TestClient` + Supabase |
| İki cihaz yarış push → deterministik sonuç | `TestClient` + Supabase |
| `user_id` izolasyonu: A'nın verisi B'ye görünmez | 🔴 kritik |
| Sürüm uyuşmazlığı → 400 | `TestClient` |

### 8.3 Entegrasyon — gerçek cihaz zorunlu

| Test | Ortam |
|---|---|
| Telefon → TV senkron | **Fiziksel cihaz** |
| TV → telefon senkron | **Fiziksel cihaz** |
| İki cihaz aynı anda favori ekler/çıkarır | İki fiziksel cihaz |
| Çevrimdışı cihaz → çevrimiçi | Cihaz kapatılıp açılır |
| Aynı anda iki cihaz oynatıcı ayarı değiştirir | LWW'nin hangisini seçtiğini doğrula |
| Token süresi dolarken senkron | Otomatik `refresh` doğrulanır |
| Büyük veri seti (100 watchlist + 50 history) | Toplam boyut sınırı |

**Bu planın en büyük kazancı:** Artık mDNS/multicast/yerel ağ yok. **İki cihaz aynı WiFi'da olmak bile gerekmiyor** — internet yeterli. Test ortamı çok daha kolay.

### 8.4 Platform matrisi

| Cihaz | OS | Öncelik |
|---|---|---|
| Android TV | Android 14+ | **Yüksek** — hedefler arasında en farklı deneyim |
| iPhone | iOS 18+ | Yüksek |
| Android telefon | Android 15/16 | Orta |
| iPad | iOS 18+ | Orta |

---

## 9. Riskler

| # | Risk | Olasılık | Etki | Azaltma |
|---|---|---|---|---|
| 1 | **Yarış koşulunda veri kaybı** (aynı anda push) | Orta | Yüksek | Sunucuda koşullu upsert + `rejected` yanıtı. Push asla sessizce ezme yapmaz. Faz 0 testleri sıra bağımsızlığını kanıtlar. |
| 2 | **Mevcut veri kaybı** (şema geçişi) | Düşük | Yüksek | `migrate.js` geriye uyumlu dönüşüm + birim testi. Faza başlamadan önce AsyncStorage yedeği. |
| 3 | **`SUPABASE_KEY` service_role ise** ve sızarsa RLS anlamsız | Düşük | Yüksek | `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` ayrımı + RLS açılması. Anahtar hiçbir zaman istemciye gitmez. |
| 4 | **Oturum tokenı sızarsa** veri okunur | Düşük | Yüksek | SecureStore (Keychain/Keystore) + kısa ömürlü access token + `refresh` rotation + logout'ta iptal. |
| 5 | **Sınırsız liste taşması** (watchlist/downloads) | Yüksek | Orta | `slice(0,100)` + alan beyaz listesi. `seasons` kaydedilmiyor. |
| 6 | **Senkron sonrası UI bayat** | Yüksek | Düşük | `storageListener` + `useSyncExternalStore`. 11 ekran abone olur. |
| 7 | **`AsyncStorage.clear()` oturumu siler** | Yüksek | Orta | `clearAllUserData()` session anahtarını hariç tutar. |
| 8 | **Android TV'de `expo-notifications` yok** → push tetikleme çalışmaz | Yüksek | Düşük | TV'de kullanıcı tetikli senkron zaten kabul (`§6.5`). Telefon/tablette push çalışır. |
| 9 | **E-posta doğrulama akışı kullanıcıyı yorar** | Orta | Orta | Supabase Dashboard'da "Confirm email" kapatılır (`§4.3`). |
| 10 | **Sunucu çökerse senkron durur** | Düşük | Düşük | Yerel veri her zaman tam çalışır. Senkronizasyon degrade eder, uygulama etkilenmez. |
| 11 | **İlk girişte veri birleştirme kafa karıştırıcı** | Düşük | Orta | Onay sheet'i (`§7.2`) + birleştirme sonrası özet ("12 kayıt eklendi"). |
| 12 | **`pydantic` sürüm belirsizliği** | Orta | Orta | `pydantic>=2.7.0` sabitle; kod `field_validator`/`ConfigDict` kullanıyor (Pydantic 2 API'si). |
| 13 | **Cihaz sayısı sınırsız büyürse `user_library` şişer** | Düşük | Düşük | Kullanıcı başına satır sayısı = favori + liste + geçmiş. 3 cihaz, 500 kayıt → sorun yok. `pull` delta + `has_more` sayfalama hazır. |

**Eski planın Risk #9'u ("otomatik olsun" beklentisi — Yüksek/Yüksek) büyük ölçüde çözüldü:** arka plan senkronizasyonu artık mümkün (Faz 5). Yine de iOS/Android kısıtları geçerli; TV'de kullanıcı tetikli kalacak.

---

## 10. Uygulama Sırası

### Başlangıçta (Faz 0)

- [ ] AsyncStorage yedeği al
- [ ] `hlc.js`, `deviceId.js`, `schemaVersion.js`
- [ ] `fieldWhitelist.js` + boyut kapakları
- [ ] `storage.js` şema + zaman damgası + `mutate()` kuyruğu
- [ ] `merge/*` (favorites + tombstone, library, documents)
- [ ] `migrate.js` geriye uyumlu dönüşüm
- [ ] `storageListener.js` + `useSyncExternalStore`
- [ ] `clearAllUserData()` (session hariç)
- [ ] Birleştirme testleri (§8.1)

### Backend temeli (Faz 1)

- [ ] `api/app.py` → `load_dotenv()` 🔴
- [ ] `.env.example` + `.env` → `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_JWT_SECRET` / `CORS_ORIGINS`
- [ ] CORS → env tabanlı allowlist; `allow_credentials=False` (Bearer token)
- [ ] §4.4 DDL'ini Supabase SQL Editor'da çalıştır
- [ ] Supabase Auth: "Confirm email" kapat
- [ ] `Core/Libs/SupabaseAuth.py` (async, `acreate_client`)
- [ ] `Core/Libs/Supabase.py` → async metotlar
- [ ] `requirements.txt` → `pydantic>=2.7.0`
- [ ] `Core/Libs/AuthModels.py`, `Core/Libs/SyncModels.py`

### Doğrulama kapıları

| Kapı | Kriter |
|---|---|
| **Faz 0 → Faz 1** | Birleştirme testleri geçti; mevcut veri kayıpsız; sıra bağımsız |
| **Faz 1 → Faz 2** | `GET /` çalışıyor; `load_dotenv` sonrası Supabase erişilebilir; DDL çalıştırıldı |
| **Faz 2 → Faz 3** | `signup → login → me → logout` uçtan uca; 401 koruması; `user_id` izolasyon testi |
| **Faz 3 → Faz 4** | İki cihaz arası push/pull; çakışma senaryosu deterministik; `rejected` uzlaştırması çalışıyor |
| **Faz 4 → Faz 5** | Senaryolar fiziksel cihazda doğrulandı ( telefon + TV) |

### Bağımlılık sırası

```
Faz 0 (veri modeli)  ──►  Faz 1 (backend temeli)  ──►  Faz 2 (auth)
                                   │                          │
                                   └──────────┬───────────────┘
                                              ▼
                                        Faz 3 (senkron motoru)
                                              │
                                              ▼
                                        Faz 4 (tetikleyici + UX)
                                              │
                                              ▼
                                        Faz 5 (opsiyonel: arka plan)
```

**Faz 0 hemen başlamalı.** Sunucu şeması (§4.4) HLC tuple'ına ve alan beyaz listesine bağlı — bu belirlenmeden DDL yazılamaz. Ayrıca Faz 0 tek başına değer üretir: veri modeli iyileştirilmiş, testleri var, hiçbir bağımlılık getirmiyor, Expo Go'da çalışıyor.

---

## 11. `DEVICE_SYNC_PLAN.md` ile İlişki

**Arşivlenmeli — kalıcı olarak kullanılmamalı.** Aşağıdaki bölümler geçerli ve referans alınabilir:

| Bölüm | Durum |
|---|---|
| §1.2 — 3 anahtarda birleştirme metadatası yok | ✅ **Hâlâ doğru** — bu, Faz 0'ın tamamı |
| §1.3 — `app.json` eksik alanlar | ⚠️ **Artık geçersiz** — LAN izinleri gerekmiyor. Sadece `expo-secure-store` |
| §3.3 — HLC ve cihaz kimliği | ✅ **Hâlâ doğru** |
| §3.3 — Favoriler için tombstone | ✅ **Hâlâ doğru** — sunucu DDL'ine de girdi |
| §3.3 — Şema sürümleme | ✅ **Hâlâ doğru** |
| §8.1 — Birleştirme test matrisi | ✅ **Hâlâ doğru** — §8.1'e kopyalandı |
| §2 — Otomatik senkronizasyon imkânsız | ❌ **Yanlış** |
| §3.2–3.6 — Taşıma, keşif, eşleştirme | ❌ **Geçersiz** |
| §5 — Platform izinleri | ❌ **Gerekmiyor** |
| §6 — Güvenlik modeli (kısa kod, SAS) | ❌ **Geçersiz** — Supabase Auth |
| §9 — Reddedilen yaklaşımlar | ❌ **Konu dışı** |
| §4 — 5 fazlı uygulama planı | 🔄 **Yeniden yazıldı** — bu doküman |

---

## 12. Ek Kaynaklar

**Backend**
- Supabase Auth Python SDK: https://supabase.com/docs/reference/python/auth
- GoTrue JWT doğrulama: https://supabase.com/docs/guides/auth/jwts
- Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
- FastAPI Security — HTTPBearer: https://fastapi.tiangolo.com/tutorial/security/

**Frontend**
- Expo SecureStore: https://docs.expo.dev/versions/v57.0.0/sdk/securestore
- Expo Background Task: https://docs.expo.dev/versions/v57.0.0/sdk/background-task
- Expo TaskManager: https://docs.expo.dev/versions/v57.0.0/sdk/task-manager
- Expo Router gruplar: https://docs.expo.dev/router/advanced/groups
- React `useSyncExternalStore`: https://react.dev/reference/react/useSyncExternalStore

**Kriptografi / senkronizasyon**
- HLC (Kulkarni vd.): "Logical Physical Clocks and Consistent Snapshots in Globally Distributed Databases"
- Last-Write-Wins: https://www.cs.cornell.edu/courses/cs6120/2011fa/lectures/lec02b-dht.html

**Paketler**
- `expo-secure-store` — Expo Go'da mevcut, Android TV'de doğrulanmış
- `expo-background-task`, `expo-task-manager` — Faz 5
