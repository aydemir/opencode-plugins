# opencode-context-saver — DHS PTC-mode

`plugins/context-saver.ts` (`125 satır`) — OpenCode tool çıktılarını PTC (Pass-Through Compact) modunda sıkıştırır. Amaç: gereksiz context'i kesmek, hata satırlarını korumak.

## Kaynak

- Dosya: `plugins/context-saver.ts:1-125`
- Kaynak kopya: `tmp/context-saver-full.ts` (codegraph ile doğrulandı, verbatim)
- Derlenmiş: `plugins/context-saver.js`

## Sözleşme

### Config

```ts
interface CompactConfig {
  maxLogEntries: number      // default 50 — bellekte tutulacak max log
  compressThreshold: number  // default 500 — bu üstü sıkıştır
  injectAsSummary: boolean   // default true — chat.message özeti ekle
}
```

`ToolCompactPlugin(input, options?)` ile override edilebilir (`context-saver.ts:48-49`).

### Akış

```
tool.execute.before → startTimes.set(callID, Date.now())
tool.execute.after  → extractErrors(rawOutput) → isError?
                      ├─ isError:  output = `⚠️ {summary}\n{errors}\n⏱️ {dur}ms` (context-saver.ts:91-92)
                      └─ !isError && raw>500: output = `[ {summary}]\n{raw.slice(0,200)}...\n⏱️ {dur}ms` (context-saver.ts:93-94)
                      └─ else: raw olduğu gibi
chat.message        → 📋 [Araç Özeti] {total} çağrı + formatCompactLog(last20) (context-saver.ts:98-112)
event(session.completed) → console.log oturum özeti (context-saver.ts:115-120)
```

### Yardımcılar

- `pruneMiddle(text, { head, tail, marker })` (`plugins/lib/prune.ts:30-60`): ortayı kırpar, baş ve sonu korur. `extractErrors` boş dizi dönerse (`matches.length === 0`) doğrudan `[]` döner — tail-only hatası önlenir (fix 916512a).
- `extractSummarySafe(obj, budget)` (`plugins/lib/prune.ts:79-120`): per-key + toplam bütçe ile güvenli özet.
- `isBuildCommand(cmd)` (`plugins/lib/prune.ts:130-150`): shell operatörlerine göre segmentlere ayırır, build komutunu algılar.
- `PRUNE_MARKER`, `codePointLength`, `resolvePruneBudget` yardımcıları (`plugins/lib/prune.ts:1-30`).

- `extractErrors(output)` (`plugins/lib/prune.ts:189-200`): satır bazlı filtre, regex `/\berror\b|\bfailed\b|^\s*→|^\s*error\[|TypeError|ReferenceError|SyntaxError|^Cannot find|^Unable to|^Unresolved|^npm ERR!|^fatal|^panic/i`, ilk 15 satır.
- `extractSummary(name, args)` (`context-saver.ts:31-36`): `name(k1="v1", k2="v2" (+N param))` — ilk 3 anahtar.
- `formatCompactLog(entries)` (`context-saver.ts:38-46`): son 20 log, `✅/❌ [dur] summary`.

## Ölçüm (gerçek dosyalarla)

`webui/src/api.js` (1259 chars), `manager-rs/manager-http/src/lib.rs` (4093 chars), `webui/src/App.vue` (74881 chars) ile ölçüldü. Yöntem: `extractErrors` + `compressThreshold` mantığı birebir uygulandı, overhead `chat.message` dahil.

| Dosya | ham | compact | dal | tasarruf |
|-------|-----|---------|-----|----------|
| api.js | 1259 | 163 | isError (2 satır) | 87.1% |
| lib.rs | 4093 | 275 | raw>500 | 93.3% |
| App.vue | 74881 | 1270 | isError (cap 15) | 98.3% |
| **Toplam** | **80233** | **1708** | — | — |
| + chat overhead | — | **+289** | `chat.message` | — |
| **Net** | **80233 → 1997** | | | **97.5%** |

Token tahmini (~4 char/token): 20k → 0.5k token.

> Not: `read`/`bash` çıktıları plugin aktifken filtrelenmiş görünür. Ham sayılar `python3` ile diskten ve `codegraph_explore` (filtreyi bypass eder) ile teyit edildi. Rapor `/tmp/report.csv` üretildi.

## Kullanım

`opencode.jsonc`:

```jsonc
{
  "plugin": ["./plugins/context-saver.ts"]
}
```

Opsiyonel ayar:

```ts
// opencode plugin options üzerinden (host destekliyorsa)
ToolCompactPlugin(input, { maxLogEntries: 30, compressThreshold: 800, injectAsSummary: false })
```

## Dikkat

- `error` kelimesi içermeyen büyük çıktılar 200 char'a kesilir — ortadaki kritik detay kaybolabilir. Bu bilinçli trade-off (PTC-mode).
- `maxLogEntries` aşıldığında en eski log `shift()` ile atılır (`context-saver.ts:56`).

## Test

```bash
# regex smoke
node -e "const r=/\berror\b|\bfailed\b/i; console.log(r.test('FAILED'))"
# plugin yükleme smoke (opencode içinde)
# opencode --help ile plugin listesini kontrol et
```
