# SDD ledger — plan: download_feature_plan.md

Ruling: Test altyapisi yok (jest/vitest yok) ve kullinici faz-faz + versiyon commitleme istedi; test runner kurmak kapsam disi. Dogrulama = expo lint (yeni dosyalarda hata yok) + tsc --noEmit (yeni hata yok). Faz basina commit.
Ruling: Backend bu repoda yer almıyor (API dış sunucu). Backend değişikliği gerektiren faz yok → backend versiyon commit'i yapılmayacak; extractVideoSources zaten VAR (api.js:575).
