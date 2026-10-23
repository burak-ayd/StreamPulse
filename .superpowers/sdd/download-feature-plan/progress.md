# SDD ledger — plan: download_feature_plan.md

Ruling: Test altyapisi yok (jest/vitest yok) ve kullinici faz-faz + versiyon commitleme istedi; test runner kurmak kapsam disi. Dogrulama = expo lint (yeni dosyalarda hata yok) + tsc --noEmit (yeni hata yok). Faz basina commit.
Ruling: Backend bu repoda yer almıyor (API dış sunucu). Backend değişikliği gerektiren faz yok → backend versiyon commit'i yapılmayacak; extractVideoSources zaten VAR (api.js:575).

Task 1 (Faz 1 - Altyapi): complete (commit 7e6e318, test: npx eslint (degisen 4 dosya) → 0 yeni hata; npx tsc --noEmit → baseline 4/4)
Task 2 (Faz 2 - Modal): in progress

Task 2 (Faz 2 - Modal): complete (commit 6fe1058, test: eslint degisen 2 dosya → temiz; tsc → baseline 4/4)
Ruling: Dizide hangi bolumun indirilecegi planda net degil; karar ActionButtons'da uygulandi: izleme suruyorsa o bolum, degilse ilk sezonun ilk URL'li bolumu. Yanlis bolum secilirse kullanicidan kaynakli UX gecici — modalda bolum secimi sonraki fazda eklenebilir. Maliyeti: kullanicinin "yanlis bolumu indirdi" sikayeti.

Task 3 (Faz 3 - Ayarlar): complete (commit 95b192e, test: eslint degisen 2 dosya → temiz; tsc → baseline 4/4)
Task 4 (Faz 4 - Indirme ekrani): complete (test: eslint downloads.jsx → temiz; tsc → baseline 4/4)
