# opencode-cpu-liveness (`cl`)

CPU liveness probe script paketini LLM'e **deklare eder** (disclosure-only).
Önceki disclosure'larla aynı pattern (TASK-107/111): oturum başında
system prompt'a tek satırlık kaçış notu enjekte edilir, işin kendisi yapılmaz.

## Sorun

`cpu-liveness-probe` bir **operasyonel script paketi**, plugin değil
(TASK-116 kararı). AGENTS.md bu repoda okunur ama **farklı projede
kullananın LLM'i** agent yolunu bilmez. Paket `private:true` olduğu için
registry'de YOK — `npx cpu-liveness-agent` başka projede **404 verir**
(2026-09-06 rgsx vakası). npm publish `npm adduser` bekliyor (KD-npm-publish).

## Çözüm

`opencode-cpu-liveness` (`cl`) — `experimental.chat.system.transform`
hook'unda oturum başına bir kez push'lar (sentinel ile idempotent).
Komut `resolveAgentPath()` (`import.meta.url` → `../../scripts/...`)
ile çözülen **mutlak `node <path>`** yoludur — registry/`npx`/workspace'e
değmeden her projede çalışır (`npx` formu sadece fallback):

```
[cpu-liveness] Long builds: `node <abs-path>/cpu-liveness-agent.js -- <build cmd>` ...
```

Kısa tutulur (~110 token) ama tool-çağrısız çalışabilir: örnek + flag
yeri + shell-join notu içerir. Tam kullanım `scripts/cpu-liveness-probe/`'da:
`cpu-liveness-probe.js` (probe) + `tree-kill.js` + `cpu-liveness-agent.js`
(bin: `cpu-liveness-agent`).

## Davranış özeti (disclosure'ın işaret ettiği)

- `node <abs-path>/cpu-liveness-agent.js -- <build cmd>`
  (disclosure'daki tam yol kopyalanır; örn. tek çekirdek cargo:
  `node <path> -- taskset -c 0 cargo build --jobs 1`)
  — pid + canlı torunların CPU toplamını izler (includeTree default true).
- Flag'ler `--`'den ÖNCE: `node <path> --intervalMs=1000 --stallThreshold=10 --allow-kill --maxBudgetMs=600000 -- <cmd>`
  (default: interval 2000ms, stall eşiği 3 ardışık delta=0, budget kapalı).
- Komut join'lenip `/bin/bash -c` ile koşulur — boşluklu argümanları tırnakla.
- Exit: `0`=temiz, `1`=stall ama öldürülmedi, `2`=stall+kill (`--allow-kill`),
  `3`=komut hatalı, `4`=bütçe aşıldı (`--maxBudgetMs`, stall hükmüyle karışmaz).
- `onStall` asla otomatik öldürmez (I/O-bekleme false-positive riski).
- Taze I/O sinyali (son 15sn çıktıda Download/Fetch/Lock/Wait/Retry) + kalan
  hak (`--ioGraceRounds`, default 3, 0 kapatır) → sayaç sıfırlanır, öldürülmez.
  Bayat satır sayılmaz; tolerans sadece stall anında (delta==0) devreye girer.
- Dış timeout agent'a SIGTERM/SIGINT atarsa alt ağaç tree-kill ile temizlenir
  (exit 143/130, `--allow-kill`'den bağımsız) — yetim `cargo/rustc` kalmaz.
  Agent kendi process-group'unda çalışır (`detached:true`); terminalden manuel
  Ctrl-C gruba gitmez — manuel durdurma `kill -TERM <agent-pid>` ile.
- Her terminal sonda tek satır `[final-json]` (`reason/exit/signal/stallSamples/
  samples/graceUsed`) — retry kararı bu kanıtla çağıranda verilir.
- Linux `/proc` canlı-testli; macOS/Windows okuyucuları TEST EDİLMEDİ.

## Doktrin: tavan vs tripwire (KD-2026-09-06-timeout-doctrine)

- HÜKÜM (asıldı/asılmadı): sadece probe verir — CPU kanıtı. Duvar saati
  asla hüküm vermez.
- ÖLDÜRME yetkisi: sadece `--allow-kill` — çağıran "bu workload CPU-bound,
  tripwire'a güven" demiş olur. Beyan yoksa exit 1 + uyarı doğru duruştur.
- Dış timeout akılsız TAVAN-bütçedir: geniş tutulur (beklenenin katları),
  patlaması "bütçe bitti, gel bak" sinyalidir, "asıldı" hükmü değil.

## Kapatma

- Tek plugin: `pluginOptions["opencode-cpu-liveness"].enabled: false`
- Paket üzerinden: `pluginOptions["opencode-plugins"].enabled: false`
  dördünü birden kapatır (tek kill-switch, `plugins/server.ts`).
