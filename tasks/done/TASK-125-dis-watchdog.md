---
id: TASK-125
title: "Dış watchdog: monitörün kendisi ölürse 'MONITOR_DEAD' kim diyecek (aday)"
status: done
priority: P3
created: 2026-09-07
updated: 2026-09-07
environment: both
labels: [build-mon, watchdog, oom, live-test]
depends_on: [TASK-122, TASK-123]
file: tasks/todo/TASK-125-dis-watchdog.md
---

# TASK-125 — Dış watchdog (aday, koşulmadı)

## Gözlem (kanıtlı zemin, hüküm yok)

build-mon `trap` INT/TERM yakalar ama SIGKILL'i yakalayamaz. Monitör
OOM-killer ile `-9` yerse: final olay yazılmaz, derleme ağacı temizlenmez
(yetim), `events.jsonl` son satırı son HEARTBEAT'te takılı kalır.
settle-noticer ateşlenemez (final yok). Koşum-1'de RAM 5.5/7.5GB idi —
risk gerçekleşmedi ama mekanizma kodda kilitsiz.

## Önerilen yön (tasarım yok, sadece soru)

Monitörün SAĞLIĞINI monitörün kendisinden bağımsız kim gözler?
Aday: event dizinini izleyen hafif dış watchdog — son HEARTBEAT/olay
yaşı `X`'i aşarsa `MONITOR_DEAD` olayı yazar (settle-noticer onu da
yüzeye çıkarır). Sorular: X ne olmalı (heartbeat 60sn + tolerans)?
Watchdog'un kendisini kim gözler (sonsuz regresyon)? Ayrı process mi,
cron mu, opencode-bm tarafı mı?

## Karar şablonu (koşum/tasarım sonrası)

- [ ] (a) Gerekli → tasarım + implementasyon TASK'ı (kapsam: tek dosya,
      test edilebilir, monitörle aynı dizine yazan bağımsız script).
- [ ] (b) Gereksiz (`timeout` tavanı + makine disiplini yeterli) →
      gerekçeli kapat.
- [ ] (c) INCONCLUSIVE → speküle etmeden kaydet.

## Kapsam-dışı

- Kod değişikliği (build-mon/settle-noticer) — yok; bu task sadece
  ihtiyaç kanıtı + karar.
- `timeout` tavanının kendisi — zaten var, ayrı konu.

## Doğrulama

- [ ] Senaryo kanıtı: monitöre SIGKILL → events.jsonl'de final YOK,
      ağaç yetim (ya da temiz — hangisiyse kayıt).
- [ ] Karar (a/b/c) yazıldı.
- [ ] `tasks/index.json` TASK-125 `done`.

## Notlar / Kararlar

- (2026-09-07) Aday olarak açıldı (kullanıcı onayı: "olur task olarak
  aç"). Sıralı iş listesinin 4. maddesi. P3 — Koşum-1'de gerçekleşmedi,
  mekanizma kilitsiz.

## Senaryo kanıtı (2026-09-10, loglar `/tmp/opencode-live-test/task125/events/`)

- Monitör (`node build-mon.mjs --name killtest`, pid 24969) çalıştı: STARTED + 2sn heartbeat'ler.
- `kill -9 24969` (OOM benzetimi) → monitör öldü, trap çalışmadı.
- Derleme çocuğu (pid 24976, `sleep 60`) **yetim yaşadı** (S-state, 20sn+), 60sn'de sessizce exit.
- `events.jsonl` 8×HEARTBEAT'te **dondu, final YOK**; `status.json`'da `exit` alanı YOK
  → settle-noticer `scanSettled` bulamaz → **bildirim asla ateşlenemez** (doğrulandı).
- Tasarım girdisi: `status.json`'da monitör pid'i YOK (ts/name/event/detail/log) →
  pid-liveness kontrolü status dosyasından yapılamaz; yaş-heuristiği gerekir.

## Karar: (a-lite) — dış process YOK, settle-noticer'a bayatlık sezgisi

- Tam dış watchdog (ayrı process/cron): regresyon sonsuzluğu + P3'e ağır → REDDEDİLDİ.
- Lite: settle-noticer zaten her tool-sonucu event dizinini tarıyor; "son olay
  final-dışı ve yaşı > N" ise tek satır stale-notice ekler. Yeni process yok,
  regresyon yok, test edilebilir. Detay + implementasyon → TASK-131.
