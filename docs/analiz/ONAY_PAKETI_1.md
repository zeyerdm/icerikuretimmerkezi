# Onay paketi 1 (25 Kasım 2026)

Bu belgedeki maddeler veritabanı şemasını değiştirir ya da ürün kararıdır; onay gelmeden uygulanmaz
([../PROJE_TALIMATI.md](../PROJE_TALIMATI.md)). Her madde ayrı onaylanabilir. Bütün şema değişiklikleri yalnız **ekleme**
yapar (yeni alan/tablo); mevcut veri silinmez, eski kod çalışmaya devam eder.

---

## O1 · Üç katmanlı marka hafızası (Aşama 03)

**Bugün:** `brand_facts` (kategori, başlık, içerik, `source` elle/asistan, tarihler; `server/db.js:313`). Öğrenilmiş
şeyler (beğenilen/beğenilmeyen, performans odağı, yasaklı ve tercih edilen ifadeler) ayrı yerlerde ve **doğrudan**
istemlere giriyor (`server/services/brands.js` → `memory()`).

**Öneri (göç 50):** `brand_facts` tablosuna alan ekle:
- `layer`: `sabit` | `ogrenilen` | `donemsel`
- `status`: `onayli` | `oneri` (onay bekliyor) | `arsiv`
- `valid_from`, `valid_to` (dönemsel bilgi ve kampanyalar için)
- `confidence`: `yuksek` | `orta` | `dusuk`
- `source` genişler: `manual`, `assistant`, `site`, `ai`, `performans`

Yeni tablo `brand_fact_history` (bilgi kartı, değişiklik zamanı, önce/sonra, kim/ne değiştirdi).

**Davranış:**
- Yapay zekâya yalnız `onayli` ve bugün geçerli kayıtlar gider. Asistanın, sitenin ya da performansın çıkardıkları
  `oneri` olarak gelir; kullanıcı onaylamadan kesin kural olmaz.
- Süresi dolan dönemsel bilgi kendiliğinden `arsiv`e geçer (silinmez) ve bildirim merkezinde görünür.
- Aynı başlıkta çelişen iki bilgi varsa ikisi de `oneri` kalır, kullanıcıya sorulur.
- Ses ve hafıza sekmesinde: katman sekmeleri, "Onay bekleyenler", arşiv ve geçmiş.

**Göç:** mevcut kartlar → `layer` = kampanya için `donemsel`, diğerleri `sabit`; `status` = `onayli`;
`confidence` = `yuksek`. Davranış değişmez.

**Risk:** düşük. Geri alma: yeni alanlar boş kalsa da eski kod çalışır.

---

## O2 · İçerik projesi ve üretim geçmişi (Aşama 06)

**Bugün:** takvim içeriği (`contents`) fikre, posta, prompt'a ve Reels'e bağlı (`idea_id`, `post_id`, `prompt_id`,
`reels_id`). Yapay zekâ harcaması (`ai_usage`) marka ve işe göre tutuluyor, içeriğe bağlı değil.

**Öneri:** ayrı bir proje tablosu açmak yerine **takvim içeriğinin kendisi proje** olsun (bilgi tek yerde kalır,
kural 6). Göç 51:
- `contents` → `published_url` (yayın bağlantısı)
- `ai_usage` → `content_id` (boş olabilir): içerik bazında model, token ve maliyet
- Yeni tablo `content_events`: içerik, tür (`fikir`, `prompt`, `senaryo`, `tasarim`, `medya`, `revizyon`, `onay`,
  `yayin`, `performans`), bağlı kayıt, not, zaman → içeriğin zaman çizelgesi

**Ekran:** içerik penceresinde "Geçmiş" sekmesi: ilk fikir → prompt ve sürümleri → senaryo → tasarım → düzenlemeler →
onaylar → yayın bağlantısı → performans; toplam yapay zekâ maliyeti ve süre.

**Soru:** "Takvim içeriği = proje" yaklaşımı uygun mu? Alternatif: ayrı `projects` tablosu (bir proje birden çok
içerik/platform taşıyabilir; daha esnek ama daha karmaşık).

---

## O3 · Ölçülebilir hedefler ve içerik sütunları (Aşama 06)

**Bugün:** hedefler serbest metin (`brands.goals`) ve aylık içerik sayısı (`monthly_goal`); içerik sütunu kavramı yalnız
fikir kategorileri ve kılavuzdaki "içerik başlıkları".

**Öneri (göç 52):**
- `brand_goals`: marka, tür (`erisim`, `takipci`, `satis`, `trafik`, `bilinirlik`, `etkilesim`), hedef değer, dönem (ay)
- `brand_pillars`: marka, ad, hedef pay (%), açıklama (ör. Eğitici %30, Ürün %20…)
- `contents` → `pillar_id`, `purpose` (amaç), `audience` (kitle), `platform` (kanal)

**Ekranlar:** Marka kimliğinde "Hedefler ve sütunlar"; takvimde platform/kitle/amaç/sütun filtreleri; aylık raporda
hedef gerçekleşmesi ve sütun dağılımı; tek tip üretimde uyarı.

---

## O4 · Ürün kararları

1. **Eski Reels bölümü:** salt okunur arşiv olarak kalsın (yeni Reels yalnız Prompt Studio'da, eski kayıtlar
   açılır ve seslendirme/video çalışır) — öneri. Alternatif: tamamen kaldırmak (veri yine silinmez).
2. **Konuşmadan otomatik altyazı:** yapılsın mı? (Ses girişi destekleyen model gerekir; Gemini uygun.)
3. **Yerel ağdan telefon erişimi (http):** gerekli mi? Şu an yalnız Cloudflare tüneli (https).
4. **Büyük dosyaların bölünmesi:** yalnız dokunulan yerde (öneri) mi, ayrı bir sprint mi?
5. **Profil / Görsel kimlik sekmeleri ve marka dosyası kartları:** tek düzenleyicide birleşsin mi?
6. **Kurulum sohbeti ve kurulum sihirbazı:** tek akış (sohbet) kalsın, sihirbaz yalnız "eksikleri tamamla" için mi?

---

## Onay verirken

Örnek cevap: "O1 evet, O2 evet (takvim içeriği = proje), O3 evet, O4: 1 arşiv, 2 hayır, 3 hayır, 4 dokunulan yerde,
5 evet, 6 evet". Cevabı bekleyen işlere geçmeden önce onay gerektirmeyen işlere (bildirim merkezi, Context Builder,
telefon görünümü) devam ediyorum.
