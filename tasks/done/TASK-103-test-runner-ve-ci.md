---
id: TASK-103
title: "Test runner + CI (vitest/node:test, npm test, GitHub Actions)"
status: done
updated: 2026-09-02T18:30
resolution: |
  - test-plugins.mjs → tests/{prune,context-saver,build-tracker}.test.mjs
  - package.json: pretest (build) + test (node --test); eski placeholder kaldırıldı
  - .github/workflows/test.yml: Node 22, push + PR'da npm test (ci.yml korundu)
  - README.md: Development bölümü eklendi, Katkı bölümü güncellendi
  - index.json: tests bloğu + DECISION-004 eklendi, plugin tests ref'leri güncellendi
  - Kabul: pruneMiddle idempotency testi düzeltildi (gerçek davranış: ikinci pass
    throw eder — fail-fast guard, sessiz no-op call-site maskelemesin)
priority: P2
created: 2026-09-02
updated: 2026-09-02
environment: both
labels: [testing, ci, quality]
depends_on: []
---

# TASK-103 — Test runner + CI

## Amaç

Şu an testler `test-plugins.mjs` (314 satır) içinde **manuel harness**
olarak yaşıyor; `package.json`'da `npm test` scripti yok, CI yok.
Bu durum:

- regresyon fark edilmiyor (TASK-101/102 bilinçli kararları kırılabilir),
- "plugin işini yapıyor" durumu manuel kanıta bağlı,
- yeni katkıcılar için giriş eşiği yüksek.

## Kapsam

- Yapılacaklar:
  - `tests/` dizini oluştur; `test-plugins.mjs`'i oraya taşı, küçük
    test'lere böl (`prune.test.mjs`, `context-saver.test.mjs`,
    `build-tracker.test.mjs`).
  - Test runner seçimi: **`node:test` (built-in, sıfır dependency)** MVP
    için yeterli; vitest sadece coverage/watch gerekirse eklenir.
  - `package.json`'a scriptler:
    ```json
    "scripts": {
      "test": "node --test tests/",
      "test:watch": "node --test --watch tests/",
      "build": "tsc",
      "typecheck": "tsc --noEmit"
    }
    ```
  - `.github/workflows/test.yml`: push + PR'de `npm test` çalıştır.
- Yapılmayacaklar:
  - Coverage raporlama (P3, sonra).
  - E2E test (OpenCode'u spawn ederek) — kırılgan, şimdilik atlanır.

## Uygulama Planı

1. `tests/` oluştur; mevcut harness'i `node:test` API'sine taşı
   (`describe/it/assert`).
2. Her task (101, 102) tamamlandığında yeni test case'leri ekle.
3. `package.json` scriptlerini yaz.
4. `.github/workflows/test.yml` yaz (Node 22, npm ci, npm test).
5. README'ye "Development" bölümü: `npm test`, `npm run build`,
   `npm run typecheck`.
6. İlk PR'de yeşil kalması için tüm testler pass etmeli.

## Etkilenen Dosyalar

- `test-plugins.mjs` → `tests/*.test.mjs`
- `package.json` (scripts)
- `.github/workflows/test.yml` (yeni)
- `README.md` (Development bölümü)
- `tsconfig.json` (gerekirse `noEmit` ayarı)

## Doğrulama

- [ ] `npm test` lokal çalışıyor
- [ ] CI'da yeşil
- [ ] Yeni eklenecek her PR'da CI gate var
- [ ] test-plugins.mjs kaldırıldıktan sonra README'de stale ref yok

## Notlar / Kararlar

- **Karar:** `node:test` yerine vitest düşünüldü; vitest daha güzel
  DX ama dependency + bundle. Hedef kitle "küçük/free modeller"
  kullanıyor, plugin'in kendisi de hafif kalmalı. `node:test` sıfır
  dependency ile aynı işi görür.
- **Karar:** coverage (c8/istanbul) MVP'de yok; "97.5% tasarruf" gibi
  koruma isteyen metrikler ayrı benchmark task'ında (P3) eklenir.