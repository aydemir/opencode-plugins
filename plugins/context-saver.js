import { codePointLength, extractErrors, extractSummarySafe, pruneMiddle, resolvePruneBudget, } from "./lib/prune.js";
const DEFAULT_CONFIG = {
    maxLogEntries: 50,
    compressThreshold: 500,
    headChars: 100,
    tailChars: 50,
    maxCharsPerKey: 40,
    maxSummaryChars: 200,
    errorMaxLines: 15,
    errorTailLines: 5,
    injectAsSummary: true,
};
function resolveConfig(raw = {}) {
    const cfg = { ...DEFAULT_CONFIG, ...raw };
    resolvePruneBudget({
        compressThreshold: cfg.compressThreshold,
        headChars: cfg.headChars,
        tailChars: cfg.tailChars,
    });
    if (cfg.headChars < 0 || cfg.tailChars < 0) {
        throw new Error(`context-saver: headChars/tailChars must be >= 0`);
    }
    if (cfg.maxCharsPerKey < 1 || cfg.maxSummaryChars < 10) {
        throw new Error(`context-saver: maxCharsPerKey>=1, maxSummaryChars>=10 required`);
    }
    return cfg;
}
function formatCompactLog(entries) {
    const recent = entries.slice(-20);
    const lines = recent.map((e) => {
        const status = e.error ? "❌" : "✅";
        const dur = e.duration < 1000 ? `${e.duration}ms` : `${(e.duration / 1000).toFixed(1)}s`;
        return `${status} [${dur}] ${extractSummarySafe(e.name, e.args)}`;
    });
    return lines.join("\n");
}
export const ToolCompactPlugin = async ({ client }, options) => {
    const config = resolveConfig((options ?? {}));
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
            const rawOutput = typeof output.output === "string"
                ? output.output
                : output.output == null
                    ? ""
                    : (() => {
                        try {
                            return JSON.stringify(output.output);
                        }
                        catch {
                            return String(output.output);
                        }
                    })();
            const errors = extractErrors(rawOutput, {
                maxLines: config.errorMaxLines,
                tailLines: config.errorTailLines,
            });
            const isError = errors.length > 0;
            const summary = extractSummarySafe(t.tool, t.args ?? {}, {
                maxCharsPerKey: config.maxCharsPerKey,
                maxSummaryChars: config.maxSummaryChars,
            });
            const entry = {
                name: t.tool,
                args: t.args ?? {},
                result: isError
                    ? errors.join("\n")
                    : codePointLength(rawOutput) > config.compressThreshold
                        ? pruneMiddle(rawOutput, {
                            headChars: config.headChars,
                            tailChars: config.tailChars,
                        })
                        : rawOutput,
                duration,
                timestamp: Date.now(),
                error: isError,
            };
            addLog(entry);
            if (isError) {
                output.output = `⚠️ ${summary}\n${errors.join("\n")}\n⏱️ ${duration}ms`;
            }
            else if (codePointLength(rawOutput) > config.compressThreshold) {
                // Head+marker+tail. Marker'ın son halini pruneMiddle üretir; burada
                // tekrar PRUNE_MARKER kullanma — pruneMiddle zaten ekledi.
                const trimmed = pruneMiddle(rawOutput, {
                    headChars: config.headChars,
                    tailChars: config.tailChars,
                });
                output.output = `[${summary}]\n${trimmed}\n⏱️ ${duration}ms`;
            }
            // else: küçük output'a dokunma, ham kalsın.
        },
        "chat.message": async (_msgInput, _msgOutput) => {
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
            await client.tui.showToast({ body: { message: lines.join("\n"), variant: "info" } });
            turnCallCount = 0;
        },
        event: async ({ event }) => {
            if (event.type === "session.idle" && logs.length > 0) {
                const total = logs.length;
                const errors = logs.filter((e) => e.error).length;
                await client.app.log({ body: { service: "context-saver", level: "info", message: `Oturum tamamlandı: ${total} çağrı, ${errors} hata`, extra: { total, errors } } });
            }
        },
    };
};
export default ToolCompactPlugin;
//# sourceMappingURL=context-saver.js.map