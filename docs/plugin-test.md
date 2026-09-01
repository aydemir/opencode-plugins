# Plugin Test - Araç Çağrıları ve Derleme

## Derleme

```bash
npm run build   # tsc --project tsconfig.json
npm run lint    # tsc --noEmit
```

Çıktılar:
- `dist/plugins/build-tracker.js` + `.d.ts` + `.map`
- `dist/plugins/context-saver.js` + `.d.ts` + `.map`
- `dist/plugins/lib/prune.js`

Doğrulama:
```
> tsc --noEmit         # lint OK
> tsc --project tsconfig.json  # build OK, 4s
> ls dist/plugins/
```

## Araç Çağrıları

### build-tracker (`tool.execute.before` / `tool.execute.after`)

| # | Araç | Args | Hook | Beklenen |
|---|------|------|------|----------|
| 1 | bash | `npm run build` | before | session active, callIDs++ |
| 2 | bash | `npm run build` | after (output: success) | `✅ onBuildSuccess` |
| 3 | bash | `cargo build` | after (output: error, exit 101) | `❌ onBuildFailed` |
| 4 | bash | `ls -la` | before | no-op (isBuildCommand=false) |
| 5 | bash | `tsc ...` + `pnpm build` | before x2 | aynı session'da toplanır |

### context-saver (`tool.execute.after`)

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
node /tmp/h2.mjs   # minimal build-tracker smoke test
```

Ayrıntılı JSON: `tool-calls.json`
