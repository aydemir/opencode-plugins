---
id: TASK-106
title: "Geçici kapatma + always-raw whitelist"
status: done
priority: P2
created: 2026-09-04
updated: 2026-09-05
environment: both
labels: [context-saver, lib-prune, escape-hatch]
depends_on: [TASK-102, TASK-104]
---

# TASK-106 — Geçici kapatma + always-raw whitelist

> **Backfill notu (2026-09-05):** Koda karşı doğrulandı. `matchesRawPatterns`
> (`plugins/lib/prune.ts:165`) + `rawCounters` Map + `readRawRefill`
> (`plugins/opencode-context-saver.ts:161,178,228-240`) + `disableForCalls`
> config validasyonu (`plugins/opencode-context-saver.ts:114-116`) hepsi
> yerinde. Karar: `tasks/decisions.md` §"Done task dosyalarını koda karşı
> backfill et".

## Amaç

Kullanıcı raporu: "geçici kapat" ve "white list" ihtiyacı. Mevcut
durumda sadece iki uç var: global `enabled: false` (kalıcı kapatma)
veya çağrı başına `#no-prune` / `no_prune` flag'i (tek çağrılık).
Arada kalan iki ihtiyaç tanımsız:

1. Geçici kapatma: "sonraki N çağrıda / bu oturumda dokunma" demek
   için her çağrıya flag yazmak gerekiyor.
2. Whitelist: repo'da `whitelist`/`allowlist` string'i hiç yok
   (araştırma: `grep -l whitelist` boş döndü). Bazı tool/komutların
   (ör. belli `bash` kalıpları, `read`) hiç kırpılmaması isteniyor
   ama config'de böyle bir liste yok.

## Kapsam

- Yapılacak:
  - Config'e `alwaysRawCommands?: string[]` (shell alt-string/`regex:`
    listesi) ekle; `tool.execute.after` içinde prune öncesi erken
    return. Tool adları için AYRI liste YOK — mevcut `skipTools`
    kullanılır (teklik ilkesi; çift mekanizma reddedildi).
  - Geçici kapatma için en küçük mekanizma: `disableForCalls?: number`
    (config + per-call arg) — sayaç bitene kadar ham bırak, sonra
    otomatik eski davranışa dön. Alternatifleri (oturum bayrağı,
    süre bazlı) Notlar'da karşılaştır, birini seç ve gerekçesini yaz.
  - `resolvePruneBudget` / `enabled=false` kontrolüyle çakışmayı
    tanımla: whitelist ve sayaç `enabled=false` ile aynı erken
    return yolunu kullanır.
  - `docs/opencode-context-saver.md` + `examples/opencode.jsonc`
    güncellemesi (iki yeni alan örnekli).
  - Unit + plugin integration testi (whitelist eşleşti/eşleşmedi,
    sayaç azaldı/bitti, `enabled=false` ile etkileşim).
- Yapılmayacak:
  - Marker metni değişikliği (TASK-105).
  - LLM'in otomatik whitelist kararı (ilgi dışı).

## Etkilenen Dosyalar

- `plugins/lib/prune.ts` (eşleşme yardımcısı + sayaç tipi)
- `plugins/opencode-context-saver.ts` (config resolve + erken return)
- `docs/opencode-context-saver.md`
- `examples/opencode.jsonc`
- `tests/prune.test.mjs`, `tests/context-saver.test.mjs`
- `dist/`

## Doğrulama

- [ ] `npm test` yeşil; yeni testler: whitelist hit/miss, sayaç
      N→0 geçişi, sayaç bitince prune'a dönüş.
- [ ] `npx tsc --noEmit` temiz; `dist` güncel.
- [ ] Geriye uyumluluk: alansız eski config'lerde davranış değişmez.

## Notlar / Kararlar

- Aday geçici-kapatma tasarımları: (a) `disableForCalls` sayacı —
  deterministik, test edilebilir, oturum çökerse kendiliğinden
  sıfırlanır; (b) oturum bayrağı — kalıcılaşma riski, state ister;
  (c) süre bazlı — saat bağımlılığı, flaky test riski. Öneri: (a).
- Whitelist eşleşmesi için substring default, `regex:` prefix'i
  opsiyonel — TASK-104'teki `skipWhenContains` sadeliğini koru.
- **Karar (uygulama):** `alwaysRawTools` yapılmadı — `skipTools` zaten
  tool whitelist'idir; ikinci liste tekrardı. Komut whitelist'i
  (`alwaysRawCommands`) + sayaç (`disableForCalls`) + per-call refill
  + load-time fail-loud validasyon uygulandı.
