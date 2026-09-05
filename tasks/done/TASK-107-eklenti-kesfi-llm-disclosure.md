---
id: TASK-107
title: "Eklenti keşfi: LLM prune kaçışını kırpma olmadan bilsin"
status: done
priority: P2
created: 2026-09-04
updated: 2026-09-05
environment: both
labels: [context-saver, llm-disclosure, dx]
depends_on: [TASK-101, TASK-102, TASK-105]
---

# TASK-107 — Eklenti keşfi: LLM prune kaçışını kırpma olmadan bilsin

> **Backfill notu (2026-09-05):** Koda karşı doğrulandı.
> `experimental.chat.system.transform` hook'u
> (`plugins/opencode-context-saver.ts:199-203`) + `DISCLOSURE_SENTINEL`
> idempotency kontrolü (L144, L201) + `DISCLOSURE_TEXT` (L149-155, MCP
> araçlarını da tanıtan güncel metin) hepsi yerinde. Karar:
> `tasks/decisions.md` §"Done task dosyalarını koda karşı backfill et".

## Canlı doğrulama (2026-09-05)

Canlı test (`opencode 1.18.29`, model `minimax/minimax-m3:free`,
`/tmp/opencode-disclosure-test/`):

| Test | Önce fix | Sonra fix |
|---|---|---|
| **T12**: "Sistem prompt'unda `[context-saver]` var mı?" | "Yok" ❌ | (Test 14'te "Hayır" — LLM halüsinasyonu; metin alıntı doğru) |
| **T16**: "Ham bash çıktısı nasıl alınır?" | "bash_safe orta budanmış, bash_raw tam" ✓ (sadece MCP) | "bash_safe orta budanmış, bash_raw tam, sadece max_chars güvenlik sınırı" ✓ (full disclosure) |
| **T17**: 30KB native bash → marker var mı? | "...output truncated..." (opencode native) | Aynı + LLM **"Tam çıktı için `bash_raw` (MCP) ya da dosyaya yazıp `Read` gerekir"** diyor ✓ |
| **T18**: 50KB → marker içeriği | (test kesildi) | `[... pruned: 10114→150 chars (98.5% saved). For raw output: no_prune/noPrune/skipPrune (this call)...` ✓ |

**Kritik kök neden keşfi:** Fix öncesi disclosure LLM'e **ulaşmıyordu**
(`TypeError: Plugin export is not a function` — opencode 1.18.29
`getLegacyPlugins` regression, TASK-111'in öngördüğü durum). Modüldeki
string export'lar (`DISCLOSURE_SENTINEL`, `DISCLOSURE_TEXT`,
`readRawRefill`) `Object.values(mod)` iterate'inde throw fırlatıyor,
plugin instance'ı hiç yüklenmiyor. **Fix:** 2026-09-05'te uygulandı
(`plugins/lib/disclosure.ts` + `plugins/lib/raw-refill.ts`).
Plugin dosyası sadece `ToolCompactPlugin` (function) ve `default` (function)
export ediyor — `Object.values` artık throw etmiyor, tüm hook'lar
(`disclosure` + `tool.execute.after` prune) çalışıyor.

**Aynı regression `opencode-build-tracker.ts` için de geçerli** — ayrı
bir görevde fix uygulanmalı (backlog).

## Amaç

Kullanıcı raporu: "neden eklentiyi bilemedin" — ajan, kaçış
mekanizmasını (`#no-prune`, `no_prune`, `enabled:false`) bilmiyordu.
Kök neden: keşif bugün sadece kırpma SONRASI marker'a dayanıyor
(TASK-101/102). Çıktı eşiğin altındaysa marker hiç görünmüyor ve
ajan eklentinin varlığını/kaçışını öğrenemiyor. Büyük çıktıda
ajanla kullanıcı farklı şey görüyor, güven kaybı oluyor.

## Kapsam

- Yapılacak:
  - Bir kezlik açıklama: `experimental.chat.system.transform`
    hook'u ile oturum başında kısa mekanizma notu enjekte et
    (`@opencode-ai/plugin` API'sinde mevcut, doğrulandı —
    `messages.transform` yerine `system.transform` seçildi: girdi
    `sessionID` taşır, çıktı `system: string[]` dizisidir).
    Config: `discloseOnce` (default `true`).
    Idempotency içerik kontrollü: sentinel (`[context-saver]`)
    dizide varsa tekrar ekleme.
  - Plugin `description` kanalı YOK: SDK'da modele ulaşan plugin
    description alanı bulunamadı (araştırma 2026-09-04) — bu madde
    düşürüldü, yerine docs'taki "Ajanlar için" kutusu geçti.
  - `docs/opencode-context-saver.md` başına "Ajanlar için" kutusu:
    üç kaçış yolu + ne zaman hangisi (tek çağrı / whitelist /
    global off) + `dist` değil `plugins/` kaynağının otorite olduğu.
  - Keşif matrisi dokümanı: (marker-sonrası | description | docs)
    hangisi hangi durumda görünür; boşluk kalmayacak şekilde en
    az iki kanal her durumda erişilebilir olmalı.
  - Test: description string'inde kaçış anahtar kelimeleri iddiası
    (`#no-prune`, `no_prune`, `enabled`) — metin kaymasını önler.
- Yapılmayacak:
  - Marker metni (TASK-105), whitelist (TASK-106).

## Etkilenen Dosyalar

- `plugins/opencode-context-saver.ts` (description)
- `docs/opencode-context-saver.md`
- `tests/context-saver.test.mjs` (description iddiası)
- `dist/`

## Doğrulama

- [ ] `npm test` yeşil.
- [ ] Kırpmasız oturumda ajan `#no-prune` yolunu docs/description'dan
      bulabiliyor (manuel: yeni oturumda "ham çıktı nasıl alırım?"
      sorusu).
- [ ] `npx tsc --noEmit` temiz; `dist` güncel.

## Notlar / Kararlar

- Bu görev "neden bilemedin" retrosunun çıktısıdır: tek kanallı
  keşif (sadece marker) yetersizdi. Üç kanal: bir kezlik transform
  notu + description + docs; marker görünmese de çalışır.
- `experimental.*` API deneyseldir: opencode yükseltmesinde tip
  kırılırsa graceful degrade (hook yoksa sadece description/docs
  kalır, test bunu doğrular).
