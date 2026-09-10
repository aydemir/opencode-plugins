---
id: TASK-131
title: "settle-noticer bayatlık sezgisi: finalsız + yaşlı heartbeat'e stale-notice (yeni process yok)"
status: todo
priority: P3
created: 2026-09-10
updated: 2026-09-10
environment: both
labels: [settle-noticer, build-mon, staleness, next-contact]
depends_on: [TASK-125]
file: tasks/todo/TASK-131-settle-stale-notice.md
---

# TASK-131 — settle-noticer bayatlık sezgisi

## Amaç

Monitör SIGKILL/OOM ile ölürse (`TASK-125` kanıtı): final yazılmaz,
settle-noticer susar, kullanıcı "build ne oldu?" diye kör kalır. Dış
watchdog process'i regresyona girer (kim onu gözler?) — bunun yerine
settle-noticer'ın mevcut taramasına bayatlık sezgisi ekle.

## Kapsam

- `scanSettled` yanına `scanStale(dirs, maxAgeMs)`: son olay final-dışı
  (STARTED/HEARTBEAT/STALLED-uyarı) VE yaşı > eşik olan build'ler.
- Eşik: heartbeat aralığı + tolerans (öneri: `max(3 × heartbeat, 180sn)`;
  heartbeat aralığı status dosyasından bilinmiyor → sabit default + config
  `staleAfterMs`). Karar implementasyonda, gerekçesiyle.
- Bildirim: `[sn] stale: <name> son olay <EVENT> <yaş> önce (monitör sessiz)`,
  `.notified` gibi TEKRAR SPAM YOK (stale başına bir kez; yeni olay gelirse
  sayaç sıfırlanır).
- `status.json`'da monitör pid'i YOK → pid-liveness kontrolü YOK, sadece
  yaş-heuristiği (TASK-125 tasarım girdisi).
- Test: eski heartbeat'li fixture → stale notice bir kez; taze → sessizlik;
  final gelince stale bayrağı temizlenir.

Yapılmayacaklar: ayrı watchdog process/cron, pid takibi, `markNotified`
sözleşme değişikliği (stale izi ayrı dosyada: `<name>.stale-notified`).

## Etkilenen Dosyalar

- `plugins/lib/settle-notice.ts` (`scanStale`, sabitler)
- `plugins/opencode-settle-noticer.ts` (hook'a ek dal)
- `tests/settle-noticer.test.mjs`
- `docs/opencode-settle-noticer.md` (tek paragraf)

## Doğrulama

- [ ] `npx tsc --noEmit` temiz
- [ ] Yeni testler + mevcut suite regresyonsuz
- [ ] Canlı prova: TASK-125 senaryosu tekrarı → stale notice yüzeye çıkıyor
- [ ] `tasks/index.json` TASK-131 `done`

## Notlar / Kararlar

- (2026-09-10) TASK-125 kararı (a-lite) buraya devredildi. Dış process
  reddi gerekçesi: sonsuz regresyon + P3 ağırlığı.
- Eşik default'u implementasyonda ölçülüp yazılacak (speküle edilmedi).

## Kapanış (2026-09-10)

- `scanStale` + `<name>.stale-notified` (ts/event bağlı, yeni olay re-arm) + `buildStaleNotice`; hook'ta settle'dan bağımsız dal; `staleAfterMs` default 180sn (3 × heartbeat 60sn), geçersizde fail-soft.
- Disclosure'a stale cümlesi + docs paragraf + config tablosu satırı.
- Canlı prova: TASK-125 donmuş dizini → `[sn] stale: killtest son olay HEARTBEAT 8dk önce (monitör sessiz — final yok)` ilk temasta, ikincide sessiz (prova işareti temizlendi, dizin donmuş halde).
- Suite: 148 test (147 pass + 1 pre-existing skip), tsc temiz.
