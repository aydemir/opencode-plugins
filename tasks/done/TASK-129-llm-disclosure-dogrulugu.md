---
id: TASK-129
title: "LLM disclosure doğruluğu: cpu-liveness drift + build-tracker mini-disclosure + sn hbmon cümlesi"
status: done
priority: P2
created: 2026-09-10
updated: 2026-09-10
environment: both
labels: [llm-disclosure, cpu-liveness, build-tracker, settle-noticer]
depends_on: []
file: tasks/todo/TASK-129-llm-disclosure-dogrulugu.md
---

# TASK-129 — LLM disclosure doğruluğu (3 paket)

## Amaç

Oturum başında LLM'e push'lanan disclosure metinlerinde tespit edilen
boşluklar (2026-09-10 denetimi): biri gerçek drift, biri eksik bildirim,
biri zayıf kapsam cümlesi.

## Kapsam

1. **cpu-liveness drift fix** (`plugins/lib/cpu-liveness-disclosure.ts`).
   `buildCpuLivenessText()` (canlı metin) ioGraceRounds cümlesini
   içermiyor; ölü fallback `CPU_LIVENESS_TEXT` içeriyor. Builder'a eksik
   cümleyi ekle + test (`cpu-liveness-disclosure.test.mjs`).
2. **build-tracker mini-disclosure** (~40 token). 6 plugin'den
   `system.transform` push'lamayan tek pasif plugin; LLM `thresholdMs`,
   `extraErrorPatterns`, `app.log` satır anlamını öğrenemiyor.
   Sabitler `plugins/lib/build-tracker-disclosure.ts`'e (getLegacyPlugins
   kuralı: plugin dosyası sadece `default` export eder) + hook + test.
3. **sn hbmon kapsam cümlesi** (`plugins/lib/settle-notice.ts`
   `DISCLOSURE_TEXT`): hbmon-watched build'lerin kapsanmadığı yazmıyor.
   Tek cümle + test.

Yapılmayacaklar: hbmon'a disclosure (tool description'ları yeterli),
stderr P3, token/phrase kararı (TASK-128).

## Doğrulama

- [ ] `npx tsc --noEmit` temiz
- [ ] Yeni testler + mevcut suite regresyonsuz
- [ ] Canlı metin = fallback metin bilgi-eşdeğerliği (paket-1)
- [ ] `tasks/index.json` TASK-129 `done`

## Notlar / Kararlar

- Token bütçesi: mini-disclosure ~40 token hedefi (cs presedenti);
  küçük-context'li modeller gerekçesiyle kısa tutulur.
- Presedent: sabitler `lib/`'de, sentinel-idempotent transform, isim-assert
  testleri (TASK-127/128).
