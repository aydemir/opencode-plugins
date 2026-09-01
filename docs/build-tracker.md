# opencode-build-tracker

`plugins/build-tracker.ts` (`137 satır`) — build komutlarını algılar, yaşam döngüsü kancaları sağlar.

## Kaynak

- Dosya: `plugins/build-tracker.ts:1-137`
- Derlenmiş: `plugins/build-tracker.js`

## Sözleşme

### Config

```ts
interface BuildConfig {
  thresholdMs: number      // default 120000 (2 dk)
  buildKeywords: string[]  // default: build, compile, make, cargo, npm run, yarn, pnpm, bun run, tsc, webpack, vite, esbuild, rollup, tailwind, next build, gradle, maven, docker build, pip install, pip3 install, forge, rain, rgsx
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
command.execute.before → isBuildCommand(cmd, keywords)? → sess.active=true, sess.command=cmd, addPart(output, "🏗️ Build detected") (build-tracker.ts:70-82)
tool.execute.before    → pendingCalls.set(callID), sess.callIDs.push(callID) (build-tracker.ts:84-88)
tool.execute.after     → hasError? (/\\berror\\b|\\bfailed\\b/i) → endSession("failed")
                        dur>=thresholdMs? → console.log onThresholdExceeded (build-tracker.ts:90-108)
event(session.next.tool.success|failed) → onProgress / onBuildFailure (build-tracker.ts:110-132)
endSession(status)     → console.log onBuildSuccess/onBuildFailure + reset (build-tracker.ts:53-63)
```

### Kancalar (console.log)

- `onBuildStart`: `[Build Hook] 🔨 onBuildStart: <cmd>` (`build-tracker.ts:81`)
- `onProgress`: `[Build Hook] 🔄 onProgress: tool success event` (`build-tracker.ts:119`)
- `onBuildFailure`: `[Build Hook] ❌ onBuildFailure: <reason>` (`build-tracker.ts:99,129`)
- `onBuildSuccess`: `[Build Hook] ✅ onBuildSuccess: <cmd> — <dur>` (`build-tracker.ts:57`)
- `onThresholdExceeded`: `[Build Hook] ⏱️ onThresholdExceeded: <dur> (threshold: ...)` (`build-tracker.ts:106`)

## Kullanım

```jsonc
{
  "plugin": ["./plugins/build-tracker.ts"]
}
```

Custom keywords:

```ts
BuildHooksPlugin(input, { thresholdMs: 60000, buildKeywords: ["cargo", "npm run"] })
```

## Davranış Notları

- `sess.active` iken yeni build komutu gelirse önceki session `failed` ile kapatılır (`build-tracker.ts:72`).
- `tool.execute.after` içinde `output.output` yoksa threshold kontrolüne geçer.
- `dispose()` sadece `pendingCalls` temizler (`build-tracker.ts:66-68`), `sess` resetlenmez — host dispose'u takip etmeli.

## Test

```bash
node -e "const k=['cargo','npm run']; console.log(['cargo build'].some(c=>k.some(kw=>c.includes(kw))))"
```
