# Yapılacaklar: genel liste (25 Kasım 2026)

Kurallar ve çalışma yöntemi: [PROJE_TALIMATI.md](PROJE_TALIMATI.md). Kaynak: kullanıcının yol haritası ve genel listesi,
ChatGPT analiz sohbeti, koddan yapılan durum taraması (ana dal `c9cafd5`).

Durum: ✅ var · 🟡 kısmen · ⬜ yok · 🔒 onay bekliyor

## 00 · Proje bağlamı

- ✅ Proje talimatı ve değişmez kurallar: [PROJE_TALIMATI.md](PROJE_TALIMATI.md)
- ✅ Bu liste

## 01 · Mevcut sistem analizi ve teknik borç

Ayrıntılı rapor: [analiz/ASAMA_01.md](analiz/ASAMA_01.md)

- 🟡 "3 başarısız test, 99 atlanan arayüz testi": ChatGPT'nin kum havuzunda (Playwright yok, yavaş ortam). Bu ortamda ve
  GitHub CI'de (Linux + Windows) 320/320 geçiyor. Yavaş makinede zaman aşımına düşmemesi için testler sağlamlaştırılır.
- ⬜ Playwright kurulum adımının belgelenmesi (arayüz testleri için)
- ⬜ Büyük dosyalar (yalnız gerektiği yerde, adım adım): `public/js/views/posts.js` (2271), `server/app.js` (1018,
  bütün rotalar), `server/services/posts.js` (937), `server/services/prompts.js` (935), `server/db.js` (737, 49 göç)
- ⬜ Reels ↔ Prompt Studio: eski Reels bölümü salt okunur arşive alınacak (karar verildi)
- ⬜ Uzaktan erişim: yanlış şifre kilidi kalıcı olsun (şu an bellekte), IP başlığı olmadan genel sınır, çerez davranışı
- ⬜ Toplu üretim kuyruğunda kontrollü paralellik (şu an sıralı)
- ⬜ Asistan isteminin küçültülmesi (her mesajda tüm hafıza + 12 mesaj + 45 gün özel gün + bütün işlem şeması)
- 🟡 Model ve fiyat kataloğunun güncelliği (Gemini için yedek modeller güncellendi; otomatik kontrol yok)
- 🔒 Bekleyen ürün kararları (bkz. en alttaki liste)

## 02 · Arayüz ve kullanıcı akışları

- ✅ Marka sayfalarındaki tekrarlar (tek Düzenle, tek "Yapay zekâ ile doldur", silme tek yerde)
- ✅ Kurulumda seçime bağlı sorular, menüde seçilmeyen kanalların gizlenmesi
- ⬜ Profil / Görsel kimlik sekmeleri ile marka dosyası kartlarının tek düzenleyicide birleşmesi (onaylandı)
- ⬜ Kurulum sihirbazı yalnız eksikleri tamamlar; kişinin vermesi gereken bilgi için bildirim; elle doldurma öncelikli (onaylandı)
- 🟡 Telefon görünümü: marka menüsü düzeltildi; kalan küçük taşmalar (Aylık rapor) sonraya (kullanıcı önceliği: bilgisayar)

## 03 · Merkezi veri ve marka hafızası

- ✅ Üç katman: sabit marka bilgisi / öğrenilmiş tercih / dönemsel bilgi (göç 50)
- ✅ Her kayıtta: kaynak, oluşturulma, güncellenme, geçerlilik başlangıç-bitiş, onay durumu, güven seviyesi
- ✅ Siteden/yapay zekâdan gelen bilgi onaysız üretime girmez (öneri → onay)
- ✅ Süresi dolan dönemsel bilgi arşive geçer (silinmez); onay bekleyenler bildirim merkezinde
- ✅ Hafıza düzenleme, onay ve arşiv ekranı; değişiklik geçmişi
- ✅ Yapay zekâya yalnız onaylı ve geçerli kartlar; çelişkide öneri olarak kalır, kullanıcı onaylar

## 04 · Yapay zekâ mimarisi ve maliyet

- ✅ İş başına model, yedek zinciri, yoğunluk hafızası, hız ayarı, aylık harcama sınırı
- ⬜ Context Builder: işe göre ilgili hafıza seçimi (ortak katman)
- ✅ Intent Router (ilk adım): asistanda bugün/yarın/bu hafta takvimi, onay bekleyenler, geciken görev ve içerikler, fikir sayısı, yaklaşan özel günler yapay zekâsız cevaplanır
- ⬜ Belli bir tutarın üstündeki ücretli işlemde açık onay

## 05 · Otonom görev yönetimi

- 🟡 Günün özeti, yayın ve görev bildirimleri, geciken içerik sayısı
- ✅ Proaktif bildirim merkezi (yapay zekâsız kurallar): haftalık plan boşluğu, onay bekleyen içerik, geciken görev,
  yaklaşan özel gün, üretim sıklığında düşüş; marka, tarih, öncelik ve önerilen işlem; tekrar engeli
- ⬜ Komutla / proaktif çalışma modları
- ⬜ Performansı düşen içerik türlerinin tespiti, gelecek hafta plan önerisi

## 06 · İçerik yönetimi, strateji ve raporlama

- 🟡 Takvim içeriği fikir, post, prompt ve Reels'e bağlı (`idea_id`, `post_id`, `prompt_id`, `reels_id`)
- ⬜ (O2 onaylandı: takvim içeriği = proje) İçerik projesi kimliği; içerik bazında model, token ve maliyet; revizyon ve sürüm geçmişi; yayın bağlantısı;
  içerik detay ekranı
- ✅ Ölçülebilir marka hedefleri (erişim, takipçi, satış, web trafiği, bilinirlik, etkileşim; göç 51). Erişim, takipçi ve etkileşim paylaşım sonuçlarından hesaplanır, diğerleri elle girilir
- ✅ İçerik sütunları (hedef pay %) ve içeriğe sütun, amaç, kitle, kanal atama (kanal boşsa türden çıkarılır)
- ✅ Takvim süzgeçleri: kanal, hedef kitle, amaç, sütun
- ✅ Performans: etkileşim oranı, giriş cümlesi, tema, gün ve saat, çok izlenip az etkileşim, türe göre kaydetme/paylaşım,
  en çok takipçi getirenler, tek tip içerik uyarısı (bildirim merkezinde)
- ✅ Aylık rapor: hedef gerçekleşmesi, sütun dağılımı, kurallarla gelecek ay önerisi (yapay zekâsız); bildirim merkezinde sütun dengesi ve ay hedefi geride uyarıları
- ⬜ Operasyon maliyeti: üretim/tasarım süresi, revizyon sayısı, marka başına toplam, gerçek ve tahmini ayrımı

## 07 · Uygulama ve test

- ✅ Her değişiklik test + PR + CI (Linux, Windows) ile
- ⬜ Aşama sonu değişiklik raporu ve geri alma notu

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

- Hazır görsel şablonları: Prompt Studio'da mı kalsın, Post stüdyosuna mı taşınsın?
- Yapay zekâ platformu: [AI_PLATFORM_KARARI.md](AI_PLATFORM_KARARI.md) önerisi
- Lisans: uygulama ticari ve kapalı kaynak (AGPL ve görünür atıf şartlı kod alınmaz)
