import type { Plugin } from "@opencode-ai/plugin"
import { isBuildCommand } from "./lib/prune.js"

interface BuildConfig {
  thresholdMs: number
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
    console.log(
      `[Build Hook] ${status === "success" ? "✅ onBuildSuccess" : "❌ onBuildFailure"}: ${command} — ${formatDuration(duration)}`,
    )
    // Log-only event: durable ama surface'e katılmaz.
    // output.output'a yazmıyoruz → context-saver kırpabilir, sorun değil.
    if (client?.app?.log) {
      void client.app.log({
        body: {
          service: "build-tracker",
          level: status === "failed" ? "error" : "info",
          message: `Build ${status}: ${command} (${formatDuration(duration)})`,
          extra: { status, duration, command },
        },
      })
    }
    sess.active = false
    sess.command = ""
    sess.callIDs = []
    sess.startTime = 0
    sess.status = "idle"
    sess.buildCallID = null
  }

  const getCommandFromArgs = (args: unknown): string => {
    if (!args || typeof args !== "object") return ""
    const a = args as Record<string, unknown>
    if (typeof a.command === "string") return a.command
    if (typeof a.cmd === "string") return a.cmd
    if (typeof a.input === "string") return a.input
    return ""
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
        console.log(`[Build Hook] 🔨 onBuildStart: ${cmd}`)
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
      const hasError = /\berror\b|\bfailed\b/i.test(outStr)
      const isBuildCall = sess.buildCallID === t.callID

      // Surface'e (output.output) yazmıyoruz — context-saver kırpabilir,
      // sıra bağımlılığı ortadan kalkar. Bilgi metadata'da log-only durur.
      const out = output as ToolAfterOutput
      const buildMeta = {
        status: hasError ? ("failed" as const) : ("success" as const),
        duration,
        command: sess.command,
        at: Date.now(),
        thresholdExceeded: Date.now() - sess.startTime >= config.thresholdMs,
      }
      out.metadata = { ...(out.metadata ?? {}), build: buildMeta }

      if (hasError) {
        console.log(
          `[Build Hook] ❌ onBuildFailure: ${t.tool} — errors detected in ${formatDuration(duration)}`,
        )
        return endSession("failed")
      }

      if (isBuildCall) {
        const dur = Date.now() - sess.startTime
        if (dur >= config.thresholdMs) {
          console.log(
            `[Build Hook] ⏱️  onThresholdExceeded: ${formatDuration(dur)} (threshold: ${formatDuration(config.thresholdMs)})`,
          )
        }
        return endSession("success")
      }

      const dur = Date.now() - sess.startTime
      if (dur >= config.thresholdMs) {
        console.log(
          `[Build Hook] ⏱️  onThresholdExceeded: ${formatDuration(dur)} (threshold: ${formatDuration(config.thresholdMs)})`,
        )
      }
    },

    // chat.message kancası kaldırıldı: eski kod msgOutput.parts.push ile
    // context'i kirletiyordu, lastBuildMessage ölü koddu. Build bilgisi
    // artık output.metadata.build'de — surface'i kirletmez.

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
            console.log(`[Build Hook] 🔨 onBuildStart (event): ${cmd}`)
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
