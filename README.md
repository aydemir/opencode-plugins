# opencode-plugins

> v0.1.0 — OpenCode için eklenti koleksiyonu

OpenCode için eklenti koleksiyonu. İki eklenti içerir — **`opencode-context-saver` ( DHS PTC-mode)** context tasarrufu ve **`opencode-build-tracker` (`opencode-build-tracker`)** build yaşam döngüsü kancaları.

> Kaynak: `/root/.config/opencode/plugins/` içindeki canlı kurulumdan kopyalandı. Kod olduğu gibi korunur, ek davranış eklenmez.

## Eklentiler

| Eklenti | Dosya | Amaç | Tasarruf |
|---------|-------|------|----------|
| **opencode-context-saver** | `plugins/opencode-context-saver.ts` | Tool çıktılarını sıkıştırır, gereksiz context'i keser | Ölçüldü: **97.5%** (80233 → 1997 chars, 3 dosya + chat özeti) |
| **opencode-build-tracker** | `plugins/opencode-build-tracker.ts` | Build komutlarını algılar, `onBuildStart / onBuildSuccess / onBuildFailure / onThresholdExceeded` kancaları | — |

Detaylı doküman: `docs/opencode-context-saver.md` ve `docs/opencode-build-tracker.md`

## Kurulum

### 1) Seçenek A — Git submodule / kopyala

```bash
git clone https://github.com/<org>/opencode-plugins.git
cp opencode-plugins/plugins/opencode-context-saver.ts ~/.config/opencode/plugins/
cp opencode-plugins/plugins/opencode-build-tracker.ts ~/.config/opencode/plugins/
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

Eklentiler TypeScript olarak doğrudan yüklenir. Ön-derleme istersen:

```bash
npm install
npm run build
# veya plugins içindeki dist/*.js dosyaları zaten hazır
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
│   ├── opencode-context-saver.ts   # DHS PTC-mode adaptasyonu
│   ├── opencode-context-saver.js   # derlenmiş
│   ├── opencode-build-tracker.ts
│   └── opencode-build-tracker.js
├── docs/
│   ├── opencode-context-saver.md
│   └── opencode-build-tracker.md
├── examples/
│   └── opencode.jsonc
├── package.json
├── tsconfig.json
└── LICENSE
```

## Lisans

MIT — `LICENSE` dosyasına bak.

## Geliştirme

```bash
npm ci               # bağımlılıkları kur
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
