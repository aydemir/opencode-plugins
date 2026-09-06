/**
 * Bash komut çalıştırma helper'ı.
 *
 * plugins/lib/prune.ts içindeki extractErrors mantığıyla uyumlu:
 * exit code, stderr/stdout ayrımı, hata satırı çıkarma.
 */

import { exec, ExecException } from "node:child_process"
import { promisify } from "node:util"

const execAsync = promisify(exec)

const ERROR_LINE_REGEX =
  /\berror\b|\bfailed\b|^\s*→|^\s*error\[|TypeError|ReferenceError|SyntaxError|^Cannot find|^Unable to|^Unresolved|^npm ERR!|^fatal|^panic/i

export interface ExecResult {
  stdout: string
  stderr: string
  exitCode: number
  durationMs: number
}

export interface ExecError extends Error {
  code?: string
  exitCode?: number
  stdout?: string
  stderr?: string
}

export async function runBash(
  command: string,
  timeoutMs: number,
): Promise<ExecResult> {
  const start = Date.now()
  try {
    const { stdout, stderr } = await execAsync(command, {
      timeout: timeoutMs,
      maxBuffer: 50 * 1024 * 1024, // 50 MB — sonra prune/limit uygular
      // shell KRİTİK: /bin/bash şart, /bin/sh (dash) ile değiştirme.
      // Timeout'ta dash sadece shell'i öldürüp torun process'i orphan
      // bırakıyor (PPID 1, CPU'da yaşar); bash torunu da temizliyor.
      // Canlı kanıt (2026-09-06): scripts/timeout-kill-probe — aynı komutta
      // sh→ORPHAN 2/2, bash→TEMİZ 2/2.
      shell: "/bin/bash",
      windowsHide: true,
    })
    return {
      stdout: stdout ?? "",
      stderr: stderr ?? "",
      exitCode: 0,
      durationMs: Date.now() - start,
    }
  } catch (e) {
    const err = e as ExecError & { stdout?: string; stderr?: string }
    return {
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? "",
      exitCode: typeof err.code === "number" ? err.code : 1,
      durationMs: Date.now() - start,
    }
  }
}

/**
 * Hata log'u çıkar: stderr'in tamamı (veya son N satırı) hata sayılır.
 * plugins/lib/prune.ts:extractErrors ile uyumlu basit versiyon.
 */
export function extractErrorLines(stderr: string, tailLines = 5): string[] {
  const lines = stderr.split("\n").filter((l) => l.length > 0)
  const tail = lines.slice(-tailLines)
  return tail.filter((l) => ERROR_LINE_REGEX.test(l) || l.trim().startsWith("→"))
}

/**
 * Toplam karakter sayısı (Unicode-safe).
 */
export function codePointLength(text: string): number {
  return Array.from(text).length
}
