/**
 * Regression tests for scripts/hbmon-build-mon.sh
 * (TASK-004: build-mon.sh sözleşmesi, hbmon motoru).
 *
 * Strateji: gerçek hbmon ikiliği yoksa bile çalışan fake-hbmon shim'i
 * (PATH başına konan bash script) ile olay haritalama deterministik
 * test edilir; gerçek ikilik testleri HBMON_LIVE=1 ile kapılıdır
 * (opencode-plugins CI'da hbmon derlenmez).
 */

import test from "node:test"
import assert from "node:assert/strict"
import { execFileSync, execFile } from "node:child_process"
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  chmodSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"
import { join, dirname } from "node:path"

const SCRIPT = fileURLToPath(new URL("../scripts/hbmon-build-mon.sh", import.meta.url))
const ROOT = dirname(dirname(fileURLToPath(new URL(".", import.meta.url))))
const LIVE = !!process.env.HBMON_LIVE

const SHIM = `#!/usr/bin/env bash
# fake hbmon: watch=handshake, wait=sıradaki yanıt, kill/shutdown=ok.
cmd="$1"; shift
case "$cmd" in
  watch) printf '{"v":1,"ev":"ready","uuid":"%s","sock":"/tmp/hbmon-%s.sock","log":"/tmp/hbmon-%s.jsonl"}\\n' "$FAKE_UUID" "$FAKE_UUID" "$FAKE_UUID" ;;
  wait)
    n=$(ls "$FAKE_SEQ_DIR"/[0-9]*.json 2>/dev/null | wc -l)
    i=$(cat "$FAKE_SEQ_DIR/idx" 2>/dev/null || echo 0)
    [ "$i" -ge "$n" ] && i=$((n - 1))
    cat "$FAKE_SEQ_DIR/$i.json"
    echo $((i + 1)) > "$FAKE_SEQ_DIR/idx"
    ;;
  kill) echo '{"v":1,"ok":true,"killed":true}' ;;
  shutdown) echo '{"v":1,"ok":true,"ok_shutdown":true}' ;;
esac
exit 0
`

function mktmp() {
  return mkdtempSync(join(tmpdir(), "hbm-test-"))
}

function shimEnv(d, uuid) {
  const bin = join(d, "bin")
  mkdirSync(bin, { recursive: true })
  writeFileSync(join(bin, "hbmon"), SHIM)
  chmodSync(join(bin, "hbmon"), 0o755)
  const seq = join(d, "seq")
  mkdirSync(seq, { recursive: true })
  writeFileSync(join(seq, "idx"), "0")
  return {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    HBMON_BIN: "",
    FAKE_UUID: uuid,
    FAKE_SEQ_DIR: seq,
  }
}

function seq(env, responses) {
  responses.forEach((r, i) =>
    writeFileSync(join(env.FAKE_SEQ_DIR, `${i}.json`), JSON.stringify(r)),
  )
}

function run(args, env, execTimeout = 30000) {
  return new Promise((resolve) => {
    execFile(
      "bash",
      [SCRIPT, ...args],
      { encoding: "utf8", timeout: execTimeout, cwd: ROOT, env },
      (err, stdout, stderr) => {
        resolve({
          exit: err && typeof err.code === "number" ? err.code : 0,
          stdout: String(stdout ?? ""),
          stderr: String(stderr ?? ""),
        })
      },
    )
  })
}

function events(dir) {
  const raw = readFileSync(join(dir, "events.jsonl"), "utf8").trim()
  return raw.length === 0 ? [] : raw.split("\n").map((l) => JSON.parse(l))
}

const DONE0 = {
  v: 1, id: "x", ok: true, state: "done", code: 0, duration_sec: 1.2,
  exit_event: { code: 0, raw_code: 0, state: "done" },
}
const FAILED1 = {
  v: 1, id: "x", ok: true, state: "failed", code: 1, duration_sec: 1.0,
  exit_event: { code: 1, raw_code: 1, state: "failed" },
}
const STALL = { v: 1, id: "x", ok: true, state: "running", elapsed_sec: 31.0, woke_on: "stall_suspect" }
const DEP_EARLY = { v: 1, id: "x", ok: true, state: "running", woke_on: "dep_missing" }
const DEP_TERM = {
  v: 1, id: "x", ok: true, state: "dep_missing", code: 2, duration_sec: 3.0,
  exit_event: { code: 2, raw_code: 1, state: "dep_missing" },
}

test("PASSED: exit 0 + banner + status exit alanı (shim)", async () => {
  const d = mktmp()
  const env = shimEnv(d, "shimpass1")
  seq(env, [DONE0])
  const r = await run(["--name", "p1", "--event-dir", d, "--", "true"], env)
  assert.equal(r.exit, 0)
  assert.ok(r.stdout.includes("<<< BUILD-MON [p1] PASSED"))
  const evs = events(d).map((e) => e.event)
  assert.ok(evs.includes("STARTED"))
  assert.ok(evs.includes("PASSED"))
  const st = JSON.parse(readFileSync(join(d, "p1.status.json"), "utf8"))
  assert.equal(st.exit, 0)
})

test("FAILED: excerpt + exit kodu taşınır (shim)", async () => {
  const d = mktmp()
  const env = shimEnv(d, "shimfail1")
  writeFileSync("/tmp/hbmon-shimfail1.out", "blah\nerror TS1234: nope\nblah\n")
  seq(env, [FAILED1])
  const r = await run(["--name", "f1", "--event-dir", d, "--", "false"], env)
  assert.equal(r.exit, 1)
  assert.ok(r.stdout.includes("TS1234"), `excerpt yok: ${r.stdout}`)
  const st = JSON.parse(readFileSync(join(d, "f1.status.json"), "utf8"))
  assert.equal(st.event, "FAILED")
  assert.equal(st.exit, 1)
})

test("STALLED uyarısı bir kez + sonra PASSED (shim)", async () => {
  const d = mktmp()
  const env = shimEnv(d, "shimstall1")
  seq(env, [STALL, STALL, DONE0])
  const r = await run(["--name", "s1", "--event-dir", d, "--", "true"], env)
  assert.equal(r.exit, 0)
  const evs = events(d).map((e) => e.event)
  assert.equal(evs.filter((e) => e === "STALLED").length, 1)
  assert.equal(evs[evs.length - 1], "PASSED")
})

test("DEP_MISSING erken uyarı + terminal FAILED/2 (shim)", async () => {
  const d = mktmp()
  const env = shimEnv(d, "shimdep1")
  writeFileSync("/tmp/hbmon-shimdep1.out", "Cannot find module 'x'\n")
  seq(env, [DEP_EARLY, DEP_EARLY, DEP_TERM])
  const r = await run(["--name", "m1", "--event-dir", d, "--", "true"], env)
  assert.equal(r.exit, 2)
  const evs = events(d).map((e) => e.event)
  assert.equal(evs.filter((e) => e === "DEP_MISSING").length, 1)
  assert.equal(evs[evs.length - 1], "FAILED")
})

test("hbmon yoksa exit 2 + kurulum ipucu", async () => {
  const d = mktmp()
  const env = { ...process.env, HBMON_BIN: "/nonexistent-xyz/hbmon", PATH: "/usr/bin:/bin" }
  const r = await run(["--name", "n1", "--event-dir", d, "--", "true"], env, 10000)
  assert.equal(r.exit, 2)
  assert.ok((r.stderr + r.stdout).includes("cargo install"))
})

test("CANLI PASSED (gerçek hbmon)", { skip: !LIVE }, async () => {
  const d = mktmp()
  const r = await run(
    ["--name", "lp1", "--event-dir", d, "--", "true"],
    { ...process.env, HBMON_BIN: process.env.HBMON_BIN || "hbmon" },
  )
  assert.equal(r.exit, 0)
  const st = JSON.parse(readFileSync(join(d, "lp1.status.json"), "utf8"))
  assert.equal(st.exit, 0)
})

test("CANLI FAILED excerpt (gerçek hbmon)", { skip: !LIVE }, async () => {
  const d = mktmp()
  const env = { ...process.env, HBMON_BIN: process.env.HBMON_BIN || "hbmon" }
  const useBash = execFileSync("bash", ["-c", "true"], { encoding: "utf8" })
  assert.ok(useBash !== undefined)
  const r = await new Promise((resolve) => {
    execFile(
      "bash",
      [SCRIPT, "--name", "lf1", "--event-dir", d, "--", "sh", "-c", "echo 'error TS9999: boom' >&2; exit 1"],
      { encoding: "utf8", timeout: 60000, cwd: ROOT, env },
      (err, stdout) => {
        resolve({ exit: err && typeof err.code === "number" ? err.code : 0, stdout: String(stdout ?? "") })
      },
    )
  })
  assert.equal(r.exit, 1)
  assert.ok(r.stdout.includes("TS9999"))
})
