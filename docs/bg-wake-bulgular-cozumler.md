# bg-wake — Bulgular, Çözümler, OpenCode Müdahale Noktaları

Tarih: 2026-09-19. Konu: background completion → aynı session'da yeni
agent turn (wake) zinciri. Tasarım tartışması kapalı, ölçüm aşaması;
bu dosya bulgu + uygulanan çözüm + core müdahale noktalarını kilitler.

## 1. Kanıt seviyesi (kilitli)

| Katman | Durum |
|---|---|
| Process lifecycle (`hbmon`) | Kanıtlı (`done 12.3s`, `woke_on=done`) |
| Next-contact (`build-mon` + `settle-noticer`) | Kanıtlı (`.notified` one-shot) |
| CLI injection (`bg-wake` → `opencode run -s`) | Headless-kanıtlı (`/tmp/opencode-wake-test/`) |
| Persistence (marker session'da mı?) | Ölçülmedi (TUI) |
| Scheduler wake (yeni turn?) | Ölçülmedi (TUI) |
| TUI eşzamanlılığı | Ölçülmedi |

## 2. Deneyler ve ham bulgular

- `demo-build` (`bg_run`): `done code=0`, 12.7s. Wake denemesi
  `/tmp/bg-*.wake.log`'da help çıktısına düştü — bu env'de (Muse Spark
  API, opencode host değil) enjeksiyon teslim etmedi.
- `demo-build2/3` (`build-mon`): `PASSED exit=0`, `.notified` one-shot.
  `[sn]` bu env'de düşmez — `tool.execute.after` yalnızca opencode
  host'ta ateşlenir (`plugins/opencode-settle-noticer.ts:115`).
  Yokluğu "wake çalışmadı" sayılmaz.
- `hbmon` demo: `watch → wait → done code=0 in 12.3s`
  (`woke_on=done`), turn-içi senkronizasyon güvenilir.
- `/tmp/opencode-wake-test/run1.log`, `run2.log`: headless yeni turn
  izleri (`step_start/text/step_finish`, "Tamam" / "Anlaşıldı efendim")
  — ancak marker korelasyonu ve timestamp sıralaması yok.

Daraltılmış sonuç: `opencode run -s` exit 0 vermesi, LLM'in
uyandırıldığı anlamına gelmiyor. Üçü ayrıdır: CLI kabul ≠ session
teslim ≠ agent loop restart.

## 3. Kök neden (fork kod kanıtlı: `/root/opencode-fork2`)

- **Zincir:** `promptAsync` handler
  (`packages/opencode/src/server/routes/instance/httpapi/handlers/session.ts:311`)
  `requireSession` (yalnızca varlık) + `promptSvc.prompt` fork +
  anında `204 NoContent` döner. `opencode run -s` zaten bu yoldan gider
  (`cli/cmd/run/stream.transport.ts:1322` `sdk.session.promptAsync`) —
  yani `run -s` "native dışı" değil, native yolun ta kendisidir.
- **`prompt`** (`session/prompt.ts:1052`): önce `createUserMessage`
  (persist), sonra `loop` → `ensureRunning`.
- **Busy-drop (kritik):** `effect/runner.ts` `ensureRunning` —
  `Idle` dalı `startRun` (idle'da wake çalışır), `Running`/`ShellThenRun`
  dalı `[awaitDone(mevcut), state-değişmez]` — **yeni work düşer**,
  çağıran mevcut run'ı bekler. Prompt yolu `assertNotBusy` istemez
  (`shell`/`deleteMessage` ister). Sonuç: busy-anında enjeksiyon →
  mesaj persist olur, kendi loop'unu almaz → `persistence ✓ / wake ✗`.
- **Status CLI yok:** `cli/cmd/session.ts:44-47` yalnızca
  `list`/`delete`. HTTP `status` handler var ama script için server
  endpoint keşfi gerekir — bu yüzden adapter status'e değil export'a
  dayanır (zorunlu bağımlılık olmaktan çıkarıldı).
- **Doğrulama mümkün:** `export = {info, messages}`
  (`cli/cmd/export.ts:284-289`), mesajda `time.created`
  (`session/message.ts:101`). `opencode export <session>` poll ile
  marker persistence + `assistant.time.created > injection_ts`
  ölçülebilir.

## 4. Bu repo'da uygulanan çözümler

- **Terminoloji (uygulandı):** `bg-wake: teslim` →
  `bg-wake: injection-attempt` (`scripts/bg-wake.mjs:103`, header,
  `docs/opencode-hbmon.md`). Ölçülmeyen scheduler durumu başarı diye
  raporlanmaz.
- **Busy-safe adapter (uygulandı, `--task-id` ile):**
  marker'lı enjeksiyon → `injection_ts` → export poll → persistence +
  turn doğrulama → persistence ✓ + turn yoksa backoff'lu retry
  (busy-drop şüphesi) → bütçe dolarsa `wake=unknown` → pre-check ile
  idempotency (`already-confirmed`, yeni injection yok) → her deneme
  JSONL `injection-attempt`. Bayraksız çağrı legacy tek-enjeksiyon
  (geriye uyumlu). Exit: `0` confirmed, `1` unknown/failed,
  `2` denemeden bütçe. Detay: `docs/opencode-hbmon.md` "Busy-safe
  adapter" bölümü.
- **Test (uygulandı):** stub `opencode` (`run`/`export`) ile 6 satırlık
  matris — idle/busy/never/fail/preseeded/nopersist:
  `tests/bg-tasks.test.mjs` 14 pass / 0 fail / 1 skip (LIVE kapılı).
- **Katman sınırları (korundu):** `hbmon` = process lifecycle
  (`hbmon_wait` turn-içi kalır), `build-mon` = build lifecycle,
  `settle-noticer` = next-contact, `bg-wake` = busy-safe injection +
  verify. Scheduler değişikliği yok.

## 5. OpenCode core müdahale noktaları (ERTELENDİ — eşikli)

Scheduler değişikliği, adapter gerçek TUI verisiyle
`persistence ✓ / turn ✗` üretmeden yapılmaz.

### M1 — `Runner.ensureRunning` kuyruklama (birincil aday)

- Yer: `packages/opencode/src/effect/runner.ts` (`ensureRunning`,
  `Running`/`ShellThenRun` dalları).
- Mevcut: yeni work düşer, çağıran mevcut run'ı bekler.
- Öneri: pending kuyruğu (mevcut run bitince yeni work çalışır) veya
  en azından `Busy` dön (çağıran backoff yapsın, sessiz düşme olmasın).
- Risk: loop/interrupt/shell interplay semantiği değişir;回归 yüzeyi
  geniş.
- Tetik eşiği: adapter TUI ölçümünde `✓ persistence / ✗ turn`.

### M2 — `promptAsync` gözlenebilirliği (ikincil)

- Yer: `handlers/session.ts:311` (`promptAsync`).
- Mevcut: `204` + hata yalnızca log/event'e.
- Öneri: receipt (messageID) + turn sonucu sorgulanabilirliği; hata
  yutma yerine çağırana görünür hata.
- Risk: HTTP API şema değişimi.
- Tetik eşiği: M1 sonrası hâlâ `wake=unknown`.

### M3 — `opencode session status` CLI (optimizasyon, zorunlu değil)

- Yer: `cli/cmd/session.ts` (şu an list/delete).
- Öneri: `idle`/`busy` + son turn bilgisi. Adapter poll maliyetini
  düşürür; doğruluk için şart değil.
- Risk: düşük. Tetik eşiği: poll maliyeti sorun olursa.

### M4 (yedek) — native `background.completed` event

- M1 ile büyük ihtimalle gereksiz. Tetik eşiği: M1+M2 yetmezse.

### Açıkça müdahale DIŞI

`hbmon_wait` semantiği, hbmon binary, `settle-noticer`,
`build-mon` olay formatı.

## 6. Ölçüm protokolü (değişmez)

TUI açık gerçek session + `WAKE_TEST_123`: `wake_injection_ts` kaydı →
T+5s/T+30s export (ikisi ✓ ise persistence güçlü; biri ✗ ise `?`;
ikisi ✗ ise failed) → `assistant_turn_ts > wake_injection_ts` aranır
(TUI render yalnızca yardımcı gözlem).

| Injection | Persistence | New turn | Sonuç |
|---|---|---|---|
| ✓ | ✓ | ✓ | Wake kanıtlandı |
| ✓ | ✓ | ✗ | Scheduler wake kanıtlanmadı |
| ✓ | ? | ? | Session teslimi belirsiz |
| ✗ | — | — | Injection başarısız |

## 7. Karar eşiği

- `✓ / ✓` → bg-wake kanıt seviyesi yükselir, müdahale yok.
- `✓ / ✗` (gerçek TUI verisi) → M1 gündeme gelir.
- `✗ persistence` → enjeksiyon katmanı (bu repo/CLI), scheduler'a
  dokunulmaz.

## 8. Referanslar

- `scripts/bg-wake.mjs` (adapter), `tests/bg-tasks.test.mjs` (matris),
  `docs/opencode-hbmon.md` (busy-safe bölümü),
  `plugins/opencode-settle-noticer.ts:115`, `plugins/lib/bg-tasks.ts`,
  `/tmp/opencode-wake-test/`, `tmp/build-mon/demo-build3.status.json`.
- Fork: `session.ts:311` (promptAsync), `prompt.ts:1052` (prompt),
  `runner.ts` (ensureRunning), `run-state.ts` (runner map),
  `stream.transport.ts:1322`, `export.ts:284-289`, `message.ts:101`,
  `cli/cmd/session.ts:44-47`.
