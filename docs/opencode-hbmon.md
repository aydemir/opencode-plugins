# opencode-hbmon (turn-içi ajan wakeup)

hbmon custom tool'ları: `hbmon_watch` / `hbmon_wait` / `hbmon_status`.
Ajan derlemeyi arka plana atar, bitince (veya erken sinyalle) tek
bloklayan çağrıyla uyanır. Polling yok, context'e log sızmaz.

settle-noticer ile fark: o next-contact bildirir (turn-arası wakeup
yoktur — dürüst sınır); bu plugin turn İÇİNDE bekler. İkisi birbirini
tamamlar, çakışmaz.

## Gereksinim

hbmon ikiliği: `HBMON_BIN` env (veya plugin `bin` opsiyonu), yoksa
`PATH`'teki `hbmon`. Bulunamazsa tool kurulum ipucuyla döner
(öldürmez): `cargo install --git https://github.com/aydemir/hbmon`.

> crates.io yayını bilinçli ertelendi: API stabil olana kadar tek kaynak
> git'tir (`docs/decisions.md` — 2026-09-10 kararı). `cargo install hbmon`
> henüz YOK; deneme, 404/yanlış paket verir.

## Akış (ajan için)

```
hbmon_watch {command: ["cargo","build","--release"]}
→ uuid=... sock=... log=...   (hemen döner)
... başka iş ...
hbmon_wait {sock, timeout: 50, until: "done,dep_missing,stall_suspect"}
→ "woke_on=dep_missing state=running — hbmon_status ile detaya bak"
→ "done code=0 in 38.5s"
→ "timeout (hâlâ çalışıyor) — tekrar hbmon_wait çağır"
```

`hbmon_wait` çıktısı: ilk satır tek-cümle özet, ardından ham JSON.
Özet kesilse bile sinyal kaybolmaz. Detay için `hbmon_status`.

## bg_* — arka plan görevleri + uyandırma (TASK-132)

pi/nabız `bg_run` modelinin opencode karşılığı. `bg_run` hemen döner,
LLM serbest kalır (başka iş yapar veya turn'ü bitirir); iş bitince bekçi
(`scripts/bg-wake.mjs`, detached) `opencode run -s <session>` ile AYNI
oturuma enjeksiyon dener (headless kanıt: `/tmp/opencode-wake-test`;
TUI eşzamanlılığı + persistence/scheduler wake ölçülmedi). CLI kabulü
yeni turn garantisi vermez.

```
bg_run {name: "derle", command: "cargo build --release"}
→ bg_run OK id=<uuid> name=derle   (hemen döner)
... başka iş / turn biter ...
[bg] derle → done (exit 0). bg_status/bg_logs ile detaya bak.   (enjeksiyon denemesi; yeni turn garantisi yok)
bg_logs {id: "derle"} → .out kuyruğu (max 50KB)
bg_kill {id: "derle"} → process group TERM
```

| Alan | Default | İşlev |
|------|---------|-------|
| `enabled` | `true` | Global toggle |
| `bin` | yok | HBMON_BIN yerine geçecek ikilik yolu |
| `defaultTimeoutSec` | `50` | wait daemon tavanı (gateway altı tut) |
| `wakeScript` | `scripts/bg-wake.mjs` | Uyandırma bekçisi (boş bırakılamaz değil, override edilir) |
| `verifyWake` | `true` | `false` = legacy tek-enjeksiyon (doğrulamasız bekçi) |
| `verifyTimeoutSec` | `120` | Adapter verify döngüsü toplam bütçesi (sn) |
| `maxInjections` | `3` | Adapter en fazla enjeksiyon denemesi |
| `backoffSec` | `15` | Adapter tekrar enjeksiyon öncesi min bekleme (sn) |

- Uyandırma başına bir LLM turn'ü maliyeti (~12K input token) — kapatmak
  için çağrıda `notify:false` (o zaman `bg_status` ile yokla).
- Kayıtlar `<tmpdir>/bg-<uuid>.json` sidecar (override: `HBMON_BG_DIR`);
  daemon restart'larından sağ çıkar.
- Bekçi logu `bg-<uuid>.wake.log` (enjeksiyon hatası kör nokta olmasın).
- Daemon/monitorsiz kalınırsa bekçi + `bg_status` `.jsonl` son olaydan
  terminal state okur (fallback; demo-bg vakası 2026-09-19: bekçi `wait`
  boş-dönüşte sonsuz retry'e girmişti).
- Açık TUI ile eşzamanlı yazışma test edilmedi (headless kanıtlı).

### Busy-safe adapter (`--task-id` ile)

`--task-id` verilmezse bekçi legacy tek-enjeksiyondur (yukarıdaki).
`--task-id <id>` ile bekçi: `[wake:<id>]` marker'lı enjeksiyon →
`injection_ts` kaydı → `opencode export <session>` poll →
marker persistence + `assistant.time.created > injection_ts` doğrulaması.
Persistence var + turn yoksa backoff ile tekrar enjekte eder
(busy-drop şüphesi: Runner meşgulken yeni work düşer). Her deneme
`--attempt-log` (default `<sockbase>.attempts.jsonl`) dosyasına
`injection-attempt` JSONL satırı olarak yazılır. Retry'lar aynı
marker'ı taşır; denemeler `injection_ts`, turn'ler `created` ile ayrışır.

| Bayrak | Default | Anlam |
|---|---|---|
| `--verify-timeout-sec` | `120` | Verify döngüsü toplam bütçesi |
| `--poll-sec` | `5` | Export poll aralığı |
| `--persist-gap-sec` | `20` | persistence=ok için iki sighting arası min fark |
| `--max-injections` | `3` | En fazla enjeksiyon denemesi |
| `--backoff-sec` | `15` | Tekrar enjeksiyon öncesi min bekleme |

Çıkış: `0` = `wake=confirmed`/`already-confirmed`, `1` = `wake=unknown` /
`injection=failed`, `2` = denemeden bütçe bitti. `wake` yalnızca
gözlemle raporlanır (CLI kabul ≠ wake).

| Durum | Beklenen |
|---|---|
| idle → injection → turn | `wake=confirmed` |
| busy → retry → turn | `wake=confirmed` |
| persistence ✓, turn yok | `wake=unknown` |
| injection başarısız | `injection=failed` |
| aynı taskId tekrar | yeni injection yok (`already-confirmed`) |
| marker yok | `wake=unknown` |

Not: `bg_run` bekçiyi `verifyWake` açıkken (default) adapter modunda
çağırır (`--task-id <uuid>` + `--attempt-log` + verify bütçeleri);
`verifyWake:false` legacy tek-enjeksiyondur. Scheduler değişikliği
ertelendi — adapter önce `persistence ✓ / turn ✗` verisini gerçek
testte üretmeli.

## Dürüst sınırlar

- Bloklayan çağrı gateway tavanına (~60sn) takılırsa sonuç değil
  kesinti döner: timeout'u küçük tut (≤50sn), bitmediyse tekrar çağır.
- Turn-arası gerçek push vaat edilmez (harness desteği ister).
  `bg` uyandırması push değil harici `opencode run -s` enjeksiyonudur.
- `until` yoksa yalnızca terminal state'ler döndürür (hbmon davranışı).

## Testler

- `tests/hbmon-tools.test.mjs` (12 test: handshake, erken-dönüş,
  terminal, timeout, retry, argv bütünlüğü, plugin şekli; CANLI test
  `HBMON_LIVE=1` kapılı).
- `tests/bg-tasks.test.mjs` (8 test: sidecar döngüsü, resolve, .out cap,
  wakeMessage, name validasyonu, wake --dry-run; CANLI e2e
  `HBMON_LIVE=1` kapılı: bg_run→status→logs→kill).
