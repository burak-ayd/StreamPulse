# Kaldığın Yerden Devam Et - Implementation Plan

# Tamamlandı.

## Gereksinimler

- İlk 10sn sonra progress kaydı başlasın
- Her 5-10 saniyede progress güncellensin
- Film/dizi süresinin %90-95'i izlendiyse "tamamlandı" sayılsın ve listeden kaldırılsın
- Dizilerde: bölüm bitince, sonraki bölüm varsa otomatik "devam et"e eklensin
- Ana sayfa ve profil sayfasında "Kaldığın Yerden Devam Et" bölümü görünsün

---

## 1. Data Model

### `CONTINUE_WATCHING` Storage Key

```js
STORAGE_KEYS.CONTINUE_WATCHING = "user_continue_watching";
```

### Data Yapısı

```js
{
  id: "content-id",           // Film/bölüm unique ID
  title: "Film/Dizi Adı",
  poster: "url",
  type: "movie" | "episode",  // Film mi, bölüm mü?

  // Progress bilgisi
  currentTime: 120,           // Son izlenen saniye
  duration: 7200,             // Toplam süre (saniye)
  progress: 0.016,            // İlerleme yüzdesi (0-1)

  // Dizi bilgisi (type=episode ise)
  seriesId: "series-id",      // Dizi ID
  seriesTitle: "Dizi Adı",
  season: 1,
  episode: 3,
  episodeTitle: "Bölüm Adı",
  nextEpisode: {              // Sonraki bölüm varsa
    id: "next-episode-id",
    season: 1,
    episode: 4,
    url: "..."
  },

  // Metadata
  updatedAt: "2026-09-22T21:00:00Z",
  url: "player-url"           // Oynatıcıya gitmek için URL
}
```

---

## 2. Backend Değişiklikleri (YOK)

Backend'den değişiklik gerekmez. Mevcut `player.jsx` parametreleri yeterli:

- `url`: player URL
- `title`, `subtitle`, `poster`: content bilgisi
- `id`: contentId

---

## 3. Storage Fonksiyonları (`utils/storage.js`)

### 3.1. `getContinueWatching()`

```js
// Tüm "devam et" listesini döndür
// updatedAt'a göre sıralı (en son izlenen üstte)
```

### 3.2. `saveContinueWatching(data)`

```js
// Progress kaydı
// Eğer progress >= 0.90 → listeden çıkar (tamamlandı)
// Eğer currentTime < 10 → ekleme (threshold altı, henüz erken)
// İlk kayıt: currentTime >= 10 saniye olunca hemen kaydet
// Varsa güncelle (updatedAt yenile), yoksa ekle
```

### 3.3. `removeContinueWatching(id)`

```js
// Listeden çıkar (kullanıcı manuel silerse)
```

### 3.4. `markEpisodeComplete(seriesId, season, episode)`

```js
// Bölüm bitti → eğer nextEpisode varsa yeni kayıt oluştur
// currentTime=0, duration=0 (henüz oynatılmadı ama devam et listesinde)
```

---

## 4. VideoPlayer Değişiklikleri (`VideoPlayer.jsx`)

### 4.1. Progress Tracking

```js
const [lastSavedTime, setLastSavedTime] = useState(0);

const handleProgress = (data) => {
	setCurrentTime(data.currentTime);

	// İlk kayıt: 10. saniyede hemen kaydet
	// Sonrası: her 5-10sn'de bir güncelle
	const shouldSave =
		(data.currentTime >= 10 && lastSavedTime === 0) || // İlk kayıt
		(data.currentTime - lastSavedTime >= 5 && data.currentTime >= 10); // Periyodik

	if (shouldSave) {
		setLastSavedTime(data.currentTime);

		const progress = data.currentTime / duration;

		if (progress >= 0.9) {
			// Tamamlandı → listeden çıkar
			removeContinueWatching(contentId);

			// Eğer dizi bölümüyse + nextEpisode varsa
			if (type === "episode" && nextEpisode) {
				markEpisodeComplete(seriesId, season, episode);
			}
		} else {
			// Progress kaydet
			saveContinueWatching({
				id: contentId,
				title,
				poster,
				type,
				currentTime: data.currentTime,
				duration,
				progress,
				// ... diğer metadata
			});
		}
	}
};
```

### 4.2. Component Unmount

```js
useEffect(() => {
  return () => {
    // Çıkarken son kez kaydet
    if (currentTime >= 10 && currentTime / duration < 0.90) {
      saveContinueWatching({...});
    }
  };
}, [currentTime, duration]);
```

### 4.3. Props Eklemeleri

```js
export default function VideoPlayer({
	// ... mevcut props
	contentId, // Yeni: content ID
	contentType, // Yeni: "movie" | "episode"
	seriesInfo, // Yeni: { seriesId, season, episode, nextEpisode }
}) {
	// ...
}
```

---

## 5. Player Screen Değişiklikleri (`player.jsx`)

### 5.1. Storage'dan Resume Position Oku

```js
useEffect(() => {
	async function loadResumePosition() {
		const continueData = await getContinueWatching();
		const match = continueData.find((item) => item.id === contentId);

		if (match && match.currentTime > 10) {
			setResumePosition(match.currentTime);
			setShowResumePrompt(true); // Kullanıcıya sor
		}
	}
	loadResumePosition();
}, [contentId]);
```

### 5.2. Resume Prompt UI (opsiyonel)

```js
{
	showResumePrompt && (
		<Modal>
			<Text>Kaldığınız yerden devam edilsin mi?</Text>
			<Text>{formatTime(resumePosition)}</Text>
			<Button
				onPress={() => {
					setInitialTime(resumePosition);
					setShowResumePrompt(false);
				}}>
				Devam Et
			</Button>
			<Button
				onPress={() => {
					setInitialTime(0);
					setShowResumePrompt(false);
				}}>
				Baştan İzle
			</Button>
		</Modal>
	);
}
```

### 5.3. VideoPlayer'a Props Geç

```js
<VideoPlayer
	sources={sources}
	title={title}
	subtitle={subtitle}
	poster={poster}
	onClose={handleClose}
	initialTime={initialTime}
	contentId={contentId} // Yeni
	contentType={contentType} // Yeni: "movie" veya "episode"
	seriesInfo={seriesInfo} // Yeni: dizi bilgisi
/>
```

---

## 6. Ana Sayfa (`index.jsx`)

### 6.1. Continue Watching List Ekle

```js
const [continueWatching, setContinueWatching] = useState([]);

useEffect(() => {
	async function loadContinueWatching() {
		const data = await getContinueWatching();
		setContinueWatching(data.slice(0, 10)); // İlk 10 kayıt
	}
	loadContinueWatching();
}, []);
```

### 6.2. UI Component

```js
{
	continueWatching.length > 0 && (
		<View style={styles.section}>
			<Text style={styles.sectionTitle}>Kaldığın Yerden Devam Et</Text>
			<ScrollView horizontal>
				{continueWatching.map((item) => (
					<ContinueWatchingCard
						key={item.id}
						item={item}
						onPress={() =>
							router.push({
								pathname: "/player",
								params: {
									url: item.url,
									title: item.title,
									id: item.id,
									// ... diğer params
								},
							})
						}
					/>
				))}
			</ScrollView>
		</View>
	);
}
```

---

## 7. Profil Sayfası (`profile/index.jsx`)

### 7.1. Continue Watching Tab Ekle

```js
const tabs = ["history", "favorites", "continue"]; // Yeni tab

{
	activeTab === "continue" && (
		<FlatList
			data={continueWatching}
			renderItem={({ item }) => <ContinueWatchingCard item={item} />}
		/>
	);
}
```

---

## 8. UI Component: `ContinueWatchingCard`

### Yeni Dosya: `components/content/ContinueWatchingCard.jsx`

```js
export default function ContinueWatchingCard({ item, onPress }) {
	const progress = item.progress * 100; // 0-100 yüzde

	return (
		<TouchableOpacity onPress={onPress}>
			<Image source={{ uri: item.poster }} />

			{/* Progress bar */}
			<View style={styles.progressBar}>
				<View
					style={[styles.progressFill, { width: `${progress}%` }]}
				/>
			</View>

			<Text>{item.title}</Text>
			<Text>
				{formatTime(item.currentTime)} / {formatTime(item.duration)}
			</Text>

			{item.type === "episode" && (
				<Text>
					S{item.season}E{item.episode}
				</Text>
			)}
		</TouchableOpacity>
	);
}
```

---

## 9. Implementation Sırası

### Faz 1: Storage Layer

1. `storage.js` → CONTINUE_WATCHING key ekle
2. `getContinueWatching()` fonksiyonu
3. `saveContinueWatching()` fonksiyonu
4. `removeContinueWatching()` fonksiyonu
5. Test: Console'dan manuel kayıt ekle/oku

### Faz 2: VideoPlayer Tracking

1. `VideoPlayer.jsx` → props ekle (`contentId`, `contentType`, `seriesInfo`)
2. `onProgress` → progress kaydetme logic
3. `useEffect` unmount → son kayıt
4. Test: Video izle, app'i kapat, storage'ı kontrol et

### Faz 3: Player Screen Resume

1. `player.jsx` → storage'dan resume position oku
2. Resume prompt UI (opsiyonel, başta skip edilebilir)
3. `initialTime` state yönetimi
4. Test: Video aç, 2dk izle, kapat, tekrar aç → 2dk'dan devam etmeli

### Faz 4: Ana Sayfa UI

1. `index.jsx` → `continueWatching` state
2. Continue Watching section ekle
3. `ContinueWatchingCard` component
4. Test: Ana sayfada liste görünmeli

### Faz 5: Profil Sayfası

1. `profile/index.jsx` → "continue" tab ekle
2. Liste render
3. Test: Profil → Continue tab

### Faz 6: Episode Auto-Continue (diziler)

1. `markEpisodeComplete()` fonksiyonu
2. VideoPlayer → %90 bitince + nextEpisode varsa yeni kayıt
3. Backend'den sonraki bölüm bilgisi gerekirse: `player.jsx` parametrelerine `nextEpisode` ekle
4. Test: Dizi bölümü bitir, sonraki bölüm continue'ya eklenmeli

---

## 10. Edge Cases

### 10.1. İlk 10 saniye (threshold)

- `currentTime < 10` → kaydetme, henüz erken
- `currentTime >= 10` → ilk kayıt anında yapılır, sonrası her 5-10sn güncellenir

### 10.2. %90-95 tamamlanma

- `progress >= 0.90` → listeden çıkar
- Watch history'ye ekle (zaten `addToWatchHistory` çağrılıyor)

### 10.3. Aynı içerik tekrar izlenirse

- Varolan kayıt güncellenir (`saveContinueWatching` içinde filter + prepend)

### 10.4. Sonraki bölüm bilgisi yok

- `nextEpisode = null` → sadece mevcut bölüm tamamlanır, yeni kayıt eklenmez

### 10.5. Liste sınırı

- En fazla 50 kayıt (storage.js içinde `.slice(0, 50)`)
- UI'da ilk 10 göster

---

## 11. Test Senaryoları

### Senaryo 1: Film izle

1. Film aç
2. **15 saniye izle** (10sn threshold geçince aktif)
3. App'i kapat
4. Ana sayfayı aç → "Kaldığın Yerden Devam Et" bölümünde film görmeli
5. Filme tıkla → 15. saniyeden başlamalı

### Senaryo 2: Film bitir

1. Film aç
2. %95'e kadar izle
3. Liste otomatik temizlenmeli

### Senaryo 3: Dizi bölümü bitir

1. Dizi bölümü aç (S1E3)
2. %95'e kadar izle
3. Eğer S1E4 varsa → S1E4 otomatik "devam et"e eklenmeli
4. Ana sayfada S1E4 görmeli

### Senaryo 4: İlk 10 saniye (threshold altı)

1. Video aç
2. **8 saniye izle, kapat**
3. Continue listesinde görünmemeli (henüz 10sn geçilmedi)

---

## 12. Ponytail Notları

### Basitleştirmeler

- **Resume prompt yok:** Başta skip, direkt `initialTime` geç (kullanıcı fark etmez)
- **Episode auto-continue manuel:** Sonraki bölüm bilgisi backend'den gelmiyorsa bu feature skip
- **UI polish sonra:** İlk versiyonda basit card yeterli, progress bar opsiyonel

### Upgrade Path

- Resume prompt modal ekle → kullanıcı deneyimi +
- Thumbnail preview ekle (Netflix gibi) → hangi sahnede kaldığını göster
- Backend'den sonraki bölüm API'si → tam dizi desteği
- Cross-device sync → farklı cihazlarda devam et

---

**Toplam Etkilenen Dosya:** 6

- `utils/storage.js` (yeni fonksiyonlar)
- `components/player/VideoPlayer.jsx` (tracking)
- `app/(app)/player.jsx` (resume logic)
- `app/(app)/index.jsx` (continue section)
- `app/(app)/profile/index.jsx` (continue tab)
- `components/content/ContinueWatchingCard.jsx` (yeni component)

**Satır Sayısı Tahmini:** ~300-400 satır toplam
