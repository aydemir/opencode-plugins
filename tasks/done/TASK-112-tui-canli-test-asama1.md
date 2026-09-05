---
id: TASK-112
title: "TUI canlı test Aşama 1 — cs-marker tmux scripti"
status: done
priority: P1
created: 2026-09-05
updated: 2026-09-05
environment: both
labels: [tui, live-test, context-saver, tmux, runtime-first]
depends_on: [TASK-107, TASK-111]
---

# TASK-112 — TUI canlı test Aşama 1 (cs-marker tmux scripti)

## Amaç

Context-saver prune marker'ının (`[... pruned: N→M chars ...]`,
`plugins/lib/prune.ts:55`) LLM'e ulaştığı canlı kanıtlı (Test 17/18,
AGENTS.md). Eksik halka: aynı marker'ın **TUI transcript'inde render
edildiğinin** otomatik kanıtı. En ucuz yolla kapat: tmux + `capture-pane`.

## Kapsam

- Yapılacaklar
  - `scripts/tui-live/cs-marker.sh`: tmux session aç → `opencode` başlat →
    büyük bash çıktısı tetikle → `capture-pane -p -S -500` poll →
    `[... pruned:` grep → exit 0/1/2.
  - Exit kodu sözleşmesi: `0`=PASS, `1`=FAIL (marker yok), `2`=INCONCLUSIVE
    (TUI açılmadı / prompt hazır olmadı — yalan PASS/FAIL yok).
  - AGENTS.md'ye "TUI canlı test prosedürü" bölümü (10 satır).
  - PROJECT_MAP + index.json güncellemesi.
- Yapılmayacaklar (out-of-scope)
  - Full E2E harness (PTY + snapshot + key injection, tui-testing-mcp tarzı)
    — ayrı repo işi, Aşama 2. Bu görevde genelleme yok.
  - build-tracker status / permission prompt senaryoları — sonraki görev.

## Uygulama Planı

1. Script iskeleti (`set -euo pipefail`, timeout+poll, config backup/restore).
2. Kuru doğrulama: `bash -n`, shellcheck (varsa), tmux smoke
   (`new-session -d 'echo hi'` + `capture-pane`).
3. Gerçek TUI koşumu manuel (LLM token harcar — CI'ye koyma).

## Etkilenen Dosyalar

- `scripts/tui-live/cs-marker.sh` (yeni)
- `AGENTS.md` (prosedür bölümü)
- `docs/PROJECT_MAP.md` (scripts bölümü)
- `index.json`, `tasks/index.json` (status)

## Doğrulama

- [ ] `bash -n scripts/tui-live/cs-marker.sh` temiz
- [ ] tmux smoke: session aç/kapat çalışıyor
- [ ] Gerçek koşumda PASS/FAIL/INCONCLUSIVE ayrımı gözlendi
- [ ] `npx tsc --noEmit` temiz (plugin'e dokunulmadıysa opsiyonel)

## Notlar / Kararlar

- Marker seçimi: deterministik string `[... pruned:`, threshold 500 char
  (`DEFAULT_CONFIG.compressThreshold`, `plugins/opencode-context-saver.ts:76`).
- Neden tmux, neden şimdi: `tmux 3.5a` mevcut; alternate-screen buffer'ı
  bedavaya handle ediyor. Kendi PTY harness'ı 300-500 satır `node-pty`
  bakımı demek — Aşama 1'de yasak.
- Bilinen tuzaklar: viewport dışı marker (`-S -500` şart), collapsed tool
  output, LLM gecikmesi (poll 10sn, toplam 180sn, retry 2).

## Kosum 1 (2026-09-05, opencode 1.18.29, Muse Spark 1.3 Free)

- Komut: `./scripts/tui-live/cs-marker.sh --timeout 180`
- Sonuc: **FAIL** — `FAIL: marker 180sn'de gorunmedi` (`/tmp/cs-marker-20260905-174140.log`).
- Ama hook calisti: LLM ozeti `[pruned: 10114→150 chars (98.5% saved)]` diye
  alintiladi → prune tetiklendi, marker modele ulasti (Test 18 ile tutarli).
- Koku: TUI tool sonucunu **collapsed** render ediyor (`Click to expand`
  gozlemlendi); literal `[... pruned:` collapsed node arkasinda, viewport'ta yok.
- Tespit 2: alternate-screen yuzunden scrollback sadece 24 satir — `-S -500`
  ise yaramiyor, viewport-only. Script varsayimi yanlis.
- Tespit 3: `[Tool Compact] 📊 Oturum tamamlandi` satiri TUI'da render edildi.
- Sonraki iterasyon (v2): expand icin tus gonder (tool node'a gidip Enter) sonra
  grep; veya zayif-gecis olarak LLM alintisini (`pruned: N→M`) kabul et.

## Kosum 2 (2026-09-05, v2 kriteri: literal + `pruned:` zayif)

- Komut: `./scripts/tui-live/cs-marker.sh --timeout 180 --session cs-marker-test2`
- Sonuc: **FAIL** — `FAIL: marker 180sn'de gorunmedi`.
- Bu kosumda LLM istatistik alintilamadi (`prune edildigi icin...kuyruk gorundu`
  dedi, sayisiz) → v2 zayif kriteri de tutmadi. Dogrulanan: FAIL dogru, script
  yalan soylemiyor.
- Ogrenme: LLM ifadesi kosumdan kosuma degisiyor (Kosum 1 sayili alinti, Kosum 2
  sayisiz ozet). Duz `prun` kelimesi disclosure metninden de gelebilecegi icin
  zayif kanit olamaz. v2.1: zayif kriter `[0-9]+→[0-9]+` (sadece dinamik marker'da
  var olan sayisal istatistik). Geriye-donuk test: Kosum 1 ornegi eslesir
  (WEAK-PASS olurdu), Kosum 2 ornegi eslesmez (FAIL dogru).

## Kosum 3 (2026-09-05, v2.1 kriteri: literal + `[0-9]+→[0-9]+`)

- Komut: `./scripts/tui-live/cs-marker.sh --timeout 180 --session cs-marker-test3`
- Sonuc: **FAIL** — `FAIL: marker 180sn'de gorunmedi`.
- LLM bu kez: `Tool auto-prune nedeniyle preview'da sadece tail gorunuyor:
  2991...3000` — sayisiz, istatistik yok → zayif kriter de tutmadi. FAIL dogru.
- 3 kosumun toplu sonucu:
  - Prune davranisi deterministik (3/3): her seferinde tail-only (2991-3000)
    + LLM prune'a atif. Hook calisiyor.
  - Istatistik alintisi nondeterministik (1/3: yalnizca Kosum 1 `10114→150`).
  - Literal marker TUI viewport'ta 3/3 gorunmez (collapsed node).
- Karar: senaryo sorusu cevaplandi — marker modele ulasiyor, TUI'da collapsed
  arkasinda. v3 (expand-tusu otomasyonu) maliyet/fayda dusuk; Aşama 1 burada
  donduruluyor. Script regresyon bekcisi olarak saklaniyor.

## Kosum 4 (2026-09-05, v3: collapse-bypass payload) — PASS

- Komut: `./scripts/tui-live/cs-marker.sh --timeout 180 --session cs-marker-test4`
- Sonuc: **PASS** — `PASS: prune marker TUI'de render edildi (20sn)`
  (`/tmp/cs-marker-20260905-180844.log`).
- v3 degisikligi: cok-satirli `seq` yerine satirsonu-icermeyen 2000-char payload
  (`python3 -c "import sys; sys.stdout.write('Q7'*1000)"`). Kirpilmis cikti
  5 satir/232 char (cevrimdisi dogrulandi) → `collapseToolOutput` overflow=false
  → full render, literal `[... pruned:` viewport'ta.
- Koku kanit (kaynak): expand sadece `onMouseUp` (`BlockTool`, `session/index.tsx`
  :2019); klavye yolu yok → mouse enjeksiyonu reddedildi, collapse baypas edildi.
- Hüküm: prune marker TUI transcript'inde render ediliyor. Aşama 1 hedefi tuttu.
  TUI collapsed davranisi beklenen (10 satir esigi), bug degil.
