---
id: TASK-111
title: "Plugin: Read tool truncation notice (dosyanın devamı varsa bildir)"
status: in-progress
priority: P1
created: 2026-09-05
updated: 2026-09-05
environment: both
labels: [plugin, read-tool, truncation, mcp-bypass, ux, small-context]
depends_on: [TASK-109, TASK-110]
---

# TASK-111 — Plugin: Read tool truncation notice

## Amaç

OpenCode native `read` tool'u `tool.execute.after` hook'unda
**sessizce** kırpıyor: dosyanın daha fazla içeriği olmasına rağmen
offset/limit'in sonuna gelindiğinde "devamı var" işareti bırakmadan
kesiyor. Bu, küçük context'li modeller için en tehlikeli tool bug'ı:

- Model "dosyayı okudum" sanıp karar veriyor.
- Yarım içerik üzerinden hatalı çıkarım.
- LLM'e ham okuma seçeneği de bildirilmediği için dönüş yolu yok.

**Hedef:** Yeni plugin `opencode-truncation-noticer` (`tn`):

1. `tool.execute.after`'da tool adı `read` ise çıktıyı parse et
   (`<n>\t<line>` formatı).
2. `args.filePath` + `args.offset` + `args.limit` bilgisiyle dosyanın
   **toplam satır sayısını** hesapla (`fs.readFileSync`).
3. Son satır numarası toplamdan küçükse → çıktıya marker ekle:
   `[tn] truncated: X more lines. Re-read with offset=N+1 limit=...`
4. Tool adı `read` değilse veya dosya tamamen okunmuşsa → dokunma.
5. Dosya mevcut değilse veya okunamıyorsa → sessizce geç (hata fırlatma).

**Marker formatı:**

```
[tn] truncated at line 120 of 116 total — wait, that's impossible.
[tn] truncated: X more lines after line N. Re-read with offset=N+1
     (filePath=..., limit=200). Or use MCP bash_raw:
     cat <filePath> | sed -n 'N,$p'
```

**Kapsam dışı (out-of-scope):**

- `read` tool'unun kendi satır/limit davranışını override etmek.
  Opencode tool override API'si belirsiz; bu plugin sadece
  **observer + annotator**.
- `bash_safe`'e marker eklemek (zaten var, TASK-109).
- `grep`/`glob` çıktılarına müdahale.
- Dosya binary ise veya parse edilemiyorsa skip.

## Uygulama Planı

1. `plugins/opencode-truncation-noticer.ts` yaz:
   - `output.output`'u parse et: `^(\d+)\t` başlangıçlı satırlar.
   - `codePointLength` ile satır sayısı tutarlıysa parse başarılı.
   - `fs.readFileSync(filePath, "utf8")` → `\n`.length + 1 = toplam satır.
   - Son satır no'sunu `<lastLineNo>` çıkar.
   - Eğer `lastLineNo < totalLines` ise marker ekle.
   - `output.output += "\n\n" + MARKER`.
2. `package.json` `exports` + `keywords` güncelle.
3. `examples/opencode.jsonc` `plugin` dizisine ekle.
4. `docs/opencode-truncation-noticer.md` — kısa dokümantasyon.
5. `index.json` `plugins` listesine append + `key_decisions`.
6. `docs/PROJECT_MAP.md` — yeni plugin bölümü.
7. `tsc --noEmit` + manual smoke test + opencode runtime canlı test.

## Etkilenen Dosyalar

- `plugins/opencode-truncation-noticer.ts` — yeni plugin
- `package.json` — exports, keywords
- `examples/opencode.jsonc` — plugin list
- `docs/opencode-truncation-noticer.md` — yeni dok
- `docs/PROJECT_MAP.md` — plugin haritası
- `index.json` — plugin index
- `tasks/index.json` — bu task

## Doğrulama

- [x] Unit test: parser 3 satırlık fake output'tan doğru `lastLineNo` çıkarır. (14/14 ✔)
- [x] Manual: `Read` 116 satırlık dosyada offset=4 limit=4 → marker görünür. (smoke test 6/6 ✔)
- [x] Manual: tam dosya (limit yeterli) → marker yok.
- [x] Manual: olmayan dosya → sessizce geçer, hata yok.
- [x] `npx tsc --noEmit` temiz.
- [x] Plugin modülü `node` runtime'da düzgün yükleniyor (default=function, Hooks objesi döner).
- [x] **opencode 1.18.29 binary runtime simulation:** `/tmp/opencode/test_runtime_simulation.mjs` opencode'un `getLegacyPlugins` mantığını birebir uygular. Plugin modülü `Object.values(mod).filter(isFunction)` iterate'ini geçti ("Plugin export is not a function" hatası YOK). Hook'lar çözüldü, simüle edilmiş read event'inde marker eklendi, full read'de marker yok, system disclosure idempotent enjekte edildi. **5/5 ✔**
- [x] Disclosure: `experimental.chat.system.transform` ile idempotent disclosure enjekte eder.
- [x] Live `opencode run` testi (sadece tn plugin yüklü): plugin error YOK, sadece openrouter kredi hatası var. Plugin **runtime'da yükleniyor**.

## Notlar / Kararlar (güncellendi)

- **Kök neden (2026-09-05):** opencode 1.18.29 `getLegacyPlugins`
  (packages/opencode/src/plugin/index.ts:107) tüm modül export'larını
  iterate edip (`Object.values(mod)`) her birinin function olmasını
  bekliyor. String/object export'lar `TypeError("Plugin export is
  not a function")` fırlatıyor. **Mevcut context-saver, build-tracker
  da aynı hatayı alıyordu** — çünkü `DISCLOSURE_SENTINEL`,
  `DISCLOSURE_TEXT` gibi string export'ları vardı.

- **Çözüm:** Sabitleri ve helper'ları `plugins/lib/truncation-notice.ts`'ye
  taşıdık. Plugin dosyası sadece `default` (Plugin instance) export
  ediyor. Testler de doğrudan lib'den import ediyor.

- **Yan etki:** opencode 1.18.29 için TÜM pluginler aynı hatayı
  alıyor — bu upstream regression'ı TASK-111 kapsamı dışı, ayrı
  bir görevde context-saver ve build-tracker'a da uygulanmalı.

- **Yapı:**
  ```
  plugins/lib/truncation-notice.ts   ← sabitler + helper'lar
  plugins/opencode-truncation-noticer.ts   ← sadece Plugin + default
  tests/truncation-noticer.test.mjs   ← lib'den import
  ```

## Notlar / Kararlar

- **Karar (2026-09-05):** Bugün yaşanan hata — `read` tool 116 satırlık
  task dosyasını `limit` parametresi olmadan çağrıldığında sadece ilk
  3 satırı döndürdü, kalan 113 satır hakkında uyarı yok. Bu sessiz
  truncation, MCP `bash_safe`'in yaptığı "marker'lı" truncation'dan
  çok daha tehlikeli — çünkü model truncation'ın farkında değil.
- **Karar:** Yeni plugin yap, context-saver'a dokunma. Tek sorumluluk.
- **Karar:** Read tool çıktısının `<n>\t<line>` formatı varsayımı
  opencode runtime'ın gözlemlenen davranışı (TASK-110 doğrulamasında
  da görüldü). Eğer format değişirse plugin no-op olur (güvenli).
- **Karar:** `fs.readFileSync` ile dosyayı **ikinci kez** okumak
  pahalı görünebilir ama okuma session başına bir kez değil, **read
  tool çağrısı başına bir kez** olur ve çoğu durumda zaten
  context-saver'ın `tool.execute.after`'ı da dosyaya erişiyor.
  Performans kabul edilebilir (max bir `fs.statSync` cache'lenebilir).
- **Karar:** Marker'ı çıktının **sonuna** ekle. Başa eklemek mevcut
  satır numaralarını bozabilir (`<n>\t` pattern bozulur).
- **Karar:** Plugin adı `opencode-truncation-noticer` ve kısa adı `tn`.
  Hem okunabilir hem LLM'in sistem mesajında kısa tanıtılabilir.
- **İlişki:** TASK-109 (MCP bash_safe bash_raw) + TASK-110 (plugin
  MCP tool skip) ile birlikte "kırpma gözlemlenebilir ve gözlemlenemez
  araçları ayırt etme" tam mimarisini kurar: bash_safe marker'lı,
  bash_raw ham, native read artık marker'lı.
- **Risk:** Opencode `read` tool'unun output formatı runtime sürümüne
  göre değişirse plugin no-op olur. Canlı runtime testi ile teyit
  edilecek. Eğer format değişirse `metadata` alanından daha güvenilir
  bilgi çıkarılabilir.