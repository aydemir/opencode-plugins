# opencode-plugins — Project Map

> Statik navigasyon haritası. Repo yapısı değiştiğinde bu dosya
> güncellenir (`AGENTS.md` kural 5). `codegraph_explore` yoksa veya
> çelişki varsa burası tek doğrudur.

## Kök

| Dosya | Amaç |
|-------|------|
| `index.json` | Proje düzeyinde özet (plugin listesi, version, key_decisions) |
| `package.json` | ESM, TypeScript, Node 22+ |
| `tsconfig.json` | ES2022, strict, ESNext modülü, `outDir: dist` |
| `README.md` | Kullanıcı giriş noktası (TR) |
| `AGENTS.md` | Davranış kuralları + navigasyon rehberi |
| `test-plugins.mjs` | Manuel test harness (TASK-103, TASK-104 sonrası `tests/`'e taşınacak) |
| `one.md` | Eski not/taslak (pasif; ya içerik README'ye entegre edilmeli ya `.gitignore`) |
| `LICENSE` | MIT |

## Plugins — `plugins/`

Pluginler TypeScript ESM, `Plugin` tipi `@opencode-ai/plugin`'dan. MCP server `plugins/mcp-bash-tools/` ayrıca bkz — schema-kontrollü bypass için (TASK-109).

### `plugins/opencode-context-saver.ts` (195 satır)

**Amaç:** Tool çıktılarını sıkıştır, context tasarrufu yap (DHS PTC-mode).

Public API:
- `ToolCompactPlugin: Plugin` — ana export
- `default` — `ToolCompactPlugin` (alias)

Event hook'ları:
- `tool.execute.before` — start time kaydeder
- `tool.execute.after` — output'u prune eder / log entry ekler
- `chat.message` — log özetini inject eder
- `event` — session telemetry (cleanup)

Config (`CompactConfig`):
| Alan | Default | İşlev |
|------|---------|-------|
| `enabled` | `true` | Global toggle (TASK-102) |
| `headChars` | `100` | Prune head |
| `tailChars` | `50` | Prune tail |
| `compressThreshold` | `500` | Eşik altı dokunulmaz |
| `injectAsSummary` | `true` | `chat.message`'a özet enjekte et |
| `maxLogEntries` | `50` | Log ring buffer üst sınırı |
| `maxCharsPerKey` | `40` | `extractSummarySafe` per-key bütçe |
| `maxSummaryChars` | `200` | `extractSummarySafe` toplam bütçe |
| `errorMaxLines` | `15` | Hata log'u baştan |
| `errorTailLines` | `5` | Hata log'u sondan |

### `plugins/opencode-build-tracker.ts` (198 satır)

**Amaç:** Build yaşam döngüsü kancaları (başla/bitir/hata + log).

Public API:
- `BuildHooksPlugin: Plugin` — ana export
- `default` — `BuildHooksPlugin` (alias)

(Detaylar `docs/opencode-build-tracker.md` ve kaynak dosyada.)

### `plugins/opencode-truncation-noticer.ts` (TASK-111)

**Amaç:** OpenCode native `read` tool'unun sessiz kırpmasını gözlemler
ve "devamı var" marker'ı ekler. Küçük context'li modeller için
yarım içerik üzerinden karar vermeyi engeller.

Public API:
- `default` — `TruncationNoticePlugin`
- `MARKER_SENTINEL`, `DISCLOSURE_SENTINEL`, `DISCLOSURE_TEXT` — sabitler

Event hook'ları:
- `experimental.chat.system.transform` — disclosure (idempotent, `[tn-disclosed]` sentinel)
- `tool.execute.after` — output parse + marker ekleme (sadece `read` tool)

Config (`TruncationNoticeConfig`):
| Alan | Default | İşlev |
|------|---------|-------|
| `enabled` | `true` | Global toggle |
| `watchTools` | `["read"]` | Hangi tool'lara uygulanacak |
| `lineSeparator` | `"\t"` | Output satır prefix ayracı |
| `skipWhenContains` | `"#no-trunc-notice"` | Per-call bypass substring |

Tamamlayıcı mimari:
- `opencode-context-saver` → prune (kırpma)
- `opencode-mcp-bash-tools` → bash_safe (marker'lı) + bash_raw (ham)
- **`opencode-truncation-noticer` → native read'e "devamı var" marker'ı**

## Paylaşılan Kütüphane — `plugins/lib/`

### `plugins/lib/prune.ts` (302 satır)

Tool-output budama + özet helper'ları. Tüm context-saver iş mantığı
burada. **Public API (export edilenler):**

| Sembol | Tür | İşlev |
|--------|-----|-------|
| `PRUNE_MARKER` | `string` (sabit) | Eski marker (geriye uyumluluk) |
| `codePointLength` | `(text: string) => number` | Unicode code-point sayısı |
| `pruneMiddle` | `(text, options?) => string` | head+marker+tail budama |
| `extractSummarySafe` | `(value, options?) => string` | Per-key obj özetleme |
| `resolvePruneBudget` | `(options) => void` | Bütçe invariant kontrolü |
| `isBuildCommand` | `(command: string) => boolean` | Shell komut heuristic |
| `extractErrors` | `(text, opts?) => string` | Hata satırı önceliklendirme |
| `formatPruneMarker` | `(stats: PruneMarkerStats) => string` | Bilgilendirici marker üretir (TASK-101) |
| `shouldSkipForArgs` | `(args: unknown, skipWhenContains?: string) => boolean` | Per-call bypass kontrolü (TASK-104) |
| `PruneMarkerStats` | interface | Marker stats tipi |
| `PruneMiddleOptions` | interface | `enabled`, `skipWhenContains`, `markerBuilder`… |

**Karar:** LLM özeti **yok** (bilinçli). Dosya başında gerekçe yazılı.

### `plugins/lib/truncation-notice.ts` (TASK-111)

Truncation Noticer için sabitler ve pure helper'lar. Plugin dosyası
sadece `default` export eder (Plugin instance); tüm sabitler ve
yardımcılar burada toplanır.

| Sembol | Tür | İşlev |
|--------|-----|-------|
| `MARKER_SENTINEL` | `string` (sabit) | `"[tn] truncated:"` — marker başlangıç imzası |
| `DISCLOSURE_SENTINEL` | `string` (sabit) | `"[tn-disclosed]"` — idempotent system notu |
| `DISCLOSURE_TEXT` | `string` (sabit) | Oturum başı LLM bilgilendirme metni |
| `DEFAULT_SKIP_CONTAINS` | `string` (sabit) | `"#no-trunc-notice"` — per-call bypass substring |
| `countLines` | `(text: string) => number` | wc -l semantiği (trailing newline sayılmaz) |
| `parseLastLineNo` | `(output: string, sep?: string) => number` | `<n>\t<line>` formatından son satır no |
| `buildMarker` | `(last, total, path, nextOffset) => string` | Marker üretir (offset/sed hint dahil) |
| `resolveFilePath` | `(raw: unknown) => string \| null` | cwd-relative path resolution |

**Neden lib'de?** opencode 1.18.29 `getLegacyPlugins`
(packages/opencode/src/plugin/index.ts:107) tüm modül export'larını
`Object.values(mod)` ile iterate edip her birinin function olmasını
bekliyor. String/object export'lar "Plugin export is not a function"
hatası veriyor. Sabitleri lib'e taşıyarak plugin dosyasını yalnızca
`default` export ile sınırlı tutuyoruz. Bu pattern opencode'daki
diğer plugin'ler için de gerekli (context-saver, build-tracker aynı
regression'a sahip — ayrı takip görevi).

## MCP Servers — `plugins/mcp-bash-tools/`

(planlanıyor — TASK-109, TASK-110)

Yeni MCP server: opencode `bash` tool'unun schema kontrollü
alternatifleri. Plugin-only yaklaşımda `no_prune=true`,
`disableForCalls=N` gibi per-call argümanlar opencode'un native
tool şemasında tanımlı değildi → ölü kaçış yolları. MCP ile
kendi tool'larımızı schema'sı ile birlikte sunuyoruz.

### `plugins/mcp-bash-tools/src/server.ts` (planlanıyor)

stdio MCP server, transport: stdio (opencode MCP standardı).

Tools:
- `bash_safe` — middle-prune + marker (default).
  Schema: `command`, `description`, `max_chars?` (default 30000),
  `head_chars?` (200), `tail_chars?` (200), `timeout_ms?` (30000).
- `bash_raw` — kırpmaz, full output.
  Schema: `command`, `description`, `max_chars?` (500000, sadece
  dosya koruma), `timeout_ms?` (30000).

Prune mantığı: `plugins/lib/prune.ts` içindeki `pruneMiddle` +
`formatPruneMarker` import edilerek yeniden kullanılır (TASK-101
formatı, uyumlu).

Marker'da escape hint: `For raw output, call bash_raw with the same
command.` — schema kontrollü, çalışan bypass.

**Plugin etkileşimi (TASK-110):** Plugin `tool.execute.after` hook'unda
MCP tool adlarını (`opencode-mcp-bash-tools_bash_safe`,
`opencode-mcp-bash-tools_bash_raw`) atlar — MCP zaten kendi
kararını veriyor, ikinci kırpma katmanı olmaz.

**opencode.jsonc kaydı (kullanıcı onayıyla):**

```jsonc
{
  "mcp": {
    "opencode-mcp-bash-tools": {
      "type": "local",
      "command": ["node", "dist/plugins/mcp-bash-tools/server.js"],
      "enabled": true
    }
  }
}
```

**Karar:** Hibrit (plugin + MCP) — plugin native tool'ları otomatik
kırpar (geriye uyumlu, kullanıcı sıfır aksiyon alır), MCP server
LLM'e schema-kontrollü bypass yolu sunar. İki katman bağımsız
çalışır, birlikte çalıştıklarında plugin MCP tool'larına dokunmaz.

## Docs — `docs/`

| Dosya | Amaç |
|-------|------|
| `opencode-context-saver.md` | Plugin detayları, marker formatı, escape mekanizması, benchmark tablosu (97.5%) |
| `opencode-build-tracker.md` | Build plugin dokümantasyonu |
| `plugin-test.md` | Manuel test rehberi |
| `tool-calls.json` | Test sırasında üretilen örnek tool call dump |
| `PROJECT_MAP.md` | **Bu dosya** |

## Tasks — `tasks/`

| Klasör | İçerik |
|--------|--------|
| `index.json` | Makine-okunur görev board'u (id, status, priority, depends_on, file) |
| `KANBAN.md` | İnsan-okunur board snapshot, karar kaydı (LLM özeti neden yok) |
| `_template.md` | Yeni task şablonu (frontmatter + bölümler) |
| `todo/` | Yapılacaklar (TASK-103) |
| `in-progress/` | Üzerinde çalışılan |
| `done/` | Tamamlanmış (TASK-101, TASK-102) |
| `gap/` | Plan dışı bulunan, sonra değerlendirilecek |

Şema (RGSX uyumlu):
```json
{
  "id": "TASK-XXX",
  "title": "...",
  "status": "todo|in-progress|done|gap",
  "priority": "P1|P2|P3",
  "environment": "linux|mac|windows|both",
  "labels": ["..."],
  "depends_on": ["TASK-XXX"],
  "created": "YYYY-MM-DD",
  "updated": "YYYY-MM-DD",
  "file": "tasks/<status>/TASK-XXX-...md"
}
```

## Examples — `examples/`

| Dosya | Amaç |
|-------|------|
| `opencode.jsonc` | OpenCode config örneği; `pluginOptions` ile context-saver toggle/ayar |

## Build Artifact — `dist/`

`npx tsc` çıktısı. Repoda kalır (alternatif: `.gitignore` + release
artifact). Build:
```bash
npx tsc          # → dist/
npx tsc --noEmit # sadece typecheck
```

## Node Modules — `node_modules/`

Pinned bağımlılıklar:
- `@opencode-ai/plugin` — `Plugin` tipi
- `@opencode-ai/sdk` — SDK client (`client` plugin arg)
- `typescript` — derleyici

TASK-103 sonrası `node:test` (built-in) eklenecek; vitest eklenmez
(bağımlılık şişmesini istemiyoruz).

## CodeGraph (`.codegraph/`)

Proje kökünde `.codegraph/` SQLite index'i bulunur. `codegraph init`
ile oluşturulur (~2 saniye, 5 dosya / 45 sembol / 184 edge).

Kullanım:

```bash
# MCP (tercih edilen): codegraph_explore tool'u
codegraph_explore(query="pruneMiddle formatPruneMarker")

# Shell (her ortamda çalışır):
codegraph explore "pruneMiddle"      # tek sembol
codegraph node pruneMiddle           # tam kaynak
codegraph search "prune"             # text search
codegraph callers pruneMiddle        # blast-radius
codegraph call graph pruneMiddle     # çağrı grafiği
```

`codegraph_explore` tek tool call'da: **verbatim satır-numaralı kaynak
+ blast-radius + çağrı zincirleri** döner. `Read`/`bash` filtre
takılırsa (büyük dosya gövdeleri, "error" geçen satırlar) codegraph'a
geçmek en güvenilir yoldur. AGENTS.md kural 3a.

## Görev Navigasyonu (sık sorgular)

```bash
# Açık tasklar
jq '.[] | select(.status=="todo") | {id, title, priority}' tasks/index.json

# Bir task'ın tam dosya yolu
jq -r '.[] | select(.id=="TASK-103") | .file' tasks/index.json

# Belirli bir plugin'i etkileyen tüm tasklar
jq --arg p "context-saver" '.[] | select(.labels[]? | contains($p)) | {id, title}' tasks/index.json
```

## Dış Bağımlılık Haritası (özet)

```
@opencode-ai/plugin  → plugins/*.ts  (Plugin tipi)
@opencode-ai/sdk     → plugins/*.ts  (client inject)
typescript           → tsc derleme
node:test (built-in) → TASK-103 (test runner)
```

Sürüm-pin politikası: `package.json`'a bak; OpenCode ana repo ile aynı
minor sürümde tutulur.