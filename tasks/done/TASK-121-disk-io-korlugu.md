---
id: TASK-121
title: "Disk-I/O körlüğü: CPU-zaman tek sinyal sessiz disk fazında false-stall üretir mi (3 koşum, kod yok)"
status: done
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

## Koşum sonuçları (2026-09-10, f2fs flash, loglar `/tmp/opencode-live-test/task121/`)

### Koşum 1 — CPU vs io sayaçları (pid başına sampling, 1sn)
- O_DIRECT 8GB cold read (~850MB/s): **~40 tick/sn sys CPU**, rchar ~870MB/sn ile büyüyor.
- Buffered 8GB write: **~75 tick/sn sys CPU**, write_bytes write() anında büyüyor.
- `sync`/fsync fazı bu flash'ta saniyelik (kernel yetişiyor) — çok-sn flat faz üretilemedi.
- Bulgular: bulk disk I/O orantılı sys CPU yakıyor (page-cache/f2fs/completion bedeli) — delta=0 olmuyor.

### Koşum 2 — probe hükmü (`--intervalMs=1000 --stallThreshold=3`)
- 2a `sleep 12` (düz faz): `stall-observed`, exit 1, stallSamples 3 → dedektör doğru ateşliyor.
- 2b sessiz 8GB direct read (~11sn, sıfır çıktı): `completed`, exit 0, deltalar 39-46 → **false-stall YOK**.
- (Ara not: iç-içe tırnakla ilk 2b denemesi dd'yi çalıştırmadı — `0+0 records`, geçersiz sayıldı; script dosyasıyla tekrarlandı.)

### Koşum 3 — ayırt edicilik analizi
- `/proc/<pid>/io` sayaçları CPU yakan AYNI syscall'da artar (write()=wchar+CPU, read()=rchar+CPU).
  Ağaç CPU'su düzken kendi sayaçları da donuktur → pid-ağacı io sayacı **bağımsız sinyal vermez**.
- Cihaz-seviyesi aktivite (`diskstats`) izlenen ağaca atfedilemez.
- Rezidüel riskler (kapsam-dışı, cihaz/bağlam-bağımlı): çok yavaş depolamada
  big-bs O_DIRECT'te örnek-aralığı-altı CPU (<5ms → delta 0.00 görünebilir),
  sessiz network bekleyişi, exit-sonrası writeback (atfedilecek pid yok).

## Karar: (b) Körlük yok

Bulk disk fazları inşaası gereği CPU-görünür; io-sayaç ikinci sinyali
mimari olarak bağımsız bilgi taşımaz. Kod değişikliği YOK. Sessiz fazlar
için M1 anahtar-kelime grace'i doğru ikinci katman olarak kalır.
