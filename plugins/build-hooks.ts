import type { Plugin, Part } from "@opencode-ai/plugin"

interface BuildConfig {
  thresholdMs: number
  buildKeywords: string[]
}

const DEFAULT_CONFIG: BuildConfig = {
  thresholdMs: 120000,
  buildKeywords: [
    "build", "compile", "make", "cargo", "npm run", "yarn", "pnpm",
    "bun run", "tsc", "webpack", "vite", "esbuild", "rollup",
    "tailwind", "next build", "gradle", "maven", "docker build",
    "pip install", "pip3 install", "forge", "rain", "rgsx",
  ],
}

interface BuildSession {
  active: boolean
  command: string
  callIDs: string[]
  startTime: number
  status: "idle" | "running" | "success" | "failed"
  config: BuildConfig
}

function createSession(config: BuildConfig): BuildSession {
  return { active: false, command: "", callIDs: [], startTime: 0, status: "idle", config }
}

function isBuildCommand(command: string, keywords: string[]): boolean {
  return keywords.some((kw) => command.toLowerCase().includes(kw.toLowerCase()))
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000)
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
}

function addPart(output: { parts: Part[] }, text: string) {
  output.parts.push({ type: "text", text })
}

export const BuildHooksPlugin: Plugin = async (input, options?: Record<string, unknown>) => {
  const config: BuildConfig = {
    ...DEFAULT_CONFIG,
    ...(options ?? {}),
    buildKeywords: (options?.buildKeywords as string[]) ?? DEFAULT_CONFIG.buildKeywords,
  }
  const sess = createSession(config)
  const pendingCalls = new Map<string, number>()

  const endSession = (status: "success" | "failed") => {
    sess.active = false
    sess.status = status
    const duration = Date.now() - sess.startTime
    console.log(`[Build Hook] ${status === "success" ? "✅ onBuildSuccess" : "❌ onBuildFailure"}: ${sess.command} — ${formatDuration(duration)}`)
    sess.active = false
    sess.command = ""
    sess.callIDs = []
    sess.startTime = 0
    sess.status = "idle"
  }

  return {
    async dispose() {
      pendingCalls.clear()
    },

    "command.execute.before": async (cmdInput, output) => {
      if (!isBuildCommand(cmdInput.command, config.buildKeywords)) return
      if (sess.active) endSession("failed")

      sess.active = true
      sess.command = cmdInput.command
      sess.startTime = Date.now()
      sess.status = "running"

      addPart(output, `\n🏗️ [Build Hook] Build detected: \`${cmdInput.command}\``)
      addPart(output, `   ⏰ Started: ${new Date(sess.startTime).toLocaleTimeString()}\n`)
      console.log(`[Build Hook] 🔨 onBuildStart: ${cmdInput.command}`)
    },

    "tool.execute.before": async (t) => {
      if (!sess.active) return
      pendingCalls.set(t.callID, Date.now())
      sess.callIDs.push(t.callID)
    },

    "tool.execute.after": async (t, output) => {
      if (!sess.active) return
      const startTime = pendingCalls.get(t.callID) ?? Date.now()
      pendingCalls.delete(t.callID)
      const duration = Date.now() - startTime

      if (output.output) {
        const hasError = /\berror\b|\bfailed\b|\bFAILED\b/i.test(output.output)
        if (hasError) {
          console.log(`[Build Hook] ❌ onBuildFailure: ${t.tool} — errors detected in ${formatDuration(duration)}`)
          return endSession("failed")
        }
      }

      const dur = Date.now() - sess.startTime
      if (dur >= config.thresholdMs) {
        console.log(`[Build Hook] ⏱️  onThresholdExceeded: ${formatDuration(dur)} (threshold: ${formatDuration(config.thresholdMs)})`)
      }
    },

    event: async ({ event }) => {
      if (!sess.active) return
      const e = event as Record<string, unknown>
      const type = e.type as string

      if (type === "session.next.tool.success") {
        const data = (e as { data?: { callID?: string } }).data ?? {}
        const callID = data.callID as string | undefined
        if (callID && sess.callIDs.includes(callID)) {
          console.log(`[Build Hook] 🔄 onProgress: tool success event`)
        }
      }

      if (type === "session.next.tool.failed") {
        const data = (e as { data?: { callID?: string; error?: unknown } }).data ?? {}
        const callID = data.callID as string | undefined
        if (callID && sess.callIDs.includes(callID)) {
          const error = data.error as Record<string, unknown> | undefined
          const errMsg = error?.message as string ?? "unknown error"
          console.log(`[Build Hook] ❌ onBuildFailure: tool failed — ${errMsg}`)
          return endSession("failed")
        }
      }
    },
  }
}

export default BuildHooksPlugin
