---
id: TASK-121
title: "Disk-I/O körlüğü: CPU-zaman tek sinyal sessiz disk fazında false-stall üretir mi (3 koşum, kod yok)"
status: todo
priority: P2
created: 2026-09-07
updated: 2026-09-07
environment: linux
labels: [research, liveness, io-blindness, live-test]
depends_on: [TASK-117, TASK-119]
file: tasks/todo/TASK-121-disk-io-korlugu.md
---

# TASK-121 — Disk-I/O körlüğü (aday, koşulmadı)

## Gözlem (kanıtlanmadı — hipotez)

`cpu-liveness-probe` tek sinyal izler: CPU zamanı (utime+stime, TASK-117
M5-bugfix sonrası doğru alanlar). TASK-117 M1 (I/O grace) bunu yumuşatır
ama **çıktı anahtar-kelimesine bağımlıdır** (Downloading/Locking/Waiting
son 15sn'de geçerse tolerans). Çıktı üretMEYEN ağır disk fazı (büyük
kopya/untar, sessiz fetch, page-cache writeback) CPU flat + anahtar
kelime yok → **false-stall (exit 1) veya `--allow-kill` ile yanlış kill
(exit 2)** üretebilir.

## Önerilen 3 koşum (çalıştırılmadı)

| # | Soru | Yöntem taslağı |
|---|------|----------------|
| 1 | Sessiz disk fazı CPU-flat gösterir mi? | `dd`/büyük dosya kopya + eşzamanlı `/proc/<pid>/stat` (CPU) vs `/proc/<pid>/io` (rchar/wchar) örnekleme |
| 2 | Probe bu fazda ne hüküm verir? | Aynı iş `cpu-liveness-agent.js -- ...` altında: exit 1/2 mi (false-stall), 0 mı? |
| 3 | `io` sayaçları ayırt edici mi? | CPU delta=0 iken rchar/wchar artıyorsa → io-aware grace sinyali var; artmıyorsa (page-cache sessizliği) sinyal de kör |

## Karar şablonu (koşum sonrası)

- [ ] (a) Körlük doğrulandı → io-aware grace tasarım TASK'ı (örn.
  `/proc/<pid>/io` okuma + `ioDelta` stall-trend'e ikinci sinyal).
- [ ] (b) Körlük yok (disk fazı ya CPU üretir ya anahtar kelime
  düşürür) → kapat, M1 grace yeterli.
- [ ] (c) INCONCLUSIVE → speküle etmeden kaydet.

## Kapsam-dışı

- Kod değişikliği (probe/agent) — yok; bu task sadece körlük kanıtı.
- Bellek (RSS) sinyali — ayrı soru, bu task'a alınmaz (scope creep yok).
- `nohup` — yasak (TASK-115).

## Doğrulama

- [ ] Koşum 1 logu: CPU vs io sayaç karşılaştırması
- [ ] Koşum 2 logu: probe hükmü (exit kodu)
- [ ] Koşum 3 logu: sinyal ayırt ediciliği
- [ ] Karar (a/b/c) yazıldı
- [ ] `tasks/index.json` TASK-121 `done`

## Notlar / Kararlar

- (2026-09-07) Aday olarak açıldı, koşulmadı (sıralı iş listesinin 3.
  maddesi; "düşürmek" = kaydetmek). Başlatmak için statüyü in-progress
  yapıp `/tmp/opencode-live-test/task121-*` loglarıyla koş.
