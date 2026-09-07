/**
 * Regression tests for scripts/build-mon.sh push/event channels.
 *
 * Manuel smoke testlerin (TASK-122) otomatik hali: script child-process
 * olarak koşturulur, stdout banner + events.jsonl + status/result +
 * log silme/arşivleme + rotasyon assert edilir.
 *
 * Yavaş yollar kapsanmaz: INTERRUPTED (sinyal enjeksiyonu flaky),
 * --kill-on-stall ile öldürme (zamanlayıcı-flaky). Hızlı yollar
 * (--heartbeat 0, küçük --stall-after/--timeout) kullanılır.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"
import { join, dirname } from "node:path"

const SCRIPT = fileURLToPath(new URL("../scripts/build-mon.sh", import.meta.url))
const ROOT = dirname(dirname(fileURLToPath(new URL(".", import.meta.url))))

function mktmp() {
  return mkdtempSync(join(tmpdir(), "bm-test-"))
}

function run(args, execTimeout = 30000) {
  try {
    const stdout = execFileSync("bash", [SCRIPT, ...args], {
      encoding: "utf8",
      timeout: execTimeout,
      cwd: ROOT,
    })
    return { exit: 0, stdout }
  } catch (e) {
    return { exit: e.status ?? -1, stdout: String(e.stdout ?? "") }
  }
}

function events(dir) {
  const raw = readFileSync(join(dir, "events.jsonl"), "utf8").trim()
  return raw.length === 0 ? [] : raw.split("\n").map((l) => JSON.parse(l))
}

function ls(dir) {
  return existsSync(dir) ? readdirSync(dir) : []
}

test("PASSED: exit 0 + banner + events + log silinir", () => {
  const d = mktmp()
  const r = run(["--name", "t1", "--event-dir", d, "--heartbeat", "0", "--", "true"])
  assert.equal(r.exit, 0)
  assert.ok(r.stdout.includes("<<< BUILD-MON [t1] PASSED"))
  const evs = events(d).map((e) => e.event)
  assert.ok(evs.includes("STARTED"))
  assert.ok(evs.includes("PASSED"))
  const passed = events(d).find((e) => e.event === "PASSED")
  assert.equal(passed.exit, 0)
  assert.equal(existsSync(join(d, "t1.log")), false)
  const status = JSON.parse(readFileSync(join(d, "t1.status.json"), "utf8"))
  assert.equal(status.event, "PASSED")
})

test("FAILED: exit taşınır + log arşivlenir + banner", () => {
  const d = mktmp()
  const r = run([
    "--name", "t2", "--event-dir", d, "--heartbeat", "0", "--",
    "bash", "-c", "echo oops-error; exit 3",
  ])
  assert.equal(r.exit, 3)
  assert.ok(r.stdout.includes("<<< BUILD-MON [t2] FAILED"))
  const arch = ls(d).find((f) => /^t2\.log\.failed-\d{8}T\d{6}Z$/.test(f))
  assert.ok(arch, `arşiv yok: ${ls(d)}`)
  assert.ok(readFileSync(join(d, arch), "utf8").includes("oops-error"))
  const failed = events(d).find((e) => e.event === "FAILED")
  assert.equal(failed.exit, 3)
  assert.ok(failed.log.endsWith(`/${arch}`))
})

test("TIMED_OUT: exit 124 + timed_out arşivi", () => {
  const d = mktmp()
  const r = run(
    ["--name", "t7", "--event-dir", d, "--heartbeat", "0", "--timeout", "1", "--", "sleep", "5"],
    45000,
  )
  assert.equal(r.exit, 124)
  assert.ok(r.stdout.includes("TIMED_OUT"))
  assert.ok(ls(d).some((f) => /^t7\.log\.timed_out-/.test(f)))
}, { timeout: 60000 })

test("STALLED uyarısı sonra PASSED (ara-stall notuyla)", () => {
  const d = mktmp()
  const r = run(
    ["--name", "t4", "--event-dir", d, "--heartbeat", "0", "--stall-after", "1",
      "--", "bash", "-c", "sleep 3"],
    45000,
  )
  assert.equal(r.exit, 0)
  const evs = events(d).map((e) => e.event)
  assert.ok(evs.includes("STALLED"))
  const passed = events(d).find((e) => e.event === "PASSED")
  assert.ok(passed.detail.includes("ara stall uyarısı vardı"))
}, { timeout: 60000 })

test("events boyut rotasyonu: arşiv + taze başlangıç", () => {
  const d = mktmp()
  writeFileSync(join(d, "events.jsonl"), "x".repeat(2000), "utf8")
  const r = run([
    "--name", "t3", "--event-dir", d, "--heartbeat", "0",
    "--rotate-size", "1000", "--", "true",
  ])
  assert.equal(r.exit, 0)
  assert.ok(ls(d).some((f) => /^events-\d{8}T\d{6}Z\.jsonl$/.test(f)))
  const evs = events(d).map((e) => e.event)
  assert.ok(evs.includes("STARTED"))
  assert.ok(evs.includes("PASSED"))
})

test("rotate-keep: eski arşivler budanır", () => {
  const d = mktmp()
  writeFileSync(join(d, "events.jsonl"), "old\n", "utf8")
  for (const n of ["20200101000000", "20210101000000", "20220101000000"]) {
    writeFileSync(join(d, `events-${n}Z.jsonl`), "a\n", "utf8")
  }
  const r = run([
    "--name", "t5", "--event-dir", d, "--heartbeat", "0",
    "--rotate-size", "1", "--rotate-keep", "2", "--", "true",
  ])
  assert.equal(r.exit, 0)
  const arch = ls(d).filter((f) => /^events-.*\.jsonl$/.test(f))
  assert.equal(arch.length, 2)
})

test("geçersiz flag değeri → exit 2", () => {
  const d = mktmp()
  const r = run(["--name", "t9", "--event-dir", d, "--rotate-size", "abc", "--", "true"])
  assert.equal(r.exit, 2)
})
