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
export const PRUNE_MARKER = "\n\n[... tool output middle pruned ...]\n\n";
/** Unicode code-point sayısı (UTF-16 code unit değil). */
export function codePointLength(text) {
    return Array.from(text).length;
}
/**
 * Head + marker + tail. Replacement her zaman < input olmalı (idempotent
 * ikinci pass için zorunlu). Config bütçe aşılırsa throw eder — sessiz
 * büyüme yerine construct-time'da patlar.
 */
export function pruneMiddle(text, options = {}) {
    const head = options.headChars ?? 100;
    const tail = options.tailChars ?? 50;
    const marker = options.marker ?? PRUNE_MARKER;
    const points = Array.from(text);
    const markerLen = codePointLength(marker);
    const budget = head + tail + markerLen;
    if (points.length <= budget)
        return text;
    if (head < 0 || tail < 0 || markerLen < 0) {
        throw new Error(`pruneMiddle: invalid budget (head=${head}, tail=${tail}, marker=${markerLen})`);
    }
    const result = points.slice(0, head).join("") +
        marker +
        points.slice(points.length - tail).join("");
    const resultLen = codePointLength(result);
    if (resultLen >= points.length || resultLen > budget) {
        throw new Error(`pruneMiddle: replacement (${resultLen} code points) must be < input (${points.length}) and within budget (${budget})`);
    }
    return result;
}
/**
 * `tool(k1=v1, k2=v2)` formatında özet. Her key değeri code-point cap'lenir,
 * toplam özet bütçesi aşılırsa erken kırılır. Obje/array değerler için
 * `maxObjectStringifyChars` koruması: tahmin aşılırsa `[Object: {n keys}]`
 * placeholder basar, JSON allocation maliyetinden kaçınır.
 */
export function extractSummarySafe(tool, args, options = {}) {
    const maxPerKey = options.maxCharsPerKey ?? 40;
    const maxTotal = options.maxSummaryChars ?? 200;
    const maxObj = options.maxObjectStringifyChars ?? 200;
    const parts = [`${tool}(`];
    let used = codePointLength(parts[0]);
    if (args && typeof args === "object") {
        for (const [k, v] of Object.entries(args)) {
            if (v == null)
                continue;
            const piece = `${k}=${summarizeValue(v, maxPerKey, maxObj)}`;
            const pieceLen = codePointLength(piece) + 2; // ", "
            if (used + pieceLen > maxTotal) {
                parts.push(`+${Object.keys(args).length - parts.length + 1} more`);
                break;
            }
            parts.push(piece);
            used += pieceLen;
        }
    }
    parts.push(")");
    return parts.join(", ");
}
function summarizeValue(v, maxChars, maxObj) {
    if (typeof v === "string")
        return truncate(v, maxChars);
    if (typeof v === "number" || typeof v === "boolean")
        return String(v);
    if (Array.isArray(v)) {
        if (v.length === 0)
            return "[]";
        return `[${v.length} items]`;
    }
    if (typeof v === "object") {
        const keys = Object.keys(v);
        if (keys.length === 0)
            return "{}";
        // Tahmin: bir obje > maxObj ise placeholder, allocation'dan kaçın
        const approx = keys.reduce((acc, k) => acc + k.length + 8, 2);
        if (approx > maxObj)
            return `{${keys.length} keys}`;
        try {
            return truncate(JSON.stringify(v), maxChars);
        }
        catch {
            return "{…}";
        }
    }
    return truncate(String(v), maxChars);
}
function truncate(s, max) {
    if (max <= 0)
        return "";
    const pts = Array.from(s);
    if (pts.length <= max)
        return s;
    return pts.slice(0, max).join("") + "…";
}
/** Segment bazlı shell komut ayrıştırma. */
function splitShellSegments(command) {
    return command
        .split(/&&|\|\||;|\|(?![0-9])/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
}
/**
 * First-token exact match + phrase match. Substring matching FP üretir
 * ("rain" → "training"), bu yüzden kelime sınırı şart.
 *
 * Phrase listesindeki iki-token kalıplar (`npm run`, `docker build`)
 * chained form için (`cd web && npm run build`) kritik — segment bazlı çalışır.
 */
export function isBuildCommand(command) {
    const BUILD_TOKENS = new Set([
        "build", "compile", "cargo", "npm", "pnpm", "yarn",
        "bun", "make", "cmake", "gradle", "mvn", "go", "tsc",
        "vite", "webpack", "esbuild", "rollup", "tailwind", "maven",
        "docker", "pip", "pip3", "forge", "rgsx", "rain",
    ]);
    const BUILD_PHRASES = new Set([
        "npm run", "bun run", "yarn run", "pnpm run",
        "next build", "docker build",
        "pip install", "pip3 install",
    ]);
    for (const seg of splitShellSegments(command)) {
        const lower = seg.toLowerCase();
        const parts = lower.split(/\s+/);
        const first = parts[0] ?? "";
        if (BUILD_TOKENS.has(first))
            return true;
        if (parts.length >= 2 && BUILD_PHRASES.has(`${first} ${parts[1]}`))
            return true;
    }
    return false;
}
const ERROR_LINE_RE = /\berror\b|\bfailed\b|^\s*→|^\s*error\[|TypeError|ReferenceError|SyntaxError|^Cannot find|^Unable to|^Unresolved|^npm ERR!|^fatal|^panic/i;
/**
 * Hata benzeri satırları yakalar. `maxLines` cap'ine ek olarak `tailLines`
 * kadar son satır her zaman korunur — yığının sonu çoğu zaman kök neden.
 */
export function extractErrors(output, options = {}) {
    const max = options.maxLines ?? 15;
    const tail = options.tailLines ?? 5;
    const lines = output.split("\n");
    const matches = lines.filter((line) => ERROR_LINE_RE.test(line));
    if (matches.length === 0)
        return [];
    const tailSet = new Set(lines.slice(-tail));
    // tail satırları her zaman ekle, head satırlarını max'e kadar doldur
    const head = matches.filter((l) => !tailSet.has(l)).slice(0, Math.max(0, max - tail));
    const tailKept = lines.slice(-tail);
    return [...head, ...tailKept].slice(0, max + tail);
}
/** `compressThreshold` ile head+tail+marker bütçesini doğrula. */
export function resolvePruneBudget(cfg) {
    const marker = cfg.marker ?? PRUNE_MARKER;
    const emitted = cfg.headChars + codePointLength(marker) + cfg.tailChars;
    if (emitted > cfg.compressThreshold) {
        throw new Error(`prune budget invalid: headChars(${cfg.headChars}) + marker(${codePointLength(marker)}) + tailChars(${cfg.tailChars}) = ${emitted} > threshold(${cfg.compressThreshold})`);
    }
}
//# sourceMappingURL=prune.js.map