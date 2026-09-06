---
id: TASK-114
title: "npm paketi + `opencode plugin` kurulum akışı"
status: in-progress
priority: P1
created: 2026-09-05
updated: 2026-09-05
environment: both
labels: [release, npm, distribution, server-entry]
depends_on: [TASK-113]
file: tasks/todo/TASK-114-npm-publish-opencode-plugin.md
---

# TASK-114 — npm paketi + `opencode plugin` kurulum akışı

## Amaç

Son kullanıcı manuel config düzenlemeden tek komutla kurabilsin:
`opencode plugin -g opencode-plugins`. Üç ayrı plugin ismi + elle
yol yazma kafa karışıklığını ortadan kaldırır.

## Kapsam

- `plugins/server.ts` barrel: üç factory re-export (SADECE function)
- `package.json`: `exports["./server"]`, `private` kaldırma, repository
- `tests/server-entry.test.mjs`: entry shape + instantiate
- README + PROJECT_MAP + index.json distribution kaydı
- Gerçek `npm publish` (npm auth kullanıcıda — BLOKER)
- Yapılmayacaklar: MCP server bu akışa dahil değil (manuel `mcp` bloğu);
  tek kimlikte birleştirme yok (per-plugin esneklik korunur)

## Uygulama Planı

1. Sözleşme araştırması (binary strings: manifest_no_targets kuralları,
   Zy iterate + dedupe, spec-keyed options) ✅
2. Barrel + package.json + test (66/66) ✅
3. `npm pack` + yerel verdaccio publish + izole HOME uçtan uca ✅ (aşağıya bak)
4. Gerçek publish: `npm adduser && npm publish` (kullanıcı)
5. Publish sonrası: `opencode plugin -g opencode-plugins` gerçek akış teyidi

## Etkilenen Dosyalar

- `plugins/server.ts` (yeni)
- `tests/server-entry.test.mjs` (yeni)
- `package.json`
- `README.md`, `docs/PROJECT_MAP.md`, `index.json`

## Doğrulama

- [x] `bun run build` temiz, `bun run test` 66/66
- [x] Manifest self-check: exports["./server"] + 3 function + instantiate
- [x] `npm pack`: 87 dosya, server.js dahil
- [x] `opencode plugin <dir>`: "Detected server target" + config yazma
- [x] Yerel verdaccio: publish + `opencode plugin -g opencode-plugins`
      (registry spec) + boot `debug config` + kurulu kopyadan 3 instance —
      TAMAMLANDI (2026-09-05)
- [ ] Gerçek npm publish (auth blokeri)
- [ ] Gerçek registry'den kurulum teyidi

## Notlar / Kararlar

- Sözleşme: `exports["./server"] | exports["./tui"] | main | oc-themes`.
  Boot `Zy()`: Object.values iterate, aynı değer dedupe, non-function
  → tüm modül düşer. Üç factory AYNI spec options objesini alır
  (`pluginOptions["opencode-plugins"]`); `enabled:false` ortak kill-switch.
- Tarball-path spec'te opencode manifest bug'ı var (spec dizininde
  package.json arar) — registry/dir spec kullanılmalı.
- `opencode plugin` default local scope'a yazar; global için `-g`.
- Kurulum plugin runtime'unu indirir (effect ~10MB) — ilk kurulum yavaş,
  normal.
- `~/.config/opencode/plugins/*.ts` otomatik taranır — repo kopyasıyla
  karıştırma (çift-yükleme; bkz 2026-09-05 6-spec vakası).
