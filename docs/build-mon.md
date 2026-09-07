# build-mon.sh — push/event build monitörü

`scripts/build-mon.sh`: opencode-bm'nin poll-only boşluğunu kapatan
derleme sarmalayıcı. Derlemeyi izler, sonucu sınıflandırır, bitince
FİŞEK atar — `bm_output` yoklaması gerekmez.

## Kullanım

```bash
# opencode-bm bm_start içinden:
scripts/build-mon.sh --name j1 --stall-after 120 --timeout 3600 -- \
  bash -c 'cd /root/RGSX/manager-rs && cargo build -j 1'

# Bayraklar: --name --event-dir --stall-after (120sn) --kill-on-stall
#   --kill-grace (60sn) --timeout (0=kapalı) --heartbeat (60sn)
#   --rotate-size (10MB, 0=kapalı) --rotate-days (30, 0=kapalı)
#   --rotate-keep (5)
```

## Olaylar

| Olay | Anlam | Çıkış |
|---|---|---|
| `PASSED` | Derleme geçti (exit 0) | 0 |
| `FAILED` | Kırıldı — test/derleme hatası (log alıntısıyla) | derlemenin kodu |
| `ERROR` | Sinyal ile ölüm (SIGSEGV vb.) | 128+sig |
| `STALLED` | Asılı şüphesi: çıktı **+** CPU sessizliği (`/proc` grup toplamı). Uyarı öldürmez; `--kill-on-stall` grace sonrası öldürür | (uyarı) / 111 |
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

- `scripts/cpu-liveness-probe/` — CPU-izleme altyapısı (build-mon stall
  kararını kendi `/proc` okumasıyla verir, bağımlılık yok).
- Server tarafı gerçek push için: `BM_ON_SETTLE` hook'u (`/root/opencode-bm`
  0.2.0+, `JobRegistry({ onSettle })`) — build-mon istemci katmanıdır,
  ikisi birlikte tam çözüm olur.
