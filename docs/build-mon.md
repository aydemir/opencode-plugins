# build-mon.mjs — push/event build monitörü

`scripts/build-mon.mjs`: opencode-bm'nin poll-only boşluğunu kapatan
derleme sarmalayıcı. Derlemeyi izler, sonucu sınıflandırır, bitince
FİŞEK atar — `bm_output` yoklaması gerekmez. `scripts/archive/build-mon.sh`'in
birebir Node portudur (TASK-127: aynı argümanlar, olaylar, banner,
exit haritası); eski `.sh` `scripts/archive/`'de durur.

## Kullanım

```bash
# opencode-bm bm_start içinden:
node scripts/build-mon.mjs --name j1 --stall-after 120 --timeout 3600 -- \
  node -e 'process.chdir("/root/RGSX/manager-rs"); ...'
# (unix'te doğrudan da çalışır: ./scripts/build-mon.mjs -- ...;
#  derleme komutu argv dizisiyle taşınır — shell/tırnak katmanı yok)

# Bayraklar: --name --event-dir --stall-after (120sn) --kill-on-stall
#   --kill-grace (60sn) --timeout (0=kapalı) --heartbeat (60sn)
#   --rotate-size (10MB, 0=kapalı) --rotate-days (30, 0=kapalı)
#   --rotate-keep (5)
```

## Olaylar

| Olay | Anlam | Çıkış |
|---|---|---|
| `PASSED` | Derleme geçti (exit 0) | 0 |
| `FAILED` | Kırıldı — test/derleme hatası (ecosystem pattern seti + log alıntısı; eşleşme yoksa son 5 satır fallback) | derlemenin kodu |
| `ERROR` | Sinyal ile ölüm (SIGSEGV vb.) | 128+sig |
| `STALLED` | Asılı şüphesi: çıktı **+** CPU sessizliği (`readTreeCpuTime`: pid + canlı torunlar). Uyarı öldürmez; `--kill-on-stall` grace sonrası öldürür | (uyarı) / 111 |
| `TIMED_OUT` | Global tavan aşıldı, ağaç öldürüldü | 124 |
| `HEARTBEAT` | Periyodik canlılık (sadece JSONL) | — |
| `INTERRUPTED` | Monitör kesildi | 143 |

## Fişek (push) kanalları

1. `events.jsonl` — tüm olaylar (JSON, audit trail)
2. `<ad>.status.json` — son olay; `<ad>.result` — tek satır insan özeti
3. stdout banner (`<<< BUILD-MON ...`) — `bm_output` akışında görünür
4. Terminal bell + `notify-send` (varsa, best-effort)

Olay dizini: `--event-dir`, yoksa `$BUILD_MON_DIR`, o da yoksa
çalışılan dizindeki `./tmp/build-mon`. Dizin ilk çalışta kendi
`.gitignore`'unu oluşturur (olaylar repoya düşmez).

## Rotasyon (TASK-122)

İki dosya, iki kural:

- **`<ad>.log`** (derleme çıktısı): finalde `PASSED` → silinir;
  fail (`FAILED`/`ERROR`/`TIMED_OUT`/`STALLED`/`INTERRUPTED`) →
  `<ad>.log.<olay>-<UTCts>` diye arşivlenir (sonraki koşumun
  sıfırlaması delili ezmez).
- **`events.jsonl`** (audit trail): `PASSED`'da silinmez. Startup'ta
  boyut > `--rotate-size` veya dosya yaşı > `--rotate-days` ise
  `events-<UTCts>.jsonl` diye arşivlenir; en yeni `--rotate-keep`
  arşiv tutulur, eskiler silinir. Geçmiş (süre baseline'ı) korunur,
  disk şişmez.

## İlişkiler

- `scripts/cpu-liveness-probe/` — CPU-izleme altyapısı: build-mon stall
  kararını `readTreeCpuTime`, ağaç-öldürmeyi `treeKill` ile verir
  (tek implementasyon, çift kullanım — TASK-127).
- Server tarafı gerçek push için: `BM_ON_SETTLE` hook'u (`/root/opencode-bm`
  0.2.0+, `JobRegistry({ onSettle })`) — build-mon istemci katmanıdır,
  ikisi birlikte tam çözüm olur.

## Platform

Stall tespitinin CPU ayağı Linux'ta tamdır (`/proc` + torun toplamı).
macOS/Windows'ta CPU kısmı best-effort/untested (win32: powershell
`TotalProcessorTime` reader; her ölçüm yeni powershell süreci açar) —
stall kararı pratikte çıktı sessizliğine düşer. Uzun link/download'u
donma sanmama garantisi Linux'ta tamdır.

Node portu bash/python3 gerektirmez (tek runtime: node ≥18); win32'de
`true`/`sleep` ikilikleri ve `/usr/bin:/bin` PATH varsayımı yoktur.

## Testler

`tests/build-mon.test.mjs` — push/event kanallarının regresyon testleri
(banner + events.jsonl + status/result + log silme/arşiv + rotasyon +
`--kill-on-stall` exit 111 + INTERRUPTED exit 143). Kill-path'ler
deterministik marjlarla kapsanır (uzun uyuyan proses `node -e
"setTimeout(..., 30000)"`, monitöre TERM enjeksiyonu); STALLED-uyarı
testinde 6sn uyku ile ~4s tespit marjı bırakılır (POLL=2).
