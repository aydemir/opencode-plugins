---
id: TASK-116
title: "cpu-liveness-probe — build process CPU izleme (busy/stall ayrımı + tree-kill entegrasyonu)"
status: done
priority: P2
created: 2026-09-06
updated: 2026-09-06
environment: both
labels: [liveness, build, live-test, cpu-probe, tree-kill]
depends_on: [TASK-115]
---

# TASK-116 — CPU-Liveness İzleme (busy/stall ayrımı + tree-kill entegrasyonu)

## Amaç

Bir build/derleme sürecini başlatıp CPU-liveness ile izlemek: "CPU zamanı
artıyor mu" üzerinden süreç gerçekten iş yapıyor mu, yoksa asılı mı kaldı
ayrımı. Amaç **kör alarm değil, gerekçeli karar** — CPU almamak her zaman
asılmak değildir (I/O bekleme, network, alt-process bekleme → false
positive). Kritik sınırlama: araç sadece **CPU-bound derleme/build** araçları
için güvenilir; genel `bash exec` katmanına uygulanmaz.

Kullanıcının sandbox'ında üretilip bu repo'ya hiç geçmemiş olan
`cpu-liveness-probe.js` konsepti (build-liveness-agent-prompt) bu görevde
sıfırdan yazıldı, gerçek süreçlerle canlı test edildi. Yerleşik bir
build-tracker/context-saver plugin'i değil — bağımsız bir operasyonel script
dizini.

## Kapsam

- Yapılacaklar
  - `cpu-liveness-probe.js`: Linux (`/proc/<pid>/stat` utime+stime),
    macOS (`ps -o time=`), Windows (PowerShell `TotalProcessorTime`) —
    platform okuyucuları + `watchLiveness` stall saptama.
  - `tree-kill.js`: bağımlılıksız process-ağacı öldürücü (Linux process-group
    negatif-pid + `ps --ppid` descendants fallback; Windows `taskkill /T /F`).
  - `cpu-liveness-agent.js`: build komutunu spawn + CPU izle + `--allow-kill`
    ile gerekçeli karar veren runner.
  - Unit testler (`tests/cpu-liveness-probe.test.mjs`).
  - Canlı test: busy (CPU tüketen) → progress/exit-0; stalled (sleep) →
    uyarı/exit-1; stalled + `--allow-kill` → SIGTERM/exit-2.
- Yapılmayacaklar (out-of-scope)
  - Bu aracı genel `bash exec` katmanına (rastgele komutlar) uygulama —
    sadece bilinen CPU-yoğun derleme araçlarına yönelik bekçi.
  - Tek bir stall ölçümüne güvenip anında öldürme — `stallThreshold` eşiği
    beklenir (agent `--allow-kill`'siz ASLA öldürmez).
  - macOS/Windows canlı test — bu platformlar için kod yazıldı ama
    doğrulanmadı; sonuç "olası" olarak işaretlenir.
  - `index.json` kök özet plugins listesine eklenmedi (plugin değil, script);
    yalnızca `key_decisions` notu düşülecek.

## Uygulama Planı

1. `scripts/cpu-liveness-probe/` altına üç dosya (probe + tree-kill + agent).
2. Unit testler (mock değil — gerçek CPU-bound/idle process'lerle, spindle
   gerçek spin). Linux dışı platformlarda skips.
3. Canlı koşum: busy (CPU) ve stalled (sleep) senaryoları agent runner ile.
4. `tsc --noEmit` + `npm test` (72/72) doğrulaması.
5. Task dosyası + `tasks/index.json` + `index.json` key_decisions güncellemesi.

## Etkilenen Dosyalar

- `scripts/cpu-liveness-probe/cpu-liveness-probe.js` (yeni)
- `scripts/cpu-liveness-probe/tree-kill.js` (yeni)
- `scripts/cpu-liveness-probe/cpu-liveness-agent.js` (yeni)
- `tests/cpu-liveness-probe.test.mjs` (yeni)
- `tasks/done/TASK-116-cpu-liveness-probe.md` (bu dosya)
- `tasks/index.json` (board girişi)
- `index.json` (key_decisions notu)

## Doğrulama

- [x] Unit test: busy process → up trend, stall YOK (6/6 tüm test)
- [x] Unit test: idle process → stall tetiklenir
- [x] Unit test: ölü process → graceful (up=null, stall yok)
- [x] Unit test: tree-kill var-olmayan pid → hatasız callback (ESRCH yutulur, fırlamaz)
- [x] Unit test: tree-kill ağaç testi kök + torun ölümünü assert eder (poll + finally self-clean)
- [x] Canlı koşum 1: busy (CPU tüketen) → 9 örnek, hepsi up, **stop değil** (exit 0)
- [x] Canlı koşum 2: stalled (sleep) + `--allow-kill` → 3 ardışık delta=0 →
      tree-kill(SIGTERM) → exit **2**
- [x] Canlı koşum 3: stalled (sleep) `--allow-kill`'siz → uyarı, öldürme,
      doğal çıkış → exit **1**
- [x] `npx tsc --noEmit` temiz
- [x] `npm test` EXIT=0, 74/74 pass (build dahil; +2 tree-mod testi)
- [x] Gerçek derleme tree-modda: up trend, uyarı yok, exit 0 (Koşum 4)
- [x] Kalıntı yok (`ps` kontrolü sleep/node kalıntısı bırakmadı)

## Notlar / Kararlar

- `[2026-09-06] DECISION: onStall otomatik öldürmez -> REASON: CPU almamak
  asılmak değildir (I/O bekleme, network, alt-process bekleme → false
  positive). Agent `--allow-kill` bayrağı VERİLMEDEN SIGTERM atmaz; verilirse
  bile karar gerekçesi loglar. tree-kill yalnızca stall eşiği aşıldığında ve
  tüketici açıkça kill'e onay verdiğinde. SUPERSEDES: none`
- Aracın kill kararı Tree-kill öncesi "neden asılı olduğuna karar verdiğimi"
  bir cümleyle özetlemeyi zorunlu kılar (regresyon/log amacı) —
  `cpu-liveness-agent.js` `[stall] Asılı olabilir: ...` satırı bu görevi
  görür.
- Platform durumu: `PLATFORM_VERIFIED` yalnızca Linux'ta true (canlı test
  edildi). macOS/Windows kodları test edilmemiş — tüketici sonucu "olası"
  işaretlemelidir.
- `tree-kill.js` dış bağımlılık yok (npm `tree-kill` yerine) — TASK-113
  no-dependency politikasına uyar. Linux'ta önce `process.kill(-pid, SIGTERM)`
  (process-group), ASIL GARANTİ olarak `ps --ppid` recursive toplama + tek tek
  sinyal. `[2026-09-06] BUGFIX: ilk sürümde catch yalnızca ESRCH-dışı hatada
  fallback çalıştırıyordu; oysa spawn edilen çocuk genelde group lideri
  DEĞİL (node'un pgid'ini paylaşır) → kill(-pid) ESRCH verip torun `sleep`
  PPID 1'e orphan kalıyordu (3 kalıntı, pkill ile temizlendi). Düzeltme:
  group-kill best-effort, descendants her durumda çalışır. Ayrıca
  /proc/.../task/.../children bu container ortamında YOK (ENOENT) → çocuk
  listeleme ps ile. Linux okuyucu da `cat` spawn yerine fs.readFileSync
  (ölü PID'de stderr spam'i bitti). darwin yolu BSD `ps -o pid=,ppid=` parse
  kullanır (GNU --ppid yok). SUPERSEDES: none`
- `cpu-liveness-agent.js` komutu `cmdArgs.join(" ")` ile /bin/bash -c
  üzerinden çalıştırır (TASK-115 orphan regresyonu korunur). İlk denemede
  spawn'ın arg ayrıştırması bozuldu (nested shell quoting) — düzeltildi.

## Koşum 4 (2026-09-06, GERÇEK DERLEME — `npm run build` opencode ortamında)

- Komut: `node scripts/cpu-liveness-probe/cpu-liveness-agent.js
  --intervalMs=2000 --stallThreshold=3 -- "npm run build"` (tsc full compile, ~17sn).
- İlk deneme (tek PID modu): SAĞLIKLI derlemede **2 false stall uyarısı**,
  agent EXIT=1 — kök npm'in kendi CPU'su flat, işi yapan tsc torunu izlenmiyor.
  Güvenlik tuttu (`--allow-kill` yok → öldürme yok) ama uyarı gürültüsü vardı.
- Kök neden: derleme araçları işi alt process'te yapar (npm→tsc,
  cargo→rustc, make→cc). Fix: `readTreeCpuTime` (pid + canlı torunlar toplamı)
  + `watchLiveness includeTree` opsiyonu + agent `includeTree: true`
  (default false = geriye uyumlu tek PID).
- Tekrar (tree modu): 9 örnek, cpuTime 1→90 monoton artıyor, 8 up / 1 down,
  **stall uyarısı YOK**, derleme exit=0, agent **EXIT=0**. **PASS.**
- Not: son örnekte delta=-73 (tsc bitip torunlar ölünce toplam düştü) —
  anlaşıldı, bug değil: tek down örneği eşiğe (3) ulaşamaz, derleme zaten çıktı.
  `delta > 0 = up` semantiği korundu (hassasiyet öncelikli).
- Hüküm: araç artık gerçek derlemede doğru çalışıyor; tek PID modu build
  izlemeye uygun DEĞİL (testle kilitlendi: aynı topolojide single=stall,
  tree=up). **PASS.**

## Koşum 1 (2026-09-06, busy — CPU tüketen process)

- Komut: `node scripts/cpu-liveness-probe/cpu-liveness-agent.js --intervalMs=400
  --stallThreshold=3 -- node -e 'const e=Date.now()+3200; let x=0;
  while(Date.now()<e){x++}'`
- Kanıt: 9 örnek, CPU zamanı monoton artıyor (0.13 → 13.13), hepsi `up=true`,
  `down=0`. `stall` tetiklenmedi. `[agent] Çıktı: exit=0`.
- Hüküm: CPU-bound işte liveness doğru çalışıyor — iş varsa CPU alınır, stall
  yanlış alarm üretmez. **PASS.**

## Koşum 2 (2026-09-06, stalled + `--allow-kill`)

- Komut: `sleep 15`, `--allow-kill` ile.
- Kanıt: 3 ardışık `delta=0` → `[stall] Asılı olabilir: CPU 3 ardışık ölçümde
  artmadı (1200ms). --allow-kill VERİLDİ → tree-kill(SIGTERM, pid=17724)
  uygulanıyor. Not: bu I/O beklemesi ise false positive olabilir.`
  Sonra `exit=null signal=SIGTERM`, agent **EXIT=2**.
- Hüküm: `onStall` eşiği doğru; kill yalnızca açık `--allow-kill` ile; gerçek
  sleep süreci SIGTERM ile temizlendi. **PASS.**
- Tekrar (tree-kill ps-fix sonrası, `sleep 5`): stall → SIGTERM → agent
  EXIT=2, `ps` kalıntısı yok. **PASS (regression yok).**

## Koşum 3 (2026-09-06, stalled `--allow-kill`'siz)

- Komut: `sleep 5`, `--allow-kill` YOK.
- Kanıt: 3 ardışık `delta=0` → `[stall] UYARI: ... Öldürmedim — I/O beklemesi
  olabilir (false positive). --allow-kill eklersen SIGTERM atar.` sleep doğal
  bitti (exit 0), agent **EXIT=1** (stall algılandı ama öldürülmedi).
- Hüküm: `--allow-kill`'siz asla öldürmez — "kör alarm" yolu kapalı. Gereken
  durumda I/O bekleme ayrımına tüketici karar verir. **PASS.**