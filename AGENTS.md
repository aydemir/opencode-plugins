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

## Canlı Test (opencode runtime)

Plugin/MCP davranışı **runtime'da farklı olabilir** — kod testleri
`node:test` ile çalışır ama opencode plugin loader + tool dispatch
+ LLM roundtrip sadece canlı `opencode run` ile doğrulanır. Aşağıdaki
prosedür 2026-09-05 disclosure regression tespitinde keşfedildi
(`/tmp/opencode-disclosure-test/`), tekrarlanabilir olması için
burada kilitlendi.

### Hazırlık

```bash
# 1. Mevcut config yedekle (plugin listesi değişecek)
cp ~/.config/opencode/opencode.jsonc ~/.config/opencode/opencode.jsonc.bak

# 2. Test artifact dizini
mkdir -p /tmp/opencode-live-test && cd /tmp/opencode-live-test

# 3. opencode versiyonu (regression'lar sürüm-bağımlı)
opencode --version
```

### Tek-Plugin İzolasyon Testi

Bir plugin'in davranışını **yalnız** görmek istediğinde config'i
geçici olarak değiştir:

```bash
# node -e ile plugin listesini sıfırla + izole plugin ekle
node -e "
const cfg = JSON.parse(require('fs').readFileSync(
  '$HOME/.config/opencode/opencode.jsonc','utf8'));
cfg.plugin = ['/root/opencode-plugins/plugins/<plugin>.ts'];
require('fs').writeFileSync(
  '$HOME/.config/opencode/opencode.jsonc',
  JSON.stringify(cfg, null, 2));
"
```

Önemli: opencode plugin'i `.ts` yoluyla import eder; **önce
`npx tsc` çalıştır ki dist güncel olsun** (yoksa plugin eski
dist'ten yüklenebilir).

### LLM'e Disclosure/Bilgi Ulaşıyor mu?

```bash
# 4. LLM'in sistem prompt'unda bir marker var mı?
timeout 120 opencode run --log-level INFO \
  "Sistem prompt'unda '<sentinel-string>' geçiyor mu? Varsa kısa özetini ver. Tool çağırma." \
  2>&1 | tee /tmp/opencode-live-test/01-disclosure.log | tail -10

# 5. LLM kaçış yolunu biliyor mu?
timeout 120 opencode run --log-level INFO \
  "Bir bash komutu çıktısı çok uzun olabilir. Ham (tam) çıktıyı nasıl alırsın? Tool çağırma, sadece yöntem listele." \
  2>&1 | tee /tmp/opencode-live-test/02-escape-knowledge.log | tail -10
```

**Beklenen:** LLM disclosure metninden gelen tool isimlerini +
yöntemleri söyler. **Yoksa** plugin yüklenmemiştir — aşağıdaki
"Plugin Yükleme Smell Testi"ne geç.

### Plugin Yükleme Smell Testi (kritik)

opencode 1.18.29 `getLegacyPlugins` (packages/opencode/src/plugin/
index.ts:107) `Object.values(mod)` iterate eder ve **her export'un
function olmasını bekler**. String export'lar `TypeError("Plugin
export is not a function")` fırlatır, plugin **sessizce yüklenmez**
ve tüm hook'lar (disclosure + tool.execute.after + ...) kaybolur.

```bash
# 6. Plugin modülünün export sırasını kontrol et
cat > /tmp/opencode-live-test/check-exports.mjs <<'EOF'
const m = await import('/root/opencode-plugins/plugins/<plugin>.ts')
console.log("keys:", JSON.stringify(Object.keys(m)))
console.log("types:", JSON.stringify(Object.values(m).map(v => typeof v)))
EOF
npx tsx /tmp/opencode-live-test/check-exports.mjs

# 7. opencode loader mantığını birebir simüle et
cat > /tmp/opencode-live-test/simulate-load.mjs <<'EOF'
function getServerPlugin(entry) {
  return typeof entry === "function" ? entry : null
}
const mod = await import('/root/opencode-plugins/plugins/<plugin>.ts')
const loaded = []
try {
  for (const entry of Object.values(mod)) {
    const plugin = getServerPlugin(entry)
    if (!plugin) throw new TypeError("Plugin export is not a function")
    loaded.push("OK:" + (plugin.name || "(anon)"))
  }
} catch (e) {
  console.log("Threw:", e.message)
}
console.log("Loaded:", JSON.stringify(loaded))
EOF
npx tsx /tmp/opencode-live-test/simulate-load.mjs
```

**Beklenen:** `Loaded: ["OK:PluginFn","OK:PluginFn"]` — `Threw: null`.
**Eğer `Threw: Plugin export is not a function`** → modülde string
export var, plugin yüklenmiyor. **Fix:** sabitleri ve helper'ları
`plugins/lib/*.ts` dosyalarına taşı, plugin dosyası sadece function
export etsin. Örnek: `plugins/lib/disclosure.ts`,
`plugins/lib/raw-refill.ts` (TASK-107 backfill, 2026-09-05).

### Marker İçeriği LLM'e Ulaşıyor mu?

```bash
# 8. Büyük çıktı tetikleyerek prune marker'ını incele
timeout 180 opencode run --log-level INFO \
  "Native bash tool kullan. 'seq 1 3000 | head -c 50000' çalıştır. Çıktıyı özetle: hangi sayılar görünüyor?" \
  2>&1 | tee /tmp/opencode-live-test/03-marker-content.log | tail -20

# Marker'da 'For raw output:' + 'no_prune/noPrune/skipPrune' geçmeli:
grep -E 'pruned:.*saved|raw output|no_prune' \
  /tmp/opencode-live-test/03-marker-content.log
```

**Beklenen:** `[... pruned: N→M chars (X% saved). For raw output: ...]`
çıktıda görünür. **Yoksa** plugin'in `tool.execute.after` hook'u
fire etmiyor → plugin hiç yüklenmemiş demektir (yukarıdaki smell
testine dön).

### Temizlik

```bash
# Test bitti → config'i geri al
mv ~/.config/opencode/opencode.jsonc.bak \
   ~/.config/opencode/opencode.jsonc
```

### Bilinen Tuzaklar

1. **LLM halüsinasyonu**: LLM "Hayır" diyebilir ama metin alıntısı
   doğru olabilir. Şüphede alıntıyı kontrol et.
2. **timeout 120s**: opencode startup ~2.5s, plugin yükleme ~15s
   (tsc), LLM roundtrip 20-90s. 120s alt sınır; daha uzun
   görevler için 180-240s.
3. **`bash_safe`/`bash_raw` MCP** disclosure testini kirletir: LLM
   bu tool'ları MCP description'dan öğrenir, context-saver
   disclosure'ından değil. Native tool'lara sor.
4. **".output truncated"** mesajı opencode native bash'in kendi
   mesajıdır (plugin'in değil). Plugin prune marker'ı ayrıdır
   (`[... pruned: ...]`).

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

## [2026-09-05] DECISION: opencode 1.18.29 getLegacyPlugins regression fix
- Problem: opencode 1.18.29 `getLegacyPlugins` (packages/opencode/src/plugin/index.ts:107) tüm modül export'larını iterate edip (`Object.values(mod)`) her birinin function olmasını bekliyor. String export'lar `TypeError("Plugin export is not a function")` fırlatıyor ve plugin instance'ı **hiç yüklenmiyor** — tüm hook'lar (disclosure + tool.execute.after + ...) sessizce kaybolur.
- Canlı kanıt (2026-09-05, `/tmp/opencode-disclosure-test/`):
  - Test 12: LLM "[context-saver] var mı?" sorusuna "Yok" dedi — disclosure hiç inject edilmiyordu.
  - Plugin modülü `Object.keys`: `["DISCLOSURE_SENTINEL","DISCLOSURE_TEXT","ToolCompactPlugin","default","readRawRefill"]` — ilk 2 string, 3. function. `for (... of Object.values(mod))` 2. adımda throw.
  - Test 9 (minimal plugin, sadece `default` export): disclosure "Evet" — minimal plugin yüklenebiliyor, sorun modüldeki string export'larda.
- Fix uygulandı (2026-09-05):
  - `plugins/lib/disclosure.ts` — `DISCLOSURE_SENTINEL` + `DISCLOSURE_TEXT` taşındı.
  - `plugins/lib/raw-refill.ts` — `readRawRefill` taşındı.
  - `plugins/opencode-context-saver.ts` artık sadece `ToolCompactPlugin` + `default` export ediyor. `npx tsc --noEmit` temiz.
- Fix sonrası canlı doğrulama:
  - Test 17: 30KB native bash → LLM "Tam çıktı için `bash_raw` (MCP) ya da dosyaya yazıp `Read` gerekir" dedi.
  - Test 18: 50KB → marker içeriği LLM'e ulaştı `[... pruned: 10114→150 chars (98.5% saved). For raw output: no_prune/noPrune/skipPrune (this call)...]`.
- **Açık iş:** ~~`opencode-build-tracker.ts` aynı regression'a sahip~~ — **2026-09-05 canlı test ile çürütüldü**: build-tracker sadece `BuildHooksPlugin` (function) + `default` (function) export ediyor, string export yok. `Object.values` iterate'inde throw etmiyor, plugin yüklendi ve `[Build Hook] 🔨 onBuildStart` / `[Build Hook] ✅ onBuildSuccess` logladı (`/tmp/opencode-disclosure-test/t22-bt-real-build.log`, `t24-bt-tsc-fail.log`). AGENTS.md'deki "Açık iş" notu kaldırıldı.
- REASON: opencode iterate kuralı tek-tek export kontrolü yapıyor; helper'lar + sabitler lib'e taşınırsa plugin dosyası sadece function export eder ve iterate temiz kalır. Test/derleme setup'ı bozulmaz (TSM'ler sadece .ts import eder).
- SUPERSEDES: none
- İlgili: yukarıdaki "Canlı Test (opencode runtime)" bölümü — Smell Test + Disclosure Test prosedürü.

## [2026-09-05] P3 FINDING: build-tracker stderr görünürlüğü
- Test (`/tmp/opencode-disclosure-test/t24-bt-tsc-fail.log`): tsc
  `error TS2304` stderr'a yazdı ama `tool.execute.after`'a gelen
  `output.output` sadece stdout içerdi. `BUILD_ERROR_PATTERNS` regex'i
  (`/^\s*error TS\d+/m`) output'ta eşleşmedi → `hasError=false` →
  `endSession("success")` çağrıldı → `[Build Hook] ✅ onBuildSuccess`
  loglandı (gerçekte başarısız derleme olmasına rağmen).
- Kök neden: opencode native bash tool stderr'i `output.output`'a
  koymuyor (ayrı kanal). Plugin'in başarı tespiti için stderr'a
  erişmesi gerekir.
- P3 (düşük öncelik) çünkü: terminal'de `[Build Hook] ✅ ...` görünüp
  arkasından `fail.ts(1,19): error TS2304` çıktısı geliyor, kullanıcı
  hatayı zaten okuyor. Bildirimsel UX kaybı var ama doğruluk kaybı yok.
- İleride: opencode plugin API'si stderr'a erişim veriyorsa
  (metadata veya ayrı hook) plugin `output.metadata` veya native
  tool'un stderr field'ını okumalı.
