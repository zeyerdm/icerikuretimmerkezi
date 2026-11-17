# Post Stüdyo ve İçerik Üretim Merkezi: geliştirme durumu

Kota biterse buradan devam edilir. Testler en sonda toplu yapılır.

## Sıra

| Adım | Konu | Durum |
|---|---|---|
| A1 | Geri al / yinele düzeltmesi, kısayollar (madde 8) | ✅ |
| A2 | Gruplama, sağ tık menüsü, sayfa işlemleri ve yeni sayfa türleri (2.1, 2.2, 2.4) | ✅ |
| A3 | Katmanlar paneli yeniden tasarım (5) | ✅ |
| A4 | Renk seçici, gradyan, zemin düzenleme (2.3, 4) | ✅ |
| A5 | Maskot yerleşimi (2.5), referanstan şablon akışı (1), marka şablon paketleri ve toplu üretim (3) | ⏳ |
| A6 | Editörde AI komutları (7, 12), asistan görünümü (9), tekrar eden seçim alanı (10) | ⏳ |
| A7 | Analiz raporları (11.1, 11.3, 11.4, 11.5), öğeler paneli önerisi (6) | ⏳ |

### Ek: akıllı şablon sistemi ve otomatik tasarım üretimi

| Adım | Konu | Durum |
|---|---|---|
| B1 | Akıllı şablon değişkenleri: alan alan "değiştirilebilir / sabit" seçimi, yeni alan türleri (alt başlık, istatistik, görsel) | ⏳ |
| B2 | Marka tasarım kilidi: marka bazında renk, font, font boyutu, kenar boşluğu, logo ve maskot kuralları; kilitli alana AI dokunmaz | ⏳ |
| B3 | Üretim sonrası önizleme ve kalite kontrol: bütün sayfalar kartlarda, sıralama, taşma / eksik görsel uyarısı, kapak-kapanış etiketi | ⏳ |
| B4 | Toplu üretim kuyruğu: bekliyor / işleniyor / tamamlandı / hata / yeniden denenecek; durdur, devam, tekrar; çift üretim engeli | ⏳ |
| B5 | Şablon versiyonlama: V1, V2...; eski tasarımlar değişmez, versiyon seçimi, geri dönüş | ⏳ |
| B6 | Metin taşması ve yerleşim kontrolü: okunurluğu bozan küçültme yok, taşma tespiti, kısaltma önerisi, çakışma ve kenar boşluğu kontrolü | ⏳ |
| B7 | Tasarım tutarlılığı kontrolü: font, renk, başlık hiyerarşisi, logo/maskot konumu, numaralandırma; toplu uygulama | ⏳ |
| B8 | Maliyet ve hız: şablonla üretimde yalnızca değişken metin AI'dan; AI / sistem işlemlerinin ayrımı görünür | ⏳ |
| B9 | Veri akışı: şablonun markası, versiyonu ve kullanıldığı içerikler izlenir | ⏳ |

### Ek 2: açık kaynak editörlerin incelenmesi ve öğe kütüphanesi

| Adım | Konu | Durum |
|---|---|---|
| C1 | Mevcut sistemin teknik analizi (mimari, çizim motoru, veri yapısı, katman, sayfa, geçmiş, şablon, dışa aktarma, AI) | ⏳ |
| C2 | Canvix, HyCanvas, Doory, OpenDesign kaynak kod incelemesi; 17 özellikte karşılaştırma tablosu; lisans değerlendirmesi | ⏳ |
| C3 | Entegrasyon stratejisi ve uygulama (çizim motoru korunur; özellikler uyarlanır, kod kopyalanmaz) | ⏳ |
| C4 | OpenDesign tarzı alan kimlikleri (MAIN_TITLE, SUB_TITLE, DESCRIPTION, MAIN_IMAGE, LOGO, CTA, MASCOT); B1 ile birlikte | ⏳ |
| D1 | Görsel kaynak araştırması ve lisans süzgeci (CC0 > atıfsız ticari > atıflı ticari) | ⏳ |
| D2 | Merkezi varlık kaydı: id, dosya, kategori, alt kategori, etiket, biçim, kaynak, lisans, atıf, ticari / yeniden dağıtım izni, renk değiştirilebilirlik, animasyon | ⏳ |
| D3 | Öğeler paneli: kategori ve alt kategori, Türkçe arama (eş anlamlı etiketler), son kullanılanlar, favoriler, popüler, yeni, tembel yükleme, sürükle-bırak | ⏳ |
| D4 | Vektör öğeler: SVG vektör kalır, renk değiştirilebilir; döndürme dahil bütün katman işlemleri | ⏳ |
| D5 | Yönetim paneli: tekli/ZIP toplu yükleme, kategori, etiket, lisans bilgisi, yayına alma / kaldırma, paket yönetimi; lisanslar sayfası | ⏳ |
| Z | Toplu test, PR, rapor | ⏳ |

## Bekleyen kararlar (kullanıcıya en sonda tekrar sorulacak)

- Lisans durumu değişti: son talimatta uygulama "ticari ve kapalı kaynak" olarak tanımlandı (önceden "ticari değiliz" denmişti). Buna göre AGPL (HyCanvas) ve görünür atıf şartlı (Doory) kod hiç alınmaz; MIT kaynaklarda bildirim dosyası korunur.

- Öğeler paneli (6): eklenecek kategoriler onay bekliyor; öneri raporda.
- Hazır görsel şablonları (11.1): Prompt Studio'dan kaldırılsın mı / Post stüdyosuna mı taşınsın?
- Reels ve Prompt Studio ayrımı (11.4): önerilen sadeleştirme onay bekliyor.

## Notlar

- A3: Katmanlar panelinde her katmanın küçük önizlemesi, sürükle-bırak sıralama, grup başlığı altında toplanan grup üyeleri (başlığı sürüklemek bütün grubu taşır), Shift+tık çoklu seçim, Grupla / Öne / Arkaya düğmeleri, "sabit" etiketi.
- A4: Kendi renk seçicimiz (public/js/colorPicker.js): seçili renk ayrı büyük önizlemede; HEX/RGB/HSL, doygunluk alanı + ton çubuğu, damlalık, marka renkleri, son kullanılanlar, kayıtlı paletler; şekil ve zeminde doğrusal/dairesel gradyan, açı, 2-5 durak. Zemin panelinde hazır zeminler, görsel ölçek ve konum, "bütün sayfalara uygula", "zemini sabitle".

- A2: Sağ tık menüsü (kopyala, yapıştır, çoğalt, sil, öne/arkaya, kilitle, her yeni sayfada tekrarla, grupla, grubu çöz, tüm slaytlara uygula), dokunmatikte uzun basma. Ctrl+G / Ctrl+Shift+G; gruptaki katmana tıklayınca grup seçilir, Alt+tık tek katman. Sayfa şeridinde sürükle-bırak sıralama ve sağ tık sayfa menüsü (çoğalt, kopyala, yapıştır, taşı, sil). "Slayt ekle": kapak / bilgi / kapanış sayfası (mevcut düzenden), çoğalt, boş sayfa (zemin + sabit öğeler).

- A1: Sorun, renk/kaydırıcı/seçim alanına tıkladıktan sonra odağın orada kalması ve kısayolun "yazı yazılıyor" sayılıp yok sayılmasıydı. Artık yalnızca yazı alanları (metin kutusu, textarea) tarayıcının kendi geri almasını kullanır. Aynı alandaki art arda değişiklikler tek adım sayılır. Üst çubuğa geri al / yinele düğmeleri eklendi.
