# Çevrimdışı İndirme Özelliği - Uygulama Planı (Offline Download Plan)

Bu plan, **Cloudstream** (`recloudstream/cloudstream`) uygulamasının indirme mimarisi örnek alınarak **StreamPulse** (React Native / Expo + `react-native-video`) projesine çevrimdışı izleme / video indirme özelliğinin nasıl ekleneceğini detaylandırır.

---

## 1. Cloudstream İndirme Mimarisi Analizi

Cloudstream'in indirme başarısının arkasındaki temel mekanizmalar:

1. **Akış Formatı Tespiti ve Ayrıştırma:**
   - **Doğrudan Video (MP4 / MKV / WebM):** HTTP `Range` başlıklarıyla chunk'lar halinde indirilir; duraklatma ve kaldığı byte'tan devam etme (resumable) destekler.
   - **HLS (.m3u8):** Master playlist ayrıştırılarak mevcut çözünürlükler (1080p, 720p, 480p vb.) listelenir. Seçilen kalitenin medya m3u8 dosyasındaki tüm `.ts` veya `.m4s` segmentleri ayrıştırılır.
2. **Yerel M3U8 Yeniden Yazımı (Local Playlist Rewriting):**
   - HLS indirmelerinde segmentler diske indirildikten sonra, ExoPlayer'ın internet olmadan oynatabilmesi için segment URL'leri yerel dosya yollarına (`file:///.../seg_1.ts`) dönüştürülerek bir `local_playlist.m3u8` oluşturulur.
3. **Özel HTTP Başlıkları (Headers, Cookies & Referer):**
   - Video kaynakları (HDFilmCehennemi, VidMoly vb.) hotlink koruması kullandığı için, her segment indirilirken extractor'ın döndürdüğü `Referer`, `User-Agent` ve `Cookie` başlıkları isteklere enjekte edilir.
4. **Altyazı ve Meta Veri Bütünlüğü:**
   - Video ile birlikte harici `.vtt` / `.srt` altyazıları ve afiş resmi (`poster.jpg`) indirilip yerel `metadata.json` ile eşleştirilir.
5. **Foreground Service & Bildirim Yönetimi:**
   - Android'in uygulamayı arka planda veya ekran kilitlendiğinde durdurmaması için bildirim çubuğunda canlı yüzde ve hız gösteren bir Foreground Service çalıştırılır.

---

## 2. Gereksinimler & Fonksiyonel Kapsam

- **Film ve Dizi İndirme Desteği:**
  - Filmler için tek tıkla / kalite seçerek indirme.
  - Diziler için bölüm bazlı indirme ve tüm sezonu sıraya ekleyebilme.
- **Kalite Seçimi:**
  - Akışta birden fazla çözünürlük varsa (örn. 1080p, 720p, 480p) kullanıcıya indirme öncesi kalite seçeneği sunulması.
- **Altyazıların Birlikte İndirilmesi:**
  - Türkçe ve İngilizce gibi mevcut harici altyazıların video ile beraber çevrimdışı klasörüne kaydedilmesi.
- **Kuyruk ve İndirme Kontrolü:**
  - Kuyruk yönetimi (Aynı anda max 1-2 aktif indirme, diğerleri beklemede).
  - Duraklat (Pause), Devam Et (Resume), İptal Et (Cancel) ve Sil (Delete).
  - Anlık ilerleme (yüzde), indirme hızı (MB/s) ve tahmini kalan süre (ETA).
- **Çevrimdışı Oynatma:**
  - İnternet bağlantısı tamamen kapalıyken indirilen içeriği `react-native-video` üzerinden sıfır gecikmeyle oynatma.
  - Altyazı seçimi, ses izi seçimi ve kaldığın yerden devam etme (watch history) özelliklerinin çevrimdışıyken de çalışması.
- **Depolama Yönetimi (Downloads Screen):**
  - İndirilen içeriklerin listelendiği ayrı bir "İndirilenler" ekranı.
  - Uygulamanın kullandığı disk alanını ve cihazdaki boş depolama alanını gösteren gösterge.

---

## 3. Veri Modeli ve Depolama Yapısı

### Storage Anahtarları (`src/utils/storage.js`)
```javascript
export const STORAGE_KEYS = {
  // ... mevcut anahtarlar
  DOWNLOADS_LIST: "streampulse_downloads_list",
  DOWNLOAD_SETTINGS: "streampulse_download_settings", // Yalnızca Wi-Fi ile indir vb.
};
```

### `DownloadItem` Veri Şeması
```typescript
interface DownloadItem {
  id: string;                    // Benzersiz ID (örn: "movie_1e70a60f" veya "series_slug_s1_e3")
  contentId: string;             // İçerik ana ID'si
  contentType: "movie" | "episode";
  title: string;                 // Film adı veya Dizi adı
  subtitle?: string;              // "1. Sezon 3. Bölüm - Bölüm Adı"
  posterUrl: string;             // Orijinal afiş URL'si
  localPosterPath?: string;      // file:///.../poster.jpg
  
  // Akış & Kalite Bilgisi
  streamUrl: string;             // Orijinal oynatma linki
  isHLS: boolean;                // true: .m3u8, false: .mp4
  selectedQuality?: string;      // "1080p", "720p" vb.
  headers?: Record<string, any>; // Referer, Cookie, User-Agent

  // Durum & İlerleme
  status: "queued" | "downloading" | "paused" | "completed" | "error";
  progress: number;              // 0.0 - 1.0 (veya 0 - 100)
  downloadedBytes: number;
  totalBytes: number;
  speed: string;                 // "2.4 MB/s"
  etaSeconds?: number;
  error?: string;

  // Yerel Dosya Yolları
  localDirectory: string;        // file:///data/user/0/.../downloads/<id>/
  localVideoPath: string;        // file:///.../local_playlist.m3u8 veya video.mp4
  localSubtitles: Array<{
    title: string;
    language: string;
    localUri: string;
  }>;

  // HLS Segment İlerlemesi (Yalnızca HLS için)
  hlsInfo?: {
    totalSegments: number;
    downloadedSegments: number;
    segmentUrls: string[];
  };

  createdAt: number;
  completedAt?: number;
}
```

---

## 4. Çekirdek İndirme Mimarisi (`src/services/downloader/`)

Klasör hiyerarşisi:
```text
src/services/downloader/
├── index.js                # Ana Downloader API köprüsü
├── DirectDownloader.js     # MP4 / Direct file indirici (Resumable)
├── HlsDownloader.js        # M3U8 Master & Media playlist segment indirici
├── SubtitleDownloader.js   # Altyazı (.vtt/.srt) indirici
├── StorageManager.js       # Dosya/klasör silme, boyut hesaplama
└── DownloadQueue.js        # Kuyruk ve eşzamanlılık (concurrency) yöneticisi
```

### A. HLS (M3U8) İndirici Mantığı (`HlsDownloader.js`)
1. **Master Playlist Analizi:**
   - İlgili m3u8 URL'si çekilir.
   - Master playlist ise çözünürlük bantları (`#EXT-X-STREAM-INF`) listelenir.
   - Kullanıcının seçtiği çözünürlüğün alt m3u8 linkine gidilir.
2. **Segmentlerin Ayrıştırılması:**
   - `#EXTINF` satırları altındaki tüm `.ts` / `.m4s` segment URL'leri normalize edilir (bağıl URL'ler mutlak URL'ye çevrilir).
3. **Paralel Segment İndirme:**
   - Örneğin aynı anda 3 segment paralel indirilir (`Promise.all` tabanlı worker havuzu).
   - Ağ hatası alan segmentler için 3 kere retry mekanizması uygulanır.
4. **`local_playlist.m3u8` Oluşturma:**
   - İndirme tamamlanırken m3u8 içeriğindeki segment URL'leri yerel dosya isimleriyle (örn. `seg_0.ts`, `seg_1.ts`) değiştirilip klasöre kaydedilir.
   - ExoPlayer bu dosyayı `file:///.../local_playlist.m3u8` olarak yerelden oynatır.

### B. MP4 İndirici Mantığı (`DirectDownloader.js`)
- `expo-file-system` içerisindeki `createDownloadResumable` API'si kullanılır.
- İlerleme callback'i ile anlık byte artışı ve hız hesaplanır.
- Duraklatıldığında resume verisi (pause token) kaydedilir.

### C. Altyazı ve Poster İndirici (`SubtitleDownloader.js`)
- Extractor sonucundaki altyazılar (`subtitles: [{ name, url }]`) indirilir.
- VTT / SRT formatı bozulmadan yerel klasöre `sub_tr.vtt`, `sub_en.vtt` olarak yazılır.

---

## 5. Uygulama Genelinde Durum Yönetimi (`DownloadContext.jsx`)

Uygulamanın herhangi bir yerinden indirme başlatabilmek ve ilerlemeyi dinleyebilmek için React Context:

```javascript
// src/context/DownloadContext.jsx
export const DownloadContext = createContext();

export function DownloadProvider({ children }) {
  // state: downloads (id -> DownloadItem)
  // state: activeDownloadId

  // startDownload({ content, source, quality, subtitles })
  // pauseDownload(id)
  // resumeDownload(id)
  // cancelDownload(id)
  // deleteDownload(id)
  // isDownloaded(contentId) -> boolean
  // getDownloadProgress(contentId) -> number
}
```

---

## 6. Kullanıcı Arayüzü (UI) Entegrasyonu

### 1. Detay Sayfası Butonu (`src/components/MovieDetailComponents/ActionButtons.jsx`)
- "Şimdi İzle" butonunun sağına veya ikincil butonlar arasına **İndir** butonu:
  - **İndirilmedi:** Bulut indirme ikonu + "İndir"
  - **Sırada / İndiriliyor:** Dairesel ilerleme çubuğu (%45) + Duraklat butonu
  - **Tamamlandı:** Yeşil onay ikonu + "İndirildi"
- Tıklandığında kalite seçim modalı açılır (`DownloadQualityModal.jsx`).

### 2. Dizi Bölüm Listesi (`SeasonsSection.jsx`)
- Her bölüm kartının sağ tarafına küçük bir indirme ikonu.

### 3. İndirilenler Ekranı (`src/app/(app)/downloads.jsx`)
- **Üst Kısım:**
  - Depolama Barı: StreamPulse'ın kapladığı alan (örn. 3.2 GB), Cihazdaki Toplam Boş Alan (örn. 28 GB).
- **Orta Kısım:**
  - Sekmeler: "Filmler" ve "Diziler" (Diziler sezon/bölüm accordion yapısında).
  - Her kartta afiş, başlık, dosya boyutu, oynat butonu ve sil butonu.
- **Aktif İndirmeler Bölümü:**
  - İndirilen öğelerin anlık hız, kalan süre ve progress bar ile gösterimi.

---

## 7. Çevrimdışı Oynatıcı Entegrasyonu (`src/app/(app)/player.jsx`)

Mevcut oynatıcınız (`react-native-video`) yerel dosyaları zaten oynatabilmektedir.

1. **PlayerScreen Parametreleri:**
   ```javascript
   router.push({
     pathname: "/player",
     params: {
       url: downloadItem.localVideoPath, // file:///.../local_playlist.m3u8 veya file:///.../video.mp4
       title: downloadItem.title,
       subtitle: downloadItem.subtitle,
       poster: downloadItem.localPosterPath || downloadItem.posterUrl,
       id: downloadItem.contentId,
       isOffline: "true",
       offlineSubtitles: JSON.stringify(downloadItem.localSubtitles),
     },
   });
   ```
2. **VideoPlayer Güncellemesi:**
   - `isOffline === "true"` olduğunda harici API'ye kaynak çıkarma isteği atılmaz.
   - Doğrudan yerel dosya ve yerel altyazılar oynatıcıya verilir.
   - HTTP başlıkları (headers) yerel dosyada devre dışı bırakılır.

---

## 8. Karşılaşılabilecek Zorluklar ve Çözümleri

| Zorluk | Cloudstream'in Çözümü | StreamPulse Yaklaşımı |
| :--- | :--- | :--- |
| **Hotlink / Referer Koruması** | İstek başlıklarını koruyarak indirme | Segment isteklerine extractor başlıklarını (`Referer`, `Cookie`) ekleme |
| **Büyük HLS Akışları (1000+ segment)** | Kuyruk & worker havuzu ile indirme | Eşzamanlılığı 3-4 segment ile sınırlandırma, bellek taşmasını önleme |
| **Arka Planda İndirmenin Durması** | Android Foreground Service & Notification | `expo-notifications` veya yerel bildirim eşliğinde arka plan görevi |
| **Depolama İzinleri (Scoped Storage)** | App-specific external storage | `FileSystem.documentDirectory` kullanarak izinsiz güvenli alan kullanımı |
| **AES-128 Şifreli HLS** | Key dosyasını indirip yerel m3u8'de gösterme | `#EXT-X-KEY` tespit edilirse anahtar dosyasını da yerel klasöre indirip m3u8'i güncelleme |

---

## 9. Uygulama Adımları Kontrol Listesi (Checklist)

- [ ] **Adım 1:** `expo-file-system` ve `m3u8-parser` paketlerinin doğrulanması/eklenmesi.
- [ ] **Adım 2:** `src/services/downloader/` modüllerinin yazılması (HLS parser, segment indirici, MP4 indirici).
- [ ] **Adım 3:** `DownloadContext` ve kuyruk mekanizmasının kurulması; `AsyncStorage` ile senkronizasyon.
- [ ] **Adım 4:** `ActionButtons` ve `SeasonsSection` bileşenlerine "İndir" butonunun ve kalite modalının eklenmesi.
- [ ] **Adım 5:** `src/app/(app)/downloads.jsx` (İndirilenler ekranı) arayüzünün oluşturulması.
- [ ] **Adım 6:** `player.jsx` ve `VideoPlayer.jsx` bileşenlerinde çevrimdışı oynatma modunun test edilmesi.
- [ ] **Adım 7:** Ağ bağlantısı kapalıyken (Uçak modu) oynatma, altyazı ve izleme geçmişi testleri.
