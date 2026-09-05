# opencode-plugins

> v0.1.0 — OpenCode için eklenti koleksiyonu

OpenCode için eklenti koleksiyonu. Üç eklenti içerir — **`opencode-context-saver` (DHS PTC-mode)** context tasarrufu, **`opencode-build-tracker`** build yaşam döngüsü kancaları ve **`opencode-truncation-noticer`** read-tool kırpma bildirimi. Artı MCP server **`opencode-mcp-bash-tools`** (`bash_safe`/`bash_raw`).

> Kaynak: `/root/.config/opencode/plugins/` içindeki canlı kurulumdan kopyalandı. Kod olduğu gibi korunur, ek davranış eklenmez.

## Eklentiler

| Eklenti | Dosya | Amaç | Tasarruf |
|---------|-------|------|----------|
| **opencode-context-saver** | `plugins/opencode-context-saver.ts` | Tool çıktılarını sıkıştırır, gereksiz context'i keser | Ölçüldü: **97.5%** (80233 → 1997 chars, 3 dosya + chat özeti) |
| **opencode-build-tracker** | `plugins/opencode-build-tracker.ts` | Build komutlarını algılar, `onBuildStart / onBuildSuccess / onBuildFailure / onThresholdExceeded` kancaları | — |
| **opencode-truncation-noticer** | `plugins/opencode-truncation-noticer.ts` | Native read sessiz kırpmasına `devamı var` marker'ı | — |
| **opencode-mcp-bash-tools** (MCP) | `plugins/mcp-bash-tools/` | `bash_safe` (otomatik kırpılan) + `bash_raw` (tam çıktı) | — |

Detaylı doküman: `docs/opencode-context-saver.md` ve `docs/opencode-build-tracker.md`

## Kurulum

### 1) Seçenek A — Git submodule / kopyala

```bash
git clone https://github.com/<org>/opencode-plugins.git
# Plugin'ler ./lib/*.ts import eder — tek .ts kopyalama ÇALIŞMAZ.
# plugins/ dizinini bütün olarak kopyala:
cp -r opencode-plugins/plugins ~/.config/opencode/plugins
```

### 2) Seçenek B — Doğrudan opencode.jsonc ile

`~/.config/opencode/opencode.jsonc`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    "opencode-mem",
    "./plugins/opencode-context-saver.ts",
    "./plugins/opencode-build-tracker.ts"
  ]
}
```

Örnek: `examples/opencode.jsonc`

### 3) Derleme (opsiyonel)

Eklentiler TypeScript olarak doğrudan yüklenir. `dist/` repoda tutulmaz —
herkes kendi ortamında derler (`.gitignore`):

```bash
npm install && npm run build
# veya bun ile (dogurlandi: bun 1.4.0, 63/63 test):
bun install && bun run build
```

`@opencode-ai/plugin` `1.18.21` ile test edildi.

## Hızlı Doğrulama

```bash
# opencode-context-saver regex'i manuel test et
node -e "console.log(/\berror\b|\bfailed\b/i.test('error: foo'))"

# 3 dosya ile tasarruf ölçümü (repo içindeki ölçüm script'i ile aynı mantık)
# Bkz. docs/opencode-context-saver.md#ölçüm
```

## Repo Yapısı

```
opencode-plugins/
├── plugins/
│   ├── opencode-context-saver.ts   # DHS PTC-mode
│   ├── opencode-build-tracker.ts
│   ├── opencode-truncation-noticer.ts
│   ├── lib/                        # paylaşılan: prune, disclosure, raw-refill, truncation-notice
│   └── mcp-bash-tools/             # MCP server (bash_safe/bash_raw)
├── docs/
├── examples/
│   └── opencode.jsonc
├── scripts/tui-live/               # TASK-112 TUI canlı test
├── tests/
├── package.json
├── tsconfig.json
└── LICENSE
```

## Lisans

MIT — `LICENSE` dosyasına bak.

## Geliştirme

```bash
npm ci               # bağımlılıkları kur (veya: bun install)
npm run lint         # tsc --noEmit (tip kontrolü)
npm test             # build + node:test (tests/*.test.mjs)
```

`npm test` arka arkaya `npm run build` ve `node --test tests/` çalıştırır.
Testler `dist/` üretim çıktısını import eder — build güncel değilse testler
yanlış negatif verebilir. CI gate: `.github/workflows/test.yml`.

PR açmadan önce:

1. `npm test` lokal yeşil olmalı
2. `docs/` içindeki davranış sözleşmesi korunmalı (kırıcı API değişikliği yok)
3. Yeni plugin davranışı için `tests/` altına `*.test.mjs` ekleyin

## Katkı

PR'lar açıktır. Lütfen `docs/` içindeki davranış sözleşmesini bozmayın; her değişiklikte `npm test` çalıştırın.

## İlgili

- OpenCode docs: https://opencode.ai/docs
- Canlı konfigürasyon: `~/.config/opencode/opencode.jsonc`
