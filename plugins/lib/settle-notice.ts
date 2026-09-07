/**
 * Settle Noticer — paylaşılan sabitler ve helper'lar.
 *
 * Bu dosya opencode plugin modülü tarafından iterate edilir
 * (`getLegacyPlugins` — Object.values(mod) üzerinden), dolayısıyla
 * plugin dosyası (`plugins/opencode-settle-noticer.ts`) `default`
 * dışında hiçbir şey export etmemeli. Sabitler ve utility'ler burada
 * toplanır (TASK-111 pattern'i).
 *
 * Sorumluluk: build-mon event dizinlerindeki (`*.status.json`) final
 * olayları bulup tek-seferlik bildirim metni üretmek. Wakeup YOK —
 * next-contact notice (TASK-123).
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"

export const NOTICE_SENTINEL = "[sn] settled:"
export const DISCLOSURE_SENTINEL = "[sn-disclosed]"
export const DEFAULT_SKIP_CONTAINS = "#no-settle-notice"
export const DEFAULT_MAX_FILES = 20

export const DISCLOSURE_TEXT =
  `[sn-disclosed] Settle Noticer is active. When a build monitored by ` +
  `scripts/build-mon.sh settles (PASSED/FAILED/ERROR/TIMED_OUT/STALLED-kill/` +
  `INTERRUPTED), a one-line note like "[sn] settled: <name> <EVENT> ` +
  `(exit=<code>)" is appended to your next tool result — you do not need ` +
  `to ask or poll events.jsonl. Notices fire once per final (tracked ` +
  `with per-build .notified marker files). It does NOT wake an idle ` +
  `session, it surfaces ` +
  `on next contact. Event dirs come from config eventDirs, else ` +
  `$BUILD_MON_DIR and <cwd>/tmp/build-mon (existing dirs only). ` +
  `To disable entirely, set ` +
  `"pluginOptions.opencode-settle-noticer.enabled": false` +
  ` in opencode.jsonc. To bypass per-call, embed "${DEFAULT_SKIP_CONTAINS}" ` +
  `in the tool args.`

export interface SettleRecord {
  name: string
  event: string
  ts: string
  exit: number | string
  detail: string
  log: string
  statusPath: string
}

/**
 * status.json dosyasını parse et. Bozuk/eksik/yanlış şekilli dosyada null
 * (graceful — yarım yazılmış dosyalar bildirimi düşürmez).
 */
export function parseStatusFile(path: string): SettleRecord | null {
  let raw: unknown
  try {
    if (!existsSync(path)) return null
    raw = JSON.parse(readFileSync(path, "utf8"))
  } catch {
    return null
  }
  if (typeof raw !== "object" || raw === null) return null
  const r = raw as Record<string, unknown>
  if (typeof r["name"] !== "string" || typeof r["event"] !== "string") return null
  if (typeof r["ts"] !== "string") return null
  if (typeof r["exit"] !== "number" && typeof r["exit"] !== "string") return null
  return {
    name: r["name"] as string,
    event: r["event"] as string,
    ts: r["ts"] as string,
    exit: r["exit"] as number | string,
    detail: typeof r["detail"] === "string" ? (r["detail"] as string) : "",
    log: typeof r["log"] === "string" ? (r["log"] as string) : "",
    statusPath: path,
  }
}

/**
 * Final mi? build-mon tüm finallerde `exit` yazar (emit code parametresi);
 * HEARTBEAT / STALLED-uyarı / STARTED yazmaz. Olay-adı listesi yok.
 */
export function isFinal(rec: SettleRecord): boolean {
  return rec.exit !== undefined && rec.exit !== null && rec.exit !== ""
}

/** Bildirim işareti: <eventDir>/<name>.notified (içerik: "<ts> <event>"). */
export function notifiedPath(eventDir: string, name: string): string {
  return join(eventDir, `${name}.notified`)
}

export function isNotified(eventDir: string, rec: SettleRecord): boolean {
  try {
    const marker = readFileSync(notifiedPath(eventDir, rec.name), "utf8").trim()
    return marker === `${rec.ts} ${rec.event}`
  } catch {
    return false
  }
}

/** Best-effort işaretle (yazma hatası bildirimi engellemez). */
export function markNotified(eventDir: string, rec: SettleRecord): void {
  try {
    writeFileSync(notifiedPath(eventDir, rec.name), `${rec.ts} ${rec.event}\n`, "utf8")
  } catch {
    // yut — bir sonraki temasta tekrar bildirilir, kayıp yok
  }
}

/**
 * Event dizinlerini çöz: explicit liste varsa o (var olanlar), yoksa
 * $BUILD_MON_DIR + <cwd>/tmp/build-mon (var olanlar). Yoksa [].
 */
export function resolveEventDirs(
  explicit?: string[],
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
): string[] {
  const candidates: string[] =
    explicit && explicit.length > 0
      ? explicit
      : [env["BUILD_MON_DIR"] ?? "", join(cwd, "tmp", "build-mon")]
  const out: string[] = []
  for (const c of candidates) {
    if (typeof c !== "string" || c.length === 0) continue
    try {
      const abs = resolve(c)
      if (existsSync(abs) && !out.includes(abs)) out.push(abs)
    } catch {
      continue
    }
  }
  return out
}

/**
 * Dizinlerdeki bildirilmemiş finalleri tara. Bounded (dizin başına en fazla
 * maxFiles status dosyası), hataya dayanıklı (yok/okunamaz dizin → atla).
 * Sonuç ts'e göre eskiden yeniye sıralı.
 */
export function scanSettled(eventDirs: string[], maxFiles: number = DEFAULT_MAX_FILES): SettleRecord[] {
  const found: { rec: SettleRecord; dir: string }[] = []
  for (const dir of eventDirs) {
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      continue
    }
    const statusFiles = entries
      .filter((f) => f.endsWith(".status.json"))
      .sort()
      .slice(0, Math.max(0, maxFiles))
    for (const f of statusFiles) {
      const rec = parseStatusFile(join(dir, f))
      if (!rec || !isFinal(rec)) continue
      if (isNotified(dir, rec)) continue
      found.push({ rec, dir })
    }
  }
  found.sort((a, b) => (a.rec.ts < b.rec.ts ? -1 : a.rec.ts > b.rec.ts ? 1 : 0))
  return found.map((x) => x.rec)
}

/** Tek-seferlik bildirim metni (çıktı sonuna eklenir). */
export function buildNotice(records: SettleRecord[]): string {
  const lines = records.map(
    (r) => `${NOTICE_SENTINEL} ${r.name} ${r.event} (exit=${r.exit}) — ${r.detail} [${r.statusPath}]`,
  )
  return "\n\n" + lines.join("\n") + "\n"
}
