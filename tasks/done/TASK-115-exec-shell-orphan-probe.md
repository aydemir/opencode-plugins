---
id: TASK-115
title: "exec timeout orphan probe — /bin/bash şartı + regresyon bekçisi"
status: done
priority: P2
created: 2026-09-06
updated: 2026-09-06
environment: both
labels: [mcp-bash-tools, exec, live-test, timeout, runtime-first]
depends_on: [TASK-109, TASK-110]
---

# TASK-115 — exec timeout orphan probe (/bin/bash şartı + regresyon bekçisi)

## Amaç

`bash_raw` timeout tartışmasından çıkan soru: Node `exec({timeout})`
Promise'i reddediyor, ama altındaki OS process'i gerçekten ölüyor mu?
("Promise reject oldu" != "process öldü".) Kanca (`tool.execute.after`)
timeout yerine geçemez — handler dönmeden fire etmez. Eksik halka:
timeout'un **OS seviyesinde gerçekten öldürdüğünün** canlı kanıtı ve
`exec.ts`'teki `shell: "/bin/bash"` seçiminin gerekçesi.

## Kapsam

- Yapılacaklar
  - İzole probe (`/tmp`, repo'ya dokunmadan): normal / sigterm-ignore /
    detached-orphan senaryoları + `ps` doğrulaması + kalıntı temizliği.
  - Shell diferansiyeli: aynı komut `/bin/sh` vs `/bin/bash` ile.
  - Gerçek `exec.ts runBash` katmanı testi (salt import, değişiklik yok).
  - Bulgu yorumu `exec.ts:39-44`'e + regresyon bekçisi `scripts/` altına.
  - Keşif branch'i (`test/timeout-kill-probe`) silinip main'e dönüş.
- Yapılmayacaklar (out-of-scope)
  - `killSignal: SIGKILL` / process-group kill değişikliği — kanıt
    gerektirmedi (basit-child vakası bash ile temiz). Ayrı görev ister.
  - `timeout_ms=0` (sınırsız opt-in) / raw default büyütme — karar bekliyor,
    bu görevde uygulanmadı.
  - `index.json` kök özet güncellemesi — task board girişi yeterli.

## Uygulama Planı

1. Ayrı branch aç (`test/timeout-kill-probe`), repo temizliği korunur.
2. Probe script'i `/tmp/opencode-timeout-probe/` altına (3 senaryo + ps + temizlik).
3. Koşum 1-3: shell katmanı kanıtı; Koşum 4: `runBash` katmanı + guard script'i.
4. `exec.ts` yorumu + `scripts/timeout-kill-probe/` bekçisi, `tsc` + guard PASS.
5. Branch sil, main'e dön; task dosyası + `tasks/index.json` girişi.

## Etkilenen Dosyalar

- `plugins/mcp-bash-tools/src/exec.ts` (yorum satırı, davranış değişikliği yok)
- `scripts/timeout-kill-probe/timeout-kill-probe.mjs` (yeni, regresyon bekçisi)
- `tasks/done/TASK-115-exec-shell-orphan-probe.md` (bu dosya)
- `tasks/index.json` (board girişi)

## Doğrulama

- [x] 3 shell senaryosu + ps kanıtı (Koşum 1-2)
- [x] sh-vs-bash diferansiyeli (Koşum 3)
- [x] Gerçek `runBash` katmanı temizliği (Koşum 4)
- [x] `npx tsc --noEmit` temiz (yorum-only değişiklik)
- [x] Guard script PASS + self-clean (`NO_PROBE_LEFTOVER`, `NO_SLEEP_LEFTOVER`)
- [x] Keşif branch'i silindi, main temiz (sadece bu görevin dosyaları)

## Notlar / Kararlar

- `[2026-09-06] DECISION: shell /bin/bash şartı korunur -> REASON: timeout'ta
  dash sadece shell'i öldürüp torunu orphan bırakıyor (PPID 1); bash torunu da
  temizliyor. Kanıt: aynı komutta sh→ORPHAN 2/2, bash→TEMİZ 2/2 (Koşum 3).
  exec.ts yorumu kodla birebir eşleşir. SUPERSEDES: none`
- Marker-only `ps` grep'i yetersiz: `sigterm-ignore` ve `detached-orphan`
  marker'da temiz görünüp `sleep 30` orphan bırakıyor (PPID 1). Guard script
  bu yüzden `sleep 30` kalıntısını ayrıca kontrol edip temizliyor.
- `nohup … & disown` timeout'a hiç yakalanmaz (shell ~300ms'de 0 döner) —
  by-design, fix yok; tool komutlarında `&`/`nohup` kullanılmaz (dokümantasyon
  notu yeterli).
- Kanca-timeout ayrımı: `tool.execute.after` (context-saver/tn) ve
  deepseek-harness `tools/post-execute` handler döndükten sonra çalışır;
  asılı process'te ikisi de fire etmez. Timeout producer-guard, kanca
  consumer-transform — farklı katman, birbirinin yerine geçmez.
- Bilinen tuzak: opencode `bash` tool çıktısı kırpılabilir; ps kanıtı her
  zaman `bash_raw` veya log-dosyasından okunmalı.

## Koşum 1 (2026-09-06, normal senaryo, default /bin/sh) — ORPHAN

- Komut: `node /tmp/opencode-timeout-probe/timeout-kill-probe.mjs normal`
  (`node -e "console.log(MARKER); setTimeout(()=>{}, 30000)"`, timeout 2000ms).
- Sonuç: **ORPHAN** — callback `KILLED (timeout)` dedi ama `ps` torunu buldu:
  `9784 1 … node -e console.log('ZOMBIE_PROBE_…')` (PPID 1'e yetimlenmiş).
  Orijinal `child.pid` (9783, shell) ölü. 2/2 tekrar üretildi (9783/9784,
  10235/10236).
- Hüküm: "Promise reject oldu" != "process öldü" doğrulandı (sh katmanı).

## Koşum 2 (2026-09-06, sigterm-ignore + detached-orphan) — metodoloji hatası

- `sigterm-ignore` (`trap '' TERM; sleep 30`): marker'da **TEMİZ**, ama
  `sleep 30` (pid 9935, PPID 1) sistemde kaldı.
- `detached-orphan` (`nohup sleep 30 & disown`): callback ~290ms'de hatasız
  döndü (timeout hiç devreye girmedi), marker **TEMİZ**, ama `sleep 30`
  (pid 9952, PPID 1) kaldı.
- Öğrenme: marker komut satırında değilse grep kör kalır — `sleep 30`
  kontrolü şart. Her iki kalıntı `kill -9` ile temizlendi (`CLEAN_SLEEP`).

## Koşum 3 (2026-09-06, shell diferansiyeli) — kök neden

- Aynı komut, ardışık, farklı marker'larla: `/bin/sh` → **ORPHAN**
  (`10798, PPID 1`), `/bin/bash` → **TEMİZ**.
- Hüküm: differentiator shell seçimi. `exec.ts`'in `shell: "/bin/bash"`
  satırı rastgele değil, kritik koruma. Yorum olarak koda düşüldü.

## Koşum 4 (2026-09-06, gerçek runBash katmanı + guard) — PASS

- `npx tsx /tmp/opencode-timeout-probe/exec-layer-probe2.mts` (gerçek
  `plugins/mcp-bash-tools/src/exec.ts` import, değişiklik yok):
  `runBash döndü: 2049ms exit=1`, hemen + +1sn **eşleşen process yok** (2/2).
- Guard: `node scripts/timeout-kill-probe/timeout-kill-probe.mjs --scenario=all`
  → `{A: TEMİZ, B: ORPHAN (beklenen), C: sleep temizlendi}` **PASS** (exit 0),
  `NO_PROBE_LEFTOVER` + `NO_SLEEP_LEFTOVER`.
- Branch `test/timeout-kill-probe` silindi, main'e dönüldü (repo'da sadece
  bu görevin dosyaları kaldı).
