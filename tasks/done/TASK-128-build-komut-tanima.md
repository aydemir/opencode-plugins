---
id: TASK-128
title: "Build komut tanıma: array-arg + test-runner kapsamı (tracker körlüğü)"
status: done
priority: P2
created: 2026-09-10
updated: 2026-09-10
environment: both
labels: [build-tracker, lib-prune, arg-contract]
depends_on: []
file: tasks/todo/TASK-128-build-komut-tanima.md
---

# TASK-128 — Build komut tanıma: array-arg + test-runner kapsamı

## Amaç

`opencode-build-tracker` iki durumda session hiç açmıyor → `after` hook'u
`if (!sess.active) return` ile erken dönüyor → hata tespiti (builtin +
`extraErrorPatterns`) hiç çalışmıyor, derleme/test sessizce "yok"
sayılıyor. Kullanıcıya yanlış-✅ değil, daha kötüsü: **hiç-bildirim**.

## Kanıt (2026-09-10, TASK-127 testi yazarken)

`tests/build-tracker.test.mjs:12` ilk denemede kırmızı verdi: komut
`"pytest"` ile `before` hook'u session açmadı (`isBuildCommand` false),
`after` erken döndü, `extraErrorPatterns: ["^FAILED\\s"]` deseni doğru
olmasına rağmen `onBuildFailure` loglanmadı. Test `npm run build`
komutuyla yeşile döndü — yani boşluk komut-tanımada, desende değil.

## Kapsam

Yapılacaklar:

1. **`getCommandFromArgs` array desteği** (`plugins/opencode-build-tracker.ts`).
   `hbmon_watch` aracının `command` arg'ı `string[]` (`['cargo','build']`);
   mevcut kod `typeof a.command === "string"` bekleyip `""` dönüyor →
   hbmon ile başlatılan build'ler tracker'a görünmez. Öneri: array ise
   `" "` ile join edip `isBuildCommand`'a ver (segmenter zaten shell
   operatörlerine bölüyor).
2. **`isBuildCommand` test-runner kapsamı** (`plugins/lib/prune.ts`
   `BUILD_TOKENS`/`BUILD_PHRASES`). Bugün: `cargo`/`go`/`npm` var ama
   `pytest`, `jest`, `vitest` yok; `python -m pytest` ilk token `python`
   → miss. Karar task içinde: öneri tokenlara `pytest`, `jest`,
   `vitest` + phrase'lere `python -m` ekle (`node`/`python` tek başına
   EKLEME — her script session açar, gürültü olur).
3. **`resolveFilePath` ek ad araştırması** (`plugins/lib/truncation-notice.ts`):
   `filePath`/`path` kapsanıyor; `file`/`filename`/`input` kullanan
   araç var mı bak, varsa ekle (yoksa kapat, kanıtıyla).

Yapılmayacaklar (out-of-scope):

- stderr körlüğü (P3, opencode API sınırı — ayrı iş).
- `BUILD_ERROR_PATTERNS` (TASK-127 `extraErrorPatterns` ile kapandı).
- Disclosure/marker metinleri (isim-assert testleri var).

## Uygulama Planı

1. `getCommandFromArgs`: array → join; unit test (hbmon argv).
2. Token/phrase kararı + ekleme; test: `pytest`, `python -m pytest`,
   `npx jest` session açıyor; `python script.py`, `node server.js`
   açmıyor (gürültü guard).
3. Uçtan uca: `pytest` komutu + `FAILED ...` çıktısı +
   `extraErrorPatterns` → `onBuildFailure` (test-12'nin orijinal hali
   yeşile döner).
4. `resolveFilePath` taraması (kod + test, varsa yoksa kapat).

## Etkilenen Dosyalar

- `plugins/opencode-build-tracker.ts` (`getCommandFromArgs`)
- `plugins/lib/prune.ts` (`BUILD_TOKENS`, `BUILD_PHRASES`)
- `plugins/lib/truncation-notice.ts` (`resolveFilePath`, araştırma)
- `tests/build-tracker.test.mjs`, `tests/prune.test.mjs`
- `docs/PROJECT_MAP.md` (tek satır, davranış değişirse)

## Doğrulama

- [ ] `npx tsc --noEmit` temiz
- [ ] Yeni testler yeşil + mevcut suite (97 test) regresyonsuz
- [ ] `hbmon_watch` argv'si (`['cargo','build','--release']`) session açıyor
- [ ] `tasks/index.json` TASK-128 `done`

## Notlar / Kararlar

- Presedent: birikimli-liste = merge/additive (TASK-127 `extraErrorPatterns`,
  skipTools suffix). Token seti de birikimli — replace yok, ekleme.
- `node`/`python` çıplak token ÖNERİLMİYOR (gerekçe yukarıda); itiraz
  varsa task içinde karar verilir, sessizce eklenmez.
- İlişkili: AGENTS.md P3 stderr-körlüğü (bu task onu çözmez, karıştırma).

## Kapanış (2026-09-10)

- `getCommandFromArgs` array-join + test; tokenlara `pytest/jest/vitest`, phrase'lere `python -m`, `npx jest`, `npx vitest` eklendi; çıplak `node`/`python`/`npx eslint` sessiz (testli).
- `resolveFilePath`: repo taraması — `file`/`filename` kullanan araç yok, `filePath`/`path` yeterli, değişiklik yok.
- Suite: 125 test (124 pass + 1 pre-existing skip), tsc temiz.
