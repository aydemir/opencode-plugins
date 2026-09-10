# Kararlar (AGENTS.md hafıza kuralı)

Format: `[YYYY-MM-DD HH:MM] DECISION: <konu> -> <karar> | REASON:
<gerekçe> | SUPERSEDES: <önceki karar (varsa)>`

## 2026-09-10

[2026-09-10 22:05] DECISION: hbmon crates.io yayını -> stabil sürüme kadar
ertelemeli, tek kurulum kaynağı git (`cargo install --git
https://github.com/aydemir/hbmon`) | REASON: API stabil değil (watch/wait/status
sözleşmesi + event adları değişebilir); erken crates.io yayını yanlış sürüme
kilitlenen kullanıcılar + `cargo install hbmon` ad çakışması riski yaratır.
Eksik-ikilik yolları (`HBMON_INSTALL_HINT`, `docs/opencode-hbmon.md`,
`scripts/hbmon-build-mon.mjs`) git'i tek kaynak gösterir, LLM/tool da
öldürmek yerine kuruluma yönlendirir | SUPERSEDES: none
