import type { Plugin } from "@opencode-ai/plugin"
import {
  codePointLength,
  extractErrors,
  extractSummarySafe,
  formatPruneMarker,
  PRUNE_MARKER,
  pruneMiddle,
  resolvePruneBudget,
  shouldSkipForArgs,
} from "./lib/prune.js"

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
  headChars: number
  tailChars: number
  maxCharsPerKey: number
  maxSummaryChars: number
  errorMaxLines: number
  errorTailLines: number
  injectAsSummary: boolean
  /**
   * Plugin seviyesinde global açma/kapama. `false` ise prune hiç uygulanmaz;
   * debug iterasyonlarında veya "bu projede context-saver istemiyorum"
   * durumlarında kullanılır. Default true.
   */
  enabled?: boolean
  /**
   * Per-call bypass substring. Tool args içinde veya output text içinde
   * bu substring varsa prune atlanır. Default "#no-prune".
   * LLM marker'ı da bu değeri kullanır.
   */
  skipWhenContains?: string
}

const DEFAULT_CONFIG: CompactConfig = {
  maxLogEntries: 50,
  compressThreshold: 500,
  headChars: 100,
  tailChars: 50,
  maxCharsPerKey: 40,
  maxSummaryChars: 200,
  errorMaxLines: 15,
  errorTailLines: 5,
  injectAsSummary: true,
  enabled: true,
  skipWhenContains: "#no-prune",
}

function resolveConfig(raw: Partial<CompactConfig> = {}): CompactConfig {
  const cfg: CompactConfig = { ...DEFAULT_CONFIG, ...raw }
  // enabled=false ise prune uygulanmayacağı için budget kontrolü gereksiz.
  if (cfg.enabled !== false) {
    resolvePruneBudget({
      compressThreshold: cfg.compressThreshold,
      headChars: cfg.headChars,
      tailChars: cfg.tailChars,
    })
  }
  if (cfg.headChars < 0 || cfg.tailChars < 0) {
    throw new Error(`context-saver: headChars/tailChars must be >= 0`)
  }
  if (cfg.maxCharsPerKey < 1 || cfg.maxSummaryChars < 10) {
    throw new Error(`context-saver: maxCharsPerKey>=1, maxSummaryChars>=10 required`)
  }
  return cfg
}

function serializeOutput(value: unknown): string {
  if (typeof value === "string") return value
  if (value == null) return ""
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function formatCompactLog(entries: ToolLogEntry[]): string {
  const recent = entries.slice(-20)
  const lines = recent.map((e) => {
    const status = e.error ? "❌" : "✅"
    const dur = e.duration < 1000 ? `${e.duration}ms` : `${(e.duration / 1000).toFixed(1)}s`
    return `${status} [${dur}] ${extractSummarySafe(e.name, e.args)}`
  })
  return lines.join("\n")
}

export const ToolCompactPlugin: Plugin = async ({ client }, options?: Record<string, unknown>) => {
  const config = resolveConfig((options ?? {}) as Partial<CompactConfig>)
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
      const perCallSkip = shouldSkipForArgs(t.args ?? {}, config.skipWhenContains ?? "#no-prune")
      const rawOutput = serializeOutput(output.output)

      const errors = extractErrors(rawOutput, {
        maxLines: config.errorMaxLines,
        tailLines: config.errorTailLines,
      })
      const isError = errors.length > 0
      const summary = extractSummarySafe(t.tool, t.args ?? {}, {
        maxCharsPerKey: config.maxCharsPerKey,
        maxSummaryChars: config.maxSummaryChars,
      })

      const shouldPrune = !perCallSkip && !isError && codePointLength(rawOutput) > config.compressThreshold
      const trimmed = shouldPrune
        ? pruneMiddle(rawOutput, {
            headChars: config.headChars,
            tailChars: config.tailChars,
            markerBuilder: formatPruneMarker,
            enabled: config.enabled,
            skipWhenContains: config.skipWhenContains,
          })
        : rawOutput

      let entryResult: string
      if (perCallSkip) {
        entryResult = rawOutput
      } else if (isError) {
        entryResult = errors.join("\n")
      } else {
        entryResult = trimmed
      }

      const entry: ToolLogEntry = {
        name: t.tool,
        args: t.args ?? {},
        result: entryResult,
        duration,
        timestamp: Date.now(),
        error: isError,
      }

      addLog(entry)

      if (perCallSkip) {
        output.output = rawOutput
      } else if (isError) {
        output.output = `⚠️ ${summary}\n${errors.join("\n")}\n⏱️ ${duration}ms`
      } else if (shouldPrune) {
        output.output = `[${summary}]\n${trimmed}\n⏱️ ${duration}ms`
      }
      // else: küçük output'a dokunma, ham kalsın.
    },

    "chat.message": async (_msgInput, _msgOutput) => {
      if (logs.length === 0 || !config.injectAsSummary || turnCallCount === 0) return

      const summary = formatCompactLog(logs)
      const totalCalls = logs.length
      const recentErrors = logs.filter((e) => e.error).length

      const lines = [
        `\n📋 [Araç Özeti] ${totalCalls} çağrı bu turda`,
      ]
      if (recentErrors > 0) lines.push(`⚠️ ${recentErrors} hata oluştu`)
      lines.push("", summary, "", "📊 Araç sonuçları özlendi — context tasarruf edilmiştir", "")

      await client.tui.showToast({ body: { message: lines.join("\n"), variant: "info" } })
      turnCallCount = 0
    },

    event: async ({ event }) => {
      if ((event as Record<string, unknown>).type === "session.idle" && logs.length > 0) {
        const total = logs.length
        const errors = logs.filter((e) => e.error).length
        await client.app.log({ body: { service: "context-saver", level: "info", message: `Oturum tamamlandı: ${total} çağrı, ${errors} hata`, extra: { total, errors } } })
      }
    },
  }
}

export default ToolCompactPlugin
