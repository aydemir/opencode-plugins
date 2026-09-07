---
id: TASK-123
title: "Settle-noticer: biten build'i sorulmadan bildir (next-contact notice plugin)"
status: done
priority: P1
created: 2026-09-07
updated: 2026-09-07
environment: both
labels: [settle, wakeup, plugin, build-mon, live-test]
depends_on: [TASK-119, TASK-122]
file: tasks/todo/TASK-123-settle-noticer.md
---

# TASK-123 — Settle-noticer (next-contact notice)

## Kök neden (kanıtlı, 2026-09-07)

Koşum-1 PASSED 21:12:39Z'de dosyaya push oldu ama ajan ~30dk sonra
kullanıcı sorusuyla öğrendi. Üç yol elendi:

1. Bloklu bekleme (`bm_output wait:true`) gateway `-32001` ile ölür
   (TASK-119 K1b + Koşum-1 tekrarı).
2. `BM_ON_SETTLE` (/root/opencode-bm 0.2.0 `src/server.ts:19`) sadece
   **yerel shell komutu** çalıştırır (`notify-send` örneği) — LLM'e
   wakeup değil.
3. Plugin hook'ları sadece oturum aktivitesinde ateşlenir (araç sonucu
   / sistem dönüşümü) — turn-arası uyandırma primitifi YOK.

## Hüküm (normatif)

Bu repoda kodlanabilir çözüm **next-contact notice**'tur: biten build,
ajan bir dahaki sefere herhangi bir araç sonucu aldığında / oturum
açıldığında SORULMADAN önüne düşer. "Ajan uyanır" vaat edilmez —
"ajan bir daha temas kurduğunda kaçırmaz" vaat edilir. Dürüst sınır
dokümanda yazılır.

## Tasarım

- Yeni plugin `opencode-settle-noticer` (`sn`) + lib
  `plugins/lib/settle-notice.ts` (TASK-111 pattern'i: plugin dosyası
  sadece `default` export — 1.18.29 iterate kuralı).
- `tool.execute.after`: her araç sonucunda event dizinlerini tara
  (`*.status.json`, bounded), final (`exit` alanı var) + bildirilmemiş
  kayıtları bul, `output.output` sonuna `[sn] settled:` notu ekle
  (tn'nin kanıtlı mutasyon pattern'i), `.notified` işaretle (idempotent).
- `experimental.chat.system.transform`: disclosure (sentinel idempotent).
- Final tanımı: status.json'da `exit` alanı olması (tüm build-mon
  finalleri exit yazar; HEARTBEAT/STALLED-uyarı yazmaz). Olay-adı
  listesi bakım gerektirmez.
- Config: `enabled` (true), `eventDirs` (yoksa `BUILD_MON_DIR` +
  `<cwd>/tmp/build-mon`, var olanlar), `maxFiles` (20),
  `skipWhenContains` (`#no-settle-notice`). Additive, default = eski
  davranış (diğer pluginler etkilenmez).
- `server.ts` 5. factory + `package.json` exports/keywords (additive).

## Kapsam-dışı

- Gerçek turn-arası wakeup (harness desteği ister — bu repo veremez).
- `BM_ON_SETTLE` tarafı (başka repo) — sadece dokümanda ilişki notu.
- Mevcut 4 plugin'in davranışı — dokunulmaz (testleri yeşil kalır).

## Doğrulama

- `npx tsc --noEmit` + `npm test` yeşil (yeni test dahil ~15).
- `server-entry.test.mjs` 4→5 güncellemesi.
- E2E: gerçek Koşum-1 dizinine karşı tara → `[sn]` notu + idempotency.
- `docs/opencode-settle-noticer.md` + PROJECT_MAP + `index.json`.

## Notlar / Kararlar

- (2026-09-07) Açılış: kullanıcı emri "aç ve çözümü kodla". Koşum-1
  Düzeltme'sinin doğrudan çocuğu.
- (2026-09-07) Kapanış: 108/108 test yeşil (14 yeni + server-entry 5'li).
  Ara bulgu: Plugin tipi `(input, options)` — config ikinci argümandan
  da okunur (mevcut pluginlerin input.config cast'i korunur, ikisi
  birleştirilir). E2E gerçek Koşum-1 dizininde: ilk temas `[sn] settled:
  j1-kanitli PASSED (exit=0)`, ikinci temas sessiz.
