/**
 * opencode-hbmon — hbmon custom tool'ları (TASK-126).
 *
 * Ajan wakeup: `hbmon_watch` ile arka plana at, `hbmon_wait` ile tek
 * bloklayan çağrıda uyan (polling yok, context'e log sızmaz).
 * settle-noticer next-contact kalır; bu plugin turn-içi beklemeyi kapatır.
 *
 * Dürüst sınır: bloklayan çağrı gateway tavanına (~60sn) takılırsa sonuç
 * değil kesinti döner — wait default 50sn, ajan tekrar çağırır.
 *
 * ⚠️ opencode 1.18.29 uyumluluğu: bu dosya sadece `default` export
 * yapıyor (getLegacyPlugins kuralı — bkz TASK-111). Mantık
 * `plugins/lib/hbmon-tools.ts`'de.
 */

import type { Plugin } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin"
import {
  resolveHbmonBin,
  statusBuild,
  waitBuild,
  watchBuild,
} from "./lib/hbmon-tools.js"

interface HbmonPluginConfig {
  enabled?: boolean
  /** HBMON_BIN yerine geçecek ikilik yolu (boşsa env/PATH). */
  bin?: string
  /** wait default daemon tavanı, saniye (gateway altı tut). */
  defaultTimeoutSec?: number
}

const DEFAULT_CONFIG: HbmonPluginConfig = {
  enabled: true,
  bin: undefined,
  defaultTimeoutSec: 50,
}

const HbmonPlugin: Plugin = async (_input, _options) => {
  const fromInput =
    ((_input as unknown as { config?: HbmonPluginConfig }).config ?? {}) as HbmonPluginConfig
  const fromOptions = ((_options ?? {}) as HbmonPluginConfig) as HbmonPluginConfig
  const config = { ...DEFAULT_CONFIG, ...fromInput, ...fromOptions }
  const bin =
    typeof config.bin === "string" && config.bin.trim() !== ""
      ? config.bin.trim()
      : resolveHbmonBin()

  return {
    tool: {
      hbmon_watch: tool({
        description:
          "Build komutunu hbmon ile arka planda izle, hemen dön. Dönen sock ile hbmon_wait/hbmon_status çağır. Uzun derlemelerde bash'te bloklama.",
        args: {
          command: tool.schema
            .array(tool.schema.string())
            .describe("Build komutu argv dizisi, örn. ['cargo','build','--release']"),
          uuid: tool.schema.string().optional().describe("İzleyici kimliği (boşsa üretilir)"),
          timeout_sec: tool.schema
            .number()
            .optional()
            .describe("Derleme tavanı sn (aionra SIGTERM→SIGKILL, exit 124)"),
        },
        async execute(args) {
          if (config.enabled === false) return "hbmon_watch kapalı (enabled:false)"
          const w = await watchBuild(bin, args.command, {
            uuid: args.uuid,
            timeoutSec: args.timeout_sec,
          })
          if (!w.handshake) return `hbmon_watch BAŞARISIZ: ${w.error}`
          return [
            `hbmon_watch OK uuid=${w.handshake.uuid}`,
            `sock=${w.handshake.sock}`,
            `log=${w.handshake.log}`,
            "Sonra: hbmon_wait (bekle) veya hbmon_status (yokla).",
          ].join("\n")
        },
      }),

      hbmon_wait: tool({
        description:
          "İzlenen build bitene (veya until sinyaline) kadar bloklanarak bekle. Polling yapma — bu çağrı uyandırır. Gateway tavanına takılırsa tekrar çağır.",
        args: {
          sock: tool.schema.string().describe("hbmon_watch'tan dönen sock"),
          timeout: tool.schema
            .number()
            .optional()
            .describe(`Daemon tavanı sn (default ${DEFAULT_CONFIG.defaultTimeoutSec}, gateway altı tut)`),
          until: tool.schema
            .string()
            .optional()
            .describe("Erken-dönüş sinyalleri, virgüllü (done,dep_missing,stall_suspect). Yoksa yalnızca bitiş."),
        },
        async execute(args) {
          if (config.enabled === false) return "hbmon_wait kapalı (enabled:false)"
          const w = await waitBuild(bin, args.sock, {
            timeoutSec: args.timeout ?? config.defaultTimeoutSec,
            until: args.until,
          })
          const body = w.response !== undefined ? JSON.stringify(w.response) : ""
          return body === "" ? w.summary : `${w.summary}\n${body}`
        },
      }),

      hbmon_status: tool({
        description: "İzlenen build'in anlık özeti (ağaç+metrik+saglik). Hızlı yoklama; beklemez.",
        args: {
          sock: tool.schema.string().describe("hbmon_watch'tan dönen sock"),
        },
        async execute(args) {
          if (config.enabled === false) return "hbmon_status kapalı (enabled:false)"
          const s = await statusBuild(bin, args.sock)
          if (!s.response) return `hbmon_status BAŞARISIZ: ${s.error}`
          return JSON.stringify(s.response)
        },
      }),
    },
  }
}

export default HbmonPlugin
