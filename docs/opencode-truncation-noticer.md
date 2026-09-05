# opencode-truncation-noticer (`tn`)

OpenCode native `read` tool'unun sessiz kırpmasını gözlemler ve
**"devamı var" marker'ı** ekler. Küçük context'li modeller için
yarım içerik üzerinden karar vermeyi engeller.

## Sorun

OpenCode native `read` tool'u `tool.execute.after` hook'unda
**sessizce** kırpıyor: dosyanın daha fazla içeriği olmasına rağmen
offset/limit'in sonuna gelindiğinde "devamı var" işareti bırakmadan
kesiyor. Bu, küçük context'li modeller için en tehlikeli tool bug'ı:

- Model "dosyayı okudum" sanıp karar veriyor.
- Yarım içerik üzerinden hatalı çıkarım.
- LLM'e ham okuma seçeneği de bildirilmediği için dönüş yolu yok.

`bash_safe` MCP tool'u zaten marker'lı kırpma yapıyor (`[... pruned: ...]`),
ama native `read` için eşdeğer bir uyarı mekanizması yoktu.

## Çözüm

`opencode-truncation-noticer` (`tn`) — `tool.execute.after` hook'unda
tool adı `read` ise çıktıyı parse eder (`<lineNo>\t<line>` formatı)
ve dosyanın toplam satır sayısıyla karşılaştırır. Eğer son satır
numarası toplamdan küçükse çıktıya marker ekler:

```
[tn] truncated: 113 more lines after line 3 (of 116 total).
     Re-read with offset=4 limit=200, OR use bash_raw:
     sed -n '4,116p' /path/to/file.md
```

Plugin **tek sorumluluk**: "dosyanın devamı var mı?" sorusuna cevap.
Prune/özetleme **yapmaz**. `opencode-context-saver` ile birlikte
güvenle çalışır (ikisi farklı katmanlar).

## Kurulum

`opencode.jsonc`'ye ekle:

```jsonc
{
  "plugin": [
    "./plugins/opencode-context-saver.ts",
    "./plugins/opencode-build-tracker.ts",
    "./plugins/opencode-truncation-noticer.ts"
  ],
  "pluginOptions": {
    "opencode-truncation-noticer": {
      "enabled": true,
      "watchTools": ["read"],
      "skipWhenContains": "#no-trunc-notice"
    }
  }
}
```

## Konfigürasyon

| Alan | Default | Açıklama |
|---|---|---|
| `enabled` | `true` | Global açma/kapama. |
| `watchTools` | `["read"]` | Hangi tool adlarına uygulanacak. |
| `skipWhenContains` | `"#no-trunc-notice"` | Tool args içinde bu substring varsa plugin no-op. |

## Marker Formatı

```
[tn] truncated: <remaining> more lines after line <last> (of <total> total).
     Re-read with offset=<last+1> limit=200, OR use bash_raw:
     sed -n '<last+1>,<total>p' <filePath>
```

Marker çıktının **sonuna** eklenir (başa eklenirse `<n>\t` pattern bozulur).

## Mimari Kararlar

- **Tek sorumluluk:** prune/özetleme yok. Sadece "devamı var?" sorusu.
- **Hook framework bağımlılığı:** sadece `experimental.chat.system.transform`
  ve `tool.execute.after`. OpenCode tool override API'si belirsiz
  olduğu için sadece observer + annotator.
- **Output format varsayımı:** `<lineNo>\t<line>`. OpenCode runtime
  gözleminden (TASK-110 doğrulaması). Format değişirse plugin no-op.
- **fs.readFileSync:** dosyayı ikinci kez okumak pahalı görünebilir
  ama read tool çağrısı başına bir kez olur. Büyük dosyalar için
  `fs.statSync` cache'lenebilir (ileride).
- **Disclosure:** oturum başında `experimental.chat.system.transform`'da
  bir kez `[tn-disclosed]` sentinel ile bilgilendirme metni enjekte
  edilir (çift ekleme yok, idempotent).

## MCP Entegrasyonu

`opencode-mcp-bash-tools` (TASK-109) ile tamamlayıcı:

- `bash_safe` → kırpma marker'lı
- `bash_raw` → ham çıktı (kırpma yok)
- **Native `read` + tn plugin** → "devamı var" marker'lı
- **`read` + `#no-trunc-notice` arg** → sessizce geçer (per-call bypass)

## Test

```bash
node --test tests/truncation-noticer.test.mjs
```

14 unit test: parser, marker build, file count, e2e integration.

Ayrıca opencode 1.18.29 binary'sinin `getLegacyPlugins` mantığını
birebir uygulayan runtime simulator:

```bash
node /tmp/opencode/test_runtime_simulation.mjs
```

5/5 ✔ — plugin modülü opencode'un iterate kuralını geçer, hook'lar
çözülür, marker doğru yerde eklenir.

## Dosya Yapısı

```
plugins/
├── lib/
│   └── truncation-notice.ts        ← sabitler + helper'lar (sıfır side-effect)
└── opencode-truncation-noticer.ts  ← sadece Plugin + default export

tests/
└── truncation-noticer.test.mjs     ← lib'den import eder
```

**Neden ayrı dosya?** opencode 1.18.29 `getLegacyPlugins`
(packages/opencode/src/plugin/index.ts:107) tüm modül export'larını
`Object.values(mod)` ile iterate edip her birinin function olmasını
bekliyor. String/object export'lar "Plugin export is not a function"
hatası veriyor. Sabitleri lib'e taşıyarak plugin dosyasını yalnızca
`default` export ile sınırlı tutuyoruz. Aynı pattern opencode'daki
diğer plugin'ler için de gerekli (context-saver, build-tracker
aynı regression'a sahip — ayrı takip görevi).

## Sınırlamalar / Bilinen Riskler

- OpenCode `read` tool çıktı formatı runtime sürümüne göre değişirse
  parser sessizce 0 döner (no-op, güvenli). `metadata` alanından
  daha güvenilir bilgi çıkarılabilir — gelecek iterasyon.
- Binary dosyalar parse edilemez → no-op (kabul edilebilir; read tool
  zaten text döndürür).
- Dev dosya sistemi (procfs, socket) okunamaz → no-op.
- Çok büyük dosyalarda ikinci `fs.readFileSync` maliyetli olabilir.