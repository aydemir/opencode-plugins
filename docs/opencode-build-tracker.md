# opencode-build-tracker

`plugins/opencode-build-tracker.ts` (`137 satır`) — build komutlarını algılar, yaşam döngüsü kancaları sağlar.

## Kaynak

- Dosya: `plugins/opencode-build-tracker.ts:1-137`
- Derlenmiş: `plugins/opencode-build-tracker.js`

## Sözleşme

### Config

```ts
interface BuildConfig {
  thresholdMs: number           // default 120000 (2 dk)
  verbose?: boolean             // default false (Termux ghost-text guard)
  extraErrorPatterns?: string[] // default [] — builtin BUILD_ERROR_PATTERNS'e
                                // EK regex gövdeleri (`m` flag ile derlenir).
                                // Örn. pytest: ["^FAILED\\s"]. Anchor kullanın;
                                // geçersiz desen init'te throw eder (fail-loud).
}
interface BuildSession {
  active: boolean
  command: string
  callIDs: string[]
  startTime: number
  status: "idle"|"running"|"success"|"failed"
}
```

### Akış

```
command.execute.before → isBuildCommand(cmd, keywords)? → sess.active=true, sess.command=cmd, addPart(output, "🏗️ Build detected") (opencode-build-tracker.ts:70-82)
tool.execute.before    → pendingCalls.set(callID), sess.callIDs.push(callID) (opencode-build-tracker.ts:84-88)
tool.execute.after     → hasError? (/\\berror\\b|\\bfailed\\b/i) → endSession("failed")
                        dur>=thresholdMs? → console.log onThresholdExceeded (opencode-build-tracker.ts:90-108)
event(session.next.tool.success|failed) → onBuildSuccess / onBuildFailure (opencode-build-tracker.ts:110-132)
endSession(status)     → console.log onBuildSuccess/onBuildFailure + reset (opencode-build-tracker.ts:53-63)
```

### Kancalar (console.log)

- `onBuildStart`: `[Build Hook] 🔨 onBuildStart: <cmd>` (`opencode-build-tracker.ts:81`)
- `onBuildSuccess`: `[Build Hook] 🔄 onBuildSuccess: tool success event` (`opencode-build-tracker.ts:119`)
- `onBuildFailure`: `[Build Hook] ❌ onBuildFailure: <reason>` (`opencode-build-tracker.ts:99,129`)
- `onBuildSuccess`: `[Build Hook] ✅ onBuildSuccess: <cmd> — <dur>` (`opencode-build-tracker.ts:57`)
- `onThresholdExceeded`: `[Build Hook] ⏱️ onThresholdExceeded: <dur> (threshold: ...)` (`opencode-build-tracker.ts:106`)

## Kullanım

```jsonc
{
  "plugin": ["./plugins/opencode-build-tracker.ts"]
}
```

Custom error patterns (additive — builtin'ler korunur):

```ts
BuildHooksPlugin(input, { thresholdMs: 60000, extraErrorPatterns: ["^FAILED\\s"] })
```

## Davranış Notları

- `sess.active` iken yeni build komutu gelirse önceki session `failed` ile kapatılır (`opencode-build-tracker.ts:72`).
- `tool.execute.after` içinde `output.output` yoksa threshold kontrolüne geçer.
- `dispose()` sadece `pendingCalls` temizler (`opencode-build-tracker.ts:66-68`), `sess` resetlenmez — host dispose'u takip etmeli.

## Test

```bash
node -e "const k=['cargo','npm run']; console.log(['cargo build'].some(c=>k.some(kw=>c.includes(kw))))"
```
