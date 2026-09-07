# opencode-settle-noticer (`sn`)

`scripts/build-mon.sh` ile izlenen derleme bitince (settle) sonucu
**sorulmadan** modelin önüne düşürür — next-contact notice (TASK-123).

## Neden var

Koşum-1 dersi: PASSED dosyaya push oldu ama ajan ~30dk sonra kullanıcı
sorusuyla öğrendi. Üç yol kapalı: bloklu bekleme gateway'de ölür
(`-32001`), `BM_ON_SETTLE` yerel shell'dir (LLM'i uyandırmaz), plugin
hook'ları sadece oturum aktivitesinde ateşlenir. Bu plugin dördüncü
yolu kodlar: **ajan bir dahaki temasta kaçırmaz**.

## Davranış

- `tool.execute.after`: her araç sonucundan sonra event dizinlerindeki
  `*.status.json` dosyalarını tara (dizin başına `maxFiles` cap).
- Final = `exit` alanı olan status (tüm build-mon finalleri exit yazar;
  `STARTED`/`HEARTBEAT`/STALLED-uyarı yazmaz — olay-adı listesi yok).
- Bildirilmemiş final varsa çıktının SONUNA ekle:
  `[sn] settled: <name> <EVENT> (exit=<code>) — <detail> [<statusPath>]`
  ve `<name>.notified` işaretle (bir final bir kez; aynı adla YENİ
  final → ts/event farklı → tekrar bildirilir).
- `experimental.chat.system.transform`: disclosure (sentinel idempotent).

## Yapılandırma (`pluginOptions["opencode-settle-noticer"]`)

| Anahtar | Default | Anlam |
|---|---|---|
| `enabled` | `true` | `false` = tamamen kapalı |
| `eventDirs` | yok | Açık liste; yoksa `$BUILD_MON_DIR` + `<cwd>/tmp/build-mon` (var olanlar) |
| `maxFiles` | `20` | Dizin başına taranan status dosyası üst sınırı |
| `skipWhenContains` | `#no-settle-notice` | Argümanlarda geçerse o çağrıda atla |

## Dürüst sınırlar

- Turn-arası **wakeup YOK**: oturum kapalıyken biten build, ajanın bir
  dahaki araç sonucu/oturumunda bildirilir. Gerçek wakeup server-tarafı
  `BM_ON_SETTLE` + harness desteği ister (başka repo).
- Tarama bounded ve best-effort: yok/okunamaz dizin atlanır, bozuk
  status dosyası bildirimi düşürmez.

## Doğrulama

- `tests/settle-noticer.test.mjs` (14 test: parse/final/notified/scan/
  notice/resolve + hook idempotency/disabled/skip/disclosure).
- `tests/server-entry.test.mjs` 5 factory.
- E2E: gerçek Koşum-1 dizini → ilk temasta `[sn] settled: j1-kanitli
  PASSED (exit=0)`, ikinci temasta sessiz.
