# Plugin Test - Araç Çağrıları ve Derleme

## Derleme

```bash
npm run build   # tsc --project tsconfig.json
npm run lint    # tsc --noEmit
```

Çıktılar (`dist/` repoda tutulmaz — `npm run build` / `bun run build` ile üretilir):
- `dist/plugins/opencode-build-tracker.js` + `.d.ts` + `.map`
- `dist/plugins/opencode-context-saver.js` + `.d.ts` + `.map`
- `dist/plugins/opencode-truncation-noticer.js` + `.d.ts` + `.map`
- `dist/plugins/lib/prune.js`

Doğrulama:
```
> tsc --noEmit         # lint OK
> tsc --project tsconfig.json  # build OK, 4s
> ls dist/plugins/
```

## Araç Çağrıları

### opencode-build-tracker (`tool.execute.before` / `tool.execute.after`)

| # | Araç | Args | Hook | Beklenen |
|---|------|------|------|----------|
| 1 | bash | `npm run build` | before | session active, callIDs++ |
| 2 | bash | `npm run build` | after (output: success) | `✅ onBuildSuccess` |
| 3 | bash | `cargo build` | after (output: error, exit 101) | `❌ onBuildFailed` |
| 4 | bash | `ls -la` | before | no-op (isBuildCommand=false) |
| 5 | bash | `tsc ...` + `pnpm build` | before x2 | aynı session'da toplanır |

### opencode-context-saver (`tool.execute.after`)

- **Büyük output**: 10k char → `pruneMiddle(head=500,tail=500)` → ~1000+marker
- **Hata output**: `extractErrors` ile `ERROR|TypeError` satırları korunur
- **Küçük output**: < limit → trim yok

### prune lib direkt çağrıları

```js
isBuildCommand("npm run build") // true
isBuildCommand("echo hi")       // false
pruneMiddle("A".repeat(2000), {headChars:100, tailChars:100})
// → "AAA...[trimmed 1800 chars]...AAA"
```

## Test Çalıştırma

```bash
node test-harness.mjs
node /tmp/h2.mjs   # minimal opencode-build-tracker smoke test
```

Ayrıntılı JSON: `tool-calls.json`

## Test Çalıştırma

Yeni eklenen `test-plugins.mjs` (242 satır, 0.1.0) tüm eklentileri doğrular:

```bash
node test-plugins.mjs
# veya
npm test
```

- **Hata output**: `extractErrors` ile filtrelenmiş satırlar korunur.
- **Prune**: `pruneMiddle` boş `matches` için `[]` döner (tail-only bug fix).
- **Build tracker**: `isBuildCommand` segment kontrolü.

Detay: `plugins/lib/prune.ts:197-199` ve `test-plugins.mjs:1-50`.
