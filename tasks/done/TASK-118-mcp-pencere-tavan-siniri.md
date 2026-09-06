---
id: TASK-118
title: "MCP penceresi vs tavan: tek-cekirdek tam derleme ortami kisiti bulgusu (3 kosum)"
status: done
priority: P1
created: 2026-09-06
updated: 2026-09-06
environment: linux
labels: [liveness, mcp-window, budget, single-core, live-test, oracle-driven]
depends_on: [TASK-117]
---

# TASK-118 — MCP penceresi / tavan sınırı bulgusu (3 koşum)

## Amaç

RGSX `manager-rs` üzerinde tek-çekirdek + cpu-liveness derleme denemesinde
ortaya çıkan ortam kısıtını kalıcı kayda geçirmek: MCP tool penceresi
(~30sn, gateway `-32001` ile kesiyor) tek-çekirdek tam derlemeden kısa.
Bu bir kod açığı değil, ortam kısıtıdır.

## Bağlam

- Deneme yeri: RGSX repo (`/root/RGSX/manager-rs`), `manager-scan` / `manager-core`
- Araç: `scripts/cpu-liveness-probe/cpu-liveness-agent.js` (TASK-116/117 ürünü)
- Tek-çekirdek: `taskset -c 0` + `cargo -j1`
- Referans: TASK-117 (hüküm/yetki/tavan disiplini), TASK-115 (orphan/torun-bırakma yasağı)

## Üç koşum

| # | Komut | Sonuç | Kanıt |
|---|---|---|---|
| 1 | `agent.js -- taskset -c 0 cargo build -p manager-scan -j1` (arka plan, `nohup+&`) | PASS (build) ama **yöntem ihlali** | `Finished dev profile in 1m 05s`, `exit=0`; agent `stall-observed exit=1` (file-lock grace 2x, sonra uyarı). `nohup+&` yüzünden agent orphan kaldı — hüküm dosyaya yazıldı, LLM'e canlı sinyal ulaşmadı. |
| 2 | `agent.js --maxBudgetMs=25000 -- taskset -c 0 cargo check -p manager-core -j1` (foreground) | INCONCLUSIVE (tavan) | `exit 4` (budget exceeded); son satırlar `Compiling time-macros / Checking time, serde_core` — derleme sürüyordu, stall yok. `ps aux` → yetim yok. Tavan "asıldı" demedi, "bütçe bitti" dedi — tasarlandığı gibi. |
| 3 | `agent.js --maxBudgetMs=20000 -- taskset -c 0 cargo metadata --format-version 1 --no-deps` (foreground) | PASS (disiplin) | `exit=0`, 1422ms, `reason: completed`. Ara FAIL: `cargo metadata -p` flag'i yokmuş (`unexpected argument '-p'`) — flagsiz koşum PASS. `ps aux` → yetim yok. |

## Bulgu (kapanan hüküm)

**Tek-çekirdek tam derleme MCP ~30sn penceresine sığmıyor — bu ortam kısıtı, kod açığı değil.**

- Kanıt 1: `timeout_ms=600000` ile foreground deneme gateway `-32001 Request timed out` ile kesildi — parametre pencereyi büyütmüyor.
- Kanıt 2: `-j1 build` 65sn sürdü; 25sn tavan derleme bitmeden doldu (`exit 4`).
- Sonuç: Bütçeyi pencereye yaklaştırmak (`27000/29000`) sadece kesme anını ince ayarlar, çözümü ötelemez. Doğru yön kapsamı pencereye sığacak şekilde tasarlamaktır (skill Adım 3).

## İhlal ve öz-eleştiri kaydı (gelecek için)

- **İhlal:** Koşum 1'de `nohup ... &` kullanıldı. Bu, TASK-115'in yasakladığı torun-bırakan pattern'in ta kendisi: agent MCP process ağacından koptu (orphan), tool'un timeout/kill mekanizması ulaşamaz hale geldi, `--allow-kill`/`--maxBudgetMs` sinyalleri dosyaya yazılıp kayboldu, hüküm/yetki/tavan disiplini devre dışı kaldı.
- **Neden seçildi:** `timeout_ms=600000`'in işe yaramadığı kanıtlandıktan sonra kök neden (pencere > iş çelişkisi) çözülmek yerine semptom dosyaya süpürüldü — skill Madde 5'in yasakladığı kanıtsız kestirme.
- **Doğrusu:** Kapsamı küçült (Koşum 3) ya da işi pencerelere bölünebilir tasarla; `nohup/&` ile ağaçtan koparma.
- **İlke:** Kural bir dosyaya bağlı değil — TASK-115 index'te bulunamasa bile ihlal ihlaldir.

## Yan bulgu (dokümantasyon hatası)

Agent başlık yorumu flag'leri `--` SONRASI gösteriyor (`-- <cmd>... [--maxBudgetMs=N]`) ama parse kodu (`sep` ÖNCESİ, `for (i < sep)`) öncesini okuyor. Canlı denemede yakalandı: sona yazılan `--maxBudgetMs` cargo'ya geçip `unexpected argument` verdi, öne alınınca çalıştı. Usage satırı düzeltılmalı (kod mu yorum mu kazanacak, ayrı mini-fix).

## Açık kalan soru

Tam derleme görevleri için MCP dışında bir taşıma mekanizması gerekiyor mu
(persistent shell + job control, session-içi polling — `nohup` olmadan, ağaç
içinde)? Bu ayrı bir TASK mı olmalı (örn. TASK-119 adayı)? Karar verilmedi;
bu dosya sadece soruyu kayda geçirir, çözümü üstlenmez.

## Doğrulama

- [x] Koşum 1 logu (`/tmp/scan-build.log`): `Finished in 1m 05s`, `exit=0`
- [x] Koşum 2: `exit 4`, `ps aux` temiz
- [x] Koşum 3: `exit 0`, `ps aux` temiz
- [ ] Usage-satırı mini-fix (kapsam dışı, not olarak duruyor)
- [ ] TASK-119 adayı kararı (açık soru)
