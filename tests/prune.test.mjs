import test from "node:test"
import assert from "node:assert/strict"
import {
  PRUNE_MARKER,
  codePointLength,
  pruneMiddle,
  extractSummarySafe,
  isBuildCommand,
  extractErrors,
  resolvePruneBudget,
} from "../dist/plugins/lib/prune.js"

test("codePointLength counts code points, not UTF-16 units", () => {
  assert.equal(codePointLength("hello"), 5)
  assert.equal(codePointLength("👍"), 1)
  assert.equal(codePointLength("a👍b"), 3)
})

test("pruneMiddle: large text kept shape is head+marker+tail", () => {
  const big = "A".repeat(250) + "B".repeat(500) + "C".repeat(250)
  const out = pruneMiddle(big, { headChars: 100, tailChars: 50 })
  assert.ok(out.includes(PRUNE_MARKER.trim()))
  assert.ok(out.startsWith("A".repeat(100)))
  assert.ok(out.endsWith("C".repeat(50)))
  assert.ok(codePointLength(out) < codePointLength(big))
  assert.equal(codePointLength(out), 100 + codePointLength(PRUNE_MARKER) + 50)
})

test("pruneMiddle: small text passes through unchanged", () => {
  const small = "hello"
  assert.equal(pruneMiddle(small, { headChars: 100, tailChars: 50 }), small)
})

test("pruneMiddle: second pass on already-pruned input throws (fail-fast guard)", () => {
  // Eski test "idempotent" yazıyordu; gerçek davranışta pruneMiddle
  // ikinci geçişte resultLen === points.length olacağını görünce throw
  // eder (no-op prune'u sessizce kabul etmek yerine). Bu bilinçli
  // fail-fast — sessiz no-op call-site'ları maskeler. Davranış değişirse
  // bu test güncellenmeli.
  const big = "X".repeat(1000)
  const once = pruneMiddle(big, { headChars: 100, tailChars: 50 })
  assert.throws(
    () => pruneMiddle(once, { headChars: 100, tailChars: 50 }),
    /replacement.*must be < input/,
  )
})

test("resolvePruneBudget: valid head+marker+tail under threshold is OK", () => {
  resolvePruneBudget({ compressThreshold: 500, headChars: 100, tailChars: 50 })
})

test("resolvePruneBudget: invalid budget throws", () => {
  assert.throws(() =>
    resolvePruneBudget({ compressThreshold: 100, headChars: 100, tailChars: 50 }),
  )
})

test("isBuildCommand: tokens + phrases + chained segments", () => {
  assert.equal(isBuildCommand("npm run build"), true)
  assert.equal(isBuildCommand("cargo build"), true)
  assert.equal(isBuildCommand("tsc --noEmit"), true)
  assert.equal(isBuildCommand("vite build"), true)
  assert.equal(isBuildCommand("docker build -t foo ."), true)
  assert.equal(isBuildCommand("cd web && npm run build"), true)
  assert.equal(isBuildCommand("ls -la"), false)
  assert.equal(isBuildCommand("echo hello"), false)
  assert.equal(isBuildCommand("rain run something"), true)
  assert.equal(isBuildCommand("pip install requests"), true)
  assert.equal(isBuildCommand("training model"), false)
})

test("isBuildCommand: case-insensitive first token", () => {
  assert.equal(isBuildCommand("NPM RUN BUILD"), true)
})

test("extractErrors: captures error lines + last-tail always kept", () => {
  const out = [
    "line1",
    "error: something failed",
    "line3",
    "TypeError: x is not defined",
    "line5",
    "line6 tail",
  ].join("\n")
  const errs = extractErrors(out, { maxLines: 15, tailLines: 5 })
  assert.ok(errs.some((l) => l.includes("error: something failed")))
  assert.ok(errs.some((l) => l.includes("TypeError")))
  assert.ok(errs.includes("line6 tail"))
})

test("extractSummarySafe: truncates per-key values", () => {
  const s = extractSummarySafe(
    "bash",
    { command: "a".repeat(100), extra: "b".repeat(100) },
    { maxCharsPerKey: 10, maxSummaryChars: 200 },
  )
  assert.ok(s.includes("bash("))
  assert.ok(s.includes("…"))
})

test("extractSummarySafe: missing args returns empty parts", () => {
  const s = extractSummarySafe("read", null)
  assert.equal(s, "read(, )")
})
