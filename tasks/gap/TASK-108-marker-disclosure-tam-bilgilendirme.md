---
id: TASK-108
title: "Marker + disclosure tam bilgilendirme (5 yol + runtime doğrulama)"
status: todo
priority: P1
created: 2026-09-05
updated: 2026-09-05
environment: both
labels: [context-saver, lib-prune, llm-disclosure, gap]
depends_on: [TASK-105, TASK-107]
---

# TASK-108 — Marker + disclosure tam bilgilendirme

## Amaç

Canlı oturumda LLM, eklenti tool çıktısını kırptığında **kaçış yollarını**
görmüyor. İki kök neden:

1. `formatShortPruneMarker` yalnızca 2 yol listeliyor (`no_prune=true`,
   `enabled:false (off)`). Oysa mevcut 5 kaçış yolu var:
   - `no_prune` / `noPrune` / `skipPrune` (per-call boolean)
   - `#no-prune` (per-call `skipWhenContains` substring)
   - `disableForCalls` (per-call sayaç doldurma)
   - `alwaysRawCommands` (config whitelist)
   - `enabled:false` (config global kapatma)

2. Disclosure (`experimental.chat.system.transform`) yalnızca
   **system prompt'ta** görünür; **ilk kırpma marker'ı** gelene kadar
   LLM'in tool çıktısı zaten kırpılmıştır. Marker metni zayıf kalırsa
   disclosure yetersiz olur.

Bu task marker metnini **tüm 5 yolu** içerecek şekilde genişletir ve
runtime'da doğrulanabilir hale getirir.

## Kapsam — Yapılacak

- `plugins/lib/prune.ts`:
  - `formatShortPruneMarker` artık tüm 5 yolu listeler; config
    `skipWhenContains` değerini dinamik alır.
  - `PruneMarkerStats.escapeHint` zaten opsiyonel; `formatPruneMarker`
    bunu kullanır (değişiklik yok).
- `plugins/opencode-context-saver.ts`:
  - `markerBuilder` callback'ine `escapeHint` üretmek için config
    snapshot (`{ skipWhenContains, alwaysRawCommands, disableForCalls }`)
    geçirilir.
  - `extractSummarySafe` helper'ı gerekirse `escapeHint` parametresi
    alabilir.
- `tests/context-saver.test.mjs` veya `tests/prune.test.mjs`:
  - Kısa marker'ın default `skipWhenContains="#no-prune"` durumunda
    `#no-prune` substring'ini içerdiğini doğrula.
  - Kısa marker'ın `no_prune` / `noPrune` / `skipPrune` / `disableForCalls` /
    `alwaysRawCommands` / `enabled` kelimelerinin hepsini içerdiğini
    doğrula.
  - Özelleştirilmiş `skipWhenContains="%%raw%%"` değerinin marker'da
    yansıdığını doğrula.
- `docs/opencode-context-saver.md`:
  - Escape tablosu güncellenir (5 yol, hepsi tek tabloda).
  - Disclosure bölümüne "marker da aynı bilgiyi taşır" notu eklenir.

## Kabul Kriterleri

- [ ] `formatShortPruneMarker` çıktısı 5 yolun hepsini içerir.
- [ ] `skipWhenContains` config değiştiğinde marker otomatik güncellenir.
- [ ] Mevcut testler geçer (regresyon yok).
- [ ] Yeni en az 3 test eklenir.
- [ ] `tsc --noEmit` exit 0.
- [ ] `npm test` exit 0.
- [ ] Doküman escape tablosu tüm 5 yolu gösterir.

## Etkilenen Dosyalar

- `plugins/lib/prune.ts` — `formatShortPruneMarker` imzası + gövdesi
- `plugins/opencode-context-saver.ts` — `markerBuilder` config snapshot
- `tests/context-saver.test.mjs` — yeni testler
- `docs/opencode-context-saver.md` — escape tablosu + disclosure notu
- `tasks/index.json` — TASK-108 kaydı
- `index.json` — plugin status, key_decisions append

## Canlı Doğrulama (runtime test)

Plugin'i OpenCode'a yükledikten sonra:

1. `opencode.json`'da eklentiyi `enabled:true` ile bırak.
2. Bir tool'u (örn. `bash`) büyük çıktı verecek şekilde çağır.
3. LLM'in cevabında `[... pruned: ...]` marker'ının göründüğünü doğrula.
4. LLM'e "marker'daki kaçış yollarını listele" diye sor.
   - Tüm 5 yolu saymalı: `no_prune`, `#no-prune`, `disableForCalls`,
     `alwaysRawCommands`, `enabled:false`.
5. Eğer LLM hâlâ eski 2 yolu sayıyorsa: disclosure hook'u
   `experimental.chat.system.transform` runtime'da tetiklenmiyor
   olabilir. Bu durumda `chat.message` veya başka hook araştırılır;
   yeni bir gap task açılır.

## Notlar / Kararlar

- **Karar:** Marker metni her zaman 5 yolu içersin; config
  `skipWhenContains` değişmişse marker da değişsin. **REASON:**
  marker LLM'in tek gördüğü bilgi kaynağı (system prompt'a güvenmek
  riskli — hook sözleşmesi belirsiz). **SUPERSEDES:** TASK-105'in
  "kısa marker 2 yol" kararı.
- **Karar:** `formatPruneMarker` (uzun, ilk kırpma) `escapeHint`
  parametresini plugin'den alır; default'ı korunur (geriye uyumluluk).
  **REASON:** kullanıcı özelleştirirse uzun marker da bunu yansıtsın.
- **Karar:** Runtime test **bu task'ta zorunlu** (sembol kanıtı + test
  pass yetmez). **REASON:** kullanıcı gerçek oturumda LLM'in
  bilgilendirilmediğini gördü — bu task'ın kök nedeni. **SUPERSEDES:**
  AGENTS.md madde 5 ("Test ile bitir → manual smoke") — smoke yetersiz.