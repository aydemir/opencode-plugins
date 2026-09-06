# opencode-cpu-liveness (`cl`)

CPU liveness probe script paketini LLM'e **deklare eder** (disclosure-only).
Önceki disclosure'larla aynı pattern (TASK-107/111): oturum başında
system prompt'a tek satırlık kaçış notu enjekte edilir, işin kendisi yapılmaz.

## Sorun

`cpu-liveness-probe` bir **operasyonel script paketi**, plugin değil
(TASK-116 kararı). AGENTS.md bu repoda okunur ama **farklı projede
kullananın LLM'i** `npx cpu-liveness-agent -- ...` yolunu bilmez —
paket `node_modules`'ta durur, kimse çağırmaz.

## Çözüm

`opencode-cpu-liveness` (`cl`) — `experimental.chat.system.transform`
hook'unda oturum başına bir kez push'lar (sentinel ile idempotent):

```
[cpu-liveness] Long builds: `npx cpu-liveness-agent -- <build cmd>` ...
```

Kısa tutulur (~110 token) ama tool-çağrısız çalışabilir: örnek + flag
yeri + shell-join notu içerir. Tam kullanım `scripts/cpu-liveness-probe/`'da:
`cpu-liveness-probe.js` (probe) + `tree-kill.js` + `cpu-liveness-agent.js`
(bin: `cpu-liveness-agent`).

## Davranış özeti (disclosure'ın işaret ettiği)

- `npx cpu-liveness-agent -- <build cmd>` (örn. `npx cpu-liveness-agent -- npm run build`)
  — pid + canlı torunların CPU toplamını izler (includeTree default true).
- Flag'ler `--`'den ÖNCE: `npx cpu-liveness-agent --intervalMs=1000 --stallThreshold=10 --allow-kill -- <cmd>`
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
