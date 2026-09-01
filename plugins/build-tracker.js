import { isBuildCommand } from "./lib/prune.js";
const DEFAULT_CONFIG = {
    thresholdMs: 120000,
};
function createSession() {
    return { active: false, command: "", callIDs: [], startTime: 0, status: "idle", buildCallID: null };
}
function formatDuration(ms) {
    const s = Math.floor(ms / 1000);
    return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}
export const BuildHooksPlugin = async (input, options) => {
    const config = { ...DEFAULT_CONFIG, ...(options ?? {}) };
    const sess = createSession();
    const pendingCalls = new Map();
    const client = input.client;
    const endSession = (status) => {
        const duration = Date.now() - sess.startTime;
        const command = sess.command;
        console.log(`[Build Hook] ${status === "success" ? "✅ onBuildSuccess" : "❌ onBuildFailure"}: ${command} — ${formatDuration(duration)}`);
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
            });
        }
        sess.active = false;
        sess.command = "";
        sess.callIDs = [];
        sess.startTime = 0;
        sess.status = "idle";
        sess.buildCallID = null;
    };
    const getCommandFromArgs = (args) => {
        if (!args || typeof args !== "object")
            return "";
        const a = args;
        if (typeof a.command === "string")
            return a.command;
        if (typeof a.cmd === "string")
            return a.cmd;
        if (typeof a.input === "string")
            return a.input;
        return "";
    };
    return {
        async dispose() {
            pendingCalls.clear();
        },
        "tool.execute.before": async (t, output) => {
            const args = output?.args ?? t.args ?? {};
            const cmd = getCommandFromArgs(args);
            if (cmd && isBuildCommand(cmd)) {
                if (sess.active)
                    endSession("failed");
                sess.active = true;
                sess.command = cmd;
                sess.startTime = Date.now();
                sess.status = "running";
                sess.buildCallID = t.callID;
                console.log(`[Build Hook] 🔨 onBuildStart: ${cmd}`);
            }
            if (sess.active) {
                pendingCalls.set(t.callID, Date.now());
                sess.callIDs.push(t.callID);
            }
        },
        "tool.execute.after": async (t, output) => {
            if (!sess.active)
                return;
            const startTime = pendingCalls.get(t.callID) ?? Date.now();
            pendingCalls.delete(t.callID);
            const duration = Date.now() - startTime;
            const outStr = output.output ?? "";
            const hasError = /\berror\b|\bfailed\b/i.test(outStr);
            const isBuildCall = sess.buildCallID === t.callID;
            // Surface'e (output.output) yazmıyoruz — context-saver kırpabilir,
            // sıra bağımlılığı ortadan kalkar. Bilgi metadata'da log-only durur.
            const out = output;
            const buildMeta = {
                status: hasError ? "failed" : "success",
                duration,
                command: sess.command,
                at: Date.now(),
                thresholdExceeded: Date.now() - sess.startTime >= config.thresholdMs,
            };
            out.metadata = { ...(out.metadata ?? {}), build: buildMeta };
            if (hasError) {
                console.log(`[Build Hook] ❌ onBuildFailure: ${t.tool} — errors detected in ${formatDuration(duration)}`);
                return endSession("failed");
            }
            if (isBuildCall) {
                const dur = Date.now() - sess.startTime;
                if (dur >= config.thresholdMs) {
                    console.log(`[Build Hook] ⏱️  onThresholdExceeded: ${formatDuration(dur)} (threshold: ${formatDuration(config.thresholdMs)})`);
                }
                return endSession("success");
            }
            const dur = Date.now() - sess.startTime;
            if (dur >= config.thresholdMs) {
                console.log(`[Build Hook] ⏱️  onThresholdExceeded: ${formatDuration(dur)} (threshold: ${formatDuration(config.thresholdMs)})`);
            }
        },
        // chat.message kancası kaldırıldı: eski kod msgOutput.parts.push ile
        // context'i kirletiyordu, lastBuildMessage ölü koddu. Build bilgisi
        // artık output.metadata.build'de — surface'i kirletmez.
        event: async ({ event }) => {
            const e = event;
            const type = e.type;
            if (type === "command.executed" || type === "tui.command.execute") {
                const cmd = e.command ?? e.data?.command ?? "";
                if (typeof cmd === "string" && isBuildCommand(cmd)) {
                    if (!sess.active) {
                        sess.active = true;
                        sess.command = cmd;
                        sess.startTime = Date.now();
                        sess.status = "running";
                        console.log(`[Build Hook] 🔨 onBuildStart (event): ${cmd}`);
                    }
                }
                return;
            }
            if (type === "session.idle") {
                if (sess.active) {
                    return endSession("success");
                }
                return;
            }
        },
    };
};
export default BuildHooksPlugin;
//# sourceMappingURL=build-tracker.js.map