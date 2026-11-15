# Cihazlar Arası Veri Senkronizasyonu (Sunucusuz) — Uygulama Planı

> **Durum:** Sadece plan. Bu doküman kod içermez ve henüz hiçbir değişiklik yapılmamıştır.
> **Kapsam:** StreamPulse kullanıcı verisinin telefon / tablet / TV arasında sunucu ve veritabanı olmadan aktarılması.
> **Hazırlayan:** mimari araştırma, 2026-09-25

---

## 0. Yönetici Özeti

**Ne yapılacak:** Kullanıcı verisi (profil, favoriler, izleme geçmişi, arama geçmişi, oynatıcı ayarları) cihazlar arasında aktarılacak. Ortada sunucu ya da veritabanı olmayacak.

**Ne yapılmayacak:** Otomatik/arka plan senkronizasyonu. Bu, sunucu olmadan **teknik olarak imkânsızdır** (gerekçesi: Bölüm 2).

**Veri hacmi:** ~100 KB ham, ~15-40 KB sıkıştırılmış. Tek gidiş-dönüş yeterlidir.

**Ne kullanılacak:** Ev ağı üzerinden doğrudan TCP bağlantısı + TLS + kullanıcı tetikli (foreground) senkronizasyon.

**Ne kullanılmayacak:** WebRTC, CRDT/Yjs, RxDB/ElectricSQL/PowerSync, Gun.js, libp2p, arka plan servisleri. Gerekçeleri: Bölüm 9.

**Aşama sayısı:** 5 faz. İlk iki faz sıfır yeni native bağımlılık içerir.

**En büyük risk:** Android TV'de üçüncü parti native ağ modülü çalışmayabilir. Expo'nun doğrulanmış TV modül listesi bunları içermiyor. Faz 3'e geçmeden önce proof-of-concept ile test edilmeli.

---

## 1. Mevcut Durum Analizi

### 1.1 Backend durumu — kısıt zaten sağlanmış

`MovieAppNew` (Python FastAPI) kullanıcı verisine **hiç dokunmuyor**.

- `Core/Libs/Supabase.py` yalnızca `media`, `sources` ve `crawler_state` tablolarını kullanıyor. Bunlar film metadata'sı ve tarama durumu — kullanıcı verisi değil.
- `api/routes/` altındaki uçlar (`plugins`, `extractors`) içerik keşfi ve video kaynağı çıkarma içindir. Kullanıcı hesabı, oturum, senkronizasyon içermez.

**Sonuç:** Kullanıcı verisi tarafında "sunucu kullanma" şartı zaten karşılanmış durumda. Sunucudan bağımsız olma hedefi, veri modelinde bir engel değil.

**Ayrıca not:** `Core/Libs/Supabase.py`, `SUPABASE_URL` ve `SUPABASE_KEY` değerlerini ortam değişkeninden okuyor. Bu, cihazlar arası senkron kapsamında değil ama anahtar yönetimi gözden geçirilmeli.

### 1.2 Frontend veri katmanı — eksikler

`src/utils/storage.js` (307 satır) tüm kullanıcı verisini `AsyncStorage`'da 5 anahtar altında tutuyor.

| Veri | Storage Key | Yapı | Zaman Damgası | Birleştirme (Merge) Durumu |
|---|---|---|---|---|
| Profil | `user_profile` | `{username, displayName, email, ...}` | ✅ `updatedAt` | Hazır — LWW uygulanabilir |
| Favoriler | `user_favorites` | `{id, ...}[]` | ❌ **yok** | ⚠️ **Engelli** |
| İzleme Geçmişi | `user_watch_history` | `{id, watchedAt}[]` | ✅ `watchedAt` | Hazır — LWW uygulanabilir |
| Arama Geçmişi | `user_search_history` | `string[]` | ❌ **yok** | ⚠️ **Engelli** |
| Oynatıcı Ayarları | `app_player_settings` | `{seekDuration, autoPlay, ...}` | ❌ **yok** | ⚠️ **Engelli** |
| Kaldığın Yerden | `user_continue_watching` | `{id, updatedAt, ...}[]` | ✅ `updatedAt` | Hazır — LWW uygulanabilir |

#### Kritik bulgu: 3 anahtarda birleştirme metadatası yok

**Favoriler** (`toggleFavorite`, satır 99-118) ham içerik nesnesini saklıyor:

- Kaydedilen: `{...movie}` — içerik ID'si ve başlık/poster gibi alanlar
- Saklanmayan: bu kaydı **hangi cihazın, ne zaman eklediği**

Sonuç: Telefonda favori eklenip aynı anda tablette aynı içerik favoriden çıkarılırsa, iki cihaz arasındaki aktarımda hangisinin geçerli olacağının **belirlenemez** veri yoktur. Sonuç ya veri kaybı ya da kullanıcının kazandığı değişikliğin geri alınmasıdır.

**Arama geçmişi** (`addToSearchHistory`, satır 185-203) sadece ham string saklıyor:

- Kaydedilen: `"Breaking Bad"`
- Saklanmayan: zaman, cihaz kimliği

Sonuç: Arama geçmişinde sıralama yeniden kurulamaz; hangi kaydın daha yeni olduğu bilinmez.

**Oynatıcı ayarları** (`savePlayerSettings`, satır 257-273) düz bir nesne:

- Kaydedilen: `{seekDuration: 15, autoPlay: false, ...}`
- Saklanmayan: bu ayar değişikliğinin ne zaman yapıldığı

Sonuç: Birden fazla cihazda farklı ayar değerleri varsa, "en son hangisi" sorusu cevaplanamaz.

#### Bu, planın ilk fazının tamamıdır

Bölüm 4 (Faz 0), transport'tan bağımsız olarak bu üç veri tipine zaman damgası ve cihaz kimliği ekler. Bu değişiklik:

- Saf JavaScript — Expo Go'da çalışır
- Ağ yığını gerektirmez
- Birim testleriyle doğrulanabilir
- Risk: sıfır

Bunun ayrı bir faz olarak ayrılmasının nedeni: **birleştirme mantığı taşınabilir şekilde yazılmalıdır.** Taşıma katmanı değişse veya tamamen terk edilse bile Faz 0 çalışmaya devam eder ve veri modeli daha sonraki tüm fazlar için sağlam bir temel oluşturur.

### 1.3 Platform yapılandırması — eksik alanlar

`app.json` (70 satır) içinde senkronizasyon için gereken hiçbir alan bulunmuyor.

Eklenecekler (Faz 2 ve sonrası):

- `ios.infoPlist.NSLocalNetworkUsageDescription` — iOS yerel ağ izni açıklaması
- `ios.infoPlist.NSBonjourServices` — `["_streampulse._tcp"]` dizisi
- Android izinleri — mDNS kullanılırsa `CHANGE_WIFI_MULTICAST_STATE`

Mevcut yapılandırmanın uyumlu olduğu noktalar:

- `expo-dev-client` kurulu → özel native modül eklenebilir
- `scheme: "streampulse"` tanımlı → ileride derin bağlantıler için kullanılabilir
- `supportsTablet: true` → tablet zaten hedef kitle
- Config plugin altyapısı mevcut (`plugins` dizisi dolu) → yeni modüller için yer hazır

---

## 2. Kritik Kısıt: Neden Otomatik Senkronizasyon Mümkün Değil

Bu planın en önemli maddesi. Ürün beklentisi burada doğru kurulmazsa proje hedefine ulaşamaz.

### 2.1 Platform kısıtları

**iOS**
- Uygulama arka plana geçtiğinde askıya alınır. Arka planda açık soket bağlantısı sürdürülemez.
- Yerel ağ izni henüz belirlenmemiş (`undetermined`) ise, arka planda yapılan yerel ağ işlemi **sessizce reddedilir** ve kullanıcıdan izin istenmez.
- Bu nedenle izin istemi, ilk senkronizasyon denemesinden **önce** ve uygulama ön plandayken tetiklenmelidir.

**Android**
- Doze modu ağ erişimini askıya alır.
- Uygulama Standby kovaları (`rare`, `restricted`) daha fazla kısıtlar.
- API 31'den itibaren arka plandan ön plan servisi başlatmak dar durumlar dışında mümkün değildir.
- Android 15+ `dataSync` ön plan servisini 24 saatte 6 saat ile sınırlar.
- Android 13+ kullanıcı ön plan servisini tamamen durdurabilir.

**TV**
- Uygulama çoğu zaman hiç çalışmıyor. Arka plan senkronizasyonu burada tamamen anlamsız.

### 2.2 Karşılaştırma: bu sorunu çözenler ne yaptı

| Ürün | Veri katmanı | Koordinasyon | Not |
|---|---|---|---|
| **Chrome Sync** | Tamamen sunucu üzerinden | Var | Geçersiz kılma bildirimleri FCM push ile gelir — sunucu olmadan imkânsız |
| **Plex** | Çevrimiçi Plex hesabına | Var | İzleme durumu senkronize edilir; süre pozisyonu kasıtlı olarak senkronize edilmez |
| **Jellyfin** | Jellyfin sunucu veritabanında | Var | Ev sunucusu |
| **Tailscale** | Doğrudan WireGuard, uçtan uca şifreli | Var | Noise IK ile anahtar değişimi yapan tam koordinasyon sunucusu |
| **Syncthing** | Cihazlar arası doğrudan TLS | Kısmen | Global keşif sunucusu **veri saklamaz**, sadece adres değiş toplar. LAN'da kapatılabilir ve tamamen sunucusuz çalışır |

### 2.3 Sonuç ve doğru ürün kurgusu

> **Gerçekte sunucusuz cihazlar arası izleme geçmişi senkronu teslim eden tek bir ürün yoktur.** Tüm üçüncü parti "watch history sync" araçları bir Docker container olarak çalışır.

Bu imkânsızlık kanıtı değil, iki şeyi gösteriyor:

1. Zor olan kısım **veri taşıma değil**, **güven kurma** ve **arka planda güvenilir çalışma**.
2. Senin avantajın, problemi **kısıtlamak**: 3 cihaz, tek ev ağı, kullanıcı tetikli işlem. Bu kısıtlar, zor kısımları devre dışı bırakmanı sağlar.

**Doğru kurgu (kabul edilebilir):**
- ✅ "Telefonumda StreamPulse'ı açıyorum, **Cihazlar** ekranından TV'yi seçiyorum, favorilerim ve izleme geçmişim TV'de."
- ✅ "TV ilk açılışta bir eşleşme kodu gösterir, sonrasında tek dokunuş."
- ❌ "Eve gelmeden önce geçmişim TV'de hazır olsun." — **bu kapsam dışı, plan kapsam dışı**

---

## 3. Önerilen Mimari — Genel Bakış

### 3.1 Katman yapısı

```
┌─────────────────────────────────────────────────────┐
│  Katman 5 — Platform Yapılandırması                  │
│  app.json izinleri, config plugin'ler, TV uyumu      │
├─────────────────────────────────────────────────────┤
│  Katman 4 — Eşleştirme ve Kriptografi                │
│  Cihaz kimliği, TLS sertifika pinleme, SAS onayı     │
├─────────────────────────────────────────────────────┤
│  Katman 3 — Keşif (isteğe bağlı, asla kritik değil)  │
│  mDNS otomatik bulma + Manuel IP yedek yolu           │
├─────────────────────────────────────────────────────┤
│  Katman 2 — Taşıma (tek native bağımlılık)           │
│  react-native-tcp-socket, 4 byte uzunluk öneki      │
├─────────────────────────────────────────────────────┤
│  Katman 1 — Veri Modeli (saf JS, sıfır bağımlılık)   │
│  HLC zaman damgası, deviceId, LWW merge, şema        │
└─────────────────────────────────────────────────────┘
```

### 3.2 Veri akışı (her cihaz bağımsız olarak)

```
1. Kullanıcı "Cihazlar" ekranını açar
2. Hedef cihaz listede görünür (keşif veya manuel)
3. Eğer ilk kez → Katman 4: eşleştirme el sıkışması
4. Bağlantı kurulur, TLS ile şifreli kanal açılır
5. Kaynak cihaz yerel veri dokümanını sıkıştırıp gönderir
6. Hedef cihaz Katman 1 merge algoritmasını çalıştırır
7. Sonuç diske yazılır, kullanıcıya özet gösterilir
8. Cihaz listesi kalıcı güven deposuna yazılır
```

**Yön önemli değil:** Her cihaz hem gönderici hem alıcı olabilir. Karşılıklı veri aktarımı yapılır, her iki taraf kendi dokümanını gönderir ve birleştirir. Tek yönlü "master-slave" ilişkisi kurulmaz.

### 3.3 Katman 1: Veri modeli

**Zaman damgası stratejisi — Hybrid Logical Clock (HLC)**

Neden düz `Date.now()` yeterli değil: Cihaz saatleri farklı olabilir. Telefon 3 dakika ileri, tablet 2 dakika geri gösterebilir. Bu durumda LWW yanlış cihazı kazandırır.

HLC şunları birleştirir:
- Fiziksel zaman (duvar saati)
- Mantıksal sayaç (cihaz içi sıralama)
- Cihaz kimliği (eşitlik bozucu / tie-break)

Sonuç: saat kaymasından bağımsız, deterministik, iki tarafta da aynı sonucu üreten bir sıralama.

**Cihaz Kimliği (`deviceId`)**
- Uygulama ilk kurulumda üretilen UUID
- Kalıcı olarak saklanır (AsyncStorage veya SecureStore)
- Kullanıcı tarafından düzenlenebilir ad taşır: `"Salon TV"`, `"iPhone"`, `"Tablet"`
- Cihaz yeniden adlandırıldığında veya silindiğinde kimlik değişir

**Veri tipleri ve birleştirme kuralları**

| Veri | Birleştirme Kuralı | Neden |
|---|---|---|
| Profil | Alan bazlı LWW, `(hlc, deviceId)` ile | Alanlar bağımsız güncellenebilir |
| Favoriler | **Set-birleştirme (add-wins) + tombstone** | Silme kaydı gerekir; sadece LWW yanlış |
| İzleme Geçmişi | `contentId` bazlı LWW | Son pozisyon kazanır |
| Kaldığın Yerden | `contentId` bazlı LWW | Son pozisyon kazanır |
| Arama Geçmişi | Birleşim + zaman sıralaması + 20 kayıt sınırı | Sıralama yeniden kurulmalı |
| Oynatıcı Ayarları | Alan bazlı LWW | Ayarlar bağımsız değişir |

**Favoriler için tombstone neden gerekli**

Favoriler bir "set" olduğu için iki cihazın aynı anda çalıştığı 3 senaryo vardır:

| Telefon | Tablet | Sonuç (tombstone olmadan) | Sonuç (tombstone ile) |
|---|---|---|---|
| Ekle | Ekle | ✅ Doğru | ✅ Doğru |
| Ekle | Sil | ⚠️ Belirsiz | ✅ Ekle kazanır (tombstone yok) |
| Sil | Sil | ⚠️ Silme kaybolur, tekrar eklenir | ✅ İkisi de silinmiş |

Tombstone, "bir zamanlar burada vardı, şu an yok, şu cihazda şu zamanda silindi" bilgisini taşıyan bir kayıttır. Zaman aşımı ile temizlenir (örn. 90 gün).

**Şema sürümleme**
- Her dokümana `schemaVersion` alanı
- Gelecekte şema değişirse cihazlar arasında uyumsuzluk yaşanmasın
- Bilinmeyen alanlar aktarımda korunur (ileri uyumluluk)

### 3.4 Katman 2: Taşıma

**Kütüphane: `react-native-tcp-socket`**

| Özellik | Değer |
|---|---|
| Sürüm | 6.4.3 (2026-09-10) |
| API | Node `net` / `tls` uyumlu |
| İstemci | ✅ |
| Sunucu | ✅ (dinleme) |
| TLS | ✅ Android Keystore entegrasyonu |
| Expo config plugin | ✅ 6.3.0+ ile yerleşik |
| Expo Go | ❌ (dev client gerekli) |

**Protokol tasarımı**

```
┌────────────┬──────────────────────────────┐
│ 4 byte     │ Yük                          │
│ uzunluk    │ (JSON veya sıkıştırılmış)   │
│ (ağ sırası)│                              │
└────────────┴──────────────────────────────┘
```

- Uzunluk öneki: mesaj sınırlarını belirlemek için (kendi başına anlamsız ama güvenlik açısından önemli)
- Sıkıştırma: `fflate` (hafif, Expo Go'da çalışır) veya `zlib`
- Parça boyutu: 256 KB (mevcut veri boyutunda gereksiz, ileriye dönük)
- Zaman aşımı: bağlantı açık kalırsa 30 saniye sonra koparılır

**Neden TLS, kendi kripto yazmak yerine**
- Hazır, test edilmiş taşıma şifrelemesi
- Cihaz kimliği doğrudan sertifika ile bağlı
- El yazımı AEAD/AES-GCM kodu yazmaya gerek kalmaz
- Parmak izi ile pinleme standart bir yaklaşım

### 3.5 Katman 3: Keşif

**İki seviyeli tasarım — keşif asıl yol değil**

| Seviye | Yöntem | Bağımlılık | Güvenilirlik |
|---|---|---|---|
| Birincil | Kullanıcı hedef cihazın IP'sini ekranda görür ve girer | `expo-network` (Expo Go'da var) | ✅ Yüksek — hiçbir şey kırılamaz |
| İkincil | mDNS otomatik keşif (`_streampulse._tcp`) | mDNS kütüphanesi | ⚠️ Düşük — platform kırılgan |

**mDNS neden yedek olarak konumlandırılıyor**

- Android'de `NsdManager` üreticiden üreticiye farklı davranıyor
- Android 12 ve altında ön planda bile `WifiManager.MulticastLock` gerekiyor
- Android emülatörü multicast'i desteklemiyor — mDNS hiç çalışmıyor
- AOSP'nin kendi dokümanı, sistem mDNS daemon'ına güvenmek yerine kendi çözümünüzü paketlemenizi öneriyor
- Misafir ağı veya AP istemci izolasyonu mDNS'i tamamen engeller

**Mevcut mDNS kütüphane durumu**

| Paket | Sürüm | Son Yayın | Değerlendirme |
|---|---|---|---|
| `@dawidzawada/bonjour-zeroconf` | 2.2.0 | 2026-06-11 | Nitro modül (yeni mimari ✅). iOS izin yönetimi yerleşik. Config plugin "yolda" — `infoPlist` elle yazılmalı. Genç (12 yıldız) |
| `react-native-zeroconf` | 0.14.0 | 2025-12-31 | Daha olgun, Expo örneği var. **9 aydır güncellenmedi**, README hâlâ `react-native link` anlatıyor (eski mimari) |

**Uzun vadeli fırsat — Android 17 sistem cihaz seçici**

Android 17'de `ACCESS_LOCAL_NETWORK` zorunlu ve varsayılan kapalı olacak. Google'ın sunduğu kaçış yolu, sistem seçicisini kullanmak:

- Sistem, kullanıcıya cihaz listesi gösterir
- Kullanıcı TV'yi seçer
- Uygulama **izin almadan** o cihaza bağlanabilir
- Korkutucu izin diyaloğu hiç görünmez

Bu, mDNS'in gelecekteki yerini güçlendirir ama şu an SDK 36'da olduğunuz için hemen uygulanamaz. Faz 3'te not olarak tutulur.

### 3.6 Katman 4: Eşleştirme ve güvenlik

**Akış**

```
┌─────────────────────────┐         ┌─────────────────────────┐
│  SALON TV               │         │  TELEFON                │
│                         │         │                         │
│  "Eşleşme kodu:"        │         │  [Kodu gir]  [  A8F2-K9  ]│
│   A8F2-K9               │         │                         │
│                         │         │  "El sıkışma doğrulanıyor"│
│  "Parmak izi: 4 7 2 9" │ ◄────► │  "Parmak izi: 4 7 2 9" │
│                         │         │                         │
│  [Eşleşmeyi onayla]     │         │  [Eşleşmeyi onayla]     │
└─────────────────────────┘         └─────────────────────────┘
```

**Adım adım**

1. TV ilk açılışta veya "Cihaz Ekle" dendiğinde bir **X25519 anahtar çifti** üretir (oturum anahtarı)
2. TV ekranında **8-10 karakterlik eşleşme kodu** gösterir (Crockford base32 — karışması kolay karakterler: `0`/`O` ve `1`/`I` yok)
3. Telefon kodu girer ve aynı anda **yerel ağ izni** ister
4. Her iki taraf **aynı anda** türetilmiş anahtarla TLS el sıkışması yapar
5. Her iki ekranda **4 haneli SAS** (Kısa Doğrulama Dizisi) gösterilir — bu el sıkışma özetinin bir karmasıdır
6. Kullanıcı iki numaranın aynı olduğunu doğrular → **MITM koruması**
7. Telefon, TV'nin sertifika parmak izini güven deposuna kaydeder
8. Sonraki bağlantılarda parmak izi doğrulanır; uyuşmazlık → bağlantı reddedilir

**Neden 8-10 karakter ve neden 4 haneli SAS**

- 6 haneli PIN: 10⁶ olasılık ≈ 20 bit — zayıf
- 8-10 karakter Crockford base32: 40-50 bit — yeterli
- Kısa kod **zorunlu**, çünkü TV'de 40 karakterlik QR içeriğini uzaktan yazmak kabul edilemez
- SAS, ortadaki adam (MITM) saldırısını **tespit edilebilir** kılar

**PIN zorunluysa (ileride)**

- SPAKE2 (RFC 9382) kullanılmalı — gözlemci transcript toplayıp çevrimdışı saldıramasın
- Hız sınırlama (rate limiting) şart
- N denemeden sonra kilitleme
- Aksi halde ağında 6 hanelik bir "sihirbaz kutusu" oluşur

**Güven deposu içeriği**

Her eşleşmiş cihaz için:
- Cihaz kimliği (`deviceId`)
- Sertifika parmak izi (SHA-256)
- Kullanıcı tanımlı ad (ör. "Salon TV")
- Eşleşme tarihi
- İptal durumu

`expo-secure-store` kullanılması önerilir — Expo'nun doğrulanmış TV listesinde mevcut.

**TV'de kamera yok — bu yüzden QR yok**

Android TV cihazları `android.hardware.camera` desteğine sahip **değildir**. QR tabanlı eşleştirme TV için kesinlikle kullanılamaz. QR yalnızca telefon↔tablet arasında, ileride ek kolaylık olarak düşünülebilir.

---

## 4. Aşamalı Uygulama Planı

### Faz 0 — Veri modeli (Sıfır bağımlılık, Expo Go)

**Hedef:** Mevcut AsyncStorage verilerini senkronizasyona hazır hale getirmek.

**Kapsam**
- Cihaz kimliği (`deviceId`) üretimi ve kalıcı saklama
- HLC zaman damgası yardımcıları
- 5 veri tipi için şema tanımı ve sürümleme
- Birleştirme (merge) algoritmaları
- Favoriler için tombstone desteği
- **Mevcut veri geriye dönük uyumlu dönüşüm** (kullanıcının mevcut favorileri kaybolmamalı)

**Etkilenecek dosyalar (kavramsal)**
- `src/utils/storage.js` — şema ve zaman damgası eklenmesi
- Yeni birleştirme modülü (transport'tan bağımsız)
- Birim testleri

**Bağımlılık:** Yok
**Expo Go'da test:** ✅
**Risk:** Sıfır
**Tahmini süre:** 1-2 gün

**Başarı kriteri**
- Mevcut AsyncStorage verisi kayıpsız okunuyor
- İki farklı cihaz simülasyonu oluşturulup birleştirme yapıldığında sonuç deterministik
- Çakışma senaryoları (aynı anda ekleme/silme) test edildi
- Birleştirme iki tarafta da aynı sonucu veriyor (idempotent)

**Kritik uyarı:** Bu faz **taşıma katmanından bağımsız** yazılmalıdır. Taşıma seçeneği değişse bile Faz 0 çalışmaya devam eder.

---

### Faz 1 — Manuel aktarım (Sıfır bağımlılık, Expo Go)

**Hedef:** Kullanıcının cihazlar arasında manuel olarak veri aktarabildiği, çalışan bir akış.

**Kapsam**
- Yeni "Cihazlar" ekranı (`settings` altında veya profil içinde)
- Hedef cihazın IP'sini ekranda gösterme (`expo-network`)
- Kullanıcıdan IP giriş alanı
- Doğrulama ve aktarım sonucu ekranı (kaç favori, kaç izleme kaydı aktarıldı)
- Çift yönlü aktarım (her iki cihaz birbirine gönderir)
- Hata durumları: bağlanamama, timeout, sürüm uyuşmazlığı

**Yeni bağımlılık:** `expo-network` (Expo Go'da mevcut, dev client gerekmez)

**Neden bu faz kritik**

Bu faz **sıfır yeni native bağımlılıkla** gerçek bir "verilerimi diğer cihazıma aktar" özelliği teslim eder. Ayrıca eşleşme kullanıcı deneyiminin gerçekten çalışıp çalışmadığını test eder. Kullanıcılar eşleşme akışına dokunmuyorsa, sonraki fazlar hiçbir işe yaramaz.

**Risk:** Düşük
**Tahmini süre:** 2-3 gün
**Expo Go'da test:** ✅ (muhtemelen bir geçici dosya aktarım yöntemiyle prototip; Faz 2'de TCP'ye taşınır)

**Başarı kriteri**
- Telefondan TV'ye veri aktarılabiliyor
- TV'den telefona da aktarılabiliyor
- Birleştirme sonucu her iki cihazda da tutarlı
- Kullanıcı testi: akış kimse tarafından atlanmıyor

---

### Faz 2 — Doğrudan bağlantı (Native bağımlılık, dev client)

**Hedef:** Manuel IP girişini ortadan kaldırmak ve güvenli eşleştirme kurmak.

**Kapsam**
- `react-native-tcp-socket` kurulumu
- Cihaz başına self-signed TLS sertifikası üretimi
- Sertifika parmak izi ile pinleme
- 8-10 karakterlik kısa kod eşleştirme akışı
- 4 haneli SAS doğrulama ekranı
- Güven deposu (`expo-secure-store`)
- Cihaz listesi yönetimi (adlandırma, iptal etme)
- Mesafeye göre okunabilir büyük font (TV için)
- `app.json` izin eklemeleri

**Yeni bağımlılık:** `react-native-tcp-socket`, `expo-secure-store`, `fflate`

**Risk:** Orta
**Tahmini süre:** 5-7 gün
**Expo Go'da test:** ❌ (dev client gerekli)

**Başarı kriteri**
- Kısa kod eşleştirme akışı uçtan uca çalışıyor
- Parmak izi değişirse bağlantı reddediliyor
- Cihaz iptal edildiğinde sonraki bağlantılar başarısız oluyor
- **Android TV'de TCP bağlantısı gerçek cihazda doğrulanmış**

**Doğrulama uyarısı:** `react-native-tcp-socket` paketi `react-native@0.60.5` ile test edilmiş görünüyor (eski bir test matrisi). Bu **uyumluluk iddiası değildir.** RN 0.86 / Yeni Mimari üzerinde derlendiği doğrulanmamıştır. Bu, planın **en büyük teknik belirsizliğidir** ve Faz 2'ye başlamadan önce küçük bir deneme derlemesiyle doğrulanmalıdır.

---

### Faz 3 — Otomatik keşif (Native bağımlılık, dev client)

**Hedef:** Kullanıcının IP girmesine gerek kalmaması.

**Kapsam**
- mDNS servis ilanı ve tarama (`_streampulse._tcp`)
- Cihaz listesinde otomatik görünme
- Cihaz adı, model, son görülme bilgisi
- Bağlantı kurulunca cihaz otomatik seçilir
- Android 17 sistem cihaz seçici entegrasyonu (not)

**Yeni bağımlılık:** `@dawidzawada/bonjour-zeroconf` veya `react-native-zeroconf`

**Risk:** Orta-Yüksek
**Tahmini süre:** 3-5 gün
**Expo Go'da test:** ❌

**Başarı kriteri**
- Cihazler ağda otomatik listeleniyor
- Bir cihaz seçilip bağlanabiliyor
- Keşif başarısız olduğunda manuel yol çalışmaya devam ediyor

**Bu fazın statüsü**

Bu faz **isteğe bağlı kolaylık katmanıdır.** Sistem çalışmazsa ürün çalışmaz; sadece daha fazla tıklamaya düşer. Bu nedenle:

- Faz 2 başarısız olursa Faz 3'e başlanmamalı
- mDNS kırılgan olduğu için manuel yol **asla kaldırılmamalı**

---

### Faz 4 — Sıkıştırma ve dayanıklılık (Sürekli iyileştirme)

**Kapsam**
- Büyük dokümanlar için parçalama (chunking) ve yeniden deneme
- Kesilen aktarımın kaldığı yerden devamı
- Çakışma çözümleme arayüzü (nadir ama gerekli durumlar için)
- Aktarım geçmişi / hata günlüğü
- Tanıtım (diagnostics) ekranı: cihaz listesi, son senkronizasyon durumu

**Risk:** Düşük
**Tahmini süre:** 2-3 gün

---

## 5. Platform Yapılandırma Gereksinimleri

### 5.1 iOS

`app.json` → `expo.ios.infoPlist` altına eklenecek:

| Anahtar | Değer | Açıklama |
|---|---|---|
| `NSLocalNetworkUsageDescription` | Kullanıcıya gösterilecek açıklama | iOS yerel ağ izin diyaloğu |
| `NSBonjourServices` | `["_streampulse._tcp"]` | Kendi servis tipini ilan etmek için |

**Doğrulama yapılmış bilgi (Apple TN3179):**

| İşlem | Yerel ağ izni gerekir mi? |
|---|---|
| Giden TCP bağlantısı kurma | **Evet** |
| Gelen TCP bağlantısını dinleme | **Hayır** |
| UDP unicast gönderme | **Evet** |
| UDP multicast/broadcast | **Evet** |
| Bonjour ile kayıt/tarama/çözümleme | **Evet** |
| `.local` DNS adı çözümleme | **Evet** |

**Önemli düzeltme:** Çoğu blog yazısının aksine, **kendi servis tipinizi `NSBonjourServices` içinde bildirip onu tarayabilmek multicast yetkisi gerektirmez.** Özel yetki (`com.apple.developer.networking.multicast`) yalnızca *arbitrary* Bonjour servis tipleriyle ve *tüm* ilan edilen tipleri taramak için gerekir ve Apple tarafından nadiren verilir.

**Dikkate alınacaklar**
- **tvOS'ta yerel ağ gizliliği yoktur** — Apple TV sormaz (Android TV için geçerli değil, ama asimetriyi bilmek faydalı)
- Uygulama arka plandayken ve izin henüz belirlenmemişse, iOS **sessizce reddeder** ve kararı kaydetmez. İzni ilk senkronizasyon denemesinden önce, uygulama ön plandayken tetiklenmelidir.
- Simülatör yerel ağ gizliliğini desteklemez — **yalnızca gerçek cihazda test edin**

### 5.2 Android

**Mevcut durum:** Expo SDK 57 `targetSdkVersion 36` kullanıyor.

| Android 16 | Android 17 |
|---|---|
| Hedef SDK 36 | **Hedef SDK 37+** |
| İzin: geçici olarak `NEARBY_WIFI_DEVICES` | **İzin: `ACCESS_LOCAL_NETWORK`** |
| Varsayılan: açık | **Varsayılan: kapalı** |

**Şu anda engel yok, ancak** Expo 37'ye geçtiğinde bu izin zorunlu olacak ve planlanmamışsa kırılacak.

**İleriye dönük kaçış yolu:** Android'in sistem cihaz seçicisi (`NsdManager` + `DiscoveryRequest.FLAG_SHOW_PICKER`). Kullanıcı bir cihaz seçtiğinde uygulama **izin almadan** o cihaza bağlanabilir. Korkutucu izin diyaloğu hiç görünmez. Bu Faz 3 notu olarak takip edilmeli.

**Önemli ayrım:** iOS'ta "gelen bağlantıyı dinlemek" izin gerektirmez, **Android 17'de gerektirir.** iOS'taki "TV dinler, telefon bağlanır" kurgusu modern Android'de geçerli değil. İzin verilmiş cihazlar üzerinden tasarım yapılmalı.

**mDNS ek izinleri:**
- Android 12 ve altında, ön planda bile `WifiManager.MulticastLock` gerekir
- Android manifest'ine `CHANGE_WIFI_MULTICAST_STATE` eklenmeli
- T-ext-7'den itibaren sistem ön plan uygulamalar için bunu yönetir

### 5.3 Android TV

**Expo'nun doğrulanmış TV modül listesi:**

| ✅ Doğrulanmış | ❌ Listede olmayan |
|---|---|
| Reanimated | `expo-network` (tvOS olarak listeli, Android TV doğrulanmamış) |
| SafeAreaContext | Herhangi bir mDNS kütüphanesi |
| SecureStore | `react-native-webrtc` |
| Skia | `react-native-tcp-socket` |
| SplashScreen | `expo-crypto` |
| SQLite | `expo-camera` |
| Svg | |
| SystemUI | |
| TaskManager | |
| TrackingTransparency | |
| Updates | |
| Video | |
| VideoThumbnails | |

**TV derlemesi için ayrıca gerekenler:**
- `react-native` bağımlılığını TV fork'una değiştir: `react-native@npm:react-native-tvos@0.86-stable`
- `@react-native-tvos/config-tv` paketi
- `expo-dev-client` Android TV'de SDK 54'ten beri destekleniyor ✅

**Bu listenin önemi**

Bu, WebRTC ve mDNS tabanlı her yaklaşımı **tek başına elenen** sebeptir: bu modüllerden birini Android TV'de kullanmak, Expo desteği, config plugin ve referans uygulama olmadan ilk kullanıcı olmak anlamına gelir. `expo-sqlite` ve `expo-secure-store` ise doğrulanmıştır.

**TV donanım kısıtları:**
- Kamera yok → QR okunamaz
- Dokunmatik ekran yok
- Telefonji, konum, NFC yok

---

## 6. Güvenlik Modeli

### 6.1 Referans yaklaşımlar

| Ürün | Model |
|---|---|
| **Tailscale** | Kontrol düzlemi Noise IK + X25519 ile anahtar değişimi yapar. Veri düzlemi WireGuard, uçtan uca şifreli. DERP röleleri çözemez. → **Sunucusuz olmanın mümkün olduğunu, anahtar değişiminin dış kanal (QR/kısa kod) ile başlatılabileceğini gösteriyor** |
| **Syncthing** | Cihaz kimlikleri TLS sertifikasından türetilir. Keşif sunucusu istemci sertifika doğrulaması ister ve **veri saklamaz** — sadece adres değiş toplar. LAN'da kapatılabilir, tamamen sunucusuz çalışır. |
| **Chrome Sync** | İyimser imzalı commit + kullanıcı parolasıyla "Nigori" uçtan uca şifreleme. Sunucu aktarım katmanı olarak görülür. |

**Bu projeye uyarlama:** Tailscale'in "veri uçtan uca, koordinasyon ayrı" modeli doğru referans. Ancak koordinasyonu tamamen kaldırdığımız için anahtar değişiminin **fiziksel yakınlık** ile başlatılması gerekiyor — kısa kod bu yüzden zorunlu.

### 6.2 Eşleştirme akışı karşılaştırması

| Akış | Mekanizma | Bu proje için uygunluk |
|---|---|---|
| **QR + ECDH** | Cihaz A, `{protocol, version, X25519 pubkey, nonce}` QR'ı gösterir. B tarar, X25519 yapar, HKDF ile anahtar türetir. | Telefon↔Tablet ✅ / **TV ❌** (kamera yok — 40 karakterli metni uzaktan yazmak kabul edilemez) |
| **Kısa kod / PIN** | A, kendi geçici pubkey'inden türetilmiş 6-8 karakter gösterir. B yazar. İkisi PAKE ile aynı anahtarı bulur. | ✅ **TV için tek uygulanabilir akış.** Bluetooth ve Chromecast eşleştirmesinin yaptığı tam olarak bu. |
| **Bluetooth tarzı SAS** | Her iki cihaz transcript'ten aynı 4-6 haneli diziyi gösterir; kullanıcı eşleşmeyi onaylar. | ✅ **Kısa kod akışının üzerine eklenmeli** (MITM tespiti) |
| **SPAKE2 / OPAQUE** | Standart PAKE'ler ([RFC 9382](https://www.rfc-editor.org/rfc/rfc9382.html), [RFC 9383](https://www.rfc-editor.org/rfc/rfc9383.html), [RFC 9807](https://www.rfc-editor.org/rfc/rfc9807.pdf)). 6 haneli PIN brute-force'a dayanıklı hâle gelir. | ✅ PIN tek sır ise kullanılmalı |
| **Parmak izi pinleme** | TLS el sıkışmasından sonra sertifika parmak izi karşılaştırılır, kalıcı olarak saklanır | ✅ **Bu projenin seçtiği yol** |

**6 haneli PIN uyarısı:** 10⁶ olasılık ≈ 20 bit. PAKE, gözlemcinin transcript toplayıp çevrimdışı saldırmasını engeller, ancak **aktif saldırganın çevrimiçi denemesini tek başına durdurmaz.** El sıkışma hız sınırlaması ve N denemeden sonra kilitleme zorunludur.

**Neden 8-10 karakter kısa kod tercih ediliyor:**
- 40-50 bit entropi
- TV'den okunabilir büyük punto
- Uzaktan yazılabilir
- Hız sınırlamaya ek olarak yeterli güç

### 5.3 Kriptografik bileşenler

| Paket | Sürüm | Kullanım | Not |
|---|---|---|---|
| `react-native-tcp-socket` TLS | 6.4.3 | TLS taşıması, Android Keystore | En praktif yol |
| `expo-crypto` | 57.0.3 | `digestStringAsync` (SHA-256) parmak izi | Expo Go'da mevcut, TV listesinde yok |
| `expo-secure-store` | — | Güven deposu | ✅ TV listesinde doğrulanmış |

**Tasarım gerekçesi:** `react-native-tcp-socket`'in TLS'i + cihaz başına self-signed sertifika + parmak izi pinleme. Bu yaklaşım:
- Test edilmiş taşıma şifrelemesi sağlar
- 32 bayt sabit cihaz kimliği verir
- 6 haneli parmak izi onayı ile standart bir akış sunar
- El yazımı AEAD kodu gerektirmez

**Not:** `react-native-quick-crypto` X25519 için mevcut, ancak dev client gerektirir ve TV listesinde değildir. Tercih edilmedi.

---

## 7. Dosya ve Modül Yapısı (Planlanan)

**Not:** Bu bölüm planlanan yapıyı tanımlar. **Henüz hiçbir dosya oluşturulmamıştır.**

```
src/
├── sync/                          # Yeni ana modül
│   ├── deviceId.js                # Cihaz kimliği üretimi ve saklama
│   ├── hlc.js                     # Hybrid Logical Clock
│   ├── schema.js                  # Veri şemaları + sürümleme
│   ├── merge/                     # Birleştirme algoritmaları
│   │   ├── profile.js
│   │   ├── favorites.js           # + tombstone
│   │   ├── watchHistory.js
│   │   ├── continueWatching.js
│   │   ├── searchHistory.js
│   │   └── playerSettings.js
│   ├── transport/                 # Faz 2+
│   │   ├── protocol.js            # Uzunluk öneki + çerçeveleme
│   │   ├── tcp.js                 # react-native-tcp-socket sarmalayıcı
│   │   └── compress.js            # fflate
│   ├── pairing/                   # Faz 2+
│   │   ├── shortCode.js           # Crockford base32 kod üretimi
│   │   ├── sas.js                 # 4 haneli doğrulama dizisi
│   │   └── trustStore.js          # expo-secure-store
│   ├── discovery/                 # Faz 3+
│   │   ├── manual.js              # IP girişi (Faz 1)
│   │   └── mdns.js                # mDNS (Faz 3)
│   └── index.js                   # Genel API
│
├── app/(app)/settings/
│   ├── index.jsx                  # Mevcut — ayarlar listesi
│   ├── player.jsx                 # Mevcut
│   └── devices.jsx                # YENİ: cihaz listesi
│
├── app/(app)/devices/             # YENİ: eşleştirme akışı
│   ├── pair.jsx                   # Kısa kod girişi
│   ├── verify.jsx                 # SAS onayı
│   └── transfer.jsx               # Aktarım ilerlemesi
│
├── components/devices/            # YENİ
│   ├── DeviceRow.jsx
│   ├── PairingCode.jsx            # TV için büyük punto
│   ├── SasDisplay.jsx
│   └── TransferProgress.jsx
```

**Mevcut yapıyla ilişki**

| Mevcut dosya | Planlanan etki |
|---|---|
| `src/utils/storage.js` | Faz 0'da şema ve zaman damgası eklenir. **Genel API korunur** — mevcut 15 dışa aktarım yerinde kalır, böylece çağıran ekranlar güncellenmek zorunda olmaz. |
| `src/services/api.js` | **Değişiklik yok.** Sunucusuz senkronizasyon içerik API'sinden tamamen bağımsızdır. |
| `src/app/(app)/settings/index.jsx` | Cihazlar bağlantısı eklenir |
| `src/app/(app)/profile/index.jsx` | Opsiyonel: cihaz durumu özeti |
| `app.json` | Faz 2'de izinler ve config plugin |

**Tasarım kararı — geriye uyumluluk:** `storage.js`'in mevcut genel API'si (`getFavorites`, `toggleFavorite`, vb.) korunmalıdır. Senkronizasyon **iç** detay olarak eklenir; çağıran kod değişmez. Bu, 5 fazlık plan boyunca geri alınabilirliği korur.

---

## 8. Test Planı

### 8.1 Faz 0 — Birleştirme testleri (saf, ağ gerekmez)

En kapsamlı test paketi burada olmalıdır, çünkü bu faz ağ bağımsız ve en az riskli.

| Test | Doğrulama |
|---|---|
| Boş + boş | Sonuç boş, hata yok |
| Tek taraf dolu | Diğer taraf doğru kopyalar |
| Aynı veri iki cihazda | Sonuç aynı, idempotent |
| Saat farkı (bir saat 5 dk ileri) | Doğru cihaz kazanır (HLC sayesinde) |
| Favori ekleme + silme çakışması | Tombstone doğru sonucu verir |
| Silme kaydının çift uygulanması | Idempotent |
| 3+ cihaz birleştirme | Aynı sonuç (sıra bağımsız) |
| Şema sürümü uyuşmazlığı | Bilinmeyen alanlar korunur |
| Eski format veri (geriye uyum) | Kayıpsız okunur |
| Bozuk JSON veri | Çökmez, varsayılana döner |

**Kritik test — sıra bağımsızlık:** Birleştirme sonucu, verinin hangi sırayla geldiğinden bağımsız olmalıdır. Aksi halde cihazlar farklı sonuçlara varır ve veri sessizce bozulur.

### 8.2 Faz 1-2 — Entegrasyon testleri

| Test | Ortam |
|---|---|
| Telefon → TV aktarımı | **Gerçek cihaz** (emülatörde mDNS/yerel ağ sorunları) |
| TV → telefon aktarımı | Gerçek cihaz |
| Aynı anda iki cihazda değişiklik | İki fiziksel cihaz |
| Çevrimdışı cihaz sonra çevrimiçi | Cihaz kapatılıp açılır |
| Kısa kod hatalı giriş | Elle yanlış kod |
| Parmak izi değişikliği | Sertifika yenileme senaryosu |
| Çok büyük doküman | Sınır testi |
| Bağlantı kesilmesi | Ortada koparma |

**Zorunlu: gerçek cihaz.** Android emülatörü multicast'i desteklemez ve yerel ağ davranışı farklıdır. TTV testleri mutlaka fiziksel Android TV üzerinde yapılmalıdır.

### 8.3 Platform test matrisi

| Cihaz | OS | Öncelik |
|---|---|---|
| Android TV | Android 14+ | **Yüksek** — en riskli hedef |
| iPhone | iOS 18+ | Yüksek |
| Android telefon | Android 15/16 | Orta |
| iPad | iOS 18+ | Orta |

---

## 9. Reddedilen Yaklaşımlar ve Gerekçeleri

| Yaklaşım | Neden Reddedildi |
|---|---|
| **WebRTC** | Yaşamıyorsun ki NAT sorunu çözülsün. Doğru araç, yanlış problem. 10-20 MB native bağımlılık, dev client zorunluluğu, New Architecture riski, Expo TV desteği yok. **Sunucuyu kaldırmaz, sadece yerinden taşır** — çünkü SDP/ICE görüşmesi her zaman bir sinyalleşme kanalı gerektirir. |
| **`y-webrtc`** | Sinyalleşme sunucusu şart (kısıtı ihlal), **2 yıl 9 aydır bakımsız**, RN'e karşı düşman bağımlılık ağacı. |
| **Tüm local-first veritabanları** (RxDB, ElectricSQL, PowerSync, LiveStore, Jazz, Turso, Instant, Prisma RN) | Her birinin **zorunlu sunucu bileşeni** var. "Local-first" = "serverless" değildir. |
| **RxDB** | Çalışır ama senkronizasyon bir eklentidir → HTTP/GraphQL/WebSocket → **senin FastAPI backend'in**. Açık red. |
| **ElectricSQL** | Postgres gerektirir. Eski motor sürümleri sonlandırıldı, eski dokümanlar yanıltıcı. |
| **PowerSync** | PowerSync servisi gerektirir, Postgres/Mongo/MySQL/MSSQL ile senkronlanır. Sunucusuz mod yok. |
| **Replicache** | **Bakım modunda.** Web odaklı, BYOB backend zorunlu. Ölmüş. |
| **WatermelonDB / Realm** | Yeni mimari native modül + senkron sunucusu (Watermelon) veya MongoDB Atlas (Realm). İkisi de dev client + sunucu. |
| **Yjs çekirdeği** | Kütüphane mükemmel ama **bir çakışma problemi olmayan bir durum için 10.000 satır bağımlılık.** Gerçek eşzamanlı ortak düzenleme özelliği gelirse yeniden değerlendirilmeli. |
| **Gun.js** | Üç GitHub fork'lu paket kurulumu + WebView kripto. "Merkeziyetsiz" dokümanları `peers: ['https://gun:8765/gun']` ile relay sunucusu kullanıyor. Kendi FAQ'sı dağıtım algoritmasını "(Work in Progress)" diye tanımlıyor. |
| **libp2p** | 0.37.0'dan beri ESM-only (Metro sorunu). Kendi dokümanı RN'de TCP desteğinin "devam eden çalışma" olduğunu söylüyor. Hâlâ bootstrap peer ve DHT gerektirir. |
| **MultipeerConnectivity** | Yalnızca Apple platformları, **Android yok.** Tek RN bağlama 2023-09'dan beri güncellenmemiş. |
| **Chunked QR ile veri** | 100 KB ≈ **~670 sıralı tarama** (25-35 dk). Her sınır geçişi modül yoğunluğunu karesel artırıyor. **TV zaten tarayamıyor.** Taşıma olarak ölü; eşleştirme kanalı olarak ve 20 baytlık önyükleme blob'ı için kullanılabilir. |
| **Arka plan senkron servisi / ön plan servisi** | Sunucu olmadan imkânsız. Denemek haftaları Doze/FGS istisna kazılarına harcar, kullanıcı fark etmez. |
| **Multicast/broadcast UDP** | Android'de kilitli, iOS'ta multicast yetkisi gerektirir. TCP'den karmaşıklığı artırır, kazanç yok. |

---

## 10. Riskler ve Azaltma

| # | Risk | Olasılık | Etki | Azaltma |
|---|---|---|---|---|
| 1 | `react-native-tcp-socket` RN 0.86 / Yeni Mimari'de derlenmiyor | Orta | Yüksek | **Faz 2'den önce küçük bir proof-of-concept derlemesi.** Proje paketi `react-native@0.60.5` ile test edilmiş görünüyor — bu uyumluluk iddiası değil. |
| 2 | Android TV'de üçüncü parti native ağ modülü çalışmıyor | Orta-Yüksek | Yüksek | Expo TV listesinde yok. **Faz 2'de gerçek TV'de doğrulanmalı.** Risk gerçekleşirse: TV'yi dinleyici yerine istemci yap, TV'nin Android olması sayesinde aynı kod yolu çalışır. |
| 3 | Kullanıcı eşleştirme akışını atlanıyor | Orta | Yüksek | **Faz 1'i bu yüzden ayrı ve erken teslim ediliyor.** Yeni native bağımlılık olmadan gerçek kullanıcı testi yapılabilir. |
| 4 | mDNS üreticiden üreticiye bozuk | Yüksek | Düşük | Manuel IP yolu asla kaldırılmaz. mDNS yalnızca kolaylık. |
| 5 | Kullanıcının mevcut verisi geriye uyum sırasında bozulur | Düşük | Yüksek | Otomatik dönüşüm + birim testi. Faza başlamadan önce mevcut veri yedeği alınmalı. |
| 6 | Aynı anda yapılan düzenlemelerde veri kaybı | Düşük | Orta | Tombstone + LWW + eşzamanlılık testleri (Bölüm 8.1) |
| 7 | Android 17'de `ACCESS_LOCAL_NETWORK` kırılması | Düşük (12 ay içinde) | Yüksek | Sistem cihaz seçicisi (`FLAG_SHOW_PICKER`) planı. SDK 37'ye geçişte uygulanacak. |
| 8 | Kullanıcı cihazlara erişilemeyen bir ağa geçerse | Orta | Orta | Ürün kurgusu zaten "kullanıcı tetikli." Mesaj: aynı WiFi'da olduğunuzdan emin olun. |
| 9 | "Otomatik olsun" beklentisi | **Yüksek** | Yüksek | **Bu dokümanın Bölüm 2'si.** Beklenti doğru kurulmazsa proje hedefini kaçırır. |

---

## 11. Yapılacaklar Özeti

### Başlangıçta yapılacak (Faz 0)
- [ ] Mevcut AsyncStorage verisi için yedek al
- [ ] Cihaz kimliği (`deviceId`) üretimi ve kalıcı saklama
- [ ] HLC zaman damgası yardımcıları
- [ ] 5 veri tipi için şema tanımı ve sürümleme
- [ ] Birleştirme algoritmaları (favorilerde tombstone dahil)
- [ ] Geriye uyumlu veri dönüşümü
- [ ] Birleştirme birim testleri (Bölüm 8.1)

### Doğrulama kapıları
- [ ] **Faz 0 → Faz 1:** Birleştirme testleri geçti, mevcut veri kayıpsız
- [ ] **Faz 1 → Faz 2:** Kullanıcı testi — eşleştirme akışı atlanmıyor
- [ ] **Faz 2 başlangıcı:** `react-native-tcp-socket` proof-of-concept derlemesi RN 0.86'da başarılı
- [ ] **Faz 2 → Faz 3:** Android TV'de gerçek cihazda TCP bağlantısı doğrulandı

### Sıralama gerekçesi
Faz 0 ve Faz 1 **sıfır yeni native bağımlılık** içerir ve Expo Go'da çalışır. En erken geri bildirim, en düşük risk. Riskli kısım (Faz 2, native modül + TV) ancak kullanıcı deneyimi doğrulandıktan sonra başlar.

---

## 12. Ek Kaynaklar

**Expo**
- Expo TV rehberi: https://docs.expo.dev/guides/building-for-tv
- Expo local-first rehberi: https://docs.expo.dev/guides/local-first
- Expo SDK 57 sürüm notları: https://expo.dev/changelog/sdk-57

**Platform kısıtları**
- Apple TN3179 — Yerel ağ gizliliği: https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy
- Android yerel ağ izni: https://developer.android.com/privacy-and-security/local-network-permission
- Android `NsdManager` referansı (Android developer docs)

**Referans uygulamalar**
- Tailscale şifreleme modeli: https://tailscale.com/docs/concepts/tailscale-encryption
- Syncthing protokol: https://docs.syncthing.net/
- Plex / Jellyfin / Emby watch state senkronizasyon davranışları

**Kriptografi standartları**
- [RFC 9382 — SPAKE2](https://www.rfc-editor.org/rfc/rfc9382.html)
- [RFC 9383 — SPAKE2+](https://www.rfc-editor.org/rfc/rfc9383.html)
- [RFC 9807 — OPAQUE](https://www.rfc-editor.org/rfc/rfc9807.pdf)

**Paketler**
- `react-native-tcp-socket` — npm (6.4.3, 2026-09-10)
- `@dawidzawada/bonjour-zeroconf` — npm (2.2.0, 2026-06-11)
- `expo-crypto`, `expo-network`, `expo-secure-store`
- `fflate` (sıkıştırma)
│</content>