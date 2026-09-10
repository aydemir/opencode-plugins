# opencode-plugins

**English** | [Türkçe](README.tr.md)

> v0.1.0 — Plugin collection for OpenCode

A plugin collection for OpenCode. It contains six plugins — **`opencode-context-saver` (DHS PTC-mode)** for context savings, **`opencode-build-tracker`** build lifecycle hooks, **`opencode-truncation-noticer`** read-tool truncation notices, **`opencode-cpu-liveness`** CPU-monitoring disclosure, **`opencode-settle-noticer`** ask-free finished-build notification, and **`opencode-hbmon`** hbmon custom tools (in-turn agent wakeup). Plus MCP server **`bash`** (`bash_safe`/`bash_raw` TUI names; in-server `safe`/`raw`) and script set **`scripts/build-mon.mjs`** (push/event build monitor) + **`scripts/cpu-liveness-probe/`**.

> Source: copied from the live setup under `/root/.config/opencode/plugins/`. Code is preserved as-is, no extra behavior is added.

## Plugins

| Plugin | File | Purpose | Savings |
|--------|------|---------|---------|
| **opencode-context-saver** | `plugins/opencode-context-saver.ts` | Compresses tool outputs, cuts needless context | Measured: **97.5%** (80233 → 1997 chars, 3 files + chat summary) |
| **opencode-build-tracker** | `plugins/opencode-build-tracker.ts` | Detects build commands, `onBuildStart / onBuildSuccess / onBuildFailure / onThresholdExceeded` hooks | — |
| **opencode-truncation-noticer** | `plugins/opencode-truncation-noticer.ts` | `more-lines` marker for silent native-read truncation | — |
| **opencode-cpu-liveness** | `plugins/opencode-cpu-liveness.ts` | Declares the `cpu-liveness-agent` path for long builds (disclosure-only) | — |
| **opencode-settle-noticer** | `plugins/opencode-settle-noticer.ts` | Reports finished build-mon builds unasked (next-contact, one-shot via `.notified`) | — |
| **opencode-hbmon** | `plugins/opencode-hbmon.ts` | hbmon custom tools (`hbmon_watch`/`hbmon_wait`/`hbmon_status`): in-turn agent wakeup, no polling | — |
| **bash** (MCP) | `plugins/mcp-bash-tools/` | `bash_safe` (auto-pruned) + `bash_raw` (full output) | — |

| Script | File | Purpose |
|--------|------|---------|
| **build-mon** | `scripts/build-mon.mjs` | Push/event build monitor (closes the opencode-bm poll-only gap; wrapped with `bm_start`, `events.jsonl` + banner + log rotation) |
| **cpu-liveness-probe** | `scripts/cpu-liveness-probe/` | Build-process CPU monitoring (probe + tree-kill + agent) |

Detailed docs (in Turkish): `docs/opencode-context-saver.md`, `docs/opencode-build-tracker.md`, `docs/opencode-truncation-noticer.md`, `docs/opencode-cpu-liveness.md`, `docs/opencode-settle-noticer.md`, `docs/opencode-hbmon.md` and `docs/build-mon.md`

## Installation

### 0) Option C — `opencode plugin` + full setup (recommended)

```bash
opencode plugin -g opencode-plugins
npm install && npm run build && npm run setup -- --yes
```

The first command installs the package and updates the config; all six plugins load via `exports["./server"]`. The second command removes manual placement: it verifies `dist/` artifacts, merges the `mcp.bash` block into the live config (absolute `server.js` path, `.bak` backup) plus the `plugin` entry if missing, and checks the script set (`build-mon.mjs`, `cpu-liveness-probe/`). It never writes unplanned: preview with `npm run setup -- --dry-run` first. Configuration: `pluginOptions["opencode-plugins"]` (shared by all six; `enabled:false` turns them all off at once).
For long builds, use `scripts/build-mon.mjs` (shipped in the npm package) + `opencode-settle-noticer` combined (details: `docs/build-mon.md`, `docs/opencode-settle-noticer.md`).

### 1) Option A — Git submodule / copy

```bash
git clone https://github.com/<org>/opencode-plugins.git
# Plugins import ./lib/*.ts — copying a single .ts does NOT work.
# Copy the plugins/ directory as a whole:
cp -r opencode-plugins/plugins ~/.config/opencode/plugins
```

> ⚠️ Double-loading trap: opencode AUTOMATICALLY scans `~/.config/opencode/plugins/*.ts` and ADDS them to the `plugin` list in config. If a repo copy and an old copy sit side by side, hooks run twice (2026-09-05 incident: 6 specs → 5 instances). Either use Option C or delete old copies — don't mix.

### 2) Option B — Directly via opencode.jsonc

`~/.config/opencode/opencode.jsonc`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    "opencode-mem",
    "./plugins/opencode-context-saver.ts",
    "./plugins/opencode-build-tracker.ts"
  ]
}
```

Example: `examples/opencode.jsonc`

### 3) Build (optional)

Plugins load directly as TypeScript. `dist/` is not kept in the repo — everyone builds in their own environment (`.gitignore`):

```bash
npm install && npm run build
# or with bun (verified: bun 1.4.0, 66/66 tests):
bun install && bun run build
```

Tested with `@opencode-ai/plugin` `1.18.21`.

## Quick Verification

```bash
# manually test the opencode-context-saver regex
node -e "console.log(/\berror\b|\bfailed\b/i.test('error: foo'))"

# savings measurement over 3 files (same logic as the repo's measurement script)
# See docs/opencode-context-saver.md#ölçüm
```

## Repo Layout

```
opencode-plugins/
├── plugins/
│   ├── opencode-context-saver.ts   # DHS PTC-mode
│   ├── opencode-build-tracker.ts
│   ├── opencode-truncation-noticer.ts
│   ├── opencode-cpu-liveness.ts      # disclosure-only
│   ├── opencode-settle-noticer.ts    # next-contact settle notices
│   ├── opencode-hbmon.ts             # hbmon custom tools (in-turn wakeup)
│   ├── server.ts                     # npm package entry (exports["./server"], TASK-114)
│   ├── lib/                        # shared: prune, disclosure, raw-refill, truncation-notice, settle-notice, cpu-liveness-disclosure, hbmon-tools
│   └── mcp-bash-tools/             # MCP server (bash_safe/bash_raw)
├── scripts/
│   ├── build-mon.mjs                # push/event build monitor (TASK-127 Node port)
│   ├── hbmon-build-mon.mjs          # build-mon contract, hbmon engine (TASK-127 Node port)
│   ├── archive/                    # legacy .sh ports (git mv, history preserved)
│   ├── cpu-liveness-probe/         # probe + tree-kill + agent
│   ├── timeout-kill-probe/         # TASK-115 regression guard
│   └── tui-live/                   # TASK-112 TUI live test
├── docs/                           # plugin + build-mon + case writings (in Turkish)
├── examples/
│   └── opencode.jsonc
├── tests/
├── package.json
├── tsconfig.json
└── LICENSE
```

## License

MIT — see `LICENSE`.

## Development

```bash
npm ci               # install dependencies (or: bun install)
npm run lint         # tsc --noEmit (typecheck)
npm test             # build + node:test (tests/*.test.mjs)
```

`npm test` runs `npm run build` and `node --test tests/` back to back. Tests import production output from `dist/` — if the build is stale, tests may give false negatives. CI gate: `.github/workflows/test.yml`.

Before opening a PR:

1. `npm test` must be green locally
2. The behavior contracts in `docs/` must hold (no breaking API changes)
3. Add `*.test.mjs` under `tests/` for new plugin behavior

## Contributing

PRs are welcome. Please don't break the behavior contracts in `docs/`; run `npm test` with every change.

## Related

- OpenCode docs: https://opencode.ai/docs
- Live configuration: `~/.config/opencode/opencode.jsonc`

## Writings (in Turkish)

- [Oracle Problem — Live Verification Discipline](docs/oracle-problem-vaka-calismasi.md)
