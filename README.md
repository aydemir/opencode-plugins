# opencode-plugins

OpenCode için eklenti koleksiyonu. İki eklenti içerir — **`opencode-context-saver` (`context-saver`, DHS PTC-mode)** context tasarrufu ve **`opencode-build-tracker` (`build-tracker`)** build yaşam döngüsü kancaları.

> Kaynak: `/root/.config/opencode/plugins/` içindeki canlı kurulumdan kopyalandı. Kod olduğu gibi korunur, ek davranış eklenmez.

## Eklentiler

| Eklenti | Dosya | Amaç | Tasarruf |
|---------|-------|------|----------|
| **context-saver** | `plugins/context-saver.ts` | Tool çıktılarını sıkıştırır, gereksiz context'i keser | Ölçüldü: **97.5%** (80233 → 1997 chars, 3 dosya + chat özeti) |
| **build-tracker** | `plugins/build-tracker.ts` | Build komutlarını algılar, `onBuildStart / onProgress / onBuildFailure / onThresholdExceeded` kancaları | — |

Detaylı doküman: `docs/context-saver.md` ve `docs/build-tracker.md`

## Kurulum

### 1) Seçenek A — Git submodule / kopyala

```bash
git clone https://github.com/<org>/opencode-plugins.git
cp opencode-plugins/plugins/context-saver.ts ~/.config/opencode/plugins/
cp opencode-plugins/plugins/build-tracker.ts ~/.config/opencode/plugins/
```

### 2) Seçenek B — Doğrudan opencode.jsonc ile

`~/.config/opencode/opencode.jsonc`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    "opencode-mem",
    "./plugins/context-saver.ts",
    "./plugins/build-tracker.ts"
  ]
}
```

Örnek: `examples/opencode.jsonc`

### 3) Derleme (opsiyonel)

Eklentiler TypeScript olarak doğrudan yüklenir. Ön-derleme istersen:

```bash
npm install
npm run build
# veya plugins içindeki dist/*.js dosyaları zaten hazır
```

`@opencode-ai/plugin` `1.18.21` ile test edildi.

## Hızlı Doğrulama

```bash
# context-saver regex'i manuel test et
node -e "console.log(/\berror\b|\bfailed\b/i.test('error: foo'))"

# 3 dosya ile tasarruf ölçümü (repo içindeki ölçüm script'i ile aynı mantık)
# Bkz. docs/context-saver.md#ölçüm
```

## Repo Yapısı

```
opencode-plugins/
├── plugins/
│   ├── context-saver.ts   # DHS PTC-mode adaptasyonu
│   ├── context-saver.js   # derlenmiş
│   ├── build-tracker.ts
│   └── build-tracker.js
├── docs/
│   ├── context-saver.md
│   └── build-tracker.md
├── examples/
│   └── opencode.jsonc
├── package.json
├── tsconfig.json
└── LICENSE
```

## Lisans

MIT — `LICENSE` dosyasına bak.

## Katkı

PR'lar açıktır. Lütfen `docs/` içindeki davranış sözleşmesini bozmayın; her değişiklikte `npm run build` ve manuel smoke test yapın.

## İlgili

- OpenCode docs: https://opencode.ai/docs
- Canlı konfigürasyon: `~/.config/opencode/opencode.jsonc`
