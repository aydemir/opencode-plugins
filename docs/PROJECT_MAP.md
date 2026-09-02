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

İki plugin, TypeScript ESM, `Plugin` tipi `@opencode-ai/plugin`'dan.

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