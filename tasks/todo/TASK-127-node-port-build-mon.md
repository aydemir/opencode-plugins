---
id: TASK-127
title: "build-mon adapter'larının Node portu (bash'tan kurtulma)"
status: todo
priority: P2
created: 2026-09-09
updated: 2026-09-09
environment: both
labels: [build-mon, hbmon, nodejs, windows, port]
depends_on: [TASK-122]
---

# TASK-127 — build-mon adapter'larının Node portu

## Amaç

`scripts/build-mon.sh` + `scripts/hbmon-build-mon.sh`'in bash'tan Node'a
taşınması. Gerekçe (ölçüldü, 2026-09-09): bash/PATH-sınıfı 15 test
Windows'ta çevresel sebeple fail (WSL-bash çözünürlüğü, `/usr/bin:/bin`
override'u); tırnak taşıma (`%*`, `%~1`, `/s` soyma) yalnızca cmd/batch
katmanında var. Node'da argv CreateProcess dizisiyle birebir taşınır.
Repo zaten Node üstünde (plugin'ler TS, testler node:test);
`scripts/cpu-liveness-probe/*.js` emsali var.

## Kapsam

- `build-mon.sh` + `hbmon-build-mon.sh` → Node (tek dosya veya küçük modül)
- Sözleşme AYNI kalır (banner, events.jsonl, `*.status.json`, exit
  kodları, HEARTBEAT/rotasyon): `opencode-settle-noticer` değişmeden çalışır
- Testler: mevcut `build-mon.test.mjs` + `hbmon-build-mon.test.mjs`
  senaryoları Node fake'leriyle (`.cmd` taşıyıcı yok — doğrudan spawn;
  TASK-126'daki `hbmon-tools.test.mjs` deseni: `process.execPath` zinciri)
- Kayıtlar: docs (build-mon.md + hbmon-migration.md notu), index.json,
  PROJECT_MAP; eski `.sh` dosyaları arşivlenir (silinmez — unix
  kurulumlar + geri-dönüş yolu)

- Yapılmayacaklar: davranış değişikliği (çıktı formatı, eşikler, exit
  haritası birebir), hbmon tarafı değişikliği, TUI/toast

## Uygulama Planı

1. Sözleşme envanteri (iki `.sh` + test beklentileri + settle-noticer girişi)
2. Node implementasyon (argv dizisi, shell yok, win32+unix)
3. Test portu (bash shim'ler Node fake'ine; PATH override kalkar)
4. Eski `.sh` arşiv + docs/index güncellemeleri
5. `npm run build` + `npm test` (win32 dev dahil) + `npm run lint` yeşil

## Etkilenen Dosyalar

- `scripts/build-mon.{sh → mjs}`, `scripts/hbmon-build-mon.{sh → mjs}` (yeni)
- `tests/build-mon.test.mjs`, `tests/hbmon-build-mon.test.mjs`
- `docs/build-mon.md`, `docs/hbmon-migration.md`, `docs/PROJECT_MAP.md`
- `index.json`, `README.md`

## Doğrulama

- [ ] Sözleşme testleri win32 + ubuntu'da yeşil (bash bağımlılığı yok)
- [ ] settle-noticer mevcut event dizinleriyle değişmeden çalışır
- [ ] Full `npm test` fail sayısı azalır (15 bash-sınıfı fail kapanır)

## Notlar / Kararlar

- Bugünkü gerçek bug'lar (handshake kaçışı, uuid ıraksaması, pipe
  devralma) dilden bağımsızdı — bu task yalnızca portabilite vergisini
  kaldırır, davranış değiştirmez.
- Alternatif (test harness'ında win32 `skipIf`) daha ucuz ama borcu
  erteler; port kalıcı çözer (repo Node-repo'su).
