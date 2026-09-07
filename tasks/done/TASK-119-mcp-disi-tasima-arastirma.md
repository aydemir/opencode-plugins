---
id: TASK-119
title: "MCP-dışı taşıma gerekli mi: native bash + background yetenek araştırması (3 koşum, kod yok)"
status: done
priority: P1
created: 2026-09-07
updated: 2026-09-07
environment: both
labels: [research, mcp-window, background, live-test]
depends_on: [TASK-118]
file: tasks/done/TASK-119-mcp-disi-tasima-arastirma.md
---

# TASK-119 — MCP-dışı taşıma gerekli mi? (Araştırma + 3 koşum, kod yok)

## Amaç

TASK-118'in açık bıraktığı soruyu kapatmak: tam derleme gibi uzun işler
için MCP tool penceresi (~30sn) dışında bir taşıma mekanizması gerekiyor
mu (persistent shell + job control, session-içi polling — `nohup` olmadan,
ağaç içinde)? Bu task **sadece araştırır ve kanıt toplar; kod yazmaz.**

## Bağlam

- TASK-118 bulgusu: tek-çekirdek `-j1 build` 65sn sürdü, MCP penceresi
  (~30sn, gateway `-32001`) kesiyor. `timeout_ms=600000` pencereyi
  büyütmüyor. Ortam kısıtı, kod açığı değil.
- Mevcut katman: `runBash` (`plugins/mcp-bash-tools/src/exec.ts:30`)
  `execAsync(command, {timeout, shell:"/bin/bash"})` — tek call = tek
  pencere. `bash_safe`/`bash_raw` default `timeout_ms=30000`.
- Yasak: `nohup ... &` ile ağaçtan koparma (TASK-115). Orphan bırakan
  pattern'lar hüküm/yetki/tavan disiplinini devre dışı bırakır.
- Kurulu opencode sürümü (2026-09-07): **1.18.29**.

## Hipotez kutusu (kanıtlanmadı — normatif değil)

> HİPOTEZ: DeepSeek Harness (DSH) uzun işi tool-call penceresinin dışına
> çıkarır — ön plan kısa timeout, uzun işler `run_in_background:true` ile
> arka plana alınır, `job_id` + `job_output`/`job_kill` ile toplanır,
> arka plan process'lerine timeout uygulanmaz.
>
> Kısmi doğrulama (web, 2026-09-07): DSH bash-executor docs —
> *"start returns immediately; no timeout applies to background processes"*
> (`ShellExecSpec`: `start` ignores `timeoutMs because background
> processes have no executor timeout`). Bu alıntı doğrulandı.
>
> Doğrulanmadı (kanıt sayılmaz): `run_in_background` → `job_id` →
> `job_output`/`job_kill` akışının gerçek davranışı, `toolCallTimeoutMs`,
> persistent-shell default'ları, cooperative-deadline detayları. Bunlar
> LLM/web iddiası; bu task'ın koşumları DSH tarafını doğrulamaz.
>
> Kritik ayrım: OpenCode background = **subagent/task katmanı**
> (`task(..., background:true)`, deneysel bayrak), DSH jobs gibi
> **bash-process katmanı değil**. Eşdeğerlik varsayılmıyor — DSH modeli
> kopyalanmayacak, sadece OpenCode tarafında karşılık var mı diye
> bakılacak.

## Üç koşum — SONUÇ (2026-09-07, opencode 1.18.29, bu oturum ortamı)

| # | Soru | Sonuç | Kanıt |
|---|------|-------|-------|
| 1a | MCP penceresi 40sn işi keser mi? | **PASS** (kesmedi), 51.8sn sürdü | `task119-k1a-mcp-window.log`: `K1A-DONE`, `⏱️ 51828ms`, `ps` temiz |
| 1b | MCP penceresinin kenarı nerede? | **FAIL (kesildi)**: sleep-90 → `-32001`, ~69sn'de kesinti | `task119-k1b-mcp-window-edge.log`: kesinti anında `bash -c` + `sleep 90` YAŞIYORDU (orphan penceresi); ~2dk sonra temiz (exec'in kendi 120sn timeout'u süpürdü) |
| 1c | Direkt kanal 45sn işi taşır mı? | **PASS**, 45sn | `task119-k1c-direct-bash.log`: `K1C-DONE`, yetim yok |
| 2 | Background yeteneği var mı? | **Kısmen**: `default.task` semasında `background` parametresi VAR (K2c); flag açık/kapalı fark etmedi (K2a/K2b'de de `default.task` göründü). HTTP yetenek yoklaması yapılamadı (serve dahil tüm endpointler 401). Not: bu `default.task` bu oturum harness'ının Task aracı; opencode 1.18.29'un native `task(background:true)`'su ile eşdeğerliği varsayılmıyor | `task119-k2-background.log`, `task119-opencode-help.txt` (background/job/task: 0 eşleşme) |
| 3a | Background launch + poll (DSH-analog) | **Launch PASS, toplama BAŞARISIZ**: `background:true` çağrısı hemen id döndürdü (`ses_f856c0466ffea5qKI94kuJs3e1`, ~39sn LLM roundtrip); beklenen bitişten ~4dk sonra bile session `idle`, 1 user mesajı, assistant cevabı YOK, POLL-DONE YOK, yetim process YOK | `task119-k3-polling.log` (K3a/K3b/K3c) |
| 3d | Parçalı iş (3×40sn, progress dosyası) | **PASS 3/3**: toplam 120sn iş, her parça pencere içinde, dosya birleştirildi | `task119-k3d-chunked.log`, `task119-progress.txt`, yetim 0 |

## Karar (koşumlar sonrası dolduruldu)

- [x] (a) **Native/parçalı yeterli (KISA VADE, KANITLI):** 120sn iş 3
  pencereye bölünüp MCP içinde, ağaç içinde, yetimsiz tamamlandı (K3d).
  TASK-118'in reçetesi ("kapsamı pencereye sığacak şekilde tasarla")
  bu ortamda çalışıyor. Uzun işler için varsayılan disiplin budur.
- [ ] (b) **Yeni katman gerekli:** Henüz değil. Background *launch*
  var ama *toplama* kanıtlanamadı (K3b/K3c) → job/polling katmanı
  yatırımı şu an kanıtsız olur.
- [x] (c) **INCONCLUSIVE kaydı:** Background toplama ayağı
  INCONCLUSIVE (launch oldu, sonuç hiç materialize olmadı; neden
  bilinmiyor — kuyrukta mı, düştü mü?). Bu ayrı bir soru olarak
  TASK-120 adayına bırakıldı; bu dosya nedeni speküle etmez.

**Hüküm:** MCP penceresi istemci-tarafıdır (bu oturumda ~65–70sn,
opencode 1.18.29 gateway'inde ~30sn — TASK-118). Gateway kesintisi
torunları geçici orphan bırakır (exec timeout'u süpürür, istemci erken
öldüremez — TASK-115 disiplini geçerli). DSH-analog "id + poll" döngüsü
bu ortamda TAMAMLANAMADI; kanıtlı yol parçalı iştir.

## Kapsam-dışı (bu task'ta YOK)

- Kod, yeni MCP tool, polling daemon, prompt değişikliği — yok.
- `nohup`/`&` ile ağaçtan koparma — yasak (TASK-115).
- TASK-118 yan bulgu (agent usage-satırı `--` öncesi/sonrası mini-fix) —
  ayrı mini-fix, buraya alınmaz.
- `index.json` `key_decisions` append — karar TASK-120/MVP'ye kalır.
- DSH tarafı canlı test — başka harness, kapsam dışı.

## Doğrulama

- [x] Koşum 1 logları: K1a PASS 51.8sn + K1b `-32001` (~69sn) + orphan penceresi + K1c PASS 45sn + `ps` temizliği
- [x] Koşum 2 logları: K2a/K2b (flag açık/kapalı `default.task` var) + K2c (semada `background` VAR) + HTTP 401 kaydı
- [x] Koşum 3 logları: K3a launch id + K3b/K3c toplama yok (INCONCLUSIVE) + K3d 3/3 parçalı PASS
- [x] Karar (a)+(c) dosyaya yazıldı; (b) gerekçeli olarak reddedildi (kanıtsız yatırım yok)
- [x] DSH hipotez kutusu işaretlendi: launch yarısı doğrulandı, poll yarısı doğrulanamadı
- [x] `tasks/index.json` TASK-119 `done` + tarih güncellendi

## Notlar / Kararlar

- (2026-09-07) Açılış: kapsam = araştırma + 3 koşum; DSH = hipotez kutusu.
  Plan-onaylı açılış; metodoloji: kanıtsız kestirme yok, iddiayı üreten
  katmandan bağımsız doğrulama.
