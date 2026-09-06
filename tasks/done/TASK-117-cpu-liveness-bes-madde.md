---
id: TASK-117
title: "cpu-liveness 5 acik madde: I/O grace, budget tavani, utime fix, grup-kill, final-JSON"
status: done
priority: P1
created: 2026-09-06
updated: 2026-09-06
environment: both
labels: [liveness, build, live-test, cpu-probe, tree-kill, io-grace, budget]
depends_on: [TASK-116]
---

# TASK-117 — cpu-liveness 5 açık maddeyi kapat

## Amaç

Kendi kendine sorgulama turunda (7 madde) koda bakılarak 5 maddenin sadece
konuşmada var olduğu tespit edildi. Bu görev beşini de koda düşürür;
kapanamayan tek nokta (rate-dedektörü) gerekçeli kapsam-dışı bırakılır.

## Kapsam

- Yapılan: M5 grup-kill, M4 opt-in tavan, M1 I/O grace, M3 tavanla yakalama,
  M2 final-JSON, utime off-by-one fix (M4 testi buldu).
- Yapılmayan (gerekçeli): rate-based CPU dedektörü (eşik kanıtsız tahmindir —
  bugünkü yasak), agent-içi otomatik retry (kanıtsız kestirme yasağı),
  native harness kill semantiği (bu repoda değil, bilinmiyor).

## M5 — setsid/detached grup-kill

- Kod: `scripts/cpu-liveness-probe/cpu-liveness-agent.js:82` (`detached: true`;
  grup lideri = bash child) + mevcut `tree-kill.js:99` grup denemesi.
- Kanıt: Koşum 1 — `tests/cpu-liveness-agent-signal.test.mjs` 3-katman testi
  (agent→bash→sleep,sleep) 2/2 PASS, pgrep ile yetim yok.
- Öz-eleştiri: terminalden manuel Ctrl-C artık gruba gitmez (dokümante:
  `docs/opencode-cpu-liveness.md`, `kill -TERM <agent-pid>`). Windows'ta
  detached semantiği farklı — TEST EDİLMEDİ. Kısmi değil, Linux'ta tam.

## M4 — opt-in tavan `--maxBudgetMs` (exit 4) + iki katmanlı tavan şerhi

- Kod: `cpu-liveness-agent.js:44,55` (flag), `:205-~220` (timer; grace'e
  danışılmaz), exit önceliği `:176-177` (budget ilk sırada).
- Kanıt: Koşum 1-3 — `tests/cpu-liveness-agent-budget.test.mjs` 2/2 PASS
  (busy-loop exit 4, logda hep `up=true`, `[stall]` yok).
- Şerh (onaylı): dış harness tavanı birincil/zorunlu; iç tavan test/
  standalone kanıt mekanizması. `docs/not-dogrulama-oracle-kesif.md`
  madde 6 altına işlendi.
- Öz-eleştiri: tavan duvar-saatidir (doktrinin ikincil ilan ettiği şey) —
  ama hüküm değil bütçedir, exit 4 stall ile karışmaz, default kapalıdır.
  Dar bütçe sağlıklı işi öldürür — sorumluluk çağıranda (örnek 600000).

## M0 — utime off-by-one (M4 testi buldu, 5 maddeden ağır)

- Bulgu: `linuxCpuTime` `fields[12]+fields[13]` (stime+cutime) okuyordu;
  `node -e "while(true){}"` 8sn'de 3 jiffies göründü, false-stall üretti.
  Doğrusu `fields[11]+fields[12]` (utime+stime) — `cpu-liveness-probe.js:46-60`.
- Kanıt: düzeltme sonrası aynı loop 1→47→127→183 jiffies; yeni regresyon
  testi (`cpu-liveness-probe.test.mjs`: saf spin artışı) dahil 13/13 PASS.
- Dürüst kayıt: TASK-116'daki "busy→up trend" kanıtı stime-only okumayla
  üretildi — syscall-ağır busy'de yine up görünür, saf-spinde görünmezdi.
  Eski stall hükümlerinin bir kısmı bu hatadan etkilenmiş olabilir;
  yeniden hüküm verilmedi, sadece okuyucu düzeltildi.

## M1 — I/O grace (taze-pencere + cap)

- Kod: `scripts/cpu-liveness-probe/io-wait.js` (saf `hasFreshLegitWait`;
  liste: download/fetch/lock/wait/retry; Compiling/Finished bilerek yok) +
  `cpu-liveness-agent.js:87-94` (musluk, son 200 parça) + `:128-143`
  (sadece onStall içinde tolerans; `--ioFreshMs` default 15000,
  `--ioGraceRounds` default 3, 0 kapatır).
- Kanıt: Koşum 1 — `tests/cpu-liveness-agent-iowait.test.mjs` 4/4 PASS
  (unit: 6 eşleşme + 4 eşleşmeme + bayatlık; live: sinyalli exit 0 +
  "Tolerans" logu + öldürme yok; sinyalsiz kontrol exit 2).
- Öz-eleştiri: liste İngilizce-araç heuristic'idir — bilinmeyen kelime eski
  davranışa düşer (fail-closed, güvenli yön). "Downloading"i 14sn'de bir
  basan takılı iş cap'e kadar (default 3 tur) tolerans alır, sonra normal
  yol + bütçe devreye girer. recentOut üst sınırı ~13MB (200×64KB) — build
  çıktısı için kabul, kayıtlı sınır.

## M3 — budget-as-catcher (rate-dedektörü kapsam-dışı)

- Kod karşılığı: M4 tavanı + M0 okuyucu düzeltmesi (düzgün `up` trendi).
- Kanıt: budget testinde busy-loop boyunca `[stall]` yok, exit 4 — yakalayan
  tavan, hüküm yok.
- Gerekçeli kapsam-dışı: rate eşiği ("%X üstü Y saniye") kanıtsız tahmindir;
  bugünkü "kör eşik" yasağına takılır. Sustained-high-CPU'nun ayrı sinyali
  yok (sadece samples logunda görünür) — kayıtlı eksik, bilinçli.

## M2 — final-JSON (kanıt üret, karar çağıranda)

- Kod: `cpu-liveness-agent.js:166-200` (child-exit dalı; reason: completed /
  stall-killed / stall-observed / budget-exceeded) + `:225-245` (sinyal dalı:
  terminated-sigterm/sigint). Her koşumda tek `[final-json]` satırı.
- Kanıt: Koşum 1 — `tests/cpu-liveness-agent-final.test.mjs` 2/2 PASS
  (completed şeması + stall-observed şeması, tek-satır assertli).
- Öz-eleştiri: JSON taşıma katmanıdır — çağıran yine kör retry yapabilir,
  bu bizim kontrolümüzde değil (kayıtlı sınır). Reason kelime dağarcığı
  sabittir; yeni terminal neden eklenirse şema testi güncellenmeli.

## Adım D — çelişki kontrolü (kod referanslı)

- M1×M4: budget bloğu (`:205-220`) grace'e danışmaz; exit önceliği budget
  ilk sırada (`:176-177`). Bütçe her zaman kazanır — çelişki yok.
- M1×M3: tolerans sadece onStall içinde (`:128-143`, delta==0 dalı).
  CPU yakan stall ateşlemez → grace devreye girmez — çelişki kodda çözülür.
- M2×M4: `budget-exceeded` reason'ı stall reason'larıyla ayrık küme;
  exit 4 ≠ 1/2. Süreç-içi son söz agent exit kodu, süreç-dışı harness —
  JSON hangi katmanın konuştuğunu söyler.
- M5×manuel kullanım: detached Ctrl-C'yi etkiler (dokümante), kill
  yollarının tamamı treeKill'den geçer — çelişki yok, uyarı var.

## Açık kalanlar (gerekçeli)

1. darwin/win32: tüm yeni yollar (grace/budget/JSON/grup-kill) TEST EDİLMEDİ.
2. Rate-dedektörü: kapsam-dışı (gerekçe M3).
3. Agent-içi otomatik retry: reddedildi (gerekçe M2).
4. Native harness kill semantiği: bilinmiyor (bu repoda değil).
5. TASK-116 busy-trend kanıtı stime-only okumayla üretilmiş olabilir (M0 kaydı).

## Etkilenen Dosyalar

- `scripts/cpu-liveness-probe/cpu-liveness-agent.js` (M5/M4/M1/M2)
- `scripts/cpu-liveness-probe/cpu-liveness-probe.js` (M0 utime fix)
- `scripts/cpu-liveness-probe/io-wait.js` (yeni, M1)
- `tests/cpu-liveness-agent-{signal,budget,iowait,final}.test.mjs`,
  `tests/cpu-liveness-probe.test.mjs` (regresyon)
- `plugins/lib/cpu-liveness-disclosure.ts` (exit 4 + grace cümlesi)
- `docs/opencode-cpu-liveness.md`, `docs/not-dogrulama-oracle-kesif.md`
  (madde 6 tavan alt-notu), `index.json` (KD), `tasks/index.json` (bu giriş)
