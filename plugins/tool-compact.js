const DEFAULT_CONFIG = {
    maxLogEntries: 50,
    compressThreshold: 500,
    injectAsSummary: true,
};
function extractErrors(output) {
    return output
        .split("\n")
        .filter((line) => /\berror\b|\bfailed\b|\bFAILED\b|^\s*→|^\s*error\[|TypeError|ReferenceError|SyntaxError/i.test(line))
        .slice(0, 15);
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
        const status = e.error ? "❌" : "✅";
        const dur = e.duration < 1000 ? `${e.duration}ms` : `${(e.duration / 1000).toFixed(1)}s`;
        return `${status} [${dur}] ${extractSummary(e.name, e.args)}`;
    });
    return lines.join("\n");
}
export const ToolCompactPlugin = async (input, options) => {
    const config = { ...DEFAULT_CONFIG, ...(options ?? {}) };
    const logs = [];
    const startTimes = new Map();
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
                result: errors.length > 0 ? errors.join("\n") : (rawOutput.length > config.compressThreshold ? rawOutput.slice(0, config.compressThreshold) + "..." : rawOutput),
                duration,
                timestamp: Date.now(),
                error: isError,
            };
            addLog(entry);
            if (isError) {
                output.output = `⚠️ ${extractSummary(t.tool, t.args ?? {})}\n${errors.join("\n")}\n⏱️ ${duration}ms`;
            }
            else if (rawOutput.length > config.compressThreshold) {
                output.output = `[${extractSummary(t.tool, t.args ?? {})}]\n${rawOutput.slice(0, 200)}...\n⏱️ ${duration}ms`;
            }
        },
        "chat.message": async (_msgInput, msgOutput) => {
            if (logs.length === 0 || !config.injectAsSummary || turnCallCount === 0)
                return;
            const summary = formatCompactLog(logs);
            const totalCalls = logs.length;
            const recentErrors = logs.filter((e) => e.error).length;
            const lines = [
                `\n📋 [Araç Özeti] ${totalCalls} çağrı bu turda`,
            ];
            if (recentErrors > 0)
                lines.push(`⚠️ ${recentErrors} hata oluştu`);
            lines.push("", summary, "", "📊 Araç sonuçları özlendi — context tasarruf edilmiştir", "");
            msgOutput.parts.push({ type: "text", text: lines.join("\n") });
            turnCallCount = 0;
        },
        event: async ({ event }) => {
            if (event.type === "session.idle") {
                const total = logs.length;
                const errors = logs.filter((e) => e.error).length;
                console.log(`[Tool Compact] 📊 Oturum tamamlandı: ${total} çağrı, ${errors} hata`);
            }
        },
    };
};
export default ToolCompactPlugin;
//# sourceMappingURL=tool-compact.js.map