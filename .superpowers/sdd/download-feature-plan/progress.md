# SDD ledger — plan: download_feature_plan.md

Ruling: Test altyapisi yok (jest/vitest yok) ve kullinici faz-faz + versiyon commitleme istedi; test runner kurmak kapsam disi. Dogrulama = expo lint (yeni dosyalarda hata yok) + tsc --noEmit (yeni hata yok). Faz basina commit.
Ruling: Backend bu repoda yer almıyor (API dış sunucu). Backend değişikliği gerektiren faz yok → backend versiyon commit'i yapılmayacak; extractVideoSources zaten VAR (api.js:575).

Task 1 (Faz 1 - Altyapi): complete (commit 7e6e318, test: npx eslint (degisen 4 dosya) → 0 yeni hata; npx tsc --noEmit → baseline 4/4)
Task 2 (Faz 2 - Modal): in progress

Task 2 (Faz 2 - Modal): complete (commit 6fe1058, test: eslint degisen 2 dosya → temiz; tsc → baseline 4/4)
Ruling: Dizide hangi bolumun indirilecegi planda net degil; karar ActionButtons'da uygulandi: izleme suruyorsa o bolum, degilse ilk sezonun ilk URL'li bolumu. Yanlis bolum secilirse kullanicidan kaynakli UX gecici — modalda bolum secimi sonraki fazda eklenebilir. Maliyeti: kullanicinin "yanlis bolumu indirdi" sikayeti.

Task 3 (Faz 3 - Ayarlar): complete (commit 95b192e, test: eslint degisen 2 dosya → temiz; tsc → baseline 4/4)
Task 4 (Faz 4 - Indirme ekrani): complete (test: eslint downloads.jsx → temiz; tsc → baseline 4/4)

Task 5 (Faz 5): KISMİ — madde 14 (çevrimdışı oynatma) uygulandı; 11 (HLS), 12 (arka plan), 13 (bildirim) ertelendi.
Ruling: Faz 5 istegе bağlıydı; plan HLS'yi "ayrı bir çalışma" olarak öneriyor, arka plan indirme expo-task-manager + native rebuild, bildirimler expo-notifications + FGS ister — cihaz testi olmadan riskli. Çevrimdışı oynatma JS tarafında güvenli: kaynaklariGetir tamamlanmış indirmeyi bulup yerel dosyayı tek kaynak döndürür (extract atlanır). Maliyet: indirmesi olan kullanıcı çevrimiçi izlemek için indirmeyi silmek zorunda; ileride "çevrimiçi izle" seçeneği eklenebilir.
Ruling: İndirme öğesine seriesId alanı eklendi (eşleştirme için) — planın DOWNLOAD_ITEM şemasında yoktu; gerıye uyumlu ekleme.

Final review: fresh subagent (ses_e960bcb74ffeeII9pCOTKEzlC0). Bulgu dagilimi: 2 Critical, 4 Important, 8 Minor.
Final: fixed CRITICAL mutate-deadlock (getDownloadSettings/getPluginDownloadPrefs mutate disina alindi) — eslint+tsc dogrulandi, 0 yeni hata
Final: fixed CRITICAL resumeAll context'te yok (DownloadContext'e pauseAll/resumeAll eklendi)
Final: fixed IMPORTANT savable() pauseAsync'ten once (pauseAsync'in dondurdugu savable kullaniliyor + yarisa karsi status kontrolu)
Final: fixed IMPORTANT runDownload baslatma penceresi yarisi (downloadAsync oncesi status guard + resumable temizligi)
Final: fixed IMPORTANT remove() diski/storage silmiyor (deleteDownloadItem + .part temizligi)
Final: fixed IMPORTANT shouldAskBeforeDownload baglanmadi (ActionButtons hizli yol: kayitli tercih + preferredSource ile direkt enqueue)
Final: minor (deferred): modal ses parcasi satirlari oldü (secim state yok) — extract audioTracks pratikte gelmiyor, bolum genelde gizli
Final: minor (deferred): extract [] dondugunde ag hatasi ile 'kaynak yok' mesaji ayrismiyor
Final: minor (deferred): queued ogende Duraklat butonu sessiz no-op
Final: minor (deferred): yerel file:// altyazi useSubtitles fetch'inde yuklenmeyebilir (Android)
Final: minor (deferred): initialize() pausedAt/emitStatus yazilmiyor; retry yolu resumeData kaydetmiyor; emitProgress UI tick throttle'siz
Final: minor (deferred): enqueue tekillestirme yarisi (iki ekran senaryosu)
Final: minor (deferred): maxConnectionsPerDownload ayari manager'da islevsiz (ileriki faz)
