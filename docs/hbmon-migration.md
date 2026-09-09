# build-mon.sh → hbmon migrasyonu (TASK-004)

`scripts/hbmon-build-mon.sh`, `build-mon.sh`'in **sözleşmesini** koruyup
motoru hbmon ile değiştirir. `opencode-settle-noticer` değişmeden çalışır:
final = `exit` alanlı `<ad>.status.json` kuralı aynıdır.

## Neden

`build-mon.sh` çalışır ama OpenCode'a ve bash'e kilitlidir (polling,
sabit stall eşiği, `/proc` varsayımı). hbmon aynı işi tek binary ile,
harness-bağımsız yapar: double-fork daemon, UDS `wait --until`, adaptif
stall, OOM şüphesi, dep-missing.

## Kullanım

```bash
# build-mon.sh çağrısındaki komutu aynen taşı:
scripts/hbmon-build-mon.sh --name j1 --timeout 3600 -- cargo build -j1

# Gereksinim (bir kez):
cargo install --git https://github.com/aydemir/hbmon
# veya HBMON_BIN=/yol/hbmon
```

## Olay haritası

| build-mon.sh | hbmon-build-mon.sh | Kaynak |
|---|---|---|
| STARTED | STARTED | spawn (uuid) |
| HEARTBEAT | — (yok; hbmon `metric` JSONL'da) | — |
| STALLED uyarı | STALLED (bir kez) | `woke_on=stall_suspect` (adaptif eşik) |
| STALLED kill (111) | STALLED kill (111) | `--kill-on-stall` |
| TIMED_OUT (124) | TIMED_OUT (124) | `--timeout` |
| PASSED (0) | PASSED (0) | `done` |
| FAILED (kod) | FAILED (kod + excerpt) | hbmon `.out` + build-mon FAIL_SIG seti |
| ERROR (sinyal) | ERROR (sinyal/`raw_code`) | `exit_event.raw_code` |
| ERROR | ERROR (137) | OOM terminal |
| INTERRUPTED (143) | INTERRUPTED (143) | trap → `hbmon shutdown` |
| — (yoktu) | DEP_MISSING (bir kez) / OOM_SUSPECT (bir kez) | erken uyarılar |

## Eski yol

`scripts/build-mon.sh` **silinmedi** — LEGACY olarak duruyor, yeni
kurulumlar `hbmon-build-mon.sh` kullanmalı. Banner/event dosya formatı
aynı olduğundan geri dönüş tek satır: script adını değiştir.
