// @bun
// build-hooks.ts
var DEFAULT_CONFIG = {
  thresholdMs: 120000,
  buildKeywords: [
    "build",
    "compile",
    "make",
    "cargo",
    "npm run",
    "yarn",
    "pnpm",
    "bun run",
    "tsc",
    "webpack",
    "vite",
    "esbuild",
    "rollup",
    "tailwind",
    "next build",
    "gradle",
    "maven",
    "docker build",
    "pip install",
    "pip3 install",
    "forge",
    "rain",
    "rgsx"
  ]
};
function createSession(config) {
  return { active: false, command: "", callIDs: [], startTime: 0, status: "idle", config };
}
function isBuildCommand(command, keywords) {
  return keywords.some((kw) => command.toLowerCase().includes(kw.toLowerCase()));
}
function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}
function addPart(output, text) {
  output.parts.push({ type: "text", text });
}
var BuildHooksPlugin = async (input, options) => {
  const config = {
    ...DEFAULT_CONFIG,
    ...options ?? {},
    buildKeywords: options?.buildKeywords ?? DEFAULT_CONFIG.buildKeywords
  };
  const sess = createSession(config);
  const pendingCalls = new Map;
  const endSession = (status) => {
    sess.active = false;
    sess.status = status;
    const duration = Date.now() - sess.startTime;
    console.log(`[Build Hook] ${status === "success" ? "\u2705 onBuildSuccess" : "\u274C onBuildFailure"}: ${sess.command} \u2014 ${formatDuration(duration)}`);
    sess.active = false;
    sess.command = "";
    sess.callIDs = [];
    sess.startTime = 0;
    sess.status = "idle";
  };
  return {
    async dispose() {
      pendingCalls.clear();
    },
    "command.execute.before": async (cmdInput, output) => {
      if (!isBuildCommand(cmdInput.command, config.buildKeywords))
        return;
      if (sess.active)
        endSession("failed");
      sess.active = true;
      sess.command = cmdInput.command;
      sess.startTime = Date.now();
      sess.status = "running";
      addPart(output, `
\uD83C\uDFD7\uFE0F [Build Hook] Build detected: \`${cmdInput.command}\``);
      addPart(output, `   \u23F0 Started: ${new Date(sess.startTime).toLocaleTimeString()}
`);
      console.log(`[Build Hook] \uD83D\uDD28 onBuildStart: ${cmdInput.command}`);
    },
    "tool.execute.before": async (t) => {
      if (!sess.active)
        return;
      pendingCalls.set(t.callID, Date.now());
      sess.callIDs.push(t.callID);
    },
    "tool.execute.after": async (t, output) => {
      if (!sess.active)
        return;
      const startTime = pendingCalls.get(t.callID) ?? Date.now();
      pendingCalls.delete(t.callID);
      const duration = Date.now() - startTime;
      if (output.output) {
        const hasError = /\berror\b|\bfailed\b|\bFAILED\b/i.test(output.output);
        if (hasError) {
          console.log(`[Build Hook] \u274C onBuildFailure: ${t.tool} \u2014 errors detected in ${formatDuration(duration)}`);
          return endSession("failed");
        }
      }
      const dur = Date.now() - sess.startTime;
      if (dur >= config.thresholdMs) {
        console.log(`[Build Hook] \u23F1\uFE0F  onThresholdExceeded: ${formatDuration(dur)} (threshold: ${formatDuration(config.thresholdMs)})`);
      }
    },
    event: async ({ event }) => {
      if (!sess.active)
        return;
      const e = event;
      const type = e.type;
      if (type === "session.next.tool.success") {
        const data = e.data ?? {};
        const callID = data.callID;
        if (callID && sess.callIDs.includes(callID)) {
          console.log(`[Build Hook] \uD83D\uDD04 onProgress: tool success event`);
        }
      }
      if (type === "session.next.tool.failed") {
        const data = e.data ?? {};
        const callID = data.callID;
        if (callID && sess.callIDs.includes(callID)) {
          const error = data.error;
          const errMsg = error?.message ?? "unknown error";
          console.log(`[Build Hook] \u274C onBuildFailure: tool failed \u2014 ${errMsg}`);
          return endSession("failed");
        }
      }
    }
  };
};
var build_hooks_default = BuildHooksPlugin;
export {
  BuildHooksPlugin,
  build_hooks_default as default
};
