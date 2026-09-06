# Not: Gözlem katmanı gerçeğin yerini tutmaz — her iddiayı üreten katmanın dışından doğrula

> Kaynak: kullanıcının 1-4. maddelik notu (2026-09-06), asistana ait
> genişletme/düzeltmelerle revize edildi. Revizyon kaydı en altta.

## 1. Sentetik test vs canlı keşif (başlangıç noktası)

Sentetik/otomatik testler önceden yazılmış senaryoyu doğrular ("bu buton bu
sonucu verdi mi"). Ama kod, insanın beklenmedik sırayla etkileşime girdiği
yerlerde kırılır — bunu ancak gerçekten kullanarak (canlı keşif) yakalarsın.
Piyasada bu ikisi ayrı kavram (scripted/spec-based test vs exploratory test)
ama LLM-agent araçları hep birinciyi otomatikleştirmiş, ikincisini es geçmiş.

## 2. Oracle problem (zayıf oracle ile riski azaltma)

Keşif sırasında LLM'in karşılaştığı ekranın "doğru" mu "bozuk" mu olduğuna
karar verecek bir referansı yok. Bu yüzden serbest keşif genelde ya döngüye
girer ya da anlamsız sonuç üretir. TASK-112'de yapılan şey bu problemi tam
çözmek değil, **"zayıf oracle"** kurarak riski azaltmaktı: "kesin arıza"
(crash, marker görünmemesi) ile "sübjektif tuhaflık"ı ayıran, literal marker
(kesin) + sayısal istatistik (zayıf) kriterleri.

## 3. TASK-112 — prune marker deneyi

Kanıtlanmak istenen şey: context-saver plugin'inin ürettiği "kırpıldı" mesajı
gerçekten ekranda (TUI'de) görünüyor mu. 4 denemede öğrenilenler:

- Gözle bakınca görünüyor sanıldı; script FAIL dedi — ve script haklıydı,
  çünkü TUI o kısmı "collapsed" (daraltılmış, tıklanınca açılan) gösteriyormuş
- Mouse ile açma yolu var ama klavye ile yok — yani otomatik script mouse
  simüle edemediği için o yoldan geçemedi
- Çözüm: payload (test verisi) öyle tasarlandı ki daraltma eşiğini hiç
  geçmesin, direkt açık görünsün — sorun ortamı zorlayarak değil, test girdisi
  uyarlanarak çözüldü. Bunun kavram adı **test edilebilirlik için tasarım**
  (design for testability).

## 4. Timeout / orphan process meselesi (son konu)

Bu ayrı ama benzer bir "gözle görünenle gerçek farklı" durumu:

- İlk varsayım "kanca (hook) asılı kalan işlemi (process) yakalayabilir" idi
- Gerçekte: kanca, işlem bitene kadar zaten çalışmıyor (asılı kalan şeyi
  görebilmesi mümkün değil, çünkü sırası hiç gelmiyor)
- Zaman aşımı (timeout) ayrı bir mekanizma; o da her zaman garanti değil —
  çünkü bazı komutlar bir "kabuk" (shell) açıp o kabuğun içinde başka bir işlem
  daha başlatıyor. Zaman aşımı süresi dolunca sadece dıştaki kabuğa "dur"
  sinyali (SIGTERM) gidiyor; içerideki torun işlem bu sinyali hiç almayıp
  **öksüz (orphan)** olarak sistemde yaşamaya devam edebiliyor. (Orphan ≠
  zombie: orphan PPID 1'e yetimlenmiş, CPU'da yaşayan process'tir; zombie
  ölüp `wait()` edilmemiş olandır. Bu probe'da görülen orphan'dı.)
- Canlı test: /bin/sh ile torun orphan kalıyor, /bin/bash ile temiz ölüyor
  (2/2 gözlem) — yani projenin zaten /bin/bash seçmiş olması tesadüf değil,
  kritik bir korumaymış. (Bash'in iç mekanizması bu probe ile kanıtlanmadı;
  bulgu gözlem düzeyinde kayıtlı — TASK-115 Koşum 3.)
- Kategorik çözümün adı kondu ama uygulanmadı: process-group kill (`setsid` +
  `kill(-pgid)`) torun-kaçağını kapatır; tek başına `SIGKILL` kapatmaz
  (sinyal yine sadece doğrudan çocuğa gider). Uygulanmama gerekçesi TASK-115'te
  kayıtlı: basit-child vakası bash ile temiz.
- Ayrı cümle olarak: `nohup … & disown` timeout'a hiç yakalanmaz — bu
  "timeout başarısızlığı" değil, kapsam dışı davranış; process *niyet olarak*
  arka plana geçiyor. Kural: tool komutlarında `&`/`nohup` yok.

## 5. İlke: üreten katmanın dışından doğrula

Dörd maddenin ortak noktası — sistemin "söylediği şey" ile "gerçekte olan şey"
arasında fark olabiliyor ve bu ancak bağımsız bir yöntemle yakalanıyor:

| İddia (üreten katman) | Harici doğrulama | Sonuç |
|---|---|---|
| `tool/result` "marker yok" | `capture-pane` ile viewport okuma | Marker varmış, collapsed arkasında (TASK-112) |
| `exec` "timeout, KILLED" | `ps` ile PID takibi | Torun orphan yaşıyormuş (TASK-115) |

## Revizyon kaydı (2026-09-06)

- Başlık teze çevrildi; 4. maddenin kapanış paragrafı başlığa taşındı.
- Madde 2: "zayıf oracle" adlandırması eklendi.
- Madde 3: özne kayması düzeltildi ("script haklıydı"); çözüme kavram adı
  eklendi (design for testability).
- Madde 4: orphan≠zombie ayrımı, mekanizmanın gözlem-düzeyi çerçevesi,
  process-group kill adı + uygulanmama gerekçesi, daemonize ayrı cümlesi.
- Madde 5 (ilke + kanıt tablosu) eklendi.
