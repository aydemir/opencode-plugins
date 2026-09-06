/**
 * opencode-plugins — tek paket server entrypoint (`exports["./server"]`).
 *
 * Sözleşme (opencode 1.18.29, `opencode plugin <pkg>` manifest kontrolü):
 *   `exports["./server"]` | `exports["./tui"]` | package.json `main`
 *   | `oc-themes` — bunlardan biri yoksa kurulum "manifest_no_targets"
 *   ile düşer. Boot loader (`getLegacyPlugins`) bu modülün TÜM export
 *   değerlerini iterate edip her function'ı ayrı plugin instance olarak
 *   yükler; function olmayan tek export tüm paketi düşürür. Bu dosya
 *   bu yüzden SADECE üç plugin factory'sini (function) export eder —
 *   sabit/helper YOK (onlar `lib/` altında).
 *
 * Üç instance DA aynı spec options objesini alır
 * (`pluginOptions["opencode-plugins"]`). Ortak anahtarlar bilinçli
 * paylaşılır: `enabled:false` üçünü birden kapatır (tek kill-switch);
 * `skipWhenContains` iki prune katmanına da uygulanır (farklı
 * default'lar: "#no-prune" vs "#no-trunc-notice").
 */

import type { Plugin } from "@opencode-ai/plugin"
import contextSaverFactory from "./opencode-context-saver.js"
import buildTrackerFactory from "./opencode-build-tracker.js"
import truncationNoticerFactory from "./opencode-truncation-noticer.js"

export const contextSaver: Plugin = contextSaverFactory
export const buildTracker: Plugin = buildTrackerFactory
export const truncationNoticer: Plugin = truncationNoticerFactory
