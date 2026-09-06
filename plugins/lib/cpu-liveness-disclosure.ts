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

export const CPU_LIVENESS_SENTINEL = "[cpu-liveness]"

export const CPU_LIVENESS_TEXT =
  "[cpu-liveness] Long builds: `npx cpu-liveness-agent -- <build cmd>` " +
  "(e.g. `npx cpu-liveness-agent -- npm run build`). " +
  "Watches CPU time of pid + live descendants (includeTree default true); " +
  "stall = 3 consecutive delta=0 samples (interval 2000ms default). " +
  "Flags go BEFORE --: `npx cpu-liveness-agent --intervalMs=1000 --stallThreshold=10 --allow-kill -- <cmd>`. " +
  "Cmd is joined + run via /bin/bash -c (quote args with spaces). " +
  "Exit: 0=clean, 1=stall w/o kill, 2=stall+killed (--allow-kill), 3=cmd failed. " +
  "Never auto-kills unless --allow-kill (I/O-wait false-positive risk). " +
  "Linux /proc verified; macOS/Windows readers UNTESTED. " +
  "To disable: \"pluginOptions.opencode-cpu-liveness.enabled\": false."
