---
id: TASK-109
title: "MCP server: bash_safe + bash_raw (schema kontrollü bypass)"
status: done
priority: P1
created: 2026-09-05
updated: 2026-09-05
environment: both
labels: [mcp, bash, schema-control, real-bypass]
depends_on: []
---

# TASK-109 — MCP server: bash_safe + bash_raw

## Amaç

Plugin-only yaklaşımda LLM'e bildirilen 5 kaçış yolundan (`no_prune=true`,
`disableForCalls=N`, `embed #no-prune`, `alwaysRawCommands`, `enabled:false`)
yalnızca **3 tanesi gerçekten çalışıyor** (string embed + 2 config-level).
`no_prune=true` ve `disableForCalls=N` per-call argümanları **ölü** çünkü
opencode'un native tool schema'ları (`bash`, `read`, `grep`...) bu alanları
kabul etmiyor — plugin `t.args`'a baksa bile opencode bunları ya reddeder
ya sessizce yok sayar.

**Kanıt:** 2026-09-05 canlı testler (`/tmp/run6.out`, `/tmp/run7.out`,
`/tmp/run8.out`):
- Model `no_prune=true` önerdi (disclosure çalışıyor) → bash tool schema
  bunu kabul etmedi → davranış değişmedi.
- Model `#no-prune` substring'i komut içine gömdü → plugin bunu
  `shouldSkipForArgs` ile yakaladı (çalışır) ama output küçük
  (`compressThreshold=500` altı) olduğu için zaten prune yoktu.
- 60000 char'lık büyük bir output tetiklendiğinde model "guardrail" ile
  reddetti (`I'm not able to run that command`).

**Çözüm:** Per-call bypass'ı **schema-kontrollü** hale getirmek için
yeni bir MCP server tanımla. LLM `bash_safe` (default kırpılır) veya
`bash_raw` (no limit) tool'unu **doğrudan seçer**. Schema tamamen
bizim kontrolümüzde olduğu için `max_chars`, `head_chars`, `tail_chars`
gibi gerçek argümanlar çalışır.

## Kapsam — Yapılacak

- **Yeni MCP server:** `plugins/mcp-bash-tools/` dizininde
  `@opencode-plugins/mcp-bash-tools` package'i.
- **Tools:**
  - `bash_safe` — middle-prune + marker (default). Argümanlar:
    `command` (required), `description`, `max_chars?` (default 30000),
    `head_chars?` (200), `tail_chars?` (200), `timeout_ms?` (30000).
  - `bash_raw` — full output. Argümanlar: `command` (required),
    `description`, `max_chars?` (500000, sadece dosya koruma),
    `timeout_ms?` (30000).
- **Prune mantığı:** Mevcut `plugins/lib/prune.ts`'deki `pruneMiddle`
  fonksiyonunu **import** edip yeniden kullan. Marker formatı tutarlı
  olsun (TASK-101 formatı: `[... pruned: N→M chars (X% saved) ...]`).
- **Marker'da escape hint:** `bash_safe` kırptığında marker içinde
  şu geçsin: `For raw output, call bash_raw with the same command.`
  Bu sayede LLM marker'ı görünce ne yapacağını **bilir** (schema var,
  çalışır).
- **Hata yönetimi:** opencode bash tool'uyla aynı format — exit code,
  stderr özeti, `extractErrors` entegrasyonu.
- **Build & register:**
  - `tsc --noEmit` temiz.
  - `dist/plugins/mcp-bash-tools/` build edilir.
  - `opencode.jsonc`'ye MCP entry eklenir (kullanıcı onayıyla).
- **Test:**
  - `plugins/mcp-bash-tools` doğrudan stdio ile çalıştırılıp `bash_safe`
    çağrısı yapılır; marker görünür.
  - `bash_raw` ile aynı komut → marker yok, ham output.
  - opencode runtime'a yükleyip canlı tool çağrısı yapılır.

## Kapsam — Yapılmayacak (out-of-scope)

- `read`/`grep` için MCP versiyonları (TASK-110 sonrası değerlendirilir).
- `bash_status` (error özetleyici MCP tool'u) — plugin'in
  `extractErrors` mantığı zaten yeterli.
- SSE/HTTP transport — sadece stdio (opencode MCP standardı).
- Auth — local-only, kullanıcının kendi makinesinde çalışır.

## Uygulama Planı

1. ✅ Tasarım (bu task dosyası).
2. ⏳ `mcp-bash-tools/` dizini + `package.json` + `tsconfig.json`.
3. ⏳ `mcp-bash-tools/src/server.ts` — MCP stdio server, 2 tool.
4. ⏳ `mcp-bash-tools/src/tools/bash_safe.ts` + `bash_raw.ts`.
5. ⏳ `mcp-bash-tools/src/exec.ts` — `child_process.exec` wrapper,
   `extractErrors` import.
6. ⏳ Test: stdio üzerinden `bash_safe` + `bash_raw` smoke.
7. ⏳ `tsc` build (`dist/mcp-bash-tools/server.js`).
8. ⏳ `opencode.jsonc`'ye MCP kaydı (kullanıcı onayı alınır).
9. ⏳ Canlı opencode testi (`opencode run` ile gerçek tool çağrısı).
10. ⏳ TASK-110 (plugin MCP tool'larını atlasın) ile koordinasyon.

## Etkilenen Dosyalar

- **Yeni:** `plugins/mcp-bash-tools/package.json`
- **Yeni:** `plugins/mcp-bash-tools/tsconfig.json`
- **Yeni:** `plugins/mcp-bash-tools/src/server.ts`
- **Yeni:** `plugins/mcp-bash-tools/src/tools/bash_safe.ts`
- **Yeni:** `plugins/mcp-bash-tools/src/tools/bash_raw.ts`
- **Yeni:** `plugins/mcp-bash-tools/src/exec.ts`
- **Yeni:** `plugins/mcp-bash-tools/README.md`
- **Değişen:** `package.json` (root) — workspace `mcp-bash-tools` eklenir.
- **Değişen:** `opencode.jsonc` (kullanıcı onayıyla) — MCP entry.
- **Değişen:** `docs/opencode-context-saver.md` — MCP server bölümü.
- **Değişen:** `docs/PROJECT_MAP.md` — yeni bölüm.
- **Değişen:** `index.json` — yeni plugin/MCP entry.
- **Değişen:** `tasks/index.json` — bu task + TASK-110.

## Doğrulama

- [x] Manuel stdio smoke test (bash_safe büyük output → marker var).
- [x] bash_raw aynı komut → ham output (marker yok).
- [x] `npx tsc --noEmit` temiz (root + mcp-bash-tools).
- [x] `dist/plugins/mcp-bash-tools/src/server.js` üretildi.
- [x] opencode runtime'da MCP server kayıtlı (`opencode mcp list` → connected).
- [x] Canlı `opencode run` prompt ile `bash_safe` + `bash_raw`
      çağrısı yapılıp davranış doğrulanır (`/tmp/opencode/live8.err`,
      `/tmp/opencode/live10.err`).
- [x] `index.json` + `tasks/index.json` + `PROJECT_MAP.md` güncel.
- [x] Bu task `tasks/done/`'a taşınır.

## Notlar / Kararlar

- **Karar:** MCP üzerinden sun, mevcut plugin'e dokunma (TASK-110
  plugin'in MCP tool'larını atlamasını ekleyecek, bağımsız task).
  Sebep: iki sorunu ayrı izole edip geriye uyumluluğu korumak.
  Plugin tek başına da çalışır; MCP server bağımsız çalışır; birlikte
  çalıştıklarında plugin MCP tool'larına dokunmaz.
- **Karar:** Sadece stdio transport. opencode MCP standardı bu; SSE/HTTP
  eklemek şimdi gereksiz karmaşıklık.
- **Karar:** `bash_raw` `max_chars` default'u 500000 (sadece dosya
  koruma, gerçek kırpma yok). Bunun üstünde bile kırpma olmaz — sınır
  dışı output context'i gerçekten şişirir ama LLM'in bilinçli tercihi.
- **Karar:** Marker formatı TASK-101'le uyumlu. `escapeHint` alanına
  `For raw output, call bash_raw with the same command.` yazılır.
- **Risk:** opencode MCP server kaydında plugin'in yüklenmesi gibi
  bir restart gerekip gerekmediği belirsiz. Canlı test ile netleşir.
- **Risk:** opencode MCP server stdout protokolü farklı sürümlerde
  değişmiş olabilir. Stabil sürüm hedef: 1.18.x (kullanıcı runtime'ı).

## Gerçekleşme Kanıtları (2026-09-05 canlı test)

- **stdio smoke:** `/tmp/opencode/mcp_call.txt` — `bash_safe` 1692→100
  chars'a kırptı, marker `[... pruned: 1692→100 chars (94.1% saved). For
  raw output, call bash_raw with the same command. ...]` döndü.
  `bash_raw` 30 satırı ham verdi.
- **`opencode mcp list`:** `/tmp/opencode/mcp_list6.out` —
  `opencode-mcp-bash-tools ✓ connected` görünüyor.
- **opencode run canlı çağrı:** `/tmp/opencode/live8.err` —
  `⚙ opencode-mcp-bash-tools_bash_safe {"command":"seq 1 600",
  "max_chars":300,"head_chars":80,"tail_chars":80}` model tarafından
  üretildi, plugin log'da 1 çağrı 0 hata.
- **bash_raw canlı:** `/tmp/opencode/live10.err` — model `bash_raw`'ı
  doğru schema ile çağırdı, ham output döndü.
- **Yapılan hata düzeltmeleri:**
  1. İlk implementasyonda `process.stdout.write` + `process.stdin`'in
     `on('data')` yerine tüm stdin'i `read()` ile bloklaması → opencode
     spawn ettiği process yanıt vermedi. Streaming dispatch + sync fd
     write (`fs.writeSync(1, ...)`) ile çözüldü.
  2. Root `tsc` çıktısı `dist/plugins/mcp-bash-tools/src/server.js`
     (sub-project tsconfig'in `rootDir: src` set etmesinden dolayı
     `src/` klasörü de path'e eklendi). opencode.jsonc path'i buna
     göre güncellendi.
  3. opencode tool adını `<server>_<tool>` olarak expose ediyor,
     standart `mcp__server__tool` değil. Plugin'in `skipTools` listesi
     buna göre düzeltildi (TASK-110).
