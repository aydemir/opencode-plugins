---
id: TASK-122
title: "build-mon log rotasyonu: $NAME.log PASSED→sil / fail→arşiv + events.jsonl boyut/yaş rotasyonu"
status: done
priority: P2
created: 2026-09-07
updated: 2026-09-07
environment: both
labels: [build-mon, log-rotation, audit-trail, live-test]
depends_on: []
file: tasks/todo/TASK-122-build-mon-log-rotasyonu.md
---

# TASK-122 — build-mon log rotasyonu (iki dosya, iki kural)

## Ayrım (nüans — tek kural İKİ dosyaya uygulanmaz)

**`$NAME.log`** (derleme çıktısı, her koşumda `: > "$LOG"` ile sıfırlanır):

- `PASSED` → sil (`rm -f "$LOG"`). Kayıt `events.jsonl`'deki PASSED
  satırında kalır (`derleme geçti (Ns)`).
- `FAILED` / `ERROR` / `TIMED_OUT` / `STALLED` (kill) / `INTERRUPTED` →
  sakla, `$EVENT_DIR/$NAME.log.<event>-<UTCts>` adıyla arşivle
  (örn. `j1.log.failed-20260907T210000Z`). Böylece sonraki koşumun
  sıfırlaması delili ezmez.

**`events.jsonl`** (append-only audit trail — `PASSED`'da SİLME YOK):

- TASK-116 "kalıcı kayıt formatı" ilkesi + gelecekteki liveness-baseline
  (tarihsel süre karşılaştırması) bu dosyaya dayanır.
- Silme yerine **boyut/yaş bazlı rotasyon** (logrotate mantığı):
  startup'ta boyut > `--rotate-size` (default 10MB) VEYA dosya mtime
  yaşı > `--rotate-days` (default 30, `0`=kapalı) ise
  `events-<UTCts>.jsonl` diye arşivle, yenisiyle başla.
- `--rotate-keep N` (default 5): en yeni N arşiv tutulur, eskiler silinir.

## Flags (yeni)

- `--rotate-size BYTES` (default `10485760`, `0`=boyut kontrolü kapalı)
- `--rotate-days N` (default `30`, `0`=yaş kontrolü kapalı)
- `--rotate-keep N` (default `5`)

Default'lar = eski davranışa en yakın (küçük event dizinleri hiç
rotasyona girmez); geriye uyumluluk korunur.

## Kapsam

- `scripts/build-mon.sh`: `rotate_events()` (startup) +
  final sınıflandırmada log sil/arşivle + header usage + docs.
- `docs/build-mon.md`: rotasyon bölümü.
- Kod yok: polling daemon, prompt değişikliği — yok.

## Doğrulama (smoke, /tmp)

- Fake `true` → PASSED: `$NAME.log` silindi, events'te PASSED var.
- Fake `false` → FAILED: `*.log.failed-<ts>` arşiv oluştu, ad formatı doğru.
- `--rotate-size 1` → `events-<ts>.jsonl` arşivi oluştu, yeni events.jsonl başladı.
- `--rotate-keep 2` + 3 arşiv → en eski silindi, 2 kaldı.
- `bash -n scripts/build-mon.sh` temiz.

## Güvenlik kapısı (kök neden)

- Koşum-1 (`bash-1`, `j1-kanitli`) bitmeden `scripts/build-mon.sh`
  dosyasına DOKUNMA: çalışan bash script'i artımlı okur, ortada edit
  karışık byte çalıştırır. Final `PASSED`/`FAILED` push'u
  (`events.jsonl`) görülünce başla.

## Notlar / Kararlar

- (2026-09-07) Açılış: kullanıcı incelemesi — "başarılıyı sil" sadece
  `$NAME.log` için, `events.jsonl` audit-trail'dir, rotasyon görür.
- (2026-09-07) Kapanış: 9/9 smoke geçti (`bash -n` + T1 PASSED-sil +
  T2 FAILED-arşiv (ad+içerik+event log alanı) + T3 boyut + T4 keep=2 +
  T5 yaş + T6 eşik-altı rotasyonsuz + T7 TIMED_OUT-arşiv/exit124 +
  T8 help + T9 geçersiz flag exit2). Koşum-1 final push'undan sonra
  implemente edildi (çalışan script'e dokunulmadı).
- (2026-09-07) Ek: smoke'lar TDD'ye taşındı — `tests/build-mon.test.mjs`
  (7 test: PASSED/FAILED/TIMED_OUT/STALLED-uyarı/rotasyon/keep/flag).
  Suite 118/118 yeşil. Kapsanmayan: INTERRUPTED + kill-on-stall ile
  öldürme (flaky, dosyada gerekçeli).
