---
id: TASK-105
title: "Prune marker'ında tam çıktı için 'off' bildirimi"
status: done
priority: P1
created: 2026-09-04
updated: 2026-09-04
environment: both
labels: [context-saver, lib-prune, llm-disclosure]
depends_on: [TASK-101, TASK-102]
---

# TASK-105 — Prune marker'ında tam çıktı için "off" bildirimi

## Amaç

Kullanıcı raporu: kırpılmış çıktıyı gören LLM, ham çıktıyı nasıl
isteyeceğini marker'dan anlayamıyor. Mevcut marker
(`formatPruneMarker`) sadece `Use no_prune=true for raw output` diyor;
global kapatma yolu (`enabled: false`, yani "off") marker'da geçmiyor.
LLM küçük çıktılarda marker'ı hiç görmediği için kaçış yolunu
keşfedemiyor ("eklentiyi bilemedin" şikayeti).

## Kapsam

- Yapılacak:
  - `formatPruneMarker` çıktısına off yolunu ekle, ör:
    `[... pruned: X→Y chars (Z% saved). For raw output: no_prune=true
    (this call) or enabled:false (off, plugin config) ...]`
  - İki seviyeli marker (token ekonomisi): oturumdaki İLK kırpmada
    uzun marker (tam mekanizma: üç kaçış yolu), sonraki kırpmalarda
    kısa marker (sadece oran + `no_prune=true`/`off` işareti).
    Per-session `disclosed` bayrağı (`tool.execute.before` içinde
    `sessionID` mevcut; mevcut `startTimes` Map deseni kullanılır).
  - `escapeHint` override mekanizmasını koru (custom hint veren
    config'ler etkilenmesin).
  - `docs/opencode-context-saver.md` + `examples/opencode.jsonc`
    içindeki kaçış belgesini "off" ifadesiyle güncelle.
  - `tests/prune.test.mjs` içine marker metni iddiası ekle
    (mevcut testler `PRUNE_MARKER` sabitini kullanıyor; yeni metin
    için `formatPruneMarker` iddiası yok — bkz. araştırma).
- Yapılmayacak:
  - Whitelist / geçici kapatma (TASK-106 kapsamında).
  - System-prompt augmentation (TASK-107 kapsamında).

## Etkilenen Dosyalar

- `plugins/lib/prune.ts` (`formatPruneMarker`, `escapeHint` default)
- `plugins/opencode-context-saver.ts` (hint geçişi varsa)
- `docs/opencode-context-saver.md`
- `examples/opencode.jsonc`
- `tests/prune.test.mjs`
- `dist/` (build artifact)

## Doğrulama

- [ ] `npm test` yeşil (eski `PRUNE_MARKER` iddiaları korunur).
- [ ] Yeni iddia: marker metni hem `no_prune=true` hem `off`
      (`enabled:false`) yolunu içerir.
- [ ] İki seviyeli iddia: aynı session'da ilk kırpma uzun, ikinci
      kırpma kısa marker taşır; farklı session sayacı sıfırlar.
- [ ] `npx tsc --noEmit` temiz; `dist` güncel.
- [ ] İkinci pass idempotency korunur (kırpılmış girdi fail-fast).

## Notlar / Kararlar

- Karar taslağı: default hint'i tek string yerine iki yollu yap;
  custom `escapeHint` verenler etkilenmez (geriye uyumluluk).
- "off" kelimesi kullanıcı dilinden geliyor; config anahtarı
  `enabled: false` olduğu için marker'da ikisini birlikte yaz
  (`off` = `enabled:false`).
