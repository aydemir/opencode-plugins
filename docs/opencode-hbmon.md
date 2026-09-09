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

## Yapılandırma (`pluginOptions["opencode-hbmon"]`)

| Alan | Default | İşlev |
|------|---------|-------|
| `enabled` | `true` | Global toggle |
| `bin` | yok | HBMON_BIN yerine geçecek ikilik yolu |
| `defaultTimeoutSec` | `50` | wait daemon tavanı (gateway altı tut) |

## Dürüst sınırlar

- Bloklayan çağrı gateway tavanına (~60sn) takılırsa sonuç değil
  kesinti döner: timeout'u küçük tut (≤50sn), bitmediyse tekrar çağır.
- Turn-arası gerçek push vaat edilmez (harness desteği ister).
- `until` yoksa yalnızca terminal state'ler döndürür (hbmon davranışı).

## Testler

- `tests/hbmon-tools.test.mjs` (12 test: handshake, erken-dönüş,
  terminal, timeout, retry, argv bütünlüğü, plugin şekli; CANLI test
  `HBMON_LIVE=1` kapılı).
