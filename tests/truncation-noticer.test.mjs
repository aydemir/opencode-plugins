/**
 * Unit tests for opencode-truncation-noticer.
 * Plugin'in iç mantığını (parse + marker build + dosya sayımı)
 * hook framework'ünden bağımsız test eder.
 *
 * Not: hook'un kendisi opencode runtime'ında çalışır; burada sadece
 * pure fonksiyonları test ediyoruz. Runtime canlı test ayrıca yapılır.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  MARKER_SENTINEL,
  DISCLOSURE_SENTINEL,
  countLines,
  parseLastLineNo,
  buildMarker,
} from "../dist/plugins/lib/truncation-notice.js"

const SEP = "\t"

test("parseLastLineNo: parse real read-tool format", () => {
  const out = "1\tfoo\n2\tbar\n3\tbaz\n"
  assert.equal(parseLastLineNo(out), 3)
})

test("parseLastLineNo: out-of-order line numbers (keep max)", () => {
  const out = "10\tfoo\n5\tbar\n12\tbaz\n3\tqux\n"
  assert.equal(parseLastLineNo(out), 12)
})

test("parseLastLineNo: empty output → 0", () => {
  assert.equal(parseLastLineNo(""), 0)
})

test("parseLastLineNo: malformed output → 0 (graceful)", () => {
  assert.equal(parseLastLineNo("just text\nno tabs\n"), 0)
})

test("parseLastLineNo: ignores non-numeric prefixes", () => {
  const out = "abc\tfoo\n2\tbar\n"
  assert.equal(parseLastLineNo(out), 2)
})

test("countLines: single line no newline", () => {
  assert.equal(countLines("hello"), 1)
})

test("countLines: multi-line (wc -l semantics)", () => {
  assert.equal(countLines("a\nb\nc\n"), 3)
})

test("countLines: trailing newline (wc -l semantics)", () => {
  assert.equal(countLines("a\nb\n"), 2)
})

test("countLines: no trailing newline", () => {
  assert.equal(countLines("a\nb\nc"), 3)
})

test("countLines: empty → 0", () => {
  assert.equal(countLines(""), 0)
})

test("buildMarker: contains all required parts", () => {
  const m = buildMarker(3, 116, "/tmp/foo.md", 4)
  assert.ok(m.includes(MARKER_SENTINEL), "marker sentinel")
  assert.ok(m.includes("113 more lines"), "remaining count")
  assert.ok(m.includes("of 116 total"), "total")
  assert.ok(m.includes("offset=4"), "next offset hint")
  assert.ok(m.includes("sed -n '4,116p' /tmp/foo.md"), "bash_raw hint")
})

test("end-to-end: integration with real file", () => {
  const dir = mkdtempSync(join(tmpdir(), "tn-test-"))
  const f = join(dir, "sample.txt")
  const lines = []
  for (let i = 1; i <= 116; i++) lines.push(`line content ${i}`)
  writeFileSync(f, lines.join("\n") + "\n")

  try {
    assert.ok(existsSync(f))
    const content = readFileSync(f, "utf8")
    const totalLines = countLines(content)
    assert.equal(totalLines, 116)

    // OpenCode-style output: read with offset=4 limit=4 → lines 4-7
    const offset = 4
    const limit = 4
    const slice = lines.slice(offset - 1, offset - 1 + limit)
    const fakeOutput = slice
      .map((l, i) => `${offset + i}${SEP}${l}`)
      .join("\n") + "\n"

    const last = parseLastLineNo(fakeOutput)
    assert.equal(last, 7)
    assert.ok(last < totalLines, "should trigger truncation")

    const marker = buildMarker(last, totalLines, f, last + 1)
    assert.ok(marker.includes("109 more lines after line 7"))
    assert.ok(marker.includes("of 116 total"))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("end-to-end: full file read → no marker expected", () => {
  const dir = mkdtempSync(join(tmpdir(), "tn-test-"))
  const f = join(dir, "small.txt")
  writeFileSync(f, "a\nb\nc\n")

  try {
    const content = readFileSync(f, "utf8")
    const totalLines = countLines(content)
    assert.equal(totalLines, 3)

    const fakeOutput = `1${SEP}a\n2${SEP}b\n3${SEP}c\n`
    const last = parseLastLineNo(fakeOutput)
    assert.equal(last, 3)
    assert.equal(last >= totalLines, true, "should NOT trigger marker")
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("exports: sentinel + disclosure constants", () => {
  assert.equal(MARKER_SENTINEL, "[tn] truncated:")
  assert.ok(DISCLOSURE_SENTINEL.includes("[tn-"))
})