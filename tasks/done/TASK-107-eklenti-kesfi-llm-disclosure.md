---
id: TASK-107
title: "Eklenti keşfi: LLM prune kaçışını kırpma olmadan bilsin"
status: done
priority: P2
created: 2026-09-04
updated: 2026-09-04
environment: both
labels: [context-saver, llm-disclosure, dx]
depends_on: [TASK-101, TASK-102, TASK-105]
---

# TASK-107 — Eklenti keşfi: LLM prune kaçışını kırpma olmadan bilsin

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
