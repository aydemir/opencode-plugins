---
id: TASK-104
title: "Araç çağrısında per-call prune toggle (no_prune arg)"
status: done
priority: P2
created: 2026-09-02
updated: 2026-09-05
resolution: done
environment: both
labels: [context-saver, lib-prune, tool-call-toggle]
depends_on: [TASK-102]
---

# TASK-104 — Araç çağrısında per-call prune toggle

> **Backfill notu (2026-09-05):** Koda karşı doğrulandı. `shouldSkipForArgs`
> (`plugins/lib/prune.ts:141`) + `t.args` sniffing
> (`plugins/opencode-context-saver.ts:213`) + `CompactConfig.skipWhenContains`
> (default `#no-prune`) hepsi yerinde. Karar:
> `tasks/decisions.md` §"Done task dosyalarını koda karşı backfill et".

## Amaç

Mevcut `enabled` global toggle init'te çalışıyor, pruneMiddle'da `skipWhenContains` text tabanlı. Kullanıcı her araç çağrısında (ör. `bash`, `read`, `grep`) prune'ı kapatmak istediğinde dinamik kontrol yok. Bu görev per-tool-call `no_prune` arg desteği ekler.

Kullanıcı problemi: uzun output'u tek çağrıda ham görmek ister, global kapatmadan sadece o çağrıyı bypass etmek ister.

## Kapsam

- Yapılacak:
  - `tool.execute.after` içinde `t.args` kontrolü: `no_prune`, `noPrune`, `skipPrune`, `no_prune=true` varyantları
  - string arg değerlerinde `skipWhenContains` (default `#no-prune`) araması
  - `pruneMiddle` çağrısından önce erken return ile ham output bırakma
  - geriye uyumluluk: default davranış korunur (false ise eski gibi prune)
  - unit + plugin entegrasyon testi
- Yapılmayacak:
  - Tool şemasına gerçek OpenCode parametresi ekleme (plugin seviyesinde args sniffing)
  - Build-tracker plugin değişikliği (scope dışı)
  - LLM otomatik `no_prune` kararı (ilgi dışı)

## Uygulama Planı

1. `plugins/lib/prune.ts` incele: `PruneMiddleOptions.enabled` ve `skipWhenContains` mevcut, `shouldSkipPrune(args, text)` helper ekle
2. `plugins/opencode-context-saver.ts` `tool.execute.after` başında per-call check ekle:
   ```
   const perCallSkip = shouldSkipPerCall(t.args, config.skipWhenContains)
   if (perCallSkip || config.enabled===false) -> skip prune, ham bırak
   ```
3. Helper: args object'teki tüm string value'larda `skipWhenContains` substring veya boolean flag taraması
4. Config'e `skipWhenContains?: string` opsiyonu ekle (default `#no-prune`, TASK-102 ile uyumlu)
5. Test: prune unit + context-saver.test.mjs per-call senaryoları
6. Docs: `docs/opencode-context-saver.md` ve `examples/opencode.jsonc` güncelle

## Etkilenen Dosyalar

- `plugins/opencode-context-saver.ts` (ana değişiklik)
- `plugins/lib/prune.ts` (helper + export)
- `docs/opencode-context-saver.md` (dokümantasyon)
- `tests/context-saver.test.mjs` + `tests/prune.test.mjs` (test)
- `tasks/index.json` + `index.json` (görev takibi)

## Doğrulama

- [ ] Manuel: `node /tmp/test_per_call.mjs` → `no_prune=true` ile ham, olmadan pruned
- [ ] Otomatik: `npm test` / `npx tsc --noEmit`
- [ ] Edge: `headChars+tailChars > compressThreshold` throw korunuyor, `codePointLength` unicode doğru
- [ ] Geriye uyumluluk: eski config'ler ve `#no-prune` text marker hala çalışıyor

## Notlar / Kararlar

- Karar: tool şemasına parametre eklemek yerine `t.args` sniffing (OpenCode plugin API'si tool şemasını değiştirmeyi desteklemiyor, best-effort)
- Tradeoff: false positive riski düşük (args'ta `#no-prune` substring nadir), boolean flag öncelikli
- Alternatif: output text'inde marker aramak zaten var, args araması ek güvenlik

## Çözüm

- `plugins/lib/prune.ts` `shouldSkipForArgs(args, skipWhenContains)` eklendi (TASK-104)
- `plugins/opencode-context-saver.ts` `CompactConfig.skipWhenContains`, `DEFAULT_CONFIG`, `shouldSkipForArgs` entegrasyonu, `tool.execute.after` per-call bypass
- `docs/opencode-context-saver.md` per-call toggle dokümantasyonu, `examples/opencode.jsonc` skipWhenContains örneği
- Doğrulama: `npm test` 26 ✔, `npx tsc --noEmit` temiz, manuel per-call test PASS
