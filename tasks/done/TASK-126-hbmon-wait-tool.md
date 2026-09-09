---
id: TASK-126
title: "hbmon custom tool'ları (ajan wakeup: watch/wait/status)"
status: done
priority: P1
created: 2026-09-09
updated: 2026-09-09
environment: both
labels: [hbmon, plugin, wakeup, custom-tool]
depends_on: [TASK-123]
---

# TASK-126 — hbmon custom tool'ları (ajan wakeup)

## Amaç

Ajan, biten build'i **sorulmadan ama bekleyerek** öğrenebilmeli:
`hbmon_wait` tool'u bloklanır, terminal/erken sinyalle tek JSON ile döner.
Polling yok, context'e log sızmaz. settle-noticer next-contact kalır;
bu task turn-içi wakeup'u kapatır.

## Kapsam

- Yeni plugin `opencode-hbmon` + lib: `hbmon_watch`, `hbmon_wait`,
  `hbmon_status` custom tool'ları (hbmon CLI sarmalayıcı, subprocess,
  shell yok)
- `HBMON_BIN` env veya PATH ile ikilik çözümü; yoksa kurulum ipucu hatası
- wait timeout default 50sn (gateway -32001 tavanı altı) + tekrar-çağır
  doktrini; `until` passthrough (done,dep_missing,stall_suspect)
- Testler: node:test + fake-hbmon shim (hbmon-build-mon deseni); CI'da
  hbmon derlenmez, LIVE testler `HBMON_LIVE=1` kapılı
- Kayıtlar: index.json, package.json exports+keywords, server.ts barrel
  (6. factory), server-entry testi, examples/opencode.jsonc, README,
  PROJECT_MAP, docs/opencode-hbmon.md

- Yapılmayacaklar: turn-arası gerçek push (harness desteği ister —
  settle-noticer'ın alanı), daemon değişikliği (hbmon'a dokunulmaz),
  TUI toast (2026-09-04'te kaldırılma gerekçesi geçerli)

## Uygulama Planı

1. `plugins/lib/hbmon-tools.ts`: bin çözümleme + run/wrap + parse
2. `plugins/opencode-hbmon.ts`: default export, 3 tool (docs `tool()` deseni)
3. `tests/hbmon-tools.test.mjs`: shim + kontrat testleri
4. Kayıtlar (index/package/server/example/README/PROJECT_MAP/docs)
5. `npm run build` + `npm test` + `npm run lint` yeşil

## Etkilenen Dosyalar

- `plugins/opencode-hbmon.ts`, `plugins/lib/hbmon-tools.ts`
- `tests/hbmon-tools.test.mjs`, `tests/server-entry.test.mjs`
- `docs/opencode-hbmon.md`, `docs/PROJECT_MAP.md`
- `index.json`, `package.json`, `plugins/server.ts`
- `examples/opencode.jsonc`, `README.md`

## Doğrulama

- `npm run build` + `npm test` + `npm run lint` yeşil
- Fake-shim ile: watch handshake parse, wait erken-dönüş + terminal,
  status passthrough, eksik ikilikte kurulum ipucu

## Notlar / Kararlar

- Plugin dosyası SADECE default export (TASK-111 kuralı); mantık lib'de.
- Bloklayan çağrı gateway tavanına takılırsa (~60sn) sonuç değil kesinti
  döner: tool timeout'u 50sn default, ajan tekrar çağırır (dürüst sınır,
  dokümante).
- `until` yoksa yalnızca terminal state'ler (hbmon davranışı aynen).
