# Analiz raporları (A7: 11.1, 11.3, 11.4, 11.5)

Kasım 2026. Bu rapor kod incelemesine dayanır; kod değişikliği içermez. Her başlıkta önce bugünkü durum, sonra öneri ve karar bekleyen nokta var.

## 11.1 Hazır görsel şablonları

**Bugün:**
- server/services/imageTemplates.js'de 4 şablon var: Maskotlu sahne, Ürün çekimi, Kampanya görseli, YouTube kapağı görseli.
- Akış:
  1. İki kısa soru sorulur.
  2. Marka kemiği, prompt kimliği ve karakter kitabıyla bir prompt yazılır.
  3. Prompt, Prompt Studio'ya kaydedilir.
  4. O prompt'la görsel üretilir.
- Arayüz: Prompt Studio sayfasının en altında "Hazır görsel şablonları" kartı (public/js/views/imageGen.js, 10.2'de kütüphaneden buraya taşındı).
- Görsel üretim sağlayıcısı bağlı değilse görsel üretilmez. Prompt yine kaydedilir; sahte üretim yok.

**Sorun:**
- Adı Post stüdyosundaki "şablonlar" ile karışıyor. Bunlar tasarım şablonu değil, **prompt + görsel üretim kısayolu**.
- Sayfanın en altında kaldığı için az görünüyor.
- "Ürün çekimi" ve "Kampanya görseli", Prompt Studio'nun yukarıdaki tür seçimiyle (Ürün fotoğrafı, Reklam) aynı işi yapıyor.

**Öneri:**
- "Hazır görsel şablonları" adı **"Hızlı görsel"** olsun ve Prompt Studio'da yerinde kalsın. Prompt ürettiği için doğru yeri burası.
- Post stüdyosuna taşınmasın. Post stüdyosu düzenlenebilir tasarım üretir; bu kısayol ise tek parça AI görseli üretir.
- Kart sayfanın üstüne, "Yeni prompt" kartının yanına sekme olarak alınsın: **Yeni prompt | Hızlı görsel**.
- Ürettiği görsel, Post stüdyosunun Yüklemeler/Zemin panelinden zaten seçilebiliyor (kütüphaneye "AI görseli" olarak düşer). Bu bağlantı arayüzde bir cümleyle belirtilsin.
- YouTube kapağı görseli, YouTube kapağı sayfasından da açılabilsin (aynı servis).

**Karar bekleyen:** Yeniden adlandırma ve sekmeye alma onayı.

## 11.3 Elle prompt kaydetme ve tarifler

**Bugün:**
- **Elle prompt kaydet:** AI bağlı olmasa da kullanıcı kendi prompt'unu kaydeder. Prompt'un sürümleri, etiketleri ve görsel üretimi diğer prompt'larla aynı şekilde çalışır.
- **Tarifler** (server/services/recipes.js) kullanıcı düzeyinde saklanır ve başka markaya kopyalanır.
  - Üç türü var: prompt, Reels kalıbı, prompt kimliği.
  - Kopyalanan tarif hedef markada yeni bir kayıt oluşturur.
  - Logo ve görsel gibi dosyalar taşınmaz.
  - Maskot cevapları istenmedikçe kimlik tarifine girmez.
- **Kural şablonları ve şablon oluşturucu** (Prompt Studio üst düğmeleri) uzun, kurallı video/görsel prompt yapısı kurar.

**Sorun:**
- Prompt Studio başlığında 4 düğme yan yana: Şablon oluşturucu, Kural şablonları, Tariflerden ekle, Elle prompt kaydet.
- "Tarif", "kural şablonu" ve "şablon" kavramları kullanıcıya birbirine çok yakın görünüyor.

**Öneri:**
- Başlıkta yalnız **Şablon oluşturucu** ve **Elle prompt kaydet** kalsın.
- **Kural şablonları** ve **Tariflerden ekle** "Kütüphanem" adlı tek bir açılır menüde toplansın:
  - Kural şablonlarım
  - Tariflerim
  - Başka markadan kopyala
- Kısa açıklamalar:
  - **Tarif:** başka markaya taşınabilen hazır prompt.
  - **Kural şablonu:** bu markanın uzun prompt iskeleti.
- İşlev değişmez, yalnızca yerleşim sadeleşir. Veri modeli ve sunucu aynı kalır.

**Karar bekleyen:** Düğmelerin "Kütüphanem" menüsünde toplanması.

## 11.4 Reels ile Prompt Studio ayrımı

**Bugün:**
- **Reels modülü:** fikir havuzu, senaryo üretimi ve senaryo ayrıntısı. Senaryo ayrıntısında şunlar var:
  - Sahneler ve süreleri.
  - Flow/Veo için sahne sahne İngilizce ve Türkçe video prompt'u.
  - Başlık PNG'si, .srt altyazı, telepromter.
  - Seslendirme (Gemini TTS).
  - Metinden video (Veo, anahtar varsa).
  - Sürümler, kalıplar ve kalite kontrolü.
- **Prompt Studio** "Reels" türü yalnızca bir sohbet modeline Reels fikri ya da senaryosu yazdırmak için tek parça metin prompt'u üretir. Bu da Reels modülünün kendi yaptığı işin zayıf bir kopyası.
- **Prompt Studio** "Video" ve "Maskot animasyonu" türleri tek sahnelik (ya da 2-5 sahne devamlı) video prompt'u üretir. Senaryo, altyazı ya da seslendirme yok.

**Sorun:**
- Kullanıcı Reels istediğinde iki yere gidebiliyor ve sonuçlar farklı derinlikte çıkıyor.
- Prompt Studio'daki "Reels" türü, Reels modülündeki senaryo, altyazı ve seslendirme zincirine bağlanmıyor.

**Öneri:**
1. Prompt Studio'daki **"Reels" türü kaldırılsın.** Yerine tür listesinde "Reels → Reels stüdyosunda aç" bağlantısı olsun.
   - Eski Reels prompt'ları silinmez. Listede "Reels (eski)" etiketiyle kalır.
2. Prompt Studio **tek sahnelik ya da birkaç sahnelik video prompt'unda** (Video, Maskot animasyonu) kalsın. Bu, senaryosu olmayan hızlı klip içindir.
3. Reels senaryosundaki bir sahnenin video prompt'u "Prompt Studio'da geliştir" ile Prompt Studio'ya gönderilebilsin. Tersi de olsun: Prompt Studio'daki video prompt'u "Reels senaryosuna sahne olarak ekle" ile Reels'e geçsin.
4. Menü sırası değişmez. 10.10'da ertelenen "Reels + Video birleşmesi" bu adımdan sonra ele alınabilir.

**Karar bekleyen:** Prompt Studio'dan "Reels" türünün kaldırılması ve iki yönlü bağlantı.

## 11.5 Video ve altyazı: gerçek yetenekler

Ne çalışıyor, neye bağlı, ne yok. Hepsi koddan doğrulandı.

| Yetenek | Durum | Bağımlılık | Not |
|---|---|---|---|
| Klip kesme, sıralama, birleştirme | Çalışıyor | Yok (tarayıcıda) | public/js/views/video.js. Tuval + MediaRecorder; kayıt gerçek zamanlı sürer (1 dakikalık video yaklaşık 1 dakikada çıkar) |
| Orana kırpma (9:16, 1:1, 4:5, 16:9), genişlik 1080/720/540 | Çalışıyor | Yok | Ortadan kırpar; odak noktası seçilemez |
| Altyazı gömme | Çalışıyor | Yok | .srt dosyası, elle yazılan .srt ya da Reels senaryosundan otomatik .srt. Yazı boyu, dikey konum, koyu kutu ayarlanır |
| Çıktı biçimi | MP4 ya da WebM | Tarayıcıya bağlı | Chrome/Edge'in yeni sürümleri MP4 kaydedebilir; desteklemeyen tarayıcıda WebM çıkar |
| Reels senaryosundan .srt | Çalışıyor | Yok | Replik cümlelere bölünür, süre kelime sayısına göre paylaştırılır (server/services/reels/rules.js `buildSrt`) |
| Seslendirme (TTS) | Çalışıyor | Gemini anahtarı | Sahne sahne WAV ve tek iz (full.wav); video kaydına eklenebilir. Anahtar yoksa açık hata, sahte ses yok |
| Metinden video (Veo) | Çalışıyor | Video modeli erişimi olan anahtar | Uzun süren iş; 10 sn'de bir durum sorulur; bitince markanın klasörüne indirilir. Anahtar yoksa düğme görünmez |
| **Konuşmadan otomatik altyazı (ses → yazı)** | **Yok** | - | Yüklenen videodaki konuşma yazıya dökülmüyor. Altyazı yalnızca .srt ya da senaryodan geliyor |
| Kelime kelime vurgulu (karaoke) altyazı | Yok | - | Satır satır gösterilir |
| Müzik ekleme, ses seviyesi | Yok | - | Klip sesi ve seslendirme var; ayrı müzik izi yok |
| Geçiş efektleri, yazı animasyonu | Yok | - | Kesme düz geçer |
| Sunucuda hızlı dışa aktarma | Yok | - | FFmpeg yok; kayıt tarayıcıda gerçek zamanlı |

**Öneri (önem sırasıyla):**
1. **Konuşmadan otomatik altyazı.** En çok istenecek eksik bu.
   - Gemini ses girdisi kabul eden bir modelle yapılabilir. Mevcut AI katmanından geçer, ek anahtar gerekmez.
   - Çıktı .srt olur ve mevcut altyazı alanına düşer.
   - OpenRouter üzerinden ses girişi her modelde yok. Bu yüzden görev için ses destekli model seçilmeli; hangi modelin destekleyeceğine AI platform kararı sonrası birlikte bakılmalı.
2. Kelime vurgulu altyazı: tarayıcıda çizim zaten yapılıyor. Ek bağımlılık gerekmez, orta zorlukta.
3. Müzik izi: kayda ikinci ses kaynağı eklemek kolay. Telifsiz müzik kaynağı ayrıca seçilmeli.
4. Sunucuda FFmpeg ile hızlı dışa aktarma: kurulum ve sunucu yükü getirir. Şimdilik önermem.

**Karar bekleyen:** Otomatik altyazının (1) bir sonraki iş olarak alınması.
