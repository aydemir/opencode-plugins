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

## 2026-09-11

[2026-09-11 09:15] DECISION: bash betikleri -> yasak, yeni otomasyon sadece
Node (.mjs); son .sh (`scripts/tui-live/cs-marker.sh`) `scripts/archive/`'a
taşındı, `scripts/tui-live/` kaldırıldı | REASON: bash multi-OS sorunu
(TASK-127 presedenti: build-mon/hbmon-build-mon Node portu, legacy .sh
arşivde); TASK-112 done olduğundan cs-marker'ın yaşatma maliyeti
faydasından fazla; `git mv` ile history korunur, gerekirse arşivden
çıkarılır. Referanslar arşiv yoluna güncellendi (PROJECT_MAP, AGENTS.md,
README EN/TR) | SUPERSEDES: none

## 2026-09-19

[2026-09-19 18:51] DECISION: bg-wake busy-safe adapter (`--task-id`): marker + export-poll + retry + JSONL, status-endpoint bağımlılığı yok | REASON: fork analizinde busy-drop mekanizması bulundu (Runner.ensureRunning yeni work'ü düşürür); session CLI'da status yok, HTTP status için endpoint keşfi gerekir; export `{info,messages}` + `time.created` doğrulamaya yeterli. Retry'lar aynı marker'ı taşır, denemeler injection_ts ile ayrışır. Bayraksız çağrı legacy kalır (geriye uyumlu). Test: stub opencode ile 6 satırlık matris, 14 pass/0 fail | SUPERSEDES: none

[2026-09-19 18:51] DECISION: OpenCode scheduler/fork değişikliği ertelendi (M1-M4 eşikli) | REASON: zincir idle'da çalışıyor (headless kanıt); kırılma adayı busy-drop + gözlemsizlik. Adapter önce gerçek TUI verisiyle `persistence ✓ / turn ✗` üretmeli; `✓/✓` çıkarsa müdahale gerekmez, `✗ persistence` çıkarsa sorun enjeksiyon katmanındadır. Müdahale noktaları + tetik eşikleri `docs/bg-wake-bulgular-cozumler.md` §5'te kilitli | SUPERSEDES: none
