/**
 * Tests for bg_* tools (TASK-132).
 *
 * Strateji: lib (`bg-tasks.ts`) saf fonksiyonları hermetik test edilir
 * (tmpdir sidecar, fixture .out). Plugin uçtan-uca gerçek hbmon daemon
 * ile HBMON_LIVE=1 kapısı ardında (CI'da hbmon derlenmez). Lib `../dist`
 * üzerinden import edilir (pretest: npm run build).
 */

import test from "node:test"
import assert from "node:assert/strict"
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  bgDir,
  isTerminalState,
  listRecords,
  outFromSock,
  readLastEvent,
  readOutTail,
  readRecord,
  resolveRecord,
  wakeMessage,
  writeRecord,
} from "../dist/plugins/lib/bg-tasks.js"
import hbmonFactory from "../dist/plugins/opencode-hbmon.js"

const LIVE = !!process.env.HBMON_LIVE

function rec(over = {}) {
  return {
    v: 1,
    name: "deneme",
    uuid: "abc123def456",
    sock: "/tmp/hbmon-abc123def456.sock",
    log: "/tmp/hbmon-abc123def456.jsonl",
    out: "/tmp/hbmon-abc123def456.out",
    sessionID: "ses_x",
    notify: true,
    createdAt: new Date().toISOString(),
    ...over,
  }
}

test("bgDir: override yoksa tmpdir", () => {
  assert.equal(bgDir({}), tmpdir())
  assert.equal(bgDir({ HBMON_BG_DIR: " /tmp/bg " }), "/tmp/bg")
})

test("sidecar: yaz-oku-list döngüsü", () => {
  const dir = mkdtempSync(join(tmpdir(), "bg-"))
  writeRecord(dir, rec())
  writeRecord(dir, rec({ name: "iki", uuid: "zzz999" }))
  assert.equal(readRecord(dir, "abc123def456")?.name, "deneme")
  assert.equal(readRecord(dir, "yok"), undefined)
  assert.equal(listRecords(dir).length, 2)
})

test("resolve: name exact + uuid prefix + belirsizlik", () => {
  const dir = mkdtempSync(join(tmpdir(), "bg-"))
  writeRecord(dir, rec())
  writeRecord(dir, rec({ name: "iki", uuid: "abc999" }))
  assert.equal(resolveRecord(dir, "deneme").record?.uuid, "abc123def456")
  assert.equal(resolveRecord(dir, "abc123").record?.name, "deneme")
  assert.match(resolveRecord(dir, "abc").error ?? "", /2 göreve uyuyor/)
  assert.match(resolveRecord(dir, "yok").error ?? "", /bilinmeyen/)
})

test("readOutTail: 50KB cap + truncated bayrağı", () => {
  const dir = mkdtempSync(join(tmpdir(), "bg-"))
  const p = join(dir, "big.out")
  writeFileSync(p, "x".repeat(60 * 1024))
  const r = readOutTail(p)
  assert.equal(r.truncated, true)
  assert.equal(r.text.length, 50 * 1024)
  const small = join(dir, "small.out")
  writeFileSync(small, "selam")
  const r2 = readOutTail(small)
  assert.equal(r2.truncated, false)
  assert.equal(r2.text, "selam")
  assert.equal(readOutTail(join(dir, "yok.out")).truncated, false)
})

test("outFromSock + wakeMessage", () => {
  assert.equal(outFromSock("/tmp/hbmon-a.sock"), "/tmp/hbmon-a.out")
  assert.match(wakeMessage("derle", "done", 0), /\[bg\] derle → done \(exit 0\)/)
  assert.match(wakeMessage("derle", "failed", undefined), /exit \?/)
})

test("readLastEvent: jsonl kuyruğundan terminal olay (daemon-ölü fallback)", () => {
  const dir = mkdtempSync(join(tmpdir(), "bg-"))
  const p = join(dir, "job.jsonl")
  writeFileSync(
    p,
    `{"ev":"ready","uuid":"a"}\n{"ev":"metric","uuid":"a"}\n{"code":0,"duration_sec":1.5,"ev":"exit","state":"done","uuid":"a"}\n`,
  )
  const ev = readLastEvent(p)
  assert.equal(ev?.ev, "exit")
  assert.equal(ev?.state, "done")
  assert.equal(ev?.code, 0)
  assert.equal(isTerminalState(ev?.state), true)
  assert.equal(isTerminalState("running"), false)
  assert.equal(readLastEvent(join(dir, "yok.jsonl")), undefined)
})

test("bg_run: name validasyonu (daemon yok)", async () => {
  const plugin = await hbmonFactory({}, {})
  const bad = await plugin.tool.bg_run.execute(
    { name: "kötü ad!", command: "echo x" },
    { sessionID: "ses_t" },
  )
  assert.match(String(bad), /HATA.*name/)
})

test("bg-wake: --dry-run komut üretir (daemon yok)", async () => {
  const { execFile } = await import("node:child_process")
  const out = await new Promise((resolve) => {
    execFile(
      process.execPath,
      ["scripts/bg-wake.mjs", "--session", "ses_x", "--sock", "/tmp/yok.sock", "--name", "n", "--dry-run"],
      { encoding: "utf8" },
      (err, stdout) => resolve({ err, stdout: String(stdout) }),
    )
  })
  assert.equal(out.err, null)
  assert.match(out.stdout, /opencode run -s ses_x "\[bg\] n/)
})

test("LIVE e2e: bg_run→status→logs→kill (gerçek daemon)", { skip: !LIVE }, async () => {  const plugin = await hbmonFactory({}, {})
  const ctx = { sessionID: "ses_live" }
  const name = `livetest-${Date.now().toString(36)}`
  const run = String(
    await plugin.tool.bg_run.execute({ name, command: "echo hi-live && sleep 30", notify: false }, ctx),
  )
  assert.match(run, /bg_run OK/)
  const id = run.match(/id=([0-9a-f]+)/)?.[1]
  assert.ok(id, "uuid dönmeli")
  const st = String(await plugin.tool.bg_status.execute({ id }, ctx))
  assert.match(st, new RegExp(`name=${name}`))
  const logs = String(await plugin.tool.bg_logs.execute({ id }, ctx))
  assert.match(logs, /hi-live/)
  const kill = String(await plugin.tool.bg_kill.execute({ id }, ctx))
  assert.match(kill, /bg_kill OK/)
})

// --- bg-wake busy-safe adapter matrisi (stub `opencode` ile, serversiz) ---
//
// Stub `run` = CLI enjeksiyonu simüle eder (state.json'a user mesajı yazar),
// `export` = session export simüle eder. Modlar:
//   idle: ilk injection'da turn de oluşur
//   busy: ilk injection düşer (sadece user), 2. injection'da turn oluşur
//   never: turn hiç oluşmaz | fail: run exit 1 | nopersist: run ok ama yazmaz

async function makeFakeOpencode(mode, seed) {
  const dir = mkdtempSync(join(tmpdir(), "bgw-"))
  const statePath = join(dir, "state.json")
  writeFileSync(statePath, JSON.stringify(seed ?? { runs: 0, messages: [] }))
  const stub = join(dir, "opencode")
  const code = `#!/usr/bin/env node
const fs = require("fs");
const STATE = ${JSON.stringify(statePath)};
const MODE = ${JSON.stringify(mode)};
const a = process.argv.slice(2);
const cmd = a[0];
const load = () => JSON.parse(fs.readFileSync(STATE, "utf8"));
const save = (s) => fs.writeFileSync(STATE, JSON.stringify(s));
if (cmd === "run") {
  const s = load(); s.runs += 1; save(s);
  if (MODE === "fail") process.exit(1);
  const msg = a[a.length - 1];
  const now = Date.now();
  if (MODE !== "nopersist") {
    s.messages.push({ info: { role: "user", time: { created: now } }, parts: [{ type: "text", text: msg }] });
    if (MODE === "idle" || (MODE === "busy" && s.runs >= 2)) {
      s.messages.push({ info: { role: "assistant", time: { created: now + 5 } }, parts: [{ type: "text", text: "ack" }] });
    }
    save(s);
  }
  process.exit(0);
}
if (cmd === "export") {
  const s = load();
  process.stdout.write(JSON.stringify({ info: { id: "ses_x" }, messages: s.messages }));
  process.exit(0);
}
process.exit(2);
`;
  writeFileSync(stub, code)
  chmodSync(stub, 0o755)
  // Process-wait fazını atlamak için terminal olay önceden yazılır.
  const sockBase = join(dir, "t")
  writeFileSync(sockBase + ".jsonl", JSON.stringify({ ev: "exit", state: "done", code: 0 }) + "\n")
  return { dir, stub, statePath, sockBase }
}

async function runWake(dir, sockBase, taskId, extra = []) {
  const { execFile } = await import("node:child_process")
  return await new Promise((resolve) => {
    execFile(
      process.execPath,
      [
        "scripts/bg-wake.mjs", ...extra,
        "--session", "ses_x", "--sock", sockBase + ".sock",
        "--name", "n", "--task-id", taskId,
        "--verify-timeout-sec", "25", "--poll-sec", "1", "--persist-gap-sec", "2",
        "--backoff-sec", "2", "--max-injections", "3",
        "--attempt-log", join(dir, "attempts.jsonl"),
      ],
      { encoding: "utf8", env: { ...process.env, PATH: `${dir}:${process.env.PATH}` } },
      (err, stdout, stderr) => resolve({ code: err?.code ?? 0, stdout: String(stdout), stderr: String(stderr) }),
    )
  })
}

function readAttempts(dir) {
  const p = join(dir, "attempts.jsonl")
  if (!existsSync(p)) return []
  return readFileSync(p, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l))
}

function readState(statePath) {
  return JSON.parse(readFileSync(statePath, "utf8"))
}

test("adapter: idle → injection → turn = wake=confirmed", async () => {
  const f = await makeFakeOpencode("idle")
  const r = await runWake(f.dir, f.sockBase, "t-idle")
  assert.equal(r.code, 0)
  assert.match(r.stdout, /wake=confirmed/)
  assert.equal(readState(f.statePath).runs, 1)
  const attempts = readAttempts(f.dir)
  const verify = attempts.find((a) => a.event === "verify")
  assert.equal(verify?.wake, "confirmed")
  assert.ok(verify.assistant_turn_ts > verify.injection_ts)
})

test("adapter: busy → retry → turn = wake=confirmed (2 injection)", async () => {
  const f = await makeFakeOpencode("busy")
  const r = await runWake(f.dir, f.sockBase, "t-busy")
  assert.equal(r.code, 0)
  assert.match(r.stdout, /wake=confirmed/)
  assert.equal(readState(f.statePath).runs, 2)
  const attempts = readAttempts(f.dir)
  assert.equal(attempts.filter((a) => a.event === "injection-attempt").length, 2)
  const verify = attempts.find((a) => a.event === "verify")
  assert.ok(verify.assistant_turn_ts > verify.injection_ts)
})

test("adapter: persistence ✓ + turn yok = wake=unknown (exit 1)", async () => {
  const f = await makeFakeOpencode("never")
  const r = await runWake(f.dir, f.sockBase, "t-never", ["--verify-timeout-sec", "8", "--max-injections", "2"])
  assert.equal(r.code, 1)
  assert.match(r.stdout, /wake=unknown/)
  const attempts = readAttempts(f.dir)
  const verify = attempts.find((a) => a.event === "verify")
  assert.equal(verify?.wake, "unknown")
  assert.equal(verify?.assistant_turn_ts, null)
})

test("adapter: injection başarısız = injection=failed (exit 1)", async () => {
  const f = await makeFakeOpencode("fail")
  const r = await runWake(f.dir, f.sockBase, "t-fail", ["--max-injections", "2"])
  assert.equal(r.code, 1)
  const attempts = readAttempts(f.dir)
  assert.ok(attempts.some((a) => a.event === "injection-attempt" && a.injection === "failed"))
  const verify = attempts.find((a) => a.event === "verify")
  assert.equal(verify?.wake, "unknown")
})

test("adapter: aynı taskId tekrar = yeni injection yok (already-confirmed)", async () => {
  const T0 = Date.now() - 60000
  const f = await makeFakeOpencode("idle", {
    runs: 0,
    messages: [
      { info: { role: "user", time: { created: T0 } }, parts: [{ type: "text", text: "[bg] n → done (exit 0). x [wake:t-pre]" }] },
      { info: { role: "assistant", time: { created: T0 + 50 } }, parts: [{ type: "text", text: "ack" }] },
    ],
  })
  const r = await runWake(f.dir, f.sockBase, "t-pre")
  assert.equal(r.code, 0)
  assert.match(r.stdout, /wake=already-confirmed/)
  assert.equal(readState(f.statePath).runs, 0)
})

test("adapter: marker persistence yok = wake=unknown (exit 1)", async () => {
  const f = await makeFakeOpencode("nopersist")
  const r = await runWake(f.dir, f.sockBase, "t-nop", ["--verify-timeout-sec", "8", "--max-injections", "2"])
  assert.equal(r.code, 1)
  const attempts = readAttempts(f.dir)
  const verify = attempts.find((a) => a.event === "verify")
  assert.equal(verify?.wake, "unknown")
  assert.equal(verify?.persistence, "failed")
})
