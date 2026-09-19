---
id: TASK-132
title: "bg_run/bg_status/bg_logs/bg_kill portu (hbmon backend) + wake via opencode run -s"
status: done
priority: P2
created: 2026-09-19
updated: 2026-09-19
environment: both
labels: [bg-tasks, hbmon, wake, opencode-run]
depends_on: []
file: tasks/done/TASK-132-bg-tasks-wake.md
---

# TASK-132 — bg_* portu + wake workaround

## Amaç

pi/nabız'daki `bg_run` modeli opencode'a taşınsın: araç çağrısı arka plana
atılır, LLM serbest kalır (başka iş yapar veya turn'ü bitirir), iş bitince
oturum uyandırılır. pi'deki `triggerTurn`'un opencode SDK karşılığı YOK
(Hooks: dispose/event/config/tool/auth/provider/chat.*/permission/command —
araştırıldı 2026-09-19); workaround canlı testle kanıtlandı: harici bekçi
`opencode run -s <sessionID> "[bg] ..."` koşunca AYNI oturumda yeni turn
açılıyor (`/tmp/opencode-wake-test`, `ses_f4599e…`, export'ta 2+2 mesaj).

## Kapsam

- `plugins/opencode-hbmon.ts`'e 4 tool ekle (önerilen; ayrı dosya değil):
  `bg_run` (hbmon `watch --detach`, hemen dön + task ID + sessionID yakala),
  `bg_status` (`status --compact`), `bg_logs` (.out tail, 50KB cap),
  `bg_kill` (`kill`). İsim/parametre pi `bg-hbmon.ts` ile aynı olmalı.
- Wake bekçisi: settle'da `opencode run -s <session> "[bg] <name> <EVENT>
  (exit=<code>)"` koşan küçük script (`scripts/bg-wake.mjs` önerisi);
  sessionID `bg_run` anında tool input'undan alınır, task kaydına yazılır.
- Uyandırma başına bir LLM turn'ü (~12K input token) maliyeti disclosure'a
  yazılır; istenenle kapatılabilir (`enabled:false` veya bayrak).
- Test: `node:test` — run→status→logs→kill döngüsü (gerçek daemon),
  wake script'i `--dry-run` ile komut üretimi; canlı `opencode run -s`
  tekrarı (manuel, token harcar — CI'ye koyma).
- Docs: `docs/opencode-hbmon.md`'ye bg_* + wake bölümü; README tablo satırı.

Yapılmayacaklar: açık TUI ile eşzamanlı yazışma garantisi (test edilmedi,
headless kanıtlı); `triggerTurn` birebiri (SDK'da yok); pi `delegate/fusion`
portu (hbmon'la ilgisiz); `bg_run_pi_attested` (child-pi orkestrasyonu).
