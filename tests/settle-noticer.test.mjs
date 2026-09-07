/**
 * Unit tests for opencode-settle-noticer.
 * Lib mantığını (parse + final + notified + scan + notice) ve hook
 * idempotency'sini hook framework'ünden bağımsız test eder.
 *
 * Not: hook'un kendisi opencode runtime'ında çalışır; burada pure
 * fonksiyonlar + sahte (t, output) objeleriyle davranış test edilir.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  NOTICE_SENTINEL,
  DISCLOSURE_SENTINEL,
  DEFAULT_SKIP_CONTAINS,
  parseStatusFile,
  isFinal,
  notifiedPath,
  isNotified,
  markNotified,
  resolveEventDirs,
  scanSettled,
  buildNotice,
  buildPendingSuffix,
} from "../dist/plugins/lib/settle-notice.js"
import settleFactory from "../dist/plugins/opencode-settle-noticer.js"

function mktmp() {
  const d = join(tmpdir(), `sn-test-${Date.now()}-${Math.floor(Math.random() * 1e6)}`)
  mkdirSync(d, { recursive: true })
  return d
}

function writeStatus(dir, name, rec) {
  const p = join(dir, `${name}.status.json`)
  writeFileSync(p, JSON.stringify(rec), "utf8")
  return p
}

const PASSED = {
  ts: "2026-09-07T21:12:39Z",
  name: "j1-kanitli",
  event: "PASSED",
  detail: "derleme geçti (2109sn)",
  log: "/tmp/x/j1-kanitli.log",
  exit: 0,
}
const HEARTBEAT = {
  ts: "2026-09-07T21:11:56Z",
  name: "j1-kanitli",
  event: "HEARTBEAT",
  detail: "2065sn geçti",
  log: "/tmp/x/j1-kanitli.log",
}

test("parseStatusFile: real PASSED shape", () => {
  const d = mktmp()
  try {
    const p = writeStatus(d, "j1-kanitli", PASSED)
    const rec = parseStatusFile(p)
    assert.ok(rec)
    assert.equal(rec.name, "j1-kanitli")
    assert.equal(rec.event, "PASSED")
    assert.equal(rec.exit, 0)
    assert.equal(rec.statusPath, p)
  } finally {
    rmSync(d, { recursive: true, force: true })
  }
})

test("parseStatusFile: HEARTBEAT parses but isFinal false", () => {
  const d = mktmp()
  try {
    // exit yok → parse null (final-dışı kayıtlar forma uymaz)
    const p = writeStatus(d, "j1-kanitli", HEARTBEAT)
    assert.equal(parseStatusFile(p), null)
  } finally {
    rmSync(d, { recursive: true, force: true })
  }
})

test("parseStatusFile: malformed JSON → null", () => {
  const d = mktmp()
  try {
    const p = join(d, "x.status.json")
    writeFileSync(p, "{bozuk", "utf8")
    assert.equal(parseStatusFile(p), null)
  } finally {
    rmSync(d, { recursive: true, force: true })
  }
})

test("parseStatusFile: missing file → null, wrong shape → null", () => {
  assert.equal(parseStatusFile(join(tmpdir(), "sn-yok-boyle-dosya.status.json")), null)
  const d = mktmp()
  try {
    const p = join(d, "y.status.json")
    writeFileSync(p, JSON.stringify({ foo: 1 }), "utf8")
    assert.equal(parseStatusFile(p), null)
  } finally {
    rmSync(d, { recursive: true, force: true })
  }
})

test("isFinal: exit 0/124 true, exit alanı yoksa n/a", () => {
  assert.equal(isFinal({ exit: 0 }), true)
  assert.equal(isFinal({ exit: 124 }), true)
  assert.equal(isFinal({ exit: "124" }), true)
})

test("notified roundtrip: mark → isNotified true, yeni ts → false", () => {
  const d = mktmp()
  try {
    const rec = { ...PASSED, statusPath: join(d, "j.status.json") }
    assert.equal(isNotified(d, rec), false)
    markNotified(d, rec)
    assert.ok(existsSync(notifiedPath(d, "j1-kanitli")))
    assert.equal(isNotified(d, rec), true)
    assert.equal(isNotified(d, { ...rec, ts: "2026-09-08T00:00:00Z" }), false)
    assert.equal(isNotified(d, { ...rec, event: "FAILED" }), false)
  } finally {
    rmSync(d, { recursive: true, force: true })
  }
})

test("scanSettled: sadece bildirilmemiş finaller", () => {
  const d = mktmp()
  try {
    writeStatus(d, "a", { ...PASSED, name: "a", ts: "2026-09-07T20:00:00Z" })
    writeStatus(d, "b", { ...PASSED, name: "b", event: "FAILED", exit: 1, ts: "2026-09-07T21:00:00Z" })
    writeStatus(d, "c", { ...HEARTBEAT, name: "c" })
    writeFileSync(join(d, "cop.status.json"), "çöp", "utf8")
    const found = scanSettled([d], 20)
    assert.deepEqual(found.map((r) => r.name), ["a", "b"])
    // işaretle → ikinci tara boş
    for (const r of found) markNotified(d, r)
    assert.deepEqual(scanSettled([d], 20), [])
  } finally {
    rmSync(d, { recursive: true, force: true })
  }
})

test("scanSettled: yok dizin → [], maxFiles cap", () => {
  assert.deepEqual(scanSettled([join(tmpdir(), "sn-yok-dizin")], 20), [])
  const d = mktmp()
  try {
    for (let i = 0; i < 5; i++) {
      writeStatus(d, `n${i}`, { ...PASSED, name: `n${i}`, ts: `2026-09-07T2${i}:00:00Z` })
    }
    assert.equal(scanSettled([d], 2).length, 2)
  } finally {
    rmSync(d, { recursive: true, force: true })
  }
})

test("buildNotice: sentinel + ad + olay + exit", () => {
  const txt = buildNotice([{ ...PASSED, statusPath: "/e/j.status.json" }])
  assert.ok(txt.includes(NOTICE_SENTINEL))
  assert.ok(txt.includes("j1-kanitli"))
  assert.ok(txt.includes("PASSED"))
  assert.ok(txt.includes("exit=0"))
  assert.ok(txt.includes("/e/j.status.json"))
})

test("resolveEventDirs: explicit passthrough, env, var olmayan elenir", () => {
  const d = mktmp()
  try {
    assert.deepEqual(resolveEventDirs([d]), [d])
    assert.deepEqual(resolveEventDirs(["/yok-boyle-dizin-sn"]), [])
    const withEnv = resolveEventDirs(undefined, { BUILD_MON_DIR: d }, "/yok-cwd")
    assert.deepEqual(withEnv, [d])
    assert.deepEqual(resolveEventDirs(undefined, {}, "/yok-cwd"), [])
  } finally {
    rmSync(d, { recursive: true, force: true })
  }
})

test("hook: bildirilmemiş PASSED → nota eklenir, ikinci çağrı sessiz", async () => {
  const d = mktmp()
  try {
    writeStatus(d, "k", { ...PASSED, name: "k", ts: "2026-09-07T22:00:00Z" })
    const inst = await settleFactory({ directory: "/tmp" }, { eventDirs: [d] })
    const after = inst["tool.execute.after"]
    const out1 = { output: "derleme çıktısı" }
    await after({ tool: "bash", args: {} }, out1)
    assert.ok(out1.output.includes(NOTICE_SENTINEL))
    assert.ok(out1.output.includes(" k PASSED "))
    const out2 = { output: "başka çıktı" }
    await after({ tool: "bash", args: {} }, out2)
    assert.equal(out2.output, "başka çıktı")
  } finally {
    rmSync(d, { recursive: true, force: true })
  }
})

test("hook: enabled:false → dokunmaz", async () => {
  const d = mktmp()
  try {
    writeStatus(d, "k", { ...PASSED, name: "k" })
    const inst = await settleFactory({ directory: "/tmp" }, { enabled: false, eventDirs: [d] })
    const out = { output: "x" }
    await inst["tool.execute.after"]({ tool: "bash", args: {} }, out)
    assert.equal(out.output, "x")
  } finally {
    rmSync(d, { recursive: true, force: true })
  }
})

test("hook: skip marker varsa → dokunmaz", async () => {
  const d = mktmp()
  try {
    writeStatus(d, "k", { ...PASSED, name: "k" })
    const inst = await settleFactory({ directory: "/tmp" }, { eventDirs: [d] })
    const out = { output: "x" }
    await inst["tool.execute.after"](
      { tool: "bash", args: { command: `ls ${DEFAULT_SKIP_CONTAINS}` } },
      out,
    )
    assert.equal(out.output, "x")
  } finally {
    rmSync(d, { recursive: true, force: true })
  }
})

test("hook: disclosure bir kez (sentinel idempotent)", async () => {
  const inst = await settleFactory({ directory: "/tmp" }, {})
  const tr = inst["experimental.chat.system.transform"]
  const out = { system: [] }
  await tr({}, out)
  await tr({}, out)
  assert.equal(out.system.filter((s) => s.includes(DISCLOSURE_SENTINEL)).length, 1)
})

test("buildPendingSuffix: boş → '', dolu → ad+olay+exit", () => {
  assert.equal(buildPendingSuffix([]), "")
  const s = buildPendingSuffix([{ ...PASSED, statusPath: "/e/j.status.json" }])
  assert.ok(s.includes("j1-kanitli"))
  assert.ok(s.includes("PASSED"))
  assert.ok(s.includes("exit=0"))
})

test("transform: bekleyen settle disclosure'a gömülür (snapshot)", async () => {
  const d = mktmp()
  try {
    writeStatus(d, "k", { ...PASSED, name: "k", ts: "2026-09-07T22:00:00Z" })
    const inst2 = await settleFactory({ directory: "/tmp" }, { eventDirs: [d] })
    const out = { system: [] }
    await inst2["experimental.chat.system.transform"]({}, out)
    assert.equal(out.system.length, 1)
    assert.ok(out.system[0].includes(DISCLOSURE_SENTINEL))
    assert.ok(out.system[0].includes("k PASSED (exit=0)"))
  } finally {
    rmSync(d, { recursive: true, force: true })
  }
})

test("transform: bekleyen yoksa statik metin (ek yok)", async () => {
  const d = mktmp()
  try {
    const inst = await settleFactory({ directory: "/tmp" }, { eventDirs: [d] })
    const out = { system: [] }
    await inst["experimental.chat.system.transform"]({}, out)
    assert.equal(out.system.length, 1)
    assert.ok(!out.system[0].includes("Pending settles:"))
  } finally {
    rmSync(d, { recursive: true, force: true })
  }
})
