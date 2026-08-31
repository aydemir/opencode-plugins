import type { Plugin, Part } from "@opencode-ai/plugin"

interface ToolLogEntry {
  name: string
  args: Record<string, unknown>
  result: string
  duration: number
  timestamp: number
  error: boolean
}

interface CompactConfig {
  maxLogEntries: number
  compressThreshold: number
  injectAsSummary: boolean
}

const DEFAULT_CONFIG: CompactConfig = {
  maxLogEntries: 50,
  compressThreshold: 500,
  injectAsSummary: true,
}

function extractErrors(output: string): string[] {
  return output
    .split("\n")
    .filter((line) => /\berror\b|\bfailed\b|\bFAILED\b|^\s*→|^\s*error\[|TypeError|ReferenceError|SyntaxError/i.test(line))
    .slice(0, 15)
}

function extractSummary(name: string, args: Record<string, unknown>): string {
  const keys = Object.keys(args)
  const keySummary = keys.slice(0, 3).map((k) => `${k}=${JSON.stringify(args[k])}`).join(", ")
  const extra = keys.length > 3 ? ` (+${keys.length - 3} param)` : ""
  return `${name}(${keySummary}${extra})`
}

function formatCompactLog(entries: ToolLogEntry[]): string {
  const recent = entries.slice(-20)
  const lines = recent.map((e) => {
    const status = e.error ? "❌" : "✅"
    const dur = e.duration < 1000 ? `${e.duration}ms` : `${(e.duration / 1000).toFixed(1)}s`
    return `${status} [${dur}] ${extractSummary(e.name, e.args)}`
  })
  return lines.join("\n")
}

export const ToolCompactPlugin: Plugin = async (input, options?: Record<string, unknown>) => {
  const config: CompactConfig = { ...DEFAULT_CONFIG, ...(options ?? {}) }
   const logs: ToolLogEntry[] = []
   const startTimes = new Map<string, number>()
   let turnCallCount = 0

  const addLog = (entry: ToolLogEntry) => {
    logs.push(entry)
    if (logs.length > config.maxLogEntries) logs.shift()
    turnCallCount++
  }

  return {
    async dispose() {
      logs.length = 0
      turnCallCount = 0
      startTimes.clear()
    },

    "tool.execute.before": async (t) => {
      startTimes.set(t.callID, Date.now())
    },

    "tool.execute.after": async (t, output) => {
      const startTime = startTimes.get(t.callID) ?? Date.now()
      const duration = Date.now() - startTime
      startTimes.delete(t.callID)

      const rawOutput = output.output ?? ""
      const errors = extractErrors(rawOutput)
      const isError = errors.length > 0

      const entry: ToolLogEntry = {
        name: t.tool,
        args: t.args ?? {},
        result: errors.length > 0 ? errors.join("\n") : (rawOutput.length > config.compressThreshold ? rawOutput.slice(0, config.compressThreshold) + "..." : rawOutput),
        duration,
        timestamp: Date.now(),
        error: isError,
      }

      addLog(entry)

      if (isError) {
        output.output = `⚠️ ${extractSummary(t.tool, t.args ?? {})}\n${errors.join("\n")}\n⏱️ ${duration}ms`
      } else if (rawOutput.length > config.compressThreshold) {
        output.output = `[${extractSummary(t.tool, t.args ?? {})}]\n${rawOutput.slice(0, 200)}...\n⏱️ ${duration}ms`
      }
    },

    "chat.message": async (_msgInput, msgOutput) => {
      if (logs.length === 0 || !config.injectAsSummary || turnCallCount === 0) return

      const summary = formatCompactLog(logs)
      const totalCalls = logs.length
      const recentErrors = logs.filter((e) => e.error).length

      const lines = [
        `\n📋 [Araç Özeti] ${totalCalls} çağrı bu turda`,
      ]
      if (recentErrors > 0) lines.push(`⚠️ ${recentErrors} hata oluştu`)
      lines.push("", summary, "", "📊 Araç sonuçları özlendi — context tasarruf edilmiştir", "")

      msgOutput.parts.push({ type: "text", text: lines.join("\n") })
      turnCallCount = 0
    },

    event: async ({ event }) => {
      if ((event as Record<string, unknown>).type === "session.completed") {
        const total = logs.length
        const errors = logs.filter((e) => e.error).length
        console.log(`[Tool Compact] 📊 Oturum tamamlandı: ${total} çağrı, ${errors} hata`)
      }
    },
  }
}

export default ToolCompactPlugin
