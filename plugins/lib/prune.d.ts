/**
 * Paylaşımlı tool-output trimleme ve özet helper'ları.
 *
 * Tasarım: deepseek-harness `compaction-tool-result-pruner` paketinin
 * head+marker+tail desenini temel alır. Deterministik, idempotent,
 * LLM çağrısı yapmaz.
 *
 * - `codePointLength`: Unicode code-point sayar (surrogate-safe, emoji yarılmaz).
 * - `pruneMiddle`: head+marker+tail ile ortayı budar; replacement < input garantisi.
 * - `extractSummarySafe`: per-key + toplam bütçe uygular; obje derinliğini sınırlar.
 * - `isBuildCommand`: shell operatörlerine göre segmentlere ayırır, her segmentin
 *   ilk token'ını veya ilk iki token phrase'ini kontrol eder.
 * - `extractErrors`: hata benzeri satırları yakalar, son N satır her zaman korunur.
 *
 * @module plugins/lib/prune
 */
export declare const PRUNE_MARKER = "\n\n[... tool output middle pruned ...]\n\n";
/** Unicode code-point sayısı (UTF-16 code unit değil). */
export declare function codePointLength(text: string): number;
export interface PruneMiddleOptions {
    headChars?: number;
    tailChars?: number;
    marker?: string;
}
/**
 * Head + marker + tail. Replacement her zaman < input olmalı (idempotent
 * ikinci pass için zorunlu). Config bütçe aşılırsa throw eder — sessiz
 * büyüme yerine construct-time'da patlar.
 */
export declare function pruneMiddle(text: string, options?: PruneMiddleOptions): string;
export interface ExtractSummaryOptions {
    maxCharsPerKey?: number;
    maxSummaryChars?: number;
    /** Stringify truncation koruması: büyük objeler için hızlı boyut tahmini. */
    maxObjectStringifyChars?: number;
}
/**
 * `tool(k1=v1, k2=v2)` formatında özet. Her key değeri code-point cap'lenir,
 * toplam özet bütçesi aşılırsa erken kırılır. Obje/array değerler için
 * `maxObjectStringifyChars` koruması: tahmin aşılırsa `[Object: {n keys}]`
 * placeholder basar, JSON allocation maliyetinden kaçınır.
 */
export declare function extractSummarySafe(tool: string, args: Record<string, unknown> | null | undefined, options?: ExtractSummaryOptions): string;
/**
 * First-token exact match + phrase match. Substring matching FP üretir
 * ("rain" → "training"), bu yüzden kelime sınırı şart.
 *
 * Phrase listesindeki iki-token kalıplar (`npm run`, `docker build`)
 * chained form için (`cd web && npm run build`) kritik — segment bazlı çalışır.
 */
export declare function isBuildCommand(command: string): boolean;
export interface ExtractErrorsOptions {
    maxLines?: number;
    /** Her zaman dahil edilecek son satır sayısı (en diagnostik genelde sonda). */
    tailLines?: number;
}
/**
 * Hata benzeri satırları yakalar. `maxLines` cap'ine ek olarak `tailLines`
 * kadar son satır her zaman korunur — yığının sonu çoğu zaman kök neden.
 */
export declare function extractErrors(output: string, options?: ExtractErrorsOptions): string[];
/** `compressThreshold` ile head+tail+marker bütçesini doğrula. */
export declare function resolvePruneBudget(cfg: {
    compressThreshold: number;
    headChars: number;
    tailChars: number;
    marker?: string;
}): void;
//# sourceMappingURL=prune.d.ts.map