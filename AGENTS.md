# AGENTS.md — opencode-plugins

> OpenCode için eklenti koleksiyonu (`opencode-context-saver`,
> `opencode-build-tracker`). Bu dosya küçük context'li modeller için
> **proje navigasyon rehberi** ve **davranış kurallarıdır**.

## Memory & Decision Resolution Rules

1. Her mimari/tasarım kararı hafızaya şu formatta yazılır:
   `[YYYY-MM-DD HH:MM] DECISION: <konu> -> <karar> | REASON: <gerekçe> | SUPERSEDES: <önceki karar (varsa)>`
   Kararlar `docs/decisions.md`'ye (henüz yok; oluşturulursa buraya
   referans verilecek) veya ilgili task dosyasının "Notlar / Kararlar"
   bölümüne yazılır.

2. `bash jq '...' tasks/index.json` ile görev durumunu **tek dosya** +
   **tek tool call** ile sorgula. `jq` yoksa
   `node -p "JSON.parse(require('fs').readFileSync('tasks/index.json','utf8')).filter(t=>t.status==='todo').map(t=>t.id).join(' ')"`
   eşdeğerini kullan. CI imajı (`ubuntu-22.04`) `jq` ile gelir.

3. **Projeyi okumaya başlarken** şu sırayı izle (en hızlı → en yavaş):
   1. `index.json` (proje kökü) — repo düzeyinde özet
   2. `tasks/index.json` — görev board'u
   3. `docs/PROJECT_MAP.md` — statik navigasyon haritası
   4. `README.md` → ilgili `docs/opencode-*.md`

3a. **Kod okumak için `codegraph_explore` kullan.** `.codegraph/` dizini
   repo kökünde (henüz yoksa `codegraph init` çalıştır; ~2s, 45
   sembol). `codegraph_explore(query="<sembol isimleri>")` tek tool
   call'da: verbatim satır-numaralı kaynak + blast-radius (kim çağırıyor)
   + çağrı zincirleri. `Read`/`bash -p` filtre takılırsa codegraph'a
   geç; özellikle büyük dosya gövdesi okumalar için tercih et.

4. Statik harita: `docs/PROJECT_MAP.md` — hızlı navigasyon için ilk
   bakılacak yer (TASK-103/104 sonrası kapsamı genişletilecek).

5. Şu durumlarda haritayı güncelle (yeni bölüm ekleme, var olanı
   düzenle):
   - Yeni bir plugin/modül/görev klasörü eklendiğinde
   - Bir dosya taşındığında veya yeniden adlandırıldığında
   - Bir görev tamamlanıp mimari bir bağımlılık değiştiğinde
   - Haritadaki bir satır ile gerçek dosya sistemi çelişirse
     (harita eskimiş demektir, düzelt)

6. Güncellemeyi görevin normal akışı içinde yap; "ileride biri yapar"
   bırakma. **Yarım iş bırakılmaz.**

## Proje Kök İndeksi (`index.json`)

Proje kökündeki `index.json` dosyası **tüm repo** için tek dosyalık
özettir. Şu anki şema:

```json
{
  "name": "opencode-plugins",
  "version": "0.1.0",
  "plugins": [{ "id", "file", "docs", "tests", "status" }],
  "tasks_index": "tasks/index.json",
  "docs_root": "docs/",
  "examples": ["examples/opencode.jsonc"],
  "key_decisions": [{ "id", "date", "summary" }]
}
```

Bu dosya her task tamamlandığında güncellenir (status, key_decisions
append).

## hızlı sorgu örnekleri (jq)

```bash
# Tüm açık tasklar
jq '.[] | select(.status=="todo") | .id' tasks/index.json

# Belirli bir plugin'in docs linki
jq -r '.plugins[] | select(.id=="opencode-context-saver") | .docs' index.json

# P1 tasklar
jq '.[] | select(.priority=="P1") | {id, title}' tasks/index.json

# Bir task'ın dependencies zinciri
jq --arg id "TASK-103" '.[] | select(.id==$id) | .depends_on[]' tasks/index.json

# "no_prune" label'lı tüm tasklar
jq '.[] | select(.labels | index("no_prune"))' tasks/index.json
```

`jq` yoksa:
```bash
node -p "JSON.parse(require('fs').readFileSync('tasks/index.json','utf8')).filter(t=>t.status==='todo').map(t=>t.id+' '+t.title).join('\n')"
```

## Davranış Kuralları

1. **Yarım iş bırakma yok.** Bir task başladıysa **done** olur; "sonraki
   taska bırakılmayacak." Stub fonksiyon, TODO, imza atılıp body boş
   bırakılmaz.
2. **Geriye uyumluluk.** Plugin public API'lerinde (export edilen
   fonksiyonlar, type'lar, sabitler) kırıcı değişiklik yapılmaz. Yeni
   davranış eklenirken default'lar korunur; `markerBuilder`,
   `skipWhenContains` gibi yeni opsiyonlar **default = eski davranış**
   mantığıyla eklenir.
3. **LLM özeti yok — bilinçli karar.** Hedef kitle free/küçük context'li
   (4K–32K) modeller. LLM-özetli mod context'i şişirir, maliyet ekler,
   key zorunluluğu yaratır. Gerekçe `plugins/lib/prune.ts` dosya
   başında yazılı.
4. **Doğrula, tahmin etme.** Versiyon, API davranışı, kod durumu gibi
   konularda `tsc --noEmit`, `node` ile runtime test, veya doküman
   referansıyla teyit et. Çelişki varsa kullanıcıya bildir, kendi
   başına "çözme".
5. **Test ile bitir.** Bir task `dist/` build temiz + ilgili test
   senaryoları geçtiğinde tamamlanmış sayılır. Manual smoke test
   (`node /tmp/...mjs` ile) de kanıt olarak çıktıda gösterilir.
6. **Araç stratejisi.** Bilgiyi kullanıcıdan istemeden araçlarla topla
   (jq, node, codegraph). Geri dönüşü olmayan eylemlerden (silme/
   force-push/düzenleme) önce onay al.
7. **Sınır farkındalığı.** OpenCode plugin API'sinin tam sözleşmesi
   belirsiz; bilgi kesin değilse "tried-and-true" veya "best-effort"
   olarak işaretle.

## Hızlı Başlangıç

```bash
# Projeyi tara (3 tool call, <5 saniye)
cat index.json
jq '.[] | select(.status=="in-progress")' tasks/index.json
ls plugins/ plugins/lib/

# Build + test
npm test 2>/dev/null || npx tsc --noEmit
node /tmp/<test>.mjs  # manual smoke

# LLM bilgilendirmesi (marker formatı)
jq '.marker_format // empty' docs/opencode-context-saver.md
```
## [2026-09-05] DECISION: Termux ghost text fix via alternate-screen
- Issue: #47255 (upstream anomalyco/opencode)
- Problem: Termux TUI leaves ghost chars when lines shrink (main-screen diff renderer)
- Fix: Change screenMode from "main-screen" to "alternate-screen" in runtime.lifecycle.ts:100
- Patch: /root/opencode-fork2/termux-ghost-fix.patch
- Docs: /root/opencode-fork2/TERMUX_GHOST_FIX.md
- Status: Fork ready at /root/opencode-fork2, PR pending upstream decision
- REASON: alternate-screen uses DECSET 1049 buffer swap, eliminates line-diff artifacts
- SUPERSEDES: none

## [2026-09-05] DECISION: Read tool silent truncation fix via observability plugin
- Problem: OpenCode native `read` tool silently truncates at offset/limit boundary with no "more lines" notice. Small-context models (4K-32K) assume full read and make decisions on partial content.
- Fix: New plugin `opencode-truncation-noticer` (`tn`) hooks `tool.execute.after`, parses `<lineNo>\t<line>` format, compares last line number to total lines in file (fs.readFileSync), appends `[tn] truncated: X more lines after line N (of T total). Re-read with offset=N+1 limit=200, OR use bash_raw: sed -n 'N+1,Tp' <path>` marker when truncated.
- Plugin: plugins/opencode-truncation-noticer.ts
- Lib: plugins/lib/truncation-notice.ts (sabitler + helper'lar)
- Docs: docs/opencode-truncation-noticer.md
- Task: TASK-111
- Status: **stable** — 14/14 unit tests, 6/6 smoke test, **5/5 opencode 1.18.29 runtime simulation** (`/tmp/opencode/test_runtime_simulation.mjs`).
- **Kök neden keşfi (2026-09-05):** opencode 1.18.29 `getLegacyPlugins` (packages/opencode/src/plugin/index.ts:107) tüm modül export'larını iterate edip function olmasını bekliyor → string export'lar "Plugin export is not a function" hatası veriyor. **Mevcut context-saver, build-tracker da aynı regression'a sahip** — onlar da ayrı bir görevde düzeltilmeli.
- REASON: hook imzası (input, output) verilen `output.output: string`'i mutate etmemize izin veriyor (opencode-context-saver zaten kullanıyor); native read tool'un output format'ı biliniyor; observer + annotator pattern tek sorumluluk; lib'de helper'lar + plugin dosyasında sadece default export → opencode 1.18.29 iterate kuralıyla uyumlu.
- SUPERSEDES: none
