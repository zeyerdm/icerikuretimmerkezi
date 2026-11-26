# Aşama raporu 2: onay paketi ve kalan liste (25–26 Kasım 2026)

Kural: [../PROJE_TALIMATI.md](../PROJE_TALIMATI.md) · Liste: [../YAPILACAKLAR.md](../YAPILACAKLAR.md) · Önceki: [ASAMA_01.md](ASAMA_01.md)

Her madde ayrı PR ile, Linux ve Windows CI'de geçtikten sonra `main`'e alındı. Bütün şema değişiklikleri yalnız
**ekleme** yapar (yeni tablo / sütun); veri silinmez, eski kod çalışmaya devam eder.

## 1. Yapılanlar

| Madde | PR | Özet |
|---|---|---|
| O1 üç katmanlı hafıza (göç 50) | #146 | Sabit / öğrenilen / dönemsel katman, onay durumu, geçerlilik, güven, değişiklik geçmişi. Siteden ve yapay zekâdan gelen bilgi onaylanmadan üretime girmez |
| O3 hedefler ve sütunlar (göç 51) | #147 | Aylık ölçülebilir hedefler, içerik sütunları (hedef pay), içeriğe sütun/amaç/kitle/kanal, takvim süzgeçleri, raporda hedef gerçekleşmesi |
| O2 içerik projesi (göç 52) | #148 | Takvim içeriği = proje: zaman çizelgesi, yayın bağlantısı, içerik bazında yapay zekâ çağrı/maliyet, revizyon, süre |
| Eski Reels salt okunur arşiv | #148 | Yeniden yazma kaldırıldı; seslendirme, video, dışa aktarma, sürüme dönme çalışır |
| Telefondan erişim şimdilik kapalı | #148 | `REMOTE_ACCESS=1` ile geri açılır; kod ve kayıtlı ayarlar duruyor |
| O4.5 tek düzenleme sayfası | #149 | Profil + Görsel kimlik tek sayfada; marka dosyası kartları oraya bağlanır; logo yükleme eklendi |
| O4.6 eksik bilgi bildirimi | #149 | "Marka kimliği kurulmadı" / "N eksik bilgi"; ilk eksik adıma götürür |
| Şema onarımı (acil) | #150 | Sürüm numarası ilerde ama tablo/sütun eksik veritabanı açılışta onarılır |
| Context Builder | #150 | `brands.memory(id, { task })`: tam, hafif, metin, tasarım, denetim, görsel; metin −%46, görsel −%36 |
| Kuyruk maliyeti | #150 | Toplu üretim işinin kullanımı oluşan post / prompt'a bağlanır |
| Ücretli işlem onayı | bu PR | İşlem başına sınır (varsayılan $0,10); metin, görsel, video, toplu üretim; 409 `COST_CONFIRM` → onay → tekrar |
| Çalışma modları | bu PR | Proaktif / komutla; asistana "öneriler" yazınca yapay zekâsız liste |
| Tür düşüşü ve haftalık öneri | bu PR | `tur_dustu`, `hafta_plani` uyarıları (yapay zekâsız) |
| Operasyon maliyeti | bu PR | Analizler: marka başına süre, revizyon, yapay zekâ tutarı (gerçek / tahmini) |
| Telefon taşması, Playwright belgesi | bu PR | Aylık rapor araç çubuğu sarılır; README'de kurulum adımı |

## 2. Davranış değişiklikleri (kullanıcının bilmesi gerekenler)
- Siteden / yapay zekâdan gelen bilgi kartları **onay bekler** (Ses ve hafıza → Onay bekleyenler).
- Tahmini tutarı **$0,10'u aşan** tek işlem önce sorulur (Yapay zekâ → Harcama'dan değişir, 0 = sorma). Ücretsiz
  Gemini kullanımı etkilenmez (fiyat bilinmiyorsa ya da düşükse sorulmaz).
- Ayrı Profil / Görsel kimlik sekmeleri yok; Marka dosyasındaki **Düzenle** tek sayfayı açar.
- Eski Reels senaryoları açılır ama yeniden yazılmaz (yeni Reels: Prompt Studio).
- Telefondan erişim kapalı.

## 3. Riskler
- **Maliyet tahmini** yaklaşık: metin işi istem uzunluğu ve ortalama 2.500 çıktı tokenıyla hesaplanır. Gerçek tutar
  harcama ekranında; OpenRouter gerçek tutarı bildirir.
- **Şema onarımı** göçlerdeki veri dönüşümlerini (UPDATE) tekrar etmez, yalnız eksik yapıyı ekler. Onarılan
  veritabanında `contents.pillar_id` dış anahtar kısıtı taşımaz; sütun silinince içerikler kodla boşaltılır.
- **Context Builder:** bir iş beklenen bilgiyi göremezse ilgili profil genişletilir (`server/services/brands.js` →
  `PROFILE`). Post tasarımındaki maskot pozu eksikliği tam testte yakalanıp düzeltildi.

## 4. Geri alma
- Her madde ayrı PR: GitHub'da ilgili PR'ın **Revert** düğmesi ya da `git revert <commit>`.
- Göçler (50–52) geri alınmaz; yeni tablo ve sütunlar boş kalsa da eski kod çalışır.
- Ücretli işlem onayını kapatmak: Yapay zekâ → Harcama → işlem başına onay sınırı **0**.
- Telefondan erişimi açmak: `REMOTE_ACCESS=1` ortam değişkeniyle başlat.
- Çalışma modu: Ayarlar → Hatırlatmalar → Proaktif.

## 5. Açık kalanlar
- Ürün kararları (bkz. YAPILACAKLAR → Bekleyen kararlar): hazır görsel şablonlarının yeri, yapay zekâ platformu, lisans.
- Antigravity'de yapılan yerel değişiklikler GitHub'a gönderilince bu dallarla birleştirilecek (göç numaraları
  çakışıyorsa yeni numaraya taşınır).
- 08 Gelecek modüller ayrı değerlendirilecek.
