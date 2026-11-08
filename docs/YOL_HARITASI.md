# Yol Haritası

**Nasıl ilerler?** "Sıradaki adım" dendiğinde ilk tamamlanmamış madde yapılır, test edilir, `main`'e alınır ve burada ✅ ile işaretlenir. Uygulama `Baslat` ile açıldığında güncellemeyi kendisi alır.

Durum: ⬜ sırada · 🔄 yapılıyor · ✅ tamamlandı

---

## Aşama 0 — Güvenlik ve güvenilirlik

Hedef: veriler tek bilgisayarda durduğu ve uygulama kendini güncellediği için veri kaybını ve bozuk sürüm riskini baştan kapatmak.

- ✅ **0.1 Yedekleme ve geri yükleme:** her gün kendiliğinden yedek (son 14 gün saklanır); Ayarlar → Yedekler'de "Şimdi yedek al", indir, "Geri yükle", "Yedek dosyasından geri yükle"; geri yüklemeden önce mevcut hâlin yedeği; API anahtarları yedeğe girmez; istenirse her yedeğin bir kopyası Google Drive masaüstü klasörüne.
- ✅ **0.2 Güncellemeyi geri alma:** güncellemeden önce verilerin yedeği alınır; yeni sürüm açılamazsa başlatıcı kendiliğinden önceki sürüme döner ve o sürümü bir daha kurmaz; Ayarlar'da "Önceki sürüme dön" ve gerekirse "Yine de güncelle".
- ✅ **0.3 GitHub'da otomatik test:** her değişiklik GitHub'da Linux (arayüz testleri dahil) ve Windows'ta testlerden geçer; geçmeyen değişiklik `main`'e alınmaz.
- ✅ **0.4 Marka başına Google Drive klasörü:** Ayarlar'da bir kez Apps Script bağlantısı (Google Cloud gerekmez); her markaya kendi Drive klasör linki (marka kurulurken ya da kimlik sayfasında), bağlantı testi, kütüphane görsellerini o klasöre gönderme. Aşama 3'teki her üretim (başlık PNG'si, post, senaryo, altyazı) geldikçe "Drive'a gönder" ona da bağlanır.

## Aşama 1 — Arayüz ve kullanım düzeni (UX/UI)

Hedef: bütün sayfalarda aynı ölçü, hizalama ve düğme dili; karmaşa yerine sade, hizalı, öngörülebilir ekranlar. Kurallar: [docs/TASARIM.md](TASARIM.md)

- ✅ **1.1 Tasarım kuralları:** tek boşluk ölçeği (4-8-12-16-24-32-48), tek köşe seti (8-12-16-20-28), yazı ölçeği, iki kontrol yüksekliği (40/32), iki ikon boyu; stil dosyası bu değişkenlerle baştan yazıldı, sayfalardaki satır içi stiller temizlendi.
- ✅ **1.2 Düğme sistemi:** birincil / ikincil / sessiz / tehlikeli; iki boy; bir alanda tek birincil düğme; üzerine gelme, odak, devre dışı ve "yükleniyor" durumları; ikonlu düğmelerde aynı hiza.
- ✅ **1.3 Hizalama ve ızgara:** bütün sayfalar aynı içerik genişliği (1280) ve kenar boşluğu; üst çubuk içerikle aynı hizada; aynı satırdaki kartlar eşit yükseklikte, alt işlemleri aynı çizgide; her sayfada aynı başlık yapısı.
- ✅ **1.4 Formlar ve pencereler:** bütün alanlar 40 px, tek tip etiket/yardım/hata düzeni; hızlı ekleme satırları aynı yapıda; pencerede sabit üst/alt alan, düğme sırası [Sil] … [Vazgeç] [Kaydet], zorunlu alan uyarısı alanın altında.
- ✅ **1.5 Kenar çubuğu ve üst çubuk:** iki menü aynı ritimde (40 px satırlar); "Yakında" modülleri ayrı başlık altında sade; konum çubuğu, marka değiştirici ve AI durumu aynı hizada.
- ✅ **1.6 Sayfa sayfa düzeltme:** bütün sayfalar yeni düzene geçirildi; okunmayan renkli sayaç kutuları (beyaz yazı sarı zeminde) açık zemin + koyu yazıya çevrildi; AI bağlı değilken soluk ve işlevsiz hızlı işlem kutuları yerine tek uyarı; önce/sonra ekran görüntüleri.
- ✅ **1.7 Boş, yükleniyor ve hata durumları:** her listede aynı boş durum (ikon + başlık + açıklama), sayfaya benzeyen iskelet yükleme, "Tekrar dene" düğmeli hata kutusu.
- ✅ **1.8 Dar ekran ve erişilebilirlik:** tablette ikonlu kenar çubuğu, telefonda üst menü şeridi; takvim günleri klavyeyle planlanır, pencerede odak içeride kalır, dosya seçiciler klavyeyle açılır, görünür odak çerçeveleri, renk kontrastı düzeltmeleri; bunlar testlerle denetlenir.

## Aşama 2 — Yapay zekâ seçimi

Hedef: Gemini'nin Türkçe metin yazımı beğenilmedi; her iş için en iyi modeli birlikte seçmek. Ayrıntılar: [docs/AI_SECENEKLERI.md](AI_SECENEKLERI.md)

- ✅ **2.1 Seçenekler ve maliyet tablosu:** metin, görsel ve video için seçenekler, güçlü yanları ve yaklaşık maliyetleri (uygulamada Yapay zekâ → Karşılaştır altında ve belgede); tek anahtarla birçok model için OpenRouter.
- ✅ **2.2 Karşılaştırma ekranı:** aynı isteği (serbest, Reels senaryosu, gönderi açıklaması, fikir listesi; istenirse marka diliyle) 2-3 modele aynı anda yazdırıp yan yana gösterir; süre, token ve tutar; "Bunu seçtim", geçmiş ve en çok seçilen modeller; tek tıkla bir işe atama.
- ✅ **2.3 Çoklu sağlayıcı altyapısı:** Anthropic Claude (resmî kütüphaneyle), OpenAI, OpenRouter ve Google Gemini; anahtarlar yalnızca sunucuda, bağlanırken denenir (çalışmayan kaydedilmez), yedeğe girmez.
- ✅ **2.4 İşe göre model ataması:** "fikir üretimi ve asistan", "metin yazımı", "çeviri ve prompt" için ayrı model ve yedek model; geçici hatada (bağlantı, kota, sunucu) kendiliğinden yedeğe geçiş. Görsel model ataması görsel üretimiyle birlikte Aşama 4.5'te.
- ✅ **2.5 AI harcama takibi:** her çağrının sağlayıcı, model, iş, marka, token ve tutar kaydı; aylık döküm (markaya, işe, modele göre); aylık üst sınır, eşikte üst çubukta uyarı, sınırda yeni istek yapılmaz; fiyatlar elle düzeltilebilir, OpenRouter gerçek tutarı bildirir.

## Aşama 3 — Eski sistemin (icerikuretici) özelliklerini geliştirilmiş hâlleriyle taşıma

Hedef: eski sistemde çalışan her şey yeni sistemde, istenen düzeltmelerle ve markadan bağımsız çalışsın. DevOrtak'a ait veri, karakter, görsel ve ayarlar taşınmaz.

- ✅ **3.1 Reels fikir havuzu:** kategoriler, rastgele seçim, benzer fikir üretme (havuzu genişletme, aynı fikir iki kez eklenmez), beğen/beğenme, büyütülebilir havuz; markanın kendi fikirleriyle. Marka başına karakter, görsel stil (3D / gerçekçi / 2D) ve başlık stili ayarı.
- ✅ **3.2 Reels senaryo üretimi:** 5 format (vlog, skeç, hikâye, bilgi, tanıtım); saniye saniye sahneler, sahne sürekliliği, konuşma öncelikli yazım, "asıl espri" ile biten kurgu, çağrı/arayüz yasağı, doğal konuşma hızına göre sahne süresi (3–8 sn, en çok 6 sahne, 45 sn), kalite kontrolü uyarıları (karakter adı, gerçek isim, süre, konuşma yoğunluğu). Durum: taslak → hazır → çekildi → paylaşıldı.
- ✅ **3.3 Flow/Veo prompt'ları:** iki dilli (Türkçe + İngilizce) prompt, Türkçeden düzeltip İngilizceye çevirme (Türkçe değişince İngilizcenin eskidiği gösterilir), yazısız Veo prompt'u, sinematik stil satırı, gerçek isim temizleme; tek tıkla kopyalama.
- ✅ **3.4 Tekrar üretme:** senaryonun tamamını veya tek sahneyi yeniden yazdırma (istenirse başka modelle); her üretim sürüm olarak saklanır, önceki sürüme dönülebilir; geçen süre göstergesi ve 3 dakikalık zaman sınırı.
- ✅ **3.5 Başlık ve altyazı:** 6 başlık stili (önizlemeli, vurgu kelimesiyle), şeffaf 1080×1920 başlık PNG'si, `.srt` altyazı dosyası; başlık yalnızca ilk sahnenin prompt'unda, altyazı kurguda. İndirme ve markanın Drive klasörüne gönderme.
- ✅ **3.6 Carousel/post üretimi ve editörü:** konudan slayt üretimi ya da boş tasarım; yazı/görsel/şekil katmanları, tıkla-seç, sürükle-bırak ve ok tuşlarıyla ince ayar, kütüphaneden logo ve maskot pozları, marka renk/font uygulaması, metni yeniden yazdırma, PNG dışa aktarma ve Drive'a gönderme (Post stüdyosunun ilk sürümü).
- ✅ **3.7 AI içerik denetçisi:** açıklama, Reels ve carousel metinlerinin marka diline, uzunluğa ve kurallara uygunluk kontrolü; puan, sorun listesi ve önerilen düzeltilmiş metin (tek tıkla kullanılır). Kendi model ataması ("İçerik denetimi").
- ✅ **3.8 Senaryo dışa aktarma:** senaryo metni, telepromter görünümü, sahne listesi, `.srt`; takvime ekleme, arşivde ve içerik kartında senaryoya/tasarıma bağlantı.

**Kural (bütün üretim ekranları):** her üretim düğmesinin yanında model seçici bulunur (varsayılan: işe atanmış model) ve sonuç "başka modelle tekrar yaz" ile yeniden üretilebilir.

## Aşama 3.5 — Uygulama kimliği: KREATİFHANE

- ✅ **3.9 Ad, slogan ve logo:** uygulama adı **KREATİFHANE**, slogan **"Fikirden üretime, her şey tek merkezde"**, tanım **Creative Management Platform** (Türkçesi: **Kreatif Yönetim Platformu**). Piksel kareli "K" logosunun SVG hâli (koyu lacivert üzerinde turkuaz→mor geçiş; küçük boy ve açık zemin sürümleri). Uygulama başlığı, kenar çubuğu logosu, favicon, karşılama ekranı ve README'ye uygulanır.

## Arayüz düzeni (kullanıcının ekran görüntüleriyle yapılacak)

- ✅ **U.1 Tasarım ekranlarını sadeleştirme (Canva benzeri yerleşim):** kullanıcının Canva ekran görüntülerine göre.
  - ✅ **Post stüdyosu:** tam ekran düzenleyici; üstte Dosya (ad, kaydet, marka şablonu, takvim, sil), Yeniden boyutlandır ve Paylaş (PNG, bütün slaytlar, Drive, takvim, şablon) menüleri; solda araç rayı (Metin, Öğeler, Marka, Yüklemeler, Şablonlar, Zemin, AI, Açıklama) ve tıklandıkça açılıp kapanan panel; ortada ekrana sığan tasarım alanı (sayfa kaymaz); altta sayfa şeridi ve yakınlaştırma; sağda yalnızca öğe seçiliyken ayarlar.
  - ✅ **Reels senaryo ekranı:** tam ekran; üstte Dosya (sürümler, yeniden yaz, sil), durum seçici, Takvime ekle ve Dışa aktar (kopyala, .txt, .srt, başlık PNG, telepromter, Drive); solda Özet, Yeniden yaz, Başlık, Açıklama, Kalite, Sürümler panelleri; ortada kendi içinde kayan sahneler; altta sahne şeridi (tıklayınca sahneye gider).
  - ✅ **Prompt Studio:** tam ekran; üstte Dosya (favori, sürümler, sil), Kaydet ve Prompt'u kopyala; solda Geliştir, Görsel üret, Sürümler panelleri; ortada prompt düzenleyici.

## Aşama 4 — Geliştirme ve yenileme

Hedef: taşınan modülleri ilk talimattaki tam hedefe taşımak.

- ✅ **4.1 Prompt Studio:** görsel, video, Reels, metin, reklam, ürün fotoğrafı, maskot animasyonu ve post tasarımı için prompt oluşturma (marka hafızası ve maskot/stil ayarı otomatik eklenir; görsel/video prompt'ları İngilizce + Türkçesi); düzenleme, kopyalama, kaydetme, elle prompt kaydetme, favoriler, türe göre filtre ve arama.
- ✅ **4.2 Prompt geliştirme mekanizması:** girişi değiştir, senaryoyu geliştir, daha yaratıcı/profesyonel yap, görsel detay ekle, kamera açısını değiştir, karakter hareketi ekle, kısalt, alternatif üret, seçili bölümü yeniden yaz; **sürüm geçmişi ve önceki sürüme dönme**.
- ✅ **4.3 Asistanın modüllere bağlanması:** asistan sohbetten gerçekten işlem yapar: fikir kaydetme ve düzenleme ("bu fikri daha eğlenceli yap"), Reels fikir havuzuna ekleme ("haftaya 5 Reels fikri üret"), Reels senaryosu yazma, post/carousel tasarlama ("bu senaryoya göre post tasarla"), Prompt Studio'da prompt üretme, takvime içerik planlama, görev ekleme. Her sonuç sohbette ilgili modüle bağlantıyla görünür; başarısız işlem açıkça yazılır. Tek mesajda en çok 3 ağır üretim.
- ✅ **4.4 Post stüdyosu (tam):** post, carousel, story, Reels kapağı, reklam (eylem çağrısı düğmesiyle) ve bilgi grafiği (numaralı maddeler); her türün kendi boyutu, metin kuralları ve marka yerleşimi. Katmanlar (öne/arkaya), yazı/renk/font/kalınlık/hizalama, saydamlık, dikdörtgen ve daire, logo/maskot/sticker (kütüphaneden, kategori filtreli), zemin rengi ya da zemin görseli (kapla/sığdır, karartma), sürükle-bırak konumlandırma, şablon kaydetme ve şablondan başlatma.
- ✅ **4.5 Görsel üretimi:** Gemini (Nano Banana / Flash Image, Imagen 4, Imagen 4 Fast), OpenAI (GPT Image 1, mini) ve OpenRouter üzerinden görsel üretimi; oran seçimi, marka renkleri, maskot referansı (destekleyen modellerde kütüphanedeki maskot pozu gönderilir). Prompt Studio'da (görsel, ürün, reklam, post türleri), Kütüphane → AI görseli sekmesinde ve asistanda ("maskotla bir görsel üret"). Sonuç kütüphaneye kaydedilir, üretim kaydı (prompt, model, oran, tutar) tutulur, harcama "Görsel üretimi" olarak izlenir; Yapay zekâ sayfasında varsayılan görsel modeli seçilir. Görsel servisi bağlı değilse üretim düğmesi yerine nasıl bağlanacağı yazar (sahte üretim yok).
- ✅ **4.6 Tasarım referansı analizi:** Post stüdyosu → "Referanstan şablon": kütüphanedeki ya da yeni yüklenen örnek tasarımı görseli okuyabilen modelle (Claude, GPT-5, Gemini, görsel destekli OpenRouter) inceleme; renk paleti, font benzerleri (uygulamadaki fontlardan), ruh hâli, boyut ve yerleşim (metin blokları, şekiller, görsel alanları) çıkarılıp düzenlenebilir şablon olarak kaydedilir. Referanstaki metinler ve başka markaların logoları kopyalanmaz; görsel alanlarına markanın kendi logo/maskot/görseli konur, uygun dosya yoksa alan "Görsel alanı" olarak işaretlenir. Metin modelleri artık görsel de okuyabiliyor (diğer modüllerde kullanılmaya hazır).
- ✅ **4.7 Sticker paketleri ve varlık kütüphanesi genişletme:** her kategoride paket olarak yükleme (ZIP arşivi ya da çoklu görsel; ZIP'teki alt klasör adları etiket olur, görsel olmayan dosyalar atlanır), paket filtresi ve paketi toplu silme, dosyalara etiket ekleme, ad/etiket/paket araması; yeni "AI görseli" kategorisi; Post stüdyosunda sticker seçici paketlere göre filtrelenir.
- ✅ **4.8 Paylaşım sonucu girişi:** içerik penceresinde "Paylaşım sonucu" bölümü (izlenme, erişim, beğeni, yorum, kaydetme, paylaşım, yeni takipçi, giriş cümlesi, tema); etkileşim oranı = (beğeni + yorum + 2×kaydetme + 3×paylaşım) / izlenme. Analizlerde "Ne işe yaradı": en çok/en az tutanlar, türe, güne, saate ve temaya göre etkileşim, tutan giriş cümleleri. En çok ve en az tutan içerikler marka hafızasına eklenir; asistan ve bütün üretim ekranları bunlardan öğrenir.
- ✅ **4.9 İçeriğin tamamı tek kartta:** içerik penceresinde "Yayın metni" (açıklama, hashtag'ler, ilk yorum; kopyalama düğmeleri), "AI ile yaz" (model seçilir; bağlı Reels senaryosu ya da tasarım metinleri kaynak alınır), türe göre hazır yapılacaklar listesi (Reels: senaryo → çekim → kurgu → kapak → açıklama; adım eklenir/silinir) ve paylaşım sonucu. Senaryodan ya da tasarımdan takvime eklenen içeriğe açıklama ve hashtag'ler kendiliğinden geçer; arşivde ilerleme (✓ 2/5) görünür.
- ✅ **4.10 Özel günler takvimi:** Türkiye'nin resmî/millî günleri, dinî bayramlar ve Ramazan (Diyanet takvimine göre 2025–2028 tablosu; tablo dışı yıllarda bayram uydurulmaz), ticari günler (Anneler/Babalar Günü, Sevgililer Günü, Black Friday), dünya günleri ve dönemler (okula dönüş, vize/final, yaz, yılbaşı alışverişi). Takvimde renkli işaretler (gizlenebilir); tıklayınca içerik ipucu, "Bu güne içerik planla" ve "Bu gün için 3 fikir üret" (markanın fikir havuzuna). Yönetim Merkezi'nde yaklaşan özel günler; asistan önümüzdeki 45 günü bilir (anma günlerinde ticari içerik önermez).
- ✅ **4.11 Kimliği AI ile doldurma:** marka profilinde (yeni markada da) "AI ile doldur": web sitesi metni, Instagram biyografisi ya da tanıtım yazısı yapıştırılır, model seçilir; marka adı, sektör, açıklama, hedef kitle, karakter, iletişim dili, hedefler, rakipler ve slogan taslak olarak forma dolar (varsayılan: yalnızca boş alanlar; doldurulanlar vurgulanır). Metinde olmayan bilgi uydurulmaz; renk ve font yalnızca metinde açıkça geçiyorsa alınır. Kaydetmek kullanıcıya kalır.
- ✅ **4.12 Hatırlatmalar:** günde ilk açılışta sayfanın üstünde kapatılabilir "Günün özeti" şeridi (bugün yayında olanlar, tarihi geçen içerikler, bugün biten ve süresi dolan görevler, yaklaşan özel gün); üst çubukta bekleyen iş rozetli zil ve ayrıntılı özet penceresi; Ayarlar → Hatırlatmalar'dan şeridi kapatma ve yayın saatinden 30 dk önce bilgisayar bildirimi (uygulama açıkken).

## Öncelikli (kullanıcının isteğiyle, Aşama 5'ten önce)

- ✅ **P.1 Akıllı marka hafızası:** her markanın kendine ait, görülebilen ve düzenlenebilen AI hafızası; yapay zekâya markayı her seferinde yeniden anlatmak gerekmez.
  - Şu an olanlar (her üretime otomatik giriyor): marka dili ve hitap (kimlikteki "İletişim dili"), renkler ve yazı tipleri, hedef kitle, marka açıklaması/karakteri/hedefleri, paylaşım sonuçlarına göre en çok ve en az tutan içerikler (4.8), beğenilen fikirler.
  - ✅ Yapıldı: marka menüsünde **Hafıza** sayfası; **kullanılmaması gereken kelimeler** (her üretimde "ASLA KULLANMA" olarak isteme girer, içerik denetçisi metinde geçerse "yüksek" uyarı verir); **tercih edilen ifadeler**; **bilgi kartları** (ürün, fiyat, adres ve iletişim, çalışma saatleri, kampanya, sık sorulan, marka hikâyesi; yapay zekâ bunları doğru kabul eder, olmayanı uydurmaz); yapay zekâya giden hafıza metninin tamamını gösterme; asistanda "bunu hatırla" (remember) ve "şu kelimeyi kullanma" (forbid_words) işlemleri.
- ✅ **P.2 Şablon kütüphanesi (markalar arası):** bir kez tasarlanan şablon (Post stüdyosu) bütün markalarda kullanılabilsin; uygulandığı markanın renkleri, yazı tipleri, logosu ve maskotu otomatik yerleşsin.
  - Şu an şablonlar marka başına (4.4); başka markaya taşınamıyor.
  - ✅ Yapıldı: Post stüdyosu düzenleyicisinde Dosya/Paylaş → "Ortak şablon kütüphanesine kaydet"; kaydederken katman rolleri kaynak markanın kimliğinden kendiliğinden çıkarılır (ana/ikincil renk, zemin, başlık/gövde rengi, başlık/gövde fontu, logo, maskot, sticker, görsel). Her markanın Post stüdyosunda "Ortak şablon kütüphanesi" bölümü önizlemeleri o markanın renk, font, logo ve maskotuyla gösterir; "Bu markada kullan" yeni tasarım açar; düzenleyicinin Şablonlar panelinde ortak şablonlar da listelenir. Başka markanın dosyası taşınmaz: hedef markada karşılığı olmayan görsel "Görsel alanı" olur; rolsüz beyaz/koyu yazılar altındaki yeni renge göre okunur kalır.

## Toplu test (bekleyen)

Geliştirme hızlansın diye Aşama 4.3'ten itibaren yeni özelliklere ayrı test yazılmıyor; mevcut testler her değişiklikte çalışmaya devam ediyor. Aşağıdakiler toplu olarak yazılacak:

- ⬜ **T.1 Asistan işlemleri:** update_idea, add_reels_ideas, create_reels, create_post (fromReelsId dahil), create_prompt, plan_content, add_task; en çok 3 ağır üretim sınırı; başarısız işlemin sonuçta hata olarak görünmesi; başka markanın fikrine/senaryosuna erişilememesi.
- ⬜ **T.2 Asistan arayüzü:** işlem kartları ve bağlantılar, başarısız işlem görünümü.
- ⬜ **T.3 Post stüdyosu türleri:** story/kapak/reklam/grafik yerleşimleri ve varsayılan boyutları, zemin görseli doğrulaması (başka markanın görseli reddedilir), saydamlık ve daire katmanı, şablon kaydetme/şablondan başlatma/silme, takvimde doğru içerik türü.
- ⬜ **T.4 Görsel üretimi:** Gemini/Imagen/OpenAI/OpenRouter istek biçimleri (sahte fetch ile), maskot referansının yalnızca destekleyen modele gitmesi, anahtar yokken 409, kütüphaneye kayıt ve üretim geçmişi, harcama kaydı, asistanın create_image işlemi.
- ⬜ **T.5 Tasarım referansı:** görselin modele gitmesi (Claude/OpenAI/Gemini istek biçimleri), oran → piksel dönüşümü, font eşleme, görsel alanına marka dosyası/işaretli alan, şablon kaydı ve şablondan tasarım.
- ⬜ **T.6 Varlık paketleri:** ZIP paketi içe aktarma (klasör → etiket, görsel olmayan ve __MACOSX atlanır, 200 dosya sınırı), çoklu yükleme paket adıyla, paket listesi ve silme (dosyalar diskten de silinir), etiket temizleme, başka markanın paketine erişilememesi.
- ⬜ **T.7 Paylaşım sonuçları:** sayı doğrulama, etkileşim oranı, sayılar değişmeyince giriş zamanının korunması, performans özeti (tür/tema/en çok-en az), marka hafızasında en çok/en az tutanlar, başka markanın verisinin görünmemesi.
- ⬜ **T.8 İçerik kartı:** türe göre varsayılan yapılacaklar, liste doğrulaması (15 adım, boş adım atlanır), hashtag temizleme, takvime eklerken açıklamanın geçmesi, AI yazımında bağlı senaryo/tasarım metninin isteme girmesi.
- ⬜ **T.9 Özel günler:** sabit/hesaplanan günler (Anneler Günü mayısın 2. pazarı, Black Friday kasımın son cuması), bayram tablosu ve tablo dışı yıl, aralık filtresi ve dönemler, uç nokta doğrulaması, asistan istemine yaklaşan günlerin girmesi.
- ⬜ **T.10 Kimlik taslağı:** kısa metin reddi, alan uzunluk sınırları, geçersiz HEX/font'un atılması, boş alanların boş kalması, harcamanın markaya yazılması, arayüzde yalnızca boş alanları doldurma.
- ⬜ **T.11 Hatırlatmalar:** özet hesaplaması (bugün/geçmiş/görev/özel gün; yerel saat), şeridin günde bir kez çıkması ve kapanınca gelmemesi, zil rozeti, bildirimin bir içerik için bir kez gönderilmesi.
- ⬜ **T.12 Marka hafızası:** liste temizleme ve sınırlar, bilgi kartı CRUD ve marka izolasyonu, hafıza metnine girmesi, denetçinin yasaklı kelimeyi yakalaması, asistanın remember/forbid_words işlemleri.
- ⬜ **T.13 Ortak şablonlar:** rol çıkarma (renk/font/görsel), hedef markaya çevirme ve yedek renkler, dosyaların taşınmaması, okunurluk düzeltmesi, kullan/sil uç noktaları.
- ⬜ **T.14 Kalıp arşivi:** analiz çıktısının temizlenmesi, kaynak türü doğrulaması, favori/düzenleme/silme, senaryo istemine seçilen kalıbın ya da favorilerin girmesi, marka izolasyonu.
- ⬜ **T.15 Satır satır ve rakipler:** çekim senaryosu metni (zamanlar), rakip CRUD ve doğrulama (hesap/bağlantı), örneksiz analiz reddi, analiz çıktısının temizlenmesi, boşlukların hafızaya girmesi, marka izolasyonu.
- ⬜ **T.16 Beyin fırtınası, geliştir, @ referanslar:** konsept/varyasyon sınırları ve temizleme, geliştir çıktısı, anma çözümleme (Türkçe harf sadeleştirme), rol talimatları, en çok 3 referans, referans almayan modelde ve olmayan etikette hata.
- ⬜ **T.17 Alan düzenleme ve üretim geçmişi:** işaretli görsel doğrulaması, referans almayan modelde hata, iki görselin modele gitmesi ve oran yapılandırmasının gönderilmemesi, geçmişte kayıt, varyasyon ve karşılaştırma arayüzü.
- ⬜ **T.18 Izgara önizlemesi:** sıralama (en yeni sol üstte), taslak kutusu ve tercihin hatırlanması, Reels hücresi (senaryoya gider), boş durum, başka markanın içeriğinin görünmemesi.
- ⬜ **T.19 Komut paleti:** Ctrl+K ile açılma/Esc ile kapanma, Türkçe karaktersiz arama, Enter ile markaya geçiş, paletten not/görev/içerik kaydı (açık markaya bağlı), form açıkken açılmaması.
- ⬜ (Sonraki maddeler geldikçe buraya eklenir.)

## Aşama 5 — Genişleme: gönderilen projelerden ilhamlar (sırayla)

- ✅ **5.1 Kalıp arşivi** *(Nailing AI)*: Reels → "Kalıp arşivi" sekmesi; beğenilen, rakip ya da kendi Reels metni yapıştırılır, model seçilir; giriş tipi ve kalıbı, tema, 3–6 adımlık akış, kapanış/CTA, neden işe yaradığı ve uyarlama önerisi çıkarılıp markanın arşivine kaydedilir (metin ve espri kopyalanmaz). Favori kalıplar her senaryo yazımında örnek olarak isteme girer; "Bu kalıpla senaryo yaz" ya da senaryo penceresindeki "Kalıp" seçimiyle belirli bir kalıp izlenir.
- ✅ **5.2 Satır satır senaryo + görsel ipucu** *(Nailing AI)*: Reels senaryo ekranında "Sahneler / Satır satır" görünümü: her konuşma satırı (zamanıyla) ve altında o an ekranda olan görsel, kamera ve ses; bitiş kareleri. Dışa aktar → "Satır satır çekim senaryosu (.txt)".
- ✅ **5.3 Rakip profilleri** *(Nailing AI)*: marka menüsünde "Rakipler"; her rakip için ad, hesap, bağlantı, notlar ve örnek gönderiler; AI analizi (özet, içerik sütunları, ton, formatlar, kalıplar, güçlü/zayıf yanlar, boşluklar, bizim için fikirler); fikirler tek tıkla fikir havuzuna; boşluklar marka hafızasına girer (bütün üretimler bunlardan yararlanır).
- ✅ **5.4 Geliştir + Geri al ve Beyin fırtınası** *(Banana Studio)*: Prompt Studio'da "Beyin fırtınası": tek istekten 2–5 konsept × 1–3 varyasyon; beğenilen varyasyon tek tıkla kaydedilir ya da kopyalanır. Görsel üretim kutusunda "✨ Geliştir": kısa taslak ayrıntılı görsel prompt'una çevrilir, "Geri al" ile önceki metne dönülür (Prompt Studio'daki geliştirmeler zaten sürüm geçmişiyle geri alınabiliyor).
- ✅ **5.5 Rollü referanslar ve @ ile anma** *(Banana Studio)*: kütüphanede her görsele referans rolü (kimlik / nesne / stil) ve @etiket; görsel tarifinde `@etiket` yazılınca o görsel rolüne uygun talimatla modele referans olarak gider (en çok 3; referans almayan model seçiliyse açık uyarı, olmayan etiket reddedilir). Görsel üretim kutusunda anılabilecek görseller tıklanabilir çip olarak listelenir.
- ✅ **5.6 Alan düzenleme** *(Banana Studio)*: görsel üretim galerisinde "Alanı düzenle": fareyle bir ya da birkaç dikdörtgen alan seçilir (katmanlı seçim), "bu alanda ne olsun" yazılır; asıl görsel ve alanları işaretli kopya referans alan modele (Nano Banana) gider, yalnızca işaretli alan değişir, kaynak oran korunur; sonuç yeni AI görseli olarak kaydedilir (asıl görsel silinmez).
- ✅ **5.7 Üretim detayları, karşılaştırma ve varyasyon** *(Banana Studio)*: her görselde "Ayrıntı" (tarif, model, oran, referans, tutar, tarih; tarifi kutuya alma), "Varyasyon" (aynı model ve oranla yeni deneme), seçilenleri "Yan yana karşılaştır". Kütüphane → AI görseli sekmesi markanın bütün üretim geçmişini gösterir.
- ✅ **5.8 Instagram ızgara önizlemesi** *(Banana Studio)*: Post stüdyosu → Izgara önizlemesi. Takvimdeki tasarımlar ve Reels, en yenisi sol üstte, 3 sütun 4:5 hücrelerle profil başlığının altında gösterilir; 9:16 tasarımlar ortadan kırpılır, kapak tasarımı olmayan Reels ekran başlığıyla marka renginde çizilir. İstenirse takvimde olmayan tasarımlar "taslak" olarak en üste eklenir; hücreye tıklayınca tasarım/senaryo açılır.
- ✅ **5.9 Komut paleti (Ctrl+K)** *(ClipBoardLine)*: her yerden Ctrl+K / ⌘K ya da üst çubuktaki "Ara / komut" ile açılır. Eylemler (içerik planla, görev ekle, not al, yeni marka; açık markaya bağlı), açık markanın sayfaları, Yönetim Merkezi sayfaları ve "markaya geç". Türkçe karakterden bağımsız arama, ok tuşları + Enter.
- ⬜ **5.10 İlham rafı (Ctrl+V)** *(ClipBoardLine)*: kopyalanan ekran görüntüsü/link/metin aktif markanın kütüphanesine düşer.
- ⬜ **5.11 Görselde yazı arama (OCR) ve etiketler** *(ClipBoardLine)*.
- ⬜ **5.12 Çöp kutusu ve geri al** *(ClipBoardLine)*: silinenler 30 gün geri alınabilir.
- ⬜ **5.13 Dışa aktarma merkezi** *(Nashi)*: 1:1 / 4:5 / 9:16 kırpma, sıkıştırma, format dönüştürme, metadata temizleme.
- ⬜ **5.14 Video kesme ve altyazı gömme** *(Nashi)*: Flow kliplerini kesme/birleştirme, `.srt`'yi videoya basma (ffmpeg doğrulamalı kurulum).
- ⬜ **5.15 QR kod** *(Nashi)*: kampanya postlarına QR ekleme.
- ⬜ **5.16 Kampanya kanvası** *(Nailing AI)*: fikir, senaryo, görsel ve notların bağlı durduğu pano.
- ⬜ **5.17 Genel arama:** bütün markalarda fikir, not, görev ve içerik arama (komut paletiyle birlikte).
- ⬜ **5.18 Aylık rapor:** marka başına "bu ay ne ürettik, ne tuttu" raporu, PDF olarak.
- ⬜ **5.19 Ortak şablonlar (tarifler):** beğenilen prompt ve senaryo kalıplarını kaydedip başka markalarda kullanma.
- ⬜ **5.20 Koyu tema.**

## Aşama 6 — İleride

- ⬜ **6.1 Telefondan erişim:** uygulamanın internetteki bir sunucuya taşınması ve giriş şifresi.
- ⬜ **6.2 Doğrudan yayınlama:** içeriklerin uygulamadan Instagram'a gönderilmesi (Meta onay süreci gerektirir).
- ⬜ **6.3 Arayüz dili (TR / EN):** bütün arayüz metinlerinin dil dosyalarına taşınması, Ayarlar'dan dil seçimi; AI üretimleri markanın içerik dilinde kalır.

---

## Tamamlananlar (önceki çalışmalar)

- ✅ Kaynak proje analizi, bağımsız sunucu, veritabanı, güvenlik
- ✅ Marka dijital kimliği, varlık kütüphanesi, AI asistanı (fikir kaydetme)
- ✅ Örnek marka, çift tıkla açılan başlatıcı, kendini güncelleyen uygulama
- ✅ Yönetim merkezi mimarisi: genel bakış, takvim, görevler, notlar, analizler, marka çalışma alanları, iki tema katmanı
