const DEFAULT_CONFIG = {
    thresholdMs: 120000,
    buildKeywords: [
        "build", "compile", "make", "cargo", "npm run", "yarn", "pnpm",
        "bun run", "tsc", "webpack", "vite", "esbuild", "rollup",
        "tailwind", "next build", "gradle", "maven", "docker build",
        "pip install", "pip3 install", "forge", "rain", "rgsx",
    ],
};
function createSession(config) {
    return { active: false, command: "", callIDs: [], startTime: 0, status: "idle", config, buildCallID: null };
}
function isBuildCommand(command, keywords) {
    return keywords.some((kw) => command.toLowerCase().includes(kw.toLowerCase()));
}
function formatDuration(ms) {
    const s = Math.floor(ms / 1000);
    return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}
export const BuildHooksPlugin = async (input, options) => {
    const config = {
        ...DEFAULT_CONFIG,
        ...(options ?? {}),
        buildKeywords: options?.buildKeywords ?? DEFAULT_CONFIG.buildKeywords,
    };
    const sess = createSession(config);
    const pendingCalls = new Map();
    let lastBuildMessage = null;
    const endSession = (status) => {
        const duration = Date.now() - sess.startTime;
        const msg = status === "success"
            ? `✅ Build finished (${formatDuration(duration)})`
            : `❌ Build failed`;
        console.log(`[Build Hook] ${status === "success" ? "✅ onBuildSuccess" : "❌ onBuildFailure"}: ${sess.command} — ${formatDuration(duration)}`);
        lastBuildMessage = msg;
        sess.active = false;
        sess.command = "";
        sess.callIDs = [];
        sess.startTime = 0;
        sess.status = "idle";
        sess.buildCallID = null;
    };
    const getCommandFromArgs = (args) => {
        if (!args)
            return "";
        if (typeof args.command === "string")
            return args.command;
        if (typeof args.cmd === "string")
            return args.cmd;
        if (typeof args.input === "string")
            return args.input;
        return "";
    };
    return {
        async dispose() {
            pendingCalls.clear();
            lastBuildMessage = null;
        },
        "tool.execute.before": async (t, output) => {
            const args = output?.args ?? t?.args ?? {};
            const cmd = getCommandFromArgs(args);
            if (cmd && isBuildCommand(cmd, config.buildKeywords)) {
                if (sess.active)
                    endSession("failed");
                sess.active = true;
                sess.command = cmd;
                sess.startTime = Date.now();
                sess.status = "running";
                sess.buildCallID = t.callID;
                lastBuildMessage = `🏗️ Build started: ${cmd}`;
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
            const hasError = /\berror\b|\bfailed\b|\bFAILED\b/i.test(outStr);
            const isBuildCall = sess.buildCallID === t.callID;
            // UI: build started mesajını output'a ekle (TUI'de görünsün)
            const startedMsg = sess.command ? `🏗️ Build started: ${sess.command}` : null;
            if (hasError) {
                console.log(`[Build Hook] ❌ onBuildFailure: ${t.tool} — errors detected in ${formatDuration(duration)}`);
                const finishedMsg = `❌ Build failed`;
                if (isBuildCall) {
                    ;
                    output.output = `${startedMsg ? startedMsg + "\n" : ""}${outStr}\n${finishedMsg}`;
                }
                return endSession("failed");
            }
            if (isBuildCall) {
                const dur = Date.now() - sess.startTime;
                if (dur >= config.thresholdMs) {
                    console.log(`[Build Hook] ⏱️  onThresholdExceeded: ${formatDuration(dur)} (threshold: ${formatDuration(config.thresholdMs)})`);
                }
                const finishedMsg = `✅ Build finished (${formatDuration(dur)})`;
                output.output = `${startedMsg ? startedMsg + "\n" : ""}${outStr}\n${finishedMsg}`;
                return endSession("success");
            }
            const dur = Date.now() - sess.startTime;
            if (dur >= config.thresholdMs) {
                console.log(`[Build Hook] ⏱️  onThresholdExceeded: ${formatDuration(dur)} (threshold: ${formatDuration(config.thresholdMs)})`);
            }
        },
        "chat.message": async (_msgInput, _msgOutput) => {
            // TUI fix: build bildirimi artik mesaj yazma alanina enjekte edilmiyor
            if (lastBuildMessage) {
                lastBuildMessage = null;
            }
        },
        event: async ({ event }) => {
            const e = event;
            const type = e.type;
            if (type === "command.executed" || type === "tui.command.execute") {
                const cmd = e.command ?? e.data?.command ?? "";
                if (typeof cmd === "string" && isBuildCommand(cmd, config.buildKeywords)) {
                    if (!sess.active) {
                        sess.active = true;
                        sess.command = cmd;
                        sess.startTime = Date.now();
                        sess.status = "running";
                        lastBuildMessage = `🏗️ Build started: ${cmd}`;
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