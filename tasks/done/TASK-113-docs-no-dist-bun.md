---
id: TASK-113
title: "Docs tazele + no-dist politikası + bun alternatifi"
status: done
priority: P2
created: 2026-09-05
updated: 2026-09-05
environment: both
labels: [docs, build, bun, release, no-dist]
depends_on: [TASK-112]
---

# TASK-113 — Docs tazele + no-dist + bun

## Amaç

Plugin+MCP yapısına karşı belgeler bayatlamıştı; derleme tek-yolluydu (npm);
release yolu tanımsızdı. Kullanıcı kararı: **dist repoda yok, herkes npm/bun
ile derler.**

## Kapsam

- Bayat 6 nokta düzeltildi:
  1. README "iki eklenti" → üç + MCP server satırı; Seçenek A lib uyarısı
     (`plugins/` bütün kopyalanır, tek `.ts` çalışmaz); dist wording;
     Repo Yapısı ağacı; Geliştirme'ye bun.
  2. `docs/opencode-context-saver.md` header (125 satır/tmp referansı gitti).
  3. `docs/plugin-test.md` çıktı listesi (tn eklendi + no-dist notu).
  4. `examples/opencode.jsonc` kendi MCP server girişi (`node plugins/.../dist/server.js`).
  5. `package.json`: `workspaces` bogus glob → `plugins/mcp-bash-tools`;
     `exports` dup key temizliği; `build:plugins` no-op → tsc; description 3 plugin.
  6. `docs/PROJECT_MAP.md` dist politikası ("repoda kalır" → tutulmaz).
- bun 1.4.0 izolede doğrulandı (`/tmp/bun-trial`): install + build + 63/63.
  `bun run test` node koşucusunu çağırır (`bun test` ayrı runner — kullanılmaz).
- Yapılmayanlar: tag/CHANGELOG/npm-publish (release hattı ayrı karar;
  `private:true` duruyor).

## Doğrulama

- [ ] `bun install` + `bun run build` + `bun run test` (izole, 63/63) ✓
- [ ] `examples/opencode.jsonc` JSON geçerli ✓
- [ ] `npm test` (ana repo, commit öncesi) — aşağıda

## Notlar / Kararlar

- `[2026-09-05] DECISION: no-dist + npm/bun` — `dist/` `.gitignore`'da zaten;
  PROJECT_MAP iddiası ("repoda kalır") gerçekle çelişiyordu, düzeltildi.
  Release (tag/CHANGELOG/publish) ayrı görev; MCP `bin` için paketlenmiş
  dist gerektiğinde karar verilir.
- bun workspace notu: glob düzeltmesinden sonra `bun install` sorunsuz;
  eski `plugins/*` glob'u bun'da patlayabilirdi (denenmedi, gerek kalmadı).
