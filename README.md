<p align="center"><img src="public/img/logo.svg" width="96" alt="KREATİFHANE logosu"></p>

# KREATİFHANE

**Fikirden üretime, her şey tek merkezde.** · *Creative Management Platform (Kreatif Yönetim Platformu)*

Markadan bağımsız, AI destekli içerik üretim ve yönetim platformu. Her marka için dijital kimlik bir kez tanımlanır; içerik fikirlerinden prompt üretimine, Reels senaryosundan post tasarımına kadar bütün süreç aynı marka hafızası üzerinden yürür.

## Nasıl çalışır?

**Önce üreticinin yönetim merkezi, ardından markaların bağımsız çalışma alanları.**

Uygulama açılınca **Yönetim Merkezi** gelir. Burası bütün kullanıcılarda aynı tasarım ve sabit renklerle çalışan genel alandır:

- **Genel bakış:** marka sayısı, üretilen içerik, Reels, tamamlanan tasarımlar, bekleyen içerikler, bu haftanın üretim özeti ve grafiği, son işlemler. Hepsi gerçek kayıtlardan.
- **İçerik takvimi:** aylık ve haftalık görünüm; boş bir güne tıklayıp içerik planla (marka, tür, saat, durum). Türkiye'nin özel günleri ve dönemleri takvimde hazır; tıklayınca o güne içerik planlanır ya da fikir ürettirilir. İçerikler markanın renginde görünür; marka filtresi var.
- **Markalar:** logo, kısa açıklama, kategori, renkler, son çalışma tarihi ve içerik üretim durumu. Karta tıklayınca markanın çalışma alanı açılır.
- **Görevler:** hızlı ekleme, son tarih, öncelik, ilgili marka, durum; gecikmiş / bugün / bu hafta grupları, tamamlananlar.
- **Notlar:** hızlı not, kategori, markaya bağlama, sabitleme, arama.
- **Analizler:** haftalık ve aylık üretim, marka ve içerik türü dağılımı, tamamlanan/bekleyen, tamamlanma ve zamanında bitirme oranları.

Bir markaya girildiğinde **marka çalışma alanı** açılır ve arayüz markanın kendi renklerini, logosunu ve maskotunu alır (bu tema yalnızca o markanın alanında geçerlidir):

- **Marka ana sayfası:** markanın hafızasıyla çalışan AI asistanı (sohbetten gerçekten iş yapar: fikir kaydeder/düzenler, Reels fikri ekler, senaryo yazar, post tasarlar, prompt üretir, takvime içerik ve görev ekler), hızlı işlemler, kimlik durumu, fikir grafiği.
- **Dijital kimlik:** profil, renkler, fontlar, canlı post önizlemesi; web sitesi metni ya da Instagram biyografisi yapıştırılarak AI ile doldurma.
- **İçerik fikirleri:** kategorili fikir havuzu, favoriler, tek tıkla takvime ekleme.
- **Kütüphane:** logo, maskot pozları, sticker, görseller, AI görselleri (her marka yalnızca kendi dosyalarını görür); ZIP ya da çoklu dosyayla paket yükleme, paket filtresi ve silme, etiketler ve arama.
- **Google Drive klasörü:** her markanın kendi Drive klasörü; kütüphanedeki görseller, post PNG'leri, Reels başlıkları ve altyazıları tek tıkla o klasöre gider. Bağlantı Ayarlar → Google Drive'dan bir kez kurulur (kendi Google hesabında küçük bir Apps Script; adımlar ekranda).
- **Takvim, Arşiv, Analizler:** yalnızca bu markanın içerikleri. Yayınlanan içeriğe paylaşım sonucu (izlenme, beğeni, kaydetme, paylaşım…) girilir; Analizler'deki "Ne işe yaradı" bölümü en çok tutan içerikleri, türleri, günleri, saatleri ve giriş cümlelerini gösterir, asistan da bunlardan öğrenir.
- **Reels:** fikir havuzu (kategoriler, beğen/beğenme, rastgele seçim, AI ile genişletme) ve senaryo üretimi: saniye saniye sahneler, iki dilli Flow/Veo prompt'ları, yazısız Veo prompt'u, kalite uyarıları, sahneyi ya da tamamını yeniden yazdırma, sürüm geçmişi, başlık PNG'si (6 stil), `.srt` altyazı, telepromter, takvime ekleme ve Drive'a gönderme.
- **Post stüdyosu:** post, carousel, story, Reels kapağı, reklam ve bilgi grafiği; konudan üretim, boş tasarım ya da kayıtlı şablondan başlama. Yazı, görsel (logo, maskot, sticker), dikdörtgen/daire katmanları, saydamlık, zemin rengi ya da zemin görseli, sürükle-bırak, marka renkleri ve fontları; şablon olarak kaydetme, PNG indirme, Drive'a gönderme, takvime ekleme.
- **Tasarım referansı:** beğendiğin bir tasarımın ekran görüntüsünden renk paleti, font önerisi ve yerleşim çıkarılıp markanın düzenlenebilir şablonuna çevrilir (metinler ve başka markaların logoları kopyalanmaz).
- **İçerik denetçisi:** açıklama ve senaryo metinlerini marka diline, uzunluğa ve kurallara göre puanlar, sorunları ve düzeltilmiş metni önerir.
- **Görsel üretimi:** Gemini (Nano Banana, Imagen), OpenAI (GPT Image) ya da OpenRouter ile; marka renkleri ve maskot referansıyla. Prompt Studio'dan, Kütüphane → AI görseli sekmesinden ya da asistandan; sonuç kütüphaneye kaydedilir. Görsel anahtarı yoksa görsel üretilmez, nasıl bağlanacağı gösterilir.
- Her üretim ekranında **hangi modelle yazılacağı seçilir**; beğenmezsen başka modelle tekrar yazdırırsın.
- **Prompt Studio:** görsel, video, Reels, metin, reklam, ürün fotoğrafı, maskot animasyonu ve post tasarımı prompt'ları; marka kimliği otomatik eklenir. Geliştirme işlemleri (daha yaratıcı/profesyonel, görsel detay, kamera açısı, karakter hareketi, kısalt, alternatif), seçili bölümü yeniden yazma, girişi değiştirme; her değişiklik sürüm olarak saklanır, önceki sürüme dönülür.

**Yapay zekâ** sayfası: Claude, OpenAI, OpenRouter (tek anahtarla birçok model) ve Gemini bağlanır; aynı istek 2-3 modele yazdırılıp yan yana karşılaştırılır; her işe (fikir, metin yazımı, çeviri, içerik denetimi) ayrı model ve yedek model atanır; harcama markaya, işe ve modele göre izlenir, aylık sınır konur. Seçenekler ve maliyetler: [docs/AI_SECENEKLERI.md](docs/AI_SECENEKLERI.md)

Üstteki konum çubuğu (Yönetim Merkezi › Marka › Sayfa) ve marka değiştirici ile her an nerede olduğun belli; tek tıkla başka markaya geçer ya da yönetim merkezine dönersin.

Yapılacaklar ve sıradaki adımlar: [docs/YOL_HARITASI.md](docs/YOL_HARITASI.md) · Mimari: [docs/ANALIZ.md](docs/ANALIZ.md)

## Açmak (çift tıkla)

1. GitHub'da **Code → Download ZIP** ile indir ve ZIP'i bir klasöre çıkar. (**Bunu yalnızca bir kez yaparsın.**)
2. Klasördeki **`Baslat.bat`** dosyasına çift tıkla (Mac: `Baslat.command`, ilk seferde sağ tık → Aç).
   - Node.js yoksa kendisi kurar; kurulum bitince dosyaya **bir kez daha** çift tıkla.
   - İlk açılışta gerekli paketleri indirir (bir dakika sürebilir).
   - Tarayıcıda **<http://localhost:3000>** kendiliğinden açılır.
3. Açılan siyah pencere uygulamanın kendisidir: kullandığın sürece **kapatma**. Kapatınca uygulama durur; tekrar açmak için yine `Baslat`'a çift tıkla.

Windows "bilinmeyen yayımcı" uyarısı gösterirse **Ek bilgi → Yine de çalıştır** de.

## Güncellemeler (ZIP indirmeye gerek yok)

Uygulama her açıldığında GitHub'daki son sürümü kontrol eder ve varsa **kendini günceller**. Verilerin (markalar, dosyalar, fikirler, sohbetler) ve API anahtarın güncellemede korunur; internet yoksa mevcut sürümle açılır.

- Güncellemeden hemen önce verilerin yedeği alınır.
- Yeni sürüm açılamazsa uygulama **kendiliğinden önceki sürüme döner** ve o sürümü bir daha kurmaz (GitHub'da daha yeni bir sürüm çıkınca yine güncellenir).
- Yeni sürümü beğenmezsen: Ayarlar → Güncelleme → **Önceki sürüme dön**.

- **Açıkken güncellemek için:** Ayarlar → **Güncelleme** → *Güncellemeleri kontrol et* → *Güncelle ve yeniden başlat*.
- **Depo özelse** (GitHub'da kilit simgesi): uygulamanın GitHub'a girebilmesi için ya depoyu herkese açık yap (Settings → Danger Zone → Change visibility; depoda sır yok) ya da Ayarlar → Güncelleme altında bir **GitHub erişim anahtarı** ekle (Fine-grained token, yalnızca bu depo, "Contents: Read-only").

İlk açılışta:
1. Nasıl çalıştığını görmek için **☕ Örnek markayla keşfet**'e bas (kurgusal bir kafe: kimliği, renkleri, logosu, maskot pozları ve fikirleri hazır; ana ekranda adım adım rehber çıkar) ya da doğrudan kendi markanı oluştur.
2. **Yapay zekâ → Sağlayıcılar ve modeller** → Claude, OpenAI, OpenRouter ya da Gemini anahtarını ekle. Anahtar yalnızca bu bilgisayarda saklanır. Hangi modelin daha iyi yazdığını **Karşılaştır** sekmesinde kendi markanla dene.
3. Ana ekrana dön ve asistana yaz: *"Bu marka için haftaya 5 içerik fikri üret."*

### Terminalden (isteğe bağlı)

Node.js 22.13 veya üstü kuruluysa klasörde `npm install`, ardından `npm run launch` (güncellemeli) ya da `npm start` (güncellemesiz, geliştirme için).

## Veriler

Markalar, yüklenen dosyalar, fikirler ve sohbetler `data/` klasöründe durur (`app.db` ve `uploads/`). Bu klasör GitHub'a gönderilmez.

**Yedekler (Ayarlar → Yedekler):**
- Uygulama her gün kendiliğinden yedek alır; son 14 gün saklanır. Yedekler `data/backups/` içinde `.zip` dosyalarıdır.
- **Şimdi yedek al**, **İndir**, **Geri yükle**: geri yüklemeden önce mevcut hâlin de yedeği alınır, yani geri yükleme de geri alınabilir.
- **Yedek dosyasından geri yükle**: başka bir bilgisayardan ya da Drive'dan indirdiğin yedeği yükler (verileri yeni bilgisayara taşımak için de kullanılır).
- API anahtarları ve erişim anahtarları yedeğe **girmez**; geri yüklemede mevcut anahtarların değişmez.
- **Google Drive:** Drive masaüstü uygulaması kuruluysa Drive içindeki bir klasörün yolunu yazınca her yedeğin bir kopyası oraya da gider.

## Geliştirme

```
npm test
```

API testleri (marka kimliği, veri izolasyonu, güvenli yükleme, AI anahtarı güvenliği, asistan, yedekleme, güncelleme ve geri alma) her zaman çalışır. Arayüz testleri bilgisayarda Playwright kuruluysa çalışır, yoksa atlanır.

GitHub'da her değişiklik Linux (arayüz testleri dahil) ve Windows'ta otomatik test edilir (`.github/workflows/test.yml`); testleri geçmeyen değişiklik `main`'e alınmaz.

Bu proje `zeyerdm/icerikuretici` (DevOrtak) projesinden bağımsızdır; onun dosyalarına, verilerine veya ayarlarına dokunmaz.
