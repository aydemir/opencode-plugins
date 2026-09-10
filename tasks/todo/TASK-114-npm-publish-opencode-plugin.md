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

- `plugins/server.ts` barrel: altı factory re-export (SADECE function)
- `package.json`: `exports["./server"]` + 6 per-plugin path, `private` yok, repository
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

## 2026-09-10 re-verify (publish öncesi son kontrol)

- [x] `npm run build` temiz; `server-entry.test.mjs` 3/3
- [x] Manifest: `private` yok, `exports` = `./server` + 6 per-plugin path,
  `files` = dist/plugins/docs/scripts (yeni dosyalar dahil:
  `lib/build-tracker-disclosure.*`, `scripts/setup.mjs`, `README.tr.md`)
- [x] `npm pack --dry-run`: 142 dosya, 143.9 kB; server.js + mcp server.js
  + setup.mjs + iki README pakette
- [x] Registry: `opencode-plugins` adı BOŞTA (404) — ilk publish `0.1.0`
- [ ] Gerçek publish — SADECE kullanıcı (auth blokeri):
  ```bash
  npm adduser            # bir kez (token ~/.npmrc'ye yazılır)
  npm publish            # repo kökünde; 0.1.0 + README.md vitrin
  ```
- [ ] Publish sonrası teyit (auth sonrası ajan devralır):
  ```bash
  npm view opencode-plugins version   # 0.1.0 görmeli
  opencode plugin -g opencode-plugins # gerçek registry akışı
  ```

## Notlar / Kararlar

- Sözleşme: `exports["./server"] | exports["./tui"] | main | oc-themes`.
  Boot `Zy()`: Object.values iterate, aynı değer dedupe, non-function
  → tüm modül düşer. Altı factory AYNI spec options objesini alır
  (`pluginOptions["opencode-plugins"]`); `enabled:false` ortak kill-switch.
- Tarball-path spec'te opencode manifest bug'ı var (spec dizininde
  package.json arar) — registry/dir spec kullanılmalı.
- `opencode plugin` default local scope'a yazar; global için `-g`.
- Kurulum plugin runtime'unu indirir (effect ~10MB) — ilk kurulum yavaş,
  normal.
- `~/.config/opencode/plugins/*.ts` otomatik taranır — repo kopyasıyla
  karıştırma (çift-yükleme; bkz 2026-09-05 6-spec vakası).
