# Post Stüdyo ve İçerik Üretim Merkezi: geliştirme durumu

Kota biterse buradan devam edilir. Testler en sonda toplu yapılır. Her adım bitince bu dosya güncellenir ve dala ara kayıt gönderilir.

## Tek sıra (bugün gelen bütün talimatlar)

Kaynak talimatlar: (1) Post Stüdyo geliştirme talimatları, (2) Akıllı şablon sistemi, (3) Açık kaynak editör incelemesi, (4) Öğe kütüphanesi, (5) Çoklu yapay zekâ API platform seçimi.

| Sıra | Adım | Konu | Durum |
|---|---|---|---|
| 1 | A1 | Geri al / yinele düzeltmesi, kısayollar | ✅ |
| 2 | A2 | Gruplama, sağ tık menüsü, sayfa işlemleri, yeni sayfa türleri | ✅ |
| 3 | A3 | Katmanlar paneli yeniden tasarım | ✅ |
| 4 | A4 | Renk seçici, gradyan, zemin düzenleme | ✅ |
| 5 | A5a | Maskot yerleşimi: otomatik / ben yerleştireceğim / kullanma; poz değiştirme; konum korunur | ✅ |
| 6 | E | Çoklu yapay zekâ API platform seçimi (OpenRouter ve alternatifleri; resmî kaynaklardan fiyat; 10 $/ay bütçe; karar). Yalnızca rapor, kod yok | ✅ rapor: docs/AI_PLATFORM_KARARI.md (onay bekliyor) |
| 7 | A5b | Referanstan şablon: tasarım türü seçimi (tekli / carousel / Reels kapağı / story / diğer), tekli için tek referans ya da hepsini birlikte; carousel hikâye akışı | ✅ |
| 8 | C1-C2 | Mevcut sistemin teknik analizi + dört deponun kaynak kod incelemesi, 17 özellikte karşılaştırma, lisans değerlendirmesi (docs/ENTEGRASYON_ANALIZI.md) | ✅ |
| 9 | B1+C4 | Akıllı şablon değişkenleri ve alan kimlikleri (MAIN_TITLE, SUB_TITLE, DESCRIPTION, MAIN_IMAGE, LOGO, CTA, MASCOT); değiştirilebilir / sabit seçimi | ✅ |
| 10 | B5+B9 | Şablon versiyonlama (V1, V2...), marka şablon paketleri, şablonun markası/versiyonu/kullanıldığı içerikler | ✅ |
| 11 | B2 | Marka tasarım kilidi (renk, font, font boyutu, kenar boşluğu, logo, maskot kuralları) | ✅ |
| 12 | B6 | Metin taşması ve yerleşim kontrolü (okunurluğu bozan küçültme yok, kısaltma önerisi, çakışma, kenar boşluğu) | ✅ |
| 13 | B7 | Tasarım tutarlılığı kontrolü ve toplu uygulama | ✅ |
| 14 | B3 | Üretim sonrası önizleme ve kalite kontrol ekranı | ✅ |
| 15 | B4+A5c | Toplu üretim kuyruğu ve fikir havuzundan etiketle toplu üretim (durumlar, durdur/devam/tekrar, çift üretim engeli) | ✅ |
| 16 | B8 | Maliyet ve hız: yalnızca değişken metin AI'dan, AI / sistem işlemleri ayrımı görünür | ⏳ |
| 17 | D1-D2 | Görsel kaynak araştırması, lisans süzgeci, merkezi varlık kaydı | ⏳ |
| 18 | D3-D4 | Öğeler paneli (kategori, Türkçe arama, son kullanılan, favori, popüler, yeni, sürükle-bırak), vektör ve renk değiştirme, döndürme | ⏳ |
| 19 | D5 | Öğe yönetim paneli (tekli / ZIP yükleme, kategori, etiket, lisans, yayın), lisanslar sayfası | ⏳ |
| 20 | A6 | Editörde AI komutları, asistan görünümü (markaya göre), tekrar eden seçim alanının kaldırılması | ⏳ |
| 21 | A7 | Analiz raporları: hazır görsel şablonları, elle prompt / tarifler, Reels ve Prompt Studio ayrımı, video ve altyazı yetenekleri | ⏳ |
| 22 | Z | Toplu test, PR, rapor | ⏳ |

## Bekleyen kararlar (en sonda tekrar sorulacak)

- Lisans: son talimatta uygulama "ticari ve kapalı kaynak" olarak tanımlandı (önceden "ticari değiliz" denmişti). Buna göre AGPL (HyCanvas) ve görünür atıf şartlı (Doory) kod alınmaz; MIT kaynaklarda bildirim dosyası korunur.
- Hazır görsel şablonları (A7): Prompt Studio'dan kaldırılsın mı, Post stüdyosuna mı taşınsın?
- Reels ve Prompt Studio ayrımı (A7): önerilen sadeleştirme onay bekliyor.
- Yapay zekâ platformu (E): rapordaki karar onaylanınca entegrasyon yapılacak.

## Notlar

- A1: Sorun, renk/kaydırıcı/seçim alanına tıkladıktan sonra odağın orada kalması ve kısayolun "yazı yazılıyor" sayılıp yok sayılmasıydı. Artık yalnızca yazı alanları tarayıcının kendi geri almasını kullanır. Aynı alandaki art arda değişiklikler tek adım sayılır. Üst çubuğa geri al / yinele düğmeleri eklendi.
- A2: Sağ tık menüsü (kopyala, yapıştır, çoğalt, sil, öne/arkaya, kilitle, her yeni sayfada tekrarla, grupla, grubu çöz, tüm slaytlara uygula), dokunmatikte uzun basma. Ctrl+G / Ctrl+Shift+G; gruptaki katmana tıklayınca grup seçilir, Alt+tık tek katman. Sayfa şeridinde sürükle-bırak sıralama ve sağ tık sayfa menüsü. "Slayt ekle": kapak / bilgi / kapanış sayfası (mevcut düzenden), çoğalt, boş sayfa (zemin + sabit öğeler).
- A3: Katmanlarda küçük önizleme, sürükle-bırak, grup başlığı altında toplanma, Shift+tık çoklu seçim, Grupla / Öne / Arkaya düğmeleri, "sabit" etiketi.
- A4: Kendi renk seçicimiz (public/js/colorPicker.js): seçili renk ayrı büyük önizlemede; HEX/RGB/HSL, doygunluk alanı + ton çubuğu, damlalık, marka renkleri, son kullanılanlar, kayıtlı paletler; şekil ve zeminde gradyan. Zemin panelinde hazır zeminler, görsel ölçek ve konum, bütün sayfalara uygula, zemini sabitle.
- A5a: Üretimde maskot seçeneği (otomatik / ben yerleştireceğim / kullanma) hızlı üretim satırında ve "Havuzdan" penceresinde; otomatik değilse maskot, balon ve konuşma kutuları çıkarılır ve modele poz sorulmaz. Düzenleyicide seçili maskotun pozu kütüphaneden değişir (yer ve boyut aynı); yeni maskot önceki maskotun yerine, yoksa sağ alta yerleşir; "Bu konumu bütün sayfalarda kullan" ve "Yeni sayfalarda tekrarla".
- A5b: Referans penceresinde önce tasarım türü (carousel / tekli / Reels kapağı / story / diğer). Tekli ve diğer türlerde "Tek referanstan ilham al" ya da "Seçtiklerimi birlikte değerlendir"; tekli modda tek seçim tutulur, çok referansta uyarı çıkar. Carousel isteminde kapak hook'u, bilgi sayfalarının akışı ve kapanış tek hikâye olarak istenir. Sunucuda tür oranı (4:5 / 9:16) koordinatlar hesaplanmadan sabitlenir; tek tasarım türlerinde tek slayt; şablon türü buna göre (post / kapak / story).
- C1-C2: docs/ENTEGRASYON_ANALIZI.md: mevcut sistem, dört deponun incelenen dosyaları, 17 özellikte karşılaştırma, strateji, alan kimlikleri planı, lisans kararları. Eksik çıkanlar: döndürme (D4'e eklendi), otomatik kayıt (B5'e eklendi), serbest kırpma kutusu, şablon versiyonu ve alan kimliği.
- B1+C4: Şablon alanı seçimi alan kimlikleriyle (MAIN_TITLE, SUB_TITLE, DESCRIPTION, STAT, ITEM, CTA, SPEECH, TOPIC, PAGE_NUMBER, PAGE_TOTAL; görselde MASCOT, LOGO, MAIN_IMAGE) ve kendi adınla "özel alan" (aynı kimlik birden çok kutuyu ve sayfayı birlikte doldurur). "Sabit: yapay zekâ bu alanı değiştirmesin". Üretimde yalnızca sabit olmayan alanlar istenir; alt başlık, istatistik ve özel alanlar modelden "fields" olarak alınır. Her kutunun genişlik, yazı boyutu ve yüksekliğinden karakter sınırı hesaplanıp modele bildirilir (B6'nın bir parçası: metin baştan kutuya göre yazılır).
- B5+B9: Göç 41 (şablon paketi ve versiyonu, versiyon tablosu, marka tasarım kilidi alanı, toplu üretim kuyruğu tablosu). Şablon V1 olarak kaydedilir; şablonla üretilmiş bir tasarımı düzenleyip Dosya → "Şablonu bu tasarımla güncelle" yeni versiyon (V2...) yapar; eski üretimler kopya olduğu için değişmez. Versiyonlar penceresi: önizleme, "Bu versiyona dön" (yeni versiyon olarak), "Tasarım aç". Üretim API'si istenen versiyonu kabul eder (templateVersion). Şablonlar paketlere göre gruplanır; kartta versiyon ve "N içerikte kullanıldı" (tıklayınca liste, her biri hangi versiyonla). Post verisi şablonun kimliğini, adını ve versiyonunu taşır. Düzenleyicide otomatik kayıt (4 sn), Dosya menüsünden aç/kapat.
- B2+B6+B7: Marka tasarım kilidi (markaya kayıtlı: renk, yazı tipi, logo ve maskot konumu kilidi, kenar boşluğu, başlık/açıklama boyut aralığı, tasarım dili notu, denetim politikası kapalı/uyar/engelle). Düzenleyicide kilitli renk ya da yazı tipini marka dışına çekmek onay ister. Yeni "Kontrol" paneli (public/js/designCheck.js): taşma (okunurluk sınırına kadar küçültülüp yine sığmayan metin, artık en fazla %30 küçültülür), tuval dışı, düşük kontrast, marka dışı renk/font/boyut, kenar boşluğu, eksik görsel, yazı-görsel çakışması; sayfalar arası başlık fontu/boyutu/konumu, logo ve maskot konumu, sayfa numarası, zemin tutarlılığı. Her sorunda "Git" ve varsa "Düzelt", toplu düzeltme. Dışa aktarma kapısı politikaya göre uyarır ya da engeller. Kısaltma önerisinin yapay zekâ ile yapılması A6'da.
- B3: Üretimden sonra (hızlı üretim, Konudan üret, Havuzdan) düzenleyici yerine önizleme penceresi açılır: bütün sayfalar kartlarda, Kapak / İç sayfa / Kapanış etiketi, her sayfanın sorunları (Kontrol denetimi), sürükle-bırak sıralama, "Bu sayfayı düzenle" (düzenleyici o sayfadan açılır), "Bütün tasarımı düzenle", "Kaydet ve listeye dön". Not (Z adımı): eski arayüz testlerinden üretim sonrası doğrudan düzenleyiciye geçmeyi bekleyenler güncellenecek.
- B4+A5c: Toplu üretim kuyruğu (server/services/genQueue.js, gen_jobs tablosu). İçerik fikirlerinde seçim çubuğunda "Toplu üret": şablon (ya da her fikre en uygun şablon), slayt sayısı, maskot, model. Her fikir ayrı fromIdea üretimi (kendi başlığı, metni, sayfaları, kaydı; şablon ortak). Durumlar: bekliyor / işleniyor / tamamlandı / hata oluştu / yeniden denenecek / durduruldu. Hata alan iş bir kez daha denenir; hata diğerlerini durdurmaz. Durdur / devam et / bekleyenleri iptal et / tek işi yeniden dene. Aynı fikir bekleyen, işlenen ya da tamamlanmış bir işte varsa atlanır. Sunucu yeniden başlarsa yarıda kalan iş kuyruğa döner. Post stüdyosunda "Üretim kuyruğu" bölümü (ilerleme çubuğu, 3 sn'de bir yenilenir, tamamlananlarda Aç / Önizle).
