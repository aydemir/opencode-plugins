---
id: TASK-110
title: "Plugin: MCP tool'larını atla (bash_safe/bash_raw'a dokunma)"
status: done
priority: P1
created: 2026-09-05
updated: 2026-09-05
environment: both
labels: [plugin, mcp, skip-tools, hibrit]
depends_on: [TASK-109]
---

# TASK-110 — Plugin: MCP tool'larını atla

> **Backfill notu (2026-09-05):** Task "Kapsam — Yapılacak" bölümünde
> `mcp__opencode-mcp-bash-tools__bash_safe` prefix'i yazıyordu — **yanlış**.
> opencode tool adını `<server-name>_<tool-name>` formatında expose eder
> (`opencode-mcp-bash-tools_bash_safe`); standart MCP `mcp__server__tool`
> formatı DEĞİL. Bugünkü `DEFAULT_CONFIG.skipTools` listesi (L93-94)
> doğru formatı kullanıyor. Task'ın "Notlar" bölümündeki ikinci "Önemli"
> notu zaten doğru formatı yazmıştı — implementasyon o nota uygun. Karar:
> `tasks/decisions.md` §"Done task dosyalarını koda karşı backfill et".

## Amaç

TASK-109 ile birlikte gelen `bash_safe` + `bash_raw` MCP tool'ları
**kendi kırpma/ham kararlarını** veriyor. Plugin'in `tool.execute.after`
hook'u native tool'lara (`bash`, `read`, `grep`...) prune uygularken
bu MCP tool'larına **dokunmamalı** — aksi halde iki kırpma katmanı
üst üste biner, MCP'den gelen marker plugin tarafından yeniden
kırpılır.

**Mimari:**
- Plugin native tool'ları kırpmaya devam eder (geriye uyumluluk, opencode'un
  kendi `bash`/`read`/`grep`'ini kullanan oturumlar etkilenmez).
- Plugin, MCP server adıyla gelen tool'ları (yani `mcp__opencode-mcp-bash-tools__bash_safe`
  gibi prefixed tool adları) **atlar**.
- Plugin'in `CompactConfig.skipTools` listesine MCP tool prefix'leri
  eklenir (default), ama kullanıcı override edebilir.

## Kapsam — Yapılacak

- `plugins/opencode-context-saver.ts`:
  - `DEFAULT_CONFIG.skipTools` dizisine MCP tool adları eklendi:
    `opencode-mcp-bash-tools_bash_safe`,
    `opencode-mcp-bash-tools_bash_raw` (opencode `<server>_<tool>`
    formatı; standart `mcp__server__tool` değil — Notlardaki canlı
    test ile doğrulandı).
  - Bu listeyi açıklayan yorum satırı.
- **Skip kuralı:** Tool adı bu listede geçiyorsa `shouldPrune=false`
  ve output ham bırakılır. Plugin sadece `addLog` ile tool çağrısını
  loglar, output'a dokunmaz.
- **Disclosure güncelleme:** `DISCLOSURE_TEXT` artık MCP tool'larını
  da tanıtsın:
  ```
  [context-saver] Native bash/read/grep are auto-pruned by this plugin.
  For schema-controlled bypass, use MCP tools `bash_safe` (default) or
  `bash_raw` (full output) from the opencode-mcp-bash-tools server.
  ```
- **Test:**
  - Plugin `skipTools` listesine MCP tool eklendiğinde o tool'un
    output'una dokunmadığını doğrula.
  - Native tool hâlâ kırpılıyor (geriye uyumluluk).

## Kapsam — Yapılmayacak

- MCP tool'larına plugin tarafından ek metadata eklenmesi (örn. tool
  açıklamasını override). Plugin sadece **skip** yapar.
- Plugin'in `tool.execute.before`'da MCP tool çağrılarını
  reddetmesi veya değiştirmesi. Sadece after'da skip.
- Birden fazla MCP server desteği. Şimdilik sadece
  `opencode-mcp-bash-tools` tanınır; ileride pattern matching ile
  genişletilebilir (örn. `mcp__*__bash_*`).

## Uygulama Planı

1. ⏳ TASK-109 tamamlanır (MCP server hazır olmalı).
2. ⏳ `plugins/opencode-context-saver.ts` — `DEFAULT_CONFIG.skipTools`
   güncelle.
3. ⏳ `skipByTool` mantığı zaten var — sadece listedeki elemanları
   kontrol ediyor. Ekstra kod gerekmez.
4. ⏳ `DISCLOSURE_TEXT` güncelle.
5. ⏳ `docs/opencode-context-saver.md` — yeni "MCP entegrasyonu" bölümü.
6. ⏳ Test: opencode runtime'da hem native `bash` (kırpılır) hem
   `mcp__...__bash_safe` (kırpılır ama marker plugin'den değil MCP'den),
   hem `mcp__...__bash_raw` (ham) çağrısı yapılır.
7. ⏳ `tsc --noEmit` + manual smoke test.

## Etkilenen Dosyalar

- `plugins/opencode-context-saver.ts` — `skipTools` default + disclosure
- `docs/opencode-context-saver.md` — MCP entegrasyon bölümü
- `docs/PROJECT_MAP.md` — hibrit mimari notu
- `tasks/index.json` — bu task

## Doğrulama

- [x] Native `bash` çağrısı → plugin marker ekler.
- [x] `opencode-mcp-bash-tools_bash_safe` çağrısı → MCP marker ekler, plugin dokunmaz.
- [x] `opencode-mcp-bash-tools_bash_raw` çağrısı → marker yok (ham output).
- [x] `DISCLOSURE_TEXT` yeni metni içerir.
- [x] `npx tsc --noEmit` temiz.
- [x] Canlı opencode runtime testi başarılı.

## Notlar / Kararlar

- **Karar:** Plugin'in `skipTools` davranışı zaten `tool.execute.after`'da
  mevcut (satır 214: `skipByTool = config.skipTools.includes(t.tool)`).
  Bu görevde sadece default listeyi güncellemek + disclosure'ı
  güncellemek yeterli. Yeni kod yazımı minimum.
- **Karar:** MCP tool adı prefix'i `mcp__<server-name>__<tool-name>`
  formatında (opencode MCP standardı). Tam eşleşme kullan, glob
  pattern kullanma — daha güvenli.
- **Karar:** `DISCLOSURE_TEXT`'i tek seferlik sistem notuna eklemek
  için `experimental.chat.system.transform` zaten var (plugin
  satır 187-191). Tek değişiklik `DISCLOSURE_TEXT` sabitini güncelle.
- **Risk:** MCP server adı kullanıcının `opencode.jsonc`'sinde
  farklı tanımlanmış olabilir (örn. `bash-tools` veya `bash-mcp`).
  Dokümantasyonda **sunucu adının config'deki key ile birebir aynı
  olması gerektiği** vurgulanmalı.
- **Önemli:** opencode tool adını `<server-name>_<tool-name>` formatında
  expose eder (`opencode-mcp-bash-tools_bash_safe`); standart MCP
  `mcp__server__tool` formatı DEĞİL. `skipTools` listesi bu gerçek
  ada göre yazılmalı. 2026-09-05 canlı runtime doğrulaması ile
  kesinleşti (`/tmp/opencode/live8.err`).
- **İlişki:** Bu task TASK-109'a bağımlı (MCP server hazır olmalı).
  İkisi birlikte "plugin + MCP hibrit" mimarisini tamamlar.
