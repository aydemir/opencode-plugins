---
id: TASK-102
title: "no_prune escape mekanizması (toggle + inline marker + LLM declaration)"
status: done
priority: P1
created: 2026-09-02
updated: 2026-09-02
environment: both
labels: [context-saver, escape-hatch, llm-disclosure]
depends_on: ["TASK-101"]
---

# TASK-102 — no_prune escape mekanizması

## Amaç

Kullanıcının (veya LLM'in) **"bu çıktıya dokunma, ham lazım"** diyebileceği
bir mekanizma sağlamak. Üç giriş noktası hedeflendi:

1. Plugin global toggle (`enabled: false`)
2. Inline escape marker (`#no-prune` text içinde)
3. Tool şemasına `no_prune` parametresi (deneysel, OpenCode SDK'ya bağlı)

## Kapsam — Yapılan

- **`plugins/lib/prune.ts`**:
  - `PruneMiddleOptions.enabled?: boolean` (default `true`).
  - `PruneMiddleOptions.skipWhenContains?: string` (default `#no-prune`).
  - `pruneMiddle()` body'sinde iki erken return:
    1. `options.enabled === false` → `text` aynen döner
    2. `text.includes(skip)` → `text` aynen döner
  - Geriye uyumlu: marker hiç verilmezse eski davranış aynen korunur.
- **`plugins/opencode-context-saver.ts`**:
  - `CompactConfig.enabled?: boolean` eklendi.
  - `DEFAULT_CONFIG.enabled = true`.
  - `resolveConfig()`: `enabled !== false` ise budget kontrolü yapılır
    (aksi halde gereksiz throw atardı — bkz. ilk testin ortaya çıkardığı
    bug).
  - Her iki `pruneMiddle` çağrısına `enabled: config.enabled` eklendi.
- **`examples/opencode.jsonc`**: `pluginOptions` bloğu + tüm alanların
  açıklamalı örneği eklendi.
- **`docs/opencode-context-saver.md`**: "Escape Mekanizması (`no_prune`)"
  bölümü — global toggle tablosu + inline marker örnekleri + deneysel
  tool-şema parametresi notu.

## Kapsam — Yapılmayan

- Tool şemasına `no_prune` parametresi enjeksiyonu. OpenCode SDK'nın
  tool şeması override'una izin verip vermediği araştırılmadı; bu görevde
  değer/risk dengesı düşük olduğu için atlandı. Marker'daki ipucu (1) ve
  (2)'yi yönlendiriyor.

## Uygulama Planı (gerçekleşen)

1. ✅ `prune.ts`: `enabled` + `skipWhenContains` alanları + 2 erken return.
2. ✅ `opencode-context-saver.ts`: config wiring + budget skip.
3. ✅ `examples/opencode.jsonc`: pluginOptions örneği.
4. ✅ `docs/opencode-context-saver.md`: escape bölümü.
5. ✅ Test (22 toplam, hepsi geçti).
6. ✅ Typecheck temiz, build temiz.

## Etkilenen Dosyalar

- `plugins/lib/prune.ts`
- `plugins/opencode-context-saver.ts`
- `examples/opencode.jsonc`
- `docs/opencode-context-saver.md`
- `dist/` (build artifact)

## Doğrulama

### prune.ts unit (9 escape + 10 TASK-101 = 19)

```
ok: enabled=false → ham döner
ok: enabled=true (default) → prune uygulanır
ok: prune sonrası küçülme
ok: markerBuilder stats
ok: inline #no-prune → ham döner
ok: inline #no-prune (ortada) → ham döner
ok: skipWhenContains custom → ham döner
ok: skipWhenContains='' → normal prune
ok: no marker
ok: enabled=false markerBuilder'ı yoksayar
ok: küçük input + enabled=false → ham
✅ TASK-102 testleri geçti (9/9)
```

### Plugin integration (3)

```
ok: enabled=true → output prune edilmiş
ok: marker var
ok: enabled=false → prune marker yok
ok: enabled=false → eski marker yok
ok: enabled=false → orijinal içerik korunur
ok: inline #no-prune → prune marker yok
ok: inline #no-prune → içerik korunur
✅ Plugin integration testleri geçti (3/3)
```

### Build

- `npx tsc --noEmit` → temiz
- `npx tsc` → dist güncel

## Notlar / Kararlar

- **Karar:** `#no-prune` sentinel seçildi. Adaylar: `// no-prune` (kod
  context'inde doğal görünür ama LLM'in yorum olarak yutması risk),
  `{{no-prune}}` (özel syntax, LLM keşfi zor). `#` shell'de comment
  benzeri, terminal renklerinde fark edilir, LLM için kolay öğrenilir.
- **Karar:** `enabled=false` `resolvePruneBudget`'ı atlar. Sebep: eğer
  hiç prune yoksa budget kontrolü anlamsız, ayrıca threshold<budget
  durumunda gereksiz throw atıyordu. Default `enabled=true` korunduğu
  için eski davranış değişmedi.
- **Karar:** Tool şeması override'ı deneysel bırakıldı. OpenCode SDK
  araştırması ayrı bir görev (gap).
- **Karar:** `skipWhenContains` opsiyonel ama default `#no-prune`.
  Kullanıcı/plugin isterse `""` ile kapatabilir veya kendi sentinel'ini
  verebilir (ileride custom policy için).
- **Risk:** Inline `#no-prune` substring kontrolü bilgi sızıntısına
  yol açabilir — eğer tool çıktısı kendi içinde `#no-prune` geçiriyorsa
  yanlışlıkla bypass olur. Mitigasyon: marker'ın **kullanıcının yazdığı**
  bir sentinel olması bekleniyor, tool çıktılarında nadiren geçer.
  İleride regex/anchor (örn. `^\s*#no-prune\s*$`) ile sıkılaştırılabilir.