---
id: TASK-130
title: "Ölü setup akışı: README/package.json `scripts/setup.mjs`'ye dayanıyor, dosya yok"
status: done
priority: P2
created: 2026-09-10
updated: 2026-09-10
environment: both
labels: [setup, docs, installation]
depends_on: []
file: tasks/todo/TASK-130-olu-setup-akisi.md
---

# TASK-130 — Ölü setup akışı

## Gözlem (kanıtlı, kod yok)

- `README.md` + `README.tr.md` "Seçenek C (önerilen)": `npm run setup -- --yes`.
- `package.json`: `"setup": "node scripts/setup.mjs"`.
- `scripts/setup.mjs` **repoda yok** (`ls scripts/` kanıtı, 2026-09-10).
- `docs/PROJECT_MAP.md` dosyayı varmış gibi anlatıyor (artifact doğrulama,
  `.bak.<ts>` yedek, `--dry-run`/`--check`, `tests/setup.test.mjs`) —
  test dosyası da yok (`ls tests/`).

Sonuç: önerilen kurulum yolu ilk adımda kırık (`node: Cannot find module`).

## Karar gerekiyor (implementasyondan önce)

- (a) `setup.mjs` gerçekten yazılacak mı (PROJECT_MAP'taki sözleşmeyle)?
- (b) Yoksa README/package.json/PROJECT_MAP'tan Seçenek C kaldırılıp
  Seçenek A/B mi önerilecek?

Speküle etme: karar verilmeden kod yazılmaz.

## Kapsam (karar sonrasına)

- (a) ise: script + `tests/setup.test.mjs` + README doğrulaması.
- (b) ise: üç dosyadan ölü referansların temizliği + test.

## Doğrulama

- [ ] Karar (a/b) bu dosyaya yazıldı
- [ ] `npm run setup -- --dry-run` çalışıyor (a) veya referans yok (b)
- [ ] `tasks/index.json` TASK-130 `done`

## Notlar / Kararlar

- (2026-09-10) README EN/TR çalışmasında bulundu; çeviride metne sadık
  kalındı, düzeltilmedi. Bulan: belge denetimi.

## Kapanış (2026-09-10)

- Karar: (a) — script yazıldı (`scripts/setup.mjs`, ~230 satır).
- Sözleşme: artifact doğrulama (yoksa `npm run build` ister, exit 1) + `mcp.bash` merge (mutlak yol) + 6 plugin girdisi + script seti kontrolü; bayraksız plan+exit 2, `--dry-run` exit 0, `--check` kirli=1/temiz=0, `--yes` `.bak.<ts>` yedekli yazar; `pluginOptions` korunur; bozuk config fail-loud.
- Eski spec'teki `mcp.opencode-mcp-bash-tools` key adı `bash` olarak uygulandı (TUI rename sonrası).
- Canlı kanıt: `--dry-run/--check/--yes` temiz (exit 0); tmp config'te tam yaşam döngüsü (plan→2→yaz→check 0).
- Test: `tests/setup.test.mjs` 14/14. Suite: 139 test (138 pass + 1 pre-existing skip), tsc temiz.
