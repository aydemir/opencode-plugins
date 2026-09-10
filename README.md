# opencode-plugins

> v0.1.0 — OpenCode için eklenti koleksiyonu

OpenCode için eklenti koleksiyonu. Altı eklenti içerir — **`opencode-context-saver` (DHS PTC-mode)** context tasarrufu, **`opencode-build-tracker`** build yaşam döngüsü kancaları, **`opencode-truncation-noticer`** read-tool kırpma bildirimi, **`opencode-cpu-liveness`** CPU-izleme disclosure'ı, **`opencode-settle-noticer`** biten build'i sorulmadan bildirme ve **`opencode-hbmon`** hbmon custom tool'ları (turn-içi ajan wakeup). Artı MCP server **`opencode-mcp-bash-tools`** (`bash_safe`/`bash_raw`) ve script seti **`scripts/build-mon.mjs`** (push/event build monitörü) + **`scripts/cpu-liveness-probe/`**.

> Kaynak: `/root/.config/opencode/plugins/` içindeki canlı kurulumdan kopyalandı. Kod olduğu gibi korunur, ek davranış eklenmez.

## Eklentiler

| Eklenti | Dosya | Amaç | Tasarruf |
|---------|-------|------|----------|
| **opencode-context-saver** | `plugins/opencode-context-saver.ts` | Tool çıktılarını sıkıştırır, gereksiz context'i keser | Ölçüldü: **97.5%** (80233 → 1997 chars, 3 dosya + chat özeti) |
| **opencode-build-tracker** | `plugins/opencode-build-tracker.ts` | Build komutlarını algılar, `onBuildStart / onBuildSuccess / onBuildFailure / onThresholdExceeded` kancaları | — |
| **opencode-truncation-noticer** | `plugins/opencode-truncation-noticer.ts` | Native read sessiz kırpmasına `devamı var` marker'ı | — |
| **opencode-cpu-liveness** | `plugins/opencode-cpu-liveness.ts` | Uzun derlemede `cpu-liveness-agent` yolunu deklare eder (disclosure-only) | — |
| **opencode-settle-noticer** | `plugins/opencode-settle-noticer.ts` | Biten build-mon derlemesini sorulmadan bildirir (next-contact, `.notified` ile tek seferlik) | — |
| **opencode-hbmon** | `plugins/opencode-hbmon.ts` | hbmon custom tool'ları (`hbmon_watch`/`hbmon_wait`/`hbmon_status`): turn-içi ajan wakeup, polling yok | — |
| **opencode-mcp-bash-tools** (MCP) | `plugins/mcp-bash-tools/` | `bash_safe` (otomatik kırpılan) + `bash_raw` (tam çıktı) | — |

| Script | Dosya | Amaç |
|--------|-------|------|
| **build-mon** | `scripts/build-mon.mjs` | Push/event build monitörü (opencode-bm poll-only boşluğunu kapatır; `bm_start` ile sarmalanır, `events.jsonl` + banner + log rotasyonu) |
| **cpu-liveness-probe** | `scripts/cpu-liveness-probe/` | Build process CPU izleme (probe + tree-kill + agent) |

Detaylı doküman: `docs/opencode-context-saver.md`, `docs/opencode-build-tracker.md`, `docs/opencode-truncation-noticer.md`, `docs/opencode-cpu-liveness.md`, `docs/opencode-settle-noticer.md`, `docs/opencode-hbmon.md` ve `docs/build-mon.md`

## Kurulum

### 0) Seçenek C — `opencode plugin` + tamset setup (önerilen)

```bash
opencode plugin -g opencode-plugins
npm install && npm run build && npm run setup -- --yes
```

İlk komut paketi kurar ve config'i günceller; beş plugin de
`exports["./server"]` üzerinden yüklenir. İkinci komut manuel
yerleştirmeyi ortadan kaldırır: `dist/` artifact'lerini doğrular,
canlı config'e `mcp.opencode-mcp-bash-tools` bloğunu (mutlak
`server.js` yoluyla, `.bak` yedekli) ve eksikse `plugin`
girdisini ekler, script setini (`build-mon.mjs`,
`cpu-liveness-probe/`) kontrol eder. Önce plansız yazmaz:
`npm run setup -- --dry-run` ile önizle. Yapılandırma:
`pluginOptions["opencode-plugins"]` (beşine ortak; `enabled:false`
beşini birden kapatır).
Uzun derlemeler için `scripts/build-mon.mjs` (npm paketine dahildir) +
`opencode-settle-noticer` kombinasyonu kullanılır (detay:
`docs/build-mon.md`, `docs/opencode-settle-noticer.md`).

### 1) Seçenek A — Git submodule / kopyala

```bash
git clone https://github.com/<org>/opencode-plugins.git
# Plugin'ler ./lib/*.ts import eder — tek .ts kopyalama ÇALIŞMAZ.
# plugins/ dizinini bütün olarak kopyala:
cp -r opencode-plugins/plugins ~/.config/opencode/plugins
```

> ⚠️ Çift-yükleme tuzağı: opencode `~/.config/opencode/plugins/*.ts`
> dosyalarını OTOMATİK tarar ve config'deki `plugin` listesine EKLER.
> Repo kopyası + eski kopya aynı anda durursa hook'lar çift çalışır
> (2026-09-05 vakası: 6 spec → 5 instance). Ya Seçenek C'yi kullan ya
> da eski kopyaları sil, ikisini karıştırma.

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
# veya bun ile (dogurlandi: bun 1.4.0, 66/66 test):
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
│   ├── opencode-cpu-liveness.ts      # disclosure-only
│   ├── opencode-settle-noticer.ts    # next-contact settle bildirimi
│   ├── opencode-hbmon.ts             # hbmon custom tool'ları (turn-içi wakeup)
│   ├── server.ts                     # npm paketi entry (exports["./server"], TASK-114)
│   ├── lib/                        # paylaşılan: prune, disclosure, raw-refill, truncation-notice, settle-notice, cpu-liveness-disclosure, hbmon-tools
│   └── mcp-bash-tools/             # MCP server (bash_safe/bash_raw)
├── scripts/
│   ├── build-mon.mjs                # push/event build monitörü (TASK-127 Node portu)
│   ├── hbmon-build-mon.mjs          # build-mon sözleşmesi, hbmon motoru (TASK-127 Node portu)
│   ├── archive/                    # legacy .sh portları (git mv, history korunur)
│   ├── cpu-liveness-probe/         # probe + tree-kill + agent
│   ├── timeout-kill-probe/         # TASK-115 regresyon bekçisi
│   └── tui-live/                   # TASK-112 TUI canlı test
├── docs/                           # plugin + build-mon + vaka yazıları
├── examples/
│   └── opencode.jsonc
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

## Yazılar

- [Oracle Problem — Canlı Doğrulama Disiplini](docs/oracle-problem-vaka-calismasi.md)
