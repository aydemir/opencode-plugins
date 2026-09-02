# opencode-plugins — Roadmap & Kanban (2026-09-02)

`opencode-plugins` deposu için planlama, takip ve önceliklendirme çalışma alanı.
Üç ana tema:

1. **Plugin kontratı & kalite** — test runner, CI, type güvenliği.
2. **Context-saver yetenek genişletme** — escape hatch, marker bilgilendirme,
   - format-aware truncation, key-aware budama.
3. **Dokümantasyon & operasyon** — README netleştirme, "bilinçli LLM yok"
     kararının yayılımı, plugin sözleşmesi.

> **Karar kaydı:** LLM-özetli mod bilinçli olarak **yok**. Hedef kitle
> free / küçük context'li (4K–32K) modeller kullanıyor; ek API call =
> ek fatura + context şişmesi + key zorunluluğu. `lib/prune.ts` dosya
> başında bu gerekçe yazılıdır.

## Board Snapshot

| ID | Başlık | Status | Priority |
|----|--------|--------|----------|
| [TASK-101](./done/TASK-101-prune-marker-bilgilendirme.md) | prune marker'ı bilgilendirici yap | done ✅ | P1 |
| [TASK-102](./done/TASK-102-no-prune-escape-mekanizmasi.md)   | `enabled=false` toggle + `#no-prune` escape marker | done ✅ | P1 |
| [TASK-103](./todo/TASK-103-test-runner-ve-ci.md)             | vitest/node:test + npm test + GitHub Actions CI | todo | P2 |

Detaylar: `tasks/index.json`.

## Akış

- `todo/` → sıradaki iş
- `in-progress/` → o an üzerinde çalışılan
- `gap/` → plan dışı bulunan, sonra değerlendirilecek
- `done/` → kapatılmış (tarihli)
- `index.json` her durum değişikliğinde güncellenir

## Öncelik Bands

- **P1** — context-saver kullanıcı deneyimini doğrudan etkileyen (marker,
  escape hatch).
- **P2** — kalite & operasyon (test, CI, docs).
- **P3** — uzun vadeli / deneysel (örn. format-aware stratejiler).