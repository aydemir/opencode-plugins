import assert from "node:assert/strict";
import {
  PRUNE_MARKER,
  codePointLength,
  pruneMiddle,
  extractSummarySafe,
  isBuildCommand,
  extractErrors,
  resolvePruneBudget,
} from "./dist/plugins/lib/prune.js";
import { ToolCompactPlugin } from "./dist/plugins/context-saver.js";
import { BuildHooksPlugin } from "./dist/plugins/build-tracker.js";

let pass = 0, fail = 0;
function ok(name, fn) {
  try { fn(); console.log(`✅ ${name}`); pass++; } catch (e) { console.error(`❌ ${name}: ${e.message}\n${e.stack}`); fail++; }
}
async function okAsync(name, fn) {
  try { await fn(); console.log(`✅ ${name}`); pass++; } catch (e) { console.error(`❌ ${name}: ${e.message}\n${e.stack}`); fail++; }
}

// --- lib/prune unit ---
ok("codePointLength emoji", () => {
  assert.equal(codePointLength("hello"), 5);
  assert.equal(codePointLength("👍"), 1); // surrogate pair counts as 1 code point
  assert.equal(codePointLength("a👍b"), 3);
});

ok("pruneMiddle large text", () => {
  const big = "A".repeat(250) + "B".repeat(500) + "C".repeat(250);
  const out = pruneMiddle(big, { headChars: 100, tailChars: 50 });
  assert.ok(out.includes(PRUNE_MARKER.trim()));
  assert.ok(out.startsWith("A".repeat(100)));
  assert.ok(out.endsWith("C".repeat(50)));
  assert.ok(codePointLength(out) < codePointLength(big));
  assert.equal(codePointLength(out), 100 + codePointLength(PRUNE_MARKER) + 50);
});

ok("pruneMiddle small text no-op", () => {
  const small = "hello";
  assert.equal(pruneMiddle(small, { headChars: 100, tailChars: 50 }), small);
});

ok("pruneMiddle idempotent second pass keeps same", () => {
  const big = "X".repeat(1000);
  const once = pruneMiddle(big, { headChars: 100, tailChars: 50 });
  const twice = pruneMiddle(once, { headChars: 100, tailChars: 50 });
  assert.equal(once, twice);
});

ok("resolvePruneBudget valid", () => {
  resolvePruneBudget({ compressThreshold: 500, headChars: 100, tailChars: 50 }); // 100+marker(33)+50=183 <500 ok
});

ok("resolvePruneBudget invalid throws", () => {
  assert.throws(() => resolvePruneBudget({ compressThreshold: 100, headChars: 100, tailChars: 50 }));
});

ok("isBuildCommand tokens", () => {
  assert.equal(isBuildCommand("npm run build"), true);
  assert.equal(isBuildCommand("cargo build"), true);
  assert.equal(isBuildCommand("tsc --noEmit"), true);
  assert.equal(isBuildCommand("vite build"), true);
  assert.equal(isBuildCommand("docker build -t foo ."), true);
  assert.equal(isBuildCommand("cd web && npm run build"), true); // chained
  assert.equal(isBuildCommand("ls -la"), false);
  assert.equal(isBuildCommand("echo hello"), false);
  assert.equal(isBuildCommand("rain run something"), true); // rain token
  assert.equal(isBuildCommand("pip install requests"), true);
  assert.equal(isBuildCommand("training model"), false); // substring guard
});

ok("isBuildCommand case-insensitive", () => {
  assert.equal(isBuildCommand("NPM RUN BUILD"), true);
});

ok("extractErrors captures error lines + tail", () => {
  const out = ["line1", "error: something failed", "line3", "TypeError: x is not defined", "line5", "line6 tail"].join("\n");
  const errs = extractErrors(out, { maxLines: 15, tailLines: 5 });
  assert.ok(errs.some(l => l.includes("error: something failed")));
  assert.ok(errs.some(l => l.includes("TypeError")));
  // tail lines always included (last 5)
  assert.ok(errs.includes("line6 tail"));
});

ok("extractSummarySafe truncates per-key", () => {
  const s = extractSummarySafe("bash", { command: "a".repeat(100), extra: "b".repeat(100) }, { maxCharsPerKey: 10, maxSummaryChars: 200 });
  assert.ok(s.includes("bash("));
  assert.ok(s.includes("…")); // truncated
});

ok("extractSummarySafe handles missing args", () => {
  const s = extractSummarySafe("read", null);
  assert.equal(s, "read(, )"); // parts = ["read(", ")"] joined with ", "
});

// --- context-saver plugin ---
await okAsync("context-saver: small output untouched", async () => {
  const logs = [];
  const fakeClient = { tui: { showToast: async (m) => logs.push(m) }, app: { log: async () => {} } };
  const plugin = await ToolCompactPlugin({ client: fakeClient }, {});
  // simulate tool call
  const t = { callID: "1", tool: "bash", args: { command: "echo hi" } };
  await plugin["tool.execute.before"](t);
  const output = { output: "hi" };
  await plugin["tool.execute.after"](t, output);
  assert.equal(output.output, "hi"); // small -> untouched
});

await okAsync("context-saver: large output pruned", async () => {
  const fakeClient = { tui: { showToast: async () => {} }, app: { log: async () => {} } };
  const plugin = await ToolCompactPlugin({ client: fakeClient }, {});
  const big = "A".repeat(300) + "B".repeat(300) + "C".repeat(300);
  const t = { callID: "2", tool: "bash", args: { command: "cat bigfile" } };
  await plugin["tool.execute.before"](t);
  const output = { output: big };
  await plugin["tool.execute.after"](t, output);
  assert.ok(output.output.includes(PRUNE_MARKER.trim()));
  assert.ok(output.output.startsWith("[bash("));
  assert.ok(codePointLength(output.output) < big.length);
});

await okAsync("context-saver: error output extracted with warning", async () => {
  const fakeClient = { tui: { showToast: async () => {} }, app: { log: async () => {} } };
  const plugin = await ToolCompactPlugin({ client: fakeClient }, {});
  const errOut = "line1\nerror: build failed\nTypeError: x\nline tail";
  const t = { callID: "3", tool: "bash", args: { command: "npm run build" } };
  await plugin["tool.execute.before"](t);
  const output = { output: errOut };
  await plugin["tool.execute.after"](t, output);
  assert.ok(output.output.startsWith("⚠️"));
  assert.ok(output.output.includes("error: build failed"));
});

await okAsync("context-saver: handles non-string output via JSON.stringify", async () => {
  const fakeClient = { tui: { showToast: async () => {} }, app: { log: async () => {} } };
  const plugin = await ToolCompactPlugin({ client: fakeClient }, {});
  const t = { callID: "4", tool: "read", args: { filePath: "/foo" } };
  await plugin["tool.execute.before"](t);
  const output = { output: { key: "value", nested: { a: 1 } } };
  await plugin["tool.execute.after"](t, output);
  // small JSON -> untouched (still object, not stringified), no throw
  assert.ok(output.output !== null);
});

await okAsync("context-saver: chat.message emits toast", async () => {
  let toastMsg = "";
  const fakeClient = { tui: { showToast: async ({ body }) => { toastMsg = body.message; } }, app: { log: async () => {} } };
  const plugin = await ToolCompactPlugin({ client: fakeClient }, {});
  const t = { callID: "5", tool: "bash", args: { command: "echo hi" } };
  await plugin["tool.execute.before"](t);
  await plugin["tool.execute.after"](t, { output: "hi" });
  await plugin["chat.message"]({}, {});
  assert.ok(toastMsg.includes("Araç Özeti"));
  assert.ok(toastMsg.includes("bash("));
});

// --- build-tracker plugin ---
await okAsync("build-tracker: detects build command on before", async () => {
  const logs = [];
  const origLog = console.log;
  console.log = (...a) => logs.push(a.join(" "));
  const fakeClient = { app: { log: async () => {} } };
  const plugin = await BuildHooksPlugin({ client: fakeClient }, { thresholdMs: 120000 });
  const t = { callID: "b1", tool: "bash", args: { command: "npm run build" } };
  await plugin["tool.execute.before"](t, { args: t.args });
  assert.ok(logs.some(l => l.includes("onBuildStart") && l.includes("npm run build")));
  // after without error should end session with success
  logs.length = 0;
  await plugin["tool.execute.after"](t, { output: "build succeeded" });
  assert.ok(logs.some(l => l.includes("onBuildSuccess")));
  console.log = origLog;
});

await okAsync("build-tracker: non-build command does not start session", async () => {
  const logs = [];
  const origLog = console.log;
  console.log = (...a) => logs.push(a.join(" "));
  const fakeClient = { app: { log: async () => {} } };
  const plugin = await BuildHooksPlugin({ client: fakeClient }, {});
  const t = { callID: "b2", tool: "bash", args: { command: "echo hello" } };
  await plugin["tool.execute.before"](t, { args: t.args });
  assert.ok(!logs.some(l => l.includes("onBuildStart")));
  // after should be no-op (no session)
  const out = { output: "hello" };
  await plugin["tool.execute.after"](t, out);
  assert.equal(out.metadata, undefined); // no session => no metadata injected
  console.log = origLog;
});

await okAsync("build-tracker: failure detected via error in output", async () => {
  const logs = [];
  const origLog = console.log;
  console.log = (...a) => logs.push(a.join(" "));
  const fakeClient = { app: { log: async () => {} } };
  const plugin = await BuildHooksPlugin({ client: fakeClient }, {});
  const t = { callID: "b3", tool: "bash", args: { command: "cargo build" } };
  await plugin["tool.execute.before"](t, { args: t.args });
  const out = { output: "error: compilation failed" };
  await plugin["tool.execute.after"](t, out);
  assert.ok(logs.some(l => l.includes("onBuildFailure")));
  assert.equal(out.metadata.build.status, "failed");
  console.log = origLog;
});

await okAsync("build-tracker: metadata thresholdExceeded flag", async () => {
  const fakeClient = { app: { log: async () => {} } };
  const plugin = await BuildHooksPlugin({ client: fakeClient }, { thresholdMs: 1 }); // tiny threshold
  const t = { callID: "b4", tool: "bash", args: { command: "tsc --noEmit" } };
  await plugin["tool.execute.before"](t, { args: t.args });
  // wait 5ms to exceed threshold
  await new Promise(r => setTimeout(r, 5));
  const out = { output: "ok" };
  await plugin["tool.execute.after"](t, out);
  assert.equal(out.metadata.build.thresholdExceeded, true);
});

await okAsync("build-tracker: chained command detected", async () => {
  const logs = [];
  const origLog = console.log;
  console.log = (...a) => logs.push(a.join(" "));
  const fakeClient = { app: { log: async () => {} } };
  const plugin = await BuildHooksPlugin({ client: fakeClient }, {});
  const t = { callID: "b5", tool: "bash", args: { command: "cd web && npm run build" } };
  await plugin["tool.execute.before"](t, { args: t.args });
  assert.ok(logs.some(l => l.includes("onBuildStart")));
  console.log = origLog;
});

await okAsync("build-tracker: event command.executed starts session", async () => {
  const logs = [];
  const origLog = console.log;
  console.log = (...a) => logs.push(a.join(" "));
  const fakeClient = { app: { log: async () => {} } };
  const plugin = await BuildHooksPlugin({ client: fakeClient }, {});
  await plugin["event"]({ event: { type: "command.executed", command: "vite build" } });
  assert.ok(logs.some(l => l.includes("onBuildStart")));
  console.log = origLog;
});

console.log(`\n--- SONUÇ: ${pass} geçti, ${fail} kaldı ---`);
process.exit(fail > 0 ? 1 : 0);
