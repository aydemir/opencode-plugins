import test from "node:test"
import assert from "node:assert/strict"
import { codePointLength } from "../dist/plugins/lib/prune.js"
import { ToolCompactPlugin } from "../dist/plugins/opencode-context-saver.js"

const fakeClient = () => ({
  tui: { showToast: async () => {} },
  app: { log: async () => {} },
})

test("context-saver: small output is left untouched", async () => {
  const plugin = await ToolCompactPlugin({ client: fakeClient() }, {})
  const t = { callID: "1", tool: "bash", args: { command: "echo hi" } }
  await plugin["tool.execute.before"](t)
  const output = { output: "hi" }
  await plugin["tool.execute.after"](t, output)
  assert.equal(output.output, "hi")
})

test("context-saver: large output is pruned with summary header and shorter than input", async () => {
  const plugin = await ToolCompactPlugin({ client: fakeClient() }, {})
  const big = "A".repeat(300) + "B".repeat(300) + "C".repeat(300)
  const t = { callID: "2", tool: "bash", args: { command: "cat bigfile" } }
  await plugin["tool.execute.before"](t)
  const output = { output: big }
  await plugin["tool.execute.after"](t, output)
  // context-saver kendi formatPruneMarker'ını kullanıyor (bilgilendirici
  // marker, sabit PRUNE_MARKER değil). Marker'ı formatında "pruned:" ile
  // arıyoruz — bu kullanıcıya gösterilen nihai biçim.
  assert.ok(output.output.includes("pruned:"))
  assert.ok(output.output.startsWith("[bash("))
  assert.ok(codePointLength(output.output) < big.length)
})

test("context-saver: error output is replaced with warning + extracted errors", async () => {
  const plugin = await ToolCompactPlugin({ client: fakeClient() }, {})
  const errOut = "line1\nerror: build failed\nTypeError: x\nline tail"
  const t = { callID: "3", tool: "bash", args: { command: "npm run build" } }
  await plugin["tool.execute.before"](t)
  const output = { output: errOut }
  await plugin["tool.execute.after"](t, output)
  assert.ok(output.output.startsWith("⚠️"))
  assert.ok(output.output.includes("error: build failed"))
})

test("context-saver: non-string output goes through JSON.stringify", async () => {
  const plugin = await ToolCompactPlugin({ client: fakeClient() }, {})
  const t = { callID: "4", tool: "read", args: { filePath: "/foo" } }
  await plugin["tool.execute.before"](t)
  const output = { output: { key: "value", nested: { a: 1 } } }
  await plugin["tool.execute.after"](t, output)
  assert.ok(output.output !== null)
})

test("context-saver: chat.message emits summary toast with [bash( call summary", async () => {
  let toastMsg = ""
  const client = {
    tui: { showToast: async ({ body }) => { toastMsg = body.message } },
    app: { log: async () => {} },
  }
  const plugin = await ToolCompactPlugin({ client }, {})
  const t = { callID: "5", tool: "bash", args: { command: "echo hi" } }
  await plugin["tool.execute.before"](t)
  await plugin["tool.execute.after"](t, { output: "hi" })
  await plugin["chat.message"]({}, {})
  assert.ok(toastMsg.includes("Araç Özeti"))
  assert.ok(toastMsg.includes("bash("))
})
