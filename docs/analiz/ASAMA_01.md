# Aşama 01: Mevcut sistem analizi ve güvenli teknik borç düzeltmeleri (25 Kasım 2026)

İncelenen ana dal: `c9cafd5`. Kural: [../PROJE_TALIMATI.md](../PROJE_TALIMATI.md). Liste: [../YAPILACAKLAR.md](../YAPILACAKLAR.md).

## 1. Neler incelendi

- Testler: `tests/` (66 dosya), `tests/helpers.js`, `tests/start.test.js`, `tests/uzaktan-erisim.test.js`
- Sunucu: `server/app.js`, `server/index.js`, `server/db.js`, `server/services/{genQueue,assistant,brands,remote,posts,prompts}.js`,
  `server/services/ai/{index,catalog}.js`, `server/services/reels/`
- İstemci: `public/js/app.js` (menü), `public/js/views/posts.js`
- Belgeler: `docs/GELISTIRME_DURUMU.md`, `docs/ANALIZ_RAPORLARI.md`, ChatGPT analiz sohbeti

## 2. Tespitler

### 2.1 Testler
- Bu ortamda ve GitHub CI'de (Ubuntu + Windows, Node 22/24) tam takım geçiyor. ChatGPT'nin bildirdiği "3 başarısız,
  99 atlanan" sonuç onun kum havuzundan: Playwright yoktu (arayüz testleri atlandı), sunucu 8 sn'de açılmadı
  (`tests/start.test.js:34` bekleme süresi 8 sn), uzaktan erişim testinde açık kalan bağlantı ECONNRESET verdi.
- Arayüz testleri için Playwright gerekir: global kurulum ya da `npx playwright install chromium`.

### 2.2 Büyük dosyalar (bölünme adayları; şimdilik dokunulmadı)

| Dosya | Satır | Not |
|---|---|---|
| `public/js/views/posts.js` | 2271 | Editör, katmanlar, paneller, şablonlar ve kuyruk tek dosyada |
| `server/app.js` | ~1030 | Bütün API rotaları tek fonksiyonda |
| `server/services/posts.js` | ~950 | Yerleşim, istem, şablon, üretim |
| `server/services/prompts.js` | 935 | Prompt Studio + Reels planı |
| `server/db.js` | 737 | 49 göç tek dizide |

Öneri: yalnız o dosyada bir değişiklik gerektiğinde, ilgili parçayı ayrı modüle almak (ör. `server/routes/*.js` ile
rotaları alan alan taşımak; davranış değişmez, testler korur). Toplu yeniden yazım yok (kural 12).

### 2.3 İkili yapılar
- Reels: yeni senaryolar Prompt Studio'da (`server/services/prompts.js` plan/create). Eski `server/services/reels/`,
  `reels` tablosu, 22 rota (`server/app.js`) ve gizli menü öğeleri (`public/js/app.js:124`, `:127`) eski kayıtlar ve
  seslendirme/video için yaşıyor. → Karar bekliyor (aşağıda).

### 2.4 Güvenlik (uzaktan erişim)
- Yanlış şifre kilidi yalnız bellekteydi (`server/services/remote.js`). → **Düzeltildi:** ayarlar tablosunda kalıcı.
- IP başlığı (`cf-connecting-ip`) yoksa bütün denemeler tek anahtarda toplanıyordu; IP değiştirerek deneme sınırsızdı.
  → **Düzeltildi:** kaynak başına 5 yanlışta 15 dk kilit + bütün kaynaklardan toplam 20 yanlışta 15 dk genel kilit.
  Not: sunucu yalnız 127.0.0.1'de dinler; dışarıdan istek yalnız Cloudflare tünelinden gelir ve Cloudflare bu başlığı
  kendisi yazar, istemci taklit edemez.
- Çerez her zaman `Secure`: tünel https olduğu için doğru. Yerel ağdan (http) erişim desteklenmiyor; istenirse ayrı karar.

### 2.5 Performans ve maliyet
- Toplu üretim kuyruğu sıralıydı (`server/services/genQueue.js`). → **Düzeltildi:** kontrollü paralellik, aynı anda en
  çok 2 iş (ücretsiz kotalı sağlayıcıda dakikalık sınıra çarpmamak için düşük); iş alma atomik, aynı iş iki kez işlenmez.
- Asistan her mesajda tüm hafıza + 12 mesaj + 45 günlük özel günler + işlem şemasını gönderiyordu
  (`server/services/assistant.js`). → **Düzeltildi:** kodla çalışan bağlam seçici (`wantsProduction`): üretim/plan
  istemeyen mesajda hafif hafıza (kimlik, kurallar, bilgiler; son fikir ve performans listeleri ve özel günler yok);
  geçmiş 8 mesaj, her biri en çok 700 karakter. Ölçüm (örnek marka): sohbet mesajı 13.524 → 8.774 karakter (−%35),
  fikir isteği 13.497 → 9.917 (−%27).
- Model kataloğu elle tutuluyor (`server/services/ai/catalog.js`). → **İyileştirildi:** açılışta günde bir kez ücretsiz
  model listesi kontrolü (`dailyModelCheck`); hesapta bulunmayan model "erişilemez" işaretlenir ve yedek zincirinde
  denenmez (ana model yine denenir).

### 2.6 Bekleyen ürün kararları
1. Eski Reels bölümü (sayfalar, `services/reels`, `reels` tablosu): salt okunur arşiv olarak kalsın, yeni Reels yalnız
   Prompt Studio'da (öneri) mi, yoksa tamamen kaldırılsın mı? Veri silinmez; yalnız arayüz ve rotalar sadeleşir.
2. Konuşmadan otomatik altyazı (ANALIZ_RAPORLARI 11.5): yapılsın mı?
3. Yerel ağdan (aynı Wi-Fi, http) telefonla erişim: gerekli mi? (Gerekirse çerez ve adres denetimi ona göre)
4. Büyük dosyaların bölünmesi: yalnız dokunulan yerde mi (öneri), yoksa ayrı bir "yeniden yapılandırma" sprinti mi?

## 3. Yapılan değişiklikler (bu aşama)

| Dosya | Değişiklik |
|---|---|
| `docs/PROJE_TALIMATI.md`, `docs/YAPILACAKLAR.md`, `docs/analiz/ASAMA_01.md` | Yeni belgeler |
| `server/services/genQueue.js` | Kontrollü paralellik (2), atomik iş alma |
| `server/services/remote.js` | Kalıcı ve genel yanlış şifre kilidi |
| `server/services/assistant.js`, `server/services/brands.js` | Bağlam seçici, hafif hafıza (`memory(id, { light })`), kısa geçmiş |
| `server/services/ai/index.js`, `server/index.js`, `server/app.js` | Günlük model listesi kontrolü; kapanmış yedeklerin atlanması |
| `tests/start.test.js`, `tests/uzaktan-erisim.test.js` | Yavaş ortamda sağlamlık (30 sn bekleme, bağlantı başına istek) |
| `tests/akilli-sablon.test.js`, `tests/uzaktan-erisim.test.js`, `tests/ai.test.js`, `tests/api.test.js`, `tests/toplu-kalan.test.js` | Yeni/ güncellenen testler |

Şema değişikliği yok. Veri silinmez.

## 4. Riskler ve geri alma
- Kuyruk paralelliği: ücretsiz kotada iki eşzamanlı istek 429 alabilir; yedek zinciri ve yeniden deneme bunu karşılar.
  Gerekirse `createGenQueue({ concurrency: 1 })` ile eski davranışa dönülür.
- Bağlam seçici: üretim kelimesi geçmeyen bir istekte asistan son fikirleri görmez; "tekrar etme" listesi o mesajda
  gitmez. Geri alma: `assistant.js` içinde `light` her zaman `false`.
- Geri alma yolu: ilgili PR'ın geri alınması (`git revert`); şema değişmediği için veri etkilenmez.
