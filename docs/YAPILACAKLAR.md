# Yapılacaklar: genel liste (25 Kasım 2026)

Kurallar ve çalışma yöntemi: [PROJE_TALIMATI.md](PROJE_TALIMATI.md). Kaynak: kullanıcının yol haritası ve genel listesi,
ChatGPT analiz sohbeti, koddan yapılan durum taraması (ana dal `c9cafd5`).

Durum: ✅ var · 🟡 kısmen · ⬜ yok · 🔒 onay bekliyor

## 00 · Proje bağlamı

- ✅ Proje talimatı ve değişmez kurallar: [PROJE_TALIMATI.md](PROJE_TALIMATI.md)
- ✅ Bu liste

## 01 · Mevcut sistem analizi ve teknik borç

Ayrıntılı rapor: [analiz/ASAMA_01.md](analiz/ASAMA_01.md)

- ✅ "3 başarısız test, 99 atlanan arayüz testi": ChatGPT'nin kum havuzunda (Playwright yok, yavaş ortam). Bu ortamda ve
  GitHub CI'de (Linux + Windows) tam takım geçiyor; yük altında yarışa düşen testler sağlamlaştırıldı.
- ✅ Playwright kurulum adımının belgelenmesi (README → Geliştirme)
- ✅ (karar) Büyük dosyalar yalnız dokunulan yerde, adım adım bölünür; ayrı yeniden yazım yok: `public/js/views/posts.js` (2271), `server/app.js` (1018,
  bütün rotalar), `server/services/posts.js` (937), `server/services/prompts.js` (935), `server/db.js` (737, 49 göç)
- ✅ Reels ↔ Prompt Studio: eski Reels bölümü salt okunur arşiv. Menüde yok, liste ve fikir havuzu Prompt Studio'ya yönlenir; eski senaryo sayfasında arşiv notu, yeniden yazma yok; seslendirme, video, dışa aktarma, sürüme dönme, takvime ekleme çalışır. Veri ve API korunur (eski kayıtlar ve testler için)
- ✅ Uzaktan erişim: kalıcı ve genel yanlış şifre kilidi. **Kullanıcı kararıyla şimdilik kapalı** (uzak istek reddedilir, tünel kurulmaz, Ayarlar'da kart yok; kayıtlı ayarlar silinmez, `REMOTE_ACCESS=1` ile açılır)
- ✅ Toplu üretim kuyruğunda kontrollü paralellik (en çok 2 iş, atomik iş alma)
- ✅ Asistan isteminin küçültülmesi (bağlam seçici, hafif hafıza, kısa geçmiş; −%27/−%35)
- ✅ Model ve fiyat kataloğunun güncelliği (yedek modeller güncel; açılışta günde bir kez model listesi kontrolü)
- ✅ Şema onarımı: sürüm numarası ilerde ama göçün tablosu / sütunu eksik veritabanı açılışta onarılır ("no such table: brand_pillars")
- ✅ Ürün kararları verildi (bkz. "Verilen kararlar")

## 02 · Arayüz ve kullanıcı akışları

- ✅ Marka sayfalarındaki tekrarlar (tek Düzenle, tek "Yapay zekâ ile doldur", silme tek yerde)
- ✅ Kurulumda seçime bağlı sorular, menüde seçilmeyen kanalların gizlenmesi
- ✅ Profil / Görsel kimlik ayrı sekme değil: marka dosyası kartlarının Düzenle'si tek düzenleme sayfasını açar (profil, web sitesi, Drive, logo yükleme, renk, palet, font, canlı önizleme)
- ✅ Kurulum sihirbazı tamamlanan adımları atlar, yalnız eksikleri açar; kişinin vermesi gereken eksik bilgi bildirim merkezinde ("Eksikleri tamamla" doğrudan ilk eksik adıma); elle doldurma öncelikli, yapay zekâ isteğe bağlı
- ✅ Telefon görünümü: marka menüsü ve Aylık rapor taşması düzeltildi (iPhone 13 boyutunda sayfa taşması yok)

## 03 · Merkezi veri ve marka hafızası

- ✅ Üç katman: sabit marka bilgisi / öğrenilmiş tercih / dönemsel bilgi (göç 50)
- ✅ Her kayıtta: kaynak, oluşturulma, güncellenme, geçerlilik başlangıç-bitiş, onay durumu, güven seviyesi
- ✅ Siteden/yapay zekâdan gelen bilgi onaysız üretime girmez (öneri → onay)
- ✅ Süresi dolan dönemsel bilgi arşive geçer (silinmez); onay bekleyenler bildirim merkezinde
- ✅ Hafıza düzenleme, onay ve arşiv ekranı; değişiklik geçmişi
- ✅ Yapay zekâya yalnız onaylı ve geçerli kartlar; çelişkide öneri olarak kalır, kullanıcı onaylar

## 04 · Yapay zekâ mimarisi ve maliyet

- ✅ İş başına model, yedek zinciri, yoğunluk hafızası, hız ayarı, aylık harcama sınırı
- ✅ Context Builder: işe göre ilgili hafıza seçimi (`brands.memory(id, { task })`: tam / hafif / metin / tasarım / denetim / görsel). Açıklama ve LinkedIn'de renk-font ve fikir listesi gitmez; post tasarımında fikir listesi gitmez (maskot pozları ve renkler gider); kapak ve görsel prompt'unda fikir ve performans listeleri gitmez; fikir ve planlara içerik sütunları girer. Ölçüm (örnek marka): metin −%46, görsel −%36
- ✅ Intent Router (ilk adım): asistanda bugün/yarın/bu hafta takvimi, onay bekleyenler, geciken görev ve içerikler, fikir sayısı, yaklaşan özel günler yapay zekâsız cevaplanır
- ✅ Belli bir tutarın üstündeki ücretli işlemde açık onay (işlem başına sınır varsayılan $0,10; metin, görsel, video, toplu üretim; Yapay zekâ → Harcama)

## 05 · Otonom görev yönetimi

- ✅ Günün özeti, yayın ve görev bildirimleri, geciken içerik sayısı
- ✅ Proaktif bildirim merkezi (yapay zekâsız kurallar): haftalık plan boşluğu, onay bekleyen içerik, geciken görev,
  yaklaşan özel gün, üretim sıklığında düşüş; marka, tarih, öncelik ve önerilen işlem; tekrar engeli
- ✅ Komutla / proaktif çalışma modları (Ayarlar → Hatırlatmalar; komutla modda asistana "öneriler" yazınca yapay zekâsız liste)
- ✅ Performansı düşen içerik türlerinin tespiti, gelecek hafta plan önerisi (bildirim merkezi, yapay zekâsız)

## 06 · İçerik yönetimi, strateji ve raporlama

- ✅ Takvim içeriği fikir, post, prompt ve Reels'e bağlı (`idea_id`, `post_id`, `prompt_id`, `reels_id`)
- ✅ İçerik projesi (O2, göç 52; takvim içeriği = proje): zaman çizelgesi (fikir, prompt ve sürümleri, senaryo ve sürümleri, tasarım, düzenleme, onay, durum, tarih, yayın, performans), yayın bağlantısı, içerik bazında yapay zekâ çağrı / token / tahmini maliyet (içerik + bağlı post, prompt, senaryo), revizyon sayısı, fikirden tamamlanmaya süre; içerik penceresinde "Geçmiş"; toplu üretim kuyruğundaki işler de oluşan post / prompt'a bağlanır
  içerik detay ekranı
- ✅ Ölçülebilir marka hedefleri (erişim, takipçi, satış, web trafiği, bilinirlik, etkileşim; göç 51). Erişim, takipçi ve etkileşim paylaşım sonuçlarından hesaplanır, diğerleri elle girilir
- ✅ İçerik sütunları (hedef pay %) ve içeriğe sütun, amaç, kitle, kanal atama (kanal boşsa türden çıkarılır)
- ✅ Takvim süzgeçleri: kanal, hedef kitle, amaç, sütun
- ✅ Performans: etkileşim oranı, giriş cümlesi, tema, gün ve saat, çok izlenip az etkileşim, türe göre kaydetme/paylaşım,
  en çok takipçi getirenler, tek tip içerik uyarısı (bildirim merkezinde)
- ✅ Aylık rapor: hedef gerçekleşmesi, sütun dağılımı, kurallarla gelecek ay önerisi (yapay zekâsız); bildirim merkezinde sütun dengesi ve ay hedefi geride uyarıları
- ✅ Operasyon maliyeti: üretim süresi, revizyon sayısı, marka başına yapay zekâ tutarı (OpenRouter gerçek / diğerleri tahmini), içerik başına (Analizler). İnsan emeği saati kaydı yok

## 07 · Uygulama ve test

- ✅ Her değişiklik test + PR + CI (Linux, Windows) ile
- ✅ Aşama sonu değişiklik raporu ve geri alma notu: [analiz/ASAMA_RAPORU_2.md](analiz/ASAMA_RAPORU_2.md)

## 08 · Gelecek modüller (ayrı değerlendirilecek)

1. Akıllı içerik stratejisti
2. Müşteri portalı (uzaktan erişim ve şifreli giriş temel olabilir; rol/yetki yok)
3. Rakip ve sektör takipçisi (Rakipler modülü var; otomatik takip yok)
4. Yapay zekâ video editörü (senaryo, sahne, SRT, seslendirme parçaları var; zaman çizelgeli editör yok)
5. Akıllı içerik arşivi (arşiv, arama, uyarlama var; doğal dille arama ve benzerlik yok)
6. Görsel otomasyon oluşturucu

## Verilen kararlar (26 Kasım 2026)

- O1 üç katmanlı hafıza: evet (yapıldı) · O3 hedefler ve sütunlar: evet
- O2 içerik projesi: **A**, takvim içeriği = proje (ayrı proje tablosu yok)
- Eski Reels bölümü: **salt okunur arşiv** (yeni Reels yalnız Prompt Studio'da; veri silinmez)
- Uygulamanın uzaktan/telefon erişimi: **şimdilik kaldır** (kod geri açılabilir kalır; en son yeniden düşünülecek)
- Büyük dosyalar: yalnız dokunulan yerde, parça parça
- Konuşmadan otomatik altyazı: şimdilik gerek yok (listeden çıkarıldı)
- Profil / Görsel kimlik ile marka dosyası: tek düzenleyici · Kurulum sihirbazı yalnız eksikleri tamamlar, elle doldurma öncelikli, yapay zekâ az

## Bekleyen kararlar (kullanıcıya toplu sorulacak)

- Hazır görsel şablonları (26 Kasım cevabı: "Canva tarzı bir yapı olabilir; kullanılması gereken yerlerden erişilsin;
  bir de ana sayfa gibi bir şablon sayfası olabilir; tam emin değilim"): önce taslak öneri hazırlanacak (tek şablon
  galerisi + Post, Prompt Studio, Kampanya kanvasından kısayol), onaydan sonra yapılır
- Lisans: şimdilik karar yok; bugünkü kural geçerli (AGPL ve görünür atıf şartlı kod alınmaz)
- Ücretli işlem onay sınırı: acelesi yok (kullanıcı ücretsiz sürümleri kullanıyor); varsayılan $0,10 kaldı, ücretsiz
  kullanım etkilenmez
- Antigravity'deki yerel değişiklikler: kullanıcı GitHub'a gönderecek (`antigravity` dalı), sonra birleştirilecek

Yapay zekâ platformu kararı 18 Kasım'da verildi: [AI_PLATFORM_KARARI.md](AI_PLATFORM_KARARI.md).
