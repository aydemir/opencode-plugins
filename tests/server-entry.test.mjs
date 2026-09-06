import test from "node:test"
import assert from "node:assert/strict"
import * as serverEntry from "../dist/plugins/server.js"

// opencode 1.18.29 `opencode plugin <pkg>` manifest sözleşmesi:
// exports["./server"] çözümlenmeli ve modülün TÜM export değerleri
// function olmalı (getLegacyPlugins Object.values iterate eder,
// function olmayan tek export tüm paketi düşürür).

test("server entry: exposes exactly the three plugin factories", () => {
  assert.deepEqual(Object.keys(serverEntry).sort(), [
    "buildTracker",
    "contextSaver",
    "truncationNoticer",
  ])
  for (const [name, value] of Object.entries(serverEntry)) {
    assert.equal(typeof value, "function", `${name} must be a function`)
  }
})

test("server entry: every factory instantiates with hooks", async () => {
  for (const [name, factory] of Object.entries(serverEntry)) {
    const instance = await factory({ directory: "/tmp" }, {})
    assert.ok(
      Object.keys(instance).length > 0,
      `${name} instance must expose hooks`,
    )
    assert.equal(typeof (instance.dispose ?? instance["tool.execute.after"]), "function")
  }
})

test("server entry: shared options object reaches all factories", async () => {
  const cs = await serverEntry.contextSaver({ directory: "/tmp" }, { enabled: false })
  assert.equal(typeof cs["tool.execute.after"], "function")
  const bt = await serverEntry.buildTracker({ directory: "/tmp" }, { verbose: false })
  assert.equal(typeof bt["tool.execute.after"], "function")
  const tn = await serverEntry.truncationNoticer({ directory: "/tmp" }, {})
  assert.equal(typeof tn["tool.execute.after"], "function")
})
