// @bun
// tool-compact.ts
var DEFAULT_CONFIG = {
  maxLogEntries: 50,
  compressThreshold: 500,
  injectAsSummary: true
};
function extractErrors(output) {
  return output.split(`
`).filter((line) => /\berror\b|\bfailed\b|\bFAILED\b|^\s*\u2192|^\s*error\[|TypeError|ReferenceError|SyntaxError/i.test(line)).slice(0, 15);
}
function extractSummary(name, args) {
  const keys = Object.keys(args);
  const keySummary = keys.slice(0, 3).map((k) => `${k}=${JSON.stringify(args[k])}`).join(", ");
  const extra = keys.length > 3 ? ` (+${keys.length - 3} param)` : "";
  return `${name}(${keySummary}${extra})`;
}
function formatCompactLog(entries) {
  const recent = entries.slice(-20);
  const lines = recent.map((e) => {
    const status = e.error ? "\u274C" : "\u2705";
    const dur = e.duration < 1000 ? `${e.duration}ms` : `${(e.duration / 1000).toFixed(1)}s`;
    return `${status} [${dur}] ${extractSummary(e.name, e.args)}`;
  });
  return lines.join(`
`);
}
var ToolCompactPlugin = async (input, options) => {
  const config = { ...DEFAULT_CONFIG, ...options ?? {} };
  const logs = [];
  const startTimes = new Map;
  let turnCallCount = 0;
  const addLog = (entry) => {
    logs.push(entry);
    if (logs.length > config.maxLogEntries)
      logs.shift();
    turnCallCount++;
  };
  return {
    async dispose() {
      logs.length = 0;
      turnCallCount = 0;
      startTimes.clear();
    },
    "tool.execute.before": async (t) => {
      startTimes.set(t.callID, Date.now());
    },
    "tool.execute.after": async (t, output) => {
      const startTime = startTimes.get(t.callID) ?? Date.now();
      const duration = Date.now() - startTime;
      startTimes.delete(t.callID);
      const rawOutput = output.output ?? "";
      const errors = extractErrors(rawOutput);
      const isError = errors.length > 0;
      const entry = {
        name: t.tool,
        args: t.args ?? {},
        result: errors.length > 0 ? errors.join(`
`) : rawOutput.length > config.compressThreshold ? rawOutput.slice(0, config.compressThreshold) + "..." : rawOutput,
        duration,
        timestamp: Date.now(),
        error: isError
      };
      addLog(entry);
      if (isError) {
        output.output = `\u26A0\uFE0F ${extractSummary(t.tool, t.args ?? {})}
${errors.join(`
`)}
\u23F1\uFE0F ${duration}ms`;
      } else if (rawOutput.length > config.compressThreshold) {
        output.output = `[${extractSummary(t.tool, t.args ?? {})}]
${rawOutput.slice(0, 200)}...
\u23F1\uFE0F ${duration}ms`;
      }
    },
    "chat.message": async (_msgInput, msgOutput) => {
      if (logs.length === 0 || !config.injectAsSummary || turnCallCount === 0)
        return;
      const summary = formatCompactLog(logs);
      const totalCalls = logs.length;
      const recentErrors = logs.filter((e) => e.error).length;
      const lines = [
        `
\uD83D\uDCCB [Ara\xE7 \xD6zeti] ${totalCalls} \xE7a\u011Fr\u0131 bu turda`
      ];
      if (recentErrors > 0)
        lines.push(`\u26A0\uFE0F ${recentErrors} hata olu\u015Ftu`);
      lines.push("", summary, "", "\uD83D\uDCCA Ara\xE7 sonu\xE7lar\u0131 \xF6zlendi \u2014 context tasarruf edilmi\u015Ftir", "");
      msgOutput.parts.push({ type: "text", text: lines.join(`
`) });
      turnCallCount = 0;
    },
    event: async ({ event }) => {
      if (event.type === "session.completed") {
        const total = logs.length;
        const errors = logs.filter((e) => e.error).length;
        console.log(`[Tool Compact] \uD83D\uDCCA Oturum tamamland\u0131: ${total} \xE7a\u011Fr\u0131, ${errors} hata`);
      }
    }
  };
};
var tool_compact_default = ToolCompactPlugin;
export {
  ToolCompactPlugin,
  tool_compact_default as default
};
