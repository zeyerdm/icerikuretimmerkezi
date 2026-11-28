# Gelecek modüller: uygulama planları (28 Kasım 2026)

Kurallar: [../PROJE_TALIMATI.md](../PROJE_TALIMATI.md). Her modül **ayrı onayla**, kendi aşamalarıyla yapılır. Şema
değişiklikleri yalnız ekleme yapar (göç); ücretli yapay zekâ işi açık onay ister (işlem başına sınır); yapay zekâ
yalnız gerçekten yorum gereken yerde kullanılır, gerisi kurallarla ve kayıtlarla yapılır. Her plan aynı başlıkları
taşır: amaç · bugün elimizde olan · aşamalar · veri · yapay zekâ ve maliyet · ekranlar · riskler · senin kararın.

Önerilen sıra (değer / emek): **5 → 1 → 3 → 6 → 4 → 2**. Arşiv ve stratejist eldeki veriyi kullanır, hızlı değer verir;
video editörü ve müşteri portalı en büyük işler.

---

## 1. Akıllı içerik stratejisti

**Amaç:** "Bu ay ne paylaşmalıyım?" sorusuna markanın hedeflerine, sütunlarına, performansına ve özel günlere göre
gerekçeli bir aylık plan önermek; onaylanınca takvime yazmak.

**Bugün elimizde olan:** ölçülebilir hedefler ve içerik sütunları (O3), performans analizi (türe/güne/saate göre
etkileşim, en çok tutan girişler), özel günler takvimi, fikir havuzu, haftalık plan önerisi ve tür düşüşü uyarıları
(kurallarla), aylık plan sihirbazı (`planWizard`).

**Aşamalar**
1. *Kural motoru (yapay zekâsız):* ayın iskeleti. Hedef içerik sayısı, sütun paylarına göre dağılım, en iyi gün/saat
   yuvaları, özel günlere sabitlenmiş yuvalar, tür karışımı (en çok tutan türler ağırlıklı). Çıktı: "12 yuva:
   3 Eğitici Reels Salı 19:00…".
2. *Fikir eşleme:* her yuvaya fikir havuzundan uygun fikir (sütun, tür, kullanılmamış); boş kalan yuvalar işaretlenir.
3. *Yapay zekâ yalnız boş yuvalara:* eksik yuvalar için tek istekte fikir (Context Builder `tam` profili). Onaylı.
4. *Gerekçe ve onay:* her yuva için "neden" (ör. "Eğitici sütun hedefin %20 altında", "Salı 19:00 en yüksek
   etkileşim"). Yuva yuva onayla / değiştir / sil → onaylananlar takvime taslak olarak yazılır.
5. *Ay sonu döngüsü:* aylık rapordaki gerçekleşme bir sonraki ayın planına girdi olur.

**Veri:** yeni tablo `strategy_plans` (marka, ay, yuvalar JSON, durum) · içerik → `plan_slot` bağı (isteğe bağlı).
**Yapay zekâ ve maliyet:** yalnız 3. aşamada, ayda bir istek civarı (ücretsiz Gemini yeter).
**Ekran:** Takvim → "Ayı planla" düğmesi: yuva listesi, gerekçeler, tek tıkla onay.
**Riskler:** az veriyle (yeni marka) kurallar zayıf kalır → varsayılan dağılım + açık uyarı.
**Senin kararın:** plan takvime "taslak" olarak mı yazılsın, yoksa ayrı bir "önerilen plan" alanında mı dursun?

---

## 2. Müşteri portalı

**Amaç:** ajansın müşterisi (marka sahibi) kendi markasının içeriklerini görür, yorum yapar, onaylar/düzeltme ister;
başka markayı göremez.

**Bugün elimizde olan:** içerik onay akışı (gönder → yorum → onayla / düzeltme iste) ve geçmişi, şifreli uzaktan
erişim altyapısı (şu an kapalı), Cloudflare tüneli, oturum ve kilit mekanizması.

**Aşamalar**
1. *Kullanıcı ve rol modeli:* `portal_users` (ad, e-posta, şifre özeti, marka listesi, rol: görüntüleyen / onaylayan).
   Uygulama sahibi tam yetkili kalır.
2. *Ayrı ve dar arayüz:* `/portal` yalnız şu sayfaları sunar: markanın takvimi (salt okunur), onay bekleyenler,
   içerik önizlemesi, yorum ve onay. Yönetim, ayarlar, yapay zekâ, anahtarlar yok. Sunucu her istekte marka yetkisini
   denetler (bugünkü `ownerId` süzgecine ek olarak `brand_id IN yetkili markalar`).
3. *Erişim:* tünel (Cloudflare) yeniden açılır ama yalnız `/portal` yolları dışarıya açık; yönetim yalnız bu
   bilgisayardan. Davet bağlantısı + ilk girişte şifre belirleme.
4. *Bildirim:* onay bekleyen içerik için müşteriye e-posta (isteğe bağlı; SMTP ayarı gerekir).
5. *Denetim kaydı:* kim neyi ne zaman onayladı (`content_reviews` içine `actor`).

**Veri:** `portal_users`, `portal_sessions`, `content_reviews.actor` (göç).
**Yapay zekâ:** yok.
**Ekran:** Ayarlar → Müşteri erişimi (davet, yetki); müşteri için sade portal sayfası.
**Riskler:** güvenlik en kritik konu: rol denetimi testlerle kapsanmalı (her uç için "başka marka 404" testi),
kaba kuvvet kilidi, oturum süresi. Bilgisayar kapalıyken portal da kapalı (yerel uygulama).
**Senin kararın:** telefondan erişimi bunun için yeniden açalım mı? Müşteriler e-postayla mı davet edilsin?

---

## 3. Rakip ve sektör takibi (otomatik)

**Amaç:** rakiplerin ve sektörün paylaşımlarını düzenli izleyip "ne değişti, neyi fırsat yapabiliriz" özetini vermek.

**Bugün elimizde olan:** Rakipler modülü (elle girilen rakip, yapay zekâ analizi, boşluklar marka hafızasına giriyor),
web sitesi okuyucu (`siteReader`, güvenli getirme), zamanlanmış görev altyapısı (günlük yedek döngüsü örneği).

**Aşamalar**
1. *Kaynak tanımı:* rakip başına izlenecek adresler: web sitesi, blog/RSS, haber araması anahtar kelimeleri.
   Instagram/TikTok gibi kapalı platformlar resmî API olmadan güvenilir ve kurallara uygun okunamaz → ilk sürümde
   yok; kullanıcı ekran görüntüsü/bağlantı ekleyebilir.
2. *Değişiklik yakalama (yapay zekâsız):* haftalık okuma; sayfa özeti (başlıklar, fiyatlar, kampanya kelimeleri)
   önceki okumayla karşılaştırılır; yalnız değişen kısım kaydedilir.
3. *Özet (yapay zekâ, onaylı):* yalnız değişiklik varsa tek istekle "ne değişti, bize fırsatı ne" özeti.
4. *Bildirim merkezi:* "Rakip X yeni kampanya başlattı" uyarısı (insights'a yeni kural).
5. *Sektör nabzı:* anahtar kelime başına haftalık haber başlıkları (RSS/arama); özel günlerle birleşik görünüm.

**Veri:** `competitor_sources` (adres, tür, sıklık), `competitor_snapshots` (tarih, özet, fark) (göç).
**Yapay zekâ ve maliyet:** yalnız değişiklik olan haftada rakip başına 1 kısa istek.
**Riskler:** sitelerin otomatik okumayı engellemesi, kullanım koşulları; ağ politikası. Okuma sıklığı düşük tutulur,
`robots.txt` dikkate alınır.
**Senin kararın:** sosyal medya için resmî API (Meta Graph) bağlamak ister misin? (İşletme hesabı ve izin gerekir.)

---

## 4. Yapay zekâ video editörü (zaman çizelgeli)

**Amaç:** Reels'i senaryodan bitmiş videoya, zaman çizelgesi üzerinde düzenleyerek getirmek: sahneler, altyazı,
seslendirme, müzik, metin katmanları; tarayıcıda önizleme ve dışa aktarma.

**Bugün elimizde olan:** Prompt Studio Reels planı (sahneler, süreler), SRT altyazı, seslendirme (Gemini TTS),
sahne başına video üretimi (Veo, ücretli), telepromter, ilk kare prompt'u.

**Aşamalar**
1. *Zaman çizelgesi modeli:* `video_projects` (izler: video, ses, altyazı, metin; klipler: kaynak, başlangıç, süre,
   kırpma, geçiş). Senaryodan otomatik ilk taslak (sahne = klip, SRT = altyazı izi, seslendirme = ses izi).
2. *Düzenleyici arayüzü:* sürükle-bırak klipler, kırpma, sıra, altyazı metni ve zamanı, metin katmanı; tarayıcıda
   önizleme (HTML5 video + canvas). Kütüphaneden kendi çekimlerini ekleme.
3. *Dışa aktarma:* bilgisayarda **ffmpeg** ile birleştirme (yerel, ücretsiz): 9:16 MP4, yakılmış altyazı seçeneği.
   ffmpeg kurulu değilse kurulum yönergesi; lisansı (LGPL derlemesi) kontrol edilir.
4. *Yapay zekâ yardımları (onaylı):* sahne için video üretimi (mevcut), altyazı zamanlamasını sese göre hizalama,
   "sessiz boşlukları kes" gibi kurallı araçlar önce.
5. *Şablonlar:* marka girişi/kapanışı, altyazı stili (marka fontu ve renkleri).

**Veri:** `video_projects`, dosyalar kütüphanede (göç).
**Yapay zekâ ve maliyet:** video üretimi pahalı ($1+ / sahne) → işlem başına onay zaten var; düzenleme kısmı ücretsiz.
**Riskler:** en büyük modül (tahmini 4–6 aşama); tarayıcıda önizleme performansı; ffmpeg bağımlılığı ve Windows
kurulumu. Otomatik altyazı (konuşmadan) şu an kapsam dışı (kararın).
**Senin kararın:** ffmpeg'i uygulamayla birlikte kurmak uygun mu? Kendi çektiğin videolar da kullanılacak mı?

---

## 5. Akıllı içerik arşivi (doğal dille arama, benzer içerik)

**Amaç:** "geçen yaz yaptığımız kahve kampanyası postu", "buna benzer içerikler" gibi aramalar; tekrar üretimden
kaçınma; eski başarılı içeriği yeniden kullanma.

**Bugün elimizde olan:** arşiv ve arama (`search`), içerik/fikir/post/prompt kayıtları, performans sonuçları,
uyarlama (aynı içeriği başka kanala).

**Aşamalar**
1. *Kurallı akıllı arama (yapay zekâsız):* Türkçe kök ve eş anlam sözlüğü (kahve→espresso, latte), tarih ifadeleri
   ("geçen yaz", "ekimde"), tür ve marka süzgeçleri; SQLite FTS5 tam metin dizini. Çoğu arama burada çözülür.
2. *Benzerlik (yapay zekâsız):* kelime ağırlığı (TF-IDF) ile "buna benzer içerikler"; yeni fikir yazılırken "bu daha
   önce yapıldı" uyarısı.
3. *Anlam araması (isteğe bağlı):* gömme vektörleri (Gemini embedding, ücretsiz kotada) kayıt eklendikçe bir kez
   hesaplanır ve saklanır; arama sorgusu başına küçük bir çağrı. Kapatılabilir.
4. *Sonuç ekranı:* önizleme, performans rozeti, "yeniden kullan / uyarla / takvime ekle".

**Veri:** FTS5 sanal tablosu, `content_vectors` (isteğe bağlı) (göç).
**Yapay zekâ ve maliyet:** 1–2. aşamalar sıfır; 3. aşama çok düşük ve isteğe bağlı.
**Riskler:** Türkçe ekler (FTS5 kök bulmaz) → basit Türkçe kök kuralları eklenir.
**Senin kararın:** anlam araması (3. aşama) olsun mu, yoksa kurallı arama yeterli mi?

---

## 6. Görsel otomasyon oluşturucu

**Amaç:** "Her yeni ürün için 3 boyutta (post, story, afiş) görsel üret", "her pazartesi haftanın menüsü postu" gibi
tekrarlayan görsel işleri tek kez tanımlayıp otomatik çalıştırmak.

**Bugün elimizde olan:** Post stüdyosu şablonları (yeni adım adım tasarım akışı ve türe ayrılmış şablonlar),
bilgilerden yapay zekâsız tasarım, toplu üretim kuyruğu, görsel üretimi, Drive'a gönderme, takvim.

**Aşamalar**
1. *Tarif (otomasyon) tanımı:* tetikleyici (elle / zamanlı / yeni fikir / yeni ürün kartı) + girdi (fikir, bilgi kartı,
   tablo satırı) + adımlar (şablon seç → bilgileri doldur → boyutlara çoğalt → kaydet / Drive'a gönder / takvime ekle).
2. *Çalıştırıcı:* mevcut kuyruk üzerinde; her adım kayıtlı, hata alan adım yeniden denenir; çıktılar onaya düşer
   (otomatik yayın yok, kural 5).
3. *Çoklu boyut:* aynı bilgi tek tasarımdan post 4:5, story 9:16, afiş A4'e (türe ayrılmış şablonlar sayesinde).
4. *Toplu girdi:* CSV/Excel'den satır başına tasarım (ör. menü, fiyat listesi, etkinlik takvimi).
5. *Yapay zekâ isteğe bağlı adım:* "metni yaz" ya da "görsel üret" adımı; maliyet tahmini otomasyon kaydedilirken
   gösterilir ve onaylanır.

**Veri:** `automations` (tetikleyici, adımlar JSON, durum), `automation_runs` (göç).
**Yapay zekâ ve maliyet:** varsayılan sıfır (şablon + bilgi); yapay zekâ adımı varsa çalıştırma başına tahmin.
**Riskler:** zamanlı çalıştırma için uygulamanın açık olması gerekir (yerel uygulama).
**Senin kararın:** çıktılar her zaman onaya mı düşsün, yoksa "takvime taslak" yeterli mi?

---

## Ortak notlar
- Her modülün ilk aşaması yapay zekâsız ve kayıtlara dayalı; yapay zekâ yalnız yorum gereken yerde ve onaylı.
- Her aşama kendi PR'ı, testleri (Linux + Windows CI) ve geri alma notuyla gelir.
- Şema değişiklikleri onay paketiyle sunulur (bu belge plan; uygulamaya geçmeden her modül için onay alınır).
