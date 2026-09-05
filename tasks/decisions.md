# Karar Günlüğü (Decisions Log)

Bu dosya mimari/yayım kararlarının kalıcı kaydıdır. AGENTS.md kural #1'e
göre yazılır. Referans formatı:

`[YYYY-MM-DD HH:MM] DECISION: <konu> -> <karar> | REASON: <gerekçe> | SUPERSEDES: <önceki karar (varsa)>`

---

## [2026-09-05] DECISION: Done task dosyalarını koda karşı backfill et
- Konu: 10 done task (TASK-101, 102, 103, 104, 105, 106, 107, 109, 110, 111)
  kapatılırken kod değişmiş ama task dosyalarındaki satır referansları /
  test sayıları / marker format iddiaları eskide kalmış.
- Karar: Her done task dosyası için **(a) `bash_raw cat` ile tam içeriği
  oku**, **(b) `codegraph_explore` + `grep` ile ilgili sembolleri kontrol
  et**, **(c) tutarsızlık varsa task dosyasını koda karşı yeniden yaz**,
  yoksa "✅ code-verified 2026-09-05" notu ekle.
- Superseed edilen karar: yok. Bu yeni bir backfill pass'i.
- Reason: AGENTS.md kural #1 "yarım iş bırakma yok" + kural #4 "doğrula,
  tahmin etme" — done task dosyası kod ile çelişiyorsa gelecekteki okuyucu
  (küçük context'li model dahil) yanlış bilgiye dayanır.
- Kapsam: `tasks/done/TASK-{101,102,103,104,105,106,107,109,110,111}-*.md`
- Atlanan: TASK-108 (yok), TASK-112+ (henüz açılmamış olabilir; sadece
  done olanları backfill ederiz).
- Durum: in-progress.

## [2026-09-05] DECISION: codegraph_explore tercih et, raw Read fallback
- Konu: Read tool bazı .md dosyalarında (muhtemelen binary karışıklığı
  veya UTF-16 BOM) kısa döndürüyor — örn. TASK-101 ilk read'de 5 satır
  göründü ama `cat -n` ve `stat` 110 satır / 4264 byte gösterdi.
- Karar: Önce `codegraph_explore` (symbol+source tek call); eğer o yoksa
  veya dosya config/md ise `opencode-mcp-bash-tools_bash_raw` ile `cat -n`.
  Plain `bash_safe cat` da kesildi — `bash_raw` tercih edilir.
- Reason: Codegraph AST parse'lı, BOM/encoding sorunlarına dayanıklı;
  bash_raw ise sadece stream.

## [2026-09-05] DECISION: opencode 1.18.29 getLegacyPlugins regression fix
- Problem: opencode 1.18.29 `getLegacyPlugins`
  (packages/opencode/src/plugin/index.ts:107) tüm modül export'larını
  iterate edip (`Object.values(mod)`) her birinin function olmasını
  bekliyor. String export'lar `TypeError("Plugin export is not a
  function")` fırlatıyor ve plugin instance'ı **hiç yüklenmiyor**.
- Canlı kanıt (`/tmp/opencode-disclosure-test/`):
  - T12: LLM "[context-saver] var mı?" sorusuna "Yok" dedi — disclosure
    hiç inject edilmiyordu.
  - Plugin'in `Object.values` çıktısı: ilk 2 export string, 3. function
    — `for (const entry of Object.values(mod))` 2. adımda throw ediyor.
  - Test 9 (minimal plugin, sadece default export): disclosure **Evet**.
- Fix uygulandı (2026-09-05):
  - `plugins/lib/disclosure.ts` — `DISCLOSURE_SENTINEL` +
    `DISCLOSURE_TEXT` taşındı.
  - `plugins/lib/raw-refill.ts` — `readRawRefill` taşındı.
  - `plugins/opencode-context-saver.ts` artık sadece `ToolCompactPlugin`
    + `default` export ediyor. `npx tsc --noEmit` temiz.
- Fix sonrası canlı doğrulama:
  - T17: 30KB native bash → LLM kaçış yolunu söyledi (`bash_raw` MCP).
  - T18: 50KB → marker içeriği LLM'e ulaştı
    `[... pruned: 10114→150 chars (98.5% saved). For raw output: ...]`.
- Açık iş: ~~`opencode-build-tracker.ts` aynı regression'a sahip~~ —
  **2026-09-05 canlı test ile çürütüldü**: build-tracker sadece
  `BuildHooksPlugin` (function) + `default` (function) export ediyor,
  string export yok. `Object.values` iterate'inde throw etmiyor,
  plugin yüklendi ve `[Build Hook] 🔨 onBuildStart` /
  `[Build Hook] ✅ onBuildSuccess` logladı
  (`/tmp/opencode-disclosure-test/t22-bt-real-build.log`,
  `t24-bt-tsc-fail.log`). "Açık iş" notu kaldırıldı.
- SUPERSEDES: yok. Bu yeni bir regression tespiti.