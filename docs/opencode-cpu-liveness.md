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
- Flag'ler `--`'den ÖNCE: `node <path> --intervalMs=1000 --stallThreshold=10 --allow-kill -- <cmd>`
  (default: interval 2000ms, stall eşiği 3 ardışık delta=0).
- Komut join'lenip `/bin/bash -c` ile koşulur — boşluklu argümanları tırnakla.
- Exit: `0`=temiz, `1`=stall ama öldürülmedi, `2`=stall+kill (`--allow-kill`),
  `3`=komut hatalı.
- `onStall` asla otomatik öldürmez (I/O-bekleme false-positive riski).
- Linux `/proc` canlı-testli; macOS/Windows okuyucuları TEST EDİLMEDİ.

## Kapatma

- Tek plugin: `pluginOptions["opencode-cpu-liveness"].enabled: false`
- Paket üzerinden: `pluginOptions["opencode-plugins"].enabled: false`
  dördünü birden kapatır (tek kill-switch, `plugins/server.ts`).
