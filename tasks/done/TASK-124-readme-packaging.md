---
id: TASK-124
title: "README build-monitör atfı + scripts/ npm paketine dahil + example settle-noticer"
status: done
priority: P2
created: 2026-09-07
updated: 2026-09-07
environment: both
labels: [docs, packaging, npm, build-mon, readme]
depends_on: [TASK-123]
file: tasks/todo/TASK-124-readme-packaging.md
---

# TASK-124 — README + paketleme eksiği

## Bulgu (kullanıcı sorusu, kanıtlı)

- `npm pack --dry-run`: `scripts/` count **0** — `build-mon.sh` +
  `cpu-liveness-probe/` tarball'da YOK. `dist/` + `plugins/` +
  `docs/` var (settle-noticer dahil). npm kurulumunda disclosure'daki
  `node <path>` ve build-mon örnekleri kırık.
- `scripts/` 74K — dahil etmek ucuz.
- bun: kaynak checkout'ta sorun yok (aynı package.json workspaces);
  lock değişikliği gerekmez (bağımlılık yok, sadece `files`).
- README "Üç eklenti" diyor (beş oldu), tabloda cpu-liveness +
  settle-noticer yok, build-mon hiç geçmiyor, ağaç eski.
- `examples/opencode.jsonc`: settle-noticer yok (plugin + options).

## İş

- `package.json` `files` += `scripts` → pack dry-run ile doğrula.
- README: intro (beş eklenti + script seti), tabloya 2 satır, detay
  doküman listesi, Seçenek C üç→beş, repo ağacı güncel.
- `examples/opencode.jsonc`: settle-noticer plugin + pluginOptions.

## Kapsam-dışı

- `examples/`'ın pakete alınması (ayrı karar).
- Sürüm bump / publish (TASK-114'e ait).

## Doğrulama

- [ ] pack dry-run: `scripts/build-mon.sh` + agent dosyaları listede
- [ ] JSON parse (package.json, example jsonc tolerant)
- [ ] `npm test` etkilenmez (kod değişikliği yok — çalıştırılmaz,
      gerekçe not edilir) / hızlı `tsc --noEmit` gereksiz

## Notlar / Kararlar

- (2026-09-07) Açılış: kullanıcı sorusu "readme + npm/bun dahil mi".
- (2026-09-07) Kapanış: pack dry-run ile doğrulandı (build-mon.sh +
  probe dosyaları listede). bun: bağımlılık değişikliği yok, lock
  aynı. Kod değişikliği yok → `npm test` tekrar koşulmadı (son yeşil
  108/108 geçerli).
