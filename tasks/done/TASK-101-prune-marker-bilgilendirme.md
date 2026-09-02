---
id: TASK-101
title: "prune marker'ı bilgilendirici yap (LLM'e declare)"
status: done
priority: P1
created: 2026-09-02
updated: 2026-09-02
environment: both
labels: [context-saver, lib-prune, llm-disclosure]
depends_on: []
---

# TASK-101 — prune marker'ı bilgilendirici yap

## Amaç

`opencode-context-saver` tool çıktısını kırptığında marker olarak
`"[... tool output middle pruned ...]"` ekliyordu. LLM bu marker'ı
gördüğünde ne kırpıldığını, ne ölçüde kırpıldığını ve nasıl ham çıktı
isteneceğini bilmiyordu. Bu task marker'ı bilgilendirici hale getirdi.

## Kapsam — Yapılan

- `plugins/lib/prune.ts`:
  - `PRUNE_MARKER` sabiti **korundu** (geriye uyumluluk).
  - `PruneMarkerStats` interface'i eklendi.
  - `formatPruneMarker(stats)` helper'ı eklendi — deterministik, idempotent.
  - `PruneMiddleOptions.markerBuilder?: (stats) => string` opsiyonel alan
    eklendi. Verilirse `marker` (string) yok sayılır.
  - `pruneMiddle`:
    - Erken return koşulu `head+tail`'e göre sadeleştirildi (önce budget
      hesabı gerekiyordu; şimdi gerekmiyor, markerBuilder stats'a bağlı).
    - `marker` öncelik sırası: `markerBuilder` → `marker` (string) → `PRUNE_MARKER`.
    - Invariant (`resultLen < originalChars && resultLen <= budget`) korunuyor.
- `plugins/opencode-context-saver.ts`:
  - `formatPruneMarker` import edildi.
  - **Her iki** `pruneMiddle` çağrısına `markerBuilder: formatPruneMarker`
    eklendi (L127 tool-log entry, L144 output.event).
- `docs/opencode-context-saver.md`: "Marker formatı (LLM disclosure)" bölümü
  eklendi.

## Kapsam — Yapılmayan

- Token sayacı (karakter yeterli, P3 gap olabilir).
- System prompt augmentation (TASK-102 sonrası değerlendirilir).
- Inline `#no-prune` marker (TASK-102 kapsamında).

## Uygulama Planı (gerçekleşen)

1. ✅ `PruneMarkerStats` + `formatPruneMarker` (`plugins/lib/prune.ts`).
2. ✅ `PruneMiddleOptions.markerBuilder` alanı.
3. ✅ `pruneMiddle` gövdesini güncelle (geriye uyumlu).
4. ✅ `opencode-context-saver.ts` import + iki çağrı yeri.
5. ✅ Test (10/10): küçük bypass, default marker, markerBuilder stats,
   özel marker, idempotent text.
6. ✅ Typecheck temiz.
7. ✅ Doc güncellemesi.

## Etkilenen Dosyalar

- `plugins/lib/prune.ts`
- `plugins/opencode-context-saver.ts`
- `docs/opencode-context-saver.md`
- `dist/` (build artifact, repoda kalır)

## Doğrulama

- [x] `npx tsc --noEmit` temiz
- [x] `npx tsc` build başarılı (`dist/`)
- [x] Marker formatı beklenen regex'e uyuyor:
  `/\[\.\.\. pruned: \d+→\d+ chars \(\d+\.\d+% saved\)\. Use no_prune=true for raw output \.\.\.\]/`
- [x] Çok küçük çıktıda marker yok
- [x] Default `marker` string verilirse yeni davranış bozulmaz
- [x] Idempotent: iki pass'te text aynı (marker stats güncellenir)
- [x] Geriye uyumlu: `PRUNE_MARKER` export edilmeye devam ediyor

## Test Çıktısı

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

Örnek üretim:

```
[... pruned: 50000→300 chars (99.4% saved). Use no_prune=true for raw output ...]
```

## Notlar / Kararlar

- **Karar:** `points.length <= budget` yerine `originalChars <= head + tail`
  kullanıldı. Sebep: `markerBuilder` çağrısı için `originalChars` ve
  `keptChars = head + tail` gerekiyor; budget henüz hesaplanmamış oluyor
  (marker builder'a bağlı). Yeni koşul daha basit ve doğru.
- **Karar:** Token yerine karakter sayıldı. Karakter sayısı Unicode-safe
  (`codePointLength`), ücretsiz, hızlı. Token sayımı tiktoken bağımlılığı
  ekler; hedef kitle hafif plugin istiyor. İleride P3 gap olarak eklenebilir.
- **Karar:** `escapeHint` `formatPruneMarker`'da default `no_prune=true`
  alındı. TASK-102 bu string'i inline `#no-prune` marker ile birleştirecek.
- **Risk:** Plugin options'dan `enabled` okunmuyor henüz — TASK-102 ile
  gelecek. Şu an marker sadece bilgilendirme, davranış değişmiyor.