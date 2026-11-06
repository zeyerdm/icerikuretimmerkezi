# İçerik Üretim Merkezi

Markadan bağımsız, AI destekli içerik üretim asistanı. Her marka için dijital kimlik bir kez tanımlanır; içerik fikirlerinden prompt üretimine, Reels senaryosundan post tasarımına kadar bütün süreç aynı marka hafızası üzerinden yürür.

## Şu an neler var?

- **AI asistanı (ana ekran):** Seçili markanın kimliğini bilerek konuşur, içerik fikri üretir ve ürettiklerini markanın fikir havuzuna **gerçekten kaydeder**. Sohbet markaya göre saklanır; kaldığın yerden devam edersin.
- **Hızlı işlemler:** 5 içerik fikri, eğlenceli fikirler, haftalık plan, marka dili özeti.
- **Marka dijital kimliği:** Profil (sektör, hedef kitle, karakter, iletişim dili, hedefler, rakipler, slogan), görsel kimlik (ana/ikincil/arka plan renkleri, başlık ve gövde yazı renkleri, fontlar) ve canlı post önizlemesi.
- **Varlık kütüphanesi:** Logo, maskot pozları, marka görselleri, ürün fotoğrafları, sticker, illüstrasyon, arka plan, tasarım referansları. Her marka yalnızca kendi dosyalarını görür.
- **Son fikirler ve son çalışmalar**, favoriler, marka kimliği tamamlanma durumu.
- **Güvenlik:** AI anahtarı yalnızca sunucuda; dosyalar içerikten doğrulanır; sunucu yalnızca bu bilgisayardan erişilebilir.

Sıradaki aşamalar ve mimari: [docs/ANALIZ.md](docs/ANALIZ.md)

## Açmak (çift tıkla)

1. GitHub'da **Code → Download ZIP** ile indir ve ZIP'i bir klasöre çıkar.
2. Klasördeki **`Baslat.bat`** dosyasına çift tıkla (Mac: `Baslat.command`, ilk seferde sağ tık → Aç).
   - Node.js yoksa kendisi kurar; kurulum bitince dosyaya **bir kez daha** çift tıkla.
   - İlk açılışta gerekli paketleri indirir (bir dakika sürebilir).
   - Tarayıcıda **<http://localhost:3000>** kendiliğinden açılır.
3. Açılan siyah pencere uygulamanın kendisidir: uygulamayı kullandığın sürece **kapatma**. Kapatınca uygulama durur; tekrar açmak için yine `Baslat`'a çift tıkla.

Windows "bilinmeyen yayımcı" uyarısı gösterirse **Ek bilgi → Yine de çalıştır** de.

İlk açılışta:
1. Nasıl çalıştığını görmek için **☕ Örnek markayla keşfet**'e bas (kurgusal bir kafe: kimliği, renkleri, logosu, maskot pozları ve fikirleri hazır; ana ekranda adım adım rehber çıkar) ya da doğrudan kendi markanı oluştur.
2. **Ayarlar** → Gemini API anahtarını ekle (<https://aistudio.google.com/apikey>). Anahtar yalnızca bu bilgisayarda saklanır.
3. Ana ekrana dön ve asistana yaz: *"Bu marka için haftaya 5 içerik fikri üret."*

### Terminalden (isteğe bağlı)

Node.js 22.13 veya üstü kuruluysa klasörde `npm install`, ardından `npm start`.

## Veriler

Markalar, yüklenen dosyalar, fikirler ve sohbetler `data/` klasöründe durur (`app.db` ve `uploads/`). Yedek almak için bu klasörü kopyalaman yeterli. Bu klasör GitHub'a gönderilmez.

## Geliştirme

```
npm test
```

API testleri (marka kimliği, veri izolasyonu, güvenli yükleme, AI anahtarı güvenliği, asistan) her zaman çalışır. Arayüz testleri bilgisayarda Playwright kuruluysa çalışır, yoksa atlanır.

Bu proje `zeyerdm/icerikuretici` (DevOrtak) projesinden bağımsızdır; onun dosyalarına, verilerine veya ayarlarına dokunmaz.
