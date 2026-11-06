# Aşama 1 — Kaynak Kod Analizi ve Mimari

Bu belge, `zeyerdm/icerikuretici` (DevOrtak içerik üreticisi) projesinin incelenmesini, genel amaçlı ve DevOrtak'a özel parçaların ayrımını ve yeni ürünün mimarisini anlatır. **Kaynak projeye hiçbir değişiklik yapılmamıştır**; iki proje arasında ortak klasör, senkronizasyon veya bağımlılık yoktur.

## 1. Kaynak projenin teknolojisi

| Konu | Kaynak proje |
|---|---|
| Yapı | Tek dosya: `index.html` (~8.100 satır HTML + CSS + JavaScript), çatısız (vanilla JS) |
| Barındırma | GitHub Pages (statik; sunucu yok) |
| Veri | Tarayıcının `localStorage`'ı, marka başına anahtarlar (`reels_<tür>_<markaId>`) |
| AI | Gemini, doğrudan tarayıcıdan; **API anahtarı tarayıcıda** saklanıyor |
| Görsel üretim | Gemini görsel modelleri, tarayıcıdan |
| Dışa aktarma | Canvas ile PNG, Google Drive'a Apps Script aktarımı |
| Test | Headless Chrome'da çalışan sonda (probe) sayfaları |

## 2. Bileşen ayrımı

### Genel amaçlı (yeni ürüne yeniden yazılarak aktarılıyor / aktarılacak)

| Kaynak bileşen | Yeni üründe karşılığı | Aşama |
|---|---|---|
| Gemini istemcisi (model sırası, hata açıklamaları, düşünme parçalarını ayıklama, JSON yanıt) | `server/services/ai/gemini.js` — artık **sunucuda**, anahtar istemciye hiç gitmez | 2 ✅ |
| Çoklu marka merkezi ve marka bazlı veri ayrımı | `brands` tablosu + her sorguda marka/sahip kontrolü | 3 ✅ |
| Marka formu (ad, açıklama, renkler), çoklu maskot pozu yükleme | Marka profili + görsel kimlik + varlık kütüphanesi | 3 ✅ |
| Kategorili fikir havuzu, beğen/favori | `ideas` tablosu ve API; tam ekranı Aşama 4'te | 3 (altyapı) / 4 |
| "Beğenilenleri örnek al, öncekileri tekrar etme" bağlam kurgusu | Marka hafızası (`brands.memory`) | 3 ✅ |
| Reels fikir havuzu, sahne sahne senaryo, kalite kontrolü, iki dilli prompt, Türkçeden düzeltip çevirme | Reels modülü ve Prompt Studio | 4 |
| Prompt üzerinde bölüm bazlı yeniden üretme (tek sahne yeniden yaz) | Prompt geliştirme mekanizması + sürüm geçmişi | 4 |
| Slayt/post editörü: sürükleme, katmanlar, renk/yazı ayarları, canvas'tan PNG | Post Tasarım Stüdyosu | 5 |
| Başlık stilleri ve şeffaf başlık PNG'si | Tasarım stüdyosu metin stilleri | 5 |
| Toast bildirimleri, boş durumlar, sayaçlı bekleme göstergesi | `public/js/ui.js` ve sayfa durumları | 3 ✅ |

### DevOrtak'a özel (aktarılmadı, aktarılmayacak)

- DevOrtak markası, Deo karakter kitabı ve kişilik metinleri
- Kaynak projedeki 150 hazır Reels fikri ve DevOrtak kategorileri
- Gömülü DevOrtak logosu ve maskot görselleri (`assets/`)
- DevOrtak'a göre yazılmış prompt talimatları, örnek senaryolar
- Kişisel yapılandırmalar: API anahtarı, Drive bağlantı adresi, tarayıcı verileri

Kaynak kod satır satır kopyalanmadı: tek dosyalık yapı, tarayıcıda anahtar tutma ve marka verisine gömülü varsayılanlar yeni ürünün güvenlik ve izolasyon hedefleriyle çeliştiği için, işe yarayan **mantık** (ör. model sırası, hata açıklamaları, marka bazlı ayrım, "tekrar etme / örnek al" bağlamı) modüler olarak yeniden yazıldı.

## 3. Yeni ürünün mimarisi

```
Tarayıcı (public/)                     Yerel sunucu (server/)                 Bu bilgisayar (data/)
─────────────────────                  ──────────────────────                 ─────────────────────
index.html                             app.js      güvenlik + API rotaları    app.db      SQLite
js/app.js     yönlendirme, durum  ──►  services/brands.js    kimlik, hafıza    uploads/<markaId>/
js/api.js     tek API istemcisi        services/assets.js    güvenli yükleme
js/views/*    sayfalar                 services/ideas.js     fikir havuzu
css/app.css   tasarım sistemi          services/assistant.js asistan + işlemler
                                       services/ai/*         AI sağlayıcı katmanı ──► Gemini
```

- **Teknoloji:** Node.js (22.13+) + Express; veritabanı Node'un yerleşik SQLite'ı (derleme gerektiren paket yok); arayüz kaynak projedeki gibi çatısız JavaScript (derleme adımı yok, ES modülleri).
- **Gereksiz teknoloji değişimi yok:** Arayüz yine vanilla JS. Eklenen tek şey, anahtar güvenliği, veritabanı ve dosya yükleme için zorunlu olan sunucu.
- **Veri izolasyonu:** Her marka bir sahibe bağlı; her alt kayıt (`assets`, `ideas`, `chat_messages`, `activity`) `brand_id` taşır ve `ON DELETE CASCADE` ile markayla silinir. Bütün sorgular `brand_id` ile süzülür; başka markanın kaydına erişim 404 döner. AI'a giden marka hafızası yalnızca o markanın verisinden kurulur (testlerle doğrulanır).
- **AI anahtarı:** Ayarlar ekranından sunucuya yazılır, `data/app.db` içinde durur; API yalnızca "bağlı mı" ve son 4 karakteri döndürür. İstersen `GEMINI_API_KEY` ortam değişkeniyle de verilebilir.
- **Güvenli yükleme:** Dosya türü uzantıdan değil ilk baytlardan anlaşılır (PNG/JPEG/WEBP/GIF; SVG kabul edilmez), 10 MB sınırı, rastgele dosya adı, marka klasörü, `nosniff` başlığı.
- **Yerel sunucu güvenliği:** Sunucu yalnızca `127.0.0.1`'e bağlanır; `Host` başlığı kontrolü (DNS rebinding'e karşı), başka sitelerden gelen veri değiştiren isteklerin reddi (CSRF'ye karşı), sıkı Content-Security-Policy.
- **Yetkilendirme:** Yerel kullanımda tek sahip vardır ve markalar ona bağlıdır. İnternete taşındığında oturum açma eklenip aynı sahip kontrolü kullanılır.
- **Genişletilebilirlik:** Yeni AI sağlayıcısı `services/ai/` altına eklenir; yeni modüller kendi servis dosyası, tablosu ve rotasıyla gelir.

## 4. Asistan nasıl çalışıyor?

1. Kullanıcı mesajı, seçili markanın hafızası (profil, görsel kimlik, varlık özeti, önceki ve favori fikirler) ve son konuşma ile birlikte modele gönderilir.
2. Model `{ reply, actions }` biçiminde yanıt verir.
3. Sunucu yalnızca tanıdığı işlemleri doğrulayıp **gerçekten** uygular (şu an `save_ideas`: fikirleri markanın havuzuna kaydeder). Bilinmeyen işlemler uygulanmaz.
4. Henüz olmayan bir modül istenirse asistanın bunu açıkça söylemesi istenir; yapmadığı işi yapmış gibi göstermez.
5. AI bağlı değilse veya hata verirse sohbete hiçbir şey yazılmaz, anlaşılır bir hata gösterilir.

## 5. Yol haritası

| Aşama | Kapsam | Durum |
|---|---|---|
| 1 | Kaynak kod analizi | ✅ Bu belge |
| 2 | Bağımsız proje kurulumu, sunucu, veritabanı, testler | ✅ |
| 3 | Ana ekran, AI asistanı, gezinme, marka yönetimi, dijital kimlik, varlık kütüphanesi | ✅ |
| 4 | İçerik fikir havuzu ekranı, Reels fikir havuzu ve senaryo, Prompt Studio, prompt geliştirme + sürümler, içerik arşivi | Sırada |
| 5 | Post Tasarım Stüdyosu: katmanlar, metin/renk/font, logo/maskot/sticker, şablonlar | |
| 6 | Görsel üretim API'si, tasarım referansı analizi (renk paleti, font, yerleşim), modüller arası akış | |
| 7 | Kapsamlı test, performans, iyileştirme | Her aşamada sürüyor |
