# Yol Haritası

**Nasıl ilerler?** "Sıradaki adım" dendiğinde ilk tamamlanmamış madde yapılır, test edilir, `main`'e alınır ve burada ✅ ile işaretlenir. Uygulama `Baslat` ile açıldığında güncellemeyi kendisi alır.

Durum: ⬜ sırada · 🔄 yapılıyor · ✅ tamamlandı

---

## Aşama 0 — Güvenlik ve güvenilirlik

Hedef: veriler tek bilgisayarda durduğu ve uygulama kendini güncellediği için veri kaybını ve bozuk sürüm riskini baştan kapatmak.

- ✅ **0.1 Yedekleme ve geri yükleme:** her gün kendiliğinden yedek (son 14 gün saklanır); Ayarlar → Yedekler'de "Şimdi yedek al", indir, "Geri yükle", "Yedek dosyasından geri yükle"; geri yüklemeden önce mevcut hâlin yedeği; API anahtarları yedeğe girmez; istenirse her yedeğin bir kopyası Google Drive masaüstü klasörüne.
- ✅ **0.2 Güncellemeyi geri alma:** güncellemeden önce verilerin yedeği alınır; yeni sürüm açılamazsa başlatıcı kendiliğinden önceki sürüme döner ve o sürümü bir daha kurmaz; Ayarlar'da "Önceki sürüme dön" ve gerekirse "Yine de güncelle".
- ✅ **0.3 GitHub'da otomatik test:** her değişiklik GitHub'da Linux (arayüz testleri dahil) ve Windows'ta testlerden geçer; geçmeyen değişiklik `main`'e alınmaz.

## Aşama 1 — Arayüz ve kullanım düzeni (UX/UI)

Hedef: bütün sayfalarda aynı ölçü, hizalama ve düğme dili; karmaşa yerine sade, hizalı, öngörülebilir ekranlar.

- ⬜ **1.1 Tasarım kuralları:** tek boşluk ölçeği (4-8-12-16-24-32), tek köşe yuvarlaklığı seti, yazı boyutu ölçeği, tek ikon boyutu; bunlar CSS değişkenlerine bağlanır, sayfalardaki rastgele değerler temizlenir.
- ⬜ **1.2 Düğme sistemi:** tek tip birincil / ikincil / sessiz / tehlikeli düğme; iki boy (normal, küçük); her alanda tek birincil düğme; üzerine gelme, odak, devre dışı ve "yükleniyor" durumları; ikonlu ve ikonsuz düğmelerin hizası.
- ⬜ **1.3 Hizalama ve ızgara:** bütün sayfalar aynı içerik genişliği ve kenar boşluğu; aynı satırdaki kartların eşit yükseklikte olması, başlıklarının ve alt çizgilerinin aynı hizadan başlayıp bitmesi; sayfa başlığı + açıklama + işlem düğmesi düzeni her sayfada aynı.
- ⬜ **1.4 Formlar ve pencereler:** etiket, alan, yardım metni ve hata mesajı düzeni tek tip; hızlı ekleme satırları (görev, not, fikir) aynı yapıda; pencerelerin üst/alt alanları ve düğme sırası sabit.
- ⬜ **1.5 Kenar çubuğu ve üst çubuk:** yönetim merkezi ve marka alanı menülerinin aynı ritimde olması, "Yakında" öğelerinin sade görünmesi, konum çubuğu ve marka değiştiricinin hizası.
- ⬜ **1.6 Sayfa sayfa düzeltme:** Yönetim Merkezi, Markalar, Takvim, Görevler, Notlar, Analizler, Ayarlar, marka ana sayfası, dijital kimlik, fikirler, kütüphane, arşiv. Her sayfa için önce/sonra ekran görüntüsü.
- ⬜ **1.7 Boş, yükleniyor ve hata durumları:** her listede tutarlı boş durum, iskelet yükleme ve anlaşılır hata kutusu.
- ⬜ **1.8 Dar ekran ve erişilebilirlik:** telefon/tablet kırılımları, klavye ile gezinme, odak çerçeveleri, renk kontrastı kontrolü.

## Aşama 2 — Yapay zekâ seçimi

Hedef: Gemini'nin Türkçe metin yazımı beğenilmedi; her iş için en iyi modeli birlikte seçmek.

- ⬜ **2.1 Seçenekler ve maliyet tablosu:** metin (senaryo, fikir, açıklama), görsel ve video için sağlayıcı/model seçenekleri, güçlü/zayıf yanları ve yaklaşık maliyetleri; tek anahtarla birden çok modele erişim seçenekleri.
- ⬜ **2.2 Karşılaştırma ekranı:** aynı brief'i 2-3 modele aynı anda yazdırıp sonuçları yan yana gösteren deneme sayfası; kararı gerçek çıktılara bakarak sen verirsin.
- ⬜ **2.3 Çoklu sağlayıcı altyapısı:** AI servis katmanına seçilen sağlayıcıların eklenmesi; anahtarlar yalnızca sunucuda; bağlantı testi.
- ⬜ **2.4 İşe göre model ataması:** Ayarlar'da "metin yazımı", "fikir üretimi", "çeviri", "görsel" için ayrı model seçimi; bir model hata verirse yedek modele geçiş.
- ⬜ **2.5 AI harcama takibi:** hangi markada, hangi işte ne kadar harcandığı; aylık üst sınır ve sınıra yaklaşınca uyarı.

## Aşama 3 — Eski sistemin (icerikuretici) özelliklerini geliştirilmiş hâlleriyle taşıma

Hedef: eski sistemde çalışan her şey yeni sistemde, istenen düzeltmelerle ve markadan bağımsız çalışsın. DevOrtak'a ait veri, karakter, görsel ve ayarlar taşınmaz.

- ⬜ **3.1 Reels fikir havuzu:** kategoriler, rastgele seçim, benzer fikir üretme (havuzu genişletme), beğen/beğenme, büyütülebilir havuz; markanın kendi fikirleriyle.
- ⬜ **3.2 Reels senaryo üretimi:** saniye saniye sahneler, sahne sürekliliği, konuşma öncelikli yazım (her sahnede konuşma, anlatılan olayın ekranda gösterilmesi), "asıl espri" ile biten kurgu, çağrı/arayüz yasağı, doğal konuşma hızına göre sahne süresi, kalite kontrolü uyarıları.
- ⬜ **3.3 Flow/Veo prompt'ları:** iki dilli (Türkçe + İngilizce) prompt, Türkçeden düzeltip İngilizceye çevirme, yazısız Veo prompt'u, sinematik stil satırı, gerçek isim temizleme.
- ⬜ **3.4 Tekrar üretme:** senaryonun tamamını veya tek sahneyi yeniden yazdırma; üretim sırasında geçen süre göstergesi ve zaman sınırı.
- ⬜ **3.5 Başlık ve altyazı:** başlık stilleri (önizlemeli), başlık PNG'si, `.srt` altyazı dosyası; başlık yalnızca ilk sahnede, altyazı kurguda.
- ⬜ **3.6 Carousel/post üretimi ve editörü:** konudan slayt üretimi, slayt düzenleme, sürükle-bırak, maskot pozları, marka renk/font uygulaması, PNG dışa aktarma (Post stüdyosunun ilk sürümü).
- ⬜ **3.7 AI içerik denetçisi:** üretilen metinlerin marka diline, uzunluğa ve kurallara uygunluk kontrolü.
- ⬜ **3.8 Senaryo dışa aktarma:** senaryo metni, telepromter görünümü, sahne listesi; arşive ve takvime bağlanma.

## Aşama 4 — Geliştirme ve yenileme

Hedef: taşınan modülleri ilk talimattaki tam hedefe taşımak.

- ⬜ **4.1 Prompt Studio:** görsel, video, Reels, metin, reklam, ürün fotoğrafı, maskot animasyonu ve post tasarımı için prompt oluşturma; düzenleme, kopyalama, kaydetme.
- ⬜ **4.2 Prompt geliştirme mekanizması:** girişi değiştir, senaryoyu geliştir, daha yaratıcı/profesyonel yap, görsel detay ekle, kamera açısını değiştir, karakter hareketi ekle, kısalt, alternatif üret, seçili bölümü yeniden yaz; **sürüm geçmişi ve önceki sürüme dönme**.
- ⬜ **4.3 Asistanın modüllere bağlanması:** "bu fikri daha eğlenceli yap", "bu senaryoya göre post tasarla", "haftaya 5 Reels fikri üret" gibi isteklerin ilgili modülde gerçekten işlem yapması.
- ⬜ **4.4 Post stüdyosu (tam):** post, story, carousel, Reels kapağı, reklam ve bilgi grafiği; katmanlar, yazı/renk/font, logo/maskot/sticker ekleme, arka plan, konumlandırma, şablon kaydetme.
- ⬜ **4.5 Görsel üretimi:** seçilen görsel modeliyle üretim; marka renkleri ve maskotla; servis bağlı değilse açık uyarı (sahte üretim yok).
- ⬜ **4.6 Tasarım referansı analizi:** yüklenen örnek tasarımdan renk paleti, font önerisi, yerleşim ve görsel dil çıkarıp düzenlenebilir şablona çevirme.
- ⬜ **4.7 Sticker paketleri ve varlık kütüphanesi genişletme:** paket olarak yükleme, kategoriler.
- ⬜ **4.8 Paylaşım sonucu girişi:** yayınlanan içeriğe izlenme, beğeni, kaydetme, paylaşım sayılarının girilmesi; analizlerde "ne işe yaradı"; asistanın tutan giriş cümlesi ve temalardan öğrenmesi.
- ⬜ **4.9 İçeriğin tamamı tek kartta:** her içerikte açıklama metni, hashtag'ler, ilk yorum ve yapılacaklar listesi (senaryo → çekim → kurgu → kapak → açıklama); açıklama ve hashtag'leri AI'ın yazması.
- ⬜ **4.10 Özel günler takvimi:** Türkiye'nin özel günleri ve dönemleri takvimde hazır; "bu güne içerik planla" tek tıkla.
- ⬜ **4.11 Kimliği AI ile doldurma:** web sitesi metni ya da Instagram biyografisi yapıştırılınca marka kimliği taslağının doldurulması.
- ⬜ **4.12 Hatırlatmalar:** açılışta günün özeti (yayındaki içerikler, geciken görevler); istenirse bilgisayar bildirimi.

## Aşama 5 — Genişleme: gönderilen projelerden ilhamlar (sırayla)

- ⬜ **5.1 Kalıp arşivi** *(Nailing AI)*: beğenilen/rakip Reels metinlerinden ve kendi videolarından giriş cümlesi, tema, akış ve CTA çıkarıp markanın arşivine kaydetme; senaryo yazarken bu arşivin kullanılması.
- ⬜ **5.2 Satır satır senaryo + görsel ipucu** *(Nailing AI)*: her konuşma satırının altında çekim notu.
- ⬜ **5.3 Rakip profilleri** *(Nailing AI)*: her rakip için ayrı kayıt; ne paylaşıyor, hangi kalıpları kullanıyor, nerede boşluk var.
- ⬜ **5.4 Geliştir + Geri al ve Beyin fırtınası** *(Banana Studio)*: kısa taslaktan ayrıntılı üretim prompt'u; tek brief'ten çok konsept × çok varyasyon.
- ⬜ **5.5 Rollü referanslar ve @ ile anma** *(Banana Studio)*: kütüphanedeki görsellere kimlik/nesne/stil rolü; prompt'ta `@maskot-pozu` ile kullanma.
- ⬜ **5.6 Alan düzenleme** *(Banana Studio)*: görselin seçili bölgesini değiştirme, katmanlı seçim.
- ⬜ **5.7 Üretim detayları, karşılaştırma ve varyasyon** *(Banana Studio)*: her çıktının prompt/model/referans kaydı; yan yana karşılaştırma; yeniden üret / varyasyon.
- ⬜ **5.8 Instagram ızgara önizlemesi** *(Banana Studio)*: bitmiş post ve Reels kapağının profil ızgarasında nasıl duracağını gösterme.
- ⬜ **5.9 Komut paleti (Ctrl+K)** *(ClipBoardLine)*: her yerden "içerik planla", "markaya geç", "not al".
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

---

## Tamamlananlar (önceki çalışmalar)

- ✅ Kaynak proje analizi, bağımsız sunucu, veritabanı, güvenlik
- ✅ Marka dijital kimliği, varlık kütüphanesi, AI asistanı (fikir kaydetme)
- ✅ Örnek marka, çift tıkla açılan başlatıcı, kendini güncelleyen uygulama
- ✅ Yönetim merkezi mimarisi: genel bakış, takvim, görevler, notlar, analizler, marka çalışma alanları, iki tema katmanı
