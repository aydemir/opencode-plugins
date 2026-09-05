import type { Plugin } from "@opencode-ai/plugin"
import { isBuildCommand } from "./lib/prune.js"

interface BuildConfig {
  thresholdMs: number
  /**
   * Sessiz mod (default false = sessiz). `true` ise `[Build Hook] ...`
   * satırları stdout'a yazılır; Termux/OpenTUI'da bu satırlar input'ta
   * hayalet yazı (ghost text) bırakıyordu. Kalıcı bildirim zaten
   * `client.app.log` ile veriliyor, stdout log'u gereksiz.
   */
  verbose?: boolean
}

interface BuildSession {
  active: boolean
  command: string
  callIDs: string[]
  startTime: number
  status: "idle" | "running" | "success" | "failed"
  buildCallID: string | null
}

const DEFAULT_CONFIG: BuildConfig = {
  thresholdMs: 120000,
  verbose: false,
}

const BUILD_ERROR_PATTERNS = [
  /^error\[/m,           // rustc: error[E0425]
  /^npm ERR!/m,          // npm: npm ERR!
  /^\s*error TS\d+/m,    // tsc: error TS2304
  /^\s*→/m,              // biome, rust diagnostic
  /^FAILED:/m,           // bazel, buck
  /^FAIL\b/m,            // generic FAIL
  /^make.*\*\*\* /m,     // make: *** Error
  /^\s*error:/m,         // generic "error:" prefix (cargo, biome)
  /^error\b/m,           // yarn berry, pnpm (satır başı "error")
] as const

function getCommandFromArgs(args: unknown): string {
  if (!args || typeof args !== "object") return ""
  const a = args as Record<string, unknown>
  if (typeof a.command === "string") return a.command
  if (typeof a.cmd === "string") return a.cmd
  if (typeof a.input === "string") return a.input
  return ""
}

function createSession(): BuildSession {
  return { active: false, command: "", callIDs: [], startTime: 0, status: "idle", buildCallID: null }
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000)
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
}

interface ToolAfterOutput {
  output?: string
  metadata?: Record<string, unknown>
}

export const BuildHooksPlugin: Plugin = async (input, options?: Record<string, unknown>) => {
  const config: BuildConfig = { ...DEFAULT_CONFIG, ...(options ?? {}) }
  const sess = createSession()
  const pendingCalls = new Map<string, number>()
  const client = (input as unknown as { client?: { app?: { log?: (b: unknown) => Promise<void> | void } } }).client

  const endSession = (status: "success" | "failed") => {
    const duration = Date.now() - sess.startTime
    const command = sess.command
    const dur = formatDuration(duration)
    // stdout'a yazma: Termux/OpenTUI'da hayalet yazı bırakıyor.
    // Sadece verbose:true ise yaz (debug). Kalıcı log altta app.log'da.
    if (config.verbose) {
      console.log(
        `[Build Hook] ${status === "success" ? "✅ onBuildSuccess" : "❌ onBuildFailure"}: ${command} — ${dur}`,
      )
    }
    // 1) Kalıcı log (debug/replay)
    if (client?.app?.log) {
      void client.app.log({
        body: {
          service: "build-tracker",
          level: status === "failed" ? "error" : "info",
          message: `Build ${status}: ${command} (${dur})`,
          extra: { status, duration, command },
        },
      })
    }
    // 2) TUI toast KALDIRILDI (2026-09-04): toast metni istemcide sonraki
    //    prompt'un parts dizisine id'siz text parçası olarak sızıp oturumu
    //    kilitliyordu ("invalid user part before save" /
    //    EventV2.InvalidDurableEvent). Bildirim yalnızca kalıcı app log'da.
    sess.active = false
    sess.command = ""
    sess.callIDs = []
    sess.startTime = 0
    sess.status = "idle"
    sess.buildCallID = null
  }

  return {
    async dispose() {
      pendingCalls.clear()
    },

    "tool.execute.before": async (t, output) => {
      const args = (output as { args?: unknown })?.args ?? (t as { args?: unknown }).args ?? {}
      const cmd = getCommandFromArgs(args)
      if (cmd && isBuildCommand(cmd)) {
        if (sess.active) endSession("failed")
        sess.active = true
        sess.command = cmd
        sess.startTime = Date.now()
        sess.status = "running"
        sess.buildCallID = t.callID
        if (config.verbose) console.log(`[Build Hook] 🔨 onBuildStart: ${cmd}`)
      }
      if (sess.active) {
        pendingCalls.set(t.callID, Date.now())
        sess.callIDs.push(t.callID)
      }
    },

    "tool.execute.after": async (t, output) => {
      if (!sess.active) return
      const startTime = pendingCalls.get(t.callID) ?? Date.now()
      pendingCalls.delete(t.callID)
      const duration = Date.now() - startTime

      const outStr = (output as ToolAfterOutput).output ?? ""
      // Build araçlarının bilinen hata formatları. Generic "error"/"failed"
      // kelime araması yorum satırı, help text gibi durumlarda false positive
      // üretiyor. Anchor'lar (^, satır başı) yorum/help'i filtreler, gerçek
      // build hata çıktısını yakalar.
      const hasError = BUILD_ERROR_PATTERNS.some((re) => re.test(outStr))
      const isBuildCall = sess.buildCallID === t.callID

      // Surface'e (output.output) yazmıyoruz — context-saver kırpabilir,
      // sıra bağımlılığı ortadan kalkar. Bilgi metadata'da log-only durur.


      if (hasError) {
        if (config.verbose) {
          console.log(
            `[Build Hook] ❌ onBuildFailure: ${t.tool} — errors detected in ${formatDuration(duration)}`,
          )
        }
        return endSession("failed")
      }

      const checkThreshold = (dur: number) => {
        if (dur >= config.thresholdMs) {
          if (config.verbose) {
            console.log(
              `[Build Hook] ⏱️  onThresholdExceeded: ${formatDuration(dur)} (threshold: ${formatDuration(config.thresholdMs)})`,
            )
          }
        }
      }

      if (isBuildCall) {
        checkThreshold(Date.now() - sess.startTime)
        return endSession("success")
      }

      checkThreshold(Date.now() - sess.startTime)
    },

    // chat.message kancası: Build bilgisi endSession içinde yalnızca
// client.app.log (kalıcı) ile bildiriliyor. showToast 2026-09-04'te
// kaldırıldı (toast metni sonraki prompt'a sızıp oturumu kilitliyordu).
// 2026-09-04: console.log stdout da sessize alındı (verbose:false default);
// Termux/OpenTUI'da "[Build Hook]" satırları input'ta hayalet yazı bırakıyordu.
// output.metadata TUI'da render edilmediği için terk edildi
// (ağaç araştırması 2026-09-01).

    event: async ({ event }) => {
      const e = event as Record<string, unknown>
      const type = e.type as string

      if (type === "command.executed" || type === "tui.command.execute") {
        const cmd = (e as { command?: unknown }).command ?? (e as { data?: { command?: unknown } }).data?.command ?? ""
        if (typeof cmd === "string" && isBuildCommand(cmd)) {
          if (!sess.active) {
            sess.active = true
            sess.command = cmd
            sess.startTime = Date.now()
            sess.status = "running"
            if (config.verbose) console.log(`[Build Hook] 🔨 onBuildStart (event): ${cmd}`)
          }
        }
        return
      }

      if (type === "session.idle") {
        if (sess.active) {
          return endSession("success")
        }
        return
      }
    },
  }
}

export default BuildHooksPlugin
