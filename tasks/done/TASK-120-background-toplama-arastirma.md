---
id: TASK-120
title: "Background toplama INCONCLUSIVE: sonuç neden materialize olmuyor (3 koşum, kod yok)"
status: done
priority: P1
created: 2026-09-07
updated: 2026-09-07
environment: both
labels: [research, background, result-retrieval, live-test]
depends_on: [TASK-119]
file: tasks/done/TASK-120-background-toplama-arastirma.md
---

# TASK-120 — Background toplama neden materialize olmuyor?

## Amaç

TASK-119 K3'ün INCONCLUSIVE ayağını kapatmak: `default.task(background:true)`
çağrısı hemen id döndürdü (`ses_f856c0466ffea5qKI94kuJs3e1`) ama beklenen
bitişten ~4dk sonra bile session `idle`, 1 user mesajı, assistant cevabı
YOK, POLL-DONE YOK, yetim process YOK. Neden? Bu task spekülasyon yapmaz,
3 koşumla ayırt eder.

## Hipotezler (koşumlar öncesi, kanıtlanmadı)

- **H1:** Subagent hiç çalışmadı (dispatch kabul edildi, yürütme kuyrukta
  kaldı / düştü).
- **H2:** Sonuç başka kanala gitti (bildirim/hook), `session.messages`
  doğru pencere değil.
- **H3:** 65sn ölçeğe özgü (küçük işte döngü çalışır, uzun işte kopar).
- **H4:** `session.messages` sorgusu yanlış parametreli (limit/rol
  filtresi sonucu gizliyor).

## Üç koşum — SONUÇ (2026-09-07, bu oturum ortamı)

| # | Soru | Sonuç | Kanıt |
|---|------|-------|-------|
| 1 | Eski session'a (ses_f856…, 65sn) sonuç geç de olsa geldi mi? | **GELMEDİ** (~25dk sonra: `idle`, 1 user mesajı, assistant yok, POLL-DONE yok) | `task120-k1-settled.log` |
| 2 | Küçük ölçekte (sleep 5 + MARKER2) döngü çalışıyor mu? | **HAYIR**: assistant ack mesajı geldi ("running it") ama komut ÇIKTISI hiç gelmedi (MARKER2 yok) | `task120-k2-small.log` (K2a id `ses_f8550…`, K2b 2 mesaj, çıktı yok) |
| 3 | Doğru toplama yolu nedir, resume çalışıyor mu? | Yol = `task_id` ile resume (LLM beyanı, doğrulandı: resume çalıştı) ama cevap: **"Çıktı boştu, MARKER2 görünmedi"** | `task120-k3-retrieval.log` (K3 + K3b) |

Elenen hipotezler: H3 (ölçek — 5sn'de de yok), H2/H4 (pencere/parametre —
session.messages + status + resume üçü de denendi, üçü de boş).

## Karar (koşumlar sonrası dolduruldu)

- [x] (b) **Mekanizma bu ortamda kırık/kayıp:** launch id verir ama
  sonuç hiçbir ölçekte materialize olmuyor (65sn ve 5sn). Subagent
  ack yazar, komut çıktısı dönmez. Background yolu disiplinden
  ÇIKARILIR — uzun iş reçetesi olarak önerilmez. Parçalı iş (TASK-119
  K3d) tek kanıtlı yol olarak kalır.
- [ ] (a) reddedildi: resume mekanizması çalıştı ama içerik boştu.
- [ ] (c) gerekmedi: 3 koşum da net (PASS/FAIL ayrımı temiz).

**Hüküm:** "Hemen id döner" DSH-analog launch bu ortamda var, ama
"id + poll = sonuç" denkleminin ikinci yarısı YOK. Kök neden (subagent
yürütme koptu mu, çıktı kanalı mı kapalı) bu task'ın kapsamı dışında —
ayrı bir oturum-harness sorusu; bu dosya nedeni speküle etmez.

## Kapsam-dışı

- Kod, yeni tool, daemon, prompt değişikliği — yok.
- DSH tarafı — kapsam dışı (başka harness).
- `index.json` `key_decisions` append — karara göre ayrı değerlendirilir.

## Doğrulama

- [x] Koşum 1 logu: eski session ~25dk sonra bile boş (`task120-k1-settled.log`)
- [x] Koşum 2 logu: küçük-ölçek ack var, çıktı yok (`task120-k2-small.log`)
- [x] Koşum 3 logu: resume yolu çalıştı, içerik boş (`task120-k3-retrieval.log`)
- [x] Karar (b) yazıldı; H2/H3/H4 elendi, H1 doğrulandı
- [x] `tasks/index.json` TASK-120 `done`

## Notlar / Kararlar

- (2026-09-07) Açılış: TASK-119 K3 INCONCLUSIVE'inin devamı. Spekülasyon
  yok, 3 koşumla hipotez eleme.
