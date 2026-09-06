/**
 * CPU liveness disclosure sabitleri — cpu-liveness-probe script paketi için.
 *
 * Bu dosya opencode plugin modülü tarafından iterate edilir
 * (`getLegacyPlugins` — Object.values(mod) üzerinden), dolayısıyla
 * plugin dosyası (`plugins/opencode-cpu-liveness.ts`) sadece `default`
 * export eder. Sabitler burada toplanır (TASK-111 pattern'i).
 *
 * Kısa tutulur (~110 token); tam kullanım `docs/opencode-cpu-liveness.md`'de.
 * Tool-çağrısız çalışabilir olmalı: örnek + flag yeri + shell-join notu içerir.
 */

import { existsSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

export const CPU_LIVENESS_SENTINEL = "[cpu-liveness]"

export const CPU_LIVENESS_TEXT =
  "[cpu-liveness] Long builds: `npx cpu-liveness-agent -- <build cmd>` " +
  "(e.g. `npx cpu-liveness-agent -- npm run build`). " +
  "Watches CPU time of pid + live descendants (includeTree default true); " +
  "stall = 3 consecutive delta=0 samples (interval 2000ms default). " +
  "Flags go BEFORE --: `npx cpu-liveness-agent --intervalMs=1000 --stallThreshold=10 --allow-kill --maxBudgetMs=600000 -- <cmd>`. " +
    "Cmd is joined + run via /bin/bash -c (quote args with spaces). " +
    "Exit: 0=clean, 1=stall w/o kill, 2=stall+killed (--allow-kill), 3=cmd failed, 4=budget exceeded (--maxBudgetMs). " +
    "Fresh I/O keywords (Downloading/Locking/Waiting, last 15s) grant capped grace rounds (--ioGraceRounds, default 3; 0 disables). " +
    "Never auto-kills unless --allow-kill (I/O-wait false-positive risk). " +
  "Linux /proc verified; macOS/Windows readers UNTESTED. " +
  "To disable: \"pluginOptions.opencode-cpu-liveness.enabled\": false."

// Statik metin npx formundadır — SADECE fallback (paket npm'de yayımlıysa
// veya bin PATH'teyse). `private:true` workspace paketi registry'de YOK,
// o yüzden başka projede `npx` 404 verir (2026-09-06 rgsx vakası).
// Plugin asıl metni `buildCpuLivenessText(resolveAgentPath())` ile üretir.

export function resolveAgentPath(): string | null {
  try {
    const here = dirname(fileURLToPath(import.meta.url))
    // dist layout: dist/plugins/lib -> kok 3 seviye yukarida;
    // kaynak layout (tsx): plugins/lib -> kok 2 seviye yukarida.
    const candidates = [
      resolve(here, "../../../scripts/cpu-liveness-probe/cpu-liveness-agent.js"),
      resolve(here, "../../scripts/cpu-liveness-probe/cpu-liveness-agent.js"),
    ]
    return candidates.find((p) => existsSync(p)) ?? null
  } catch {
    return null
  }
}

export function buildCpuLivenessText(agentPath: string | null): string {
  if (!agentPath) return CPU_LIVENESS_TEXT
  return (
    "[cpu-liveness] Long builds: `node " +
    agentPath +
    " -- <build cmd>` " +
    "(e.g. `node " +
    agentPath +
    " -- npm run build`). " +
    "Watches CPU time of pid + live descendants (includeTree default true); " +
    "stall = 3 consecutive delta=0 samples (interval 2000ms default). " +
    "Flags go BEFORE --: `node " +
    agentPath +
    " --intervalMs=1000 --stallThreshold=10 --allow-kill --maxBudgetMs=600000 -- <cmd>`. " +
    "Cmd is joined + run via /bin/bash -c (quote args with spaces). " +
    "Exit: 0=clean, 1=stall w/o kill, 2=stall+killed (--allow-kill), 3=cmd failed, 4=budget exceeded (--maxBudgetMs). " +
    "Never auto-kills unless --allow-kill (I/O-wait false-positive risk). " +
    "Linux /proc verified; macOS/Windows readers UNTESTED. " +
    "To disable: \"pluginOptions.opencode-cpu-liveness.enabled\": false."
  )
}
