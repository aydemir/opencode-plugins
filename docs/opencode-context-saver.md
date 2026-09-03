# opencode-context-saver — DHS PTC-mode

`plugins/opencode-context-saver.ts` (`125 satır`) — OpenCode tool çıktılarını PTC (Pass-Through Compact) modunda sıkıştırır. Amaç: gereksiz context'i kesmek, hata satırlarını korumak.

## Kaynak

- Dosya: `plugins/opencode-context-saver.ts:1-125`
- Kaynak kopya: `tmp/opencode-context-saver-full.ts` (codegraph ile doğrulandı, verbatim)
- Derlenmiş: `plugins/opencode-context-saver.js`

## Sözleşme

### Config

```ts
interface CompactConfig {
  maxLogEntries: number      // default 50 — bellekte tutulacak max log
  compressThreshold: number  // default 500 — bu üstü sıkıştır
  injectAsSummary: boolean   // default true — chat.message özeti ekle
}
```

`ToolCompactPlugin(input, options?)` ile override edilebilir (`opencode-context-saver.ts:48-49`).

### Akış

```
tool.execute.before → startTimes.set(callID, Date.now())
tool.execute.after  → extractErrors(rawOutput) → isError?
                      ├─ isError:  output = `⚠️ {summary}\n{errors}\n⏱️ {dur}ms` (opencode-context-saver.ts:91-92)
                      └─ !isError && raw>500: output = `[ {summary}]\n{raw.slice(0,200)}...\n⏱️ {dur}ms` (opencode-context-saver.ts:93-94)
                      └─ else: raw olduğu gibi
chat.message        → 📋 [Araç Özeti] {total} çağrı + formatCompactLog(last20) (opencode-context-saver.ts:98-112)
event(session.completed) → console.log oturum özeti (opencode-context-saver.ts:115-120)
```

### Yardımcılar

- `pruneMiddle(text, { head, tail, marker })` (`plugins/lib/prune.ts:30-60`): ortayı kırpar, baş ve sonu korur. `extractErrors` boş dizi dönerse (`matches.length === 0`) doğrudan `[]` döner — tail-only hatası önlenir (fix 916512a).
- `extractSummarySafe(obj, budget)` (`plugins/lib/prune.ts:79-120`): per-key + toplam bütçe ile güvenli özet.
- `isBuildCommand(cmd)` (`plugins/lib/prune.ts:130-150`): shell operatörlerine göre segmentlere ayırır, build komutunu algılar.
- `PRUNE_MARKER`, `codePointLength`, `resolvePruneBudget` yardımcıları (`plugins/lib/prune.ts:1-30`).

- `extractErrors(output)` (`plugins/lib/prune.ts:189-200`): satır bazlı filtre, regex `/\berror\b|\bfailed\b|^\s*→|^\s*error\[|TypeError|ReferenceError|SyntaxError|^Cannot find|^Unable to|^Unresolved|^npm ERR!|^fatal|^panic/i`, ilk 15 satır.
- `extractSummary(name, args)` (`opencode-context-saver.ts:31-36`): `name(k1="v1", k2="v2" (+N param))` — ilk 3 anahtar.
- `formatCompactLog(entries)` (`opencode-context-saver.ts:38-46`): son 20 log, `✅/❌ [dur] summary`.

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

## Escape Mekanizması (`no_prune`)

İçeriğin **kırpılmadan** döndürülmesini istediğiniz durumlarda üç giriş
noktası var. Hepsi OpenCode oturumunu kapatmadan, plugin'i sökmenden
çalışır.

### 1. Plugin seviyesi global toggle

`opencode.jsonc` içinde:

```jsonc
"pluginOptions": {
  "opencode-context-saver": {
    "enabled": false
  }
}
```

`enabled: false` → tüm prune atlanır, tool çıktıları ham döner.
Default `true`. Tüm `CompactConfig` alanları için örnek:

| Alan | Default | Açıklama |
|------|---------|----------|
| `enabled` | `true` | Tüm pruneları kapat/aç |
| `skipWhenContains` | `"#no-prune"` | Per-call bypass substring (args/text) |
| `skipTools` | `["read", "read_file", "Read", "grep", "Grep", "glob", "Glob", "list_dir", "ListDir", "search", "Search"]` | Kod okuma tool’larında prune uygulanmaz — LLM full output görür (case-sensitive) |
| `headChars` | `100` | Baştan korunacak char |
| `tailChars` | `50` | Sondan korunacak char |
| `compressThreshold` | `500` | Eşiği aşmayan çıktıya dokunulmaz |
| `injectAsSummary` | `true` | `chat.message`'a özet enjekte et |
| `maxLogEntries` | `50` | Tutulan log entry üst sınırı |

### 2. Inline escape marker (`#no-prune`)

Tool çağrısının **gövdesine** `#no-prune` yaz → o çağrıya dokunulmaz:

```ts
// Örnek: shell komutunun başında sentinel
shell("#no-prune\nnpm test 2>&1 | tail -200")

// Örnek: read_file argümanında
read_file(path: "logs/big.log", mode: "#no-prune read full file")
```

Mekanizma: `pruneMiddle()` `text.includes("#no-prune")` görürse erken
return ile `text` aynen döner. Bu kontrol `prune.ts:90-95` civarında,
her budama öncesi tetiklenir.

### Per-Call Toggle (TASK-104)

Araç çağrısında tek seferlik bypass:

```json
// bash tool örneği — prune atlanır, ham output döner
{ "command": "cat large.log", "no_prune": true }
{ "command": "echo hi #no-prune" }
{ "command": "ls -R", "noPrune": true }
```

Desteklenen arg anahtarları: `no_prune` (bool/string "true"), `noPrune`, `skipPrune`, `"no-prune"` veya herhangi bir string arg içinde `skipWhenContains` (default `"#no-prune"`).

Global `enabled: false` ise tüm çağrılar bypass; per-call ise sadece o çağrı.

### 3. Tool şemasına `no_prune` parametresi (deneysel)

OpenCode plugin API tool şemasını override etmeye izin veriyorsa
LLM kendi isteğiyle `no_prune: true` gönderebilir. **Şu an uygulanmadı**
— OpenCode SDK araştırılması gerekiyor. Marker'daki `Use no_prune=true
for raw output ...` ipucu şimdilik LLM'e yöntem (1) ve (2)'yi hatırlatır.

## Marker formatı (LLM disclosure)

Kırpma gerçekleştiğinde marker dinamik olarak üretilir ve LLM'in
bilgilendirilmesi amaçlanır:

```
[... pruned: 50000→300 chars (99.4% saved). Use no_prune=true for raw output ...]
```

İçeriği:

- **original/kept** code-point sayısı (emoji yarılmaz, Unicode-safe).
- **% saved** — bir ondalık basamak.
- **escape hint** — ham çıktı için `no_prune=true` (TASK-102'de
  implemente edilecek inline `#no-prune` marker ile birlikte).

Bu sayede LLM:

1. Çıktının kırpıldığını ve **ne kadar** kırpıldığını bilir.
2. Tekrar `cat`/`read` çağırıp context'i şişirmeye gerek kalmaz; gerekiyorsa
   `no_prune=true` ile hedefli şekilde ham çıktı ister.
3. Marker'ı "hata" sanıp yanlış yorumlamaz.

Küçük çıktılarda (head+tail altı) marker **eklenmez**; orijinal text
aynen döner. `PRUNE_MARKER` sabiti geriye uyumluluk için korunur;
yeni kod `formatPruneMarker(stats)` kullansın (`plugins/lib/prune.ts`).

> Not: `read`/`bash` çıktıları plugin aktifken filtrelenmiş görünür. Ham sayılar `python3` ile diskten ve `codegraph_explore` (filtreyi bypass eder) ile teyit edildi. Rapor `/tmp/report.csv` üretildi.

## Kullanım

`opencode.jsonc`:

```jsonc
{
  "plugin": ["./plugins/opencode-context-saver.ts"]
}
```

Opsiyonel ayar:

```ts
// opencode plugin options üzerinden (host destekliyorsa)
ToolCompactPlugin(input, { maxLogEntries: 30, compressThreshold: 800, injectAsSummary: false })
```

## Dikkat

- `error` kelimesi içermeyen büyük çıktılar 200 char'a kesilir — ortadaki kritik detay kaybolabilir. Bu bilinçli trade-off (PTC-mode).
- `maxLogEntries` aşıldığında en eski log `shift()` ile atılır (`opencode-context-saver.ts:56`).

## Test

```bash
# regex smoke
node -e "const r=/\berror\b|\bfailed\b/i; console.log(r.test('FAILED'))"
# plugin yükleme smoke (opencode içinde)
# opencode --help ile plugin listesini kontrol et
```

Örnek `opencode.jsonc`:
```jsonc
{
  "plugin": ["opencode-context-saver"],
  "config": {
    "skipTools": ["read", "read_file", "grep", "glob", "list_dir"]
  }
}
```