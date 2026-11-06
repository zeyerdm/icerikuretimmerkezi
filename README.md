# İçerik Üretim Merkezi

Markadan bağımsız, AI destekli içerik üretim asistanı. Her marka için dijital kimlik bir kez tanımlanır; içerik fikirlerinden prompt üretimine, Reels senaryosundan post tasarımına kadar bütün süreç aynı marka hafızası üzerinden yürür.

## Nasıl çalışır?

**Önce üreticinin yönetim merkezi, ardından markaların bağımsız çalışma alanları.**

Uygulama açılınca **Yönetim Merkezi** gelir. Burası bütün kullanıcılarda aynı tasarım ve sabit renklerle çalışan genel alandır:

- **Genel bakış:** marka sayısı, üretilen içerik, Reels, tamamlanan tasarımlar, bekleyen içerikler, bu haftanın üretim özeti ve grafiği, son işlemler. Hepsi gerçek kayıtlardan.
- **İçerik takvimi:** aylık ve haftalık görünüm; boş bir güne tıklayıp içerik planla (marka, tür, saat, durum). İçerikler markanın renginde görünür; marka filtresi var.
- **Markalar:** logo, kısa açıklama, kategori, renkler, son çalışma tarihi ve içerik üretim durumu. Karta tıklayınca markanın çalışma alanı açılır.
- **Görevler:** hızlı ekleme, son tarih, öncelik, ilgili marka, durum; gecikmiş / bugün / bu hafta grupları, tamamlananlar.
- **Notlar:** hızlı not, kategori, markaya bağlama, sabitleme, arama.
- **Analizler:** haftalık ve aylık üretim, marka ve içerik türü dağılımı, tamamlanan/bekleyen, tamamlanma ve zamanında bitirme oranları.

Bir markaya girildiğinde **marka çalışma alanı** açılır ve arayüz markanın kendi renklerini, logosunu ve maskotunu alır (bu tema yalnızca o markanın alanında geçerlidir):

- **Marka ana sayfası:** markanın hafızasıyla çalışan AI asistanı, hızlı işlemler, kimlik durumu, fikir grafiği.
- **Dijital kimlik:** profil, renkler, fontlar, canlı post önizlemesi.
- **İçerik fikirleri:** kategorili fikir havuzu, favoriler, tek tıkla takvime ekleme.
- **Kütüphane:** logo, maskot pozları, sticker, görseller (her marka yalnızca kendi dosyalarını görür).
- **Takvim, Arşiv, Analizler:** yalnızca bu markanın içerikleri.
- **Reels fikirleri, Prompt Studio, Post stüdyosu:** sıradaki aşamalarda geliyor (menüde "Yakında" olarak görünür, bitmiş gibi gösterilmez).

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

- **Açıkken güncellemek için:** Ayarlar → **Güncelleme** → *Güncellemeleri kontrol et* → *Güncelle ve yeniden başlat*.
- **Depo özelse** (GitHub'da kilit simgesi): uygulamanın GitHub'a girebilmesi için ya depoyu herkese açık yap (Settings → Danger Zone → Change visibility; depoda sır yok) ya da Ayarlar → Güncelleme altında bir **GitHub erişim anahtarı** ekle (Fine-grained token, yalnızca bu depo, "Contents: Read-only").

İlk açılışta:
1. Nasıl çalıştığını görmek için **☕ Örnek markayla keşfet**'e bas (kurgusal bir kafe: kimliği, renkleri, logosu, maskot pozları ve fikirleri hazır; ana ekranda adım adım rehber çıkar) ya da doğrudan kendi markanı oluştur.
2. **Ayarlar** → Gemini API anahtarını ekle (<https://aistudio.google.com/apikey>). Anahtar yalnızca bu bilgisayarda saklanır.
3. Ana ekrana dön ve asistana yaz: *"Bu marka için haftaya 5 içerik fikri üret."*

### Terminalden (isteğe bağlı)

Node.js 22.13 veya üstü kuruluysa klasörde `npm install`, ardından `npm run launch` (güncellemeli) ya da `npm start` (güncellemesiz, geliştirme için).

## Veriler

Markalar, yüklenen dosyalar, fikirler ve sohbetler `data/` klasöründe durur (`app.db` ve `uploads/`). Yedek almak için bu klasörü kopyalaman yeterli. Bu klasör GitHub'a gönderilmez.

## Geliştirme

```
npm test
```

API testleri (marka kimliği, veri izolasyonu, güvenli yükleme, AI anahtarı güvenliği, asistan) her zaman çalışır. Arayüz testleri bilgisayarda Playwright kuruluysa çalışır, yoksa atlanır.

Bu proje `zeyerdm/icerikuretici` (DevOrtak) projesinden bağımsızdır; onun dosyalarına, verilerine veya ayarlarına dokunmaz.
