---
id: TASK-101
title: "prune marker'ı bilgilendirici yap (LLM'e declare)"
status: done
priority: P1
created: 2026-09-02
updated: 2026-09-05
environment: both
labels: [context-saver, lib-prune, llm-disclosure]
depends_on: []
---

# TASK-101 — prune marker'ı bilgilendirici yap

> **Backfill notu (2026-09-05):** Bu dosya kapatıldıktan sonra TASK-102
> (escape mekanizması) + TASK-104/105/106/107 marker formatını genişletti
> (`escapeHint`, `formatShortPruneMarker`, `disclosedSessions` toggle,
> `DISCLOSURE_TEXT` sistem notu). Bu dosyadaki "iki `pruneMiddle` çağrısı
> L127/L144", "marker = `Use no_prune=true for raw output`", "10/10 test"
> iddiaları o tarihteki kodu yansıtıyordu ama kod artık farklı. Aşağıdaki
> "Kapsam — Yapılan (2026-09-02)" orijinal kapsamı korur; "Mevcut kod
> durumu (2026-09-05 backfill)" güncel resmi verir. İlgili ref kararı:
> `tasks/decisions.md` §"Done task dosyalarını koda karşı backfill et".

## Amaç

`opencode-context-saver` tool çıktısını kırptığında marker olarak
`"[... tool output middle pruned ...]"` ekliyordu. LLM bu marker'ı
gördüğünde ne kırpıldığını, ne ölçüde kırpıldığını ve nasıl ham çıktı
isteneceğini bilmiyordu. Bu task marker'ı bilgilendirici hale getirdi.

## Kapsam — Yapılan (2026-09-02, orijinal)

- `plugins/lib/prune.ts`:
  - `PRUNE_MARKER` sabiti **korundu** (geriye uyumluluk).
  - `PruneMarkerStats` interface'i eklendi.
  - `formatPruneMarker(stats)` helper'ı eklendi — deterministik.
  - `PruneMiddleOptions.markerBuilder?: (stats) => string` opsiyonel alan
    eklendi. Verilirse `marker` (string) yok sayılır.
  - `pruneMiddle`:
    - Erken return koşulu sadeleştirildi.
    - `marker` öncelik sırası: `markerBuilder` → `marker` (string) → `PRUNE_MARKER`.
    - Invariant (`resultLen < originalChars && resultLen <= budget`) korunuyor.
- `plugins/opencode-context-saver.ts`:
  - `formatPruneMarker` import edildi.
  - `pruneMiddle` çağrısına `markerBuilder` eklendi.
- `docs/opencode-context-saver.md`: "Marker formatı (LLM disclosure)" bölümü
  eklendi.

## Mevcut kod durumu (2026-09-05 backfill)

- `plugins/lib/prune.ts:31` `PRUNE_MARKER` hâlâ export ediliyor.
- `plugins/lib/prune.ts:42` `PruneMarkerStats` interface'i:
  `originalChars`, `keptChars`, opsiyonel `escapeHint`.
- `plugins/lib/prune.ts:48` `formatPruneMarker` — bugün ürettiği format:
  `[... pruned: ${originalChars}→${keptChars} chars (${saved}% saved). For raw output: ${escapeHint || "no_prune=true (this call) or enabled:false (off)"}. ...]`
  Yani "Use no_prune=true for raw output" yerine "For raw output:" +
  `escapeHint` (uzun hint `formatPruneMarker` ile, kısa hint
  `formatShortPruneMarker` ile).
- `plugins/lib/prune.ts:76` `formatShortPruneMarker` — sonradan eklendi
  (TASK-102 kapsamında). 5 kaçış yolunu listeler, kırpma oranı
  gösterilmez.
- `plugins/lib/prune.ts:119` `PruneMiddleOptions.markerBuilder` artık
  inline closure ile kullanılıyor (aşağıya bak).
- `plugins/opencode-context-saver.ts:245` — `pruneMiddle` **tek çağrı**
  (önce iki çağrı L127/L144 olduğu iddia edilmişti; bugün tek yerde).
  Çağrı:
  ```ts
  pruneMiddle(rawOutput, {
    headChars: config.headChars,
    tailChars: config.tailChars,
    markerBuilder: (stats) => {
      const sid = t.sessionID ?? "unknown"
      if (disclosedSessions.has(sid)) return formatShortPruneMarker(stats, shortOpts)
      disclosedSessions.add(sid)
      return formatPruneMarker({ ...stats, escapeHint: longHint })
    },
    enabled: config.enabled,
    skipWhenContains: config.skipWhenContains,
  })
  ```
  Yani ilk kırpma → uzun marker (kaçış yolları); sonrakiler → kısa marker.
- `plugins/opencode-context-saver.ts:144-155` `DISCLOSURE_TEXT` — sistem
  prompt'una oturum başında enjekte edilen keşif notu (TASK-107).
- `plugins/mcp-bash-tools/src/tools/bash_safe.ts:53-77` — `pruneMiddle`
  ayrı implementasyon (MCP tarafı), `lib/prune.ts`'i kullanmıyor.
  Duplication; refactor backlog'unda.

## Kapsam — Yapılmayan (orijinal)

- Token sayacı (karakter yeterli, P3 gap olabilir).
- System prompt augmentation (TASK-102 sonrası değerlendirilir).
- Inline `#no-prune` marker (TASK-102 kapsamında).

## Uygulama Planı (gerçekleşen, 2026-09-02)

1. ✅ `PruneMarkerStats` + `formatPruneMarker` (`plugins/lib/prune.ts`).
2. ✅ `PruneMiddleOptions.markerBuilder` alanı.
3. ✅ `pruneMiddle` gövdesini güncelle (geriye uyumlu).
4. ✅ `opencode-context-saver.ts` import + `pruneMiddle` çağrısı
   (güncel kodda tek çağrı, inline `markerBuilder`).
5. ✅ Test (orijinal: 10). Güncel test sayısı: `tests/prune.test.mjs`'te
   21 test, 4'ü doğrudan marker (`formatPruneMarker`: 2,
   `formatShortPruneMarker`: 3, `pruneMiddle` shape+idempotent: 2, diğer
   prune davranışları: 4, +10 yardımcı: extractErrors/isBuildCommand/
   matchesRawPatterns/resolvePruneBudget/extractSummarySafe/codePointLength).
6. ✅ Typecheck temiz.
7. ✅ Doc güncellemesi (`docs/opencode-context-saver.md` "Marker formatı
   (LLM disclosure)" §).

## Etkilenen Dosyalar

- `plugins/lib/prune.ts`
- `plugins/opencode-context-saver.ts`
- `docs/opencode-context-saver.md`
- `dist/` (build artifact, repoda kalır)

## Doğrulama

- [x] `npx tsc --noEmit` temiz
- [x] `npx tsc` build başarılı (`dist/`)
- [x] Marker formatı bugün:
  `/\\[\\.\\.\\. pruned: \\d+→\\d+ chars \\(\\d+\\.\\d+% saved\\)\\. For raw output: [^.]+\\. \\.\\.\\.\\]/`
  (regex için escape uyarısı: backtick'ler bash'ta anlamlı)
- [x] Çok küçük çıktıda marker yok
- [x] Default `marker` string verilirse yeni davranış bozulmaz
- [x] Idempotent: iki pass'te text aynı (marker stats güncellenir)
- [x] Geriye uyumlu: `PRUNE_MARKER` export edilmeye devam ediyor

## Test Çıktısı (2026-09-02, orijinal snapshot)

```
ok: küçük input bypass
ok: default marker (back-compat)
ok: default marker eski hali
ok: markerBuilder stats: original
ok: markerBuilder stats: kept (head+tail)
ok: markerBuilder stats: % saved
ok: markerBuilder escape hint
ok: yeni marker eski marker'ı içermez
ok: özel marker hala çalışıyor
ok: idempotent text (marker dışında)
✅ Tüm testler geçti
```

Örnek üretim (orijinal format):

```
[... pruned: 50000→300 chars (99.4% saved). Use no_prune=true for raw output ...]
```

Örnek üretim (güncel format):

```
[... pruned: 50000→300 chars (99.4% saved). For raw output: no_prune/noPrune/skipPrune (this call) | embed "#no-prune" in args | disableForCalls=N (next N raw) | alwaysRawCommands (config whitelist) | enabled:false (off in plugin config). ...]
```

## Notlar / Kararlar

- **Karar (2026-09-02):** `points.length <= budget` yerine `originalChars <= head + tail`
  kullanıldı. Sebep: `markerBuilder` çağrısı için `originalChars` ve
  `keptChars = head + tail` gerekiyor; budget henüz hesaplanmamış oluyor
  (marker builder'a bağlı). Yeni koşul daha basit ve doğru.
- **Karar (2026-09-02):** Token yerine karakter sayıldı. Karakter sayısı Unicode-safe
  (`codePointLength`), ücretsiz, hızlı. Token sayımı tiktoken bağımlılığı
  ekler; hedef kitle hafif plugin istiyor. İleride P3 gap olarak eklenebilir.
- **Karar (2026-09-02):** `escapeHint` `formatPruneMarker`'da default `no_prune=true`
  alındı. TASK-102 bu string'i inline `#no-prune` marker ile birleştirecek.
- **Karar (2026-09-05, post-task):** Marker formatı sonradan `For raw output: ${hint}`
  şeklinde revizeye uğradı; `hint` `escapeHint` üzerinden dinamik. `disclosedSessions`
  Set ile ilk kırpma → uzun marker, sonrakiler → kısa marker (`formatShortPruneMarker`).
- **Karar (2026-09-05, post-task):** Plugin options'dan `enabled` okunuyor (artık
  `config.enabled` → `pruneMiddle`'e `enabled` option olarak geçiyor; L102-105
  `resolvePruneBudget` ile validasyon). Bu görev kapatıldığında hâlâ
  okunmuyordu (Not: "Plugin options'dan `enabled` okunmuyor henüz" diyordu).
- **Risk / P3 gap:** `plugins/mcp-bash-tools/src/tools/bash_safe.ts:56`
  `pruneMiddle` ayrı implementasyon — `plugins/lib/prune.ts` ile
  birleştirilebilir. Bu TASK-101 sonrası TASK-109 ile geldi; refactor
  backlog'unda ayrı bir görev olarak izlenmeli.