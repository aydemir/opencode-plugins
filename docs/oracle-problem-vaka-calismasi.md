# LLM'in Kendi Kendini Doğrulayamadığı Yer: Bir Vaka Çalışması

## Başlangıç noktası

Sentetik testler bir iddiayı doğrular: "bu buton bu sonucu verdi mi?" Ama
koddaki asıl kırılma noktası genelde *beklenmedik* etkileşim sırasıdır —
insanın mantıksız ama gerçek bir sırayla tıkladığı, ya da bir sürecin
beklenmedik şekilde bittiği yer. Sentetik test bunu yakalayamaz, çünkü
spec zaten "doğru" akışı tarif eder.

Bunun kökünde **oracle problem** var: LLM, ürettiği kodun/kararın doğru mu
bozuk mu olduğuna karar verecek güvenilir bir iç referansa sahip değil.
Bu yazı, bu boşluğu dışarıdan bağımsız kanıtla (ps çıktısı, gerçek build
koşumu, ölçülmüş CPU zamanı) doldurma sürecinin, bir haftalık gerçek
mühendislik işinde nasıl işlediğinin kaydı.

## Örnek 1 — "Görünen" ile "gerçek" arasındaki fark

Bir context-saver eklentisinin ürettiği "kırpıldı" uyarısının TUI'de
gerçekten görünür olup olmadığını doğrulamak istedik. İlk üç deneme FAIL
verdi — ve script haklıydı: uyarı viewport'ta yoktu, çünkü TUI o bölümü
*daraltılmış* (collapsed) gösteriyordu. Mouse ile açma yolu vardı, klavye
ile yoktu — otomatik test bu yüzden geçemiyordu.

Çözüm, ortamı zorlamak (mouse tıklamasını simüle etmeye çalışmak) değil,
test verisini daraltma eşiğini hiç geçmeyecek şekilde yeniden tasarlamak
oldu. **Ders:** Engeli zorla aşmaya çalışmak yerine, test senaryosunu
ortamın gerçek davranışına göre kurmak genelde daha sağlam bir çözüm.

## Örnek 2 — Node'un "öldürdüm" demesi ile gerçeğin farkı

Bir exec sarmalayıcısında `timeout` süresi dolduğunda Node `KILLED` diye
raporluyordu. Ama bu iddiayı `ps aux` ile canlı kontrol ettiğimizde,
`/bin/sh` altında spawn edilen torun process'lerin **orphan olarak
sistemde yaşamaya devam ettiğini** gördük. `/bin/bash` kullanınca aynı
senaryo temiz çıkıyordu — shell seçimi rastgele değil, kritik bir korumaymış.

```
Senaryo              Node'un dediği    Gerçek (ps ile)
normal (/bin/sh)     KILLED            🚨 ORPHAN
normal (/bin/bash)   KILLED            ✅ TEMİZ
```

**Ders:** "Promise reddedildi" ile "process öldü" farklı iddialardır.
Birini doğrulamak diğerini garantilemez — bunu ancak sistemin kendisine
(process tablosuna) bakarak kanıtlayabilirsiniz.

## Örnek 3 — Kendi bulduğunuz kör noktayı da sorgulamak

Bir derleme aracının (CPU zamanına bakarak) asılıp asılmadığını tespit
eden bir izleyici yazdık. İlk testte gerçek bir `npm run build` üzerinde
**yanlış alarm** aldık — derleme sağlıklı ilerliyordu ama izleyici "asıldı"
diyordu. Kök neden: `npm`'in kendi CPU'su flat kalıyordu çünkü asıl işi
yapan `tsc` süreci bir **torun process**'ti, hiç izlenmiyordu.

Bunu düzeltirken ikinci bir hata daha bulduk: CPU-zamanı ölçen kod,
yanlış alanı (`utime` yerine `stime+cutime`) okuyordu — bu, önceki bir
"başarılı" test kanıtının da hatalı ölçümle üretilmiş olabileceği
anlamına geliyordu. Bunu gizlemedik, kayda "önceki kanıt bu hatayla
üretilmiş olabilir" diye düştük.

**Ders:** Bir düzeltmeyi test ederken, testin *kendisinin* doğru ölçtüğünü
de sorgulamak gerekir. "Yeşil tik" iki farklı şeyin yeşil çıkması
anlamına gelebilir: doğru davranış, ya da yanlış ölçen bir test.

## Hüküm / Yetki / Tavan — üç sorumluluğu ayırmak

Çok katmanlı bir güvenlik mekanizması tasarlarken üç farklı sorumluluğu
karıştırmamak önemli:

- **Hüküm** (bu durum asılı mı?) — kanıta dayalı bir dedektör verir.
- **Yetki** (bu hükme göre öldürme yapılabilir mi?) — açık bir bayrakla
  beyan edilir, sessizce varsayılmaz.
- **Tavan** (mutlak üst sınır) — dedektörün göremediği kör noktalar
  (örn. sonsuz döngüde CPU tüketmeye devam eden bir kaçak) için geniş,
  "aptal" bir bütçe. Tavanın dolması "asıldı" hükmü değildir, sadece
  "bütçe bitti, kontrol et" sinyalidir.

Bu ayrımı netleştirmeden önce, "asılma tespiti" ile "zaman aşımı" aynı
şeymiş gibi karıştırılıyordu — bir mekanizma her ikisini birden yapmaya
çalışınca, ya çok erken öldürüyor (meşru bekleyen bir I/O işlemini) ya da
hiç öldürmüyordu (gerçek kaçak sürece karşı).

## Genelleme tuzağı

Bir düzeltme çalıştığında sorulması gereken soru: bu çözüm genellenebilir
mi, yoksa tek bir araca mı özel? "npm ise şöyle davran, cargo ise böyle"
tarzı bir araç-listesi kontrolü genelde yanlış yoldur — her yeni araç
yeniden keşif gerektirir. Bunun yerine güvenli varsayılanı seçmek (torun
process'leri her zaman izle, maliyeti kabul edilebilirse) daha sağlam.

Ayrıca: bir karar sadece bir konuşmada/prompt'ta kalıp koda hiç
düşmezse, bir sonraki oturum aynı hatayı sıfırdan keşfeder. Kararı kod
içinde kısa bir gerekçe bloğu olarak deklare etmek, bu tekrarı önler.

## Yeni bir harness'ın çözümüyle karşılaştırmak — ama kopyalamadan

Farklı bir agent harness'ının (job/background modeli ile uzun süren
işleri tool-call penceresinin dışına çıkarması) aynı problemi nasıl
çözdüğünü incelemek faydalı bir referans noktası oldu. Ama bunu doğrudan
kopyalamak yerine, önce kendi altyapımızda eşdeğer bir yetenek olup
olmadığını üç ayrı canlı koşumla test ettik:

- Native bir kanalın tool-call'dan daha geniş bir pencereye sahip olup
  olmadığı
- Background bir görevin gerçekten var olup olmadığı
- Varsa, sonucun güvenilir şekilde toplanıp toplanamadığı

Sonuç: background başlatma çalıştı, ama sonuç toplama hiçbir ölçekte
materialize olmadı. Yeni bir katman inşa etmek yerine, zaten kanıtlanmış
olan "işi küçük parçalara bölüp devam ettirme" yaklaşımını resmi disiplin
olarak benimsedik — kanıtsız bir yatırım yapmaktansa.

**Ders:** Başka bir sistemin iyi bir fikri olması, o fikri hemen taşımak
için yeterli gerekçe değildir. Önce "bizim altyapımızda bu zaten var mı"
sorusunu canlı test edin.

## Özet — tekrarlanabilir bir döngü

```
yaz → canlı test et → kendi çıkarımını sorgulat → düzelt → tekrar test et
```

Her adımda iddiayı üreten katmandan bağımsız bir kanıt aranır. Bu, LLM
ajanlarının "oracle problem"ini tamamen çözmez — ama onu, dışarıdan
doğrulanabilir küçük parçalara bölerek yönetilebilir hale getirir.

En değerli tek alışkanlık şu oldu: bir sonuç "başarılı" göründüğünde,
"bunu hangi bağımsız kanıtla doğruladım?" sorusunu sormak — ve cevap
yoksa, henüz bitmediğini kabul etmek.
