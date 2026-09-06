/**
 * Unit tests for opencode-cpu-liveness disclosure.
 * Önceki disclosure testleriyle aynı pattern (TASK-107/111):
 * hook framework'ünden bağımsız — sabitler + transform hook davranışı.
 */

import test from "node:test"
import assert from "node:assert/strict"
import {
  CPU_LIVENESS_SENTINEL,
  CPU_LIVENESS_TEXT,
} from "../dist/plugins/lib/cpu-liveness-disclosure.js"
import CpuLivenessPlugin from "../dist/plugins/opencode-cpu-liveness.js"

test("sentinel is bracketed marker", () => {
  assert.equal(CPU_LIVENESS_SENTINEL, "[cpu-liveness]")
})

test("text contains sentinel + agent invocation + exit codes", () => {
  assert.ok(CPU_LIVENESS_TEXT.includes(CPU_LIVENESS_SENTINEL))
  assert.ok(CPU_LIVENESS_TEXT.includes("cpu-liveness-agent"))
  assert.ok(CPU_LIVENESS_TEXT.includes("0=clean"))
  assert.ok(CPU_LIVENESS_TEXT.includes("--allow-kill"))
})

test("text is self-sufficient: example + flag placement + shell-join note", () => {
  assert.ok(CPU_LIVENESS_TEXT.includes("npm run build"))
  assert.ok(CPU_LIVENESS_TEXT.includes("BEFORE --"))
  assert.ok(CPU_LIVENESS_TEXT.includes("/bin/bash -c"))
})

test("transform hook: pushes disclosure once (idempotent)", async () => {
  const instance = await CpuLivenessPlugin({ directory: "/tmp" }, {})
  const output = { system: [] }
  await instance["experimental.chat.system.transform"]({}, output)
  assert.equal(output.system.length, 1)
  assert.ok(output.system[0].includes(CPU_LIVENESS_SENTINEL))
  // second call: no duplicate
  await instance["experimental.chat.system.transform"]({}, output)
  assert.equal(output.system.length, 1)
})

test("transform hook: skips when already disclosed", async () => {
  const instance = await CpuLivenessPlugin({ directory: "/tmp" }, {})
  const output = { system: ["earlier [cpu-liveness] note"] }
  await instance["experimental.chat.system.transform"]({}, output)
  assert.equal(output.system.length, 1)
})

test("transform hook: enabled:false disables disclosure", async () => {
  const instance = await CpuLivenessPlugin(
    { directory: "/tmp", config: { enabled: false } },
    {},
  )
  const output = { system: [] }
  await instance["experimental.chat.system.transform"]({}, output)
  assert.equal(output.system.length, 0)
})
